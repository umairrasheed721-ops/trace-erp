const express = require('express');
const router = express.Router();
const db = require('../../db');
const fetch = typeof globalThis.fetch === 'function' ? globalThis.fetch : require('node-fetch');
const { broadcast } = require('../../sse');
const { getOrderFilters } = require('../../services/orderFilterBuilder');

// POST /api/orders/bulk-update-status - Set delivery_status for tracking numbers
router.post('/bulk-update-status', (req, res) => {
  const { tracking_numbers, status } = req.body;
  if (!Array.isArray(tracking_numbers) || tracking_numbers.length === 0 || !status) {
    return res.status(400).json({ error: 'tracking_numbers array and status required' });
  }

  try {
    const placeholders = tracking_numbers.map(() => '?').join(',');
    const stmt = db.prepare(`
      UPDATE orders 
      SET delivery_status = ?, status_date = datetime('now') 
      WHERE tracking_number IN (${placeholders})
    `);

    const result = stmt.run(status, ...tracking_numbers);
    res.json({ success: true, updatedCount: result.changes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/history-search - Deep search customer history across ALL stores
router.get('/history-search', (req, res) => {
  const { phone, email, name } = req.query;
  if (!phone && !email && !name) return res.status(400).json({ error: 'Search term required' });

  try {
    let whereClauses = [];
    let params = [];

    // Dual-Key Lookup logic (phone OR email)
    let dualKeys = [];
    if (phone && phone.trim() && phone.trim() !== 'null' && phone.trim() !== 'undefined') {
      const cleanPhoneVal = phone.trim().replace(/\D/g, '');
      if (cleanPhoneVal.length >= 10) {
        dualKeys.push('(o.phone IS NOT NULL AND o.phone != \'\' AND SUBSTR(o.phone, -10) = ?)');
        params.push(cleanPhoneVal.slice(-10));
      } else {
        dualKeys.push('o.phone = ?');
        params.push(phone.trim());
      }
    }
    if (email && email.trim() && email.trim() !== 'null' && email.trim() !== 'undefined') {
      dualKeys.push('o.email = ?');
      params.push(email.trim());
    }

    if (dualKeys.length > 0) {
      whereClauses.push(`(${dualKeys.join(' OR ')})`);
    } else if (name && name.trim()) {
      whereClauses.push('o.customer_name LIKE ?');
      params.push(`%${name.trim()}%`);
    }

    if (whereClauses.length === 0) {
      return res.status(400).json({ error: 'Valid search term required' });
    }

    const orders = db.prepare(`
      SELECT o.*, s.shop_domain, s.store_name 
      FROM orders o 
      JOIN stores s ON o.store_id = s.id 
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY o.order_date DESC
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

// GET /api/orders/backlog-dates?store_id=1
router.get('/backlog-dates', (req, res) => {
  const { store_id } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });
  try {
    const rows = db.prepare(`
      SELECT order_date
      FROM orders
      WHERE store_id = ?
        AND LOWER(delivery_status) LIKE '%pending%'
        AND (tracking_number IS NULL OR tracking_number = '' OR tracking_number = '—' OR LENGTH(tracking_number) <= 3)
        AND (courier IS NULL OR courier = '' OR courier = '—')
        AND LOWER(delivery_status) NOT LIKE '%booked%'
        AND LOWER(delivery_status) NOT LIKE '%picked%'
        AND LOWER(delivery_status) NOT LIKE '%transit%'
        AND LOWER(delivery_status) NOT LIKE '%attempt%'
        AND LOWER(delivery_status) NOT LIKE '%delivered%'
        AND LOWER(delivery_status) NOT LIKE '%return%'
        AND LOWER(delivery_status) NOT LIKE '%cancel%'
        AND LOWER(delivery_status) NOT LIKE '%warehouse%'
        AND LOWER(delivery_status) NOT LIKE '%available%'
    `).all(Number(store_id));
    res.json({ dates: rows.map(r => r.order_date).filter(Boolean) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// GET /api/orders/:id/customer-intelligence
router.get('/:id/customer-intelligence', (req, res) => {
  const { id } = req.params;
  try {
    const order = db.prepare(`SELECT store_id, phone, customer_name FROM orders WHERE id = ?`).get(id);
    if (!order || !order.phone) {
      return res.json({ total: 0, delivered: 0, returned: 0, rto_rate: 0, blacklist: false });
    }

    const cleanPhone = order.phone.replace(/\D/g, '').slice(-10);
    const history = db.prepare(`
      SELECT delivery_status 
      FROM orders 
      WHERE store_id = ? AND phone LIKE ?
    `).all(order.store_id, `%${cleanPhone}%`);

    let total = history.length;
    let delivered = history.filter(h => (h.delivery_status || '').toLowerCase().includes('delivered')).length;
    let returned = history.filter(h => (h.delivery_status || '').toLowerCase().includes('returned') || (h.delivery_status || '').toLowerCase().includes('refused')).length;
    let rto_rate = total > 0 ? Math.round((returned / total) * 100) : 0;

    const bl = db.prepare(`SELECT id FROM blacklist WHERE store_id = ? AND tracking_number IN (SELECT tracking_number FROM orders WHERE store_id = ? AND phone LIKE ?)`).get(order.store_id, order.store_id, `%${cleanPhone}%`);

    res.json({ total, delivered, returned, rto_rate, blacklist: !!bl });
  } catch (err) {
    console.error('Customer intelligence error:', err);
    res.status(500).json({ error: 'Server error fetching customer intelligence' });
  }
});

// Simple in-memory count cache (10s TTL) to avoid double COUNT(*) on same filters
const _countCache = new Map();
const COUNT_CACHE_TTL = 10000; // 10 seconds

// GET /api/orders?store_id=1&page=1&limit=100&status=&search=&start_date=&end_date=
router.get('/', (req, res) => {
  try {
    const { store_id, page = 1, limit = 100 } = req.query;
    if (!store_id) return res.status(400).json({ error: 'store_id required' });
    
    const { where, queryParams } = getOrderFilters(req);
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Dynamic Sorting
    const allowedSortCols = [
      'order_date', 
      'created_timestamp', 
      'price', 
      'delivery_status', 
      'customer_name', 
      'cost', 
      'courier_fee', 
      'profit',
      'ref_number',
      'phone',
      'address',
      'city',
      'tracking_number',
      'courier',
      'courier_status',
      'payment_status',
      'paid_amount',
      'order_source',
      'status_date',
      'payment_ref',
      'payment_date',
      'postex_weight',
      'notes'
    ];
    const { sort: sortCol = 'created_timestamp', sort_dir = 'DESC' } = req.query;
    const safeSort = allowedSortCols.includes(sortCol) ? sortCol : 'created_timestamp';
    const safeDir = sort_dir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    let sortExpression = `o.${safeSort}`;
    if (safeSort === 'profit') {
      sortExpression = `(COALESCE(o.price, 0) - COALESCE(o.cost, 0) - COALESCE(o.courier_fee, 0))`;
    }

    // COUNT cache: avoid hitting DB on every page change for same filter
    const cacheKey = `${where}::${JSON.stringify(queryParams)}`;
    const now = Date.now();
    let totalCount;
    const cached = _countCache.get(cacheKey);
    if (cached && (now - cached.ts) < COUNT_CACHE_TTL) {
      totalCount = cached.count;
    } else {
      const countRow = db.prepare(`SELECT COUNT(*) as count FROM orders o WHERE ${where}`).get(...queryParams);
      totalCount = countRow.count;
      _countCache.set(cacheKey, { count: totalCount, ts: now });
      if (_countCache.size > 100) {
        const oldestKey = _countCache.keys().next().value;
        _countCache.delete(oldestKey);
      }
    }

    const orders = db.prepare(`
      SELECT o.*, s.shop_domain, s.store_name,
             (
               SELECT COUNT(*) FROM (
                 SELECT id FROM orders 
                 WHERE phone IS NOT NULL AND phone != '' AND o.phone IS NOT NULL AND o.phone != ''
                   AND SUBSTR(phone, -10) = SUBSTR(o.phone, -10)
                 UNION
                 SELECT id FROM orders 
                 WHERE email = o.email AND o.email IS NOT NULL AND o.email != ''
               )
             ) as customer_order_count,
             (
               SELECT direction FROM (
                 SELECT direction, id FROM whatsapp_messages WHERE order_id = o.id AND tenant_id = o.tenant_id
                 UNION ALL
                 SELECT direction, id FROM whatsapp_messages WHERE phone = o.phone AND tenant_id = o.tenant_id
                 UNION ALL
                 SELECT direction, id FROM whatsapp_messages WHERE phone = REPLACE(o.phone, '+', '') AND tenant_id = o.tenant_id
                 UNION ALL
                 SELECT direction, id FROM whatsapp_messages WHERE SUBSTR(phone, -10) = SUBSTR(REPLACE(o.phone, '+', ''), -10) AND tenant_id = o.tenant_id
               ) ORDER BY id DESC LIMIT 1
             ) as last_wa_direction,
             (
               SELECT status FROM (
                 SELECT status, id FROM whatsapp_messages WHERE order_id = o.id AND tenant_id = o.tenant_id
                 UNION ALL
                 SELECT status, id FROM whatsapp_messages WHERE phone = o.phone AND tenant_id = o.tenant_id
                 UNION ALL
                 SELECT status, id FROM whatsapp_messages WHERE phone = REPLACE(o.phone, '+', '') AND tenant_id = o.tenant_id
                 UNION ALL
                 SELECT status, id FROM whatsapp_messages WHERE SUBSTR(phone, -10) = SUBSTR(REPLACE(o.phone, '+', ''), -10) AND tenant_id = o.tenant_id
               ) ORDER BY id DESC LIMIT 1
             ) as last_wa_status
      FROM orders o
      JOIN stores s ON o.store_id = s.id
      WHERE ${where}
      ORDER BY ${sortExpression} ${safeDir}
      LIMIT ? OFFSET ?
    `).all(...queryParams, parseInt(limit), offset);

    // ── WA ERP Status Merge (JS-level, crash-safe) ────────────────────────────
    // Fetches wa_erp_status from whatsapp_polls in a separate query and merges
    // it into the order objects. Wrapped in try/catch so if whatsapp_polls
    // doesn't exist (new containers) or errors for any reason, the orders
    // response is still sent successfully — wa_erp_status just won't be set.
    if (orders.length > 0) {
      try {
        const orderIds = orders.map(o => o.id);
        const placeholders = orderIds.map(() => '?').join(',');
        const pollRows = db.prepare(
          `SELECT order_id, erp_status
           FROM whatsapp_polls
           WHERE order_id IN (${placeholders})
           GROUP BY order_id
           HAVING id = MAX(id)`
        ).all(...orderIds);

        if (pollRows && pollRows.length > 0) {
          const statusMap = {};
          pollRows.forEach(row => { if (row.order_id) statusMap[row.order_id] = row.erp_status; });
          orders.forEach(o => {
            o.wa_status = statusMap[o.id] || null;
            o.wa_erp_status = statusMap[o.id] || null;
          });
        }
      } catch (waErr) {
        // Non-fatal: whatsapp_polls may not exist on fresh containers
        // Orders are still returned correctly without wa_erp_status
        console.warn('[WA Status Merge] Skipped:', waErr.message);
      }
    }

    res.json({ 
      orders, 
      total: totalCount, 
      page: parseInt(page), 
      limit: parseInt(limit),
      debugWhere: where
    });
  } catch (err) {
    console.error('Error fetching orders:', err);
    res.status(500).json({ error: 'Failed to fetch orders due to database error' });
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
    const { mapShopifyStatus } = require('../../engines/shopify');
    const newStatus = mapShopifyStatus(shopifyOrder);
    
    // Check if we should update the status
    const { isFinalStatus } = require('../../engines/tracking/statusMapper');
    const isProtected = isFinalStatus(order.delivery_status);
    
    if (!isProtected && newStatus !== order.delivery_status) {
      db.prepare('UPDATE orders SET delivery_status = ?, status_date = datetime("now") WHERE id = ?').run(newStatus, order.id);
      order.delivery_status = newStatus;
    }

    // 🚀 GOD-TIER IMAGE RESOLVER: Use GraphQL for batch accuracy & speed
    const { fetchVariantImagesGraphQL } = require('../../engines/shopify');
    const variantIds = shopifyOrder.line_items.map(li => li.variant_id);
    const imageMap = await fetchVariantImagesGraphQL(order.shop_domain, order.access_token, variantIds);

    const lineItems = shopifyOrder.line_items.map(item => {
      const qty = item.current_quantity !== undefined ? item.current_quantity : item.quantity;
      return {
        id: item.id,
        variant_id: item.variant_id,
        product_id: item.product_id,
        title: item.title,
        sku: item.sku,
        quantity: qty,
        price: item.price,
        variant_title: item.variant_title,
        image_url: imageMap[String(item.variant_id)] || null
      };
    }).filter(item => item.quantity > 0);

    // 💾 SMART PERSISTENCE: Save to local DB so next time is INSTANT
    db.prepare("UPDATE orders SET line_items = ? WHERE id = ?").run(JSON.stringify(lineItems), order.id);

    // Extract and flatten customer/price info from Shopify
    const sa = shopifyOrder.shipping_address || {};
    const customer_name = sa.name || `${sa.first_name || ''} ${sa.last_name || ''}`.trim() || order.customer_name;
    const phone = sa.phone || order.phone;
    const address = `${sa.address1 || ''} ${sa.address2 || ''}`.trim() || order.address;
    const city = sa.city || order.city;
    const price = order.is_cs_edited === 1 
      ? order.price 
      : (parseFloat(shopifyOrder.current_total_price || shopifyOrder.total_price) || order.price);
    const ref_number = shopifyOrder.name || order.ref_number;
    const notes = shopifyOrder.note !== undefined && shopifyOrder.note !== null ? shopifyOrder.note : (order.notes || '');

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
      ...shopifyOrder,
      ...order,
      shopify_order_id: shopifyOrder.id || order.shopify_order_id,
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
    console.warn(`Shopify live fetch failed for order ${order.id}: ${err.message}. Returning local SQLite order.`);
    let parsedItems = [];
    try {
      parsedItems = typeof order.line_items === 'string' ? JSON.parse(order.line_items) : (order.line_items || []);
    } catch(e) {}
    res.json({
      ...order,
      line_items: parsedItems,
      line_items_parsed: parsedItems,
      fallback_local: true
    });
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
    SELECT o.*, s.shop_domain,
           (
             SELECT COUNT(*) FROM (
               SELECT id FROM orders 
               WHERE phone IS NOT NULL AND phone != '' AND o.phone IS NOT NULL AND o.phone != '' AND SUBSTR(phone, -10) = SUBSTR(o.phone, -10)
               UNION
               SELECT id FROM orders 
               WHERE email = o.email AND o.email IS NOT NULL AND o.email != ''
             )
           ) as customer_order_count,
           (
             SELECT direction FROM (
               SELECT direction, id FROM whatsapp_messages WHERE order_id = o.id AND tenant_id = o.tenant_id
               UNION ALL
               SELECT direction, id FROM whatsapp_messages WHERE phone = o.phone AND tenant_id = o.tenant_id
               UNION ALL
               SELECT direction, id FROM whatsapp_messages WHERE phone = REPLACE(o.phone, '+', '') AND tenant_id = o.tenant_id
               UNION ALL
               SELECT direction, id FROM whatsapp_messages WHERE SUBSTR(phone, -10) = SUBSTR(REPLACE(o.phone, '+', ''), -10) AND tenant_id = o.tenant_id
             ) ORDER BY id DESC LIMIT 1
           ) as last_wa_direction,
           (
             SELECT status FROM (
               SELECT status, id FROM whatsapp_messages WHERE order_id = o.id AND tenant_id = o.tenant_id
               UNION ALL
               SELECT status, id FROM whatsapp_messages WHERE phone = o.phone AND tenant_id = o.tenant_id
               UNION ALL
               SELECT status, id FROM whatsapp_messages WHERE phone = REPLACE(o.phone, '+', '') AND tenant_id = o.tenant_id
               UNION ALL
               SELECT status, id FROM whatsapp_messages WHERE SUBSTR(phone, -10) = SUBSTR(REPLACE(o.phone, '+', ''), -10) AND tenant_id = o.tenant_id
             ) ORDER BY id DESC LIMIT 1
           ) as last_wa_status
    FROM orders o 
    JOIN stores s ON o.store_id = s.id 
    WHERE o.shopify_order_id = ?
  `).get(req.params.id);

  if (order) {
    try {
      const pollRow = db.prepare(
        `SELECT erp_status FROM whatsapp_polls WHERE order_id = ? ORDER BY id DESC LIMIT 1`
      ).get(order.id);
      order.wa_status = pollRow ? pollRow.erp_status : null;
      order.wa_erp_status = pollRow ? pollRow.erp_status : null;
    } catch (waErr) {
      console.warn('[WA Status Merge Single] Skipped:', waErr.message);
    }
  }

  res.json(order);
});

// GET /api/logistics/couriers - Fetch unique couriers active in the database
router.get('/logistics/couriers', (req, res) => {
  try {
    const rows = db.prepare("SELECT DISTINCT courier FROM orders WHERE courier IS NOT NULL AND courier != '' AND courier != '—' ORDER BY courier ASC").all();
    res.json(rows.map(r => r.courier));
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

module.exports = router;
