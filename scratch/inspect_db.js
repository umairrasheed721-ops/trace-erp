const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const dbPath = path.resolve(__dirname, '../backend/trace_erp.db');
const db = new DatabaseSync(dbPath);

try {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  for (const t of tables) {
    const count = db.prepare(`SELECT COUNT(*) as c FROM ${t.name}`).get().c;
    console.log(`Table: ${t.name} -> ${count} rows`);
  }
} catch(e) {
  console.error("error:", e.message);
}
