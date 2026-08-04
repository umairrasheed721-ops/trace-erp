const path = require('path');
const db = require(path.resolve(__dirname, '../backend/db'));

try {
  const row = db.prepare(`
    SELECT id, ref_number, tracking_number, shopify_order_id, customer_name, delivery_status, courier_status, notes, order_date, status_date, tags
    FROM orders
    WHERE ref_number LIKE '%33368%' OR tracking_number LIKE '%27120050025608%'
  `).get();

  console.log('📌 DB record for TR33368:', row);

  if (row) {
    const history = db.prepare(`
      SELECT h.*, u.username
      FROM order_history h
      LEFT JOIN users u ON h.user_id = u.id
      WHERE h.order_id = ?
      ORDER BY h.created_at DESC
    `).all(row.id);
    console.log('📜 History logs count:', history.length);
    console.log('📜 History logs:', JSON.stringify(history, null, 2));
  }
} catch (e) {
  console.error('Error:', e.message);
}
