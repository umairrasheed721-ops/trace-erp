const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const dbPath = path.join(__dirname, '..', 'backend', 'trace_erp.db');
const db = new DatabaseSync(dbPath);

console.log('Verifying date boundaries on database:', dbPath);

// Start a transaction so we can rollback our changes and not dirty the db
db.exec('BEGIN TRANSACTION');

try {
  // Clear any existing test orders we might create
  db.prepare("DELETE FROM orders WHERE shopify_order_id LIKE 'test_boundary_%'").run();

  // Insert two test orders for store_id = 1
  // Order A: placed on May 1st
  db.prepare(`
    INSERT INTO orders (store_id, shopify_order_id, ref_number, customer_name, tracking_number, courier, order_date, delivery_status, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(1, 'test_boundary_a', 'TR_BND_A', 'Test Boundary A', 'TRK_BND_A', 'PostEx', '2026-05-01 08:30:00', 'Delivered', 'default');

  // Order B: placed on May 31st with a time (this is the boundary day)
  db.prepare(`
    INSERT INTO orders (store_id, shopify_order_id, ref_number, customer_name, tracking_number, courier, order_date, delivery_status, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(1, 'test_boundary_b', 'TR_BND_B', 'Test Boundary B', 'TRK_BND_B', 'PostEx', '2026-05-31 15:30:00', 'Delivered', 'default');

  console.log('Inserted two test orders:');
  console.log('- 2026-05-01 08:30:00 (test_boundary_a)');
  console.log('- 2026-05-31 15:30:00 (test_boundary_b)');

  // 1. Test OLD query logic: order_date BETWEEN ? AND ?
  const oldQueryCount = db.prepare(`
    SELECT COUNT(*) as count 
    FROM orders 
    WHERE store_id = 1 AND shopify_order_id LIKE 'test_boundary_%' AND order_date BETWEEN '2026-05-01' AND '2026-05-31'
  `).get().count;
  
  console.log('\n--- OLD QUERY LOGIC ---');
  console.log("Query: order_date BETWEEN '2026-05-01' AND '2026-05-31'");
  console.log('Result Count:', oldQueryCount);
  if (oldQueryCount === 1) {
    console.log('✅ Matches prediction: Order B (May 31st with time) was EXCLUDED!');
  } else {
    console.log('❌ Unexpected count:', oldQueryCount);
  }

  // 2. Test NEW query logic: date(order_date) BETWEEN ? AND ?
  const newQueryCount = db.prepare(`
    SELECT COUNT(*) as count 
    FROM orders 
    WHERE store_id = 1 AND shopify_order_id LIKE 'test_boundary_%' AND date(order_date) BETWEEN '2026-05-01' AND '2026-05-31'
  `).get().count;

  console.log('\n--- NEW QUERY LOGIC ---');
  console.log("Query: date(order_date) BETWEEN '2026-05-01' AND '2026-05-31'");
  console.log('Result Count:', newQueryCount);
  if (newQueryCount === 2) {
    console.log('✅ Matches prediction: Both Order A and Order B (May 31st with time) were INCLUDED!');
  } else {
    console.log('❌ Unexpected count:', newQueryCount);
  }

} catch (err) {
  console.error('Test error:', err.stack || err.message);
} finally {
  // Always rollback to preserve original DB state
  db.exec('ROLLBACK');
  console.log('\nDatabase changes rolled back.');
}
