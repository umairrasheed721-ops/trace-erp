const path = require('path');
const db = require(path.resolve(__dirname, '../backend/db'));

try {
  const recent = db.prepare(`SELECT id, ref_number, shopify_order_id, customer_name, phone, tags FROM orders ORDER BY id DESC LIMIT 15`).all();
  console.log('Recent 15 Orders in DB:', JSON.stringify(recent, null, 2));
} catch (e) {
  console.error('Error:', e);
}
