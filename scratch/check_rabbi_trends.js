const { DatabaseSync } = require('node:sqlite');
const dbPath = '/Users/umairrasheed/Desktop/antigravity/trace-erp/backend/trace_erp.db';
const db = new DatabaseSync(dbPath);

console.log('--- TOTAL PRODUCT MASTER COSTS ---');
const totalMC = db.prepare("SELECT COUNT(*) as count FROM product_master_costs").get();
console.log(totalMC);

console.log('\n--- SAMPLE 10 MASTER COSTS ---');
const sampleMC = db.prepare("SELECT * FROM product_master_costs LIMIT 10").all();
console.log(sampleMC);

console.log('\n--- TOTAL ZERO COST ORDERS ---');
const totalZero = db.prepare("SELECT COUNT(*) as count FROM orders WHERE cost = 0 OR cost IS NULL").get();
console.log(totalZero);

console.log('\n--- SAMPLE 10 ZERO COST ORDERS ---');
const sampleZero = db.prepare("SELECT id, ref_number, shopify_order_id, product_titles, cost, delivery_status FROM orders WHERE cost = 0 OR cost IS NULL LIMIT 10").all();
console.log(sampleZero);
