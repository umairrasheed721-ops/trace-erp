const express = require('express');
const router = express.Router();
const db = require('../db');
const fetch = require('node-fetch');
const { broadcast } = require('../sse');

// GET /api/orders?store_id=1&page=1&limit=100&status=&search=&start_date=&end_date=
router.get('/', (req, res) => {
  const { store_id, page = 1, limit = 100, status, search, courier, start_date, end_date } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });
  console.log(`DEBUG: req.query: ${JSON.stringify(req.query)}`);
  
  let queryParams = [Number(store_id)];
  let whereClauses = ['o.store_id = ?'];

  if (status && status !== 'All Statuses' && status !== '') {
    const s = status.toUpperCase().trim();
    if (s === '[ACTIVE PIPELINE]') {
      whereClauses.push("LOWER(o.delivery_status) NOT IN ('delivered', 'return received', 'cancelled', 'returned', 'void', 'voided')");
    } else if (s === '[READY TO BOOK]') {
      whereClauses.push("LOWER(o.delivery_status) = 'confirmed' AND (o.tracking_number IS NULL OR o.tracking_number = '' OR o.tracking_number = '—')");
    } else if (s === '[NO TRACKING]') {
      whereClauses.push("(o.tracking_number IS NULL OR o.tracking_number = '' OR o.tracking_number = '—') AND LOWER(o.delivery_status) != 'cancelled'");
    } else if (s === '[UNPAID DELIVERED]') {
      whereClauses.push("LOWER(o.delivery_status) LIKE '%delivered%' AND (o.paid_amount IS NULL OR o.paid_amount < 1)");
    } else if (s === '[MISSING COST]') {
      whereClauses.push("LOWER(o.delivery_status) LIKE '%delivered%' AND (o.cost IS NULL OR o.cost = 0) AND o.items_count > 0");
    } else if (s === '[AUDIT: MISSING CHARGES]') {
      whereClauses.push("(o.courier_fee IS NULL OR o.courier_fee < 1) AND LOWER(o.delivery_status) NOT IN ('pending', 'cancelled') AND o.tracking_number IS NOT NULL AND o.tracking_number != ''");
    } else {
      whereClauses.push('LOWER(o.delivery_status) = ?');
      queryParams.push(status.toLowerCase());
    }
  }

  if (courier) { whereClauses.push('LOWER(o.courier) = ?'); queryParams.push(courier.toLowerCase()); }
  if (start_date) { whereClauses.push('o.order_date >= ?'); queryParams.push(start_date); }
  if (end_date) { whereClauses.push('o.order_date <= ?'); queryParams.push(end_date); }
  
  if (search) {
    whereClauses.push('(o.tracking_number LIKE ? OR o.customer_name LIKE ? OR o.ref_number LIKE ? OR o.shopify_order_id LIKE ? OR o.phone LIKE ?)');
    queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }

  // Column-specific filters
  ['ref_number', 'customer_name', 'city', 'phone', 'courier', 'tracking_number', 'notes'].forEach(field => {
    if (req.query[field]) {
      const val = req.query[field].toLowerCase().trim();
      const terms = val.split(/[\s,]+/).filter(Boolean);
      if (terms.length > 0) {
        const orClauses = terms.map(() => `LOWER(o.${field}) LIKE ?`).join(' OR ');
        whereClauses.push(`(${orClauses})`);
        terms.forEach(t => queryParams.push(`%${t}%`));
      }
    }
  });

  const where = whereClauses.join(' AND ');
  console.log(`DEBUG: WHERE clause: ${where} | PARAMS: ${JSON.stringify(queryParams)}`);
  const offset = (parseInt(page) - 1) * parseInt(limit);

  // Dynamic Sorting
  const allowedSortCols = ['order_date', 'created_timestamp', 'price', 'delivery_status', 'customer_name'];
  const { sort: sortCol = 'created_timestamp', sort_dir = 'DESC' } = req.query;
  const safeSort = allowedSortCols.includes(sortCol) ? sortCol : 'created_timestamp';
  const safeDir = sort_dir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const total = db.prepare(`SELECT COUNT(*) as count FROM orders o WHERE ${where}`).get(...queryParams);
  const orders = db.prepare(`
    SELECT o.*, s.shop_domain 
    FROM orders o
    JOIN stores s ON o.store_id = s.id
    WHERE ${where}
    ORDER BY o.${safeSort} ${safeDir}
    LIMIT ? OFFSET ?
  `).all(...queryParams, parseInt(limit), offset);

  res.json({ 
    orders, 
    total: total.count, 
    page: parseInt(page), 
    limit: parseInt(limit)
  });
});

// PUT /api/orders/:id - Update a single order field (for manual edits)
router.put('/:id', (req, res) => {
  const allowed = ['delivery_status', 'payment_status', 'notes', 'paid_amount', 'payment_ref', 'courier_fee', 'hold_reason', 'return_status', 'cost'];
  const updates = Object.keys(req.body).filter(k => allowed.includes(k));
  if (!updates.length) return res.status(400).json({ error: 'No valid fields to update' });

  const extraSets = [];
  const extraValues = [];

  if (req.body.cost !== undefined) {
    extraSets.push('cost_locked = ?');
    extraValues.push(1);
  }
  if (req.body.courier_fee !== undefined) {
    extraSets.push('courier_fee_locked = ?');
    extraValues.push(1);
  }

  const today = new Date().toISOString().split('T')[0];

  // 4. P&L LOGIC: Auto-stamp payment_date when status flips to Delivered
  if (req.body.delivery_status) {
    const newStatus = (req.body.delivery_status || '').toLowerCase();
    if (newStatus.includes('delivered')) {
      // Only stamp if not already set
      const existing = db.prepare('SELECT payment_date FROM orders WHERE id = ?').get(req.params.id);
      if (!existing?.payment_date) {
        extraSets.push('payment_date = ?');
        extraValues.push(today);
      }
    }
    // Auto-clear P&L date if returned/cancelled
    if (newStatus.includes('return') || newStatus.includes('cancel')) {
      extraSets.push('payment_date = ?');
      extraValues.push(null);
    }
  }

  // 3. PAID AMOUNT LOGIC: Auto-flip payment_status to Paid when paid_amount > 0
  if (req.body.paid_amount !== undefined) {
    const paidAmt = parseFloat(req.body.paid_amount) || 0;
    const order = db.prepare('SELECT price FROM orders WHERE id = ?').get(req.params.id);
    if (paidAmt > 0 && order) {
      const newPaymentStatus = paidAmt >= (parseFloat(order.price) || 0) ? 'Paid' : 'Partial';
      if (!req.body.payment_status) {
        extraSets.push('payment_status = ?');
        extraValues.push(newPaymentStatus);
      }
    }
  }

  const allSets = [...updates.map(k => `${k} = ?`), ...extraSets].join(', ');
  const allValues = [...updates.map(k => req.body[k]), ...extraValues];

  db.prepare(`UPDATE orders SET ${allSets} WHERE id = ?`).run(...allValues, req.params.id);

  // 5. SHOPIFY LIVE SYNC: If note changed, push to Shopify
  if (req.body.notes !== undefined) {
    const order = db.prepare('SELECT o.*, s.shop_domain, s.access_token FROM orders o JOIN stores s ON o.store_id = s.id WHERE o.id = ?').get(req.params.id);
    if (order && order.shopify_order_id) {
      const { appendShopifyNote } = require('../engines/shopify_finance'); // We can repurpose or add a new one
      // Actually, let's just do a direct PUT for the whole note
      const shopifyUrl = `https://${order.shop_domain}/admin/api/2024-10/orders/${order.shopify_order_id}.json`;
      fetch(shopifyUrl, {
        method: 'PUT',
        headers: {
          'X-Shopify-Access-Token': order.access_token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ order: { id: order.shopify_order_id, note: req.body.notes } })
      }).catch(err => console.error('Failed to sync note to Shopify:', err));
    }
  }

  // Return updated row so frontend can reflect all auto-changes
  const updated = db.prepare('SELECT o.*, s.shop_domain FROM orders o JOIN stores s ON o.store_id = s.id WHERE o.id = ?').get(req.params.id);
  res.json({ success: true, order: updated });
});

// GET /api/orders/:id/details - Fetch full order from Shopify (on-demand)
router.get('/:id/details', async (req, res) => {
  const order = db.prepare('SELECT o.*, s.shop_domain, s.access_token FROM orders o JOIN stores s ON o.store_id = s.id WHERE o.id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  try {
    const shopifyUrl = `https://${order.shop_domain}/admin/api/2024-10/orders/${order.shopify_order_id}.json`;
    const sRes = await fetch(shopifyUrl, { headers: { 'X-Shopify-Access-Token': order.access_token } });
    const sData = await sRes.json();
    if (!sData.order) throw new Error('Shopify order not found');

    const shopifyOrder = sData.order;
    const { mapShopifyStatus } = require('../engines/shopify');
    const newStatus = mapShopifyStatus(shopifyOrder);
    
    // Check if we should update the status
    const currentStatus = (order.delivery_status || '').toLowerCase();
    const isProtected = currentStatus === 'return received' || currentStatus === 'delivered';
    
    if (!isProtected && newStatus !== order.delivery_status) {
      db.prepare('UPDATE orders SET delivery_status = ?, status_date = datetime("now") WHERE id = ?').run(newStatus, order.id);
      order.delivery_status = newStatus;
    }

    // Fetch images for line items
    const lineItems = await Promise.all(shopifyOrder.line_items.map(async item => {
      const mapped = {
        id: item.id, variant_id: item.variant_id, product_id: item.product_id,
        title: item.title, sku: item.sku, quantity: item.quantity, price: item.price,
        variant_title: item.variant_title, image_url: null
      };

      const cached = db.prepare('SELECT image_url FROM products WHERE shopify_variant_id = ?').get(String(item.variant_id));
      if (cached?.image_url) {
        mapped.image_url = cached.image_url;
      } else if (item.variant_id) {
        try {
          const pRes = await fetch(`https://${order.shop_domain}/admin/api/2024-10/products/${item.product_id}.json?fields=image`, {
            headers: { 'X-Shopify-Access-Token': order.access_token }
          });
          const pData = await pRes.json();
          mapped.image_url = pData.product?.image?.src || null;
          if (mapped.image_url) {
            db.prepare(`INSERT OR REPLACE INTO products (store_id, shopify_product_id, shopify_variant_id, sku, title, image_url, price) VALUES (?,?,?,?,?,?,?)`)
              .run(order.store_id, String(item.product_id), String(item.variant_id), item.sku, item.title, mapped.image_url, parseFloat(item.price));
          }
        } catch (e) { console.error('Image fetch error', e); }
      }
      return mapped;
    }));

    db.prepare('UPDATE orders SET line_items = ? WHERE id = ?').run(JSON.stringify(lineItems), order.id);
    res.json({ ...order, ...shopifyOrder, line_items: lineItems });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/:id/address - Update order address locally and on Shopify
router.post('/:id/address', async (req, res) => {
  const { address } = req.body;
  const { updateShopifyAddress } = require('../engines/shopify');
  try {
    const order = db.prepare('SELECT o.shopify_order_id, s.shop_domain, s.access_token FROM orders o JOIN stores s ON o.store_id = s.id WHERE o.id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // 1. Update Shopify
    await updateShopifyAddress(order, order.shopify_order_id, address);

    // 2. Update local DB
    db.prepare('UPDATE orders SET address = ? WHERE id = ?').run(address, req.params.id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/orders/:id/address - Live Update Address in Shopify
router.put('/:id/address', async (req, res) => {
  const { first_name, last_name, address1, address2, city, phone } = req.body;
  const order = db.prepare('SELECT o.*, s.shop_domain, s.access_token FROM orders o JOIN stores s ON o.store_id = s.id WHERE o.id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  try {
    const shopifyUrl = `https://${order.shop_domain}/admin/api/2024-10/orders/${order.shopify_order_id}.json`;
    const body = { order: { id: order.shopify_order_id, shipping_address: { first_name, last_name, address1, address2, city, phone } } };

    const sRes = await fetch(shopifyUrl, {
      method: 'PUT',
      headers: { 'X-Shopify-Access-Token': order.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    if (!sRes.ok) throw new Error('Shopify update failed');

    const fullName = `${first_name} ${last_name}`.trim();
    const fullAddr = `${address1}${address2 ? ', ' + address2 : ''}`;
    db.prepare('UPDATE orders SET customer_name = ?, address = ?, city = ?, phone = ? WHERE id = ?').run(fullName, fullAddr, city, phone, order.id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/export?store_id=1 - Export all orders as JSON for CSV download
router.get('/export', (req, res) => {
  const { store_id } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });
  const orders = db.prepare('SELECT * FROM orders WHERE store_id = ? ORDER BY created_timestamp DESC').all(store_id);
  res.json(orders);
});

// GET /api/orders/by-shopify/:id - Fetch single order quickly by shopify ID for live UI updates
router.get('/by-shopify/:id', (req, res) => {
  const order = db.prepare(`
    SELECT o.*, s.shop_domain 
    FROM orders o 
    JOIN stores s ON o.store_id = s.id 
    WHERE o.shopify_order_id = ?
  `).get(req.params.id);
  res.json(order);
});

// POST /api/orders/bulk-confirm - Bulk mark as ready for booking
router.post('/bulk-confirm', (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });

  try {
    const stmt = db.prepare("UPDATE orders SET delivery_status = 'Confirmed', status_date = datetime('now') WHERE id = ?");
    for (const id of ids) {
      stmt.run(id);
      broadcast('message', { type: 'order_updated', orderId: id });
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

  try {
    const stmt = db.prepare("UPDATE orders SET delivery_status = ?, status_date = datetime('now') WHERE id = ?");
    const today = new Date().toISOString().split('T')[0];
    const updatePL = db.prepare("UPDATE orders SET payment_date = ? WHERE id = ?");

    for (const id of ids) {
      stmt.run(status, id);
      
      // If marking as Delivered, also stamp the P&L payment date
      const s = status.toLowerCase();
      if (s.includes('delivered')) {
        updatePL.run(today, id);
      } else if (s.includes('return') || s.includes('cancel')) {
        updatePL.run(null, id);
      }

      broadcast('message', { type: 'order_updated', orderId: id });
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
      stmt.run(id);
      broadcast('message', { type: 'order_updated', orderId: id });
    }
    res.json({ success: true, count: ids.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/bulk-book-postex
router.post('/bulk-book-postex', async (req, res) => {
  const { ids } = req.body;
  const { createPostExOrder } = require('../engines/postex');
  const { fulfillShopifyOrder } = require('../engines/shopify');
  const { getBestMatch } = require('../engines/logistics');

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
      broadcast('message', { type: 'order_updated', orderId: id });
      success++;
    } catch (e) { failed++; }
  }
  res.json({ success: true, count: success, failed });
});

// POST /api/orders/bulk-sync-status
router.post('/bulk-sync-status', async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });

  const { refreshShopifyUpdates } = require('../engines/shopify');
  
  try {
    // We fetch the store for the first order
    const firstOrder = db.prepare('SELECT store_id FROM orders WHERE id = ?').get(ids[0]);
    if (!firstOrder) throw new Error('No orders found');
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(firstOrder.store_id);

    // Instead of a full scan, we refresh specific orders
    // We'll process them in small batches to avoid timeouts
    let updatedCount = 0;
    const batchSize = 50;
    
    for (let i = 0; i < ids.length; i += batchSize) {
      const batchIds = ids.slice(i, i + batchSize);
      const ordersToSync = db.prepare(`SELECT shopify_order_id FROM orders WHERE id IN (${batchIds.map(() => '?').join(',')})`).all(...batchIds);
      const shopifyIds = ordersToSync.map(o => o.shopify_order_id);
      
      // We pass specific IDs to a new optimized engine function
      const { syncSpecificOrders } = require('../engines/shopify');
      const count = await syncSpecificOrders(store, shopifyIds);
      updatedCount += count;
    }

    res.json({ success: true, count: updatedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/bulk-book-instaworld
router.post('/bulk-book-instaworld', async (req, res) => {
  const { ids, courier_name } = req.body;
  const { createInstaworldOrder } = require('../engines/instaworld');
  const { fulfillShopifyOrder } = require('../engines/shopify');
  const { getBestMatch } = require('../engines/logistics');

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
      broadcast('message', { type: 'order_updated', orderId: id });
      success++;
    } catch (e) { failed++; }
  }
  res.json({ success: true, count: success, failed });
});

// POST /api/orders/:id/revert-confirm - Move back to Pending (CS side)
router.post('/:id/revert-confirm', (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    db.prepare("UPDATE orders SET delivery_status = 'Pending', status_date = datetime('now') WHERE id = ?")
      .run(orderId);
    broadcast('message', { type: 'order_updated', orderId: orderId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/:id/confirm - Mark as ready for booking (CS side)
router.post('/:id/confirm', (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const result = db.prepare("UPDATE orders SET delivery_status = 'Confirmed', status_date = datetime('now') WHERE id = ?")
      .run(orderId);
      
    console.log(`✅ Order ${orderId} confirmed. Rows affected: ${result.changes}`);
      
    // Broadcast update for real-time UI refresh
    broadcast('message', { type: 'order_updated', orderId: orderId });
    
    res.json({ success: true, changes: result.changes });
  } catch (err) {
    console.error('Confirmation Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/:id/book-postex - Create a real booking in PostEx
router.post('/:id/book-postex', async (req, res) => {
  const { createPostExOrder } = require('../engines/postex');
  const { fulfillShopifyOrder } = require('../engines/shopify');
  const { getBestMatch } = require('../engines/logistics');
  
  try {
    const order = db.prepare('SELECT o.*, s.shop_domain, s.access_token, s.postex_token FROM orders o JOIN stores s ON o.store_id = s.id WHERE o.id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.tracking_number && order.tracking_number.trim() !== '') {
      return res.status(400).json({ error: 'Order already has a tracking number' });
    }

    // Smart City Mapping
    const matchedCity = getBestMatch(order.city, 'PostEx');
    if (matchedCity) order.city = matchedCity;

    // 1. Create booking in PostEx
    const trackingNumber = await createPostExOrder(order, order);
    
    // 2. Update local database
    db.prepare('UPDATE orders SET tracking_number = ?, courier = ?, delivery_status = "Booked", status_date = datetime("now") WHERE id = ?')
      .run(trackingNumber, 'PostEx', req.params.id);

    // 3. Fulfill in Shopify
    try {
      await fulfillShopifyOrder(order, order.shopify_order_id, trackingNumber, 'PostEx');
    } catch (shopifyErr) {
      console.warn('PostEx Booked but Shopify Fulfillment Failed:', shopifyErr.message);
    }

    res.json({ success: true, tracking_number: trackingNumber });
  } catch (err) {
    console.error('PostEx Booking Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/:id/book-instaworld - Create a real booking in Instaworld
router.post('/:id/book-instaworld', async (req, res) => {
  const { createInstaworldOrder } = require('../engines/instaworld');
  const { fulfillShopifyOrder } = require('../engines/shopify');
  const { getBestMatch } = require('../engines/logistics');
  const { courier_name } = req.body; // TCS, LCS, Leopards
  
  try {
    const order = db.prepare('SELECT o.*, s.shop_domain, s.access_token, s.instaworld_key, s.store_name FROM orders o JOIN stores s ON o.store_id = s.id WHERE o.id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.tracking_number && order.tracking_number.trim() !== '') {
      return res.status(400).json({ error: 'Order already has a tracking number' });
    }

    // Smart City Mapping
    const matchedCity = getBestMatch(order.city, 'Instaworld');
    if (matchedCity) order.city = matchedCity;

    // 1. Create booking
    const trackingNumber = await createInstaworldOrder(order, order, courier_name || 'TCS');
    
    // 2. Update local database
    db.prepare('UPDATE orders SET tracking_number = ?, courier = ?, delivery_status = "Booked", status_date = datetime("now") WHERE id = ?')
      .run(trackingNumber, courier_name || 'Instaworld', req.params.id);

    // 3. Fulfill in Shopify
    try {
      await fulfillShopifyOrder(order, order.shopify_order_id, trackingNumber, courier_name || 'Instaworld');
    } catch (shopifyErr) {
      console.warn('Instaworld Booked but Shopify Fulfillment Failed:', shopifyErr.message);
    }

    res.json({ success: true, tracking_number: trackingNumber });
  } catch (err) {
    console.error('Instaworld Booking Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/:id/cancel-booking - Cancel a booking and clear tracking
router.post('/:id/cancel-booking', async (req, res) => {
  const { cancelPostExOrder } = require('../engines/postex');
  const { cancelInstaworldOrder } = require('../engines/instaworld');
  
  try {
    const order = db.prepare('SELECT o.*, s.postex_token, s.instaworld_key FROM orders o JOIN stores s ON o.store_id = s.id WHERE o.id = ?').get(req.params.id);
    if (!order || !order.tracking_number) return res.status(404).json({ error: 'Order has no booking to cancel' });

    const courier = (order.courier || '').toLowerCase();
    let success = false;

    if (courier.includes('postex')) {
      success = await cancelPostExOrder(order, order.tracking_number);
    } else if (courier.includes('insta') || courier.includes('tcs') || courier.includes('lcs') || courier.includes('leopard')) {
      success = await cancelInstaworldOrder(order, order.tracking_number);
    } else {
      // Manual cancellation for others
      success = true;
    }

    if (success) {
      db.prepare('UPDATE orders SET tracking_number = NULL, delivery_status = "Confirmed", status_date = datetime("now") WHERE id = ?')
        .run(req.params.id);
      res.json({ success: true });
    } else {
      res.status(500).json({ error: 'Courier API rejected cancellation' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/logistics/cities - Fetch valid cities for a courier
router.get('/logistics/cities', (req, res) => {
  const { courier } = req.query;
  const cities = db.prepare('SELECT city_name FROM courier_cities WHERE courier = ? ORDER BY city_name ASC').all(courier || 'PostEx');
  res.json(cities.map(c => c.city_name));
});

// POST /api/logistics/sync-cities - Force sync cities from courier APIs
router.post('/logistics/sync-cities', async (req, res) => {
  const { fetchPostExCities } = require('../engines/postex');
  const { fetchInstaworldCities } = require('../engines/instaworld');
  const { syncCourierCities } = require('../engines/logistics');
  
  try {
    const stores = db.prepare('SELECT id, postex_token, instaworld_key FROM stores').all();
    for (const store of stores) {
      if (store.postex_token) await syncCourierCities('PostEx', fetchPostExCities, store.postex_token);
      if (store.instaworld_key) await syncCourierCities('Instaworld', fetchInstaworldCities, store.instaworld_key);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
