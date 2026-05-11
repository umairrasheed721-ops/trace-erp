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
    const order = db.prepare('SELECT line_items, store_id FROM orders WHERE id = ?').get(req.params.orderId);
    if (!order || !order.line_items) return res.json([]);

    const items = JSON.parse(order.line_items);
    const results = [];

    for (const item of items) {
      // Try to find master cost by variant_id or title
      let cost = db.prepare(`
        SELECT * FROM product_master_costs 
        WHERE store_id = ? AND (shopify_variant_id = ? OR (parent_title = ? AND variant_title = ?))
      `).get(order.store_id, String(item.variant_id), item.title, item.variant_title || '');

      results.push({
        title: item.title,
        variant: item.variant_title,
        quantity: item.quantity,
        price: item.price,
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
