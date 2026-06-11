const express = require('express');
const router = express.Router();
const db = require('../db');
const { loadStatusMaps, applyMap } = require('../engines/tracking');
const { fulfillShopifyOrder, syncSingleShopifyOrder } = require('../engines/shopify');
const { broadcast } = require('../sse');

function handlePostDeliveryFeedbackCheck(db, order) {
  try {
    const settings = db.prepare('SELECT enable_post_delivery_feedback FROM whatsapp_settings ORDER BY id DESC LIMIT 1').get();
    if (settings && settings.enable_post_delivery_feedback === 1) {
      const existing = db.prepare('SELECT id FROM whatsapp_polls WHERE order_id = ? ORDER BY id DESC LIMIT 1').get(order.id);
      if (existing) {
        db.prepare("UPDATE whatsapp_polls SET erp_status = ?, shopify_synced = 0 WHERE id = ?").run('Trace: Delivered', existing.id);
      } else {
        const messageId = `post_delivery_${order.id}_${Date.now()}`;
        let cleanPhone = order.phone || '';
        cleanPhone = cleanPhone.replace('+', '').replace('-', '').replace(' ', '');
        if (cleanPhone && !cleanPhone.includes('@')) {
          cleanPhone = `${cleanPhone}@s.whatsapp.net`;
        }
        db.prepare(`
          INSERT INTO whatsapp_polls (message_id, remote_jid, poll_name, poll_options, erp_status, order_id, shopify_synced)
          VALUES (?, ?, ?, ?, ?, ?, 0)
        `).run(messageId, cleanPhone || 'unknown@s.whatsapp.net', 'Post-Delivery Feedback', '[]', 'Trace: Delivered', order.id);
      }
      console.log(`[Webhook] Post-Delivery Feedback scheduled. Set erp_status = 'Trace: Delivered' for order ${order.id}`);
    }
  } catch (err) {
    console.error('Failed to handle post-delivery feedback scheduling:', err.message);
  }
}

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
    const order = db.prepare('SELECT id, store_id, shopify_order_id, delivery_status, phone FROM orders WHERE tracking_number = ?').get(trackingNumber);
    if (!order) {
      console.log(`%c👻 Webhook order not found: ${trackingNumber}`, 'color: yellow');
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

    // Check for post-delivery feedback scheduling
    const isDelivered = (transactionStatus === 'Delivered' || mappedStatus === 'Delivered');
    if (isDelivered) {
      handlePostDeliveryFeedbackCheck(db, order);
    }

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
    const order = db.prepare('SELECT id, store_id, shopify_order_id, delivery_status, courier, phone FROM orders WHERE tracking_number = ?').get(tn);
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

    // Check for post-delivery feedback scheduling
    const isDelivered = (mappedStatus === 'Delivered' || rawStatus === 'Delivered');
    if (isDelivered) {
      handlePostDeliveryFeedbackCheck(db, order);
    }

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
const handleShopifyWebhook = require('../webhooks/shopify');
router.post('/shopify', handleShopifyWebhook);

// POST /api/webhooks/whatsapp/portal-hook
router.post('/whatsapp/portal-hook', async (req, res) => {
  const authHeader = req.headers.auth || req.query.token;
  if (authHeader !== 'tracepk') {
    console.warn('⚠️ Unauthorized Portal Webhook Attempt (Token Mismatch)');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { msg } = req.body;
  if (!msg) return res.status(400).json({ error: 'Missing msg payload' });

  const tenantId = req.query.tenant_id || req.headers['x-tenant-id'] || req.tenantId || 'default';
  
  // Acknowledge immediately to prevent hanging webhooks and duplicate retries
  res.json({ success: true });

  try {
    const { getBot } = require('../engines/whatsapp_bot');
    const { processIncomingMessage } = require('../engines/whatsapp_message_processor');
    const { db: tenantDb } = require('../db');
    const tenantContext = require('../tenant-context');

    const botInstance = getBot(tenantId);
    
    // Process in background under the correct AsyncLocalStorage tenant context
    setImmediate(() => {
      tenantContext.run(tenantId, async () => {
        try {
          await processIncomingMessage(botInstance, msg, botInstance.sock, tenantDb);
        } catch (err) {
          console.error(`❌ [Portal Webhook Background] Error processing message for tenant [${tenantId}]:`, err.stack || err.message);
        }
      });
    });
  } catch (err) {
    console.error(`❌ [Portal Webhook] Error setting up background task:`, err.message);
  }
});

module.exports = router;
