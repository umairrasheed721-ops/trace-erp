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

      let isAliasMatch = false;
      let aliasData = null;
      if (!cost || (cost.landed_cost <= 0 && cost.shopify_cost <= 0)) {
        try {
          aliasData = db.prepare(`
            SELECT pa.*, pmc.id as master_cost_id, pmc.parent_title as master_parent_title, 
                   pmc.variant_title as master_variant_title, pmc.sku as master_sku,
                   pmc.landed_cost, pmc.unit_cost, pmc.packaging_cost, pmc.shopify_cost
            FROM product_aliases pa
            JOIN product_master_costs pmc ON (
              pmc.id = pa.target_master_cost_id 
              OR (pa.target_sku IS NOT NULL AND pmc.sku = pa.target_sku AND pmc.store_id = pa.store_id)
              OR (pa.target_variant_id IS NOT NULL AND pmc.shopify_variant_id = pa.target_variant_id AND pmc.store_id = pa.store_id)
            )
            WHERE pa.store_id = ?
            AND (
              (LOWER(pa.alias_title) = ? AND (LOWER(pa.alias_variant) = ? OR pa.alias_variant = ''))
              OR LOWER(pa.alias_title) = ?
              OR LOWER(pa.alias_title) = ?
            )
            LIMIT 1
          `).get(
            order.store_id,
            pName.toLowerCase(),
            vName.toLowerCase(),
            `${pName} - ${vName}`.toLowerCase(),
            pName.toLowerCase()
          );

          if (aliasData) {
            cost = aliasData;
            isAliasMatch = true;
          }
        } catch (_) {}
      }

      const landed = cost ? (cost.landed_cost || 0) : 0;
      const unit = cost ? (cost.unit_cost || 0) : 0;
      const pkg = cost ? (cost.packaging_cost || 0) : 0;
      const shopifyCost = cost ? (cost.shopify_cost || 0) : 0;

      totalMatchedCost += landed * item.quantity;

      let matchType = 'none';
      if (isAliasMatch) {
        matchType = 'alias';
      } else if (cost) {
        if (numericVariantId && cost.shopify_variant_id && (String(cost.shopify_variant_id).includes(numericVariantId) || String(numericVariantId).includes(String(cost.shopify_variant_id)))) {
          matchType = 'variant_id';
        } else if (sku && cost.sku && String(cost.sku).trim().toLowerCase() === String(sku).trim().toLowerCase()) {
          matchType = 'sku';
        } else if (pName && cost.parent_title && cost.parent_title.toLowerCase().trim() === pName.toLowerCase().trim() &&
                   vName && cost.variant_title && cost.variant_title.toLowerCase().trim() === vName.toLowerCase().trim()) {
          matchType = 'ghost';
        } else if (pName && cost.parent_title && cost.parent_title.toLowerCase().trim() === pName.toLowerCase().trim()) {
          matchType = 'name_only';
        } else {
          matchType = 'catalog_other';
        }
      }

      let reasonCode = null;
      let reasonHint = null;
      if (landed <= 0) {
        if (!cost) {
          reasonCode = 'NOT_IN_CATALOG';
          reasonHint = 'Item Not in Catalog (Ghost Variant)';
        } else if (shopifyCost > 0 && unit <= 0) {
          reasonCode = 'VERIFICATION_PENDING';
          reasonHint = `Verification Pending (Shopify Cost: Rs ${Math.round(shopifyCost).toLocaleString()})`;
        } else {
          reasonCode = 'ZERO_COST';
          reasonHint = 'Cost Missing in Registry (Rs 0)';
        }
      }

      results.push({
        title: pName,
        variant: vName,
        quantity: item.quantity,
        price: item.price || 0,
        unit_cost: unit,
        landed_cost: landed,
        packaging_cost: pkg,
        shopify_cost: shopifyCost,
        sku: (cost && (cost.master_sku || cost.sku)) ? (cost.master_sku || cost.sku) : (aliasData?.target_sku || sku),
        match_type: matchType,
        reason_code: reasonCode,
        reason_hint: reasonHint,
        is_alias: isAliasMatch,
        alias_target_sku: aliasData ? (aliasData.master_sku || aliasData.target_sku) : null
      });
    }

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cost-manager/aliases - Fetch all product aliases for a store
router.get('/aliases', (req, res) => {
  const { store_id } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });

  try {
    const rows = db.prepare(`
      SELECT 
        pa.*,
        pmc.parent_title as target_parent_title,
        pmc.variant_title as target_variant_title,
        pmc.sku as master_sku,
        pmc.landed_cost,
        pmc.unit_cost,
        pmc.packaging_cost
      FROM product_aliases pa
      LEFT JOIN product_master_costs pmc ON (
        pmc.id = pa.target_master_cost_id 
        OR (pa.target_sku IS NOT NULL AND pmc.sku = pa.target_sku AND pmc.store_id = pa.store_id)
      )
      WHERE pa.store_id = ?
      ORDER BY pa.updated_at DESC
    `).all(Number(store_id));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cost-manager/search-skus - Fast typeahead search for catalog SKUs
router.get('/search-skus', (req, res) => {
  const { store_id, q } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });

  try {
    const term = `%${(q || '').trim().toLowerCase()}%`;
    const rows = db.prepare(`
      SELECT id, sku, parent_title, variant_title, landed_cost, unit_cost, packaging_cost, shopify_cost, shopify_variant_id
      FROM product_master_costs
      WHERE store_id = ?
      AND (
        LOWER(sku) LIKE ? 
        OR LOWER(parent_title) LIKE ? 
        OR LOWER(variant_title) LIKE ?
      )
      ORDER BY (CASE WHEN landed_cost > 0 THEN 0 ELSE 1 END) ASC, sku ASC
      LIMIT 40
    `).all(Number(store_id), term, term, term);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cost-manager/link-alias - Bind a ghost/unmapped title to a real master SKU
router.post('/link-alias', (req, res) => {
  const { store_id, alias_title, alias_variant, target_master_cost_id, target_sku, target_variant_id } = req.body;
  if (!store_id || !alias_title || (!target_master_cost_id && !target_sku)) {
    return res.status(400).json({ error: 'store_id, alias_title, and target SKU/Cost ID are required' });
  }

  const cleanTitle = String(alias_title).trim();
  const cleanVariant = String(alias_variant || '').trim();
  const cleanSku = target_sku ? String(target_sku).trim() : null;

  try {
    // 1. Upsert into product_aliases
    db.prepare(`
      INSERT INTO product_aliases (
        store_id, alias_title, alias_variant, target_sku, target_variant_id, target_master_cost_id, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(store_id, alias_title, alias_variant) DO UPDATE SET
        target_sku = excluded.target_sku,
        target_variant_id = excluded.target_variant_id,
        target_master_cost_id = excluded.target_master_cost_id,
        updated_at = datetime('now')
    `).run(Number(store_id), cleanTitle, cleanVariant, cleanSku, target_variant_id || null, target_master_cost_id || null);

    // 2. Backfill SKU into existing orders line_items JSON
    let updatedOrdersCount = 0;
    if (cleanSku) {
      const orders = db.prepare(`
        SELECT id, line_items FROM orders 
        WHERE store_id = ? AND (line_items LIKE ? OR product_titles LIKE ?)
      `).all(Number(store_id), `%${cleanTitle}%`, `%${cleanTitle}%`);

      const updateOrderStmt = db.prepare('UPDATE orders SET line_items = ? WHERE id = ?');
      db.transaction(() => {
        for (const ord of orders) {
          if (!ord.line_items) continue;
          let items = [];
          try { items = JSON.parse(ord.line_items); } catch (_) {}
          let modified = false;

          for (const it of items) {
            const itTitle = (it.title || it.name || '').trim().toLowerCase();
            const itVar = (it.variant_title || '').trim().toLowerCase();
            const matchParent = itTitle === cleanTitle.toLowerCase();
            const matchVar = !cleanVariant || itVar === cleanVariant.toLowerCase();
            const matchFull = itTitle === `${cleanTitle} - ${cleanVariant}`.toLowerCase();

            if ((matchParent && matchVar) || matchFull) {
              if (!it.sku || it.sku !== cleanSku) {
                it.sku = cleanSku;
                modified = true;
              }
            }
          }

          if (modified) {
            updateOrderStmt.run(JSON.stringify(items), ord.id);
            updatedOrdersCount++;
          }
        }
      })();
    }

    // 3. Propagate costs to all affected orders
    const financeCorrections = require('./finance/finance-corrections');
    let healedOrdersCount = 0;
    if (typeof financeCorrections.healCostsForStore === 'function') {
      healedOrdersCount = financeCorrections.healCostsForStore(store_id);
    }

    res.json({
      success: true,
      message: `Successfully linked "${cleanTitle}${cleanVariant ? ' (' + cleanVariant + ')' : ''}" to SKU ${cleanSku || 'Master Product'}`,
      updatedOrdersCount,
      healedOrdersCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/cost-manager/aliases/:id - Delete an alias mapping
router.delete('/aliases/:id', (req, res) => {
  try {
    const alias = db.prepare('SELECT store_id FROM product_aliases WHERE id = ?').get(req.params.id);
    if (!alias) return res.status(404).json({ error: 'Alias not found' });

    db.prepare('DELETE FROM product_aliases WHERE id = ?').run(req.params.id);

    const financeCorrections = require('./finance/finance-corrections');
    let healedCount = 0;
    if (typeof financeCorrections.healCostsForStore === 'function') {
      healedCount = financeCorrections.healCostsForStore(alias.store_id);
    }

    res.json({ success: true, healedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
