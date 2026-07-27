const express = require('express');
const router = express.Router();
const db = require('../db');
const fetch = typeof globalThis.fetch === 'function' ? globalThis.fetch : require('node-fetch');
const { cancelInstaworldOrder } = require('../engines/instaworld');

const IGNORE_STATUSES = ['delivered', 'return received', 'paid', 'pending', 'cancelled', 'returned', 'void', 'voided'];
const ADVICE_KEYWORDS = [
  'shipper advice', 
  'delivery under review',
  'under review',
  'refused',
  'incomplete',
  'not available',
  'unreachable',
  'wrong phone',
  'address not found',
  'consignee unavailable',
  'attempt failed',
  'failed attempt',
  'undelivered',
  'un-delivered',
  'delivery failed'
];

function isExcludedFromAdvice(courierStatus) {
  if (!courierStatus) return false;
  const statusLower = courierStatus.toLowerCase();
  if (
    statusLower.includes('return process') ||
    statusLower.includes('waiting for return') ||
    statusLower.includes('return to ') ||
    statusLower.includes('returned') ||
    statusLower.includes('out for return') ||
    statusLower.includes('return received')
  ) {
    return true;
  }
  return false;
}

// GET /api/monitors/stuck?store_id=1
router.get('/stuck', (req, res) => {
  const { store_id } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });

  const thresholdHours = parseInt(req.query.threshold_hours) || 48;

  const blacklistSet = new Set(
    db.prepare('SELECT tracking_number FROM blacklist WHERE store_id = ?').all(store_id).map(r => r.tracking_number)
  );

  const orders = db.prepare(`
    SELECT id, ref_number, tracking_number, customer_name, phone, delivery_status, status_date, order_date, notes, price, product_titles, courier, courier_status
    FROM orders
    WHERE store_id = ?
    AND tracking_number IS NOT NULL AND tracking_number != ''
    AND LOWER(delivery_status) NOT IN ('delivered','return received','paid','pending','cancelled','void','voided')
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
      WHERE h.order_id = ? AND h.field_name = 'tracking_number'
      ORDER BY h.created_at DESC
    `).all(o.id);

    return {
      ...o,
      stuck_hours: Math.round(hours),
      tracking_history_changes: history
    };
  }).sort((a, b) => b.stuck_hours - a.stuck_hours);

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
    SELECT id, tracking_number, customer_name, phone, delivery_status, notes, price, product_titles, courier, courier_status, COALESCE(failed_attempts, 0) as failed_attempts, status_date, order_date
    FROM orders WHERE store_id = ?
    AND tracking_number IS NOT NULL AND tracking_number != ''
  `).all(store_id);

  const adviceOrders = [];

  orders.forEach(o => {
    if (blacklistSet.has(o.tracking_number)) return;

    const deliveryStatusLower = (o.delivery_status || '').toLowerCase().trim();
    const courierStatusLower = (o.courier_status || '').toLowerCase().trim();
    const combinedStatus = `${deliveryStatusLower} ${courierStatusLower}`;

    if (IGNORE_STATUSES.includes(deliveryStatusLower)) return;
    if (deliveryStatusLower.includes('reattempt requested')) return;

    const failedCount = parseInt(o.failed_attempts || 0, 10);
    const isReturnStatus = deliveryStatusLower.includes('return initiated') ||
                          deliveryStatusLower.includes('return process') ||
                          courierStatusLower.includes('return initiated') ||
                          courierStatusLower.includes('return process') ||
                          courierStatusLower.includes('return to') ||
                          courierStatusLower.includes('out for return') ||
                          courierStatusLower.includes('waiting for return');

    // ⚡ 1. 1st Attempt Immediate Return: Courier marked return on 1st attempt failure!
    if (isReturnStatus && (failedCount <= 1 || combinedStatus.includes('1st') || combinedStatus.includes('first'))) {
      o.advice_category = 'immediate_return';
      adviceOrders.push(o);
      return;
    }

    if (isReturnStatus) return;
    if (isExcludedFromAdvice(o.courier_status)) return;

    // 🚨 2. All Shipper Advice / Action Required / Failed Attempt Matches
    const isAdviceOrFailure = deliveryStatusLower.includes('delivery under review') ||
                              deliveryStatusLower.includes('shipper advice') ||
                              deliveryStatusLower.includes('under review') ||
                              courierStatusLower.includes('delivery under review') ||
                              courierStatusLower.includes('shipper advice') ||
                              courierStatusLower.includes('under review') ||
                              combinedStatus.includes('refused') ||
                              combinedStatus.includes('incomplete') ||
                              combinedStatus.includes('not available') ||
                              combinedStatus.includes('unreachable') ||
                              combinedStatus.includes('wrong phone') ||
                              combinedStatus.includes('address') ||
                              combinedStatus.includes('undelivered') ||
                              combinedStatus.includes('failed');

    if (isAdviceOrFailure) {
      if (
        deliveryStatusLower.includes('delivery under review') ||
        deliveryStatusLower.includes('shipper advice') ||
        courierStatusLower.includes('delivery under review') ||
        courierStatusLower.includes('shipper advice') ||
        courierStatusLower.includes('under review')
      ) {
        o.advice_category = 'advice_required';
      } else {
        o.advice_category = 'first_attempt';
      }
      adviceOrders.push(o);
    }
  });

  res.json(adviceOrders);
});

// GET /api/monitors/reattempts?store_id=1 (Restricted to Last 60 Days / 2 Months)
router.get('/reattempts', (req, res) => {
  const { store_id } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });

  const orders = db.prepare(`
    SELECT id, tracking_number, customer_name, phone, delivery_status, notes, price, product_titles, courier, courier_status, status_date, order_date
    FROM orders WHERE store_id = ?
    AND (LOWER(delivery_status) IN ('reattempt requested', 'return initiated') OR notes LIKE '%[Shipper Advice%')
    AND datetime(COALESCE(status_date, order_date)) >= datetime('now', '-60 days')
    ORDER BY COALESCE(status_date, order_date) DESC
  `).all(store_id);

  res.json(orders);
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

  // 1. Fetch order to detect courier and existing notes
  const order = db.prepare('SELECT id, shopify_order_id, courier, notes FROM orders WHERE store_id = ? AND tracking_number = ?').get(store_id, tracking_number);
  const courierName = order ? (order.courier || 'PostEx') : 'PostEx';
  const isPostEx = courierName.toLowerCase().includes('postex');

  // 2. Fetch store details
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(store_id);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  // Build formatted advice note entry
  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  const adviceEntry = `[Shipper Advice - ${action}${note && note.trim() ? ': ' + note.trim() : ''} (${dateStr})]`;
  const existingNotes = order ? (order.notes || '').trim() : '';
  const updatedNotes = existingNotes ? `${existingNotes} | ${adviceEntry}` : adviceEntry;

  const syncNoteToShopify = (notesToSync) => {
    if (order && order.shopify_order_id && store.shop_domain && store.access_token) {
      fetch(`https://${store.shop_domain}/admin/api/2024-10/orders/${order.shopify_order_id}.json`, {
        method: 'PUT',
        headers: {
          'X-Shopify-Access-Token': store.access_token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          order: {
            id: order.shopify_order_id,
            note: notesToSync
          }
        })
      }).catch(err => console.error('Failed to sync advice note to Shopify:', err.message));
    }
  };

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
        db.prepare("UPDATE orders SET delivery_status=?, notes=?, status_date=datetime('now') WHERE store_id=? AND tracking_number=?")
          .run(newStatus, updatedNotes, store_id, tracking_number);

        syncNoteToShopify(updatedNotes);
        return res.json({ success: true, message: `✅ ${action} sent to PostEx & note saved` });
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
          db.prepare("UPDATE orders SET delivery_status=?, notes=?, status_date=datetime('now') WHERE store_id=? AND tracking_number=?")
            .run(newStatus, updatedNotes, store_id, tracking_number);

          syncNoteToShopify(updatedNotes);
          return res.json({ success: true, message: `✅ Return initiated / Order cancelled in Instaworld & note saved` });
        } else {
          return res.status(400).json({ error: 'Failed to cancel order in Instaworld' });
        }
      } catch (e) {
        return res.status(500).json({ error: `Instaworld Cancel Error: ${e.message}` });
      }
    } else if (action === 'Reattempt') {
      try {
        const newStatus = 'Reattempt Requested';
        db.prepare("UPDATE orders SET delivery_status=?, notes=?, status_date=datetime('now') WHERE store_id=? AND tracking_number=?")
          .run(newStatus, updatedNotes, store_id, tracking_number);

        syncNoteToShopify(updatedNotes);
        return res.json({ success: true, message: `✅ Reattempt status updated & note saved for ${courierName}` });
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

// GET /api/monitors/tracking-history?store_id=1&tracking_number=20120050025388
router.get('/tracking-history', async (req, res) => {
  const { store_id, tracking_number } = req.query;
  if (!store_id || !tracking_number) return res.status(400).json({ error: 'store_id and tracking_number required' });

  const order = db.prepare('SELECT courier FROM orders WHERE store_id = ? AND tracking_number = ?').get(store_id, tracking_number);
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(store_id);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  const courierName = order ? (order.courier || 'PostEx') : 'PostEx';
  const isPostEx = courierName.toLowerCase().includes('postex');

  if (isPostEx) {
    if (!store.postex_token) return res.status(400).json({ error: 'PostEx token not configured' });

    try {
      const response = await fetch(`https://api.postex.pk/services/integration/api/order/v1/track-order/${encodeURIComponent(String(tracking_number).trim())}`, {
        method: 'GET',
        headers: { 'token': store.postex_token, 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        return res.status(400).json({ error: `PostEx API returned ${response.status}` });
      }

      const data = await response.json();
      const rawHistory = data?.dist?.transactionStatusHistory 
        || data?.transactionStatusHistory 
        || data?.data?.transactionStatusHistory 
        || data?.dist?.trackingHistory 
        || data?.trackingHistory 
        || [];

      const formattedHistory = rawHistory.map(h => ({
        message: h.transactionStatusMessage || h.statusMessage || h.message || h.status || 'Event Recorded',
        dateTime: h.dateTime || h.date || h.timestamp || h.updatedAt || null
      }));

      return res.json({
        success: true,
        courier: 'PostEx',
        trackingNumber: tracking_number,
        currentStatus: data?.dist?.transactionStatusMessage || data?.transactionStatusMessage || null,
        history: formattedHistory
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  } else {
    return res.json({
      success: true,
      courier: courierName,
      trackingNumber: tracking_number,
      history: []
    });
  }
});

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
