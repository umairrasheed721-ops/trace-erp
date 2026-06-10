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
  
  try {
    const row = db.prepare("SELECT sync_type, error_details FROM sync_journal WHERE store_id = ? AND order_id = 'METADATA' AND (status = 'ACTIVE' OR status = 'SYNCING') ORDER BY id DESC LIMIT 1").get(store_id);
    if (row) {
      const details = JSON.parse(row.error_details || '{}');
      return res.json({
        status: details.status || 'Syncing...',
        processed: Number(details.processed) || 0,
        total: Number(details.total) || 0,
        sync_type: row.sync_type
      });
    }
  } catch (err) {
    console.error('Failed to get progress from sync_journal:', err.message);
  }

  res.json(global.syncProgress[store_id] || { status: 'idle', total: 0, processed: 0 });
});

// POST /api/tracking/cancel-sync
router.post('/cancel-sync', (req, res) => {
  const { store_id } = req.body;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });
  
  global.syncProgress = global.syncProgress || {};
  global.syncProgress[store_id] = global.syncProgress[store_id] || {};
  global.syncProgress[store_id].abort = true;

  try {
    db.prepare("UPDATE sync_journal SET status = 'ABORTED' WHERE store_id = ? AND order_id = 'METADATA'").run(store_id);
  } catch (e) {}
  
  res.json({ success: true, message: 'Cancellation signal sent.' });
});

// POST /api/tracking/sync-shopify - Shopify data only (new orders + refresh + costs)
router.post('/sync-shopify', async (req, res) => {
  const { store_id } = req.body;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });
  const store = getStore(store_id);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  global.syncProgress[store_id] = { status: 'Starting Shopify Sync...', processed: 0, total: 0, abort: false };

  const { runShopifySyncWithJournal } = require('../engines/shopify_sync');
  const tenantId = req.tenantId || 'default';

  try {
    const syncPromise = new Promise(async (resolve, reject) => {
      try {
        const tenantContext = require('../tenant-context');
        await tenantContext.run(tenantId, async () => {
          const result = await runShopifySyncWithJournal(store);
          resolve(result);
        });
      } catch (err) {
        reject(err);
      }
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Shopify sync request timed out')), 35000)
    );

    const result = await Promise.race([syncPromise, timeoutPromise]);
    res.json({ success: true, ...result });
  } catch (e) {
    console.error(`Shopify sync error for ${store.shop_domain}: ${e.message}`);
    res.status(500).json({ error: e.message || 'Sync failed' });
  } finally {
    delete global.syncProgress[store_id];
  }
});

// POST /api/tracking/sync-couriers - Courier tracking only (PostEx + Instaworld)
router.post('/sync-couriers', async (req, res) => {
  const { store_id } = req.body;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });
  const store = getStore(store_id);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  global.syncProgress[store_id] = { status: 'Starting Courier Sync...', processed: 0, total: 0, abort: false };

  const { runCourierSyncWithJournal } = require('../engines/courier_sync');
  const tenantId = req.tenantId || 'default';

  try {
    const syncPromise = new Promise(async (resolve, reject) => {
      try {
        const tenantContext = require('../tenant-context');
        await tenantContext.run(tenantId, async () => {
          const result = await runCourierSyncWithJournal(store);
          resolve(result);
        });
      } catch (err) {
        reject(err);
      }
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Courier sync request timed out')), 35000)
    );

    const result = await Promise.race([syncPromise, timeoutPromise]);
    res.json({ success: true, ...result });
  } catch (e) {
    console.error(`Courier sync error for ${store.shop_domain}: ${e.message}`);
    res.status(500).json({ error: e.message || 'Sync failed' });
  } finally {
    delete global.syncProgress[store_id];
  }
});

// POST /api/tracking/sync-all - Full sync for a store (Shopify fetch + both couriers)
router.post('/sync-all', async (req, res) => {
  const { store_id } = req.body;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });
  const store = getStore(store_id);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  // Reset progress state
  global.syncProgress[store_id] = { status: 'Starting Sync...', processed: 0, total: 0, abort: false };

  const updateProgress = (stage, processed, total) => {
    if (global.syncProgress[store_id]) {
      global.syncProgress[store_id] = { status: stage, processed, total, abort: global.syncProgress[store_id].abort || false };
      broadcast('sync_progress', { storeId: store_id, status: stage, processed, total });
    }
  };

  res.json({ success: true, message: 'Sync started in background' });
  const tenantId = req.tenantId || 'default';

  // Run in background (non-blocking)
  (async () => {
    try {
      const tenantContext = require('../tenant-context');
      await tenantContext.run(tenantId, async () => {
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
      });
      setTimeout(() => { delete global.syncProgress[store_id]; }, 5000);
    } catch (e) {
      console.error(`Full sync error for ${store.shop_domain}: ${e.message}`);
      updateProgress(`Error: ${e.message}`, 0, 0);
      setTimeout(() => { delete global.syncProgress[store_id]; }, 10000);
    }
  })();
});

module.exports = router;
