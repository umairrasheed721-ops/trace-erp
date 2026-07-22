const { db } = require('../backend/db');

try {
  console.log('--- RECENT SYSTEM LOGS ---');
  const logs = db.prepare("SELECT * FROM system_logs ORDER BY id DESC LIMIT 15").all();
  console.log(JSON.stringify(logs, null, 2));

  console.log('--- RECENT DRAFT SESSIONS ---');
  try {
    const sessions = db.prepare("SELECT * FROM whatsapp_draft_sessions ORDER BY id DESC LIMIT 5").all();
    console.log(JSON.stringify(sessions, null, 2));
  } catch (e) {
    console.log('No draft sessions table or error:', e.message);
  }
} catch (err) {
  console.error(err);
}
