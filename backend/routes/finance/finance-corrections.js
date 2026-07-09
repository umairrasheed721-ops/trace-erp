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
        let shopifyStatus = '⏭️ Skipped';
        let restocked = 0;
        if (restockShopify && order.shopify_order_id) {
          shopifyStatus = await processSmartRestock(store, order.shopify_order_id, shopifyLocationId);
          if (shopifyStatus.includes('✅')) restocked = 1;
          
          db.prepare(`
            INSERT INTO returns_log (store_id, order_id, tracking_number, restocked_shopify, processed_by)
            VALUES (?, ?, ?, ?, ?)
          `).run(store_id, order.id, order.tracking_number, restocked, req.user?.username || 'system');
          
          results.push({ id, tracking: order.tracking_number, status: '✅ Re-Processed Shopify', shopifyStatus });
        } else {
          results.push({ id, tracking: order.tracking_number, status: '⚠️ Already Verified', shopifyStatus: '⏭️ Skipped' });
        }
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

// POST /api/finance/returns/verify-by-tracking
router.post('/returns/verify-by-tracking', authenticateToken, async (req, res) => {
  const { store_id, tracking_number, restockShopify } = req.body;
  if (!store_id || !tracking_number) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const cleanTracking = String(tracking_number).trim();
  if (!cleanTracking) return res.status(400).json({ error: 'Invalid tracking number' });

  try {
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(store_id);
    if (!store) return res.status(404).json({ error: 'Store not found' });

    const order = db.prepare('SELECT * FROM orders WHERE store_id = ? AND tracking_number = ?').get(store_id, cleanTracking);
    if (!order) {
      return res.status(404).json({ error: `No order found with tracking number: ${cleanTracking}` });
    }

    let shopifyLocationId = null;
    if (restockShopify) {
      try { shopifyLocationId = await getPrimaryLocationId(store); } catch (e) {}
    }

    let shopifyStatus = '⏭️ Skipped';
    let restocked = 0;

    if (order.delivery_status === 'Return Received') {
      if (restockShopify && order.shopify_order_id) {
        shopifyStatus = await processSmartRestock(store, order.shopify_order_id, shopifyLocationId);
        if (shopifyStatus.includes('✅')) restocked = 1;

        db.prepare(`
          INSERT INTO returns_log (store_id, order_id, tracking_number, restocked_shopify, processed_by)
          VALUES (?, ?, ?, ?, ?)
        `).run(store_id, order.id, order.tracking_number, restocked, req.user?.username || 'system');

        return res.json({
          success: true,
          result: {
            id: order.id,
            tracking: order.tracking_number,
            ref_number: order.ref_number,
            status: '✅ Re-Processed Shopify',
            shopifyStatus
          }
        });
      } else {
        return res.json({
          success: true,
          result: {
            id: order.id,
            tracking: order.tracking_number,
            ref_number: order.ref_number,
            status: '⚠️ Already Verified',
            shopifyStatus: '⏭️ Skipped'
          }
        });
      }
    }

    db.prepare("UPDATE orders SET delivery_status = 'Return Received', cs_notes = COALESCE(cs_notes, '') || ? WHERE id = ?")
      .run(`\n[Audit] Return verified on ${new Date().toLocaleDateString()}`, order.id);

    if (restockShopify && order.shopify_order_id) {
      shopifyStatus = await processSmartRestock(store, order.shopify_order_id, shopifyLocationId);
      if (shopifyStatus.includes('✅')) restocked = 1;
    }

    db.prepare(`
      INSERT INTO returns_log (store_id, order_id, tracking_number, restocked_shopify, processed_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(store_id, order.id, order.tracking_number, restocked, req.user?.username || 'system');

    res.json({
      success: true,
      result: {
        id: order.id,
        tracking: order.tracking_number,
        ref_number: order.ref_number,
        status: '✅ Verified',
        shopifyStatus
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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

    if (erpStatus === '✅ Updated' || (restockShopify && shopifyStatus.includes('✅'))) {
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
    })();

    // Propagate cost updates using our robust helper function
    const healedCount = healCostsForStore(store_id);
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

// Helper to propagate cost changes from product_master_costs to orders matching by SKU/ID or Name (with appended variant handling)
function healCostsForStore(storeId) {
  const catalog = db.prepare('SELECT shopify_variant_id, sku, parent_title, variant_title, landed_cost, packaging_cost FROM product_master_costs WHERE store_id = ?').all(Number(storeId));
  const orders = db.prepare('SELECT id, cost, line_items, product_titles, delivery_status FROM orders WHERE store_id = ? AND (cost = 0 OR cost IS NULL OR cost_locked = 0) AND items_count > 0').all(Number(storeId));
  let healedCount = 0;

  const updateStmt = db.prepare('UPDATE orders SET cost = ?, packaging_cost = ?, cost_locked = (CASE WHEN delivery_status IN (\'Delivered\', \'Return Received\') THEN 1 ELSE 0 END) WHERE id = ?');
  
  db.transaction(() => {
    for (const order of orders) {
      let totalLanded = 0;
      let totalPackaging = 0;
      let hasMissingCostItem = false;

      let parsedItems = [];
      try {
        if (order.line_items) parsedItems = JSON.parse(order.line_items);
      } catch (e) {}

      if (parsedItems.length > 0) {
        for (const item of parsedItems) {
          const qty = item.quantity || 0;
          if (qty === 0) continue;

          let matchRow = null;
          const vId = item.variant_id ? String(item.variant_id) : '';
          const numericVariantId = vId.includes('/') ? vId.split('/').pop() : vId;
          const gidVariantId = numericVariantId ? `gid://shopify/ProductVariant/${numericVariantId}` : '';
          const sku = item.sku ? String(item.sku).trim() : '';
          const pName = item.title ? String(item.title).trim() : '';
          const vName = item.variant_title ? String(item.variant_title).trim() : '';

          // 1. Variant ID match (prioritized)
          if (numericVariantId) {
            matchRow = catalog.find(c => 
              c.shopify_variant_id && 
              (String(c.shopify_variant_id).includes(numericVariantId) || String(c.shopify_variant_id) === gidVariantId)
            );
          }

          // 2. SKU match
          if (!matchRow && sku) {
            const skuMatches = catalog.filter(c => c.sku && String(c.sku).trim().toLowerCase() === sku.toLowerCase());
            if (skuMatches.length > 0) {
              skuMatches.sort((a, b) => {
                const aCost = a.landed_cost || a.shopify_cost || 0;
                const bCost = b.landed_cost || b.shopify_cost || 0;
                return (bCost > 0 ? 1 : 0) - (aCost > 0 ? 1 : 0);
              });
              matchRow = skuMatches[0];
            }
          }

          // 3. Name/Ghost match
          if (!matchRow && pName) {
            matchRow = catalog.find(c => 
              c.parent_title && c.parent_title.toLowerCase().trim() === pName.toLowerCase().trim() &&
              c.variant_title && c.variant_title.toLowerCase().trim() === vName.toLowerCase().trim()
            );
            if (!matchRow) {
              matchRow = catalog.find(c => c.parent_title && c.parent_title.toLowerCase().trim() === pName.toLowerCase().trim());
            }
            if (!matchRow && vName) {
              const fullSearchTitle1 = `${pName} - ${vName}`.toLowerCase();
              const fullSearchTitle2 = `${pName} - ${vName.split('/').map(x => x.trim()).reverse().join(' / ')}`.toLowerCase();
              matchRow = catalog.find(c => {
                const cpt = c.parent_title ? c.parent_title.toLowerCase().trim() : '';
                return cpt === fullSearchTitle1 || cpt === fullSearchTitle2;
              });
            }
          }

          if (matchRow && (matchRow.landed_cost > 0 || matchRow.shopify_cost > 0)) {
            totalLanded += (matchRow.landed_cost || matchRow.shopify_cost || 0) * qty;
            totalPackaging += (matchRow.packaging_cost || 0) * qty;
          } else {
            hasMissingCostItem = true;
          }
        }
      } else if (order.product_titles) {
        const regex = /(.*?)\s\(x(\d+)\)(?:,\s|$)/g;
        let match;
        let titlesCount = 0;
        while ((match = regex.exec(order.product_titles)) !== null) {
          titlesCount++;
          const fullName = match[1].trim();
          const qty = parseInt(match[2]) || 0;
          
          const parts = fullName.split(' - ');
          const pName = parts[0].trim();
          const vName = parts.length > 1 ? parts[1].trim() : '';
          
          let matchRow = catalog.find(c => c.parent_title === pName && c.variant_title === vName);
          if (!matchRow) matchRow = catalog.find(c => c.parent_title === pName);
          
          if (matchRow && (matchRow.landed_cost > 0 || matchRow.shopify_cost > 0)) {
            totalLanded += (matchRow.landed_cost || matchRow.shopify_cost || 0) * qty;
            totalPackaging += (matchRow.packaging_cost || 0) * qty;
          } else {
            hasMissingCostItem = true;
          }
        }
        if (titlesCount === 0) {
          hasMissingCostItem = true;
        }
      } else {
        hasMissingCostItem = true;
      }

      const currentCost = order.cost || 0;
      const finalCost = hasMissingCostItem ? 0 : totalLanded;
      const finalPackaging = hasMissingCostItem ? 0 : totalPackaging;

      if (finalCost !== currentCost || (finalCost === 0 && currentCost > 0)) {
        updateStmt.run(finalCost, finalPackaging, order.id);
        healedCount++;
      }
    }
  })();
  return healedCount;
}

// POST /api/finance/master-costs
router.post('/master-costs', (req, res) => {
  const { store_id, parent_title, variant_title, unit_cost, packaging_cost } = req.body;
  if (!store_id || !parent_title) return res.status(400).json({ error: 'store_id and parent_title required' });

  try {
    const landed_cost = (parseFloat(unit_cost) || 0) + (parseFloat(packaging_cost) || 0);
    const existing = db.prepare('SELECT unit_cost, shopify_cost, shopify_variant_id FROM product_master_costs WHERE store_id = ? AND parent_title = ? AND variant_title = ?').get(Number(store_id), parent_title, variant_title || '');
    db.prepare(`
      INSERT INTO product_master_costs (store_id, parent_title, variant_title, unit_cost, packaging_cost, landed_cost, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(store_id, parent_title, variant_title) DO UPDATE SET
        unit_cost = excluded.unit_cost,
        packaging_cost = excluded.packaging_cost,
        landed_cost = excluded.landed_cost,
        updated_at = datetime('now')
    `).run(Number(store_id), parent_title, variant_title || '', unit_cost || 0, packaging_cost || 0, landed_cost);
    // Log cost change
    try {
      db.prepare(`INSERT INTO cost_change_log (store_id, parent_title, variant_title, shopify_variant_id, old_cost, new_cost, changed_by) VALUES (?,?,?,?,?,?,'manual')`)
        .run(Number(store_id), parent_title, variant_title || '', existing?.shopify_variant_id || null, existing?.unit_cost ?? null, parseFloat(unit_cost) || 0);
    } catch (_) {}

    // Auto-heal orders on master cost updates
    healCostsForStore(store_id);

    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/finance/auto-heal-all
router.post('/auto-heal-all', (req, res) => {
  const { store_id } = req.body;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });

  try {
    const healedCount = healCostsForStore(store_id);
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
    if (!store.access_token) return res.status(400).json({ error: 'Store has no Shopify access token configured. Please reconnect this store.' });

    const { getShopifyInventoryCosts } = require('../../engines/shopify_finance');
    const products = await getShopifyInventoryCosts(store);

    if (products.length === 0) {
      return res.json({ 
        success: true, 
        count: 0,
        warning: 'Shopify returned 0 variants. This usually means: (1) no products exist in this Shopify store, (2) the access token is missing read_products or read_inventory scopes, or (3) all products are archived/deleted.'
      });
    }

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
              inventory_policy = ?,
              status = ?,
              updated_at = datetime('now')
            WHERE id = ?
          `).run(p.shopify_variant_id, p.sku, p.parent_name, p.variant_name, p.shopify_cost, p.selling_price, p.qty, p.image_url || null, p.inventory_policy || 'deny', p.status || 'active', existing.id);
        } else {
          db.prepare(`
            INSERT INTO product_master_costs (store_id, shopify_variant_id, sku, parent_title, variant_title, shopify_cost, selling_price, inventory_qty, variant_image_url, inventory_policy, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(Number(store_id), p.shopify_variant_id, p.sku, p.parent_name, p.variant_name, p.shopify_cost, p.selling_price, p.qty, p.image_url || null, p.inventory_policy || 'deny', p.status || 'active');
        }
      }
    })();

    res.json({ success: true, count: products.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/finance/diagnose-shopify-sync?store_id=1
// Full diagnostic: tests Shopify connection, checks scopes, returns sample data
router.get('/diagnose-shopify-sync', async (req, res) => {
  const { store_id } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });

  const report = { steps: [], passed: true };

  try {
    // Step 1: Check store exists
    const store = db.prepare('SELECT id, shop_domain, access_token FROM stores WHERE id = ?').get(Number(store_id));
    if (!store) {
      report.steps.push({ step: 'Store Lookup', status: '❌ FAIL', detail: `No store found with id=${store_id}` });
      report.passed = false;
      return res.json(report);
    }
    report.steps.push({ step: 'Store Lookup', status: '✅ OK', detail: `Found: ${store.shop_domain}` });

    // Step 2: Check access token exists
    if (!store.access_token) {
      report.steps.push({ step: 'Access Token', status: '❌ FAIL', detail: 'No access_token configured. Re-install the Shopify app.' });
      report.passed = false;
      return res.json(report);
    }
    report.steps.push({ step: 'Access Token', status: '✅ OK', detail: `Token present (${store.access_token.substring(0, 6)}...)` });

    // Step 3: Test basic REST connectivity (shop.json)
    const shopRes = await fetch(`https://${store.shop_domain}/admin/api/2025-10/shop.json`, {
      headers: { 'X-Shopify-Access-Token': store.access_token }
    });
    if (!shopRes.ok) {
      const errText = await shopRes.text();
      report.steps.push({ step: 'REST Connectivity', status: `❌ FAIL (HTTP ${shopRes.status})`, detail: errText.substring(0, 200) });
      report.passed = false;
      return res.json(report);
    }
    const shopData = await shopRes.json();
    report.steps.push({ step: 'REST Connectivity', status: '✅ OK', detail: `Shop: ${shopData.shop?.name} (${shopData.shop?.email})` });

    // Step 4: Test GraphQL with a tiny product query
    const gqlRes = await fetch(`https://${store.shop_domain}/admin/api/2025-10/graphql.json`, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': store.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `{ productVariants(first: 5) { edges { node { id title price product { title } inventoryItem { unitCost { amount } } } } } }`
      })
    });

    const gqlJson = await gqlRes.json();

    if (!gqlRes.ok) {
      report.steps.push({ step: 'GraphQL Access', status: `❌ FAIL (HTTP ${gqlRes.status})`, detail: JSON.stringify(gqlJson).substring(0, 300) });
      report.passed = false;
      return res.json(report);
    }
    if (gqlJson.errors) {
      report.steps.push({ step: 'GraphQL Access', status: '❌ FAIL (GraphQL Errors)', detail: JSON.stringify(gqlJson.errors).substring(0, 300) });
      report.passed = false;
      return res.json(report);
    }

    const sampleVariants = gqlJson.data?.productVariants?.edges || [];
    report.steps.push({ 
      step: 'GraphQL Access', 
      status: '✅ OK', 
      detail: `GraphQL working. Sample variants found: ${sampleVariants.length}`,
      sample: sampleVariants.map(e => ({
        product: e.node.product?.title,
        variant: e.node.title,
        price: e.node.price,
        shopify_cost: e.node.inventoryItem?.unitCost?.amount || 'null (not set in Shopify)'
      }))
    });

    if (sampleVariants.length === 0) {
      report.steps.push({ step: 'Product Count', status: '⚠️ WARNING', detail: 'GraphQL returned 0 variants. This store may have no active products in Shopify, or all products are archived.' });
      report.passed = false;
    } else {
      // Step 5: Check current DB state
      const dbCount = db.prepare('SELECT COUNT(*) as cnt FROM product_master_costs WHERE store_id = ?').get(Number(store_id));
      report.steps.push({ step: 'DB Registry State', status: '✅ OK', detail: `${dbCount.cnt} variants currently saved for this store` });
    }

    return res.json(report);
  } catch (err) {
    report.steps.push({ step: 'Fatal Error', status: '❌ EXCEPTION', detail: err.message });
    report.passed = false;
    return res.json(report);
  }
});


// POST /api/finance/accept-shopify-cost

router.post('/accept-shopify-cost', (req, res) => {
  const { store_id, parent_title, variant_title } = req.body;
  if (!store_id || !parent_title) return res.status(400).json({ error: 'store_id and parent_title required' });

  try {
    const existing = db.prepare('SELECT unit_cost, shopify_cost, shopify_variant_id FROM product_master_costs WHERE store_id = ? AND parent_title = ? AND variant_title = ?').get(Number(store_id), parent_title, variant_title || '');
    db.prepare(`
      UPDATE product_master_costs 
      SET previous_unit_cost = unit_cost,
          unit_cost = shopify_cost, 
          landed_cost = shopify_cost + packaging_cost,
          updated_at = datetime('now')
      WHERE store_id = ? AND parent_title = ? AND variant_title = ?
    `).run(Number(store_id), parent_title, variant_title || '');
    // Log cost change
    try {
      db.prepare(`INSERT INTO cost_change_log (store_id, parent_title, variant_title, shopify_variant_id, old_cost, new_cost, old_shopify_cost, new_shopify_cost, changed_by) VALUES (?,?,?,?,?,?,?,?,'bulk_accept')`)
        .run(Number(store_id), parent_title, variant_title || '', existing?.shopify_variant_id || null, existing?.unit_cost ?? null, existing?.shopify_cost ?? null, existing?.shopify_cost ?? null, existing?.shopify_cost ?? null);
    } catch (_) {}
    
    // Auto-heal orders matching these variants
    healCostsForStore(store_id);

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

    // Auto-heal orders matching this parent title
    healCostsForStore(store_id);

    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/finance/bulk-accept-shopify-costs
router.post('/bulk-accept-shopify-costs', (req, res) => {
  try {
    const { store_id, parent_title } = req.body;
    if (!store_id || !parent_title) return res.status(400).json({ error: "Missing required fields" });

    // Capture before-state for logging
    const variants = db.prepare('SELECT parent_title, variant_title, shopify_variant_id, unit_cost, shopify_cost FROM product_master_costs WHERE store_id = ? AND parent_title = ? AND shopify_cost > 0').all(Number(store_id), parent_title);

    const result = db.prepare(`
      UPDATE product_master_costs 
      SET previous_unit_cost = unit_cost,
          unit_cost = shopify_cost,
          landed_cost = shopify_cost + packaging_cost,
          updated_at = datetime('now')
      WHERE store_id = ? AND parent_title = ? AND shopify_cost > 0
    `).run(Number(store_id), parent_title);

    // Log each variant's cost change
    try {
      for (const v of variants) {
        db.prepare(`INSERT INTO cost_change_log (store_id, parent_title, variant_title, shopify_variant_id, old_cost, new_cost, old_shopify_cost, new_shopify_cost, changed_by) VALUES (?,?,?,?,?,?,?,?,'bulk_accept')`)
          .run(Number(store_id), v.parent_title, v.variant_title || '', v.shopify_variant_id || null, v.unit_cost ?? null, v.shopify_cost ?? null, v.shopify_cost ?? null, v.shopify_cost ?? null);
      }
    } catch (_) {}

    // Auto-heal orders matching these parent variants
    healCostsForStore(store_id);

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

    // Auto-heal orders matching these variants
    healCostsForStore(store_id);

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

    // Auto-heal orders matching these parent variants
    healCostsForStore(store_id);

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

// POST /api/finance/delete-master-variant
router.post('/delete-master-variant', (req, res) => {
  const { store_id, parent_title, variant_title } = req.body;
  if (!store_id || !parent_title) return res.status(400).json({ error: 'store_id and parent_title required' });

  try {
    const result = db.prepare('DELETE FROM product_master_costs WHERE store_id = ? AND parent_title = ? AND variant_title = ?')
      .run(Number(store_id), parent_title, variant_title || '');
    res.json({ success: true, count: result.changes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/finance/bulk-delete-master-variants
router.post('/bulk-delete-master-variants', (req, res) => {
  const { store_id, ids } = req.body;
  if (!store_id || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'store_id and ids array required' });

  try {
    const placeholders = ids.map(() => '?').join(',');
    const result = db.prepare(`DELETE FROM product_master_costs WHERE store_id = ? AND id IN (${placeholders})`)
      .run(Number(store_id), ...ids);
    res.json({ success: true, count: result.changes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/finance/bulk-sync-variants-costs
router.post('/bulk-sync-variants-costs', (req, res) => {
  const { store_id, ids, unit_cost, packaging_cost } = req.body;
  if (!store_id || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'store_id and ids array required' });

  try {
    const landed = Number(unit_cost || 0) + Number(packaging_cost || 0);
    const placeholders = ids.map(() => '?').join(',');
    const result = db.prepare(`
      UPDATE product_master_costs 
      SET unit_cost = ?,
          packaging_cost = ?,
          landed_cost = ?,
          updated_at = datetime('now')
      WHERE store_id = ? AND id IN (${placeholders})
    `).run(Number(unit_cost || 0), Number(packaging_cost || 0), landed, Number(store_id), ...ids);
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

// POST /api/finance/heal-order-cost
router.post('/heal-order-cost', (req, res) => {
  const { store_id, shopify_order_id } = req.body;
  if (!store_id || !shopify_order_id) {
    return res.status(400).json({ error: 'store_id and shopify_order_id required' });
  }

  try {
    const order = db.prepare('SELECT id, line_items, delivery_status FROM orders WHERE store_id = ? AND shopify_order_id = ?').get(Number(store_id), String(shopify_order_id));
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Fetch catalog registry for matching
    const catalog = db.prepare('SELECT shopify_variant_id, sku, parent_title, variant_title, landed_cost, packaging_cost FROM product_master_costs WHERE store_id = ?').all(Number(store_id));

    let parsedItems = [];
    try {
      if (order.line_items) parsedItems = JSON.parse(order.line_items);
    } catch (e) {}

    let totalLanded = 0;
    let totalPackaging = 0;
    let hasMissingCostItem = false;

    if (parsedItems.length > 0) {
      for (const item of parsedItems) {
        const qty = item.quantity || 0;
        if (qty === 0) continue;

        let matchRow = null;
        const vId = item.variant_id ? String(item.variant_id) : '';
        const numericVariantId = vId.includes('/') ? vId.split('/').pop() : vId;
        const gidVariantId = numericVariantId ? `gid://shopify/ProductVariant/${numericVariantId}` : '';
        const sku = item.sku ? String(item.sku).trim() : '';
        const pName = item.title ? String(item.title).trim() : '';
        const vName = item.variant_title ? String(item.variant_title).trim() : '';

        // 1. Variant ID match (prioritized)
        if (numericVariantId) {
          matchRow = catalog.find(c => 
            c.shopify_variant_id && 
            (String(c.shopify_variant_id).includes(numericVariantId) || String(c.shopify_variant_id) === gidVariantId)
          );
        }

        // 2. SKU match
        if (!matchRow && sku) {
          const skuMatches = catalog.filter(c => c.sku && String(c.sku).trim().toLowerCase() === sku.toLowerCase());
          if (skuMatches.length > 0) {
            skuMatches.sort((a, b) => {
              const aCost = a.landed_cost || a.shopify_cost || 0;
              const bCost = b.landed_cost || b.shopify_cost || 0;
              if (aCost > 0 && bCost === 0) return -1;
              if (bCost > 0 && aCost === 0) return 1;
              const aStatus = a.status || 'active';
              const bStatus = b.status || 'active';
              if (aStatus === 'active' && bStatus !== 'active') return -1;
              if (bStatus === 'active' && aStatus !== 'active') return 1;
              return 0;
            });
            matchRow = skuMatches[0];
          }
        }

        // 3. Parent + Variant Name match
        if (!matchRow && pName) {
          matchRow = catalog.find(c => 
            c.parent_title && c.parent_title.toLowerCase() === pName.toLowerCase() && 
            (vName ? (c.variant_title && c.variant_title.toLowerCase() === vName.toLowerCase()) : true)
          );
        }

        if (matchRow) {
          const landed = matchRow.landed_cost || 0;
          const pkg = matchRow.packaging_cost || 0;
          totalLanded += (landed * qty);
          totalPackaging += (pkg * qty);
        } else {
          hasMissingCostItem = true;
        }
      }
    }

    if (hasMissingCostItem) {
      return res.status(400).json({ error: 'Cannot heal order cost because some line items do not have matching costing registry entries.' });
    }

    // Forcefully update the order cost and set cost_locked to 1
    db.prepare('UPDATE orders SET cost = ?, packaging_cost = ?, cost_locked = 1 WHERE id = ?')
      .run(totalLanded, totalPackaging, order.id);

    res.json({ success: true, landed_cost: totalLanded, packaging_cost: totalPackaging });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

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
