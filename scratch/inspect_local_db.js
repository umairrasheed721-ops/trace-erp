const { DatabaseSync } = require('node:sqlite');
const dbPath = '/Users/umairrasheed/Desktop/antigravity/trace-erp/backend/trace_erp.db';
const db = new DatabaseSync(dbPath);

console.log('--- STORES ---');
try {
  const stores = db.prepare('SELECT id, name, shop_domain FROM stores').all();
  console.log(JSON.stringify(stores, null, 2));
} catch (e) {
  console.error(e);
}

console.log('--- ORDERS COUNT ---');
try {
  const cnt = db.prepare('SELECT store_id, COUNT(*) as total FROM orders GROUP BY store_id').all();
  console.log(JSON.stringify(cnt, null, 2));
} catch (e) {
  console.error(e);
}
