const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const dbPath = path.join(__dirname, 'backend', 'trace_erp.db');
const db = new DatabaseSync(dbPath);

console.log('--- SYSTEM LOGS IN LAST 10 MINUTES ---');
try {
  const logs = db.prepare("SELECT * FROM system_logs WHERE created_at > datetime('now', '-10 minutes') ORDER BY id DESC").all();
  logs.forEach(l => {
    console.log(`[${l.created_at}] [${l.level}] [${l.module}] ${l.message}`);
  });
} catch (e) {
  console.error(e.message);
}

console.log('--- WHATSAPP MESSAGES IN LAST 10 MINUTES ---');
try {
  const msgs = db.prepare("SELECT * FROM whatsapp_messages WHERE created_at > datetime('now', '-10 minutes') ORDER BY id DESC LIMIT 10").all();
  msgs.forEach(m => {
    console.log(`[${m.created_at}] [${m.direction}] [${m.status}] to/from ${m.phone}: ${m.message}`);
  });
} catch (e) {
  console.error(e.message);
}
