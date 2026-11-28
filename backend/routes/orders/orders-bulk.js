const express = require('express');
const router = express.Router();
const db = require('../../db');
const fetch = typeof globalThis.fetch === 'function' ? globalThis.fetch : require('node-fetch');
const { broadcast } = require('../../sse');

// POST /api/orders/bulk-confirm - Bulk mark as Confirmed + sync "Ready to Book" tag to Shopify (enforces Zero-Cost Guard)
router.post('/bulk-confirm', async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });

  try {
    const { READY_TO_BOOK_TAG, mergeOrderTagString, updateShopifyOrderTag } = require('../../engines/shopify');
    const stmt = db.prepare("UPDATE orders SET delivery_status = 'Confirmed', tags = ?, status_date = datetime('now') WHERE id = ?");
    const updateTagOnly = db.prepare('UPDATE orders SET tags = ? WHERE id = ?');
    let confirmedCount = 0;
    let skippedZeroCost = 0;
    let shopifySynced = 0;
    const confirmedIds = [];

    for (const id of ids) {
      const order = db.prepare(`
        SELECT o.id, o.store_id, o.shopify_order_id, o.cost, o.tags, s.shop_domain, s.access_token
        FROM orders o LEFT JOIN stores s ON o.store_id = s.id
        WHERE o.id = ?
      `).get(id);
      if (!order) continue;
      if (!order.cost || Number(order.cost) <= 0) {
        skippedZeroCost++;
        continue;
      }

      const { tags: localTags } = mergeOrderTagString(order.tags, READY_TO_BOOK_TAG, 'add');
      stmt.run(localTags, id);
      confirmedCount++;
      confirmedIds.push(id);

      if (order.shopify_order_id && order.shop_domain && order.access_token) {
        const tagRes = await updateShopifyOrderTag(order, order.shopify_order_id, READY_TO_BOOK_TAG, 'add');
        if (tagRes.ok) {
          shopifySynced++;
          if (tagRes.tags !== undefined) updateTagOnly.run(tagRes.tags, id);
        }
        await new Promise(r => setTimeout(r, 120));
      }

      broadcast('order_updated', { storeId: order.store_id, shopifyOrderId: order.shopify_order_id });
    }
    res.json({ success: true, count: confirmedCount, skippedZeroCost, shopifySynced, confirmedIds });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/bulk-update-status - Generic bulk status update
router.post('/bulk-update-status', (req, res) => {
  const { ids, tracking_numbers, status } = req.body;
  if ((!ids && !tracking_numbers) || !status) return res.status(400).json({ error: 'ids or tracking_numbers and status required' });

  // 🛡️ Final Status Permission Check
  const finalStatuses = ['delivered', 'return received'];
  const targetStatus = status.toLowerCase();
  const isFinal = finalStatuses.includes(targetStatus);
  const hasPermission = req.user?.role === 'admin' || req.user?.can_set_final_status === 1;
  
  if (isFinal && !hasPermission) {
    return res.status(403).json({ error: `You do not have permission to mark orders as "${status}". Only authorized users or Super Admins can set final statuses.` });
  }

  try {
    let targetIds = Array.isArray(ids) ? ids : [];
    if (!targetIds.length && Array.isArray(tracking_numbers) && tracking_numbers.length > 0) {
      const placeholders = tracking_numbers.map(() => '?').join(',');
      const rows = db.prepare(`SELECT id FROM orders WHERE tracking_number IN (${placeholders})`).all(...tracking_numbers);
      targetIds = rows.map(r => r.id);
    }

    if (!targetIds.length) {
      return res.json({ success: true, count: 0 });
    }

    const stmt = db.prepare("UPDATE orders SET delivery_status = ?, status_date = datetime('now') WHERE id = ?");
    const today = new Date().toISOString().split('T')[0];
    const updatePL = db.prepare("UPDATE orders SET payment_date = ? WHERE id = ?");

    const runBulkUpdate = db.transaction((idList) => {
      let updatedCount = 0;
      for (const id of idList) {
        const order = db.prepare('SELECT store_id, shopify_order_id, cost FROM orders WHERE id = ?').get(id);
        if (!order) continue;

        if ((targetStatus === 'confirmed' || targetStatus === 'booked') && (!order.cost || order.cost <= 0)) {
          continue; // Skip orders with missing costs during bulk updates to prevent leaks
        }

        stmt.run(status, id);
        updatedCount++;
        
        const s = status.toLowerCase();
        if (s.includes('delivered')) {
          updatePL.run(today, id);
        } else if (s.includes('return') || s.includes('cancel')) {
          updatePL.run(null, id);
        }

        broadcast('order_updated', { storeId: order.store_id, shopifyOrderId: order.shopify_order_id });
      }
      return updatedCount;
    });

    const updatedCount = runBulkUpdate(targetIds);
    res.json({ success: true, count: updatedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/bulk-revert - Bulk move untracked orders back to Pending + remove "Ready to Book" tag on Shopify
router.post('/bulk-revert', async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });

  try {
    const { READY_TO_BOOK_TAG, mergeOrderTagString, updateShopifyOrderTag } = require('../../engines/shopify');
    const stmt = db.prepare("UPDATE orders SET delivery_status = 'Pending', tags = ?, status_date = datetime('now') WHERE id = ?");
    const updateTagOnly = db.prepare('UPDATE orders SET tags = ? WHERE id = ?');
    let count = 0;
    let skippedTracked = 0;
    let shopifySynced = 0;

    for (const id of ids) {
      const order = db.prepare(`
        SELECT o.id, o.store_id, o.shopify_order_id, o.tracking_number, o.tags, s.shop_domain, s.access_token
        FROM orders o LEFT JOIN stores s ON o.store_id = s.id
        WHERE o.id = ?
      `).get(id);
      if (!order) continue;
      if (order.tracking_number && String(order.tracking_number).trim() !== '') {
        skippedTracked++;
        continue;
      }

      const { tags: localTags } = mergeOrderTagString(order.tags, READY_TO_BOOK_TAG, 'remove');
      stmt.run(localTags, id);
      count++;

      if (order.shopify_order_id && order.shop_domain && order.access_token) {
        const tagRes = await updateShopifyOrderTag(order, order.shopify_order_id, READY_TO_BOOK_TAG, 'remove');
        if (tagRes.ok) {
          shopifySynced++;
          if (tagRes.tags !== undefined) updateTagOnly.run(tagRes.tags, id);
        }
        await new Promise(r => setTimeout(r, 120));
      }

      broadcast('order_updated', { storeId: order.store_id, shopifyOrderId: order.shopify_order_id });
    }
    res.json({ success: true, count, skippedTracked, shopifySynced });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/bulk-book-postex
router.post('/bulk-book-postex', async (req, res) => {
  const { ids, pickup_address_code = '', default_remarks = '', per_order_remarks = {}, per_order_cod = {} } = req.body || {};
  const { createPostExOrder } = require('../../engines/postex');
  const { fulfillShopifyOrder } = require('../../engines/shopify');
  const { getBestMatch } = require('../../engines/logistics');

  let success = 0, failed = 0;
  for (const id of ids) {
    try {
      const order = db.prepare('SELECT o.*, s.shop_domain, s.access_token, s.postex_token, s.postex_pickup_code, s.default_courier_remarks FROM orders o JOIN stores s ON o.store_id = s.id WHERE o.id = ?').get(id);
      if (!order || (order.tracking_number && order.tracking_number.trim() !== '')) { failed++; continue; }
      if (!order.cost || Number(order.cost) <= 0 || !order.city || order.city.trim() === '') { failed++; continue; }

      const matchedCity = getBestMatch(order.city, 'PostEx');
      if (matchedCity) order.city = matchedCity;
      const originalPrice = parseFloat(order.price) || 0;
      const isPrepaid = ['paid', 'payment posted'].includes((order.payment_status || '').toLowerCase());
      const idKey = String(id);
      const rawCustomCod = Object.prototype.hasOwnProperty.call(per_order_cod || {}, idKey) ? per_order_cod[idKey] : undefined;
      const hasCustomCod = rawCustomCod !== undefined && rawCustomCod !== null && String(rawCustomCod).trim() !== '' && Number.isFinite(Number(rawCustomCod)) && Number(rawCustomCod) >= 0;
      const finalCod = hasCustomCod ? Math.round(Number(rawCustomCod) * 100) / 100 : (isPrepaid ? 0 : originalPrice);
      const bookedCodToSave = hasCustomCod && Math.abs(finalCod - originalPrice) > 0.01 ? finalCod : null;
      const bookingOrder = { ...order, price: finalCod, is_prepaid: finalCod === 0 };

      const resolvedRemarks = String(
        Object.prototype.hasOwnProperty.call(per_order_remarks || {}, idKey)
          ? per_order_remarks[idKey]
          : (order.courier_remarks || default_remarks || order.default_courier_remarks || '')
      ).trim();
      const resolvedPickup = String(pickup_address_code || order.pickup_address_code || order.postex_pickup_code || '').trim();

      const trackingNumber = await createPostExOrder(order, bookingOrder, {
        pickupAddressCode: resolvedPickup,
        remarks: resolvedRemarks,
        codAmount: finalCod,
      });
      db.prepare(`
        UPDATE orders
        SET tracking_number = ?, courier = ?, delivery_status = 'Booked',
            courier_remarks = ?, pickup_address_code = ?, booked_cod_amount = ?, status_date = datetime('now')
        WHERE id = ?
      `).run(trackingNumber, 'PostEx', resolvedRemarks, resolvedPickup, bookedCodToSave, id);
      try {
        const { allocateOrderFifoOnDispatch } = require('../../services/poLedgerService');
        allocateOrderFifoOnDispatch(id, req.user?.username || 'BulkPostEx');
      } catch (_) {}
      try { await fulfillShopifyOrder(order, order.shopify_order_id, trackingNumber, 'PostEx'); } catch(e) {}
      try { require('../../services/readyTagSync').clearReadyTagAfterBooking(id); } catch (_) {}
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
  const { ids, courier_name, per_order_cod = {} } = req.body || {};
  const { createInstaworldOrder } = require('../../engines/instaworld');
  const { fulfillShopifyOrder } = require('../../engines/shopify');
  const { getBestMatch } = require('../../engines/logistics');

  let success = 0, failed = 0;
  for (const id of ids) {
    try {
      const order = db.prepare('SELECT o.*, s.shop_domain, s.access_token, s.instaworld_key, s.instaworld_key_backup FROM orders o JOIN stores s ON o.store_id = s.id WHERE o.id = ?').get(id);
      if (!order || (order.tracking_number && order.tracking_number.trim() !== '')) { failed++; continue; }
      if (!order.cost || Number(order.cost) <= 0 || !order.city || order.city.trim() === '') { failed++; continue; }

      const matchedCity = getBestMatch(order.city, 'Instaworld');
      if (matchedCity) order.city = matchedCity;
      const originalPrice = parseFloat(order.price) || 0;
      const isPrepaid = ['paid', 'payment posted'].includes((order.payment_status || '').toLowerCase());
      const idKey = String(id);
      const rawCustomCod = Object.prototype.hasOwnProperty.call(per_order_cod || {}, idKey) ? per_order_cod[idKey] : undefined;
      const hasCustomCod = rawCustomCod !== undefined && rawCustomCod !== null && String(rawCustomCod).trim() !== '' && Number.isFinite(Number(rawCustomCod)) && Number(rawCustomCod) >= 0;
      const finalCod = hasCustomCod ? Math.round(Number(rawCustomCod) * 100) / 100 : (isPrepaid ? 0 : originalPrice);
      const bookedCodToSave = hasCustomCod && Math.abs(finalCod - originalPrice) > 0.01 ? finalCod : null;
      const bookingOrder = { ...order, price: finalCod, is_prepaid: finalCod === 0 };

      const trackingNumber = await createInstaworldOrder(order, bookingOrder, courier_name, null, { codAmount: finalCod });
      db.prepare("UPDATE orders SET tracking_number = ?, courier = ?, delivery_status = 'Booked', booked_cod_amount = ?, status_date = datetime('now') WHERE id = ?").run(trackingNumber, courier_name, bookedCodToSave, id);
      try {
        const { allocateOrderFifoOnDispatch } = require('../../services/poLedgerService');
        allocateOrderFifoOnDispatch(id, req.user?.username || 'BulkInstaworld');
      } catch (_) {}
      try { require('../../services/readyTagSync').clearReadyTagAfterBooking(id); } catch (_) {}
      
      try { await fulfillShopifyOrder(order, order.shopify_order_id, trackingNumber, courier_name); } catch(e) {}
      broadcast('order_updated', { storeId: order.store_id, shopifyOrderId: order.shopify_order_id });
      success++;
    } catch (e) { failed++; }
  }
  res.json({ success: true, count: success, failed });
});

// GET /api/orders/ready-tag/preview - Admin dry-run scan of Shopify "Ready to Book" tags on fulfilled/unfulfilled orders
router.get('/ready-tag/preview', async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  try {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 90);
    const scope = String(req.query.scope || 'current').toLowerCase();
    const storeId = parseInt(req.query.store_id, 10) || null;
    const storeIds = scope === 'all' ? null : (storeId ? [storeId] : null);

    const { previewHistoricalCleanup } = require('../../services/readyTagSync');
    const preview = await previewHistoricalCleanup({ storeIds, days });
    res.json({ success: true, ...preview });
  } catch (err) {
    console.error('[ReadyTagPreview] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/ready-tag/cleanup - Admin background cleanup removing stale "Ready to Book" tags on Shopify + ERP
router.post('/ready-tag/cleanup', async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  try {
    const days = Math.min(Math.max(parseInt(req.body?.days, 10) || 30, 1), 90);
    const scope = String(req.body?.scope || 'current').toLowerCase();
    const storeId = parseInt(req.body?.store_id, 10) || null;
    const storeIds = scope === 'all' ? null : (storeId ? [storeId] : null);

    const tenantContext = require('../../tenant-context');
    const tenantId = tenantContext.getStore() || 'default';
    const actor = req.user?.username || 'Admin';

    res.status(202).json({
      success: true,
      message: `Background "Ready to Book" tag cleanup started (last ${days} days). Track progress in the top bar.`
    });

    setImmediate(() => {
      tenantContext.run(tenantId, () => {
        const { runHistoricalCleanup } = require('../../services/readyTagSync');
        runHistoricalCleanup({ storeIds, days, actor }).catch(err => {
          console.error('[ReadyTagCleanup] Background error:', err.message);
        });
      });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
