const path = require('path');
const db = require(path.resolve(__dirname, '../backend/db'));

try {
  const orders = db.prepare(`
    SELECT id, store_id, ref_number, tracking_number, customer_name, delivery_status, courier, courier_status, payment_status, paid_amount, price, order_date, created_timestamp
    FROM orders 
    WHERE price = 6677 OR address LIKE '%DHA 1%' OR customer_name LIKE '%Deliver By Hand%' OR courier LIKE '%Self%'
  `).all();

  console.log(`📌 Found ${orders.length} matching order(s) for 6677 / Self Delivery:`);
  console.log(JSON.stringify(orders, null, 2));

} catch (e) {
  console.error('Error:', e);
}
