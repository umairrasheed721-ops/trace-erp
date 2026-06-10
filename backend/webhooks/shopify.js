const { db, DB_DIR } = require('../db');
const { markOrderAsCancelled } = require('../services/SyncService');
const tenantContext = require('../tenant-context');
const fs = require('fs');

function getAllTenants() {
  const tenants = ['default'];
  try {
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
    console.error('⚠️ Failed to scan tenants in Shopify Webhook:', e.message);
  }
  return tenants;
}

module.exports = async function handleShopifyWebhook(req, res) {
  const shopDomain = req.headers['x-shopify-shop-domain'];
  const topic = req.headers['x-shopify-topic'];
  const payload = req.body;

  if (!shopDomain || !payload || !payload.id) {
    return res.status(400).send('Invalid webhook data');
  }

  // Webhook Verification & Logging Requirement
  console.log(`📬 [Shopify Webhook] Received webhook. Topic: ${topic}, Shop: ${shopDomain}, Payload ID: ${payload.id}, Cancelled At: ${payload.cancelled_at || 'N/A'}`);

  try {
    // Scan all tenants to locate the store
    const tenants = getAllTenants();
    let matchedTenantId = null;
    let store = null;

    for (const tenantId of tenants) {
      tenantContext.run(tenantId, () => {
        try {
          const found = db.prepare('SELECT * FROM stores WHERE shop_domain = ?').get(shopDomain);
          if (found) {
            store = found;
            matchedTenantId = tenantId;
          }
        } catch (e) {
          // Ignore queries failing on uninitialized databases
        }
      });
      if (store) break;
    }

    if (!store) {
      console.log(`[Shopify Webhook] Store not found for shop domain: ${shopDomain}`);
      return res.status(404).send('Store not found');
    }

    // Process inside the matched tenant context
    await tenantContext.run(matchedTenantId, async () => {
      if (topic && topic.startsWith('products/')) {
        if (topic === 'products/delete') {
          db.prepare('DELETE FROM products WHERE store_id = ? AND shopify_product_id = ?').run(store.id, String(payload.id));
          console.log(`🗑️ [Shopify Webhook] Deleted product ${payload.id} from local cache.`);
        } else {
          const { syncShopifyProduct } = require('../engines/shopify');
          syncShopifyProduct(db, store.id, store.shop_domain, payload);
          console.log(`🔄 [Shopify Webhook] Synced product ${payload.id} to local cache.`);
        }
      } else if (topic === 'orders/cancelled' || payload.cancelled_at !== null) {
        // Immediate cancellation state invalidation
        console.log(`🛑 [Shopify Webhook] Immediate cancellation detected for Shopify Order ID: ${payload.id}`);
        markOrderAsCancelled(store.id, payload.id);
      } else {
        // Normal single order sync for other updates
        const { syncSingleShopifyOrder } = require('../engines/shopify');
        const success = await syncSingleShopifyOrder(store, payload.id);
        if (!success) {
          throw new Error(`Single order sync failed for order ${payload.id}`);
        }
      }
    });

    res.status(200).send('OK');

  } catch (err) {
    console.error('[ShopifyWebhook Error]:', err.stack || err.message);
    res.status(500).send('Internal Server Error');
  }
};
