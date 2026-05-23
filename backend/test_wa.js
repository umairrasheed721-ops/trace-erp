const { db } = require('./db');
const fs = require('fs');

async function test() {
  const { default: makeWASocket, useMultiFileAuthState, initAuthCreds, BufferJSON } = await import('@whiskeysockets/baileys');
  console.log('Baileys imported');
  
  function readKey(key) {
    try {
      const row = db.prepare('SELECT value FROM wa_session_store WHERE key = ?').get(key);
      return row ? JSON.parse(row.value, BufferJSON.reviver) : null;
    } catch (e) { return null; }
  }

  function writeKey(key, value) {
    try {
      db.prepare(`
        INSERT INTO wa_session_store (key, value, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `).run(key, JSON.stringify(value, BufferJSON.replacer));
    } catch (e) { console.error(e); }
  }

  let creds = readKey('creds');
  if (!creds) {
    creds = initAuthCreds();
    writeKey('creds', creds);
    console.log('created new');
  } else {
    console.log('loaded existing');
  }
}
test().catch(console.error);
