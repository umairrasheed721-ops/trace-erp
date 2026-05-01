const express = require('express');
const router = express.Router();
const db = require('../db');

// POST /api/webhooks/postex
router.post('/postex', (req, res) => {
  // 1. Security Check
  const authHeader = req.headers.auth || req.query.token;
  if (authHeader !== 'tracepk') {
    console.warn('⚠️ Unauthorized PostEx Webhook Attempt (Token Mismatch)');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const payload = req.body;
  console.log('📬 [WEBHOOK] PostEx Update received:', JSON.stringify(payload));

  /**
   * PostEx typically sends:
   * {
   *   "trackingNumber": "12345",
   *   "transactionStatus": "Delivered",
   *   "statusDateTime": "2024-03-20 12:00:00",
   *   "remarks": "..."
   * }
   */

  const { trackingNumber, transactionStatus, statusDateTime } = payload;
  if (!trackingNumber || !transactionStatus) return res.status(400).json({ error: 'Invalid payload' });

  try {
    // Find order
    const order = db.prepare('SELECT id, store_id, shopify_order_id, delivery_status FROM orders WHERE tracking_number = ?').get(trackingNumber);
    if (!order) {
      console.log(`👻 Webhook order not found: ${trackingNumber}`);
      return res.json({ success: true, message: 'Order not in ERP' });
    }

    // Update status
    // Map PostEx status to ERP if necessary, though PostEx usually sends readable strings
    db.prepare('UPDATE orders SET delivery_status = ?, status_date = ? WHERE id = ?').run(
      transactionStatus,
      statusDateTime || new Date().toISOString(),
      order.id
    );

    // 🚀 PUSH TO SHOPIFY IN REAL-TIME
    if (['Delivered', 'Returned', 'Return Received', 'Cancelled'].includes(transactionStatus)) {
      const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(order.store_id);
      if (store) {
        const { fulfillShopifyOrder } = require('../engines/shopify');
        // If it's delivered, mark as paid too
        const isPaid = (transactionStatus === 'Delivered');
        fulfillShopifyOrder(store, order.shopify_order_id, trackingNumber, 'PostEx', isPaid)
          .then(() => console.log(`[Webhook] Shopify updated for ${trackingNumber}`))
          .catch(err => console.error(`[Webhook] Shopify update failed for ${trackingNumber}:`, err.message));
      }
    }

    console.log(`✅ Webhook update success: ${trackingNumber} -> ${transactionStatus}`);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Webhook error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/webhooks/shopify
router.post('/shopify', (req, res) => {
  // Shopify sends X-Shopify-Shop-Domain and X-Shopify-Topic headers
  const shopDomain = req.headers['x-shopify-shop-domain'];
  const topic = req.headers['x-shopify-topic'];
  const orderId = req.body?.id;

  // Immediate 200 OK so Shopify doesn't timeout
  res.status(200).send('OK');

  if (!shopDomain || !orderId) return;

  console.log(`⚡ [Shopify Webhook] Received ${topic} for Order ${orderId} from ${shopDomain}`);

  try {
    const store = db.prepare('SELECT * FROM stores WHERE shop_domain = ?').get(shopDomain);
    if (!store) {
      console.log(`[Shopify Webhook] Store not found: ${shopDomain}`);
      return;
    }

    const { syncSingleShopifyOrder } = require('../engines/shopify');
    // Fire and forget
    syncSingleShopifyOrder(store, orderId).catch(err => console.error(err));
  } catch (err) {
    console.error('Webhook processing error:', err.message);
  }
});

module.exports = router;
