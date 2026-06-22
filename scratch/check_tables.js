const { DatabaseSync } = require('node:sqlite');
const dbPath = '/Users/umairrasheed/Desktop/antigravity/trace-erp/backend/trace_erp.db';
const db = new DatabaseSync(dbPath);

const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all();
console.log('Tables in trace_erp.db:');
for (const t of tables) {
  try {
    const count = db.prepare(`SELECT count(*) as count FROM "${t.name}"`).get().count;
    console.log(`  - ${t.name}: ${count} rows`);
  } catch (e) {
    console.log(`  - ${t.name}: Error (${e.message})`);
  }
}
