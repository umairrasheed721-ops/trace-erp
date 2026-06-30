const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/cost-manager - Fetch SKU-based master costs
router.get('/', (req, res) => {
  const { store_id } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });

  try {
    const rows = db.prepare(`
      SELECT * FROM product_master_costs 
      WHERE store_id = ? 
      ORDER BY updated_at DESC
    `).all(store_id);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cost-manager/bulk-update - Update costs for multiple SKUs
router.post('/bulk-update', (req, res) => {
  const { store_id, updates } = req.body;
  if (!store_id || !Array.isArray(updates)) return res.status(400).json({ error: 'Invalid payload' });

  try {
    const stmt = db.prepare(`
      INSERT INTO product_master_costs (store_id, parent_title, variant_title, sku, shopify_variant_id, unit_cost, packaging_cost, landed_cost, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(store_id, parent_title, variant_title) DO UPDATE SET
        unit_cost = excluded.unit_cost,
        packaging_cost = excluded.packaging_cost,
        landed_cost = excluded.landed_cost,
        sku = COALESCE(excluded.sku, product_master_costs.sku),
        shopify_variant_id = COALESCE(excluded.shopify_variant_id, product_master_costs.shopify_variant_id),
        updated_at = datetime('now')
    `);

    const updateMany = db.transaction((items) => {
      for (const item of items) {
        stmt.run(
          store_id,
          item.parent_title,
          item.variant_title || '',
          item.sku || null,
          item.shopify_variant_id || null,
          item.unit_cost || 0,
          item.packaging_cost || 0,
          item.landed_cost || 0
        );
      }
    });

    updateMany(updates);
    res.json({ success: true, count: updates.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cost-manager/breakdown/:orderId - Fetch itemized cost breakdown for an order
router.get('/breakdown/:orderId', (req, res) => {
  try {
    const order = db.prepare('SELECT line_items, product_titles, store_id, cost FROM orders WHERE id = ?').get(req.params.orderId);
    if (!order) return res.json([]);

    let items = [];
    if (order.line_items) {
      try {
        items = JSON.parse(order.line_items);
      } catch (_) {}
    }

    // Fallback to parsing product_titles if no line items parsed
    if ((!items || items.length === 0) && order.product_titles) {
      const regex = /(.*?)\s\(x(\d+)\)(?:,\s|$)/g;
      let match;
      while ((match = regex.exec(order.product_titles)) !== null) {
        const fullName = match[1].trim();
        const qty = parseInt(match[2]) || 1;
        
        const parts = fullName.split(' - ');
        const pName = parts[0].trim();
        const vName = parts.length > 1 ? parts[1].trim() : '';
        
        items.push({
          title: pName,
          variant_title: vName,
          quantity: qty,
          price: 0,
          sku: '',
          variant_id: ''
        });
      }
    }

    if (!items || items.length === 0) {
      return res.json([]);
    }

    const results = [];
    let totalMatchedCost = 0;

    for (const item of items) {
      const variantId = item.variant_id ? String(item.variant_id) : '';
      const numericVariantId = variantId.includes('/') ? variantId.split('/').pop() : variantId;
      const gidVariantId = numericVariantId ? `gid://shopify/ProductVariant/${numericVariantId}` : '';
      const sku = item.sku ? String(item.sku).trim() : '';

      const queryVariantId1 = numericVariantId || '__NONE__';
      const queryVariantId2 = gidVariantId || '__NONE__';
      const querySku = sku || '__NONE__';
      const pName = item.title ? String(item.title).trim() : '';
      const vName = item.variant_title ? String(item.variant_title).trim() : '';

      let cost = db.prepare(`
        SELECT * FROM product_master_costs 
        WHERE store_id = ? 
        AND (
          shopify_variant_id = ? 
          OR shopify_variant_id = ? 
          OR (sku = ? AND sku != '')
          OR (LOWER(parent_title) = ?)
        )
        ORDER BY (CASE WHEN shopify_variant_id = ? OR shopify_variant_id = ? THEN 0 
                       WHEN sku = ? AND sku != '' THEN 1
                       WHEN LOWER(parent_title) = ? AND LOWER(variant_title) = ? THEN 2
                       WHEN LOWER(parent_title) = ? THEN 3
                       ELSE 4 END) ASC
        LIMIT 1
      `).get(
        order.store_id, 
        queryVariantId1, 
        queryVariantId2, 
        querySku, 
        pName.toLowerCase(), 
        queryVariantId1, 
        queryVariantId2, 
        querySku,
        pName.toLowerCase(), 
        vName.toLowerCase(),
        pName.toLowerCase()
      );

      const landed = cost ? cost.landed_cost : 0;
      const unit = cost ? cost.unit_cost : 0;
      const pkg = cost ? cost.packaging_cost : 0;

      totalMatchedCost += landed * item.quantity;

      results.push({
        title: pName,
        variant: vName,
        quantity: item.quantity,
        price: item.price || 0,
        unit_cost: unit,
        landed_cost: landed,
        packaging_cost: pkg
      });
    }

    // Fallback: If no costs matched from catalog but order has a direct cost, distribute it
    if (totalMatchedCost === 0 && order.cost > 0) {
      const totalQty = items.reduce((acc, item) => acc + item.quantity, 0);
      if (totalQty > 0) {
        const distributedLandedCost = order.cost / totalQty;
        for (const res of results) {
          res.landed_cost = distributedLandedCost;
          res.unit_cost = distributedLandedCost;
          res.packaging_cost = 0;
        }
      }
    }

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
