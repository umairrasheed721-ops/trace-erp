const path = require('path');
const db = require(path.resolve(__dirname, '../backend/db'));

try {
  const order = db.prepare(`
    SELECT id, store_id, ref_number, tracking_number, customer_name, phone, delivery_status, courier_status, notes, failed_attempts, status_date, order_date
    FROM orders 
    WHERE tracking_number LIKE '%22120050025574%' OR ref_number LIKE '%AS1037%' OR notes LIKE '%22120050025574%'
  `).get();
  console.log('Order Details in DB:', JSON.stringify(order, null, 2));
} catch (e) {
  console.error('Error:', e);
}
