const path = require('path');
const db = require(path.resolve(__dirname, '../backend/db'));

try {
  const storeId = 1;
  const stuckRows = db.prepare(`
    SELECT id, ref_number, tracking_number, delivery_status, courier_status, status_date, order_date
    FROM orders
    WHERE store_id = ?
    AND tracking_number IS NOT NULL AND tracking_number != ''
    AND LOWER(delivery_status) NOT IN ('delivered','return received','paid','pending','cancelled','returned','void','voided')
    AND datetime(COALESCE(status_date, order_date)) < datetime('now', '-48 hours')
    ORDER BY COALESCE(status_date, order_date) ASC
  `).all(storeId);

  console.log(`📌 Found ${stuckRows.length} stuck order(s) in local DB:`);
  if (stuckRows.length > 0) {
    console.log('Oldest 5 stuck orders:', stuckRows.slice(0, 5));
    console.log('Newest 5 stuck orders:', stuckRows.slice(-5));
  }
} catch (e) {
  console.error('Error:', e.message);
}
