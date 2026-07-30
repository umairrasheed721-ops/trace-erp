const path = require('path');
const db = require(path.join(__dirname, '../backend/db'));

const orders = db.prepare('SELECT id, store_id, ref_number, shopify_order_id, customer_name, delivery_status, tracking_number, courier, notes FROM orders WHERE customer_name LIKE ? OR ref_number LIKE ?').all('%Arbab%', '%33254%');

console.log('Orders found:', JSON.stringify(orders, null, 2));
