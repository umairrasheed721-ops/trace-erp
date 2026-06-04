const db = require('../db');
const { markOrderAsCancelled } = require('../services/SyncService');

module.exports = async function handleShopifyWebhook(req, res) {
  const shopDomain = req.headers['x-shopify-shop-domain'];
  const topic = req.headers['x-shopify-topic'];
  const payload = req.body;

  // Acknowledge receipt of webhook immediately to Shopify (status 200) to prevent retries
  res.status(200).send('OK');

  if (!shopDomain || !payload || !payload.id) return;

  // Webhook Verification & Logging Requirement
  console.log(`📬 [Shopify Webhook] Received webhook. Topic: ${topic}, Shop: ${shopDomain}, Payload ID: ${payload.id}, Cancelled At: ${payload.cancelled_at || 'N/A'}`);

  try {
    const store = db.prepare('SELECT * FROM stores WHERE shop_domain = ?').get(shopDomain);
    if (!store) {
      console.log(`[Shopify Webhook] Store not found for shop domain: ${shopDomain}`);
      return;
    }

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
      syncSingleShopifyOrder(store, payload.id).catch(err => {
        console.error(`[Shopify Webhook] Single order sync failed for order ${payload.id}:`, err.message);
      });
    }
  } catch (err) {
    console.error('[Shopify Webhook Handler] Error processing webhook:', err.message);
  }
};
