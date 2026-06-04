const express = require('express');
const router = express.Router();
const db = require('../../db');
const { 
  getPrimaryLocationId, 
  processSmartRestock
} = require('../../engines/shopify_finance');
const { authenticateToken } = require('../auth');
const FinanceService = require('../../services/FinanceService');
const asyncHandler = require('../../middleware/async');
const FinanceAggregator = require('../../services/finance-aggregator');

// POST /api/finance/repair-legacy
router.post('/repair-legacy', asyncHandler(async (req, res) => {
  const result = await FinanceService.repairLegacy(req.body);
  res.success(result, 'Legacy data repaired successfully');
}));

// GET /api/finance/missing-product-list?store_id=1
router.get('/missing-product-list', asyncHandler(async (req, res) => {
  const { store_id } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });
  const result = await FinanceAggregator.getMissingProductList(store_id);
  res.json(result);
}));

// GET /api/finance/returns/pending?store_id=1
router.get('/returns/pending', asyncHandler(async (req, res) => {
  const { store_id } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });
  const result = await FinanceAggregator.getReturnsPending(store_id);
  res.json(result);
}));

// GET /api/finance/returns/history
router.get('/returns/history', authenticateToken, asyncHandler(async (req, res) => {
  const { store_id, days = 7 } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });
  const result = await FinanceAggregator.getReturnsHistory(store_id, days);
  res.json(result);
}));

// POST /api/finance/returns/bulk-verify
router.post('/returns/bulk-verify', authenticateToken, async (req, res) => {
  const { store_id, ids, restockShopify } = req.body;
  if (!store_id || !ids || !Array.isArray(ids)) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(store_id);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  let shopifyLocationId = null;
  if (restockShopify) {
    try { shopifyLocationId = await getPrimaryLocationId(store); } catch (e) {}
  }

  const results = [];
  for (const id of ids) {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (!order) {
      results.push({ id, status: '❌ Not Found' });
      continue;
    }

    try {
      if (order.delivery_status === 'Return Received') {
        results.push({ id, tracking: order.tracking_number, status: '⚠️ Already Verified', shopifyStatus: '⏭️ Skipped' });
        continue;
      }

      db.prepare("UPDATE orders SET delivery_status = 'Return Received', cs_notes = COALESCE(cs_notes, '') || ? WHERE id = ?")
        .run(`\n[Audit] Return verified on ${new Date().toLocaleDateString()}`, id);

      let shopifyStatus = '⏭️ Skipped';
      let restocked = 0;
      if (restockShopify && order.shopify_order_id) {
        shopifyStatus = await processSmartRestock(store, order.shopify_order_id, shopifyLocationId);
        if (shopifyStatus.includes('✅')) restocked = 1;
      }

      db.prepare(`
        INSERT INTO returns_log (store_id, order_id, tracking_number, restocked_shopify, processed_by)
        VALUES (?, ?, ?, ?, ?)
      `).run(store_id, order.id, order.tracking_number, restocked, req.user?.username || 'system');

      results.push({ id, tracking: order.tracking_number, status: '✅ Verified', shopifyStatus });
    } catch (e) {
      results.push({ id, tracking: order.tracking_number, status: '❌ Error: ' + e.message });
    }
  }

  res.json({ success: true, results });
});

// POST /api/finance/returns
router.post('/returns', authenticateToken, async (req, res) => {
  const { store_id, trackingNumbers, updateERP, restockShopify } = req.body;
  if (!store_id || !trackingNumbers || !Array.isArray(trackingNumbers)) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(store_id);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  let shopifyLocationId = null;
  if (restockShopify) {
    try {
      shopifyLocationId = await getPrimaryLocationId(store);
    } catch (e) {
      return res.status(500).json({ error: 'Shopify Location Error: ' + e.message });
    }
  }

  const results = [];
  
  for (let track of trackingNumbers) {
    track = String(track).trim();
    if (!track) continue;

    const order = db.prepare('SELECT * FROM orders WHERE store_id = ? AND tracking_number = ?').get(store_id, track);
    
    if (!order) {
      results.push({ tracking: track, erpStatus: '❌ Not Found', shopifyStatus: '❌ Not Found' });
      continue;
    }

    let erpStatus = '⏭️ Skipped';
    if (updateERP) {
      if (order.delivery_status === 'Return Received') {
        erpStatus = '⚠️ Already Updated';
      } else {
        db.prepare('UPDATE orders SET delivery_status = ? WHERE id = ?').run('Return Received', order.id);
        erpStatus = '✅ Updated';
      }
    }

    let shopifyStatus = '⏭️ Skipped';
    if (restockShopify) {
      if (!order.shopify_order_id) {
        shopifyStatus = '❌ No Order ID';
      } else {
        try {
          shopifyStatus = await processSmartRestock(store, order.shopify_order_id, shopifyLocationId);
        } catch (e) {
          shopifyStatus = '❌ API Error: ' + e.message;
        }
      }
    }

    results.push({ tracking: track, erpStatus, shopifyStatus });

    if (erpStatus === '✅ Updated') {
      db.prepare(`
        INSERT INTO returns_log (store_id, order_id, tracking_number, restocked_shopify, processed_by)
        VALUES (?, ?, ?, ?, ?)
      `).run(store_id, order.id, order.tracking_number, shopifyStatus.includes('✅') ? 1 : 0, req.user?.username || 'system');
    }
  }

  res.json({ success: true, results });
});

// POST /api/finance/apply-bulk-product-costs
router.post('/apply-bulk-product-costs', async (req, res) => {
  const { store_id, mappings } = req.body;
  if (!store_id || !mappings) return res.status(400).json({ error: 'store_id and mappings required' });

  try {
    const orders = db.prepare('SELECT id, line_items, product_titles, delivery_status FROM orders WHERE store_id = ? AND (cost = 0 OR cost IS NULL OR cost_locked = 0) AND items_count > 0').all(Number(store_id));
    const regex = /(.*?)\s\(x(\d+)\)(?:,\s|$)/g;
    let healedCount = 0;

    console.log(`🚀 Healing costs for Store ${store_id}. Orders to check: ${orders.length}`);

    const updateStmt = db.prepare('UPDATE orders SET cost = ?, packaging_cost = ?, cost_locked = (CASE WHEN delivery_status IN (\'Delivered\', \'Return Received\') THEN 1 ELSE 0 END) WHERE id = ?');
    
    const catalog = db.prepare('SELECT parent_title, variant_title, landed_cost, packaging_cost FROM product_master_costs WHERE store_id = ?').all(Number(store_id));

    db.transaction(() => {
      for (const [pName, pCost] of Object.entries(mappings)) {
        db.prepare(`
          INSERT INTO product_master_costs (store_id, parent_title, variant_title, unit_cost, landed_cost, updated_at)
          VALUES (?, ?, '', ?, ?, datetime('now'))
          ON CONFLICT(store_id, parent_title, variant_title) DO UPDATE SET
            unit_cost = excluded.unit_cost,
            landed_cost = excluded.landed_cost,
            updated_at = datetime('now')
        `).run(Number(store_id), pName, pCost, pCost);
      }

      for (const order of orders) {
        const itemsStr = order.line_items || order.product_titles;
        if (!itemsStr) continue;

        let totalLanded = 0;
        let totalPackaging = 0;
        let match;
        regex.lastIndex = 0;
        
        while ((match = regex.exec(itemsStr)) !== null) {
          const fullName = match[1].trim();
          const qty = parseInt(match[2]) || 0;
          
          const parts = fullName.split(' - ');
          const pName = parts[0].trim();
          const vName = parts.length > 1 ? parts.slice(1).join(' - ').trim() : '';

          let unitPrice = mappings[fullName];
          if (unitPrice === undefined) unitPrice = mappings[pName];

          if (unitPrice === undefined) {
             let matchRow = catalog.find(c => c.parent_title === pName && c.variant_title === vName);
             if (!matchRow) matchRow = catalog.find(c => c.parent_title === pName);
             if (matchRow) {
                unitPrice = matchRow.landed_cost;
                totalPackaging += (matchRow.packaging_cost || 0) * qty;
             }
          }
          
          if (unitPrice !== undefined) {
            totalLanded += unitPrice * qty;
          }
        }

        if (totalLanded > 0) {
          updateStmt.run(totalLanded, totalPackaging, order.id);
          healedCount++;
        }
      }
    })();

    res.json({ success: true, count: healedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/finance/master-costs?store_id=1
router.get('/master-costs', (req, res) => {
  const { store_id } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });
  try {
    const costs = db.prepare('SELECT * FROM product_master_costs WHERE store_id = ? ORDER BY parent_title ASC, variant_title ASC').all(Number(store_id));
    res.json(costs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/finance/master-costs
router.post('/master-costs', (req, res) => {
  const { store_id, parent_title, variant_title, unit_cost, packaging_cost } = req.body;
  if (!store_id || !parent_title) return res.status(400).json({ error: 'store_id and parent_title required' });

  try {
    const landed_cost = (parseFloat(unit_cost) || 0) + (parseFloat(packaging_cost) || 0);
    db.prepare(`
      INSERT INTO product_master_costs (store_id, parent_title, variant_title, unit_cost, packaging_cost, landed_cost, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(store_id, parent_title, variant_title) DO UPDATE SET
        unit_cost = excluded.unit_cost,
        packaging_cost = excluded.packaging_cost,
        landed_cost = excluded.landed_cost,
        updated_at = datetime('now')
    `).run(Number(store_id), parent_title, variant_title || '', unit_cost || 0, packaging_cost || 0, landed_cost);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/finance/auto-heal-all
router.post('/auto-heal-all', (req, res) => {
  const { store_id } = req.body;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });

  try {
    const catalog = db.prepare('SELECT parent_title, variant_title, unit_cost, packaging_cost, landed_cost FROM product_master_costs WHERE store_id = ?').all(Number(store_id));
    
    const orders = db.prepare('SELECT id, line_items, product_titles FROM orders WHERE store_id = ? AND (cost = 0 OR cost IS NULL OR cost_locked = 0) AND items_count > 0').all(Number(store_id));
    const regex = /(.*?)\s\(x(\d+)\)(?:,\s|$)/g;
    let healedCount = 0;

    const updateStmt = db.prepare('UPDATE orders SET cost = ?, packaging_cost = ?, cost_locked = (CASE WHEN delivery_status IN (\'Delivered\', \'Return Received\') THEN 1 ELSE 0 END) WHERE id = ?');
    
    db.transaction(() => {
      for (const order of orders) {
        const itemsStr = order.line_items || order.product_titles;
        if (!itemsStr) continue;

        let totalLanded = 0;
        let totalPackaging = 0;
        let matched = false;
        let match;
        regex.lastIndex = 0;
        
        while ((match = regex.exec(itemsStr)) !== null) {
          const fullName = match[1].trim();
          const qty = parseInt(match[2]) || 0;
          
          const parts = fullName.split(' - ');
          const pName = parts[0].trim();
          const vName = parts.length > 1 ? parts[1].trim() : '';
          
          let matchRow = catalog.find(c => c.parent_title === pName && c.variant_title === vName);
          
          if (!matchRow) {
            matchRow = catalog.find(c => c.parent_title === pName);
          }
          
          if (matchRow) {
            totalLanded += matchRow.landed_cost * qty;
            totalPackaging += (matchRow.packaging_cost || 0) * qty;
            matched = true;
          }
        }

        if (matched) {
          updateStmt.run(totalLanded, totalPackaging, order.id);
          healedCount++;
        }
      }
    })();

    res.json({ success: true, count: healedCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/finance/sync-shopify-costs
router.post('/sync-shopify-costs', async (req, res) => {
  const { store_id } = req.body;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });

  try {
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(Number(store_id));
    if (!store) return res.status(404).json({ error: 'Store not found' });

    const { getShopifyInventoryCosts } = require('../../engines/shopify_finance');
    const products = await getShopifyInventoryCosts(store);

    db.transaction(() => {
      for (const p of products) {
        let existing = null;
        if (p.shopify_variant_id) {
          existing = db.prepare('SELECT id FROM product_master_costs WHERE store_id = ? AND shopify_variant_id = ?').get(Number(store_id), p.shopify_variant_id);
        }

        if (!existing) {
          existing = db.prepare('SELECT id FROM product_master_costs WHERE store_id = ? AND parent_title = ? AND variant_title = ?').get(Number(store_id), p.parent_name, p.variant_name);
        }

        if (existing) {
          db.prepare(`
            UPDATE product_master_costs SET
              shopify_variant_id = ?,
              sku = ?,
              parent_title = ?,
              variant_title = ?,
              shopify_cost = ?,
              selling_price = ?,
              inventory_qty = ?,
              variant_image_url = ?,
              updated_at = datetime('now')
            WHERE id = ?
          `).run(p.shopify_variant_id, p.sku, p.parent_name, p.variant_name, p.shopify_cost, p.selling_price, p.qty, p.image_url || null, existing.id);
        } else {
          db.prepare(`
            INSERT INTO product_master_costs (store_id, shopify_variant_id, sku, parent_title, variant_title, shopify_cost, selling_price, inventory_qty, variant_image_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(Number(store_id), p.shopify_variant_id, p.sku, p.parent_name, p.variant_name, p.shopify_cost, p.selling_price, p.qty, p.image_url || null);
        }
      }
    })();

    res.json({ success: true, count: products.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/finance/accept-shopify-cost
router.post('/accept-shopify-cost', (req, res) => {
  const { store_id, parent_title, variant_title } = req.body;
  if (!store_id || !parent_title) return res.status(400).json({ error: 'store_id and parent_title required' });

  try {
    db.prepare(`
      UPDATE product_master_costs 
      SET previous_unit_cost = unit_cost,
          unit_cost = shopify_cost, 
          landed_cost = shopify_cost + packaging_cost,
          updated_at = datetime('now')
      WHERE store_id = ? AND parent_title = ? AND variant_title = ?
    `).run(Number(store_id), parent_title, variant_title || '');
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/finance/bulk-sync-parent-costs
router.post('/bulk-sync-parent-costs', (req, res) => {
  const { store_id, parent_title, unit_cost, packaging_cost } = req.body;
  if (!store_id || !parent_title) return res.status(400).json({ error: 'store_id and parent_title required' });

  try {
    const landed_cost = (parseFloat(unit_cost) || 0) + (parseFloat(packaging_cost) || 0);
    db.prepare(`
      UPDATE product_master_costs 
      SET unit_cost = ?, packaging_cost = ?, landed_cost = ?, updated_at = datetime('now')
      WHERE store_id = ? AND parent_title = ?
    `).run(unit_cost || 0, packaging_cost || 0, landed_cost, Number(store_id), parent_title);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/finance/bulk-accept-shopify-costs
router.post('/bulk-accept-shopify-costs', (req, res) => {
  try {
    const { store_id, parent_title } = req.body;
    if (!store_id || !parent_title) return res.status(400).json({ error: "Missing required fields" });

    const result = db.prepare(`
      UPDATE product_master_costs 
      SET previous_unit_cost = unit_cost,
          unit_cost = shopify_cost,
          landed_cost = shopify_cost + packaging_cost,
          updated_at = datetime('now')
      WHERE store_id = ? AND parent_title = ? AND shopify_cost > 0
    `).run(Number(store_id), parent_title);

    res.json({ success: true, message: `Accepted costs for ${result.changes} variants` });
  } catch (error) {
    console.error("Bulk Accept Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/finance/revert-cost
router.post('/revert-cost', (req, res) => {
  const { store_id, parent_title, variant_title } = req.body;
  if (!store_id || !parent_title) return res.status(400).json({ error: 'store_id and parent_title required' });

  try {
    db.prepare(`
      UPDATE product_master_costs 
      SET unit_cost = previous_unit_cost,
          landed_cost = previous_unit_cost + packaging_cost,
          updated_at = datetime('now')
      WHERE store_id = ? AND parent_title = ? AND variant_title = ?
    `).run(Number(store_id), parent_title, variant_title || '');
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/finance/bulk-revert-cost
router.post('/bulk-revert-cost', (req, res) => {
  const { store_id, parent_title } = req.body;
  if (!store_id || !parent_title) return res.status(400).json({ error: 'store_id and parent_title required' });

  try {
    const result = db.prepare(`
      UPDATE product_master_costs 
      SET unit_cost = previous_unit_cost,
          landed_cost = previous_unit_cost + packaging_cost,
          updated_at = datetime('now')
      WHERE store_id = ? AND parent_title = ? AND previous_unit_cost > 0
    `).run(Number(store_id), parent_title);
    res.json({ success: true, count: result.changes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/finance/delete-master-cost
router.post('/delete-master-cost', (req, res) => {
  const { store_id, parent_title } = req.body;
  if (!store_id || !parent_title) return res.status(400).json({ error: 'store_id and parent_title required' });

  try {
    const result = db.prepare('DELETE FROM product_master_costs WHERE store_id = ? AND parent_title = ?')
      .run(Number(store_id), parent_title);
    res.json({ success: true, count: result.changes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/finance/prevention-audit
router.get('/prevention-audit', asyncHandler(async (req, res) => {
  const { store_id } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });
  const result = await FinanceAggregator.getPreventionAudit(store_id);
  res.json(result);
}));

// GET /api/finance/marketing-metrics
router.get('/marketing-metrics', (req, res) => {
  const { store_id, days = 30 } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });

  try {
    const metrics = db.prepare(`
      SELECT * FROM daily_metrics 
      WHERE store_id = ? 
      AND date_string >= date('now', '-' || ? || ' days')
      ORDER BY date_string DESC
    `).all(Number(store_id), Number(days));
    res.json(metrics);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/finance/marketing-metrics
router.post('/marketing-metrics', (req, res) => {
  const { store_id, date, meta_spend, google_spend, tiktok_spend } = req.body;
  if (!store_id || !date) return res.status(400).json({ error: 'store_id and date required' });

  try {
    const total = (parseFloat(meta_spend) || 0) + (parseFloat(google_spend) || 0) + (parseFloat(tiktok_spend) || 0);
    db.prepare(`
      INSERT INTO daily_metrics (store_id, date_string, marketing_spend, tiktok_marketing)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(store_id, date_string) DO UPDATE SET
        marketing_spend = excluded.marketing_spend,
        tiktok_marketing = excluded.tiktok_marketing
    `).run(Number(store_id), date, total, parseFloat(tiktok_spend) || 0);
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/finance/courier-credentials
router.get('/courier-credentials', (req, res) => {
  const { store_id } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });

  try {
    const store = db.prepare('SELECT postex_token, leopards_token, tcs_token FROM stores WHERE id = ?').get(Number(store_id));
    if (!store) return res.status(404).json({ error: 'Store not found' });

    const mask = (token) => {
      if (!token) return '';
      if (token.length <= 8) return '****' + token.slice(-2);
      return token.slice(0, 4) + '********************' + token.slice(-4);
    };

    res.json({
      postex: { isSet: !!store.postex_token, masked: mask(store.postex_token) },
      leopards: { isSet: !!store.leopards_token, masked: mask(store.leopards_token) },
      tcs: { isSet: !!store.tcs_token, masked: mask(store.tcs_token) }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/finance/courier-credentials
router.post('/courier-credentials', (req, res) => {
  const { store_id, courier, token } = req.body;
  if (!store_id || !courier) return res.status(400).json({ error: 'store_id and courier required' });

  try {
    let col = '';
    if (courier === 'PostEx') col = 'postex_token';
    else if (courier === 'Leopards') col = 'leopards_token';
    else if (courier === 'TCS') col = 'tcs_token';
    else return res.status(400).json({ error: 'Invalid courier' });

    if (token && token.includes('****')) {
      return res.json({ success: true, message: 'Token unchanged' });
    }

    db.prepare(`UPDATE stores SET ${col} = ? WHERE id = ?`).run(token || null, Number(store_id));
    res.json({ success: true, message: `${courier} credentials updated successfully` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
