const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const dbPath = path.resolve(__dirname, '../backend/trace_erp.db');

console.log('Connecting to:', dbPath);
const db = new DatabaseSync(dbPath);

const lastOrders = db.prepare("SELECT id, ref_number, phone, price, cost, product_titles FROM orders ORDER BY id DESC LIMIT 10").all();
console.log('Last 10 Orders:', JSON.stringify(lastOrders, null, 2));

const searchOrder = db.prepare("SELECT id, ref_number, phone, price, cost FROM orders WHERE ref_number LIKE '%TR32695%' OR id LIKE '%32695%' OR shopify_order_id LIKE '%32695%'").get();
console.log('Search Order:', JSON.stringify(searchOrder, null, 2));

db.close();
