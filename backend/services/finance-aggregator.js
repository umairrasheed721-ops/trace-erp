const db = require('../db');

class FinanceAggregator {
  static async getMissingProductList(storeId) {
    const orders = db.prepare('SELECT line_items, product_titles FROM orders WHERE store_id = ? AND (cost = 0 OR cost IS NULL) AND items_count > 0').all(Number(storeId));
    const productCounts = {};
    const regex = /(.*?)\s\(x(\d+)\)(?:,\s|$)/g;

    console.log(`🔍 Scanning missing costs for Store ${storeId}. Orders found: ${orders.length}`);
    
    orders.forEach(o => {
      const itemsStr = o.line_items || o.product_titles;
      if (!itemsStr) return;
      
      let match;
      regex.lastIndex = 0; 
      while ((match = regex.exec(itemsStr)) !== null) {
        const fullName = match[1].trim();
        if (!fullName) continue;
        
        const parts = fullName.split(' - ');
        const parentName = parts[0].trim();
        const variantName = parts.length > 1 ? parts.slice(1).join(' - ').trim() : '';
        const qty = parseInt(match[2]) || 0;

        if (!productCounts[parentName]) {
          productCounts[parentName] = { name: parentName, count: 0, variants: {} };
        }
        productCounts[parentName].count += 1; // Number of orders
        
        if (!productCounts[parentName].variants[variantName]) {
          productCounts[parentName].variants[variantName] = { name: variantName, count: 0 };
        }
        productCounts[parentName].variants[variantName].count += 1;
      }
    });

    const list = Object.values(productCounts)
      .map(p => ({
        ...p,
        variants: Object.values(p.variants).sort((a,b) => b.count - a.count)
      }))
      .sort((a, b) => b.count - a.count);

    console.log(`✅ Scan finished. Unique products: ${list.length}`);
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

    return {
      missingInRegistry: [],
      zeroCostInRegistry,
      pendingOrdersWithMissingCost
    };
  }

  static async getReturnsPending(storeId) {
    return db.prepare(`
      SELECT id, shopify_order_id, ref_number, customer_name, tracking_number, courier, delivery_status, order_date, status_date, price, notes
      FROM orders 
      WHERE store_id = ? 
      AND LOWER(delivery_status) IN ('returned', 'rto', 'return initiated', 'return in progress')
      AND LOWER(delivery_status) NOT IN ('return received', 'delivered', 'cancelled', 'paid')
      ORDER BY order_date DESC
      LIMIT 1000
    `).all(Number(storeId));
  }

  static async getReturnsHistory(storeId, days) {
    return db.prepare(`
      SELECT rl.*, o.ref_number, o.customer_name, o.courier, o.notes
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
