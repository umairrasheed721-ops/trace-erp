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

  if (courier === 'PostEx') {
    const { createPostExOrder, cancelPostExOrder } = require('../engines/postex');
    createOrderFn = createPostExOrder;
    cancelOrderFn = cancelPostExOrder;
  } else if (isInstaworld) {
    const { createInstaworldOrder } = require('../engines/instaworld');
    createOrderFn = createInstaworldOrder;
    cancelOrderFn = null; 
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

      // Skip if already booked
      if (!order || (order.tracking_number && order.tracking_number.trim() !== '')) {
        failed++;
        continue;
      }

      // 2. Pre-flight Check: Address & City
      if (!order.city || order.city.trim() === '') {
        db.prepare("UPDATE orders SET delivery_status = 'Failed Booking', notes = 'Missing City' WHERE id = ?").run(id);
        failed++;
        broadcast('message', { type: 'order_updated', orderId: id });
        continue;
      }

      const matchedCity = getBestMatch(order.city, courier);
      if (matchedCity) order.city = matchedCity;
      
      // 3. Prepaid Logic: Force COD to 0 if Paid locally
      if (order.payment_status === 'Paid') {
        order.price = 0; // The courier engines use order.price for COD value usually
        order.is_prepaid = true;
      }

      // 4. API Call
      // For PostEx, signature is (store, order)
      // For Instaworld, signature is (store, order, courierName)
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
      
      try { await fulfillShopifyOrder(order, order.shopify_order_id, trackingNumber, dbCourier); } catch(e) {}
      
      success++;
      broadcast('order_updated', { storeId, shopifyOrderId: order.shopify_order_id });

    } catch (e) {
      console.error(`Bulk Booking Failed for Order ${id}:`, e.message);
      db.prepare("UPDATE orders SET delivery_status = 'Failed Booking' WHERE id = ?").run(id);
      
      // We still need to find shopify_order_id for the error case update if possible
      const partialOrder = db.prepare('SELECT shopify_order_id FROM orders WHERE id = ?').get(id);
      if (partialOrder) broadcast('order_updated', { storeId, shopifyOrderId: partialOrder.shopify_order_id });
      
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

// POST /api/bulk/cancel
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

  let success = 0, failed = 0;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    try {
      const order = db.prepare('SELECT o.*, s.postex_token, s.instaworld_key, s.instaworld_key_backup, s.instaworld_key_3, s.gas_proxy_url FROM orders o JOIN stores s ON o.store_id = s.id WHERE o.id = ?').get(id);
      if (!order) continue;

      const courier = (order.courier || '').toLowerCase();
      let cancelOk = false;

      if (courier.includes('postex')) {
        const { cancelPostExOrder } = require('../engines/postex');
        cancelOk = await cancelPostExOrder(order, order.tracking_number);
      } else if (courier.includes('insta') || courier.includes('tcs') || courier.includes('lcs') || courier.includes('leopard')) {
        const { cancelInstaworldOrder } = require('../engines/instaworld');
        cancelOk = await cancelInstaworldOrder(order, order.tracking_number);
      } else {
        cancelOk = true; // No courier API to hit
      }

      if (cancelOk) {
        // Cancel Shopify fulfillment (non-blocking)
        try {
          if (order.shopify_order_id) {
            const { cancelShopifyFulfillment } = require('../engines/shopify');
            await cancelShopifyFulfillment(order, order.shopify_order_id);
          }
        } catch (shopifyErr) {
          console.warn(`⚠️ Bulk cancel failed to cancel Shopify fulfillment for order ${order.shopify_order_id}:`, shopifyErr.message);
        }

        db.prepare("UPDATE orders SET tracking_number = NULL, courier = NULL, delivery_status = 'Confirmed' WHERE id = ?").run(id);
        success++;
      } else {
        failed++;
      }
      broadcast('order_updated', { storeId, shopifyOrderId: order.shopify_order_id });
    } catch (e) {
      console.error(`Cancel Failed for ${id}:`, e.message);
      failed++;
    }
    await sleep(400);
    global.syncProgress[storeId] = { status: `Cancelling ${i + 1}/${ids.length}...`, processed: i + 1, total: ids.length, success, failed };
    broadcast('sync_progress', { storeId, ...global.syncProgress[storeId] });
  }

  global.syncProgress[storeId].status = 'Cancel Complete';
  broadcast('sync_progress', global.syncProgress[storeId]);
  setTimeout(() => { if (global.syncProgress) delete global.syncProgress[storeId]; }, 5000);
});

// POST /api/bulk/revert
router.post('/revert', (req, res) => {
  const { ids } = req.body;
  if (!ids || !ids.length) return res.status(400).json({ error: 'ids required' });

  try {
    const placeholders = ids.map(() => '?').join(',');
    const orders = db.prepare(`SELECT store_id, shopify_order_id FROM orders WHERE id IN (${placeholders})`).all(...ids);
    
    db.prepare(`UPDATE orders SET delivery_status = 'Pending', tracking_number = NULL, courier = NULL WHERE id IN (${placeholders})`).run(...ids);
    
    orders.forEach(o => {
      broadcast('order_updated', { storeId: o.store_id, shopifyOrderId: o.shopify_order_id });
    });
    res.json({ success: true, count: ids.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
