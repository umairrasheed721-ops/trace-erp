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
    const order = db.prepare('SELECT line_items, product_titles, store_id FROM orders WHERE id = ?').get(req.params.orderId);
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
        ORDER BY (CASE WHEN shopify_variant_id = ? OR shopify_variant_id = ? THEN 0 ELSE 1 END) ASC,
                 (CASE WHEN LOWER(parent_title) = ? AND LOWER(variant_title) = ? THEN 0 
                       WHEN LOWER(parent_title) = ? THEN 1
                       ELSE 2 END) ASC
        LIMIT 1
      `).get(
        order.store_id, 
        queryVariantId1, 
        queryVariantId2, 
        querySku, 
        pName.toLowerCase(), 
        queryVariantId1, 
        queryVariantId2, 
        pName.toLowerCase(), 
        vName.toLowerCase(),
        pName.toLowerCase()
      );

      results.push({
        title: pName,
        variant: vName,
        quantity: item.quantity,
        price: item.price || 0,
        unit_cost: cost ? cost.unit_cost : 0,
        landed_cost: cost ? cost.landed_cost : 0,
        packaging_cost: cost ? cost.packaging_cost : 0
      });
    }

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
