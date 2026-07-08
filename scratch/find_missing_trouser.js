const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const dbPath = path.resolve(__dirname, '../backend/trace_erp.db');

console.log('Connecting to:', dbPath);
const db = new DatabaseSync(dbPath);

// Check in registry
const registry = db.prepare("SELECT * FROM product_master_costs WHERE parent_title LIKE '%TROUSER%' OR variant_title LIKE '%TROUSER%'").all();
console.log('Registry Matches:', JSON.stringify(registry, null, 2));

// Check in orders
const orders = db.prepare("SELECT id, ref_number, cost, line_items, product_titles FROM orders WHERE line_items LIKE '%TROUSER%' OR product_titles LIKE '%TROUSER%' LIMIT 5").all();
console.log('Orders Matches:', JSON.stringify(orders, null, 2));

db.close();
