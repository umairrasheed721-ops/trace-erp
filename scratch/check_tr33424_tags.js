const path = require('path');
const db = require(path.resolve(__dirname, '../backend/db'));

try {
  const row = db.prepare(`SELECT id, store_id, ref_number, shopify_order_id, tags, notes, delivery_status FROM orders WHERE ref_number LIKE '%33424%' OR shopify_order_id LIKE '%33424%'`).get();
  console.log('Order TR33424 in DB:', JSON.stringify(row, null, 2));

  // Check total orders with tags
  const taggedCount = db.prepare(`SELECT COUNT(*) as count FROM orders WHERE tags IS NOT NULL AND tags != ''`).get();
  console.log('Total orders in DB with non-empty tags:', taggedCount.count);

  const sampleTags = db.prepare(`SELECT ref_number, tags FROM orders WHERE tags IS NOT NULL AND tags != '' LIMIT 5`).all();
  console.log('Sample orders with tags:', sampleTags);
} catch (e) {
  console.error('Error checking DB:', e);
}
