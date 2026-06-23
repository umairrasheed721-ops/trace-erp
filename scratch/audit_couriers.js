const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const dbPath = path.join(__dirname, '..', 'backend', 'trace_erp.db');
const db = new DatabaseSync(dbPath);

console.log('--- COURIER AUDIT FOR MAY 2026 ---');

// Define date bounds
const start = '2026-05-01';
const end = '2026-05-31';

// 1. Total orders in May 2026
const totalOrders = db.prepare(`
  SELECT COUNT(*) as count 
  FROM orders 
  WHERE date(order_date) BETWEEN ? AND ?
`).get(start, end).count;

console.log(`Total orders in May 2026: ${totalOrders}`);

// 2. Orders with/without tracking numbers
const trackingStats = db.prepare(`
  SELECT 
    SUM(CASE WHEN tracking_number IS NOT NULL AND tracking_number != '' THEN 1 ELSE 0 END) as with_tracking,
    SUM(CASE WHEN tracking_number IS NULL OR tracking_number = '' THEN 1 ELSE 0 END) as without_tracking
  FROM orders
  WHERE date(order_date) BETWEEN ? AND ?
`).get(start, end);

console.log(`Orders with tracking: ${trackingStats.with_tracking}`);
console.log(`Orders without tracking: ${trackingStats.without_tracking}`);

// 3. Unique raw courier names in May 2026 (for all orders)
console.log('\n--- Unique Raw Courier Names (All Orders) ---');
const rawCouriersAll = db.prepare(`
  SELECT courier, COUNT(*) as count
  FROM orders
  WHERE date(order_date) BETWEEN ? AND ?
  GROUP BY courier
  ORDER BY count DESC
`).all(start, end);
console.table(rawCouriersAll);

// 4. Unique raw courier names (With tracking numbers)
console.log('\n--- Unique Raw Courier Names (With Tracking) ---');
const rawCouriersWithTracking = db.prepare(`
  SELECT courier, COUNT(*) as count
  FROM orders
  WHERE date(order_date) BETWEEN ? AND ? AND tracking_number IS NOT NULL AND tracking_number != ''
  GROUP BY courier
  ORDER BY count DESC
`).all(start, end);
console.table(rawCouriersWithTracking);

// 5. Run the mapping query (using the SQL CASE statement from reports.js)
console.log('\n--- Mapped Courier Names (Using reports.js CASE statement) ---');
const courierCase = `
  CASE 
    WHEN UPPER(courier) LIKE '%POSTEX%' OR UPPER(courier) LIKE '%POST EX%' THEN 'PostEx'
    WHEN UPPER(courier) LIKE '%LCS%' OR UPPER(courier) LIKE '%LEOPARD%' THEN 'Leopards'
    WHEN UPPER(courier) LIKE '%TCS%' THEN 'TCS'
    WHEN UPPER(courier) LIKE '%INSTA%' OR UPPER(courier) LIKE '%INSTAWORLD%' OR UPPER(courier) LIKE '%INSTA WORLD%' OR UPPER(courier) LIKE '%ILOGISTIC%' THEN 'InstaLogistics'
    WHEN courier GLOB '*[0-9]*' AND length(TRIM(courier)) < 6 THEN 'PostEx'
    WHEN courier IS NULL OR TRIM(courier) = '' THEN 'PostEx'
    ELSE TRIM(courier)
  END
`;

const mappedCouriers = db.prepare(`
  SELECT 
    ${courierCase} as courier_name,
    COUNT(*) as total_landed,
    SUM(CASE WHEN delivery_status = 'Delivered' THEN 1 ELSE 0 END) as delivered
  FROM orders
  WHERE tracking_number IS NOT NULL AND tracking_number != '' AND date(order_date) BETWEEN ? AND ?
  GROUP BY courier_name
`).all(start, end);
console.table(mappedCouriers);
