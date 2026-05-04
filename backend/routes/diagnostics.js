const express = require('express');
const router = express.Router();
const { db } = require('../db');

// --- 🛠️ HEALTH AUDITS ---

// 1. Check for orders with 0 cost
router.get('/audit/zero-costs', (req, res) => {
  try {
    const orders = db.prepare(`
      SELECT id, ref_number, customer_name, product_titles, price 
      FROM orders 
      WHERE (cost = 0 OR cost IS NULL) 
      AND delivery_status NOT IN ('Cancelled', 'Returned', 'Voided')
      LIMIT 100
    `).all();
    res.json({ results: orders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Check for orphaned master costs (no matching product title)
router.get('/audit/orphaned-costs', (req, res) => {
  try {
    const orphaned = db.prepare(`
      SELECT m.id, m.parent_title, m.variant_title 
      FROM product_master_costs m
      LEFT JOIN orders o ON o.product_titles LIKE '%' || m.parent_title || '%'
      WHERE o.id IS NULL
      LIMIT 100
    `).all();
    res.json({ results: orphaned });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. System Stats
router.get('/stats', (req, res) => {
  try {
    const orderCount = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
    const storeCount = db.prepare('SELECT COUNT(*) as count FROM stores').get().count;
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const auditCount = db.prepare('SELECT COUNT(*) as count FROM audit_logs').get().count;
    const missingCount = db.prepare("SELECT COUNT(*) as count FROM orders WHERE (line_items IS NULL OR line_items = '' OR line_items = '[]') AND delivery_status NOT IN ('Cancelled', 'Voided', 'cancelled', 'Void')").get().count;
    
    res.json({
      orders: orderCount,
      stores: storeCount,
      users: userCount,
      auditLogs: auditCount,
      missingItems: missingCount,
      memory: process.memoryUsage().rss / 1024 / 1024
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- ✨ HEALERS ---

// 2. Heal orders with missing line_items (Mass-Restore)
router.post('/heal/line-items', async (req, res) => {
  try {
    const { fetchVariantImagesGraphQL } = require('../engines/shopify');
    const fetch = require('node-fetch'); // FIX: node-fetch v2 uses default export

    // Find up to 50 orders with missing item data
    const orders = db.prepare(`
      SELECT o.id, o.shopify_order_id, s.shop_domain, s.access_token 
      FROM orders o
      JOIN stores s ON o.store_id = s.id
      WHERE (o.line_items IS NULL OR o.line_items = '' OR o.line_items = '[]')
      AND o.delivery_status NOT IN ('Cancelled', 'Voided', 'cancelled', 'Void')
      LIMIT 50
    `).all();

    let healedCount = 0;

    for (const order of orders) {
      try {
        const shopifyUrl = `https://${order.shop_domain}/admin/api/2024-10/orders/${order.shopify_order_id}.json`;
        const sRes = await fetch(shopifyUrl, { 
          headers: { 'X-Shopify-Access-Token': order.access_token },
          timeout: 10000 
        });
        
        if (!sRes.ok) continue;
        
        const sData = await sRes.json();
        const shopifyOrder = sData.order;
        if (!shopifyOrder) continue;

        // Resolve images via GraphQL
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

        // Update DB
        db.prepare("UPDATE orders SET line_items = ? WHERE id = ?")
          .run(JSON.stringify(lineItems), order.id);
        
        healedCount++;
      } catch (e) {
        console.error(`Heal Error for Order ${order.id}:`, e.message);
      }
    }

    res.json({ success: true, healedCount, remaining: orders.length === 50 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 1. Heal orders with 0 cost by matching with Master Costs
router.post('/heal/zero-costs', (req, res) => {
  try {
    const orders = db.prepare(`
      SELECT id, product_titles 
      FROM orders 
      WHERE (cost = 0 OR cost IS NULL) 
      AND delivery_status NOT IN ('Cancelled', 'Returned', 'Voided')
    `).all();

    let healedCount = 0;
    const masterCosts = db.prepare('SELECT parent_title, variant_title, unit_cost FROM product_master_costs').all();

    const transaction = db.transaction(() => {
      orders.forEach(order => {
        // Try to find a matching cost
        const match = masterCosts.find(mc => 
          order.product_titles.includes(mc.parent_title) || 
          mc.parent_title.includes(order.product_titles)
        );

        if (match && match.unit_cost > 0) {
          db.prepare('UPDATE orders SET cost = ? WHERE id = ?').run(match.unit_cost, order.id);
          healedCount++;
        }
      });
    });
    
    transaction();

    res.json({ success: true, healedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Comprehensive Smoke Test
router.get('/smoke-test', async (req, res) => {
  try {
    const stores = db.prepare('SELECT id, shop_domain, access_token FROM stores').all();
    const results = {
      shopify: [],
      database: 'OK',
      timestamp: new Date().toISOString()
    };

    const { smokeTestShopify } = require('../engines/shopify');
    
    for (const store of stores) {
      const healthy = await smokeTestShopify(store.shop_domain, store.access_token);
      results.shopify.push({
        domain: store.shop_domain,
        status: healthy ? 'OK' : 'FAIL'
      });
    }

    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. DUPLICATE WATCHDOG: Find orders with same Tracking or (Phone+Price+Date)
router.get('/audit/duplicates', (req, res) => {
  try {
    // Audit for Tracking Duplicates
    const trackingDups = db.prepare(`
      SELECT tracking_number, COUNT(*) as count, GROUP_CONCAT(ref_number) as orders
      FROM orders 
      WHERE tracking_number IS NOT NULL AND tracking_number != '' AND tracking_number != '—'
      GROUP BY tracking_number 
      HAVING count > 1
    `).all();

    // Audit for Phone/Price Duplicates (same day)
    const phonePriceDups = db.prepare(`
      SELECT phone, price, date(order_date) as day, COUNT(*) as count, GROUP_CONCAT(ref_number) as orders
      FROM orders
      WHERE delivery_status NOT IN ('Cancelled', 'Voided')
      GROUP BY phone, price, day
      HAVING count > 1
    `).all();

    res.json({ results: [...trackingDups, ...phonePriceDups] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. MASTER COST LEAK: Find orders missing costs that exist in our history but not registry
router.get('/audit/missing-master-costs', (req, res) => {
  try {
    const results = db.prepare(`
      SELECT o.id, o.ref_number, o.product_titles, o.delivery_status
      FROM orders o
      LEFT JOIN product_master_costs pm ON (
        o.product_titles LIKE '%' || pm.parent_title || '%'
      )
      WHERE (o.cost = 0 OR o.cost IS NULL)
      AND pm.id IS NULL
      AND o.delivery_status NOT IN ('Cancelled', 'Voided')
      LIMIT 100
    `).all();
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. PROFIT ANOMALIES: Negative profit or suspiciously high margin
router.get('/audit/profit-anomalies', (req, res) => {
  try {
    const results = db.prepare(`
      SELECT id, ref_number, price, cost, courier_fee, 
             (price - cost - courier_fee) as profit
      FROM orders
      WHERE (profit < 0 OR profit > price * 0.9)
      AND delivery_status NOT IN ('Cancelled', 'Voided')
      AND price > 0
    `).all();
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
