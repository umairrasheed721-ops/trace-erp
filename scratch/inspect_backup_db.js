const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = path.resolve(__dirname, '../backend/backups/trace_erp_backup_default_2026-05-30T20-14-00-488Z.db');
console.log('Inspecting backup DB:', dbPath);
const db = new DatabaseSync(dbPath);

try {
  const count = db.prepare("SELECT count(*) as count FROM orders").get().count;
  console.log(`orders entries in backup DB: ${count}`);
} catch (err) {
  console.error('Error:', err.message);
} finally {
  db.close();
}
