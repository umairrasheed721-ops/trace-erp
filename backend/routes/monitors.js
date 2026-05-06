const express = require('express');
const router = express.Router();
const db = require('../db');
const fetch = require('node-fetch');

const IGNORE_STATUSES = ['delivered', 'return received', 'paid', 'pending', 'cancelled', 'returned', 'void', 'voided'];
const ADVICE_KEYWORDS = ['shipper advice', 'delivery under review', 'reattempt', 'undelivered', 'refused', 'incomplete address', 'consignee not available'];

// GET /api/monitors/stuck?store_id=1
router.get('/stuck', (req, res) => {
  const { store_id } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });

  const blacklistSet = new Set(
    db.prepare('SELECT tracking_number FROM blacklist WHERE store_id = ?').all(store_id).map(r => r.tracking_number)
  );

  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const orders = db.prepare(`
    SELECT id, ref_number, tracking_number, customer_name, delivery_status, status_date, notes, price, product_titles
    FROM orders
    WHERE store_id = ?
    AND status_date < ?
    AND tracking_number IS NOT NULL AND tracking_number != ''
  `).all(store_id, cutoff);

  const stuckOrders = orders.filter(o => {
    const st = (o.delivery_status || '').toLowerCase();
    if (IGNORE_STATUSES.some(k => st.includes(k))) return false;
    if (blacklistSet.has(o.tracking_number)) return false;
    return true;
  }).map(o => {
    const hours = (Date.now() - new Date(o.status_date).getTime()) / 3600000;
    return { ...o, hours_stuck: Math.floor(hours), days_stuck: Math.floor(hours / 24) };
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
    SELECT id, tracking_number, customer_name, delivery_status, notes, price, product_titles, courier
    FROM orders WHERE store_id = ?
    AND tracking_number IS NOT NULL AND tracking_number != ''
  `).all(store_id);

  const adviceOrders = orders.filter(o => {
    const st = (o.delivery_status || '').toLowerCase();
    if (blacklistSet.has(o.tracking_number)) return false;
    return ADVICE_KEYWORDS.some(k => st.includes(k));
  });

  res.json(adviceOrders);
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

// POST /api/monitors/postex-action - Send Reattempt/Return to PostEx
router.post('/postex-action', async (req, res) => {
  const { store_id, tracking_number, action, note } = req.body;
  if (!store_id || !tracking_number || !action) return res.status(400).json({ error: 'Missing fields' });

  const store = db.prepare('SELECT postex_token FROM stores WHERE id = ?').get(store_id);
  if (!store?.postex_token) return res.status(400).json({ error: 'PostEx token not configured' });

  const statusId = action === 'Return' ? 1 : action === 'Reattempt' ? 2 : 0;
  if (!statusId) return res.status(400).json({ error: 'Invalid action' });

  try {
    const response = await fetch('https://api.postex.pk/services/integration/api/order/v2/save-shipper-advice', {
      method: 'PUT',
      headers: { 'token': store.postex_token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackingNumber: String(tracking_number), statusId, remarks: note || 'Merchant Action via TracePK' })
    });

    if (response.ok) {
      // Update local status immediately
      const newStatus = action === 'Return' ? 'Return Initiated' : 'Reattempt Requested';
      db.prepare("UPDATE orders SET delivery_status=?, status_date=datetime('now') WHERE store_id=? AND tracking_number=?")
        .run(newStatus, store_id, tracking_number);
      res.json({ success: true, message: `✅ ${action} sent to PostEx` });
    } else {
      res.status(400).json({ error: `PostEx API returned ${response.status}` });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
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
