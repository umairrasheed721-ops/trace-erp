const fetch = require('../fetch');
const db = require('../../db');
const API_TIMEOUT = 15000;

const sleep = ms => new Promise(r => setTimeout(r, ms));

class ShopifyRateLimiter {
  constructor({ concurrency = 3, interval = 1000, maxRequests = 2 }) {
    this.concurrency = concurrency;
    this.interval = interval;
    this.maxRequests = maxRequests;
    this.queue = [];
    this.running = 0;
    this.requestTimestamps = [];
  }

  async add(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.next();
    });
  }

  async next() {
    if (this.running >= this.concurrency || this.queue.length === 0) return;

    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter(t => now - t < this.interval);

    if (this.requestTimestamps.length >= this.maxRequests) {
      const timeToWait = this.interval - (now - this.requestTimestamps[0]);
      setTimeout(() => this.next(), timeToWait);
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    this.running++;
    this.requestTimestamps.push(Date.now());

    try {
      const res = await task.fn();
      task.resolve(res);
    } catch (err) {
      task.reject(err);
    } finally {
      this.running--;
      this.next();
    }
  }
}

async function smokeTestShopify(shopDomain, accessToken) {
  try {
    const url = `https://${shopDomain}/admin/api/2024-10/shop.json`;
    const res = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': accessToken },
      timeout: 5000
    });
    return res.ok;
  } catch (err) {
    console.error(`💨 [SmokeTest] Failed for ${shopDomain}:`, err.message);
    return false;
  }
}

async function fetchWithRetry(url, options, retries = 3, backoff = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, { ...options, timeout: API_TIMEOUT });
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After') || backoff;
        await sleep(parseInt(retryAfter) * 1.5);
        continue;
      }
      if (response.ok) return response;
      if (response.status >= 500) {
         await sleep(backoff * Math.pow(2, i));
         continue;
      }
      return response;
    } catch (err) {
      if (i === retries - 1) throw err;
      await sleep(backoff * Math.pow(2, i));
    }
  }
}

async function getLiveShopifyCosts(shopDomain, accessToken, variantIds, onProgress) {
  const costMap = {};
  if (!variantIds || !variantIds.length) return costMap;

  const uniqueIds = [...new Set(variantIds.map(id => String(id)))];
  console.log(`[CostSync] Fetching ${uniqueIds.length} variants via GraphQL with unit costs`);

  const gqlChunkSize = 100;
  const chunks = [];
  for (let i = 0; i < uniqueIds.length; i += gqlChunkSize) {
    chunks.push(uniqueIds.slice(i, i + gqlChunkSize));
  }

  const limiter = new ShopifyRateLimiter({ concurrency: 3, interval: 1000, maxRequests: 2 });

  const fetchChunk = async (chunk, index) => {
    if (onProgress) onProgress(`Fetching variant costs chunk ${index + 1}/${chunks.length}...`);
    const gidList = chunk.map(id => `"gid://shopify/ProductVariant/${id}"`).join(',');
    
    const query = `
      query {
        nodes(ids: [${gidList}]) {
          ... on ProductVariant {
            id
            inventoryItem {
              unitCost {
                amount
              }
            }
          }
        }
      }
    `;

    let success = false;
    let attempts = 0;
    while (!success && attempts < 3) {
      try {
        const res = await fetch(`https://${shopDomain}/admin/api/2024-10/graphql.json`, {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json'
          },
          timeout: API_TIMEOUT,
          body: JSON.stringify({ query })
        });

        if (res.status === 429) {
          const retryAfter = res.headers.get('Retry-After');
          await sleep(retryAfter ? parseInt(retryAfter) * 1000 : 2000);
          attempts++;
          continue;
        }

        const result = await res.json();
        const nodes = result.data?.nodes || [];
        
        nodes.forEach(node => {
          if (node && node.id) {
            const vId = node.id.split('/').pop();
            const cost = node.inventoryItem?.unitCost?.amount ? parseFloat(node.inventoryItem.unitCost.amount) : 0;
            costMap[vId] = cost;
          }
        });
        success = true;
      } catch (e) {
        attempts++;
        await sleep(1000);
      }
    }
  };

  const tasks = chunks.map((chunk, index) => {
    return limiter.add(() => fetchChunk(chunk, index));
  });

  await Promise.all(tasks);

  uniqueIds.forEach(id => {
    if (costMap[id] === undefined) {
      costMap[id] = 0;
    }
  });

  return costMap;
}

async function fetchVariantImagesGraphQL(shopDomain, accessToken, variantIds) {
  if (!variantIds?.length) return {};
  const imageMap = {};
  const uniqueIds = [...new Set(variantIds.filter(Boolean).map(id => String(id)))];
  const gqlChunkSize = 50;

  for (let i = 0; i < uniqueIds.length; i += gqlChunkSize) {
    const chunk = uniqueIds.slice(i, i + gqlChunkSize);
    const gidList = chunk.map(id => `"gid://shopify/ProductVariant/${id}"`).join(',');
    
    const query = `
      query {
        nodes(ids: [${gidList}]) {
          ... on ProductVariant {
            id
            image { url }
            product {
              featuredImage { url }
            }
          }
        }
      }
    `;

    try {
      const res = await fetch(`https://${shopDomain}/admin/api/2024-10/graphql.json`, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        },
        timeout: API_TIMEOUT,
        body: JSON.stringify({ query })
      });

      const result = await res.json();
      const nodes = result.data?.nodes || [];
      nodes.forEach(node => {
        if (node && node.id) {
          const vId = node.id.split('/').pop();
          imageMap[vId] = node.image?.url || node.product?.featuredImage?.url || null;
        }
      });
    } catch (e) { console.error('GraphQL Image Sync Error:', e.message); }
  }
  return imageMap;
}

function syncShopifyProduct(dbInstance, storeId, shopDomain, p) {
  try {
    p.variants.forEach(v => {
      const image = p.images.find(img => img.id === v.image_id) || p.image || p.images[0] || {};
      const productUrl = `https://${shopDomain}/products/${p.handle}`;
      const imageUrl = image.src || '';

      dbInstance.prepare(`
        INSERT OR REPLACE INTO products (store_id, shopify_product_id, shopify_variant_id, sku, title, image_url, price, inventory_qty, product_url, status, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        storeId,
        String(p.id),
        String(v.id),
        v.sku || '',
        `${p.title} (${v.title})`,
        imageUrl,
        parseFloat(v.price || 0),
        v.inventory_quantity || 0,
        productUrl,
        p.status ? String(p.status).toLowerCase() : 'active'
      );

      try {
        dbInstance.prepare(`
          UPDATE product_master_costs
          SET variant_image_url = ?, updated_at = datetime('now')
          WHERE store_id = ? AND (
            shopify_variant_id = ? OR
            shopify_variant_id = ? OR
            (parent_title = ? AND variant_title = ?)
          )
        `).run(
          imageUrl || null,
          storeId,
          `gid://shopify/ProductVariant/${v.id}`,
          String(v.id),
          p.title,
          v.title === 'Default Title' ? '' : v.title
        );
      } catch (masterCostErr) {
        console.error(`[Shopify Webhook] Failed to update master costing image for variant ${v.id}:`, masterCostErr.message);
      }
    });
  } catch (err) {
    console.error('Error syncing Shopify product to local DB:', err.message);
  }
}

async function syncFullProductCatalog(store) {
  const { db: dbConn } = require('../../db');
  console.log(`🔄 Starting full Shopify catalog sync for store ${store.shop_domain}...`);
  try {
    const fetchFn = fetch;
    let url = `https://${store.shop_domain}/admin/api/2024-10/products.json?limit=250`;
    let page = 1;
    
    while (url) {
      console.log(`📡 Fetching products page ${page}...`);
      const res = await fetchFn(url, {
        headers: { 'X-Shopify-Access-Token': store.access_token }
      });
      
      if (!res.ok) {
        throw new Error(`Shopify API error: ${res.statusText}`);
      }
      
      const data = await res.json();
      const shopifyProducts = data.products || [];
      console.log(`📦 Received ${shopifyProducts.length} products on page ${page}`);
      
      shopifyProducts.forEach(p => {
        syncShopifyProduct(dbConn, store.id, store.shop_domain, p);
      });
      
      const linkHeader = res.headers.get('link');
      url = null;
      if (linkHeader) {
        const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        if (match) {
          url = match[1];
          page++;
        }
      }
    }
    console.log(`✅ Full Shopify catalog sync completed for store ${store.shop_domain}`);
    return true;
  } catch (err) {
    console.error(`❌ Full catalog sync failed:`, err.message);
    return false;
  }
}

module.exports = {
  ShopifyRateLimiter,
  smokeTestShopify,
  fetchWithRetry,
  getLiveShopifyCosts,
  fetchVariantImagesGraphQL,
  syncShopifyProduct,
  syncFullProductCatalog
};
