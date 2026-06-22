const express = require('express');
const router = express.Router();
const db = require('../../db');
const fetch = typeof globalThis.fetch === 'function' ? globalThis.fetch : require('node-fetch');
const { broadcast } = require('../../sse');

// POST /api/orders/bulk-confirm - Bulk mark as ready for booking
router.post('/bulk-confirm', (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });

  try {
    const stmt = db.prepare("UPDATE orders SET delivery_status = 'Confirmed', status_date = datetime('now') WHERE id = ?");
    for (const id of ids) {
      const order = db.prepare('SELECT store_id, shopify_order_id FROM orders WHERE id = ?').get(id);
      stmt.run(id);
      if (order) {
        broadcast('order_updated', { storeId: order.store_id, shopifyOrderId: order.shopify_order_id });
      }
    }
    res.json({ success: true, count: ids.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/bulk-update-status - Generic bulk status update
router.post('/bulk-update-status', (req, res) => {
  const { ids, status } = req.body;
  if (!ids || !Array.isArray(ids) || !status) return res.status(400).json({ error: 'ids and status required' });

  // 🛡️ Final Status Permission Check
  const finalStatuses = ['delivered', 'return received'];
  const targetStatus = status.toLowerCase();
  const isFinal = finalStatuses.includes(targetStatus);
  const hasPermission = req.user?.role === 'admin' || req.user?.can_set_final_status === 1;
  
  if (isFinal && !hasPermission) {
    return res.status(403).json({ error: `You do not have permission to mark orders as "${status}". Only authorized users or Super Admins can set final statuses.` });
  }

  try {
    const stmt = db.prepare("UPDATE orders SET delivery_status = ?, status_date = datetime('now') WHERE id = ?");
    const today = new Date().toISOString().split('T')[0];
    const updatePL = db.prepare("UPDATE orders SET payment_date = ? WHERE id = ?");

    for (const id of ids) {
      const order = db.prepare('SELECT store_id, shopify_order_id FROM orders WHERE id = ?').get(id);
      stmt.run(status, id);
      
      const s = status.toLowerCase();
      if (s.includes('delivered')) {
        updatePL.run(today, id);
      } else if (s.includes('return') || s.includes('cancel')) {
        updatePL.run(null, id);
      }

      if (order) {
        broadcast('order_updated', { storeId: order.store_id, shopifyOrderId: order.shopify_order_id });
      }
    }
    res.json({ success: true, count: ids.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/bulk-revert - Bulk move back to Pending
router.post('/bulk-revert', (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });

  try {
    const stmt = db.prepare("UPDATE orders SET delivery_status = 'Pending', status_date = datetime('now') WHERE id = ?");
    for (const id of ids) {
      const order = db.prepare('SELECT store_id, shopify_order_id FROM orders WHERE id = ?').get(id);
      stmt.run(id);
      if (order) {
        broadcast('order_updated', { storeId: order.store_id, shopifyOrderId: order.shopify_order_id });
      }
    }
    res.json({ success: true, count: ids.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/bulk-book-postex
router.post('/bulk-book-postex', async (req, res) => {
  const { ids } = req.body;
  const { createPostExOrder } = require('../../engines/postex');
  const { fulfillShopifyOrder } = require('../../engines/shopify');
  const { getBestMatch } = require('../../engines/logistics');

  let success = 0, failed = 0;
  for (const id of ids) {
    try {
      const order = db.prepare('SELECT o.*, s.shop_domain, s.access_token, s.postex_token FROM orders o JOIN stores s ON o.store_id = s.id WHERE o.id = ?').get(id);
      if (!order || (order.tracking_number && order.tracking_number.trim() !== '')) continue;

      const matchedCity = getBestMatch(order.city, 'PostEx');
      if (matchedCity) order.city = matchedCity;

      const trackingNumber = await createPostExOrder(order, order);
      db.prepare("UPDATE orders SET tracking_number = ?, courier = ?, delivery_status = 'Booked', status_date = datetime('now') WHERE id = ?").run(trackingNumber, 'PostEx', id);
      
      try { await fulfillShopifyOrder(order, order.shopify_order_id, trackingNumber, 'PostEx'); } catch(e) {}
      broadcast('order_updated', { storeId: order.store_id, shopifyOrderId: order.shopify_order_id });
      success++;
    } catch (e) { failed++; }
  }
  res.json({ success: true, count: success, failed });
});

// POST /api/orders/bulk-sync-status
router.post('/bulk-sync-status', async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
  
  try {
    const firstOrder = db.prepare('SELECT store_id FROM orders WHERE id = ?').get(ids[0]);
    if (!firstOrder) throw new Error('No orders found');
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(firstOrder.store_id);
    const storeId = store.id;

    // Activate global Topbar capsule
    global.syncProgress = global.syncProgress || {};
    global.syncProgress[storeId] = { status: 'Bulk Shopify Status Sync...', processed: 0, total: ids.length };
    broadcast('sync_progress', { storeId, status: 'Bulk Shopify Status Sync...', processed: 0, total: ids.length });

    let updatedCount = 0;
    const batchSize = 50;
    
    for (let i = 0; i < ids.length; i += batchSize) {
      if (global.syncProgress && global.syncProgress[storeId] && global.syncProgress[storeId].abort) {
        console.log(`🛑 Bulk Shopify Sync aborted by user`);
        break;
      }

      const batchIds = ids.slice(i, i + batchSize);
      const ordersToSync = db.prepare(`SELECT shopify_order_id FROM orders WHERE id IN (${batchIds.map(() => '?').join(',')})`).all(...batchIds);
      const shopifyIds = ordersToSync.map(o => o.shopify_order_id);
      
      const { syncSpecificOrders } = require('../../engines/shopify');
      const count = await syncSpecificOrders(store, shopifyIds);
      updatedCount += count;

      const p = Math.min(i + batchSize, ids.length);
      global.syncProgress[storeId] = { status: `Syncing batch ${Math.ceil(p/batchSize)}...`, processed: p, total: ids.length };
      broadcast('sync_progress', { storeId, status: `Syncing batch ${Math.ceil(p/batchSize)}...`, processed: p, total: ids.length });
    }

    global.syncProgress[storeId] = { status: 'Sync Complete', processed: ids.length, total: ids.length };
    broadcast('sync_progress', { storeId, status: 'Sync Complete', processed: ids.length, total: ids.length });
    setTimeout(() => { if (global.syncProgress) delete global.syncProgress[storeId]; }, 5000);

    try {
      db.prepare('INSERT INTO sync_history (type, total, success, failed, log_data) VALUES (?, ?, ?, ?, ?)').run(
        'Bulk Shopify Sync', ids.length, updatedCount, 0, JSON.stringify([])
      );
      db.prepare("DELETE FROM sync_history WHERE created_at < datetime('now', '+5 hours', '-3 days')").run();
      broadcast('sync_history_updated', { type: 'Bulk Shopify Sync' });
    } catch(e) {}

    res.json({ success: true, count: updatedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/bulk-sync-courier
router.post('/bulk-sync-courier', async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });

  const { syncSpecificCourierOrders } = require('../../engines/tracking');
  
  try {
    const firstOrder = db.prepare('SELECT store_id FROM orders WHERE id = ?').get(ids[0]);
    if (!firstOrder) throw new Error('No orders found');
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(firstOrder.store_id);
    const storeId = store.id;

    global.syncProgress = global.syncProgress || {};
    global.syncProgress[storeId] = { status: 'Bulk Courier Sync...', processed: 0, total: ids.length };
    broadcast('sync_progress', { storeId, status: 'Bulk Courier Sync...', processed: 0, total: ids.length });

    const { updatedCount, logs } = await syncSpecificCourierOrders(store, ids, (current, total, message) => {
      const p = Number(current) || 0;
      const t = Number(total) || 0;
      global.syncProgress[storeId] = { status: message || 'Syncing...', processed: p, total: t };
      broadcast('sync_progress', { storeId, status: message || 'Syncing...', processed: p, total: t });
    });

    global.syncProgress[storeId] = { status: 'Sync Complete', processed: ids.length, total: ids.length };
    broadcast('sync_progress', { storeId, status: 'Sync Complete', processed: ids.length, total: ids.length });
    setTimeout(() => { if (global.syncProgress) delete global.syncProgress[storeId]; }, 5000);

    try {
      db.prepare('INSERT INTO sync_history (type, total, success, failed, log_data) VALUES (?, ?, ?, ?, ?)').run(
        'Bulk Courier Sync', ids.length, updatedCount, ids.length - updatedCount, JSON.stringify(logs || [])
      );
      db.prepare("DELETE FROM sync_history WHERE created_at < datetime('now', '+5 hours', '-3 days')").run();
      broadcast('sync_history_updated', { type: 'Bulk Courier Sync' });
    } catch(e) {}

    res.json({ success: true, count: updatedCount });
  } catch (err) {
    const storeId = db.prepare('SELECT store_id FROM orders WHERE id = ?').get(ids[0])?.store_id;
    if (storeId && global.syncProgress) delete global.syncProgress[storeId];
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/bulk-book-instaworld
router.post('/bulk-book-instaworld', async (req, res) => {
  const { ids, courier_name } = req.body;
  const { createInstaworldOrder } = require('../../engines/instaworld');
  const { fulfillShopifyOrder } = require('../../engines/shopify');
  const { getBestMatch } = require('../../engines/logistics');

  let success = 0, failed = 0;
  for (const id of ids) {
    try {
      const order = db.prepare('SELECT o.*, s.shop_domain, s.access_token, s.instaworld_key, s.instaworld_key_backup FROM orders o JOIN stores s ON o.store_id = s.id WHERE o.id = ?').get(id);
      if (!order || (order.tracking_number && order.tracking_number.trim() !== '')) continue;

      const matchedCity = getBestMatch(order.city, 'Instaworld');
      if (matchedCity) order.city = matchedCity;

      const trackingNumber = await createInstaworldOrder(order, order, courier_name);
      db.prepare("UPDATE orders SET tracking_number = ?, courier = ?, delivery_status = 'Booked', status_date = datetime('now') WHERE id = ?").run(trackingNumber, courier_name, id);
      
      try { await fulfillShopifyOrder(order, order.shopify_order_id, trackingNumber, courier_name); } catch(e) {}
      broadcast('order_updated', { storeId: order.store_id, shopifyOrderId: order.shopify_order_id });
      success++;
    } catch (e) { failed++; }
  }
  res.json({ success: true, count: success, failed });
});

module.exports = router;
