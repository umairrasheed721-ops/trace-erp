const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const { db } = require('../../db');

const isProduction = process.env.NODE_ENV === 'production' || 
                     process.env.RAILWAY_ENVIRONMENT !== undefined ||
                     process.env.BOT_ENABLED === 'true';

const defaultDbPath = isProduction
  ? '/app/data/trace_erp.db'
  : path.join(__dirname, '..', '..', 'trace_erp.db');
const dbPath = process.env.DB_PATH || defaultDbPath;
const dbDir = path.dirname(path.resolve(dbPath));

const MAX_RECONNECT_DELAY_MS = 30000;

const SILENT_LOGGER = {
  level: 'silent',
  trace: () => {}, debug: () => {}, info: () => {},
  warn: () => {}, error: () => {}, fatal: () => {},
  child() { return SILENT_LOGGER; },
};

async function useDbAuthState(initAuthCreds, BufferJSON) {
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
    } catch (e) { console.error('[WA-DB] Write failed:', e.message); }
  }

  function deleteKey(key) {
    try { db.prepare('DELETE FROM wa_session_store WHERE key = ?').run(key); } catch (e) {}
  }

  let creds = readKey('creds');
  if (!creds) {
    creds = initAuthCreds();
    writeKey('creds', creds);
    console.log('[WA-DB] ✨ Fresh credentials created and stored in DB');
  } else {
    console.log('[WA-DB] ✅ Loaded existing session from DB — no QR scan needed');
  }

  const state = {
    creds,
    keys: {
      get(type, ids) {
        const data = {};
        for (const id of ids) {
          const val = readKey(`key:${type}:${id}`);
          if (val) data[id] = val;
        }
        return data;
      },
      set(data) {
        for (const category of Object.keys(data)) {
          for (const id of Object.keys(data[category])) {
            const value = data[category][id];
            if (value) writeKey(`key:${category}:${id}`, value);
            else deleteKey(`key:${category}:${id}`);
          }
        }
      }
    }
  };

  const saveCreds = () => {
    writeKey('creds', state.creds);
  };

  return { state, saveCreds };
}

function clearDbSession() {
  try {
    db.prepare('DELETE FROM wa_session_store').run();
    console.log('[WA-DB] ✅ Session cleared from DB');
  } catch (e) { console.error('[WA-DB] Clear failed:', e.message); }
}

function getSessionPath(bot) {
  const sessionDir = bot.tenantId === 'default'
    ? path.join(dbDir, 'wa_session')
    : path.join(dbDir, 'sessions', bot.tenantId);
  
  try {
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
      console.log(`📁 Created session directory for tenant [${bot.tenantId}]: ${sessionDir}`);
    }
  } catch (e) {
    console.error(`⚠️ Failed to create session directory ${sessionDir}:`, e.message);
  }
  return sessionDir;
}

function _scheduleReconnect(bot) {
  const delay = Math.min(3000 + bot.reconnectAttempts * 2000, MAX_RECONNECT_DELAY_MS);
  console.log(`🔄 Reconnecting in ${delay / 1000}s (attempt ${bot.reconnectAttempts + 1})...`);
  bot.reconnectAttempts++;
  setTimeout(() => {
    bot.isConnecting = false;
    connectBot(bot);
  }, delay);
}

async function connectBot(bot) {
  if (bot.isConnecting) return;
  if (bot._isLoggedOut) {
    console.log('📵 Session was logged out. Waiting for manual QR scan or resetSession().');
    return;
  }
  bot.isConnecting = true;

  console.log(`🚀 WhatsApp Bot connecting (attempt ${bot.reconnectAttempts + 1})...`);
  bot.status = 'CONNECTING';

  try {
    const {
      default: makeWASocket,
      initAuthCreds,
      BufferJSON,
      DisconnectReason,
      fetchLatestBaileysVersion,
    } = await import('@whiskeysockets/baileys');
    const { Boom } = await import('@hapi/boom');

    if (!bot.store) {
      bot.store = { messages: {} };
      const storePath = path.join(dbDir, 'wa_store.json');
      try { 
        if (fs.existsSync(storePath)) {
          const data = JSON.parse(fs.readFileSync(storePath, 'utf8'));
          if (data?.messages) bot.store.messages = data.messages;
        } 
      } catch (e) {}
      setInterval(() => {
        try {
          for (const jid in bot.store.messages) {
            if (bot.store.messages[jid].length > 35) {
              bot.store.messages[jid] = bot.store.messages[jid].slice(-35);
            }
          }
          fs.writeFileSync(storePath, JSON.stringify(bot.store), 'utf8');
        } catch (e) {
          console.error('[MEMORY_MANAGER] Auto-purge failed:', e.message);
        }
      }, 60000);
    }

    let authState;
    if (process.env.REDIS_URL) {
      const { useRedisAuthState } = require('../redis_auth');
      const redisAuth = await useRedisAuthState(bot.tenantId, initAuthCreds, BufferJSON, process.env.REDIS_URL);
      authState = { state: redisAuth.state, saveCreds: redisAuth.saveCreds };
      bot.wipeRedisSession = redisAuth.wipeSession;
    } else {
      authState = await useDbAuthState(initAuthCreds, BufferJSON);
    }
    const { state, saveCreds } = authState;

    let version;
    try {
      const result = await fetchLatestBaileysVersion();
      version = result.version;
      console.log(`📦 WA version: ${version.join('.')}`);
    } catch (_) {
      version = [2, 3000, 1023209842];
      console.warn('⚠️ Could not fetch latest WA version, using fallback');
    }

    bot.sock = makeWASocket({
      version,
      auth: state,
      logger: SILENT_LOGGER,
      printQRInTerminal: false,
      browser: ['TRACE ERP', 'Chrome', '120.0'],
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 10000,
      getMessage: async () => ({ conversation: '' }),
    });

    bot.sock.ev.on('creds.update', saveCreds);

    // Event routing hookups delegated to eventRouter
    const eventRouter = require('./eventRouter');

    bot.sock.ev.on('presence.update', (update) => {
      eventRouter.handlePresenceUpdate(bot, update);
    });

    bot.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('📸 QR Code ready — scan with WhatsApp');
        try {
          bot.qrCode = await qrcode.toDataURL(qr);
          bot.status = 'QR_READY';
        } catch (e) {
          console.error('QR generation error:', e.message);
        }
        return;
      }

      if (connection === 'open') {
        console.log('✅ WhatsApp CONNECTED!');
        bot.status = 'CONNECTED';
        bot.qrCode = null;
        bot.reconnectAttempts = 0;
        bot.isConnecting = false;

        try {
          const rawId = bot.sock?.user?.id || '';
          const digits = rawId.split(':')[0].split('@')[0];
          bot.activeNumber = digits ? `+${digits}` : null;
          if (bot.activeNumber) console.log(`📱 Active WA number: ${bot.activeNumber}`);
        } catch (_) {
          bot.activeNumber = null;
        }

        setTimeout(() => {
          bot.syncDeepHistory().catch(err => console.error('❌ Deep History Sync error:', err.message));
        }, 8000);

        return;
      }

      if (connection === 'close') {
        bot.isConnecting = false;
        const err = lastDisconnect?.error;
        const statusCode = err instanceof Boom ? err.output?.statusCode : 0;

        console.warn(`🔌 Connection closed. Code: ${statusCode}`);
        bot.status = 'DISCONNECTED';

        if (statusCode === DisconnectReason.loggedOut || statusCode === 401 || statusCode === 403) {
          console.log('📵 Logged out from phone — clearing session. Rescan QR to reconnect.');
          bot._isLoggedOut = true;
          _wipeCreds(bot);
          clearDbSession();
          bot.reconnectAttempts = 0;
        } else {
          _scheduleReconnect(bot);
        }
      }
    });

    bot.sock.ev.on('messaging-history.set', async (data) => {
      await eventRouter.handleMessagingHistorySet(bot, data);
    });

    try {
      bot.sock.ev.removeAllListeners('messages.update');
    } catch (e) {}
    bot.sock.ev.on('messages.update', async (updates) => {
      await eventRouter.handleMessagesUpdate(bot, updates);
    });

    bot.sock.ev.removeAllListeners('messages.upsert');
    bot.sock.ev.on('messages.upsert', (m) => {
      eventRouter.handleMessagesUpsert(bot, m);
    });

  } catch (err) {
    console.error('❌ connectBot() error:', err.message);
    bot.status = 'FAILURE';
    _scheduleReconnect(bot);
  }
}

async function _clearSessionStore(bot) {
  try {
    if (process.env.REDIS_URL && typeof bot.wipeRedisSession === 'function') {
      await bot.wipeRedisSession();
    }
  } catch (e) {
    console.error('⚠️ Redis session wipe failed:', e.message);
  }
  try {
    clearDbSession();
  } catch (e) {
    console.error('⚠️ DB session clear failed:', e.message);
  }
  try {
    const sessionPath = getSessionPath(bot);
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
      console.log(`✅ Session directory cleared for tenant [${bot.tenantId}]`);
    }
  } catch (e) {
    console.error('⚠️ File session clear failed:', e.message);
  }
}

async function _wipeCreds(bot) {
  await _clearSessionStore(bot);
}

async function resetSession(bot) {
  console.log(`🗑️ Manual session reset by admin for tenant [${bot.tenantId}]...`);
  bot.status = 'DISCONNECTED';
  bot.qrCode = null;
  bot.reconnectAttempts = 0;
  bot.isConnecting = false;
  bot._isLoggedOut = false;

  const oldSock = bot.sock;
  bot.sock = null;
  if (oldSock) {
    try { oldSock.ev.removeAllListeners('connection.update'); } catch (_) {}
    try { oldSock.ev.removeAllListeners('creds.update'); } catch (_) {}
    try { oldSock.ev.removeAllListeners('messages.upsert'); } catch (_) {}
    try { oldSock.logout(); } catch (_) {}
    try { oldSock.end(new Error('reset')); } catch (_) {}
    try { oldSock.ws?.close(); } catch (_) {}
  }

  await _clearSessionStore(bot);

  setTimeout(() => connectBot(bot), 2000);
  return true;
}

async function logoutSession(bot) {
  bot._isLoggedOut = true;
  bot.status = 'DISCONNECTED';
  bot.qrCode = null;
  bot.reconnectAttempts = 0;
  bot.isConnecting = false;

  const oldSock = bot.sock;
  bot.sock = null;
  if (oldSock) {
    try { oldSock.ev.removeAllListeners('connection.update'); } catch (_) {}
    try { oldSock.ev.removeAllListeners('creds.update'); } catch (_) {}
    try { oldSock.ev.removeAllListeners('messages.upsert'); } catch (_) {}
    try { await oldSock.logout(); } catch (_) {}
    try { oldSock.end(new Error('logout')); } catch (_) {}
    try { oldSock.ws?.close(); } catch (_) {}
  }

  await _clearSessionStore(bot);
  return true;
}

async function softReconnect(bot) {
  if (bot.isConnecting) return;
  console.log(`🔄 [Soft Reconnect] Re-initializing Baileys session for tenant: [${bot.tenantId}]`);

  const oldSock = bot.sock;
  bot.sock = null;
  if (oldSock) {
    try { oldSock.ev.removeAllListeners('connection.update'); } catch (_) {}
    try { oldSock.ev.removeAllListeners('creds.update'); } catch (_) {}
    try { oldSock.ev.removeAllListeners('messages.upsert'); } catch (_) {}
    try { oldSock.logout(); } catch (_) {}
    try { oldSock.end(new Error('soft_reconnect')); } catch (_) {}
    try { oldSock.ws?.close(); } catch (_) {}
  }

  bot.status = 'DISCONNECTED';
  bot.isConnecting = false;

  await connectBot(bot);
}

module.exports = {
  useDbAuthState,
  clearDbSession,
  getSessionPath,
  _scheduleReconnect,
  connectBot,
  _clearSessionStore,
  _wipeCreds,
  resetSession,
  logoutSession,
  softReconnect
};
