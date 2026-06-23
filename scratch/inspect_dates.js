const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const dbPath = path.join(__dirname, '..', 'backend', 'trace_erp.db');
const db = new DatabaseSync(dbPath);

console.log('--- DATE AND COURIER INSPECTION ---');

// Get total count of orders
const totalCount = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
console.log('Total orders in DB:', totalCount);

// Get min/max order dates
const dateRange = db.prepare(`
  SELECT 
    MIN(order_date) as min_date, 
    MAX(order_date) as max_date 
  FROM orders
`).get();
console.log('Order Date Range in DB:', dateRange);

// Let's get the top 10 most recent orders
const recent = db.prepare(`
  SELECT id, store_id, order_date, courier, tracking_number, delivery_status 
  FROM orders 
  ORDER BY order_date DESC 
  LIMIT 10
`).all();
console.log('Top 10 most recent orders:');
console.table(recent);

// Let's count unique couriers in the whole database
console.log('\nAll unique couriers in the DB:');
const uniqueCouriers = db.prepare(`
  SELECT courier, COUNT(*) as count 
  FROM orders 
  GROUP BY courier 
  ORDER BY count DESC
`).all();
console.table(uniqueCouriers);
