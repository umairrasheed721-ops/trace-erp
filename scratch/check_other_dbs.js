const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');

const dbFiles = [
  '/Users/umairrasheed/Desktop/antigravity/trace-erp/backend/database.db',
  '/Users/umairrasheed/Desktop/antigravity/trace-erp/backend/database.sqlite',
  '/Users/umairrasheed/Desktop/antigravity/trace-erp/backend/data.db'
];

dbFiles.forEach(dbPath => {
  if (!fs.existsSync(dbPath)) return;
  console.log(`\n🔍 Checking: ${dbPath}`);
  try {
    const db = new DatabaseSync(dbPath);
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all();
    console.log('  Tables:', tables.map(t => t.name).join(', '));
    const count = db.prepare(`SELECT count(*) as total FROM orders`).get();
    console.log(`  Orders: ${count.total}`);
    if (count.total > 0) {
      const sample = db.prepare(`SELECT id, ref_number, line_items, product_titles FROM orders ORDER BY id DESC LIMIT 1`).get();
      console.log(`  Sample:`, JSON.stringify(sample));
    }
  } catch (e) {
    console.log(`  Error: ${e.message}`);
  }
});
