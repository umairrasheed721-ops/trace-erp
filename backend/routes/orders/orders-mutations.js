const express = require('express');
const router = express.Router();
const db = require('../../db');
const fetch = require('node-fetch');
const { broadcast } = require('../../sse');

// PUT /api/orders/:id/cs-update - Advanced CS edit (Line items, Discounts, Price)
router.put('/:id/cs-update', async (req, res) => {
  const { id } = req.params;
  const { line_items, price, discount_amount, shipping_fee } = req.body;

  try {
    const oldOrder = db.db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (!oldOrder) return res.status(404).json({ error: 'Order not found' });

    const newItemsStr = JSON.stringify(line_items || []);
    
    // Calculate new total cost based on new line items
    let totalCost = 0;
    const items = line_items || [];
    for (const item of items) {
      if (item.sku) {
        const costRow = db.db.prepare('SELECT unit_cost FROM product_master_costs WHERE store_id = ? AND sku = ?').get(oldOrder.store_id, item.sku);
        if (costRow) {
          totalCost += (costRow.unit_cost * item.quantity);
        }
      }
    }

    const newItemsCount = items.reduce((acc, item) => acc + parseInt(item.quantity || 0), 0);
    const newProductTitles = items.map(i => `${i.title} (x${i.quantity})`).join(', ');

    db.db.prepare(`
      UPDATE orders SET 
        line_items = ?,
        price = ?,
        cost = ?,
        items_count = ?,
        product_titles = ?,
        discount_amount = ?,
        cs_notes = ?,
        shipping_fee = ?,
        notes = json_set(COALESCE(notes, '{}'), '$.cs_discount', ?)
      WHERE id = ?
    `).run(newItemsStr, price, totalCost, newItemsCount, newProductTitles, discount_amount, req.body.cs_notes || '', shipping_fee || 0, discount_amount, id);

    const newOrder = db.db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    
    db.logOrderChange({
      order_id: id,
      user_id: req.user?.id,
      type: 'CS_EDIT',
      old_val: oldOrder,
      new_val: newOrder
    });

    // Sync to Shopify: Add a note indicating the order was edited via ERP
    if (newOrder.shopify_order_id && newOrder.store_id) {
      const store = db.db.prepare('SELECT * FROM stores WHERE id = ?').get(newOrder.store_id);
      if (store) {
        const { appendShopifyNote } = require('../../engines/shopify_finance');
        const note = `[TRACE ERP] Order manually edited by CS. New Total: Rs ${price}. Discount applied: Rs ${discount_amount}.`;
        appendShopifyNote(store, newOrder.shopify_order_id, note).catch(console.error);
      }
    }

    broadcast('order_updated', { storeId: newOrder.store_id, shopifyOrderId: newOrder.shopify_order_id });
    res.json({ success: true, order: newOrder });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/orders/:id - Update a single order field (for manual edits)
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const allowed = ['delivery_status', 'payment_status', 'notes', 'paid_amount', 'payment_ref', 'courier_fee', 'shipping_fee', 'hold_reason', 'return_status', 'cost', 'customer_name', 'phone', 'city', 'address', 'address1', 'address2', 'province', 'zip', 'tracking_number', 'courier'];
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

    // 5. SHOPIFY LIVE SYNC: Push notes, address, or city changes to Shopify
    const hasAddressChange = req.body.address !== undefined || req.body.city !== undefined || req.body.phone !== undefined || req.body.address1 !== undefined || req.body.province !== undefined || req.body.zip !== undefined;
    const hasNoteChange = req.body.notes !== undefined;

    if (hasNoteChange || hasAddressChange) {
      try {
        const order = db.prepare('SELECT o.*, s.shop_domain, s.access_token FROM orders o JOIN stores s ON o.store_id = s.id WHERE o.id = ?').get(req.params.id);
        if (order && order.shopify_order_id) {
          const shopifyUrl = `https://${order.shop_domain}/admin/api/2024-10/orders/${order.shopify_order_id}.json`;
          const shopifyPayload = { order: { id: order.shopify_order_id } };

          if (hasNoteChange) {
            shopifyPayload.order.note = req.body.notes;
          }

          if (hasAddressChange) {
            // Build shipping_address from what was changed, falling back to DB values for unset fields
            shopifyPayload.order.shipping_address = {
              address1: req.body.address || req.body.address1 || order.address || order.address1 || '',
              address2: req.body.address2 || order.address2 || '',
              city:     req.body.city     || order.city     || '',
              province: req.body.province || order.province || '',
              zip:      req.body.zip      || order.zip      || '',
              phone:    req.body.phone    || order.phone    || '',
              country:  order.country     || 'PK',
            };
          }

          console.log(`📦 [ADDRESS_SYNC] Pushing to Shopify order ${order.shopify_order_id}:`, JSON.stringify(shopifyPayload.order.shipping_address || {}));

          fetch(shopifyUrl, {
            method: 'PUT',
            headers: {
              'X-Shopify-Access-Token': order.access_token,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(shopifyPayload)
          }).then(async sRes => {
            if (!sRes.ok) {
              const errBody = await sRes.text();
              console.error(`⚠️ [ADDRESS_SYNC] Shopify rejected update for order ${order.shopify_order_id}: ${sRes.status} — ${errBody}`);
            } else {
              console.log(`✅ [ADDRESS_SYNC] Shopify address updated for order ${order.shopify_order_id}`);
            }
          }).catch(err => console.error('❌ [ADDRESS_SYNC] Failed to push to Shopify:', err.message));
        }
      } catch (shopifyErr) {
        // Dual-save: local DB update succeeded above — Shopify failure is non-blocking
        console.error('⚠️ [ADDRESS_SYNC] Shopify sync error (local DB still saved):', shopifyErr.message);
      }
    }

    // Return updated row so frontend can reflect all auto-changes
    const updated = db.prepare(`
      SELECT o.*, s.shop_domain,
             (
               SELECT COUNT(*) 
               FROM orders 
               WHERE (phone IS NOT NULL AND phone != '' AND o.phone IS NOT NULL AND o.phone != '' AND SUBSTR(phone, -10) = SUBSTR(o.phone, -10))
                  OR (email = o.email AND o.email IS NOT NULL AND o.email != '')
             ) as customer_order_count,
             (
               SELECT direction 
               FROM whatsapp_messages 
               WHERE (order_id = o.id 
                  OR phone = o.phone 
                  OR phone = REPLACE(o.phone, '+', '') 
                  OR SUBSTR(phone, -10) = SUBSTR(REPLACE(o.phone, '+', ''), -10))
                 AND tenant_id = o.tenant_id
               ORDER BY id DESC LIMIT 1
             ) as last_wa_direction,
             (
               SELECT status 
               FROM whatsapp_messages 
               WHERE (order_id = o.id 
                  OR phone = o.phone 
                  OR phone = REPLACE(o.phone, '+', '') 
                  OR SUBSTR(phone, -10) = SUBSTR(REPLACE(o.phone, '+', ''), -10))
                 AND tenant_id = o.tenant_id
               ORDER BY id DESC LIMIT 1
             ) as last_wa_status
      FROM orders o 
      JOIN stores s ON o.store_id = s.id 
      WHERE o.id = ?
    `).get(req.params.id);
    if (updated) {
      broadcast('order_updated', { storeId: updated.store_id, shopifyOrderId: updated.shopify_order_id });
    }
    res.json({ success: true, order: updated });
  } catch (err) {
    console.error('❌ Manual update error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/:id/address - Update order address locally and on Shopify
router.post('/:id/address', async (req, res) => {
  const { address } = req.body;
  const { updateShopifyAddress } = require('../../engines/shopify');
  try {
    const order = db.prepare('SELECT o.shopify_order_id, s.shop_domain, s.access_token FROM orders o JOIN stores s ON o.store_id = s.id WHERE o.id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // 1. Update Shopify
    await updateShopifyAddress(order, order.shopify_order_id, address);

    // 2. Update local DB
    db.prepare('UPDATE orders SET address = ? WHERE id = ?').run(address, req.params.id);

    const updated = db.prepare('SELECT store_id, shopify_order_id FROM orders WHERE id = ?').get(req.params.id);
    if (updated) {
      broadcast('order_updated', { storeId: updated.store_id, shopifyOrderId: updated.shopify_order_id });
    }

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

    broadcast('order_updated', { storeId: order.store_id, shopifyOrderId: order.shopify_order_id });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/:id/revert-confirm - Move back to Pending (CS side)
router.post('/:id/revert-confirm', (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const order = db.prepare('SELECT store_id, shopify_order_id FROM orders WHERE id = ?').get(orderId);
    db.prepare("UPDATE orders SET delivery_status = 'Pending', status_date = datetime('now') WHERE id = ?")
      .run(orderId);
    if (order) {
      broadcast('order_updated', { storeId: order.store_id, shopifyOrderId: order.shopify_order_id });
    }
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
    const order = db.prepare('SELECT store_id, shopify_order_id, delivery_status FROM orders WHERE id = ?').get(orderId);
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

    broadcast('order_updated', { storeId: order.store_id, shopifyOrderId: order.shopify_order_id });
    res.json({ success: true, from: oldStatus, to: erp_status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/:id/confirm - Mark as ready for booking (CS side)
router.post('/:id/confirm', (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const order = db.prepare('SELECT store_id, shopify_order_id FROM orders WHERE id = ?').get(orderId);
    const result = db.prepare("UPDATE orders SET delivery_status = 'Confirmed', status_date = datetime('now') WHERE id = ?")
      .run(orderId);
      
    console.log(`✅ Order ${orderId} confirmed. Rows affected: ${result.changes}`);
      
    if (order) {
      broadcast('order_updated', { storeId: order.store_id, shopifyOrderId: order.shopify_order_id });
    }
    
    res.json({ success: true, changes: result.changes });
  } catch (err) {
    console.error('Confirmation Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/:id/book-postex - Create a real booking in PostEx
router.post('/:id/book-postex', async (req, res) => {
  const { createPostExOrder } = require('../../engines/postex');
  const { fulfillShopifyOrder } = require('../../engines/shopify');
  const { getBestMatch } = require('../../engines/logistics');
  
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
    db.prepare("UPDATE orders SET tracking_number = ?, courier = ?, delivery_status = 'Booked', status_date = datetime('now') WHERE id = ?")
      .run(trackingNumber, 'PostEx', req.params.id);

    // 3. Fulfill in Shopify
    try {
      await fulfillShopifyOrder(order, order.shopify_order_id, trackingNumber, 'PostEx');
    } catch (shopifyErr) {
      console.warn('PostEx Booked but Shopify Fulfillment Failed:', shopifyErr.message);
    }

    broadcast('order_updated', { storeId: order.store_id, shopifyOrderId: order.shopify_order_id });

    res.json({ success: true, tracking_number: trackingNumber });
  } catch (err) {
    console.error('PostEx Booking Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/:id/book-instaworld - Create a real booking in Instaworld
router.post('/:id/book-instaworld', async (req, res) => {
  const { createInstaworldOrder } = require('../../engines/instaworld');
  const { fulfillShopifyOrder } = require('../../engines/shopify');
  const { getBestMatch } = require('../../engines/logistics');
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
    db.prepare("UPDATE orders SET tracking_number = ?, courier = ?, delivery_status = 'Booked', status_date = datetime('now') WHERE id = ?")
      .run(trackingNumber, courier_name || 'Instaworld', req.params.id);

    // 3. Fulfill in Shopify
    try {
      await fulfillShopifyOrder(order, order.shopify_order_id, trackingNumber, courier_name || 'Instaworld');
    } catch (shopifyErr) {
      console.warn('Instaworld Booked but Shopify Fulfillment Failed:', shopifyErr.message);
    }

    broadcast('order_updated', { storeId: order.store_id, shopifyOrderId: order.shopify_order_id });

    res.json({ success: true, tracking_number: trackingNumber });
  } catch (err) {
    console.error('Instaworld Booking Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/:id/cancel-booking - Cancel a booking and clear tracking
router.post('/:id/cancel-booking', async (req, res) => {
  const { cancelPostExOrder } = require('../../engines/postex');
  const { cancelInstaworldOrder } = require('../../engines/instaworld');
  
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
      broadcast('order_updated', { storeId: order.store_id, shopifyOrderId: order.shopify_order_id });
      res.json({ success: true });
    } else {
      res.status(500).json({ error: 'Courier API rejected cancellation' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/logistics/sync-cities - Force sync cities from courier APIs
router.post('/logistics/sync-cities', async (req, res) => {
  const { fetchPostExCities } = require('../../engines/postex');
  const { fetchInstaworldCities } = require('../../engines/instaworld');
  const { syncCourierCities } = require('../../engines/logistics');
  
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

// POST /api/orders/:id/resync - Force sync a specific order from Shopify
router.post('/:id/resync', async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const { resyncSingleOrder } = require('../../services/SyncService');
    const result = await resyncSingleOrder(orderId);
    
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ error: result.error || 'Failed to resync order' });
    }
  } catch (err) {
    console.error('Resync Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
