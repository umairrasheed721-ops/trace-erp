const express = require('express');
const router = express.Router();
const db = require('../db');
const { broadcast } = require('../sse');
const { fulfillShopifyOrder } = require('../engines/shopify');
const { getBestMatch } = require('../engines/logistics');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Helper: Start background booking
async function processBulkBooking(storeId, ids, courier) {
  let success = 0, failed = 0;
  
  // Activate global Topbar capsule
  global.syncProgress = global.syncProgress || {};
  global.syncProgress[storeId] = { status: `Bulk Booking via ${courier}...`, processed: 0, total: ids.length, success, failed };
  broadcast('sync_progress', global.syncProgress[storeId]);

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
      // 1. Fetch Order
      const order = db.prepare(`
        SELECT o.*, s.shop_domain, s.access_token, s.postex_token, s.instaworld_key, s.instaworld_key_backup, s.instaworld_key_3, s.gas_proxy_url
        FROM orders o 
        JOIN stores s ON o.store_id = s.id 
        WHERE o.id = ?
      `).get(id);

      // Skip if already booked or Zero-Cost Block (Rule 13)
      if (!order || (order.tracking_number && order.tracking_number.trim() !== '')) {
        failed++;
        continue;
      }
      if (!order.cost || Number(order.cost) <= 0) {
        console.warn(`🛑 [BulkBook] Skipped order ${order.ref_number || id}: Zero Cost Block`);
        failed++;
        continue;
      }

      // 2. Pre-flight Check: City (Never set invalid status or overwrite customer notes - Rule 12)
      if (!order.city || order.city.trim() === '') {
        console.warn(`⚠️ [BulkBook] Skipped order ${order.ref_number || id}: Missing City`);
        failed++;
        continue;
      }

      const matchedCity = getBestMatch(order.city, courier);
      if (matchedCity) order.city = matchedCity;
      
      // 3. Prepaid Logic: Force COD to 0 if Paid locally
      if (['paid', 'payment posted'].includes((order.payment_status || '').toLowerCase())) {
        order.price = 0;
        order.is_prepaid = true;
      }

      // 4. API Call (Instaworld courier param intentionally kept as 'TCS' per user instruction)
      let trackingNumber;
      if (courier === 'PostEx') {
        trackingNumber = await createOrderFn(order, order);
      } else if (isInstaworld) {
        let apiKey = order.instaworld_key;
        if (accountType === 'backup') {
          apiKey = order.instaworld_key_backup;
        } else if (accountType === 'key3') {
          apiKey = order.instaworld_key_3;
        }
        trackingNumber = await createOrderFn(order, order, 'TCS', apiKey);
      } else {
        trackingNumber = await createOrderFn(order, order, courier);
      }
      
      const dbCourier = isInstaworld ? 'Instaworld' : courier;
      db.prepare("UPDATE orders SET tracking_number = ?, courier = ?, delivery_status = 'Booked', status_date = datetime('now') WHERE id = ?").run(trackingNumber, dbCourier, id);
      try {
        const { allocateOrderFifoOnDispatch } = require('../services/poLedgerService');
        allocateOrderFifoOnDispatch(id, 'BulkBook');
      } catch (fifoErr) { console.warn('[BulkBook FIFO Notice]:', fifoErr.message); }
      
      try {
        await fulfillShopifyOrder(order, order.shopify_order_id, trackingNumber, dbCourier);
      } catch (shopifyErr) {
        console.warn(`⚠️ [BulkBook] Order ${order.ref_number || id} booked (${trackingNumber}) but Shopify fulfillment failed:`, shopifyErr.message);
      }
      
      success++;
      broadcast('order_updated', { storeId, shopifyOrderId: order.shopify_order_id });

    } catch (e) {
      // Keep existing valid ERP status instead of illegal 'Failed Booking' (Rule 12)
      console.error(`Bulk Booking Failed for Order ${id}:`, e.message);
      failed++;
    }

    // Rate Limit Delay
    await sleep(600);

    // Update Progress
    global.syncProgress[storeId] = { status: `Booking ${i + 1}/${ids.length}...`, processed: i + 1, total: ids.length, success, failed };
    broadcast('sync_progress', { storeId, ...global.syncProgress[storeId] });
  }

  global.syncProgress[storeId] = { status: 'Booking Complete', processed: ids.length, total: ids.length, success, failed };
  broadcast('sync_progress', { storeId, ...global.syncProgress[storeId] });
  setTimeout(() => { if (global.syncProgress) delete global.syncProgress[storeId]; }, 5000);
}

// POST /api/bulk/book
router.post('/book', (req, res) => {
  const ids = req.body.ids || req.body.order_ids;
  const { courier } = req.body;
  if (!ids || !ids.length || !courier) return res.status(400).json({ error: 'ids and courier required' });

  // Get storeId from first order
  const order = db.prepare('SELECT store_id FROM orders WHERE id = ?').get(ids[0]);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  // Spin up background loop
  processBulkBooking(order.store_id, ids, courier).catch(console.error);

  // Return immediate 202 Accepted
  res.status(202).json({ success: true, message: 'Bulk booking started' });
});

// POST /api/bulk/cancel — Unified with cancelOrderBookingCore (Final status lock, courier_status clear, Pending parity, Ready to Book tag removal, FIFO restore)
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

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (global.syncProgress[storeId]?.abort) break;

    try {
      const result = await cancelOrderBookingCore(id, actor);
      if (result.ok) {
        success++;
      } else {
        console.warn(`⚠️ [BulkCancel] Order ${id} skipped/failed: ${result.error}`);
        failed++;
      }
    } catch (e) {
      console.error(`Cancel Failed for ${id}:`, e.message);
      failed++;
    }
    await sleep(350);
    global.syncProgress[storeId] = { status: `Cancelling ${i + 1}/${ids.length}...`, processed: i + 1, total: ids.length, success, failed };
    broadcast('sync_progress', { storeId, ...global.syncProgress[storeId] });
  }

  global.syncProgress[storeId].status = 'Cancel Complete';
  broadcast('sync_progress', global.syncProgress[storeId]);
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
