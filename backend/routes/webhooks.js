const express = require('express');
const router = express.Router();
const db = require('../db');
const { loadStatusMaps, applyMap } = require('../engines/tracking');
const { fulfillShopifyOrder, syncSingleShopifyOrder } = require('../engines/shopify');
const { broadcast } = require('../sse');

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
    const statusMap = loadStatusMaps();
    const mappedStatus = applyMap(statusMap, 'PostEx', transactionStatus);
    
    // Always update courier_status, and update delivery_status if mapping exists
    db.prepare(`
      UPDATE orders 
      SET courier_status = ?,
          delivery_status = CASE WHEN ? IS NOT NULL THEN ? ELSE delivery_status END,
          status_date = ?
      WHERE id = ?
    `).run(
      transactionStatus,
      mappedStatus,
      mappedStatus,
      statusDateTime || new Date().toISOString(),
      order.id
    );

    // Broadcast the update in real-time to the frontend
    try {
      broadcast('order_updated', { storeId: order.store_id, shopifyOrderId: order.shopify_order_id });
    } catch (e) {
      console.error('Failed to broadcast PostEx webhook update:', e.message);
    }

    // 🚀 PUSH TO SHOPIFY IN REAL-TIME
    if (['Delivered', 'Returned', 'Return Received', 'Cancelled'].includes(transactionStatus)) {
      const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(order.store_id);
      if (store) {
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

// POST /api/webhooks/instaworld
router.post('/instaworld', (req, res) => {
  // 1. Security Check
  const authHeader = req.headers.auth || req.query.token || req.headers['x-instaworld-token'];
  if (authHeader !== 'tracepk') {
    console.warn('⚠️ Unauthorized InstaWorld Webhook Attempt (Token Mismatch)');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const payload = req.body;
  console.log('📬 [WEBHOOK] InstaWorld Update received:', JSON.stringify(payload));

  const { tracking_number, status, status_date, courier_name } = payload;
  const tn = tracking_number || payload.trackingNumber;
  const rawStatus = status || payload.transactionStatus || payload.statusDescription;

  if (!tn || !rawStatus) return res.status(400).json({ error: 'Invalid payload' });

  try {
    // Find order
    const order = db.prepare('SELECT id, store_id, shopify_order_id, delivery_status, courier FROM orders WHERE tracking_number = ?').get(tn);
    if (!order) {
      console.log(`👻 Webhook order not found: ${tn}`);
      return res.json({ success: true, message: 'Order not in ERP' });
    }

    const courier = courier_name || order.courier || 'Instaworld';

    // Update status
    const statusMap = loadStatusMaps();
    const mappedStatus = applyMap(statusMap, courier, rawStatus);
    
    // Always update courier_status, and update delivery_status if mapping exists
    db.prepare(`
      UPDATE orders 
      SET courier_status = ?,
          delivery_status = CASE WHEN ? IS NOT NULL THEN ? ELSE delivery_status END,
          courier = ?,
          status_date = ?
      WHERE id = ?
    `).run(
      rawStatus,
      mappedStatus,
      mappedStatus,
      courier,
      status_date || new Date().toISOString(),
      order.id
    );

    // Broadcast the update in real-time to the frontend
    try {
      broadcast('order_updated', { storeId: order.store_id, shopifyOrderId: order.shopify_order_id });
    } catch (e) {
      console.error('Failed to broadcast InstaWorld webhook update:', e.message);
    }

    // 🚀 PUSH TO SHOPIFY IN REAL-TIME
    if (['Delivered', 'Returned', 'Return Received', 'Cancelled'].includes(mappedStatus || rawStatus)) {
      const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(order.store_id);
      if (store) {
        const isPaid = (mappedStatus === 'Delivered' || rawStatus === 'Delivered');
        fulfillShopifyOrder(store, order.shopify_order_id, tn, courier, isPaid)
          .then(() => console.log(`[Webhook] Shopify updated for Instaworld order ${tn}`))
          .catch(err => console.error(`[Webhook] Shopify update failed for ${tn}:`, err.message));
      }
    }

    console.log(`✅ Instaworld Webhook update success: ${tn} -> ${rawStatus}`);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Instaworld Webhook error:', err.message);
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

    // Fire and forget
    syncSingleShopifyOrder(store, orderId).catch(err => console.error(err));
  } catch (err) {
    console.error('Webhook processing error:', err.message);
  }
});

// POST /api/webhooks/whatsapp/portal-hook
router.post('/whatsapp/portal-hook', async (req, res) => {
  const authHeader = req.headers.auth || req.query.token;
  if (authHeader !== 'tracepk') {
    console.warn('⚠️ Unauthorized Portal Webhook Attempt (Token Mismatch)');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { msg } = req.body;
  if (!msg) return res.status(400).json({ error: 'Missing msg payload' });

  const tenantId = req.tenantId || 'default';
  try {
    const { getBot } = require('../engines/whatsapp_bot');
    const { processIncomingMessage } = require('../engines/whatsapp_message_processor');
    const { db: tenantDb } = require('../db');

    const botInstance = getBot(tenantId);
    await processIncomingMessage(botInstance, msg, botInstance.sock, tenantDb);

    res.json({ success: true });
  } catch (err) {
    console.error(`❌ [Portal Webhook] Error processing incoming message:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
