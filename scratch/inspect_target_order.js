const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = path.resolve(__dirname, '../backend/trace_erp.db');
const db = new DatabaseSync(dbPath);

const partialRef = db.prepare('SELECT id, ref_number, shopify_order_id, financial_status, delivery_status FROM orders WHERE ref_number LIKE ? OR shopify_order_id LIKE ?').all('%29159%', '%29159%');
console.log('Partial ref matches:', partialRef);

const sample = db.prepare('SELECT id, ref_number, shopify_order_id, financial_status, delivery_status FROM orders LIMIT 5').all();
console.log('Sample orders:', sample);
