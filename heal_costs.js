const db = require('./backend/db');

function heal() {
  console.log('🩹 Starting global cost healing...');
  
  const orders = db.prepare('SELECT id, store_id, product_titles, cost FROM orders WHERE cost = 0 AND items_count > 0').all();
  console.log(`🔍 Found ${orders.length} orders with 0 cost.`);

  let healedCount = 0;

  for (const order of orders) {
    let newTotalCost = 0;
    const items = order.product_titles.split(', ');
    
    for (const itemStr of items) {
      // Format: "Product Name - Variant (xQty)"
      const match = itemStr.match(/(.+) \(x(\d+)\)/);
      if (!match) continue;

      const fullTitle = match[1];
      const qty = parseInt(match[2]);

      const parts = fullTitle.split(' - ');
      const pName = parts[0].trim();
      const vName = parts.length > 1 ? parts[1].trim() : '';

      const registry = db.prepare(`
        SELECT landed_cost FROM product_master_costs 
        WHERE store_id = ? AND parent_title = ? 
        AND (variant_title = ? OR variant_title = '' OR variant_title IS NULL)
        ORDER BY (CASE WHEN variant_title = ? THEN 0 ELSE 1 END) ASC
        LIMIT 1
      `).get(order.store_id, pName, vName, vName);

      if (registry && registry.landed_cost > 0) {
        newTotalCost += registry.landed_cost * qty;
      }
    }

    if (newTotalCost > 0) {
      db.prepare('UPDATE orders SET cost = ? WHERE id = ?').run(newTotalCost, order.id);
      healedCount++;
    }
  }

  console.log(`✅ Healing complete. Restored costs for ${healedCount} orders.`);
}

heal();
