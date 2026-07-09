const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const dbPath = path.resolve(__dirname, '../backend/trace_erp.db');

console.log('Connecting to database:', dbPath);
const db = new DatabaseSync(dbPath);

// 1. Search F-PERRY in product_master_costs
const registry = db.prepare("SELECT * FROM product_master_costs WHERE parent_title LIKE '%PERRY%'").all();
console.log('Registry entries for PERRY:', JSON.stringify(registry, null, 2));

// 2. Search F-PERRY in orders (both line_items and product_titles)
const orders = db.prepare("SELECT id, shopify_order_id, line_items, product_titles, cost FROM orders WHERE line_items LIKE '%PERRY%' OR product_titles LIKE '%PERRY%' LIMIT 5").all();
console.log('Orders entries for PERRY:', JSON.stringify(orders, null, 2));

db.close();
