const express = require('express');
const router = express.Router();
const db = require('../db');
const { syncPostEx, syncInstaworld } = require('../engines/tracking');
const { fetchShopifyOrders, refreshShopifyUpdates } = require('../engines/shopify');

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

// POST /api/tracking/sync-all - Full sync for a store (Shopify fetch + both couriers)
router.post('/sync-all', async (req, res) => {
  const { store_id } = req.body;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });
  const store = getStore(store_id);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  res.json({ success: true, message: 'Sync started in background' });

  // Run in background (non-blocking)
  (async () => {
    try {
      await fetchShopifyOrders(store);
      await refreshShopifyUpdates(store);
      await syncPostEx(store, 'FULL');
      await syncInstaworld(store, 'FULL');
    } catch (e) {
      console.error(`Full sync error for ${store.shop_domain}: ${e.message}`);
    }
  })();
});

module.exports = router;
