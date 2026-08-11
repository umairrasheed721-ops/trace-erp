/**
 * Check order date ranges in DB
 */
const { db } = require('../backend/db');

function checkDateRanges() {
  const minMax = db.prepare("SELECT MIN(order_date) as oldest, MAX(order_date) as newest, COUNT(*) as total FROM orders").get();
  console.log('Order Date Ranges in DB:', minMax);

  const sampleRecent = db.prepare("SELECT id, ref_number, tracking_number, customer_name, order_date, delivery_status, courier_status FROM orders ORDER BY id DESC LIMIT 10").all();
  console.log('\nSample 10 Most Recent Orders in DB:');
  console.log(JSON.stringify(sampleRecent, null, 2));
}

checkDateRanges();
