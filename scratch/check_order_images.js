const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');

const dbPath = '/Users/umairrasheed/Desktop/antigravity/trace-erp/trace_erp.db';
if (fs.existsSync(dbPath)) {
  console.log(`\n🔍 Checking: ${dbPath}`);
  try {
    const db = new DatabaseSync(dbPath);
    const count = db.prepare(`SELECT count(*) as total FROM orders`).get();
    console.log(`  Total Orders: ${count.total}`);
    if (count.total > 0) {
      const sample = db.prepare(`SELECT id, ref_number, line_items, product_titles FROM orders ORDER BY id DESC LIMIT 1`).get();
      console.log(`  Sample Order:`, JSON.stringify(sample));
    }
  } catch (e) {
    console.log(`  Error: ${e.message}`);
  }
} else {
  console.log('Root DB does not exist');
}
