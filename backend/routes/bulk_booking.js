const express = require('express');
const router = express.Router();
const db = require('../db');
const { broadcast } = require('../sse');
const { fulfillShopifyOrder } = require('../engines/shopify');
const { getBestMatch } = require('../engines/logistics');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Helper: Start background booking (supports batch + per-order pickup locations & courier slip remarks)
async function processBulkBooking(storeId, ids, courier, bookingOptions = {}) {
  const {
    pickupAddressCode = '',
    pickupAddress = '',
    defaultRemarks = '',
    perOrderRemarks = {},
    perOrderPickup = {},
    perOrderCity = {},
    perOrderCod = {},
  } = bookingOptions || {};
  let success = 0, failed = 0;
  const failedOrders = [];
  
  // Activate global Topbar capsule
  global.syncProgress = global.syncProgress || {};
  global.syncProgress[storeId] = { status: `Bulk Booking via ${courier}...`, processed: 0, total: ids.length, success, failed };
  broadcast('sync_progress', { storeId, ...global.syncProgress[storeId] });

  let isInstaworld = false;
  let accountType = 'primary';
  if (courier.startsWith('insta:')) {
    isInstaworld = true;
    accountType = courier.split(':')[1];
  } else if (['Trax', 'Leopards', 'CallCourier', 'TCS', 'M&P'].includes(courier)) {
    isInstaworld = true;
    accountType = 'primary';
  }

  let createOrderFn = null;
  if (courier === 'PostEx') {
    const { createPostExOrder } = require('../engines/postex');
    createOrderFn = createPostExOrder;
  } else if (isInstaworld) {
    const { createInstaworldOrder } = require('../engines/instaworld');
    createOrderFn = createInstaworldOrder;
  }

  if (!createOrderFn) {
    global.syncProgress[storeId] = { status: `Error: Unknown Courier ${courier}`, processed: ids.length, total: ids.length };
    broadcast('sync_progress', global.syncProgress[storeId]);
    return;
  }

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];

    if (global.syncProgress[storeId]?.abort) {
      console.log(`🛑 Bulk Booking aborted by user`);
      break;
    }

    try {
      // 1. Fetch Order + store pickup/remark defaults
      const order = db.prepare(`
        SELECT o.*, s.shop_domain, s.access_token, s.postex_token, s.instaworld_key, s.instaworld_key_backup, s.instaworld_key_3,
               s.gas_proxy_url, s.store_name, s.postex_pickup_code, s.default_courier_remarks, s.instaworld_pickup_address
        FROM orders o 
        JOIN stores s ON o.store_id = s.id 
        WHERE o.id = ?
      `).get(id);

      // Skip if already booked or Zero-Cost Block (Rule 13)
      if (!order) {
        failedOrders.push({ id, ref_number: `#${id}`, reason: 'Order not found' });
        failed++;
        continue;
      }
      if (order.tracking_number && order.tracking_number.trim() !== '') {
        failedOrders.push({ id, ref_number: order.ref_number || `#${id}`, reason: `Already booked (${order.tracking_number})` });
        failed++;
        continue;
      }
      if (!order.cost || Number(order.cost) <= 0) {
        console.warn(`🛑 [BulkBook] Skipped order ${order.ref_number || id}: Zero Cost Block`);
        failedOrders.push({ id, ref_number: order.ref_number || `#${id}`, reason: 'Zero Cost Block (cost = Rs. 0)' });
        failed++;
        continue;
      }

      // 2. Pre-flight Check: City (allow inline city override from Booking Dispatch Modal)
      const idKey = String(id);
      if (Object.prototype.hasOwnProperty.call(perOrderCity, idKey) && String(perOrderCity[idKey] || '').trim() !== '') {
        order.city = String(perOrderCity[idKey]).trim();
      }
      if (!order.city || order.city.trim() === '') {
        console.warn(`⚠️ [BulkBook] Skipped order ${order.ref_number || id}: Missing City`);
        failedOrders.push({ id, ref_number: order.ref_number || `#${id}`, reason: 'Missing City' });
        failed++;
        continue;
      }

      const matchedCity = getBestMatch(order.city, courier);
      if (matchedCity) order.city = matchedCity;
      
      // 3. Prepaid Protection + Optional Per-Order Custom COD Override (preserves original order.price for PNL/Advance audit)
      const originalPrice = parseFloat(order.price) || 0;
      const isPrepaid = ['paid', 'payment posted'].includes((order.payment_status || '').toLowerCase());
      const rawCustomCod = Object.prototype.hasOwnProperty.call(perOrderCod, idKey) ? perOrderCod[idKey] : undefined;
      const hasCustomCod = rawCustomCod !== undefined && rawCustomCod !== null && String(rawCustomCod).trim() !== '' && Number.isFinite(Number(rawCustomCod)) && Number(rawCustomCod) >= 0;
      const finalCod = hasCustomCod
        ? Math.round(Number(rawCustomCod) * 100) / 100
        : (isPrepaid ? 0 : originalPrice);
      const bookedCodToSave = hasCustomCod && Math.abs(finalCod - originalPrice) > 0.01 ? finalCod : null;
      const bookingOrder = { ...order, price: finalCod, is_prepaid: finalCod === 0 };

      const hasPerOrderRemark = Object.prototype.hasOwnProperty.call(perOrderRemarks, idKey);
      const resolvedRemarks = String(
        hasPerOrderRemark
          ? perOrderRemarks[idKey]
          : (order.courier_remarks || defaultRemarks || order.default_courier_remarks || '')
      ).trim();

      const hasPerOrderPickup = Object.prototype.hasOwnProperty.call(perOrderPickup, idKey) && String(perOrderPickup[idKey] || '').trim() !== '';
      const resolvedPickup = String(
        hasPerOrderPickup
          ? perOrderPickup[idKey]
          : (courier === 'PostEx'
              ? (pickupAddressCode || order.pickup_address_code || order.postex_pickup_code || '')
              : (pickupAddress || pickupAddressCode || order.pickup_address_code || order.instaworld_pickup_address || ''))
      ).trim();

      // 4. API Call (Instaworld courier param intentionally kept as 'TCS' per user instruction)
      let trackingNumber;
      if (courier === 'PostEx') {
        trackingNumber = await createOrderFn(order, bookingOrder, {
          pickupAddressCode: resolvedPickup,
          remarks: resolvedRemarks,
          codAmount: finalCod,
        });
      } else if (isInstaworld) {
        let apiKey = order.instaworld_key;
        if (accountType === 'backup') {
          apiKey = order.instaworld_key_backup;
        } else if (accountType === 'key3') {
          apiKey = order.instaworld_key_3;
        }
        trackingNumber = await createOrderFn(order, bookingOrder, 'TCS', apiKey, {
          pickupAddress: resolvedPickup,
          remarks: resolvedRemarks,
          codAmount: finalCod,
        });
      } else {
        trackingNumber = await createOrderFn(order, bookingOrder, courier, null, {
          pickupAddress: resolvedPickup,
          remarks: resolvedRemarks,
          codAmount: finalCod,
        });
      }
      
      const dbCourier = isInstaworld ? 'Instaworld' : courier;
      db.prepare(`
        UPDATE orders
        SET tracking_number = ?, courier = ?, delivery_status = 'Booked',
            city = ?, courier_remarks = ?, pickup_address_code = ?, booked_cod_amount = ?, status_date = datetime('now')
        WHERE id = ?
      `).run(trackingNumber, dbCourier, order.city, resolvedRemarks, resolvedPickup, bookedCodToSave, id);
      try {
        const { allocateOrderFifoOnDispatch } = require('../services/poLedgerService');
        allocateOrderFifoOnDispatch(id, 'BulkBook');
      } catch (fifoErr) { console.warn('[BulkBook FIFO Notice]:', fifoErr.message); }
      try {
        await fulfillShopifyOrder(order, order.shopify_order_id, trackingNumber, dbCourier);
        db.prepare("UPDATE orders SET fulfillment_status = 'fulfilled' WHERE id = ?").run(id);
      } catch (shopifyErr) {
        console.warn(`⚠️ [BulkBook] Order ${order.ref_number || id} booked (${trackingNumber}) but Shopify fulfillment failed:`, shopifyErr.message);
      }
      try { require('../services/readyTagSync').clearReadyTagAfterBooking(id); } catch (_) {}
      
      success++;
      broadcast('order_updated', { storeId, shopifyOrderId: order.shopify_order_id });

    } catch (e) {
      // Keep existing valid ERP status instead of illegal 'Failed Booking' (Rule 12)
      console.error(`Bulk Booking Failed for Order ${id}:`, e.message);
      const refRow = db.prepare('SELECT ref_number FROM orders WHERE id = ?').get(id);
      failedOrders.push({ id, ref_number: refRow?.ref_number || `#${id}`, reason: e.message || 'Courier API error' });
      failed++;
    }

    // Rate Limit Delay
    await sleep(600);

    // Update Progress
    global.syncProgress[storeId] = { status: `Booking ${i + 1}/${ids.length}...`, processed: i + 1, total: ids.length, success, failed };
    broadcast('sync_progress', { storeId, ...global.syncProgress[storeId] });
  }

  global.syncProgress[storeId] = {
    status: 'Booking Complete',
    actionType: 'Bulk Booking',
    processed: ids.length,
    total: ids.length,
    success,
    failed,
    failedOrders: failedOrders.slice(0, 50),
  };
  broadcast('sync_progress', { storeId, ...global.syncProgress[storeId] });
  try {
    const { recordSyncEvent } = require('../services/syncHistoryService');
    recordSyncEvent({
      storeId,
      type: `Bulk Book (${courier})`,
      category: 'booking',
      total: ids.length,
      success,
      failed,
      summary: `${success} booked${failed > 0 ? `, ${failed} failed` : ''}`,
      details: failedOrders
    });
  } catch (_) {}
  setTimeout(() => { if (global.syncProgress) delete global.syncProgress[storeId]; }, 5000);
}

// POST /api/bulk/book
router.post('/book', (req, res) => {
  const b = req.body || {};
  const ids = b.ids || b.order_ids;
  const {
    courier,
    pickup_address_code = '',
    pickup_address = '',
    default_remarks = '',
    per_order_remarks = {},
    per_order_pickup = {},
    per_order_city = {},
    per_order_cod = {},
  } = b;
  if (!ids || !ids.length || !courier) return res.status(400).json({ error: 'ids and courier required' });

  // Get storeId from first order
  const order = db.prepare('SELECT store_id FROM orders WHERE id = ?').get(ids[0]);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  // Spin up background loop with batch + per-order pickup locations, cities, custom COD & courier slip remarks
  processBulkBooking(order.store_id, ids, courier, {
    pickupAddressCode: pickup_address_code,
    pickupAddress: pickup_address,
    defaultRemarks: default_remarks,
    perOrderRemarks: per_order_remarks && typeof per_order_remarks === 'object' ? per_order_remarks : {},
    perOrderPickup: per_order_pickup && typeof per_order_pickup === 'object' ? per_order_pickup : {},
    perOrderCity: per_order_city && typeof per_order_city === 'object' ? per_order_city : {},
    perOrderCod: per_order_cod && typeof per_order_cod === 'object' ? per_order_cod : {},
  }).catch(console.error);

  // Return immediate 202 Accepted
  res.status(202).json({ success: true, message: 'Bulk booking started' });
});

// POST /api/bulk/cancel — Unified with cancelOrderBookingCore (Final status lock, courier_status clear, keeps Confirmed + Ready to Book tag, FIFO restore)
router.post('/cancel', async (req, res) => {
  const { ids } = req.body;
  if (!ids || !ids.length) return res.status(400).json({ error: 'ids required' });

  const firstOrder = db.prepare('SELECT store_id FROM orders WHERE id = ?').get(ids[0]);
  if (!firstOrder) return res.status(404).json({ error: 'Order not found' });
  const storeId = firstOrder.store_id;

  global.syncProgress = global.syncProgress || {};
  global.syncProgress[storeId] = { status: `Bulk Cancelling...`, processed: 0, total: ids.length, success: 0, failed: 0 };
  broadcast('sync_progress', global.syncProgress[storeId]);

  res.status(202).json({ success: true, message: 'Bulk cancel started' });

  const { cancelOrderBookingCore } = require('../controllers/ordersController');
  const actor = req.user?.username || 'BulkCancel';
  let success = 0, failed = 0;
  const failedOrders = [];

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (global.syncProgress[storeId]?.abort) break;

    try {
      const result = await cancelOrderBookingCore(id, actor);
      if (result.ok) {
        success++;
      } else {
        console.warn(`⚠️ [BulkCancel] Order ${id} skipped/failed: ${result.error}`);
        const refRow = db.prepare('SELECT ref_number FROM orders WHERE id = ?').get(id);
        failedOrders.push({ id, ref_number: refRow?.ref_number || `#${id}`, reason: result.error || 'Cancel rejected' });
        failed++;
      }
    } catch (e) {
      console.error(`Cancel Failed for ${id}:`, e.message);
      const refRow = db.prepare('SELECT ref_number FROM orders WHERE id = ?').get(id);
      failedOrders.push({ id, ref_number: refRow?.ref_number || `#${id}`, reason: e.message || 'Courier error' });
      failed++;
    }
    await sleep(350);
    global.syncProgress[storeId] = { status: `Cancelling ${i + 1}/${ids.length}...`, processed: i + 1, total: ids.length, success, failed };
    broadcast('sync_progress', { storeId, ...global.syncProgress[storeId] });
  }

  global.syncProgress[storeId] = {
    status: 'Cancel Complete',
    actionType: 'Bulk Cancel',
    processed: ids.length,
    total: ids.length,
    success,
    failed,
    failedOrders: failedOrders.slice(0, 50),
  };
  broadcast('sync_progress', { storeId, ...global.syncProgress[storeId] });
  try {
    const { recordSyncEvent } = require('../services/syncHistoryService');
    recordSyncEvent({
      storeId,
      type: 'Bulk Cancel Booking',
      category: 'booking',
      total: ids.length,
      success,
      failed,
      summary: `${success} cancelled${failed > 0 ? `, ${failed} failed` : ''}`,
      details: failedOrders
    });
  } catch (_) {}
  setTimeout(() => { if (global.syncProgress) delete global.syncProgress[storeId]; }, 5000);
});

// POST /api/bulk/revert — Safe revert to Pending (NEVER wipes live tracking numbers!) + removes Ready to Book tag on Shopify
router.post('/revert', async (req, res) => {
  const { ids } = req.body;
  if (!ids || !ids.length) return res.status(400).json({ error: 'ids required' });

  try {
    const { READY_TO_BOOK_TAG, mergeOrderTagString, updateShopifyOrderTag } = require('../engines/shopify');
    const placeholders = ids.map(() => '?').join(',');
    const orders = db.prepare(`
      SELECT o.id, o.store_id, o.shopify_order_id, o.tracking_number, o.tags, s.shop_domain, s.access_token
      FROM orders o LEFT JOIN stores s ON o.store_id = s.id
      WHERE o.id IN (${placeholders})
    `).all(...ids);

    const updateStmt = db.prepare("UPDATE orders SET delivery_status = 'Pending', tags = ?, status_date = datetime('now') WHERE id = ?");
    const updateTagOnlyStmt = db.prepare('UPDATE orders SET tags = ? WHERE id = ?');

    let revertedCount = 0;
    let skippedTracked = 0;
    let shopifySynced = 0;
    const revertedIds = [];

    for (const o of orders) {
      if (o.tracking_number && String(o.tracking_number).trim() !== '') {
        skippedTracked++;
        continue;
      }
      const { tags: localTags } = mergeOrderTagString(o.tags, READY_TO_BOOK_TAG, 'remove');
      updateStmt.run(localTags, o.id);
      revertedCount++;
      revertedIds.push(o.id);

      if (o.shopify_order_id && o.shop_domain && o.access_token) {
        const tagRes = await updateShopifyOrderTag(o, o.shopify_order_id, READY_TO_BOOK_TAG, 'remove');
        if (tagRes.ok) {
          shopifySynced++;
          if (tagRes.tags !== undefined) updateTagOnlyStmt.run(tagRes.tags, o.id);
        }
        await sleep(120);
      }

      broadcast('order_updated', { storeId: o.store_id, shopifyOrderId: o.shopify_order_id });
    }

    res.json({ success: true, count: revertedCount, skippedTracked, shopifySynced, revertedIds });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
