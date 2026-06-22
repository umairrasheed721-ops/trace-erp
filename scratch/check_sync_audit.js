const { DatabaseSync } = require('node:sqlite');
const dbPath = '/Users/umairrasheed/Desktop/antigravity/trace-erp/backend/trace_erp.db';
const db = new DatabaseSync(dbPath);

console.log('--- RECENT SYNC AUDIT LOGS ---');
try {
  const logs = db.prepare('SELECT * FROM sync_audit ORDER BY id DESC LIMIT 20').all();
  console.log(JSON.stringify(logs, null, 2));
} catch (e) {
  console.error(e);
}

console.log('--- DISTINCT MESSAGE PATTERNS ---');
try {
  const patterns = db.prepare('SELECT message, count(*) as count FROM sync_audit GROUP BY message ORDER BY count DESC LIMIT 20').all();
  console.log(JSON.stringify(patterns, null, 2));
} catch (e) {
  console.error(e);
}
