const db = require('../backend/db');

try {
  console.log("Finding unique store_ids in orders table...");
  const stores = db.prepare('SELECT DISTINCT store_id FROM orders').all();
  console.log("Available store_ids:", stores);
  
  if (stores.length === 0) {
    console.log("No orders found.");
    process.exit(0);
  }
  
  const activeStoreId = stores[0].store_id;
  console.log(`Running daily reports aggregate query for store_id ${activeStoreId}...`);

  // Run a modified subset of the daily query to inspect results
  const query = `
    SELECT 
      substr(order_date, 1, 10) as date_string,
      COUNT(id) as landed_orders,
      SUM(CASE WHEN (courier_fee IS NULL OR courier_fee < 1) AND LOWER(delivery_status) NOT IN ('pending', 'cancelled') AND (tracking_number IS NOT NULL AND tracking_number != '') THEN 1 ELSE 0 END) as zero_expense_count
    FROM orders
    WHERE store_id = ?
    GROUP BY substr(order_date, 1, 10)
    ORDER BY date_string DESC
    LIMIT 10
  `;

  const results = db.prepare(query).all(activeStoreId);
  console.log("Query Results (Top 10):");
  console.table(results);

  console.log("Checking if there are any orders matching zero expense status in DB globally...");
  const sampleMissing = db.prepare(`
    SELECT id, tracking_number, delivery_status, courier_fee 
    FROM orders 
    WHERE (courier_fee IS NULL OR courier_fee < 1) 
      AND LOWER(delivery_status) NOT IN ('pending', 'cancelled') 
      AND tracking_number IS NOT NULL 
      AND tracking_number != ''
    LIMIT 5
  `).all();
  console.log("Sample Zero Expense Orders (Global):", sampleMissing);

} catch (err) {
  console.error("Error running verification script:", err);
}
