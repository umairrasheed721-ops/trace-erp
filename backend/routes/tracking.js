const express = require('express');
const router = express.Router();
const db = require('../db');
const { syncPostEx, syncInstaworld } = require('../engines/tracking');
const { fetchShopifyOrders, refreshShopifyUpdates } = require('../engines/shopify');
const { broadcast } = require('../sse');

const saveSyncLog = (type, total, success, failed, logData) => {
  try {
    const stmt = db.prepare('INSERT INTO sync_history (type, total, success, failed, log_data) VALUES (?, ?, ?, ?, ?)');
    stmt.run(type, total, success, failed, JSON.stringify(logData));
    db.prepare("DELETE FROM sync_history WHERE created_at < datetime('now', '+5 hours', '-3 days')").run();
    broadcast('sync_history_updated', { type });
  } catch (e) {
    console.error('Failed to save sync log:', e.message);
  }
};

const getStore = (storeId) => db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId);

// POST /api/tracking/sync-postex
router.post('/sync-postex', async (req, res) => {
  const { store_id, sync_type = 'FULL' } = req.body;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });
  const store = getStore(store_id);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  try {
    const result = await syncPostEx(store, sync_type);
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/tracking/sync-instaworld
router.post('/sync-instaworld', async (req, res) => {
  const { store_id, sync_type = 'FULL' } = req.body;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });
  const store = getStore(store_id);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  try {
    const result = await syncInstaworld(store, sync_type);
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/tracking/fetch-shopify
router.post('/fetch-shopify', async (req, res) => {
  const { store_id } = req.body;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });
  const store = getStore(store_id);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  try {
    const result = await fetchShopifyOrders(store);
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/tracking/refresh-shopify
router.post('/refresh-shopify', async (req, res) => {
  const { store_id } = req.body;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });
  const store = getStore(store_id);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  try {
    const result = await refreshShopifyUpdates(store);
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Global progress tracker
global.syncProgress = global.syncProgress || {};

// GET /api/tracking/progress
router.get('/progress', (req, res) => {
  const { store_id } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });
  res.json(global.syncProgress[store_id] || { status: 'idle', total: 0, processed: 0 });
});

// POST /api/tracking/sync-shopify - Shopify data only (new orders + refresh + costs)
router.post('/sync-shopify', async (req, res) => {
  const { store_id } = req.body;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });
  const store = getStore(store_id);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  global.syncProgress[store_id] = { status: 'Starting Shopify Sync...', processed: 0, total: 0 };

  const updateProgress = (stage, processed, total) => {
    if (global.syncProgress[store_id]) {
      const p = Number(processed) || 0;
      const t = Number(total) || 0;
      global.syncProgress[store_id] = { status: stage, processed: p, total: t };
      broadcast('sync_progress', { storeId: store_id, status: stage, processed: p, total: t });
    }
  };

  res.json({ success: true, message: 'Shopify sync started in background' });

  (async () => {
    try {
      const r1 = await fetchShopifyOrders(store, updateProgress);
      updateProgress('Refreshing Shopify Data & Costs', 0, 100);
      const r2 = await refreshShopifyUpdates(store, updateProgress);

      updateProgress('Sync Complete', 100, 100);
      saveSyncLog('Shopify Sync', (r1.total || 0), (r1.added || 0), (r1.failed || 0), [...(r1.logs || []), ...(r2.logs || [])]);
      setTimeout(() => { delete global.syncProgress[store_id]; }, 5000);
    } catch (e) {
      console.error(`Shopify sync error for ${store.shop_domain}: ${e.message}`);
      updateProgress(`Error: ${e.message}`, 0, 0);
      setTimeout(() => { delete global.syncProgress[store_id]; }, 10000);
    }
  })();
});

// POST /api/tracking/sync-couriers - Courier tracking only (PostEx + Instaworld)
router.post('/sync-couriers', async (req, res) => {
  const { store_id } = req.body;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });
  const store = getStore(store_id);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  global.syncProgress[store_id] = { status: 'Starting Courier Sync...', processed: 0, total: 0 };

  const updateProgress = (stage, processed, total) => {
    if (global.syncProgress[store_id]) {
      global.syncProgress[store_id] = { status: stage, processed, total };
      broadcast('sync_progress', { storeId: store_id, status: stage, processed, total });
    }
  };

  res.json({ success: true, message: 'Courier sync started in background' });

  (async () => {
    try {
      updateProgress('Syncing PostEx Tracking', 0, 100);
      const r1 = await syncPostEx(store, 'FULL', updateProgress);

      updateProgress('Syncing Instaworld Tracking', 0, 100);
      const r2 = await syncInstaworld(store, 'FULL', updateProgress);

      updateProgress('Sync Complete', 100, 100);
      saveSyncLog('Courier Sync', (r1.total || 0) + (r2.total || 0), (r1.updated || 0) + (r2.updated || 0), (r1.failed || 0) + (r2.failed || 0), [...(r1.logs || []), ...(r2.logs || [])]);
      setTimeout(() => { delete global.syncProgress[store_id]; }, 5000);
    } catch (e) {
      console.error(`Courier sync error for ${store.shop_domain}: ${e.message}`);
      updateProgress(`Error: ${e.message}`, 0, 0);
      setTimeout(() => { delete global.syncProgress[store_id]; }, 10000);
    }
  })();
});

// POST /api/tracking/sync-all - Full sync for a store (Shopify fetch + both couriers)
router.post('/sync-all', async (req, res) => {
  const { store_id } = req.body;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });
  const store = getStore(store_id);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  // Reset progress state
  global.syncProgress[store_id] = { status: 'Starting Sync...', processed: 0, total: 0 };

  const updateProgress = (stage, processed, total) => {
    if (global.syncProgress[store_id]) {
      global.syncProgress[store_id] = { status: stage, processed, total };
      broadcast('sync_progress', { storeId: store_id, status: stage, processed, total });
    }
  };

  res.json({ success: true, message: 'Sync started in background' });

  // Run in background (non-blocking)
  (async () => {
    try {
      updateProgress('Fetching Shopify (New Orders)', 0, 100);
      const r1 = await fetchShopifyOrders(store, updateProgress);
      
      updateProgress('Refreshing Shopify Updates', 0, 100);
      const r2 = await refreshShopifyUpdates(store, updateProgress);
      
      updateProgress('Syncing PostEx Tracking', 0, 100);
      const r3 = await syncPostEx(store, 'FULL', updateProgress);
      
      updateProgress('Syncing Instaworld Tracking', 0, 100);
      const r4 = await syncInstaworld(store, 'FULL', updateProgress);

      updateProgress('Sync Complete', 100, 100);
      saveSyncLog('Global Store Sync', 
        (r1.total || 0) + (r3.total || 0) + (r4.total || 0), 
        (r1.added || 0) + (r3.updated || 0) + (r4.updated || 0), 
        (r1.failed || 0) + (r3.failed || 0) + (r4.failed || 0), 
        [...(r1.logs || []), ...(r2.logs || []), ...(r3.logs || []), ...(r4.logs || [])]
      );
      setTimeout(() => { delete global.syncProgress[store_id]; }, 5000);
    } catch (e) {
      console.error(`Full sync error for ${store.shop_domain}: ${e.message}`);
      updateProgress(`Error: ${e.message}`, 0, 0);
      setTimeout(() => { delete global.syncProgress[store_id]; }, 10000);
    }
  })();
});

module.exports = router;
