const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const dbPath = path.join(__dirname, '..', 'backend', 'trace_erp.db');
const db = new DatabaseSync(dbPath);

console.log('Querying trace_erp.db details:');
const totalOrders = db.prepare("SELECT COUNT(*) as count FROM orders").all()[0].count;
console.log('Total orders in DB:', totalOrders);

const dateRange = db.prepare("SELECT MIN(order_date) as min_date, MAX(order_date) as max_date FROM orders").all()[0];
console.log('Order date range in DB:', dateRange);

const query = `
  SELECT id, ref_number, customer_name, order_date, delivery_status, price, tracking_number, courier
  FROM orders
  WHERE (tracking_number IS NULL OR TRIM(tracking_number) = '' OR tracking_number = '—')
    AND date(order_date) BETWEEN '2026-05-01' AND '2026-05-31'
  ORDER BY order_date ASC
`;

const rows = db.prepare(query).all();
console.log(`Found ${rows.length} unassigned orders:`);
console.table(rows.map(r => ({
  ID: r.id,
  Ref: r.ref_number,
  Name: r.customer_name,
  Date: r.order_date.substring(0, 10),
  Status: r.delivery_status,
  Price: r.price,
  Tracking: r.tracking_number,
  Courier: r.courier
})));
