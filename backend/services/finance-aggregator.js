const db = require('../db');

class FinanceAggregator {
  static async getMissingProductList(storeId) {
    const orders = db.prepare(`
      SELECT line_items, product_titles, cost 
      FROM orders 
      WHERE store_id = ? 
      AND order_date >= date('now', '-90 days') 
      AND items_count > 0
    `).all(Number(storeId));

    const catalog = db.prepare('SELECT id, shopify_variant_id, sku, parent_title, variant_title, landed_cost FROM product_master_costs WHERE store_id = ?').all(Number(storeId));
    const aliases = db.prepare('SELECT * FROM product_aliases WHERE store_id = ?').all(Number(storeId));
    const productCounts = {};

    console.log(`🔍 Scanning missing costs for Store ${storeId}. Orders found in last 90 days: ${orders.length}`);
    
    orders.forEach(o => {
      let parsedItems = [];
      try {
        if (o.line_items) parsedItems = JSON.parse(o.line_items);
      } catch (e) {}

      if (parsedItems.length > 0) {
        for (const item of parsedItems) {
          const parentName = (item.title || '').trim();
          const variantName = (item.variant_title || '').trim();
          if (!parentName) continue;

          // Check if this item is missing cost (either not in catalog, or has landed_cost = 0)
          let matchRow = null;
          const vId = item.variant_id ? String(item.variant_id) : '';
          const numericVariantId = vId.includes('/') ? vId.split('/').pop() : vId;
          const gidVariantId = numericVariantId ? `gid://shopify/ProductVariant/${numericVariantId}` : '';
          const sku = item.sku ? String(item.sku).trim() : '';

          // Strict Tier 1 (SKU) -> Tier 2 (Variant ID) -> Tier 3 (Explicit Alias to SKU/Variant ID) — zero title guessing
          if (sku) {
            matchRow = catalog.find(c => c.sku && String(c.sku).trim().toLowerCase() === sku.toLowerCase());
          }
          if (!matchRow && numericVariantId) {
            matchRow = catalog.find(c => 
              c.shopify_variant_id && 
              (String(c.shopify_variant_id).includes(numericVariantId) || String(c.shopify_variant_id) === gidVariantId)
            );
          }

          // Explicit Alias match
          if (!matchRow) {
            const alias = aliases.find(a => 
              a.alias_title.toLowerCase().trim() === parentName.toLowerCase().trim() &&
              (!a.alias_variant || a.alias_variant.toLowerCase().trim() === variantName.toLowerCase().trim())
            ) || aliases.find(a => 
              variantName && a.alias_title.toLowerCase().trim() === `${parentName} - ${variantName}`.toLowerCase().trim()
            ) || aliases.find(a =>
              a.alias_title.toLowerCase().trim() === parentName.toLowerCase().trim()
            );

            if (alias) {
              if (alias.target_master_cost_id) {
                matchRow = catalog.find(c => c.id === alias.target_master_cost_id);
              }
              if (!matchRow && alias.target_sku) {
                matchRow = catalog.find(c => c.sku && c.sku.toLowerCase().trim() === alias.target_sku.toLowerCase().trim());
              }
              if (!matchRow && alias.target_variant_id) {
                matchRow = catalog.find(c => c.shopify_variant_id && String(c.shopify_variant_id).includes(String(alias.target_variant_id)));
              }
            }
          }

          const hasLandedCost = matchRow && (matchRow.landed_cost || 0) > 0;
          if (hasLandedCost) continue; // If cost is resolved and verified, skip!

          if (!productCounts[parentName]) {
            productCounts[parentName] = { name: parentName, count: 0, variants: {} };
          }
          productCounts[parentName].count += 1;
          
          if (!productCounts[parentName].variants[variantName]) {
            productCounts[parentName].variants[variantName] = { name: variantName, count: 0 };
          }
          productCounts[parentName].variants[variantName].count += 1;
        }
      } else if (o.product_titles) {
        const regex = /(.*?)\s\(x(\d+)\)(?:,\s|$)/g;
        let match;
        while ((match = regex.exec(o.product_titles)) !== null) {
          const fullName = match[1].trim();
          if (!fullName) continue;
          
          const parts = fullName.split(' - ');
          const parentName = parts[0].trim();
          const variantName = parts.length > 1 ? parts.slice(1).join(' - ').trim() : '';

          // Check if this item is missing cost
          let matchRow = null;
          const alias = aliases.find(a => 
            a.alias_title.toLowerCase().trim() === parentName.toLowerCase().trim() &&
            (!a.alias_variant || a.alias_variant.toLowerCase().trim() === variantName.toLowerCase().trim())
          ) || aliases.find(a => 
            variantName && a.alias_title.toLowerCase().trim() === `${parentName} - ${variantName}`.toLowerCase().trim()
          ) || aliases.find(a =>
            a.alias_title.toLowerCase().trim() === parentName.toLowerCase().trim()
          );

          if (alias) {
            if (alias.target_master_cost_id) {
              matchRow = catalog.find(c => c.id === alias.target_master_cost_id);
            }
            if (!matchRow && alias.target_sku) {
              matchRow = catalog.find(c => c.sku && c.sku.toLowerCase().trim() === alias.target_sku.toLowerCase().trim());
            }
            if (!matchRow && alias.target_variant_id) {
              matchRow = catalog.find(c => c.shopify_variant_id && String(c.shopify_variant_id).includes(String(alias.target_variant_id)));
            }
          }

          // Strict mode: no title fallback when SKU / Variant ID / Explicit Alias is missing
          const hasLandedCost = matchRow && (matchRow.landed_cost || 0) > 0;
          if (hasLandedCost) continue;

          if (!productCounts[parentName]) {
            productCounts[parentName] = { name: parentName, count: 0, variants: {} };
          }
          productCounts[parentName].count += 1;
          
          if (!productCounts[parentName].variants[variantName]) {
            productCounts[parentName].variants[variantName] = { name: variantName, count: 0 };
          }
          productCounts[parentName].variants[variantName].count += 1;
        }
      }
    });

    const list = Object.values(productCounts)
      .map(p => ({
        ...p,
        variants: Object.values(p.variants).sort((a,b) => b.count - a.count)
      }))
      .sort((a, b) => b.count - a.count);

    console.log(`✅ Scan finished. Unique missing products: ${list.length}`);
    return list;
  }

  static async getPreventionAudit(storeId) {
    const sid = Number(storeId);

    // 1. Zero-Cost Items (In Master Registry but landed_cost is 0 / NULL)
    const zeroCostInRegistry = db.prepare(`
      SELECT parent_title, variant_title, inventory_qty, landed_cost, shopify_cost, sku
      FROM product_master_costs 
      WHERE store_id = ? AND (landed_cost = 0 OR landed_cost IS NULL)
      ORDER BY inventory_qty DESC
    `).all(sid);

    // 2. Pending Orders with Missing Cost (The actual risk — excludes Cancelled/Returned/Return Received)
    const pendingOrdersWithMissingCost = db.prepare(`
      SELECT id, shopify_order_id, customer_name, price, order_date 
      FROM orders 
      WHERE store_id = ? 
      AND (cost = 0 OR cost IS NULL)
      AND LOWER(COALESCE(delivery_status, '')) NOT IN ('cancelled', 'returned', 'return received')
      AND order_date >= date('now', '-30 days')
      ORDER BY order_date DESC
    `).all(sid);

    // 3. Extract unmapped line items from active orders in the last 60 days
    const activeOrders = db.prepare(`
      SELECT line_items FROM orders 
      WHERE store_id = ? 
      AND LOWER(COALESCE(delivery_status, '')) NOT IN ('cancelled', 'returned', 'return received')
      AND order_date >= date('now', '-60 days')
      AND line_items IS NOT NULL
    `).all(sid);

    const catalog = db.prepare(`
      SELECT id, parent_title, variant_title, shopify_variant_id, sku 
      FROM product_master_costs 
      WHERE store_id = ?
    `).all(sid);

    let aliases = [];
    try {
      aliases = db.prepare(`
        SELECT alias_title, alias_variant, target_sku, target_variant_id, target_master_cost_id
        FROM product_aliases
        WHERE store_id = ?
      `).all(sid);
    } catch (_) {}

    // Build O(1) lookup sets for normalized Variant IDs (numeric + GID), SKUs, Titles, and Aliases
    const variantIdSet = new Set();
    const skuSet = new Set();
    const parentTitleSet = new Set();
    const parentVariantSet = new Set();

    for (const c of catalog) {
      if (c.shopify_variant_id) {
        const raw = String(c.shopify_variant_id).trim();
        const numeric = raw.includes('/') ? raw.split('/').pop() : raw;
        if (raw) variantIdSet.add(raw);
        if (numeric) {
          variantIdSet.add(numeric);
          variantIdSet.add(`gid://shopify/ProductVariant/${numeric}`);
        }
      }
      if (c.sku && String(c.sku).trim()) {
        skuSet.add(String(c.sku).trim().toLowerCase());
      }
      const pt = (c.parent_title || '').trim().toLowerCase();
      const vt = (c.variant_title || '').trim().toLowerCase();
      if (pt) {
        parentTitleSet.add(pt);
        parentVariantSet.add(`${pt}::${vt}`);
      }
    }

    const aliasExactSet = new Set();
    const aliasTitleSet = new Set();
    for (const a of aliases) {
      const at = (a.alias_title || '').trim().toLowerCase();
      const av = (a.alias_variant || '').trim().toLowerCase();
      if (!at) continue;
      if (av) {
        aliasExactSet.add(`${at}::${av}`);
      } else {
        aliasTitleSet.add(at);
      }
    }

    const missingMap = new Map();

    for (const order of activeOrders) {
      let items = [];
      try {
        items = JSON.parse(order.line_items || '[]');
      } catch (e) {}

      for (const item of items) {
        if (!item.title) continue;

        const rawVarId = item.variant_id ? String(item.variant_id).trim() : '';
        const numericVarId = rawVarId.includes('/') ? rawVarId.split('/').pop() : rawVarId;
        const skuLower = item.sku ? String(item.sku).trim().toLowerCase() : '';
        const pName = String(item.title).trim();
        const vName = item.variant_title ? String(item.variant_title).trim() : '';
        const pLower = pName.toLowerCase();
        const vLower = vName.toLowerCase();

        // 1. Case-insensitive SKU match (Primary)
        let matched = Boolean(skuLower && skuSet.has(skuLower));

        // 2. Normalized Variant ID match (Secondary)
        if (!matched) {
          matched = Boolean(
            (numericVarId && variantIdSet.has(numericVarId)) ||
            (rawVarId && variantIdSet.has(rawVarId))
          );
        }

        // 3. Explicit Alias match (previously linked ghost/renamed products -> SKU/Variant ID)
        if (!matched) {
          matched = aliasTitleSet.has(pLower) ||
            (vLower && aliasExactSet.has(`${pLower}::${vLower}`)) ||
            (vLower && aliasTitleSet.has(`${pLower} - ${vLower}`));
        }
        // Strict mode: zero loose title fallback — unmapped items MUST surface in missingInRegistry!

        if (!matched) {
          const key = `${pLower}::${vLower}`;
          if (!missingMap.has(key)) {
            missingMap.set(key, {
              parent_title: pName,
              variant_title: vName,
              sku: item.sku ? String(item.sku).trim() : '',
              shopify_variant_id: numericVarId || '',
              inventory_qty: 0,
              landed_cost: 0
            });
          }
        }
      }
    }

    const missingInRegistry = Array.from(missingMap.values());

    return {
      missingInRegistry,
      zeroCostInRegistry,
      pendingOrdersWithMissingCost
    };
  }

  static async getReturnsPending(storeId, days = 7, startDate = null, endDate = null) {
    const d = String(days || '7').toLowerCase();
    let whereClause = `WHERE store_id = ? 
      AND LOWER(delivery_status) IN ('returned', 'rto')
      AND LOWER(delivery_status) NOT IN ('return received', 'delivered', 'cancelled', 'paid')
      AND NOT (LOWER(courier) = 'instaworld' AND LOWER(courier_status) = 'return received at insta hub')`;
    const params = [Number(storeId)];

    if (startDate && endDate) {
      whereClause += ` AND order_date >= ? AND order_date <= ?`;
      params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
    } else if (d === 'today') {
      whereClause += ` AND order_date >= date('now', 'start of day')`;
    } else if (d === 'yesterday') {
      whereClause += ` AND order_date >= date('now', '-1 day', 'start of day') AND order_date < date('now', 'start of day')`;
    } else if (d === 'this_month') {
      whereClause += ` AND order_date >= date('now', 'start of month')`;
    } else if (d === 'last_month') {
      whereClause += ` AND order_date >= date('now', '-1 month', 'start of month') AND order_date < date('now', 'start of month')`;
    } else if (d === 'this_year') {
      whereClause += ` AND order_date >= date('now', 'start of year')`;
    } else if (d === 'last_year') {
      whereClause += ` AND order_date >= date('now', '-1 year', 'start of year') AND order_date < date('now', 'start of year')`;
    } else if (d !== 'all' && d !== '9999') {
      const numDays = parseInt(d, 10) || 7;
      whereClause += ` AND order_date >= datetime('now', '-${numDays} days')`;
    }

    return db.prepare(`
      SELECT id, shopify_order_id, ref_number, customer_name, tracking_number, courier, delivery_status, order_date, status_date, price, notes, line_items, product_titles, courier_status
      FROM orders 
      ${whereClause}
      ORDER BY order_date DESC
      LIMIT 1000
    `).all(...params);
  }

  static async getReturnsHistory(storeId, days = 7, startDate = null, endDate = null) {
    const d = String(days || '7').toLowerCase();
    let whereClause = `WHERE rl.store_id = ?`;
    const params = [Number(storeId)];

    if (startDate && endDate) {
      whereClause += ` AND rl.created_at >= ? AND rl.created_at <= ?`;
      params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
    } else if (d === 'today') {
      whereClause += ` AND rl.created_at >= date('now', 'start of day')`;
    } else if (d === 'yesterday') {
      whereClause += ` AND rl.created_at >= date('now', '-1 day', 'start of day') AND rl.created_at < date('now', 'start of day')`;
    } else if (d === 'this_month') {
      whereClause += ` AND rl.created_at >= date('now', 'start of month')`;
    } else if (d === 'last_month') {
      whereClause += ` AND rl.created_at >= date('now', '-1 month', 'start of month') AND rl.created_at < date('now', 'start of month')`;
    } else if (d === 'this_year') {
      whereClause += ` AND rl.created_at >= date('now', 'start of year')`;
    } else if (d === 'last_year') {
      whereClause += ` AND rl.created_at >= date('now', '-1 year', 'start of year') AND rl.created_at < date('now', 'start of year')`;
    } else if (d !== 'all' && d !== '9999') {
      const numDays = parseInt(d, 10) || 7;
      whereClause += ` AND rl.created_at >= datetime('now', '-${numDays} days')`;
    }

    return db.prepare(`
      SELECT rl.*, rl.notes AS return_notes, o.ref_number, o.customer_name, o.courier, o.notes, o.price, o.line_items, o.product_titles, o.order_date
      FROM returns_log rl
      JOIN orders o ON rl.order_id = o.id
      ${whereClause}
      ORDER BY rl.created_at DESC, o.order_date DESC
    `).all(...params);
  }

  static async getReturnsExportData(storeId, days = 7, startDate = null, endDate = null) {
    const d = String(days || '7').toLowerCase();
    let whereClause = `WHERE rl.store_id = ?`;
    const params = [Number(storeId)];

    if (startDate && endDate) {
      whereClause += ` AND rl.created_at >= ? AND rl.created_at <= ?`;
      params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
    } else if (d === 'today') {
      whereClause += ` AND rl.created_at >= date('now', 'start of day')`;
    } else if (d === 'yesterday') {
      whereClause += ` AND rl.created_at >= date('now', '-1 day', 'start of day') AND rl.created_at < date('now', 'start of day')`;
    } else if (d === 'this_month') {
      whereClause += ` AND rl.created_at >= date('now', 'start of month')`;
    } else if (d === 'last_month') {
      whereClause += ` AND rl.created_at >= date('now', '-1 month', 'start of month') AND rl.created_at < date('now', 'start of month')`;
    } else if (d === 'this_year') {
      whereClause += ` AND rl.created_at >= date('now', 'start of year')`;
    } else if (d === 'last_year') {
      whereClause += ` AND rl.created_at >= date('now', '-1 year', 'start of year') AND rl.created_at < date('now', 'start of year')`;
    } else if (d !== 'all' && d !== '9999') {
      const numDays = parseInt(d, 10) || 7;
      whereClause += ` AND rl.created_at >= datetime('now', '-${numDays} days')`;
    }

    return db.prepare(`
      SELECT rl.created_at as verified_at, o.order_date, o.ref_number, o.shopify_order_id, o.customer_name, rl.tracking_number, o.courier, rl.processed_by, 
             CASE WHEN rl.restocked_shopify = 1 THEN 'Yes' ELSE 'No' END as restocked
      FROM returns_log rl
      JOIN orders o ON rl.order_id = o.id
      ${whereClause}
      ORDER BY o.order_date DESC
    `).all(...params);
  }
}

module.exports = FinanceAggregator;
