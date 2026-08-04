const path = require('path');
const db = require(path.resolve(__dirname, '../backend/db'));

try {
  const refs = ['TR33313', 'TR33315', 'TR33302'];
  const orders = db.prepare(`
    SELECT id, store_id, ref_number, shopify_order_id, tracking_number, courier, delivery_status, courier_status, payment_status, notes, order_date, status_date
    FROM orders
    WHERE ref_number IN ('TR33313', 'TR33315', 'TR33302')
  `).all();

  console.log(`📌 Found ${orders.length} order(s):`);
  console.log(JSON.stringify(orders, null, 2));

} catch (e) {
  console.error('Error:', e);
}
