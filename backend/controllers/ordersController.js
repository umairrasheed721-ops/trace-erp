const db = require('../db');
const fetch = typeof globalThis.fetch === 'function' ? globalThis.fetch : require('node-fetch');
const { broadcast } = require('../sse');

// Smart Merge Address helper (moved from route file)
function smartMergeAddress(original, suggested) {
  if (!original || !suggested) return suggested || original;
  
  // Normalize commas and convert to whitespace
  const normOriginal = original.replace(/,/g, ' ');
  const normSuggested = suggested.replace(/,/g, ' ');
  
  // Extract words
  const origWords = normOriginal.split(/\s+/).filter(w => w.trim().length > 0);
  const suggWords = normSuggested.split(/\s+/).filter(w => w.trim().length > 0).map(w => w.toLowerCase());
  
  // Find words in original address that are not present in suggested address
  const extraWords = [];
  origWords.forEach(word => {
    const cleanWord = word.replace(/[^\w]/g, '').toLowerCase();
    if (!cleanWord) return;
    
    const isMatched = suggWords.some(sw => {
      const cleanSw = sw.replace(/[^\w]/g, '');
      return cleanSw === cleanWord || cleanSw.includes(cleanWord) || cleanWord.includes(cleanSw);
    });
    
    if (!isMatched) {
      extraWords.push(word);
    }
  });
  
  // Prepend extra words (like house number, landmark, shop name) to standardized Google address
  if (extraWords.length > 0) {
    const prefix = extraWords.join(' ');
    const cleanSuggested = suggested.replace(/^[, ]+/, '');
    return `${prefix}, ${cleanSuggested}`;
  }
  
  return suggested;
}

exports.csUpdate = async (req, res) => {
  const { id } = req.params;
  const { line_items, price, discount_amount, shipping_fee } = req.body;

  try {
    const oldOrder = db.db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (!oldOrder) return res.status(404).json({ error: 'Order not found' });

    let shopifyWarning = null;
    if (oldOrder.shopify_order_id && oldOrder.store_id) {
      const store = db.db.prepare('SELECT * FROM stores WHERE id = ?').get(oldOrder.store_id);
      if (store && store.access_token && store.access_token !== 'PENDING') {
        try {
          const { editShopifyOrderGraphQL } = require('../engines/shopify/orders');
          await editShopifyOrderGraphQL(store, oldOrder.shopify_order_id, line_items, discount_amount, shipping_fee);
          console.log(`✅ [ShopifyOrderEdit] GraphQL live edit succeeded for order ${oldOrder.shopify_order_id}`);
        } catch (shopifyErr) {
          console.error(`⚠️ [ShopifyOrderEdit] GraphQL live edit failed:`, shopifyErr.message);
          shopifyWarning = `Shopify API rejected live update: ${shopifyErr.message}. Local ERP updated successfully.`;
        }
      }
    }

    const newItemsStr = JSON.stringify(line_items || []);
    
    // Strict SKU / Shopify Variant ID / Alias cost lookup (zero title guessing, zero shopify_cost estimation)
    let totalCost = 0;
    let hasMissingCostItem = false;
    const { resolveOrderLineItemMasterCost } = require('../services/poLedgerService');
    const items = line_items || [];
    for (const item of items) {
      const costRow = resolveOrderLineItemMasterCost(oldOrder.store_id, item);
      const resolvedUnitCost = costRow && (costRow.landed_cost || 0) > 0 ? costRow.landed_cost : 0;

      if (resolvedUnitCost > 0) {
        totalCost += (resolvedUnitCost * item.quantity);
      } else {
        hasMissingCostItem = true;
      }
    }
    if (hasMissingCostItem) {
      totalCost = 0;
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
        is_cs_edited = 1,
        notes = CASE 
          WHEN notes IS NULL OR notes = '' THEN json_set('{}', '$.cs_discount', ?)
          WHEN json_valid(notes) = 1 THEN json_set(notes, '$.cs_discount', ?)
          ELSE notes 
        END
      WHERE id = ?
    `).run(newItemsStr, price, totalCost, newItemsCount, newProductTitles, discount_amount, req.body.cs_notes || '', shipping_fee || 0, discount_amount, discount_amount, id);

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
        const { appendShopifyNote } = require('../engines/shopify_finance');
        const formattedPrice = Number(price || 0).toFixed(2);
        const formattedDiscount = Number(discount_amount || 0).toFixed(2);
        const note = `[TRACE ERP] Order manually edited by CS. New Total: Rs ${formattedPrice}. Discount applied: Rs ${formattedDiscount}.`;
        appendShopifyNote(store, newOrder.shopify_order_id, note).catch(console.error);
      }
    }

    broadcast('order_updated', { storeId: newOrder.store_id, shopifyOrderId: newOrder.shopify_order_id });
    res.json({ success: true, order: newOrder, warning: shopifyWarning });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateOrder = async (req, res) => {
  const { id } = req.params;
  const allowed = ['delivery_status', 'payment_status', 'notes', 'paid_amount', 'payment_ref', 'courier_fee', 'shipping_fee', 'hold_reason', 'return_status', 'cost', 'customer_name', 'phone', 'city', 'address', 'address1', 'address2', 'province', 'zip', 'tracking_number', 'courier', 'courier_remarks', 'pickup_address_code'];
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

    // Auto-stamp delivery_status to Booked if tracking number is set manually and order is Pending/Confirmed
    if (req.body.tracking_number && req.body.tracking_number.trim() !== '') {
      const currentStatus = (oldOrder.delivery_status || '').toLowerCase();
      if (currentStatus === 'pending' || currentStatus === 'confirmed' || !oldOrder.delivery_status) {
        extraSets.push("delivery_status = ?");
        extraValues.push('Booked');
      }
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
        const price = parseFloat(order.price) || 0;
        const newPaymentStatus = (price - paidAmt) <= 1.5 ? 'Paid' : 'Partial';
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
            // Build shipping_address & billing_address from what was changed, falling back to DB values for unset fields
            const addrPayload = {
              first_name: req.body.first_name || (order.customer_name ? order.customer_name.split(' ')[0] : ''),
              last_name:  req.body.last_name  || (order.customer_name ? order.customer_name.split(' ').slice(1).join(' ') : ''),
              address1:   req.body.address || req.body.address1 || order.address || order.address1 || '',
              address2:   req.body.address2 || order.address2 || '',
              city:       req.body.city     || order.city     || '',
              province:   req.body.province || order.province || '',
              zip:        req.body.zip      || order.zip      || '',
              phone:      req.body.phone    || order.phone    || '',
              country:    order.country     || 'PK',
            };
            shopifyPayload.order.shipping_address = addrPayload;
            shopifyPayload.order.billing_address = addrPayload;
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
    // 6. SHOPIFY LIVE SYNC FOR FULFILLMENT: Fulfill order if tracking number/courier updated
    const hasTrackingChange = req.body.tracking_number !== undefined || req.body.courier !== undefined;
    if (hasTrackingChange && newOrder.shopify_order_id && newOrder.store_id) {
      const trackingNo = newOrder.tracking_number;
      const courierName = newOrder.courier;
      if (trackingNo && trackingNo.trim() !== '' && trackingNo !== '—' && courierName && courierName.trim() !== '' && courierName !== 'Unassigned') {
        try {
          const store = db.db.prepare('SELECT * FROM stores WHERE id = ?').get(newOrder.store_id);
          if (store && store.access_token && store.access_token !== 'PENDING') {
            const { fulfillShopifyOrder } = require('../engines/shopify');
            console.log(`📦 [TRACKING_SYNC] Fulfilling order ${newOrder.shopify_order_id} on Shopify with Tracking #${trackingNo} (${courierName})`);
            await fulfillShopifyOrder(store, newOrder.shopify_order_id, trackingNo, courierName);
            console.log(`✅ [TRACKING_SYNC] Shopify fulfillment created for order ${newOrder.shopify_order_id}`);
          }
        } catch (shopifyErr) {
          console.error(`⚠️ [TRACKING_SYNC] Shopify fulfillment failed for order ${newOrder.shopify_order_id}:`, shopifyErr.message);
        }
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
};

exports.updateAddressLocallyAndShopify = async (req, res) => {
  const { address } = req.body;
  const { updateShopifyAddress } = require('../engines/shopify');
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
};

exports.updateAddressLiveShopify = async (req, res) => {
  const { first_name, last_name, address1, address2, city, phone } = req.body;
  const order = db.prepare('SELECT o.*, s.shop_domain, s.access_token FROM orders o JOIN stores s ON o.store_id = s.id WHERE o.id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  try {
    const shopifyUrl = `https://${order.shop_domain}/admin/api/2024-10/orders/${order.shopify_order_id}.json`;
    const addrPayload = { first_name, last_name, address1, address2, city, phone };
    const body = { 
      order: { 
        id: order.shopify_order_id, 
        shipping_address: addrPayload,
        billing_address: addrPayload
      } 
    };

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
};

exports.revertConfirm = async (req, res) => {
  const { READY_TO_BOOK_TAG, mergeOrderTagString, updateShopifyOrderTag } = require('../engines/shopify');
  try {
    const orderId = parseInt(req.params.id);
    const order = db.prepare(`
      SELECT o.id, o.store_id, o.shopify_order_id, o.tracking_number, o.tags, s.shop_domain, s.access_token
      FROM orders o LEFT JOIN stores s ON o.store_id = s.id
      WHERE o.id = ?
    `).get(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (order.tracking_number && String(order.tracking_number).trim() !== '') {
      return res.status(409).json({ error: 'Order has an active tracking number — use Cancel Booking instead of Revert.' });
    }

    const { tags: localTags } = mergeOrderTagString(order.tags, READY_TO_BOOK_TAG, 'remove');
    db.prepare("UPDATE orders SET delivery_status = 'Pending', tags = ?, status_date = datetime('now') WHERE id = ?")
      .run(localTags, orderId);

    let shopifyTagSynced = false;
    let shopifyTagError = null;
    if (order.shopify_order_id && order.shop_domain && order.access_token) {
      const tagRes = await updateShopifyOrderTag(order, order.shopify_order_id, READY_TO_BOOK_TAG, 'remove');
      shopifyTagSynced = Boolean(tagRes.ok);
      if (tagRes.ok && tagRes.tags !== undefined) {
        db.prepare('UPDATE orders SET tags = ? WHERE id = ?').run(tagRes.tags, orderId);
      } else if (!tagRes.ok && !tagRes.skipped) {
        shopifyTagError = tagRes.error;
      }
    }

    broadcast('order_updated', { storeId: order.store_id, shopifyOrderId: order.shopify_order_id });
    res.json({ success: true, shopifyTagSynced, shopifyTagError, tags: localTags });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.patchErpStatus = (req, res) => {
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
    const order = db.prepare('SELECT store_id, shopify_order_id, delivery_status, cost FROM orders WHERE id = ?').get(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const targetLower = erp_status.toLowerCase();
    if ((targetLower === 'confirmed' || targetLower === 'booked') && (!order.cost || order.cost <= 0)) {
      return res.status(400).json({ error: `Zero Cost Block: Cannot set status to "${erp_status}" when cost is not assigned` });
    }

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
};

exports.confirmOrder = async (req, res) => {
  const { READY_TO_BOOK_TAG, mergeOrderTagString, updateShopifyOrderTag } = require('../engines/shopify');
  try {
    const orderId = parseInt(req.params.id);
    const order = db.prepare(`
      SELECT o.id, o.store_id, o.shopify_order_id, o.cost, o.tags, s.shop_domain, s.access_token
      FROM orders o LEFT JOIN stores s ON o.store_id = s.id
      WHERE o.id = ?
    `).get(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!order.cost || order.cost <= 0) {
      return res.status(400).json({ error: 'Zero Cost Block: Please heal cost before confirming' });
    }

    const { tags: localTags } = mergeOrderTagString(order.tags, READY_TO_BOOK_TAG, 'add');
    const result = db.prepare("UPDATE orders SET delivery_status = 'Confirmed', tags = ?, status_date = datetime('now') WHERE id = ?")
      .run(localTags, orderId);

    let shopifyTagSynced = false;
    let shopifyTagError = null;
    if (order.shopify_order_id && order.shop_domain && order.access_token) {
      const tagRes = await updateShopifyOrderTag(order, order.shopify_order_id, READY_TO_BOOK_TAG, 'add');
      shopifyTagSynced = Boolean(tagRes.ok);
      if (tagRes.ok && tagRes.tags !== undefined) {
        db.prepare('UPDATE orders SET tags = ? WHERE id = ?').run(tagRes.tags, orderId);
      } else if (!tagRes.ok && !tagRes.skipped) {
        shopifyTagError = tagRes.error;
      }
    }

    console.log(`✅ Order ${orderId} confirmed (Shopify "${READY_TO_BOOK_TAG}" tag: ${shopifyTagSynced ? 'synced' : shopifyTagError || 'skipped'}).`);
    broadcast('order_updated', { storeId: order.store_id, shopifyOrderId: order.shopify_order_id });

    res.json({ success: true, changes: result.changes, shopifyTagSynced, shopifyTagError, tags: localTags });
  } catch (err) {
    console.error('Confirmation Error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

exports.bookPostex = async (req, res) => {
  const { createPostExOrder } = require('../engines/postex');
  const { fulfillShopifyOrder } = require('../engines/shopify');
  const { getBestMatch } = require('../engines/logistics');

  const { pickup_address_code, remarks, weight, city, cod_amount } = req.body || {};

  try {
    const order = db.prepare(`
      SELECT o.*, s.shop_domain, s.access_token, s.postex_token,
             s.postex_pickup_code, s.default_courier_remarks
      FROM orders o JOIN stores s ON o.store_id = s.id WHERE o.id = ?
    `).get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!order.cost || order.cost <= 0) {
      return res.status(400).json({ error: 'Zero Cost Block: Please heal cost before booking' });
    }
    if (order.tracking_number && order.tracking_number.trim() !== '') {
      return res.status(400).json({ error: 'Order already has a tracking number' });
    }
    const effectiveCity = String(city !== undefined && String(city).trim() !== '' ? city : (order.city || '')).trim();
    if (!effectiveCity) {
      return res.status(400).json({ error: 'Missing City: Please enter a valid delivery city before booking' });
    }
    order.city = effectiveCity;

    // Smart City Mapping
    const matchedCity = getBestMatch(order.city, 'PostEx');
    if (matchedCity) order.city = matchedCity;

    const resolvedPickup = String(
      pickup_address_code !== undefined ? pickup_address_code : (order.pickup_address_code || order.postex_pickup_code || '')
    ).trim();
    const resolvedRemarks = String(
      remarks !== undefined ? remarks : (order.courier_remarks || order.default_courier_remarks || '')
    ).trim();

    // Prepaid Protection + Optional Per-Order Custom COD Override (keeps original order.price intact for PNL/Advance audit!)
    const originalPrice = parseFloat(order.price) || 0;
    const isPrepaid = ['paid', 'payment posted'].includes((order.payment_status || '').toLowerCase());
    const hasCustomCod = cod_amount !== undefined && cod_amount !== null && String(cod_amount).trim() !== '';
    let finalCod = isPrepaid ? 0 : originalPrice;
    let bookedCodToSave = null;
    if (hasCustomCod) {
      const parsedCod = Number(cod_amount);
      if (!Number.isFinite(parsedCod) || parsedCod < 0) {
        return res.status(400).json({ error: 'Invalid COD amount: must be 0 or greater' });
      }
      finalCod = Math.round(parsedCod * 100) / 100;
      if (Math.abs(finalCod - originalPrice) > 0.01) {
        bookedCodToSave = finalCod;
      }
    }
    const bookingPayload = { ...order, price: finalCod, is_prepaid: finalCod === 0 };

    // 1. Create booking in PostEx (with Pickup Location, Slip Remarks & Optional Custom COD)
    const trackingNumber = await createPostExOrder(order, bookingPayload, {
      pickupAddressCode: resolvedPickup,
      remarks: resolvedRemarks,
      codAmount: finalCod,
      weight,
    });

    // 2. Update local database (persist tracking, city, remarks, pickup code & booked_cod_amount — NEVER overwrite order.price)
    db.prepare(`
      UPDATE orders
      SET tracking_number = ?, courier = ?, delivery_status = 'Booked',
          city = ?, courier_remarks = ?, pickup_address_code = ?, booked_cod_amount = ?, status_date = datetime('now')
      WHERE id = ?
    `).run(trackingNumber, 'PostEx', order.city, resolvedRemarks, resolvedPickup, bookedCodToSave, req.params.id);

    // 2b. Autopilot FIFO batch consume & cost lock
    try {
      const { allocateOrderFifoOnDispatch } = require('../services/poLedgerService');
      allocateOrderFifoOnDispatch(req.params.id, req.user?.username || 'Booking');
    } catch (fifoErr) { console.warn('[bookPostex FIFO Notice]:', fifoErr.message); }

    // 3. Fulfill in Shopify (surface warning if Shopify fails)
    let shopifyFulfilled = false;
    let shopifyError = null;
    try {
      await fulfillShopifyOrder(order, order.shopify_order_id, trackingNumber, 'PostEx');
      shopifyFulfilled = true;
      db.prepare("UPDATE orders SET fulfillment_status = 'fulfilled' WHERE id = ?").run(req.params.id);
    } catch (shopifyErr) {
      shopifyError = shopifyErr.message;
      console.warn('PostEx Booked but Shopify Fulfillment Failed:', shopifyErr.message);
    }

    // 3b. Remove "Ready to Book" tag (local + Shopify queue) now that order is booked & fulfilled
    try { require('../services/readyTagSync').clearReadyTagAfterBooking(req.params.id); } catch (_) {}

    broadcast('order_updated', { storeId: order.store_id, shopifyOrderId: order.shopify_order_id });

    res.json({ success: true, tracking_number: trackingNumber, prepaid: finalCod === 0, cod_amount: finalCod, booked_cod_amount: bookedCodToSave, shopifyFulfilled, shopifyError });
  } catch (err) {
    console.error('PostEx Booking Error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

exports.bookInstaworld = async (req, res) => {
  const { createInstaworldOrder } = require('../engines/instaworld');
  const { fulfillShopifyOrder } = require('../engines/shopify');
  const { getBestMatch } = require('../engines/logistics');
  const { account_type, pickup_address, pickup_address_code, remarks, weight, city, cod_amount } = req.body || {};

  try {
    const order = db.prepare(`
      SELECT o.*, s.shop_domain, s.access_token, s.instaworld_key, s.instaworld_key_backup, s.instaworld_key_3,
             s.store_name, s.gas_proxy_url, s.default_courier_remarks, s.instaworld_pickup_address
      FROM orders o JOIN stores s ON o.store_id = s.id WHERE o.id = ?
    `).get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!order.cost || order.cost <= 0) {
      return res.status(400).json({ error: 'Zero Cost Block: Please heal cost before booking' });
    }
    if (order.tracking_number && order.tracking_number.trim() !== '') {
      return res.status(400).json({ error: 'Order already has a tracking number' });
    }
    const effectiveCity = String(city !== undefined && String(city).trim() !== '' ? city : (order.city || '')).trim();
    if (!effectiveCity) {
      return res.status(400).json({ error: 'Missing City: Please enter a valid delivery city before booking' });
    }
    order.city = effectiveCity;

    // Smart City Mapping
    const matchedCity = getBestMatch(order.city, 'Instaworld');
    if (matchedCity) order.city = matchedCity;

    const resolvedPickup = String(
      pickup_address !== undefined
        ? pickup_address
        : (pickup_address_code !== undefined ? pickup_address_code : (order.pickup_address_code || order.instaworld_pickup_address || ''))
    ).trim();
    const resolvedRemarks = String(
      remarks !== undefined ? remarks : (order.courier_remarks || order.default_courier_remarks || '')
    ).trim();

    // Prepaid Protection + Optional Per-Order Custom COD Override (keeps original order.price intact for PNL/Advance audit!)
    const originalPrice = parseFloat(order.price) || 0;
    const isPrepaid = ['paid', 'payment posted'].includes((order.payment_status || '').toLowerCase());
    const hasCustomCod = cod_amount !== undefined && cod_amount !== null && String(cod_amount).trim() !== '';
    let finalCod = isPrepaid ? 0 : originalPrice;
    let bookedCodToSave = null;
    if (hasCustomCod) {
      const parsedCod = Number(cod_amount);
      if (!Number.isFinite(parsedCod) || parsedCod < 0) {
        return res.status(400).json({ error: 'Invalid COD amount: must be 0 or greater' });
      }
      finalCod = Math.round(parsedCod * 100) / 100;
      if (Math.abs(finalCod - originalPrice) > 0.01) {
        bookedCodToSave = finalCod;
      }
    }
    const bookingPayload = { ...order, price: finalCod, is_prepaid: finalCod === 0 };

    let apiKey = order.instaworld_key;
    if (account_type === 'backup') {
      apiKey = order.instaworld_key_backup;
    } else if (account_type === 'key3') {
      apiKey = order.instaworld_key_3;
    }

    // 1. Create booking (default courier_name to TCS under the hood for API compatibility)
    const trackingNumber = await createInstaworldOrder(order, bookingPayload, 'TCS', apiKey, {
      pickupAddress: resolvedPickup,
      remarks: resolvedRemarks,
      codAmount: finalCod,
      weight,
    });

    // 2. Update local database (persist tracking, city, remarks, pickup address & booked_cod_amount — NEVER overwrite order.price)
    db.prepare(`
      UPDATE orders
      SET tracking_number = ?, courier = ?, delivery_status = 'Booked',
          city = ?, courier_remarks = ?, pickup_address_code = ?, booked_cod_amount = ?, status_date = datetime('now')
      WHERE id = ?
    `).run(trackingNumber, 'Instaworld', order.city, resolvedRemarks, resolvedPickup, bookedCodToSave, req.params.id);

    // 2b. Autopilot FIFO batch consume & cost lock
    try {
      const { allocateOrderFifoOnDispatch } = require('../services/poLedgerService');
      allocateOrderFifoOnDispatch(req.params.id, req.user?.username || 'Booking');
    } catch (fifoErr) { console.warn('[bookInstaworld FIFO Notice]:', fifoErr.message); }

    // 3. Fulfill in Shopify (surface warning if Shopify fails)
    let shopifyFulfilled = false;
    let shopifyError = null;
    try {
      await fulfillShopifyOrder(order, order.shopify_order_id, trackingNumber, 'Instaworld');
      shopifyFulfilled = true;
      db.prepare("UPDATE orders SET fulfillment_status = 'fulfilled' WHERE id = ?").run(req.params.id);
    } catch (shopifyErr) {
      shopifyError = shopifyErr.message;
      console.warn('Instaworld Booked but Shopify Fulfillment Failed:', shopifyErr.message);
    }

    // 3b. Remove "Ready to Book" tag (local + Shopify queue) now that order is booked & fulfilled
    try { require('../services/readyTagSync').clearReadyTagAfterBooking(req.params.id); } catch (_) {}

    broadcast('order_updated', { storeId: order.store_id, shopifyOrderId: order.shopify_order_id });

    res.json({ success: true, tracking_number: trackingNumber, prepaid: finalCod === 0, cod_amount: finalCod, booked_cod_amount: bookedCodToSave, shopifyFulfilled, shopifyError });
  } catch (err) {
    console.error('Instaworld Booking Error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

async function cancelOrderBookingCore(orderId, actor = 'CancelBooking', options = {}) {
  const { cancelPostExOrder } = require('../engines/postex');
  const { cancelInstaworldOrder } = require('../engines/instaworld');
  const { strictBookedOnly = false } = options;

  const order = db.prepare(`
    SELECT o.*, s.shop_domain, s.access_token, s.postex_token,
           s.instaworld_key, s.instaworld_key_backup, s.instaworld_key_3, s.gas_proxy_url
    FROM orders o JOIN stores s ON o.store_id = s.id
    WHERE o.id = ?
  `).get(orderId);

  if (!order || !order.tracking_number) {
    return { ok: false, status: 404, error: 'Order has no active booking to cancel' };
  }

  const statusLower = (order.delivery_status || '').trim().toLowerCase();
  const courierStatusLower = (order.courier_status || '').trim().toLowerCase();
  const isUnverifiedPrepaidDelivered = statusLower === 'delivered'
    && (order.payment_status || '').trim().toLowerCase() === 'paid'
    && Number(order.paid_amount || 0) <= 0.9
    && !courierStatusLower.includes('delivered');

  const blockedFinal = ['delivered', 'returned', 'return received', 'cancelled'];
  if (blockedFinal.includes(statusLower) && !isUnverifiedPrepaidDelivered) {
    return { ok: false, status: 409, error: `Cannot cancel booking when order status is '${order.delivery_status}'` };
  }
  if (strictBookedOnly && !['booked', 'pending', 'confirmed', ''].includes(statusLower) && !isUnverifiedPrepaidDelivered) {
    return { ok: false, status: 409, error: `Cannot cancel booking from extension while status is '${order.delivery_status}'` };
  }

  const courier = (order.courier || '').toLowerCase();
  let success = false;

  try {
    if (courier.includes('postex')) {
      success = await cancelPostExOrder(order, order.tracking_number);
    } else if (courier.includes('insta') || courier.includes('tcs') || courier.includes('lcs') || courier.includes('leopard')) {
      success = await cancelInstaworldOrder(order, order.tracking_number);
    } else {
      // Manual cancellation for others
      success = true;
    }
  } catch (courierErr) {
    return { ok: false, status: 502, error: courierErr.message || 'Courier API rejected cancellation' };
  }

  if (!success) {
    return { ok: false, status: 500, error: 'Courier API rejected cancellation' };
  }

  // Cancel Shopify fulfillment & keep order Confirmed + "Ready to Book" tag (only booking is cancelled, NOT confirmation!)
  const { cancelShopifyFulfillment, READY_TO_BOOK_TAG, mergeOrderTagString, updateShopifyOrderTag } = require('../engines/shopify');
  const { tags: localTags } = mergeOrderTagString(order.tags, READY_TO_BOOK_TAG, 'add');

  // 1. Update local DB FIRST (prevents webhook race from cancelShopifyFulfillment downgrading status to Pending)
  // Clear tracking/courier/courier_status (Rule 12) while keeping Confirmed + Ready to Book for re-booking
  db.prepare(`
    UPDATE orders
    SET tracking_number = NULL,
        courier = NULL,
        courier_status = NULL,
        booked_cod_amount = NULL,
        fulfillment_status = 'unfulfilled',
        delivery_status = 'Confirmed',
        tags = ?,
        status_date = datetime('now')
    WHERE id = ?
  `).run(localTags, order.id);

  // 2. Cancel Shopify fulfillment so order becomes Unfulfilled on Shopify
  let shopifyFulfillmentCancelled = false;
  try {
    if (order.shopify_order_id) {
      shopifyFulfillmentCancelled = Boolean(await cancelShopifyFulfillment(order, order.shopify_order_id));
    }
  } catch (shopifyErr) {
    console.warn(`⚠️ Failed to cancel Shopify fulfillment for order ${order.shopify_order_id}:`, shopifyErr.message);
  }

  // 3. Ensure "Ready to Book" tag is present on Shopify (restores tag if auto-removed when booked)
  let shopifyTagSynced = false;
  let finalTags = localTags;
  try {
    if (order.shopify_order_id && order.shop_domain && order.access_token) {
      const tagRes = await updateShopifyOrderTag(order, order.shopify_order_id, READY_TO_BOOK_TAG, 'add');
      shopifyTagSynced = Boolean(tagRes.ok);
      if (tagRes.ok && tagRes.tags !== undefined) {
        finalTags = tagRes.tags;
        db.prepare('UPDATE orders SET tags = ? WHERE id = ?').run(finalTags, order.id);
      }
    }
  } catch (_) {}

  let fifoRestored = false;
  try {
    const { reverseOrderFifoOnCancel } = require('../services/poLedgerService');
    const fifoRes = reverseOrderFifoOnCancel(order.id, actor);
    fifoRestored = Boolean(fifoRes && fifoRes.reversed);
  } catch (fifoErr) {
    console.warn('[cancelBooking FIFO Notice]:', fifoErr.message);
  }

  broadcast('order_updated', { storeId: order.store_id, shopifyOrderId: order.shopify_order_id });

  return {
    ok: true,
    orderId: order.id,
    shopifyOrderId: order.shopify_order_id,
    refNumber: order.ref_number || `#${order.id}`,
    cancelledTracking: order.tracking_number,
    courier: order.courier || '',
    delivery_status: 'Confirmed',
    tags: finalTags,
    shopifyFulfillmentCancelled,
    shopifyTagSynced,
    shopifyTagRemoved: false,
    fifoRestored,
  };
}

exports.cancelOrderBookingCore = cancelOrderBookingCore;

exports.cancelBooking = async (req, res) => {
  try {
    const result = await cancelOrderBookingCore(req.params.id, req.user?.username || 'CancelBooking');
    if (!result.ok) {
      return res.status(result.status || 500).json({ error: result.error });
    }
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.syncCities = async (req, res) => {
  const { syncAllCouriersNow } = require('../engines/logistics');
  try {
    const result = await syncAllCouriersNow({ onlyIfStale: false });
    res.json({
      success: true,
      postex: { count: result.postex?.count || 0, source: result.postex?.source || 'unknown' },
      instaworld: { count: result.instaworld?.count || 0, source: result.instaworld?.source || 'unknown' },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.verifyAdvancePayment = async (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    if (!orderId) return res.status(400).json({ error: 'Invalid order id' });

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const {
      bank_ref = '',
      bank_account = 'Bank / Wallet',
      advance_date = '',
      advance_amount,
      notes = '',
      mark_full_paid = true,
    } = req.body || {};

    const orderPrice = Math.round((parseFloat(order.price) || 0) * 100) / 100;
    const oldPaid = Math.round((parseFloat(order.paid_amount) || 0) * 100) / 100;
    const bookedCod = (order.booked_cod_amount !== null && order.booked_cod_amount !== undefined)
      ? Math.round(Number(order.booked_cod_amount) * 100) / 100
      : null;

    const defaultAdvance = bookedCod !== null
      ? Math.max(0, Math.round((orderPrice - bookedCod) * 100) / 100)
      : Math.max(0, Math.round((orderPrice - oldPaid) * 100) / 100);
    const parsedAdv = (advance_amount !== undefined && advance_amount !== null && String(advance_amount).trim() !== '' && Number.isFinite(Number(advance_amount)))
      ? Math.max(0, Math.round(Number(advance_amount) * 100) / 100)
      : defaultAdvance;

    const newPaid = mark_full_paid
      ? orderPrice
      : Math.min(orderPrice, Math.round((oldPaid + parsedAdv) * 100) / 100);
    const newPaymentStatus = Math.abs(newPaid - orderPrice) <= 0.9 ? 'Paid' : (order.payment_status || 'Pending');

    const cleanDate = String(advance_date || '').trim() || new Date().toISOString().split('T')[0];
    const cleanRef = String(bank_ref || '').trim().slice(0, 120);
    const cleanAcct = String(bank_account || 'Bank / Wallet').trim().slice(0, 60);
    const cleanNotes = String(notes || '').trim().slice(0, 180);
    const actor = req.user?.username || 'Admin';

    const auditTag = `[✅ Advance Verified ${cleanDate}: Rs ${parsedAdv.toLocaleString()} via ${cleanAcct}${cleanRef ? ` | Ref: ${cleanRef}` : ''}${cleanNotes ? ` | ${cleanNotes}` : ''} | By: ${actor}]`;
    const mergedNotes = order.notes ? `${order.notes} | ${auditTag}` : auditTag;

    db.prepare(`
      UPDATE orders
      SET paid_amount = ?,
          payment_status = ?,
          notes = ?,
          advance_verified_at = datetime('now'),
          advance_bank_ref = ?,
          advance_verified_by = ?,
          status_date = datetime('now')
      WHERE id = ?
    `).run(newPaid, newPaymentStatus, mergedNotes, cleanRef || `${cleanAcct} (${cleanDate})`, actor, orderId);

    db.logOrderChange({
      order_id: orderId,
      user_id: req.user?.id || 0,
      type: 'ADVANCE_VERIFIED',
      old_val: { paid_amount: oldPaid, payment_status: order.payment_status, booked_cod_amount: bookedCod },
      new_val: { paid_amount: newPaid, payment_status: newPaymentStatus, advance_amount: parsedAdv, bank_account: cleanAcct, bank_ref: cleanRef, advance_date: cleanDate },
    });
    db.logAction({
      order_id: orderId,
      user_id: req.user?.id || 0,
      action: 'VERIFY_ADVANCE_PAYMENT',
      details: { advance_amount: parsedAdv, bank_account: cleanAcct, bank_ref: cleanRef, advance_date: cleanDate, new_paid: newPaid, by: actor },
    });

    const updated = db.prepare('SELECT o.*, s.shop_domain, s.store_name FROM orders o LEFT JOIN stores s ON o.store_id = s.id WHERE o.id = ?').get(orderId);
    broadcast('order_updated', { storeId: order.store_id, shopifyOrderId: order.shopify_order_id });

    res.json({ success: true, order: updated, verified_advance: parsedAdv, paid_amount: newPaid });
  } catch (err) {
    console.error('[verifyAdvancePayment] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

exports.resyncOrder = async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const { resyncSingleOrder } = require('../services/SyncService');
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
};

exports.verifyAddress = async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const order = db.prepare(`
      SELECT o.address, o.city, s.google_maps_key
      FROM orders o
      JOIN stores s ON o.store_id = s.id
      WHERE o.id = ?
    `).get(orderId);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const apiKey = order.google_maps_key;
    if (!apiKey) {
      return res.status(400).json({ error: 'Google Maps API Key is not configured for this store. Please set it in Connect Store settings.' });
    }

    const fullAddress = `${order.address}, ${order.city || ''}`.trim();
    if (!fullAddress) {
      return res.status(400).json({ error: 'Order has an empty address' });
    }

    console.log(`🗺️ [Address Verification] Querying Geocoding API for: "${fullAddress}"`);
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullAddress)}&key=${apiKey}`;
    
    const response = await fetch(geocodeUrl);
    const data = await response.json();

    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const firstResult = data.results[0];
      const locationType = firstResult.geometry?.location_type || 'APPROXIMATE';
      
      let resolvedCity = '';
      if (firstResult.address_components) {
        const localityComponent = firstResult.address_components.find(c => c.types.includes('locality'));
        const admin2Component = firstResult.address_components.find(c => c.types.includes('administrative_area_level_2'));
        const subLocalityComponent = firstResult.address_components.find(c => c.types.includes('sublocality'));
        resolvedCity = (localityComponent || admin2Component || subLocalityComponent || {}).long_name || '';
      }

      // Merge Google suggestion with user's original landmark details
      const suggested = firstResult.formatted_address;
      const mergedAddress = smartMergeAddress(order.address, suggested);

      res.json({
        success: true,
        status: data.status,
        formatted_address: suggested,
        merged_address: mergedAddress,
        location: firstResult.geometry?.location || null,
        location_type: locationType,
        types: firstResult.types,
        resolved_city: resolvedCity,
        original_address: order.address,
        original_city: order.city
      });
    } else {
      res.json({
        success: false,
        status: data.status,
        error_message: data.error_message || 'No matches found on Google Maps.',
        results: data.results || []
      });
    }
  } catch (err) {
    console.error('Verify Address Error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

exports.updateLegacyFinancials = async (req, res) => {
  const filterMissingOnly = req.body.filterMissingOnly !== false; // default to true for safety
  
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Unauthorized. Admin role required.' });
  }

  const path = require('path');
  const fs = require('fs');
  const tenantContext = require('../tenant-context');
  const { db: tenantDb } = require('../db');
  const customFetch = require('../engines/fetch');

  function getAllTenants() {
    try {
      const dbDir = path.dirname(path.resolve(process.env.DB_PATH || './trace_erp.db'));
      const files = fs.readdirSync(dbDir);
      const tenants = ['default'];
      files.forEach(f => {
        if (f.startsWith('trace_erp_') && f.endsWith('.db') && !f.includes('-shm') && !f.includes('-wal') && f !== 'trace_erp_db.db') {
          const tenantId = f.replace('trace_erp_', '').replace('.db', '');
          if (tenantId && tenantId !== 'db') {
            tenants.push(tenantId);
          }
        }
      });
      return tenants;
    } catch (e) {
      return ['default'];
    }
  }

  function chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // Run asynchronously so we return immediately
  (async () => {
    console.log('🚀 [API triggered] Starting legacy financials update for all tenants...');
    const tenants = getAllTenants();
    
    for (const tenantId of tenants) {
      await tenantContext.run(tenantId, async () => {
        try {
          const stores = tenantDb.prepare("SELECT * FROM stores").all();
          for (const store of stores) {
            if (!store.access_token || store.access_token === 'PENDING') continue;

            let ordersQuery;
            if (filterMissingOnly) {
              ordersQuery = tenantDb.prepare(`
                SELECT shopify_order_id, id, ref_number FROM orders 
                WHERE store_id = ? 
                AND shopify_order_id IS NOT NULL 
                AND shopify_order_id != ''
                AND (shipping_fee = 0 AND discount_amount = 0)
              `);
            } else {
              ordersQuery = tenantDb.prepare(`
                SELECT shopify_order_id, id, ref_number FROM orders 
                WHERE store_id = ? 
                AND shopify_order_id IS NOT NULL 
                AND shopify_order_id != ''
              `);
            }

            const orders = ordersQuery.all(store.id);
            if (orders.length === 0) continue;

            const localOrderMap = {};
            orders.forEach(o => { localOrderMap[String(o.shopify_order_id)] = o; });

            const shopifyOrderIds = orders.map(o => String(o.shopify_order_id));
            const batches = chunkArray(shopifyOrderIds, 50);

            for (let i = 0; i < batches.length; i++) {
              try {
                const idsParam = batches[i].join(',');
                const url = `https://${store.shop_domain}/admin/api/2024-10/orders.json?ids=${idsParam}&status=any`;
                
                const res = await customFetch(url, {
                  headers: { 'X-Shopify-Access-Token': store.access_token },
                  timeout: 15000
                });

                if (res.ok) {
                  const data = await res.json();
                  const shopifyOrders = data.orders || [];

                  tenantDb.transaction(() => {
                    for (const fresh of shopifyOrders) {
                      const shopifyShipping = fresh.shipping_lines?.[0]?.price ? parseFloat(fresh.shipping_lines[0].price) : 0;
                      const shopifyDiscount = parseFloat(fresh.current_total_discounts || fresh.total_discounts || 0);

                      const localOrder = localOrderMap[String(fresh.id)];
                      if (localOrder) {
                        tenantDb.prepare(`
                          UPDATE orders 
                          SET shipping_fee = ?, discount_amount = ? 
                          WHERE id = ?
                        `).run(shopifyShipping, shopifyDiscount, localOrder.id);
                      }
                    }
                  })();
                }

                await sleep(500);
              } catch (e) {
                console.error(`Error on API update batch ${i}:`, e.message);
              }
            }
          }
        } catch (dbErr) {
          console.error(`DB Error on API update for tenant [${tenantId}]:`, dbErr.message);
        }
      });
    }
    console.log('🏁 [API triggered] Legacy financials update completed.');
  })().catch(err => console.error('Error running API triggered financials update:', err));

  return res.json({ success: true, message: 'Historical financials update job successfully dispatched in the background.' });
};
