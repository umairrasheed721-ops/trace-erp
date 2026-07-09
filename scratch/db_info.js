const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = path.resolve(__dirname, '../backend/trace_erp.db');
console.log('Inspecting:', dbPath);
const db = new DatabaseSync(dbPath);

try {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('Tables in database:', tables);
  for (const t of tables) {
    const count = db.prepare(`SELECT count(*) as count FROM ${t.name}`).get().count;
    console.log(`Table: ${t.name}, Count: ${count}`);
  }
} catch (err) {
  console.error('Error:', err);
} finally {
  db.close();
}
