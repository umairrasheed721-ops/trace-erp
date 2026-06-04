const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');

const dbFiles = [
  '/Users/umairrasheed/Desktop/antigravity/trace-erp/backend/trace_erp.db',
  '/Users/umairrasheed/Desktop/antigravity/trace-erp/backend/trace_erp_tenant_abc.db',
  '/Users/umairrasheed/Desktop/antigravity/trace-erp/backend/trace_erp_tenant_b.db'
];

dbFiles.forEach(dbPath => {
  if (!fs.existsSync(dbPath)) return;
  console.log(`\n🔍 DB: ${dbPath}`);
  try {
    const db = new DatabaseSync(dbPath);
    const hasStores = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='stores'`).get();
    if (!hasStores) {
      console.log(`  No stores table.`);
      return;
    }
    const stores = db.prepare(`SELECT * FROM stores`).all();
    console.log(`  Stores:`, JSON.stringify(stores, null, 2));
  } catch (e) {
    console.log(`  Error: ${e.message}`);
  }
});
