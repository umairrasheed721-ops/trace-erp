const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/stores - List all connected stores
router.get('/', (req, res) => {
  const stores = db.prepare(`
    SELECT id, shop_domain, store_name, last_synced_at, created_at,
           postex_token, instaworld_key, instaworld_key_backup,
           CASE WHEN access_token != 'PENDING' THEN 1 ELSE 0 END as is_connected
    FROM stores ORDER BY created_at DESC
  `).all();
  res.json(stores);
});

// GET /api/stores/:id - Get single store info
router.get('/:id', (req, res) => {
  const store = db.prepare(`
    SELECT id, shop_domain, store_name, last_synced_at, created_at,
           postex_token, instaworld_key, instaworld_key_backup,
           CASE WHEN access_token != 'PENDING' THEN 1 ELSE 0 END as is_connected
    FROM stores WHERE id = ?
  `).get(req.params.id);
  if (!store) return res.status(404).json({ error: 'Store not found' });
  res.json(store);
});

// PUT /api/stores/:id - Update courier credentials + API URLs
router.put('/:id', (req, res) => {
  const { postex_token, instaworld_key, instaworld_key_backup, store_name, postex_track_url, instaworld_track_url } = req.body;
  db.prepare(`
    UPDATE stores SET postex_token=?, instaworld_key=?, instaworld_key_backup=?, store_name=?,
    postex_track_url=COALESCE(NULLIF(?,''),(SELECT postex_track_url FROM stores WHERE id=?)),
    instaworld_track_url=COALESCE(NULLIF(?,''),(SELECT instaworld_track_url FROM stores WHERE id=?))
    WHERE id=?
  `).run(postex_token, instaworld_key, instaworld_key_backup, store_name,
         postex_track_url, req.params.id,
         instaworld_track_url, req.params.id,
         req.params.id);
  res.json({ success: true });
});

// DELETE /api/stores/:id - Disconnect a store (deletes all its data)
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM stores WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// GET /api/stores/:id/stats - Dashboard KPIs
router.get('/:id/stats', (req, res) => {
  const storeId = req.params.id;

  const total = db.prepare('SELECT COUNT(*) as count FROM orders WHERE store_id=?').get(storeId);
  const delivered = db.prepare("SELECT COUNT(*) as count FROM orders WHERE store_id=? AND LOWER(delivery_status)='delivered'").get(storeId);
  const returned = db.prepare("SELECT COUNT(*) as count FROM orders WHERE store_id=? AND LOWER(delivery_status) IN ('return received','returned')").get(storeId);
  const pending = db.prepare("SELECT COUNT(*) as count FROM orders WHERE store_id=? AND LOWER(delivery_status) NOT IN ('delivered','return received','returned','cancelled')").get(storeId);
  const revenue = db.prepare("SELECT SUM(price) as total FROM orders WHERE store_id=? AND payment_status='Paid'").get(storeId);
  const stuck = db.prepare(`
    SELECT COUNT(*) as count FROM orders WHERE store_id=?
    AND LOWER(delivery_status) NOT IN ('delivered','return received','returned','cancelled','booked','pending')
    AND status_date < datetime('now', '-48 hours')
  `).get(storeId);

  const totalCount = total.count || 0;
  const deliveredCount = delivered.count || 0;
  const returnedCount = returned.count || 0;

  res.json({
    total_orders: totalCount,
    delivered: deliveredCount,
    returned: returnedCount,
    pending: pending.count || 0,
    stuck: stuck.count || 0,
    delivery_rate: totalCount > 0 ? ((deliveredCount / totalCount) * 100).toFixed(1) : 0,
    rto_rate: totalCount > 0 ? ((returnedCount / totalCount) * 100).toFixed(1) : 0,
    revenue: (revenue.total || 0).toFixed(0)
  });
});

module.exports = router;
