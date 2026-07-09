const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = path.resolve(__dirname, '../backend/trace_erp.db');
const db = new DatabaseSync(dbPath);

try {
  const stores = db.prepare("SELECT * FROM stores").all();
  console.log('Stores:', stores);
} catch (err) {
  console.error('Error:', err);
} finally {
  db.close();
}
