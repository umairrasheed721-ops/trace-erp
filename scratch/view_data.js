const { DatabaseSync } = require('node:sqlite');
const dbPath = '/Users/umairrasheed/Desktop/antigravity/trace-erp/backend/trace_erp.db';
const db = new DatabaseSync(dbPath);

console.log('--- STORES ---');
try {
  const stores = db.prepare('SELECT * FROM stores').all();
  console.log(JSON.stringify(stores, null, 2));
} catch (e) {
  console.error(e);
}

console.log('--- ORDERS ---');
try {
  const orders = db.prepare('SELECT * FROM orders').all();
  console.log(JSON.stringify(orders, null, 2));
} catch (e) {
  console.error(e);
}
