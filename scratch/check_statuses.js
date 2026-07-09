const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = path.resolve(__dirname, '../backend/trace_erp.db');
const db = new DatabaseSync(dbPath);

const stores = db.prepare('SELECT * FROM stores').all();
console.log('Stores in DB:', stores);

const productsCount = db.prepare('SELECT COUNT(*) as count FROM product_master_costs').all();
console.log('Total product_master_costs count:', productsCount);

const activeTenant = db.prepare('SELECT DISTINCT tenant_id FROM orders').all();
console.log('Tenant IDs in orders:', activeTenant);
