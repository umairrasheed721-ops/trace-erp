const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const dbPath = path.resolve(__dirname, '../backend/trace_erp.db');

const db = new DatabaseSync(dbPath);

console.log('Total entries in product_master_costs:', db.prepare("SELECT count(*) as count FROM product_master_costs").get().count);
console.log('Total entries in orders:', db.prepare("SELECT count(*) as count FROM orders").get().count);

// Let's search for "PERRY" case-insensitive with lower()
const registry = db.prepare("SELECT parent_title, variant_title, shopify_variant_id, landed_cost FROM product_master_costs WHERE lower(parent_title) LIKE '%perry%'").all();
console.log('Registry Matches (lower):', registry);

const orders = db.prepare("SELECT id, shopify_order_id, product_titles, cost FROM orders WHERE lower(product_titles) LIKE '%perry%' LIMIT 10").all();
console.log('Orders Matches (lower):', orders);

db.close();
