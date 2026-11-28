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
      try {
        await fulfillShopifyOrder(order, order.shopify_order_id, trackingNumber, 'PostEx');
        db.prepare("UPDATE orders SET fulfillment_status = 'fulfilled' WHERE id = ?").run(id);
      } catch(e) {}
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
      
      try {
        await fulfillShopifyOrder(order, order.shopify_order_id, trackingNumber, courier_name);
        db.prepare("UPDATE orders SET fulfillment_status = 'fulfilled' WHERE id = ?").run(id);
      } catch(e) {}
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

// POST /api/orders/pick-list - Consolidated SKU-Wise Warehouse Pick-List for selected orders
router.post('/pick-list', (req, res) => {
  try {
    const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const ids = [...new Set(rawIds.map(x => Number(x)).filter(n => Number.isFinite(n) && n > 0))].slice(0, 500);
    if (ids.length === 0) return res.status(400).json({ error: 'ids array required' });

    const placeholders = ids.map(() => '?').join(',');
    const orders = db.prepare(`
      SELECT o.id, o.store_id, o.ref_number, o.shopify_order_id, o.customer_name,
             o.delivery_status, o.product_titles, o.line_items, o.items_count,
             s.store_name, s.shop_domain
      FROM orders o
      LEFT JOIN stores s ON o.store_id = s.id
      WHERE o.id IN (${placeholders})
      ORDER BY o.id DESC
    `).all(...ids);

    if (orders.length === 0) return res.status(404).json({ error: 'No matching orders found' });

    const storeIds = [...new Set(orders.map(o => o.store_id).filter(Boolean))];
    const byVariant = new Map();
    const bySku = new Map();
    const byTitleVar = new Map();

    if (storeIds.length > 0) {
      const sPh = storeIds.map(() => '?').join(',');
      const pmcRows = db.prepare(`
        SELECT store_id, shopify_variant_id, sku, parent_title, variant_title, image_url,
               COALESCE(inventory_qty, 0) AS available_qty,
               COALESCE(on_hand_qty, COALESCE(inventory_qty, 0) + COALESCE(committed_qty, 0)) AS on_hand_qty
        FROM product_master_costs
        WHERE store_id IN (${sPh})
      `).all(...storeIds);

      for (const r of pmcRows) {
        const rawVid = String(r.shopify_variant_id || '').trim();
        const numVid = rawVid.includes('/') ? rawVid.split('/').pop() : rawVid;
        if (numVid) byVariant.set(`${r.store_id}:${numVid}`, r);
        const normSku = String(r.sku || '').trim().toLowerCase();
        if (normSku) bySku.set(`${r.store_id}:${normSku}`, r);
        const pKey = String(r.parent_title || '').trim().toLowerCase();
        const vKey = String(r.variant_title || '').trim().toLowerCase();
        if (pKey) byTitleVar.set(`${r.store_id}:${pKey}|||${vKey}`, r);
      }
    }

    const bucketMap = new Map();
    let totalUnits = 0;

    const addItem = (ord, { title, variantTitle, sku, variantId, qty, imageUrl }) => {
      const cleanQty = Math.max(0, Number(qty) || 0);
      if (cleanQty <= 0) return;

      const cleanTitle = String(title || 'Item').trim();
      const rawVar = String(variantTitle || '').trim();
      const cleanVar = rawVar === 'Default Title' ? '' : rawVar;
      const numVid = String(variantId || '').includes('/') ? String(variantId).split('/').pop() : String(variantId || '').trim();
      const cleanSku = String(sku || '').trim();

      const pmc = (numVid && byVariant.get(`${ord.store_id}:${numVid}`))
        || (cleanSku && bySku.get(`${ord.store_id}:${cleanSku.toLowerCase()}`))
        || byTitleVar.get(`${ord.store_id}:${cleanTitle.toLowerCase()}|||${cleanVar.toLowerCase()}`)
        || null;

      const finalSku = cleanSku || pmc?.sku || '';
      const finalTitle = pmc?.parent_title || cleanTitle;
      const finalVar = cleanVar || (pmc?.variant_title && pmc.variant_title !== 'Default Title' ? pmc.variant_title : '');
      const key = finalSku
        ? `sku:${finalSku.toLowerCase()}`
        : (numVid ? `vid:${numVid}` : `name:${finalTitle.toLowerCase()}|||${finalVar.toLowerCase()}`);

      let entry = bucketMap.get(key);
      if (!entry) {
        entry = {
          key,
          title: finalTitle,
          variant_title: finalVar || 'Default',
          sku: finalSku,
          image_url: imageUrl || pmc?.image_url || null,
          available_qty: pmc ? Number(pmc.available_qty) : null,
          on_hand_qty: pmc ? Number(pmc.on_hand_qty) : null,
          total_qty: 0,
          order_refs: [],
          _refSet: new Set(),
        };
        bucketMap.set(key, entry);
      }
      if (!entry.image_url && (imageUrl || pmc?.image_url)) entry.image_url = imageUrl || pmc?.image_url;
      entry.total_qty += cleanQty;
      totalUnits += cleanQty;
      const refLabel = ord.ref_number || `#${ord.id}`;
      if (!entry._refSet.has(refLabel)) {
        entry._refSet.add(refLabel);
        entry.order_refs.push({ ref: refLabel, qty: cleanQty, id: ord.id });
      } else {
        const existingRef = entry.order_refs.find(r => r.ref === refLabel);
        if (existingRef) existingRef.qty += cleanQty;
      }
    };

    for (const ord of orders) {
      let parsedItems = [];
      try {
        if (ord.line_items) {
          const arr = JSON.parse(ord.line_items);
          if (Array.isArray(arr)) parsedItems = arr;
        }
      } catch (_) {}

      if (parsedItems.length > 0) {
        for (const li of parsedItems) {
          if (!li) continue;
          const qty = li.current_quantity !== undefined && li.current_quantity !== null
            ? Number(li.current_quantity)
            : Number(li.quantity || 0);
          if (qty <= 0) continue;
          addItem(ord, {
            title: li.title || li.name || 'Item',
            variantTitle: li.variant_title || '',
            sku: li.sku || '',
            variantId: li.variant_id || li.shopify_variant_id || '',
            qty,
            imageUrl: li.image_url || null,
          });
        }
      } else if (ord.product_titles) {
        const parts = String(ord.product_titles).split(/,\s*(?=[^)]*(?:\(|$))/).filter(Boolean);
        for (const part of parts) {
          const m = part.match(/^(.*?)(?:\s*\(x(\d+)\))?$/i);
          const rawName = (m?.[1] || part).trim();
          const qty = m?.[2] ? parseInt(m[2], 10) : 1;
          const dashIdx = rawName.lastIndexOf(' - ');
          const title = dashIdx > 0 ? rawName.slice(0, dashIdx).trim() : rawName;
          const variantTitle = dashIdx > 0 ? rawName.slice(dashIdx + 3).trim() : '';
          addItem(ord, { title, variantTitle, sku: '', variantId: '', qty, imageUrl: null });
        }
      }
    }

    const items = Array.from(bucketMap.values())
      .map(({ _refSet, ...rest }) => ({
        ...rest,
        order_count: rest.order_refs.length,
        stock_shortfall: rest.available_qty !== null ? Math.max(0, rest.total_qty - rest.available_qty) : 0,
      }))
      .sort((a, b) => (b.total_qty - a.total_qty) || a.title.localeCompare(b.title));

    res.json({
      success: true,
      summary: {
        totalOrders: orders.length,
        totalUnits,
        uniqueSkus: items.length,
        storeName: orders[0]?.store_name || orders[0]?.shop_domain || 'TRACE Store',
        generatedAt: new Date().toISOString(),
      },
      items,
      orders: orders.map(o => ({ id: o.id, ref_number: o.ref_number || `#${o.id}`, customer_name: o.customer_name, delivery_status: o.delivery_status })),
    });
  } catch (err) {
    console.error('[PickList] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/bulk-retry-fulfillment - Retry pushing tracking to Shopify for tracked orders still Unfulfilled
router.post('/bulk-retry-fulfillment', async (req, res) => {
  const { fulfillShopifyOrder } = require('../../engines/shopify');
  try {
    const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const storeId = req.body?.store_id ? Number(req.body.store_id) : null;
    const ids = [...new Set(rawIds.map(x => Number(x)).filter(n => Number.isFinite(n) && n > 0))].slice(0, 100);

    let targets = [];
    if (ids.length > 0) {
      const ph = ids.map(() => '?').join(',');
      targets = db.prepare(`
        SELECT o.*, s.shop_domain, s.access_token
        FROM orders o JOIN stores s ON o.store_id = s.id
        WHERE o.id IN (${ph})
      `).all(...ids);
    } else if (storeId) {
      targets = db.prepare(`
        SELECT o.*, s.shop_domain, s.access_token
        FROM orders o JOIN stores s ON o.store_id = s.id
        WHERE o.store_id = ?
          AND o.tracking_number IS NOT NULL AND TRIM(o.tracking_number) NOT IN ('', '—')
          AND LOWER(COALESCE(o.delivery_status, '')) != 'cancelled'
          AND LOWER(COALESCE(o.fulfillment_status, 'unfulfilled')) IN ('', 'unfulfilled', 'partial')
        ORDER BY o.id DESC
        LIMIT 50
      `).all(storeId);
    } else {
      return res.status(400).json({ error: 'ids or store_id required' });
    }

    let fulfilled = 0;
    let alreadyFulfilled = 0;
    let skipped = 0;
    let failed = 0;
    const details = [];

    for (const order of targets) {
      const ref = order.ref_number || `#${order.id}`;
      const track = String(order.tracking_number || '').trim();
      if (!track || track === '—') {
        skipped++;
        details.push({ id: order.id, ref_number: ref, status: 'skipped', message: 'No tracking number assigned' });
        continue;
      }
      if (!order.shopify_order_id || !order.shop_domain || !order.access_token) {
        skipped++;
        details.push({ id: order.id, ref_number: ref, status: 'skipped', message: 'Missing Shopify order ID or store token' });
        continue;
      }

      try {
        await fulfillShopifyOrder(order, order.shopify_order_id, track, order.courier || 'PostEx');
        db.prepare("UPDATE orders SET fulfillment_status = 'fulfilled' WHERE id = ?").run(order.id);
        try { require('../../services/readyTagSync').clearReadyTagAfterBooking(order.id); } catch (_) {}
        broadcast('order_updated', { storeId: order.store_id, shopifyOrderId: order.shopify_order_id });
        fulfilled++;
        details.push({ id: order.id, ref_number: ref, tracking_number: track, status: 'fulfilled', message: 'Fulfilled on Shopify' });
      } catch (err) {
        const msg = String(err?.message || 'Shopify fulfillment error');
        if (/already\s+fulfilled|no\s+fulfillable|no\s+open\s+fulfillment/i.test(msg)) {
          db.prepare("UPDATE orders SET fulfillment_status = 'fulfilled' WHERE id = ?").run(order.id);
          try { require('../../services/readyTagSync').clearReadyTagAfterBooking(order.id); } catch (_) {}
          broadcast('order_updated', { storeId: order.store_id, shopifyOrderId: order.shopify_order_id });
          alreadyFulfilled++;
          details.push({ id: order.id, ref_number: ref, tracking_number: track, status: 'already_fulfilled', message: 'Already fulfilled on Shopify (ERP synced)' });
        } else {
          failed++;
          details.push({ id: order.id, ref_number: ref, tracking_number: track, status: 'failed', message: msg });
        }
      }
      await new Promise(r => setTimeout(r, 220));
    }

    res.json({ success: true, total: targets.length, fulfilled, alreadyFulfilled, skipped, failed, details });
  } catch (err) {
    console.error('[BulkRetryFulfillment] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/booking-risk-check - Fast batched pre-dispatch Risk Shield (Blacklist + High RTO + 48h Duplicates)
router.post('/booking-risk-check', (req, res) => {
  try {
    const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const ids = [...new Set(rawIds.map(x => Number(x)).filter(n => Number.isFinite(n) && n > 0))].slice(0, 300);
    if (ids.length === 0) return res.json({ success: true, risks: {}, highRiskCount: 0 });

    const norm10 = (p) => {
      const d = String(p || '').replace(/\D/g, '');
      return d.length >= 10 ? d.slice(-10) : '';
    };

    const ph = ids.map(() => '?').join(',');
    const targetOrders = db.prepare(`
      SELECT id, store_id, ref_number, phone, customer_name, order_date, created_timestamp
      FROM orders
      WHERE id IN (${ph})
    `).all(...ids);

    // 1. Load Blacklist normalized phones in 1 lightweight query
    const blacklistMap = new Map();
    try {
      const blRows = db.prepare('SELECT phone, reason FROM blacklist').all();
      for (const b of blRows) {
        const p10 = norm10(b.phone);
        if (p10) blacklistMap.set(p10, b.reason || 'Blacklisted phone');
      }
    } catch (_) {}

    // 2. Batch-query customer history & 48h siblings using indexed normalized last-10 phone
    const phoneSet = new Set();
    for (const o of targetOrders) {
      const p10 = norm10(o.phone);
      if (p10) phoneSet.add(p10);
    }

    const historyByPhone = new Map();
    if (phoneSet.size > 0) {
      const phoneList = Array.from(phoneSet);
      const pPh = phoneList.map(() => '?').join(',');
      const histRows = db.prepare(`
        SELECT id, store_id, ref_number, delivery_status, order_date, created_timestamp,
               SUBSTR(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', ''), '(', ''), -10) AS p10
        FROM orders
        WHERE phone IS NOT NULL AND phone != ''
          AND SUBSTR(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', ''), '(', ''), -10) IN (${pPh})
      `).all(...phoneList);

      for (const h of histRows) {
        if (!h.p10) continue;
        if (!historyByPhone.has(h.p10)) historyByPhone.set(h.p10, []);
        historyByPhone.get(h.p10).push(h);
      }
    }

    const parseOrderTs = (ord) => {
      const raw = ord.created_timestamp || ord.order_date || '';
      if (!raw) return null;
      const t = Date.parse(raw.includes('T') ? raw : raw.replace(' ', 'T') + (raw.length === 10 ? 'T12:00:00Z' : 'Z'));
      return Number.isFinite(t) ? t : null;
    };

    const risks = {};
    let highRiskCount = 0;

    for (const ord of targetOrders) {
      const p10 = norm10(ord.phone);
      const flags = [];
      let level = 'clean';
      let autoUncheck = false;
      const duplicateRefs = [];
      let delivered = 0;
      let returned = 0;
      let totalHistory = 0;

      if (p10 && blacklistMap.has(p10)) {
        level = 'critical';
        autoUncheck = true;
        flags.push({ type: 'blacklist', label: `🚫 Blacklisted (${blacklistMap.get(p10)})` });
      }

      const siblings = (p10 && historyByPhone.get(p10)) ? historyByPhone.get(p10) : [];
      const ordTs = parseOrderTs(ord);

      for (const h of siblings) {
        if (h.id === ord.id) continue;
        const st = String(h.delivery_status || '').trim().toLowerCase();
        totalHistory++;
        if (st === 'delivered') delivered++;
        else if (st === 'returned' || st === 'return received' || st === 'rto') returned++;

        // Same-store non-cancelled order within ±48 hours = Duplicate Risk
        if (h.store_id === ord.store_id && st !== 'cancelled') {
          const hTs = parseOrderTs(h);
          if (ordTs && hTs && Math.abs(ordTs - hTs) <= 48 * 3600 * 1000) {
            duplicateRefs.push(h.ref_number || `#${h.id}`);
          }
        }
      }

      if (duplicateRefs.length > 0) {
        if (level !== 'critical') level = 'high';
        autoUncheck = true;
        flags.push({
          type: 'duplicate',
          label: `👯 Duplicate 48h (${duplicateRefs.slice(0, 2).join(', ')})`,
        });
      }

      if (returned >= 2 || (returned >= 1 && delivered === 0)) {
        if (level !== 'critical') level = 'high';
        autoUncheck = true;
        flags.push({
          type: 'rto',
          label: `⚠️ High RTO (${returned} Return${returned > 1 ? 's' : ''} / ${delivered} Del)`,
        });
      } else if (returned >= 1) {
        if (level === 'clean') level = 'warn';
        flags.push({
          type: 'rto_warn',
          label: `⚡ ${returned} Return / ${delivered} Del`,
        });
      }

      if (autoUncheck) highRiskCount++;
      risks[String(ord.id)] = {
        level,
        autoUncheck,
        flags,
        history: { total: totalHistory, delivered, returned },
        duplicateRefs,
      };
    }

    res.json({ success: true, risks, highRiskCount });
  } catch (err) {
    console.error('[BookingRiskCheck] Error:', err.message);
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
