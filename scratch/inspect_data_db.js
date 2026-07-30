const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = path.join(__dirname, '../data.db');
const db = new DatabaseSync(dbPath);

const stmt = db.prepare('SELECT id, store_id, ref_number, shopify_order_id, customer_name, delivery_status, tracking_number, courier, notes FROM orders WHERE ref_number LIKE ? OR shopify_order_id LIKE ? OR customer_name LIKE ?');

const orders = stmt.all('%33254%', '%33254%', '%Arbab%');
console.log('Root data.db Orders:', JSON.stringify(orders, null, 2));
