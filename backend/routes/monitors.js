const express = require('express');
const router = express.Router();
const db = require('../db');
const fetch = typeof globalThis.fetch === 'function' ? globalThis.fetch : require('node-fetch');
const { cancelInstaworldOrder } = require('../engines/instaworld');

const IGNORE_STATUSES = ['delivered', 'return received', 'paid', 'pending', 'cancelled', 'returned', 'void', 'voided'];
const ADVICE_KEYWORDS = [
  'shipper advice', 'delivery under review', 'reattempt', 'undelivered', 
  'refused', 'incomplete address', 'consignee not available', 'attempt', 
  'failed', 'return', 'review', 'rfd', 'unsuccessful', 'refuse'
];

// GET /api/monitors/stuck?store_id=1
router.get('/stuck', (req, res) => {
  const { store_id } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });

  const thresholdHours = parseInt(req.query.threshold_hours) || 48;

  const blacklistSet = new Set(
    db.prepare('SELECT tracking_number FROM blacklist WHERE store_id = ?').all(store_id).map(r => r.tracking_number)
  );

  const orders = db.prepare(`
    SELECT id, ref_number, tracking_number, customer_name, phone, delivery_status, status_date, notes, price, product_titles, courier, courier_status
    FROM orders
    WHERE store_id = ?
    AND tracking_number IS NOT NULL AND tracking_number != ''
    AND LOWER(delivery_status) NOT IN ('delivered','return received','paid','pending','cancelled','returned','void','voided')
    AND datetime(COALESCE(status_date, order_date)) < datetime('now', '-' || ? || ' hours')
    AND tracking_number NOT IN (SELECT tracking_number FROM blacklist WHERE store_id = ?)
  `).all(store_id, thresholdHours, store_id);

  const stuckOrders = orders.map(o => {
    const statusDateStr = o.status_date ? o.status_date.replace(' ', 'T') + '+05:00' : null;
    const hours = statusDateStr ? (Date.now() - new Date(statusDateStr).getTime()) / 3600000 : 0;

    // Check if tracking number has changed in history
    const history = db.prepare(`
      SELECT h.old_value, h.new_value, h.created_at, u.username
      FROM order_history h
      LEFT JOIN users u ON h.user_id = u.id
      WHERE h.order_id = ? AND h.change_type IN ('TRACKING_UPDATE', 'MANUAL_EDIT')
      ORDER BY h.id DESC
    `).all(o.id);

    let tracking_update = null;
    for (const h of history) {
      try {
        const oldVal = JSON.parse(h.old_value);
        const newVal = JSON.parse(h.new_value);
        if (oldVal && newVal && oldVal.tracking_number !== undefined && newVal.tracking_number !== undefined && oldVal.tracking_number !== newVal.tracking_number) {
          tracking_update = {
            old_tracking: oldVal.tracking_number,
            new_tracking: newVal.tracking_number,
            changed_at: h.created_at,
            changed_by: h.username || 'Shopify Sync'
          };
          break;
        }
      } catch (e) {}
    }

    // Determine manual ID
    const trackingLower = (o.tracking_number || '').toLowerCase();
    const isManual = trackingLower.includes('@') || 
                     trackingLower.includes('local') || 
                     trackingLower.includes('exchange') || 
                     trackingLower.includes('bus') || 
                     trackingLower.includes('pvt') || 
                     trackingLower.includes('deliver') || 
                     trackingLower.includes('shop') || 
                     trackingLower.includes('wholesale') || 
                     trackingLower.includes('purchased') ||
                     (trackingLower.length > 0 && !/^\d+$/.test(trackingLower) && !/^le\d+$/i.test(trackingLower));

    // Dynamic insight classification
    let insight_type = 'STUCK_TRANSIT';
    const statusLower = (o.courier_status || o.delivery_status || '').toLowerCase();
    
    if (isManual) {
      insight_type = 'MANUAL_ID';
    } else if (statusLower === 'booked' || statusLower === 'confirmed') {
      insight_type = 'PICKUP_PENDING';
    } else if (ADVICE_KEYWORDS.some(k => statusLower.includes(k))) {
      insight_type = 'ADVICE_REQUIRED';
    }

    return { 
      ...o, 
      hours_stuck: Math.floor(hours), 
      days_stuck: Math.floor(hours / 24),
      tracking_update,
      insight_type
    };
  }).sort((a, b) => b.hours_stuck - a.hours_stuck);

  res.json(stuckOrders);
});

// GET /api/monitors/advice?store_id=1
router.get('/advice', (req, res) => {
  const { store_id } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });

  const blacklistSet = new Set(
    db.prepare('SELECT tracking_number FROM blacklist WHERE store_id = ?').all(store_id).map(r => r.tracking_number)
  );

  const orders = db.prepare(`
    SELECT id, tracking_number, customer_name, phone, delivery_status, notes, price, product_titles, courier
    FROM orders WHERE store_id = ?
    AND tracking_number IS NOT NULL AND tracking_number != ''
  `).all(store_id);

  const adviceOrders = orders.filter(o => {
    const st = (o.courier_status || o.delivery_status || '').toLowerCase();
    if (blacklistSet.has(o.tracking_number)) return false;
    return ADVICE_KEYWORDS.some(k => st.includes(k));
  });

  res.json(adviceOrders);
});

// GET /api/monitors/blacklist - Get blacklisted tracking numbers with metadata
router.get('/blacklist', (req, res) => {
  const { store_id } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });
  const list = db.prepare(`
    SELECT b.tracking_number, o.ref_number, o.customer_name, o.delivery_status, o.courier
    FROM blacklist b
    LEFT JOIN orders o ON b.tracking_number = o.tracking_number AND b.store_id = o.store_id
    WHERE b.store_id = ?
  `).all(store_id);
  res.json(list);
});

// POST /api/monitors/blacklist - Add to blacklist
router.post('/blacklist', (req, res) => {
  const { store_id, tracking_number } = req.body;
  if (!store_id || !tracking_number) return res.status(400).json({ error: 'Missing fields' });
  db.prepare('INSERT OR IGNORE INTO blacklist (store_id, tracking_number) VALUES (?,?)').run(store_id, tracking_number);
  res.json({ success: true });
});

// DELETE /api/monitors/blacklist - Remove from blacklist
router.delete('/blacklist', (req, res) => {
  const { store_id, tracking_number } = req.body;
  db.prepare('DELETE FROM blacklist WHERE store_id=? AND tracking_number=?').run(store_id, tracking_number);
  res.json({ success: true });
});

// POST /api/monitors/courier-action - Send Reattempt/Return to the correct courier
const handleCourierAction = async (req, res) => {
  const { store_id, tracking_number, action, note } = req.body;
  if (!store_id || !tracking_number || !action) return res.status(400).json({ error: 'Missing fields' });

  // 1. Fetch order to detect the courier
  const order = db.prepare('SELECT courier FROM orders WHERE store_id = ? AND tracking_number = ?').get(store_id, tracking_number);
  const courierName = order ? (order.courier || 'PostEx') : 'PostEx';
  const isPostEx = courierName.toLowerCase().includes('postex');

  // 2. Fetch store details
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(store_id);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  if (isPostEx) {
    if (!store.postex_token) return res.status(400).json({ error: 'PostEx token not configured' });

    const statusId = action === 'Return' ? 1 : action === 'Reattempt' ? 2 : 0;
    if (!statusId) return res.status(400).json({ error: 'Invalid action' });

    try {
      const response = await fetch('https://api.postex.pk/services/integration/api/order/v2/save-shipper-advice', {
        method: 'PUT',
        headers: { 'token': store.postex_token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingNumber: String(tracking_number), statusId, remarks: note || 'Merchant Action via TracePK' })
      });

      if (response.ok) {
        const newStatus = action === 'Return' ? 'Return Initiated' : 'Reattempt Requested';
        db.prepare("UPDATE orders SET delivery_status=?, status_date=datetime('now') WHERE store_id=? AND tracking_number=?")
          .run(newStatus, store_id, tracking_number);
        return res.json({ success: true, message: `✅ ${action} sent to PostEx` });
      } else {
        return res.status(400).json({ error: `PostEx API returned ${response.status}` });
      }
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  } else {
    // Non-PostEx couriers (Instaworld / TCS / Leopards / LCS)
    if (!store.instaworld_key) return res.status(400).json({ error: 'Instaworld API Key missing/not configured' });

    if (action === 'Return') {
      try {
        const cancelled = await cancelInstaworldOrder(store, tracking_number);
        if (cancelled) {
          const newStatus = 'Return Initiated';
          db.prepare("UPDATE orders SET delivery_status=?, status_date=datetime('now') WHERE store_id=? AND tracking_number=?")
            .run(newStatus, store_id, tracking_number);
          return res.json({ success: true, message: `✅ Return initiated / Order cancelled in Instaworld` });
        } else {
          return res.status(400).json({ error: 'Failed to cancel order in Instaworld' });
        }
      } catch (e) {
        return res.status(500).json({ error: `Instaworld Cancel Error: ${e.message}` });
      }
    } else if (action === 'Reattempt') {
      try {
        const newStatus = 'Reattempt Requested';
        db.prepare("UPDATE orders SET delivery_status=?, status_date=datetime('now') WHERE store_id=? AND tracking_number=?")
          .run(newStatus, store_id, tracking_number);
        return res.json({ success: true, message: `✅ Reattempt status updated locally for ${courierName}` });
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }
  }
};

router.post('/postex-action', handleCourierAction);
router.post('/courier-action', handleCourierAction);

// GET /api/monitors/sync-audit?store_id=1
router.get('/sync-audit', (req, res) => {
  const { store_id, limit = 100 } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });

  try {
    const logs = db.prepare(`
      SELECT * FROM sync_audit 
      WHERE store_id = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `).all(Number(store_id), Number(limit));
    res.json(logs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
