const express = require('express');
const router = express.Router();
const { db } = require('../db');
const fetch = typeof globalThis.fetch === 'function' ? globalThis.fetch : require('node-fetch');

function getStore(storeId) {
  if (!storeId) return null;
  return db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId);
}

// GET /api/abandoned?store_id=12&limit=250&status_filter=ALL&start_date=2026-07-01&end_date=2026-07-31
router.get('/', async (req, res) => {
  try {
    const { store_id, limit = 250, status_filter = 'ALL', start_date, end_date } = req.query;
    if (!store_id) {
      return res.status(400).json({ error: 'store_id parameter is required' });
    }

    const store = getStore(store_id);
    if (!store || !store.access_token || !store.shop_domain) {
      return res.status(404).json({ error: 'Store not found or missing Shopify credentials' });
    }

    // 1. Build Shopify REST API URL with date filtering
    let shopifyUrl = `https://${store.shop_domain}/admin/api/2024-10/checkouts.json?limit=${Math.min(parseInt(limit) || 250, 250)}&status=any`;
    if (start_date) {
      shopifyUrl += `&created_at_min=${encodeURIComponent(start_date.includes('T') ? start_date : start_date + 'T00:00:00Z')}`;
    }
    if (end_date) {
      shopifyUrl += `&created_at_max=${encodeURIComponent(end_date.includes('T') ? end_date : end_date + 'T23:59:59Z')}`;
    }

    const response = await fetch(shopifyUrl, {
      headers: {
        'X-Shopify-Access-Token': store.access_token,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Shopify Checkouts API Error] Store ${store.shop_domain}: HTTP ${response.status} - ${errText.substring(0, 200)}`);
      return res.status(response.status).json({ error: `Shopify API error: ${response.status}` });
    }

    const data = await response.json();
    const rawCheckouts = data.checkouts || [];

    // 2. Fetch all existing orders for this store to perform high-performance in-memory reconciliation
    const storeOrders = db.prepare(`
      SELECT id, ref_number, shopify_order_id, phone, email, delivery_status, order_date, created_timestamp
      FROM orders
      WHERE store_id = ?
      ORDER BY id DESC
    `).all(store.id);

    // Build lookup maps for fast matching
    const phoneToOrdersMap = new Map();
    const emailToOrdersMap = new Map();

    storeOrders.forEach(o => {
      if (o.phone) {
        const cleanP = String(o.phone).replace(/\D/g, '').slice(-10);
        if (cleanP.length >= 10) {
          if (!phoneToOrdersMap.has(cleanP)) phoneToOrdersMap.set(cleanP, []);
          phoneToOrdersMap.get(cleanP).push(o);
        }
      }
      if (o.email) {
        const cleanE = String(o.email).toLowerCase().trim();
        if (cleanE) {
          if (!emailToOrdersMap.has(cleanE)) emailToOrdersMap.set(cleanE, []);
          emailToOrdersMap.get(cleanE).push(o);
        }
      }
    });

    // 3. Process & Reconcile Each Checkout
    const checkouts = rawCheckouts.map(c => {
      const customer = c.customer || {};
      const shipping = c.shipping_address || c.billing_address || {};

      const name = [
        customer.first_name || shipping.first_name || '',
        customer.last_name || shipping.last_name || ''
      ].join(' ').trim() || 'Customer';

      const email = (c.email || customer.email || shipping.email || '').trim();
      const rawPhone = c.phone || shipping.phone || customer.phone || '';
      const cleanPhone = String(rawPhone).replace(/\D/g, '').slice(-10);

      const items = (c.line_items || []).map(item => ({
        title: item.title || item.name || 'Product',
        variant_title: item.variant_title || '',
        quantity: item.quantity || 1,
        price: parseFloat(item.price || 0),
        sku: item.sku || ''
      }));

      const checkoutCreatedAt = c.created_at ? new Date(c.created_at) : new Date();

      // Reconciliation Logic:
      let reconciliation_status = 'TRUE_ABANDONED';
      let matched_order = null;
      let existing_orders_count = 0;

      // Find matching orders by phone or email
      let matchedCandidates = [];
      if (cleanPhone && cleanPhone.length >= 10 && phoneToOrdersMap.has(cleanPhone)) {
        matchedCandidates.push(...phoneToOrdersMap.get(cleanPhone));
      }
      if (email && emailToOrdersMap.has(email.toLowerCase())) {
        matchedCandidates.push(...emailToOrdersMap.get(email.toLowerCase()));
      }

      // Deduplicate candidates
      const uniqueCandidates = Array.from(new Map(matchedCandidates.map(o => [o.id, o])).values());
      existing_orders_count = uniqueCandidates.length;

      // Check if any candidate order was placed around or after the checkout time
      if (uniqueCandidates.length > 0) {
        // Order placed after or up to 6 hours before checkout creation
        const orderPlacedAfter = uniqueCandidates.find(o => {
          const orderDate = new Date(o.order_date || o.created_timestamp);
          const diffHours = (orderDate - checkoutCreatedAt) / (1000 * 60 * 60);
          return diffHours >= -6; // Placed within 6 hours prior or anytime after checkout
        });

        if (orderPlacedAfter) {
          reconciliation_status = 'RECOVERED';
          matched_order = {
            id: orderPlacedAfter.id,
            ref_number: orderPlacedAfter.ref_number,
            delivery_status: orderPlacedAfter.delivery_status,
            order_date: orderPlacedAfter.order_date
          };
        } else {
          reconciliation_status = 'EXISTING_CUSTOMER';
          matched_order = {
            id: uniqueCandidates[0].id,
            ref_number: uniqueCandidates[0].ref_number,
            delivery_status: uniqueCandidates[0].delivery_status,
            order_date: uniqueCandidates[0].order_date
          };
        }
      }

      return {
        id: c.id,
        token: c.token,
        cart_token: c.cart_token,
        customer_name: name,
        email,
        phone: rawPhone,
        clean_phone: cleanPhone,
        city: shipping.city || '',
        address: [shipping.address1, shipping.address2].filter(Boolean).join(', '),
        total_price: parseFloat(c.total_price || c.subtotal_price || 0),
        items_count: items.reduce((acc, i) => acc + i.quantity, 0),
        line_items: items,
        abandoned_checkout_url: c.abandoned_checkout_url || '',
        created_at: c.created_at,
        updated_at: c.updated_at,
        completed_at: c.completed_at,
        reconciliation_status,
        matched_order,
        existing_orders_count
      };
    });

    // Filter by status if requested
    let filteredCheckouts = checkouts;
    if (status_filter === 'TRUE_ABANDONED') {
      filteredCheckouts = checkouts.filter(c => c.reconciliation_status === 'TRUE_ABANDONED');
    } else if (status_filter === 'RECOVERED') {
      filteredCheckouts = checkouts.filter(c => c.reconciliation_status === 'RECOVERED');
    } else if (status_filter === 'EXISTING_CUSTOMER') {
      filteredCheckouts = checkouts.filter(c => c.reconciliation_status === 'EXISTING_CUSTOMER');
    }

    // Summary statistics
    const stats = {
      total: checkouts.length,
      true_abandoned: checkouts.filter(c => c.reconciliation_status === 'TRUE_ABANDONED').length,
      recovered: checkouts.filter(c => c.reconciliation_status === 'RECOVERED').length,
      existing_customer: checkouts.filter(c => c.reconciliation_status === 'EXISTING_CUSTOMER').length,
      total_abandoned_value: checkouts
        .filter(c => c.reconciliation_status === 'TRUE_ABANDONED')
        .reduce((sum, c) => sum + c.total_price, 0),
      recovery_rate_pct: checkouts.length > 0
        ? Math.round((checkouts.filter(c => c.reconciliation_status === 'RECOVERED').length / checkouts.length) * 100)
        : 0
    };

    res.json({
      success: true,
      stats,
      checkouts: filteredCheckouts
    });

  } catch (err) {
    console.error('Error fetching abandoned checkouts:', err.stack || err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch abandoned checkouts' });
  }
});

module.exports = router;
