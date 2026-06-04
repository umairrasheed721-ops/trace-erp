const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = path.resolve(__dirname, '../backend/trace_erp.db');
const db = new DatabaseSync(dbPath);

console.log('Clearing old Usman Khan test orders...');
db.prepare("DELETE FROM orders WHERE customer_name = 'Usman Khan'").run();

console.log('Inserting mock orders...');

// Order 1: Usman Khan with phone +923356343244
db.prepare(`
  INSERT INTO orders (
    store_id, shopify_order_id, ref_number, customer_name, phone, price, delivery_status, order_date, tenant_id
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, ?
  )
`).run(1, 'shopify_usman_1', 'TR32191', 'Usman Khan', '+923356343244', 1000, 'Confirmed', '2026-06-04 12:00:00', 'default');

// Order 2: Usman Khan with phone 03356343244
db.prepare(`
  INSERT INTO orders (
    store_id, shopify_order_id, ref_number, customer_name, phone, price, delivery_status, order_date, tenant_id
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, ?
  )
`).run(1, 'shopify_usman_2', 'TR32192', 'Usman Khan', '03356343244', 1500, 'Cancelled', '2026-06-04 12:30:00', 'default');

console.log('Test data setup complete.');
