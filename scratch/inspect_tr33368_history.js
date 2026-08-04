const path = require('path');
const db = require(path.resolve(__dirname, '../backend/db'));

try {
  const order = db.prepare(`SELECT * FROM orders WHERE ref_number = 'TR33368' OR tracking_number = '27120050025608'`).get();
  console.log('📌 Order TR33368 in DB:', order);

  if (order) {
    const history = db.prepare(`SELECT * FROM order_history WHERE order_id = ? ORDER BY created_at DESC`).all(order.id);
    console.log('📜 Order History:', history);
  }
} catch (e) {
  console.error('Error:', e);
}
