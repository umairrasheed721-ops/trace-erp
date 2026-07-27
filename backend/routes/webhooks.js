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
    const order = db.prepare('SELECT id, store_id, shopify_order_id, delivery_status, phone, tracking_history, order_date, status_date FROM orders WHERE tracking_number = ?').get(trackingNumber);
    if (!order) {
      console.log(`%c👻 Webhook order not found: ${trackingNumber}`, 'color: yellow');
      return res.json({ success: true, message: 'Order not in ERP' });
    }

    // Update status
    const statusMap = loadStatusMaps();
    const mappedStatus = applyMap(statusMap, 'PostEx', transactionStatus);
    
    // Parse existing history
    let history = [];
    if (order.tracking_history) {
      try {
        let parsed = JSON.parse(order.tracking_history);
        if (typeof parsed === 'string') {
          parsed = JSON.parse(parsed);
        }
        history = parsed;
      } catch (e) {}
    }
    if (!Array.isArray(history)) {
      history = [];
    }

    // Add new event
    const eventTime = statusDateTime || new Date().toISOString();
    
    // Check for duplicates
    const isDuplicate = history.some(h => 
      (h.dateTime === eventTime || h.date === eventTime) && 
      (h.transactionStatus === transactionStatus || h.status === transactionStatus)
    );
    if (!isDuplicate) {
      history.push({
        dateTime: eventTime,
        transactionStatus: transactionStatus
      });
    }

    const historyJson = JSON.stringify(history);

    // Always update courier_status, tracking_history and update delivery_status if mapping exists, keeping dead statuses protected
    db.prepare(`
      UPDATE orders 
      SET courier_status = ?,
          delivery_status = CASE 
            WHEN LOWER(delivery_status) IN ('return received', 'delivered', 'cancelled') THEN delivery_status
            WHEN ? IS NOT NULL THEN ? 
            ELSE delivery_status 
          END,
          status_date = ?,
          tracking_history = ?
      WHERE id = ?
    `).run(
      transactionStatus,
      mappedStatus,
      mappedStatus,
      eventTime,
      historyJson,
      order.id
    );

    // 🐕 REAL-TIME OFFLINE WATCHDOG AUDIT ON WEBHOOK RECEIVED
    const statusLower = (transactionStatus || '').toLowerCase();
    const ADVICE_KEYWORDS = [
      'attempt', 'failed', 'refused', 'undelivered', 'reattempt', 
      'shipper advice', 'return', 'delivery under review', 
      'incomplete address', 'consignee not available', 'review'
    ];
    const needsWatchdog = ADVICE_KEYWORDS.some(kw => statusLower.includes(kw));
    if (needsWatchdog) {
      try {
        const { auditPostExOrder } = require('../engines/watchdog');
        // Tri-layer audit relies on the initial status date (or order date as fallback) as requestTime
        const requestTime = new Date(order.status_date || order.order_date || eventTime);
        const auditRes = auditPostExOrder({ trackingHistory: history, transactionStatus }, requestTime);
        
        db.prepare(`
          INSERT OR REPLACE INTO watchdog_results (store_id, tracking_number, request_time, latest_status, verdict, duration, evidence)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          order.store_id,
          trackingNumber,
          requestTime.toISOString(),
          auditRes.latestStatus,
          auditRes.verdict,
          auditRes.duration,
          auditRes.evidence
        );
        console.log(`🐕 [Webhook Watchdog] Offline real-time audit logged for ${trackingNumber}: ${auditRes.verdict}`);
      } catch (wdErr) {
        console.error(`[Webhook Watchdog Error] Failed to audit ${trackingNumber} on webhook:`, wdErr.message);
      }
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
    
    // Always update courier_status, and update delivery_status if mapping exists, keeping dead statuses protected
    db.prepare(`
      UPDATE orders 
      SET courier_status = ?,
          delivery_status = CASE 
            WHEN LOWER(delivery_status) IN ('return received', 'delivered', 'cancelled') THEN delivery_status
            WHEN ? IS NOT NULL THEN ? 
            ELSE delivery_status 
          END,
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

module.exports = router;
