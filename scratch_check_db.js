const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'backend', 'database.sqlite');
console.log('Opening database at:', dbPath);
try {
  const db = new Database(dbPath, { fileMustExist: true });
  const rows = db.prepare('SELECT * FROM whatsapp_messages ORDER BY id DESC LIMIT 15').all();
  console.log('Recent messages:');
  console.log(JSON.stringify(rows, null, 2));
} catch (e) {
  console.error('Error:', e.message);
}
