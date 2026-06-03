/**
 * syncImagesNightly.js – Nightly Batch Sync for Cost Registry Variant Images
 * Uses the Shopify GraphQL Admin API to paginated-fetch all variants with only
 * the minimum fields required (id, title, product.title, image.url).
 * Performs a highly efficient bulk diff-and-patch update of local SQLite rows
 * inside a single ACID transaction to maximize write performance.
 */

'use strict';

const fs = require('fs');
const path = require('path');

console.log('🌌 [Nightly Sync] Initiating nightly variant image sync process...');

// ─── Load Environment Variables ──────────────────────────────────────────────
try {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
  } else {
    require('dotenv').config();
  }
} catch (e) {}

// ─── Initialize DB ────────────────────────────────────────────────────────────
const { db } = require('../db');
if (!db) {
  console.error('❌ [Nightly Sync] Database connection failed to load from db.js');
  process.exit(1);
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// GraphQL Fetch Helper
async function shopifyGqlFetch(store, query, variables = {}) {
  const url = `https://${store.shop_domain}/admin/api/2024-10/graphql.json`;
  
  const headers = {
    'X-Shopify-Access-Token': store.access_token,
    'Content-Type': 'application/json'
  };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables })
  });

  if (response.status === 429) {
    console.warn('⚠️ [Nightly Sync] Shopify API Rate Limit (429) hit. Backing off for 2000ms...');
    await sleep(2000);
    return shopifyGqlFetch(store, query, variables);
  }

  if (!response.ok) {
    throw new Error(`Shopify API GQL returned status code ${response.status}: ${response.statusText}`);
  }

  const json = await response.json();
  if (json.errors) {
    throw new Error(`Shopify GraphQL Errors: ${JSON.stringify(json.errors)}`);
  }

  return json.data;
}

// Sync Images for a Single Store
async function syncStoreImages(store) {
  console.log(`\n🏪 [Nightly Sync] Starting image sync for store: ${store.shop_domain} (ID: ${store.id})...`);
  const startTime = Date.now();

  let allVariants = [];
  let hasNextPage = true;
  let cursor = null;
  let pagesFetched = 0;

  // Lightweight GQL Query - only requests the mapping fields to minimize rate limit cost
  const query = `
    query($cursor: String) {
      productVariants(first: 250, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            id
            title
            image {
              url
            }
            product {
              title
            }
          }
        }
      }
    }
  `;

  try {
    while (hasNextPage) {
      pagesFetched++;
      console.log(`   📡 [GQL] Fetching variants page ${pagesFetched} (cursor: ${cursor || 'start'})...`);
      
      const data = await shopifyGqlFetch(store, query, { cursor });
      const edges = data?.productVariants?.edges || [];
      
      edges.forEach(edge => {
        if (edge.node) allVariants.push(edge.node);
      });

      const pageInfo = data?.productVariants?.pageInfo;
      hasNextPage = pageInfo?.hasNextPage || false;
      cursor = pageInfo?.endCursor || null;

      if (hasNextPage) {
        await sleep(250); // Be respectful of shopify API rate limit bucket
      }
    }

    console.log(`   ✅ [Nightly Sync] Fetched all ${allVariants.length} variants across ${pagesFetched} pages.`);

    // Prep Database update statements
    const updateStmt = db.prepare(`
      UPDATE product_master_costs
      SET variant_image_url = ?, updated_at = datetime('now')
      WHERE store_id = ? AND (
        shopify_variant_id = ? OR
        shopify_variant_id = ? OR
        (parent_title = ? AND variant_title = ?)
      )
    `);

    let patchedCount = 0;

    // Execute updates inside an ACID Transaction to minimize write/lock overhead
    db.transaction(() => {
      allVariants.forEach(node => {
        const parentName = node.product?.title;
        const variantName = node.title === 'Default Title' ? '' : node.title;
        const variantId = node.id; // GID e.g. gid://shopify/ProductVariant/12345
        
        // Extract numeric variant ID from GID if exists
        let numericVariantId = null;
        if (variantId) {
          const match = variantId.match(/ProductVariant\/(\d+)/);
          if (match) numericVariantId = match[1];
        }

        const imageUrl = node.image?.url || null;

        if (parentName) {
          const result = updateStmt.run(
            imageUrl,
            store.id,
            variantId,
            numericVariantId,
            parentName,
            variantName
          );
          if (result.changes > 0) {
            patchedCount += result.changes;
          }
        }
      });
    })();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`   🎉 [Nightly Sync] Completed store image sync. Patched ${patchedCount} variants in ${duration}s.`);
    return { success: true, variants: allVariants.length, patched: patchedCount };

  } catch (err) {
    console.error(`   ❌ [Nightly Sync] Failed sync for store ${store.shop_domain}:`, err.message);
    return { success: false, error: err.message };
  }
}

// Main Execution
async function run() {
  const globalStart = Date.now();
  
  try {
    const stores = db.prepare("SELECT * FROM stores WHERE access_token IS NOT NULL AND access_token != ''").all();
    if (stores.length === 0) {
      console.log('⚠️ [Nightly Sync] No active Shopify stores found in local database.');
      process.exit(0);
    }

    console.log(`👥 [Nightly Sync] Found ${stores.length} active stores. Starting batch updates...`);

    let totalFetched = 0;
    let totalPatched = 0;

    for (const store of stores) {
      const result = await syncStoreImages(store);
      if (result.success) {
        totalFetched += result.variants;
        totalPatched += result.patched;
      }
    }

    const totalDuration = ((Date.now() - globalStart) / 1000).toFixed(2);
    console.log('\n📊 ──────────────────────────────────────────────────');
    console.log('📊  NIGHTLY IMAGE SYNC REPORT');
    console.log('📊 ──────────────────────────────────────────────────');
    console.log(`   Stores Synced    : ${stores.length}`);
    console.log(`   Total GQL Nodes  : ${totalFetched} variants`);
    console.log(`   Patched in DB    : ${totalPatched} rows`);
    console.log(`   Execution Time   : ${totalDuration} seconds`);
    console.log('📊 ──────────────────────────────────────────────────\n');

  } catch (err) {
    console.error('💥 [Nightly Sync] Critical failure in execution loop:', err.message);
    process.exit(1);
  }
}

run().then(() => {
  console.log('🏁 Nightly Sync script completed.');
  process.exit(0);
});
