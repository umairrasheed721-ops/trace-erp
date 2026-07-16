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

    const catalog = db.prepare('SELECT shopify_variant_id, sku, parent_title, variant_title, landed_cost FROM product_master_costs WHERE store_id = ?').all(Number(storeId));
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

          if (numericVariantId) {
            matchRow = catalog.find(c => 
              c.shopify_variant_id && 
              (String(c.shopify_variant_id).includes(numericVariantId) || String(c.shopify_variant_id) === gidVariantId)
            );
          }
          if (!matchRow && sku) {
            matchRow = catalog.find(c => c.sku && String(c.sku).trim().toLowerCase() === sku.toLowerCase());
          }
          if (!matchRow) {
            matchRow = catalog.find(c => 
              c.parent_title && c.parent_title.toLowerCase() === parentName.toLowerCase() && 
              (variantName ? (c.variant_title && c.variant_title.toLowerCase() === variantName.toLowerCase()) : true)
            );
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
          const matchRow = catalog.find(c => 
            c.parent_title && c.parent_title.toLowerCase() === parentName.toLowerCase() && 
            (variantName ? (c.variant_title && c.variant_title.toLowerCase() === variantName.toLowerCase()) : true)
          );

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
    // 1. Missing Mapping (In Master Registry but cost is 0)
    const zeroCostInRegistry = db.prepare(`
      SELECT parent_title, variant_title, inventory_qty, landed_cost 
      FROM product_master_costs 
      WHERE store_id = ? AND (landed_cost = 0 OR landed_cost IS NULL)
      ORDER BY inventory_qty DESC
    `).all(Number(storeId));

    // 2. Pending Orders with Missing Cost (The actual risk)
    const pendingOrdersWithMissingCost = db.prepare(`
      SELECT id, shopify_order_id, customer_name, price, order_date 
      FROM orders 
      WHERE store_id = ? 
      AND (cost = 0 OR cost IS NULL)
      AND delivery_status NOT IN ('Cancelled', 'Returned', 'RTO')
      AND order_date >= date('now', '-30 days')
      ORDER BY order_date DESC
    `).all(Number(storeId));

    // 3. Extract unmapped line items from active orders in the last 60 days
    const activeOrders = db.prepare(`
      SELECT line_items FROM orders 
      WHERE store_id = ? 
      AND delivery_status NOT IN ('Cancelled', 'Returned', 'RTO')
      AND order_date >= date('now', '-60 days')
      AND line_items IS NOT NULL
    `).all(Number(storeId));

    const catalog = db.prepare(`
      SELECT parent_title, variant_title, shopify_variant_id, sku 
      FROM product_master_costs 
      WHERE store_id = ?
    `).all(Number(storeId));

    const missingMap = new Map();

    for (const order of activeOrders) {
      let items = [];
      try {
        items = JSON.parse(order.line_items || '[]');
      } catch (e) {}

      for (const item of items) {
        if (!item.title) continue;

        const vId = item.variant_id ? String(item.variant_id) : '';
        const sku = item.sku ? String(item.sku).trim() : '';
        const pName = item.title.trim();
        const vName = item.variant_title ? item.variant_title.trim() : '';

        let matched = false;
        if (vId || sku) {
          matched = catalog.some(c => 
            (vId && c.shopify_variant_id === vId) || 
            (sku && c.sku === sku)
          );
        }
        if (!matched) {
          matched = catalog.some(c => c.parent_title === pName && c.variant_title === vName);
        }
        if (!matched) {
          matched = catalog.some(c => c.parent_title === pName);
        }
        if (!matched && vName) {
          const fullSearchTitle1 = `${pName} - ${vName}`;
          const fullSearchTitle2 = `${pName} - ${vName.split('/').map(x => x.trim()).reverse().join(' / ')}`;
          matched = catalog.some(c => 
            c.parent_title.trim() === fullSearchTitle1 || 
            c.parent_title.trim() === fullSearchTitle2
          );
        }

        if (!matched) {
          const key = `${pName}::${vName}`;
          if (!missingMap.has(key)) {
            missingMap.set(key, {
              parent_title: pName,
              variant_title: vName,
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

  static async getReturnsPending(storeId) {
    return db.prepare(`
      SELECT id, shopify_order_id, ref_number, customer_name, tracking_number, courier, delivery_status, order_date, status_date, price, notes, line_items, product_titles, courier_status
      FROM orders 
      WHERE store_id = ? 
      AND LOWER(delivery_status) IN ('returned', 'rto')
      AND LOWER(delivery_status) NOT IN ('return received', 'delivered', 'cancelled', 'paid')
      AND NOT (LOWER(courier) = 'instaworld' AND LOWER(courier_status) = 'return received at insta hub')
      ORDER BY order_date DESC
      LIMIT 1000
    `).all(Number(storeId));
  }

  static async getReturnsHistory(storeId, days) {
    return db.prepare(`
      SELECT rl.*, o.ref_number, o.customer_name, o.courier, o.notes, o.price, o.line_items, o.product_titles
      FROM returns_log rl
      JOIN orders o ON rl.order_id = o.id
      WHERE rl.store_id = ?
      AND rl.created_at >= datetime('now', '-${days} days')
      ORDER BY rl.created_at DESC
    `).all(Number(storeId));
  }

  static async getReturnsExportData(storeId, days) {
    return db.prepare(`
      SELECT rl.created_at as verified_at, o.ref_number, o.shopify_order_id, o.customer_name, rl.tracking_number, o.courier, rl.processed_by, 
             CASE WHEN rl.restocked_shopify = 1 THEN 'Yes' ELSE 'No' END as restocked
      FROM returns_log rl
      JOIN orders o ON rl.order_id = o.id
      WHERE rl.store_id = ?
      AND rl.created_at >= datetime('now', '-${days} days')
      ORDER BY rl.created_at DESC
    `).all(Number(storeId));
  }
}

module.exports = FinanceAggregator;
