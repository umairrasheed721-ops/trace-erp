const path = require('path');
const db = require(path.resolve(__dirname, '../backend/db'));

try {
  const orders = db.prepare(`
    SELECT id, store_id, ref_number, shopify_order_id, tracking_number, courier, delivery_status, courier_status, customer_name, notes
    FROM orders
    WHERE customer_name LIKE '%Abdul Waheed%' OR customer_name LIKE '%Haris Irfan%' OR customer_name LIKE '%Rizwan Tariq%'
       OR notes LIKE '%21120050025570%' OR notes LIKE '%26120050025569%' OR notes LIKE '%27120050025571%'
       OR ref_number LIKE '%33313%' OR ref_number LIKE '%33315%' OR ref_number LIKE '%33302%'
  `).all();

  console.log(`📌 Found ${orders.length} order(s) for the 3 pending parcels:`);
  console.log(JSON.stringify(orders, null, 2));

} catch (e) {
  console.error('Error:', e);
}
