const path = require('path');
const db = require(path.resolve(__dirname, '../backend/db'));

try {
  const order = db.prepare(`
    SELECT id, ref_number, tracking_number, customer_name, phone, delivery_status, courier_status, notes, failed_attempts, status_date, order_date
    FROM orders 
    WHERE tracking_number = '27120050025344' OR ref_number LIKE '%27120050025344%'
  `).get();

  console.log('📌 Live DB Record for Siraj Khan (27120050025344):');
  console.log(JSON.stringify(order, null, 2));

  // Also check order_history for this order ID if order exists
  if (order) {
    const history = db.prepare(`
      SELECT * FROM order_history WHERE order_id = ? ORDER BY created_at DESC
    `).all(order.id);
    console.log(`\n📌 order_history entries (${history.length} found):`);
    console.log(JSON.stringify(history, null, 2));
  }
} catch (e) {
  console.error('Error:', e);
}
