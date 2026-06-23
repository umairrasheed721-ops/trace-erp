const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const dbPath = path.join(__dirname, '..', 'backend', 'trace_erp.db');
const db = new DatabaseSync(dbPath);

console.log('--- TABLE INSPECTOR ---');
try {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  for (const row of tables) {
    const tableName = row.name;
    try {
      const count = db.prepare(`SELECT COUNT(*) as count FROM "${tableName}"`).get().count;
      console.log(`Table: ${tableName} | Rows: ${count}`);
    } catch (err) {
      console.log(`Table: ${tableName} | Error: ${err.message}`);
    }
  }
} catch (err) {
  console.log('Error listing tables:', err.message);
}
