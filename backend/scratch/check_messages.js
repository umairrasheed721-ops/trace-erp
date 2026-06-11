const { db } = require('../db');
try {
  const messages = db.prepare('SELECT id, phone, direction, message, status, created_at FROM whatsapp_messages ORDER BY id DESC LIMIT 15').all();
  console.log(JSON.stringify(messages, null, 2));
} catch (e) {
  console.error(e);
}
