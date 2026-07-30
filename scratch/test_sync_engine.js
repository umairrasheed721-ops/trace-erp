const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const db = new DatabaseSync(path.join(__dirname, '../backend/trace_erp.db'));

// Inspect stores
const stores = db.prepare('SELECT id, shop_domain, access_token FROM stores').all();
console.log('Stores:', stores);
