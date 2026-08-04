const path = require('path');
const db = require(path.resolve(__dirname, '../backend/db'));

try {
  const orders = db.prepare(`
    SELECT id, store_id, ref_number, tracking_number, customer_name, delivery_status, courier, payment_status, paid_amount, price, order_date
    FROM orders 
    WHERE LOWER(delivery_status) LIKE '%delivered%'
    LIMIT 20
  `).all();

  console.log(`📌 Delivered Orders sample (${orders.length} found):`);
  console.log(JSON.stringify(orders, null, 2));

} catch (e) {
  console.error('Error:', e);
}
