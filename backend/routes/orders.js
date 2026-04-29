const express = require('express');
const router = express.Router();
const db = require('../db');
const fetch = require('node-fetch');

// GET /api/orders?store_id=1&page=1&limit=100&status=&search=
router.get('/', (req, res) => {
  const { store_id, page = 1, limit = 100, status, search, courier } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });

  let conditions = ['store_id = ?'];
  let params = [store_id];

  if (status) { conditions.push('LOWER(delivery_status) = ?'); params.push(status.toLowerCase()); }
  if (courier) { conditions.push('LOWER(courier) = ?'); params.push(courier.toLowerCase()); }
  if (search) {
    conditions.push('(tracking_number LIKE ? OR customer_name LIKE ? OR ref_number LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const where = conditions.join(' AND ');
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const total = db.prepare(`SELECT COUNT(*) as count FROM orders WHERE ${where}`).get(...params);
  const orders = db.prepare(`
    SELECT o.*, s.shop_domain 
    FROM orders o
    JOIN stores s ON o.store_id = s.id
    WHERE ${where.replace(/store_id/g, 'o.store_id')}
    ORDER BY o.created_timestamp DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  res.json({ orders, total: total.count, page: parseInt(page), limit: parseInt(limit) });
});

// PUT /api/orders/:id - Update a single order field (for manual edits)
router.put('/:id', (req, res) => {
  const allowed = ['delivery_status', 'payment_status', 'notes', 'paid_amount', 'payment_ref', 'courier_fee', 'hold_reason', 'return_status'];
  const updates = Object.keys(req.body).filter(k => allowed.includes(k));
  if (!updates.length) return res.status(400).json({ error: 'No valid fields to update' });

  const extraSets = [];
  const extraValues = [];
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

// POST /api/orders/:id/book-postex - Create a real booking in PostEx
router.post('/:id/book-postex', async (req, res) => {
  const { createPostExOrder } = require('../engines/postex');
  const { fulfillShopifyOrder } = require('../engines/shopify');
  
  try {
    const order = db.prepare('SELECT o.*, s.shop_domain, s.access_token, s.postex_token FROM orders o JOIN stores s ON o.store_id = s.id WHERE o.id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.tracking_number && order.tracking_number.trim() !== '') {
      return res.status(400).json({ error: 'Order already has a tracking number' });
    }

    // 1. Create booking in PostEx
    const trackingNumber = await createPostExOrder(order, order);
    
    // 2. Update local database
    db.prepare('UPDATE orders SET tracking_number = ?, courier = ?, delivery_status = ?, status_date = datetime("now") WHERE id = ?')
      .run(trackingNumber, 'PostEx', 'Booked', req.params.id);

    // 3. Fulfill in Shopify
    try {
      await fulfillShopifyOrder(order, order.shopify_order_id, trackingNumber, 'PostEx');
    } catch (shopifyErr) {
      console.warn('PostEx Booked but Shopify Fulfillment Failed:', shopifyErr.message);
      // We don't fail the whole request because the booking is already done in PostEx
    }

    res.json({ success: true, tracking_number: trackingNumber });
  } catch (err) {
    console.error('PostEx Booking Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
