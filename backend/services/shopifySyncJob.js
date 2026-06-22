const { db } = require('../db');
const tenantContext = require('../tenant-context');
const fs = require('fs');
const path = require('path');
const fetch = typeof globalThis.fetch === 'function' ? globalThis.fetch : require('node-fetch');

// Helper to get all tenants (matching scheduler.js)
function getAllTenants() {
  const tenants = ['default'];
  try {
    const { DB_DIR } = require('../db');
    const files = fs.readdirSync(DB_DIR);
    for (const file of files) {
      if (file.startsWith('trace_erp_') && file.endsWith('.db')) {
        const tenantId = file.substring(10, file.length - 3);
        if (tenantId && !tenants.includes(tenantId)) {
          tenants.push(tenantId);
        }
      }
    }
  } catch (e) {
    console.error('⚠️ Failed to scan tenants in ShopifySyncJob:', e.message);
  }
  return tenants;
}

// Function to update order tags in Shopify (returns Promise)
async function addShopifyTag(tenantId, orderId, erpStatus) {
  try {
    // Look up shopify_order_id, shop_domain, access_token for this order
    const orderInfo = db.prepare(`
      SELECT o.shopify_order_id, s.shop_domain, s.access_token, s.id as store_id
      FROM orders o
      JOIN stores s ON o.store_id = s.id
      WHERE o.id = ?
    `).get(orderId);

    if (!orderInfo) {
      throw new Error(`No orderInfo found for order ID: ${orderId}`);
    }

    const { shopify_order_id: shopifyOrderId, shop_domain: shopDomain, access_token: accessToken } = orderInfo;
    if (!accessToken || accessToken === 'PENDING') {
      throw new Error(`Invalid/missing access token for store`);
    }

    // 1. Fetch current tags from Shopify
    const getUrl = `https://${shopDomain}/admin/api/2024-10/orders/${shopifyOrderId}.json`;
    const getRes = await fetch(getUrl, {
      headers: {
        'X-Shopify-Access-Token': accessToken
      },
      timeout: 15000
    });

    if (!getRes.ok) {
      throw new Error(`Failed to GET order from Shopify: ${getRes.status} ${getRes.statusText}`);
    }

    const getData = await getRes.json();
    const existingTagsStr = getData.order?.tags || '';
    const existingTags = existingTagsStr ? existingTagsStr.split(',').map(t => t.trim()) : [];

    // 2. Clean trace tags and add the new one
    const cleanedTags = existingTags.filter(t => !t.startsWith('Trace:'));
    cleanedTags.push(erpStatus);
    const updatedTagsStr = cleanedTags.join(', ');

    // 3. Push the new tags back to Shopify
    const putUrl = `https://${shopDomain}/admin/api/2024-10/orders/${shopifyOrderId}.json`;
    const putRes = await fetch(putUrl, {
      method: 'PUT',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        order: {
          id: shopifyOrderId,
          tags: updatedTagsStr
        }
      }),
      timeout: 15000
    });

    if (!putRes.ok) {
      throw new Error(`Failed to PUT order tags to Shopify: ${putRes.status} ${putRes.statusText}`);
    }

    return updatedTagsStr;
  } catch (err) {
    throw err;
  }
}

async function runShopifySync() {
  const tenants = getAllTenants();
  for (const tenantId of tenants) {
    await tenantContext.run(tenantId, async () => {
      try {
        // Query pending records (erp_status is set, and shopify_synced is 0)
        const pending = db.prepare(`
          SELECT id, order_id, erp_status
          FROM whatsapp_polls
          WHERE erp_status IS NOT NULL
            AND shopify_synced = 0
          LIMIT 20
        `).all();

        if (pending.length === 0) return;

        for (const record of pending) {
          try {
            await addShopifyTag(tenantId, record.order_id, record.erp_status);
            
            // Mark as synced on success
            db.prepare(`
              UPDATE whatsapp_polls
              SET shopify_synced = 1
              WHERE id = ?
            `).run(record.id);
            
            console.log(`[Shopify_Sync] 🔄 Synced Order #${record.order_id} to tag "${record.erp_status}".`);
          } catch (err) {
            console.error(`[Shopify_Sync] ❌ Failed to sync Order #${record.order_id}: ${err.message}`);
            // Do not update shopify_synced so it retries
          }
        }
      } catch (err) {
        // Ignore table not found errors or context issues
      }
    });
  }
}

module.exports = function startShopifySyncJob() {
  console.log('🔄 background Shopify tag sync worker registered (15-min interval)');
  
  // Run once immediately on start (in background)
  setImmediate(runShopifySync);

  // Set interval to run every 15 minutes
  setInterval(runShopifySync, 15 * 60 * 1000);
};
