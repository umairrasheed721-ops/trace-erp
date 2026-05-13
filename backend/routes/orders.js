const express = require('express');
const router = express.Router();
const db = require('../db');
const fetch = require('node-fetch');
const { broadcast } = require('../sse');

function getOrderFilters(req) {
  const { store_id, status, search, courier, start_date, end_date } = req.query;
  let queryParams = [Number(store_id)];
  let whereClauses = ['o.store_id = ?'];

  if (status && status !== 'All Statuses' && status !== '') {
    const s = status.toUpperCase().trim();
    if (s.includes('ACTIVE PIPELINE')) {
      whereClauses.push("o.tracking_number IS NOT NULL AND o.tracking_number != '' AND o.tracking_number != '—' AND LOWER(o.delivery_status) NOT IN ('delivered', 'return received', 'cancelled', 'returned', 'void', 'voided')");
    } else if (s.includes('UNBOOKED')) {
      whereClauses.push("(o.tracking_number IS NULL OR o.tracking_number = '' OR o.tracking_number = '—') AND LOWER(o.delivery_status) NOT IN ('delivered', 'return received', 'cancelled', 'returned', 'void', 'voided')");
    } else if (s.includes('[RETURNED]')) {
      whereClauses.push("LOWER(o.delivery_status) IN ('return received', 'returned')");
    } else if (s.includes('[STUCK PIPELINE]')) {
      whereClauses.push(`
        o.tracking_number IS NOT NULL AND o.tracking_number != ''
        AND LOWER(o.delivery_status) NOT IN ('delivered','return received','paid','pending','cancelled','returned','void','voided')
        AND o.status_date < datetime('now', '+5 hours', '-48 hours')
        AND o.tracking_number NOT IN (SELECT tracking_number FROM blacklist WHERE store_id = o.store_id)
      `);
    } else if (s.includes('[PAID]')) {
      whereClauses.push("o.payment_status = 'Paid'");
    } else if (s.includes('READY TO BOOK')) {
      whereClauses.push("LOWER(o.delivery_status) = 'confirmed' AND (o.tracking_number IS NULL OR o.tracking_number = '' OR o.tracking_number = '—')");
    } else if (s.includes('NO TRACKING')) {
      whereClauses.push("(o.tracking_number IS NULL OR o.tracking_number = '' OR o.tracking_number = '—') AND LOWER(o.delivery_status) != 'cancelled'");
    } else if (s.includes('UNPAID DELIVERED')) {
      whereClauses.push("LOWER(o.delivery_status) LIKE '%delivered%' AND (o.paid_amount IS NULL OR o.paid_amount < 1)");
    } else if (s.includes('MISSING COST')) {
      whereClauses.push("LOWER(o.delivery_status) LIKE '%delivered%' AND (o.cost IS NULL OR o.cost = 0)");
    } else if (s.includes('OVERDUE PAYOUT')) {
      whereClauses.push("LOWER(o.delivery_status) LIKE '%delivered%' AND (o.payment_status != 'Paid' AND o.payment_status != 'Payment Posted' OR o.payment_status IS NULL) AND (julianday('now', '+5 hours') - julianday(COALESCE(o.status_date, o.order_date))) > 10");
    } else if (s.includes('MISSING CHARGES')) {
      whereClauses.push("(o.courier_fee IS NULL OR o.courier_fee < 1) AND LOWER(o.delivery_status) NOT IN ('pending', 'cancelled') AND o.tracking_number IS NOT NULL AND o.tracking_number != ''");
    } else {
      const statuses = status.split(',').map(st => st.trim().toLowerCase());
      if (statuses.length > 1) {
        whereClauses.push(`LOWER(o.delivery_status) IN (${statuses.map(() => '?').join(',')})`);
        statuses.forEach(st => queryParams.push(st));
      } else {
        whereClauses.push('LOWER(o.delivery_status) = ?');
        queryParams.push(statuses[0]);
      }
    }
  }

  if (courier) { whereClauses.push('LOWER(o.courier) = ?'); queryParams.push(courier.toLowerCase()); }
  if (start_date) { whereClauses.push('o.order_date >= ?'); queryParams.push(start_date); }
  if (end_date) { whereClauses.push('o.order_date <= ?'); queryParams.push(end_date); }
  
  if (search) {
    const kw = search.trim().toLowerCase().replace(/^#/, '');
    const tokens = kw.match(/[^\s"']+|"([^"]*)"|'([^']*)'/g) || [];
    
    tokens.forEach(token => {
      token = token.replace(/['"]/g, '');
      const isNegated = token.startsWith('-');
      const actualToken = isNegated ? token.slice(1) : token;
      if (!actualToken) return;

      let clause = '';
      if (actualToken.includes(':')) {
        const [field, value] = actualToken.split(':');
        const target = ['city','phone','courier','ref','status','note'].includes(field) ? field : null;
        if (target === 'city') clause = 'o.city LIKE ?';
        else if (target === 'phone') clause = 'o.phone LIKE ?';
        else if (target === 'courier') clause = 'o.courier LIKE ?';
        else if (target === 'status') clause = 'o.delivery_status LIKE ?';
        else if (target === 'note') clause = 'o.notes LIKE ?';
        else if (target === 'ref') clause = '(o.ref_number LIKE ? OR o.shopify_order_id LIKE ?)';
        
        if (clause) {
          whereClauses.push(isNegated ? `NOT (${clause})` : clause);
          queryParams.push(`%${value}%`);
          if (target === 'ref') queryParams.push(`%${value}%`);
        }
      } else {
        clause = '(o.tracking_number LIKE ? OR o.customer_name LIKE ? OR o.ref_number LIKE ? OR o.shopify_order_id LIKE ? OR o.phone LIKE ? OR o.product_titles LIKE ?)';
        whereClauses.push(isNegated ? `NOT (${clause})` : clause);
        const searchVal = `%${actualToken}%`;
        queryParams.push(searchVal, searchVal, searchVal, searchVal, searchVal, searchVal);
      }
    });
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

  return { where: whereClauses.join(' AND '), queryParams };
}

// GET /api/orders/history-search - Deep search customer history across ALL stores
router.get('/history-search', (req, res) => {
  const { phone, email, name } = req.query;
  if (!phone && !email && !name) return res.status(400).json({ error: 'Search term required' });

  try {
    let where = [];
    let params = [];
    if (phone) { where.push('o.phone LIKE ?'); params.push(`%${phone}%`); }
    if (email) { where.push('o.email LIKE ?'); params.push(`%${email}%`); }
    if (name) { where.push('o.customer_name LIKE ?'); params.push(`%${name}%`); }

    const orders = db.prepare(`
      SELECT o.*, s.shop_domain 
      FROM orders o 
      JOIN stores s ON o.store_id = s.id 
      WHERE ${where.join(' OR ')}
      ORDER BY o.order_date DESC 
      LIMIT 100
    `).all(...params);
    res.json({ orders });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/orders/all-ids?store_id=1&... (same filters as /)
router.get('/all-ids', (req, res) => {
  const { store_id } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });
  const { where, queryParams } = getOrderFilters(req);
  const rows = db.prepare(`SELECT o.id FROM orders o WHERE ${where}`).all(...queryParams);
  res.json({ ids: rows.map(r => r.id) });
});

// GET /api/orders?store_id=1&page=1&limit=100&status=&search=&start_date=&end_date=
router.get('/', (req, res) => {
  const { store_id, page = 1, limit = 100 } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });
  
  const { where, queryParams } = getOrderFilters(req);
  const offset = (parseInt(page) - 1) * parseInt(limit);

  // Dynamic Sorting
  const allowedSortCols = ['order_date', 'created_timestamp', 'price', 'delivery_status', 'customer_name', 'cost'];
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
    limit: parseInt(limit),
    debugWhere: where
  });
});

// PUT /api/orders/:id - Update a single order field (for manual edits)
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const allowed = ['delivery_status', 'payment_status', 'notes', 'paid_amount', 'payment_ref', 'courier_fee', 'hold_reason', 'return_status', 'cost', 'customer_name', 'phone', 'city', 'address1', 'province', 'zip'];
  const updates = Object.keys(req.body).filter(k => allowed.includes(k));
  if (!updates.length) return res.status(400).json({ error: 'No valid fields to update' });

  try {
    // 1. Fetch OLD state
    const oldOrder = db.db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (!oldOrder) return res.status(404).json({ error: 'Order not found' });

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

  db.db.prepare(`UPDATE orders SET ${allSets} WHERE id = ?`).run(...allValues, id);

  // 2. Fetch NEW state and LOG change
  const newOrder = db.db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  db.logOrderChange({
    order_id: id,
    user_id: req.user?.id,
    type: 'MANUAL_EDIT',
    old_val: oldOrder,
    new_val: newOrder
  });

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
} catch (err) {
  console.error('❌ Manual update error:', err.message);
  res.status(500).json({ error: err.message });
}
});

// GET /api/orders/:id/history - Fetch version history for an order
router.get('/:id/history', (req, res) => {
  try {
    const history = db.db.prepare(`
      SELECT h.*, u.username 
      FROM order_history h
      LEFT JOIN users u ON h.user_id = u.id
      WHERE h.order_id = ?
      ORDER BY h.created_at DESC
    `).all(req.params.id);
    res.json({ history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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

    // 🚀 GOD-TIER IMAGE RESOLVER: Use GraphQL for batch accuracy & speed
    const { fetchVariantImagesGraphQL } = require('../engines/shopify');
    const variantIds = shopifyOrder.line_items.map(li => li.variant_id);
    const imageMap = await fetchVariantImagesGraphQL(order.shop_domain, order.access_token, variantIds);

    const lineItems = shopifyOrder.line_items.map(item => ({
      id: item.id,
      variant_id: item.variant_id,
      product_id: item.product_id,
      title: item.title,
      sku: item.sku,
      quantity: item.quantity,
      price: item.price,
      variant_title: item.variant_title,
      image_url: imageMap[String(item.variant_id)] || null
    }));

    // 💾 SMART PERSISTENCE: Save to local DB so next time is INSTANT
    db.prepare("UPDATE orders SET line_items = ? WHERE id = ?").run(JSON.stringify(lineItems), order.id);

    // Extract and flatten customer/price info from Shopify
    const sa = shopifyOrder.shipping_address || {};
    const customer_name = sa.name || `${sa.first_name || ''} ${sa.last_name || ''}`.trim() || order.customer_name;
    const phone = sa.phone || order.phone;
    const address = `${sa.address1 || ''} ${sa.address2 || ''}`.trim() || order.address;
    const city = sa.city || order.city;
    const price = parseFloat(shopifyOrder.total_price) || order.price;
    const ref_number = shopifyOrder.name || order.ref_number;
    const notes = shopifyOrder.note || order.notes;

    // Update local database with full fresh info
    db.prepare(`
      UPDATE orders SET 
        customer_name = ?, 
        phone = ?, 
        address = ?, 
        city = ?, 
        price = ?, 
        ref_number = ?,
        notes = ?,
        line_items = ?
      WHERE id = ?
    `).run(customer_name, phone, address, city, price, ref_number, notes, JSON.stringify(lineItems), order.id);

    // Return the flattened object for the frontend
    const updatedOrder = {
      ...order,
      ...shopifyOrder,
      customer_name,
      phone,
      address,
      city,
      price,
      ref_number,
      notes,
      line_items: lineItems
    };

    res.json(updatedOrder);
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
  const { broadcast } = require('../sse');
  
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
      
      const { syncSpecificOrders } = require('../engines/shopify');
      const count = await syncSpecificOrders(store, shopifyIds);
      updatedCount += count;

      const p = Math.min(i + batchSize, ids.length);
      global.syncProgress[storeId] = { status: `Syncing batch ${Math.ceil(p/batchSize)}...`, processed: p, total: ids.length };
      broadcast('sync_progress', { storeId, status: `Syncing batch ${Math.ceil(p/batchSize)}...`, processed: p, total: ids.length });
    }

    // Mark complete
    global.syncProgress[storeId] = { status: 'Sync Complete', processed: ids.length, total: ids.length };
    broadcast('sync_progress', { storeId, status: 'Sync Complete', processed: ids.length, total: ids.length });
    setTimeout(() => { if (global.syncProgress) delete global.syncProgress[storeId]; }, 5000);

    // Save to notification hub
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

  const { syncSpecificCourierOrders } = require('../engines/tracking');
  const { broadcast } = require('../sse');
  
  try {
    const firstOrder = db.prepare('SELECT store_id FROM orders WHERE id = ?').get(ids[0]);
    if (!firstOrder) throw new Error('No orders found');
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(firstOrder.store_id);
    const storeId = store.id;

    // Set global progress state so Topbar capsule activates
    global.syncProgress = global.syncProgress || {};
    global.syncProgress[storeId] = { status: 'Bulk Courier Sync...', processed: 0, total: ids.length };
    broadcast('sync_progress', { storeId, status: 'Bulk Courier Sync...', processed: 0, total: ids.length });

    const { updatedCount, logs } = await syncSpecificCourierOrders(store, ids, (current, total, message) => {
      const p = Number(current) || 0;
      const t = Number(total) || 0;
      global.syncProgress[storeId] = { status: message || 'Syncing...', processed: p, total: t };
      // Broadcast in unified format so global Topbar capsule picks it up
      broadcast('sync_progress', { storeId, status: message || 'Syncing...', processed: p, total: t });
    });

    // Mark complete and save to Notification Hub
    global.syncProgress[storeId] = { status: 'Sync Complete', processed: ids.length, total: ids.length };
    broadcast('sync_progress', { storeId, status: 'Sync Complete', processed: ids.length, total: ids.length });
    setTimeout(() => { if (global.syncProgress) delete global.syncProgress[storeId]; }, 5000);

    // Save to notification hub log
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

// PATCH /api/orders/:id/erp-status — Manual ERP status override (permissioned users only)
router.patch('/:id/erp-status', (req, res) => {
  const { erp_status, force } = req.body;
  if (!erp_status) return res.status(400).json({ error: 'erp_status required' });

  // 🛡️ Final Status Permission Check
  const finalStatuses = ['delivered', 'return received'];
  const targetStatus = erp_status.toLowerCase();
  const isFinal = finalStatuses.includes(targetStatus);
  const hasPermission = req.user?.role === 'admin' || req.user?.can_set_final_status === 1;

  if (isFinal && !hasPermission) {
    return res.status(403).json({ error: `You do not have permission to mark orders as "${erp_status}". Only authorized users or Super Admins can set final statuses.` });
  }

  // Permission check for non-final overrides
  const canOverride = req.user?.role === 'admin' || req.user?.can_override_erp_status === 1;
  if (!canOverride) return res.status(403).json({ error: 'You do not have authority to manually change ERP status. Contact your admin.' });

  const PROTECTED = ['delivered', 'return received'];
  const orderId = parseInt(req.params.id);

  try {
    const order = db.prepare('SELECT delivery_status FROM orders WHERE id = ?').get(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const currentStatus = (order.delivery_status || '').toLowerCase();
    if (PROTECTED.includes(currentStatus) && !force && req.user?.role !== 'admin') {
      return res.status(409).json({
        error: `Status "${order.delivery_status}" is protected. Only admin can override it.`,
        protected: true
      });
    }

    const oldStatus = order.delivery_status;
    db.prepare("UPDATE orders SET delivery_status = ?, status_date = datetime('now') WHERE id = ?")
      .run(erp_status, orderId);

    // Full audit trail
    db.logOrderChange({ order_id: orderId, user_id: req.user?.id, type: 'ERP_STATUS_MANUAL', old_val: { delivery_status: oldStatus }, new_val: { delivery_status: erp_status } });
    db.logAction({ order_id: orderId, user_id: req.user?.id, action: 'ERP_STATUS_OVERRIDE', details: { from: oldStatus, to: erp_status, by: req.user?.username } });

    broadcast('message', { type: 'order_updated', orderId });
    res.json({ success: true, from: oldStatus, to: erp_status });
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
    const stores = db.prepare('SELECT id, postex_token, instaworld_key, gas_proxy_url FROM stores').all();
    for (const store of stores) {
      if (store.postex_token) await syncCourierCities('PostEx', fetchPostExCities, store.postex_token);
      if (store.instaworld_key) {
        await syncCourierCities('Instaworld', async (t) => fetchInstaworldCities(t, store), store.instaworld_key);
      }
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
