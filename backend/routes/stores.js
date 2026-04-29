const express = require('express');
const router = express.Router();
const db = require('../db');
// Removed top-level require for shopify engine to avoid circular dependency

// GET /api/stores - List all connected stores
router.get('/', (req, res) => {
  const stores = db.prepare(`
    SELECT id, shop_domain, store_name, last_synced_at, created_at,
           postex_token, instaworld_key, instaworld_key_backup, sync_start_date,
           sync_status, sync_progress, postex_track_url, instaworld_track_url,
           CASE WHEN access_token != 'PENDING' THEN 1 ELSE 0 END as is_connected
    FROM stores ORDER BY created_at DESC
  `).all();
  res.json(stores);
});

// GET /api/stores/:id - Get single store info
router.get('/:id', (req, res) => {
  const store = db.prepare(`
    SELECT id, shop_domain, store_name, last_synced_at, created_at,
           postex_token, instaworld_key, instaworld_key_backup, sync_start_date,
           sync_status, sync_progress, postex_track_url, instaworld_track_url,
           CASE WHEN access_token != 'PENDING' THEN 1 ELSE 0 END as is_connected
    FROM stores WHERE id = ?
  `).get(req.params.id);
  if (!store) return res.status(404).json({ error: 'Store not found' });
  res.json(store);
});

// PUT /api/stores/:id - Update courier credentials + API URLs
router.put('/:id', (req, res) => {
  const { postex_token, instaworld_key, instaworld_key_backup, store_name, postex_track_url, instaworld_track_url, sync_start_date } = req.body;
  const startDate = sync_start_date || '';
  
  db.prepare(`
    UPDATE stores SET postex_token=?, instaworld_key=?, instaworld_key_backup=?, store_name=?,
    postex_track_url=COALESCE(NULLIF(?,''),(SELECT postex_track_url FROM stores WHERE id=?)),
    instaworld_track_url=COALESCE(NULLIF(?,''),(SELECT instaworld_track_url FROM stores WHERE id=?)),
    sync_start_date=?
    WHERE id=?
  `).run(postex_token || null, instaworld_key || null, instaworld_key_backup || null, store_name || null,
         postex_track_url || null, req.params.id,
         instaworld_track_url || null, req.params.id,
         startDate,
         req.params.id);
  res.json({ success: true });
});

// POST /api/stores/:id/deep-sync - Trigger historical sync
router.post('/:id/deep-sync', async (req, res) => {
  const { fetchShopifyOrders } = require('../engines/shopify');
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(req.params.id);
  if (!store) return res.status(404).json({ error: 'Store not found' });
  
  try {
    // Run sync in background (fire and forget for now, or we could return progress)
    fetchShopifyOrders(store, null, { forceDeepSync: true });
    res.json({ success: true, message: 'Historical sync started in background' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/stores/:id/register-webhooks - Set up real-time sync
router.post('/:id/register-webhooks', async (req, res) => {
  const { registerShopifyWebhooks } = require('../engines/shopify');
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(req.params.id);
  if (!store) return res.status(404).json({ error: 'Store not found' });
  
  const { appUrl } = req.body;
  if (!appUrl) return res.status(400).json({ error: 'appUrl required' });

  try {
    const success = await registerShopifyWebhooks(store, appUrl);
    if (success) {
      res.json({ success: true, message: 'Webhooks registered successfully' });
    } else {
      res.status(500).json({ error: 'Failed to register one or more webhooks' });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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

// ─── SAVED VIEWS ───
router.get('/:id/views', (req, res) => {
  const views = db.prepare('SELECT v.*, u.username as creator FROM saved_views v JOIN users u ON v.user_id = u.id WHERE v.store_id = ? ORDER BY v.created_at DESC').all(req.params.id);
  res.json(views);
});

router.post('/:id/views', (req, res) => {
  const { view_name, column_config, is_locked } = req.body;
  if (!view_name || !column_config) return res.status(400).json({ error: 'view_name and column_config required' });

  try {
    db.prepare(`
      INSERT INTO saved_views (store_id, user_id, view_name, column_config, is_locked)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(store_id, view_name) DO UPDATE SET
        column_config = excluded.column_config,
        is_locked = excluded.is_locked,
        user_id = excluded.user_id
    `).run(req.params.id, req.user.id, view_name, JSON.stringify(column_config), is_locked ? 1 : 0);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:store_id/views/:view_id', (req, res) => {
  const view = db.prepare('SELECT * FROM saved_views WHERE id = ?').get(req.params.view_id);
  if (!view) return res.status(404).json({ error: 'View not found' });

  // Only creator or admin can delete locked views
  if (view.is_locked && req.user.role !== 'admin' && view.user_id !== req.user.id) {
    return res.status(403).json({ error: 'This view is locked and can only be deleted by an admin or its creator.' });
  }

  db.prepare('DELETE FROM saved_views WHERE id = ?').run(req.params.view_id);
  res.json({ success: true });
});

module.exports = router;
