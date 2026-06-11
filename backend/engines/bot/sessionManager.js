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

function cleanJid(jid) {
  if (!jid) return jid;
  const [user, domain] = jid.split('@');
  const cleanUser = user.split(':')[0];
  return `${cleanUser}@${domain || 's.whatsapp.net'}`;
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
      getMessage: async (key) => {
        try {
          // 1. Try RAM first
          if (bot.store && bot.store.messages) {
            const cleanRemoteJid = cleanJid(key.remoteJid);
            const list = bot.store.messages[cleanRemoteJid];
            if (list) {
              const msg = list.find(m => m.key?.id === key.id);
              if (msg && msg.message) {
                console.log('🗳️ [PollNative] getMessage hit in RAM for poll:', key.id);
                return msg.message;
              }
            }
          }

          // 2. Fallback to SQLite DB Vault
          let dbRow = null;
          const tenantContext = require('../../tenant-context');
          const { db: tenantDb } = require('../../db');
          tenantContext.run(bot.tenantId || 'default', () => {
            try {
              dbRow = tenantDb.prepare(
                `SELECT full_message_json FROM whatsapp_polls WHERE message_id = ?`
              ).get(key.id);
            } catch (err) {
              console.error('⚠️ [PollNative] Failed to lookup poll in DB getMessage fallback:', err.message);
            }
          });

          if (dbRow && dbRow.full_message_json) {
            console.log('🗳️ [PollNative] getMessage hit in DB Vault for poll:', key.id);
            return JSON.parse(dbRow.full_message_json);
          }
          return undefined;
        } catch (err) {
          console.error('⚠️ [PollNative] Error in getMessage hook:', err.message);
          return undefined;
        }
      },
    });

    bot.sock.ev.on('creds.update', saveCreds);

    // Event routing hookups delegated to eventRouter
    const eventRouter = require('./eventRouter');

    bot.sock.ev.on('presence.update', (update) => {
      eventRouter.handlePresenceUpdate(bot, update);
    });

    bot.sock.ev.on('connection.update', async (update) => {
      // Guard against old/zombie socket instances executing connection events
      if (bot.sock !== sock) {
        console.log('🗳️ [PollNative] Guard: Ignoring connection update from old socket instance.');
        return;
      }

      try {
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

        // ── CONNECTION CLOSE HANDLER ──
        // WhatsApp WebSocket can drop for two fundamentally different reasons:
        //
        // 1. DELIBERATE LOGOUT (401, 403, DisconnectReason.loggedOut):
        //    The phone removed this device from linked devices, or the session expired.
        //    → We MUST clear credentials and wait for a new QR scan. Auto-reconnect
        //      would loop forever with a dead session.
        //
        // 2. TRANSIENT NETWORK DROP (all other codes, including statusCode=0):
        //    Railway container networking blip, WhatsApp server maintenance (503),
        //    timeout (408), or a pure TCP drop with no HTTP status at all (code=0).
        //    → We SHOULD auto-reconnect after a short backoff delay.
        //
        // _scheduleReconnect uses exponential backoff: 3s, 5s, 7s... capped at 30s.
        if (connection === 'close') {
          const wasConnecting = bot.isConnecting;
          bot.isConnecting = false;
          const err = lastDisconnect?.error;
          // Boom is the HTTP error library Baileys uses — if err is not a Boom instance
          // (e.g. raw TCP error), statusCode will be 0 which falls into the reconnect branch
          const statusCode = err instanceof Boom ? err.output?.statusCode : 0;

          const errorStr = String(err || '');
          const isBadMac = err && (errorStr.includes('Bad MAC') || errorStr.includes('bad mac') || err.message?.includes('Bad MAC') || err.message?.includes('bad mac') || err.stack?.includes('Bad MAC') || err.stack?.includes('bad mac'));
          const is440 = statusCode === 440;

          if (isBadMac || is440) {
            // Strict Connection State Guard: Do NOT wipe the database if the connection is currently trying to establish or if connection === 'open'
            if (bot.status === 'CONNECTED' || connection === 'open') {
              console.log(`🗳️ [PollNative] Guard: Connection is open/connected (status=${bot.status}, connection=${connection}), ignoring transient session wipe.`);
            } else {
              console.warn(`🚨 [Session Reset] Detected Bad MAC or 440 Disconnect! Wiping DB session store to prevent loops. (isBadMac=${isBadMac}, is440=${is440})`);
              clearDbSession();
              bot._isLoggedOut = false;
              bot.reconnectAttempts = 0;
              await _wipeCreds(bot).catch(e => console.error('⚠️ Failed to wipe creds:', e.message));
              setTimeout(() => {
                if (bot.sock === sock) {
                  connectBot(bot).catch(e => console.error('⚠️ Failed to reconnect bot:', e.message));
                }
              }, 1000);
              return;
            }
          }

          // Log the specific code so Railway logs are easy to diagnose
          if (statusCode === 503) {
            console.warn(`🔌 [Reconnect] WhatsApp service unavailable (503) — scheduling reconnect.`);
          } else if (statusCode === 408) {
            console.warn(`🔌 [Reconnect] Connection timeout (408) — scheduling reconnect.`);
          } else if (statusCode === 500) {
            console.warn(`🔌 [Reconnect] Server error (500) — scheduling reconnect.`);
          } else if (statusCode === 400) {
            console.warn(`🔌 [Reconnect] Bad request (400) — scheduling reconnect.`);
          } else if (!statusCode) {
            console.warn(`🔌 [Reconnect] Pure TCP/WebSocket drop (no status code) — scheduling reconnect.`);
          } else {
            console.warn(`🔌 Connection closed. Code: ${statusCode}`);
          }
          bot.status = 'DISCONNECTED';

          // Named constant for clarity — any future dev can see exactly what "deliberate logout" means
          const isDeliberateLogout =
            statusCode === DisconnectReason.loggedOut ||
            statusCode === 401 ||
            statusCode === 403;

          if (isDeliberateLogout) {
            console.log('📵 Logged out from phone — clearing session. Rescan QR to reconnect.');
            bot._isLoggedOut = true;
            await _wipeCreds(bot).catch(e => console.error('⚠️ Failed to wipe creds:', e.message));
            clearDbSession();
            bot.reconnectAttempts = 0;
          } else {
            // All other disconnect reasons (including statusCode=0 pure drops) → reconnect
            _scheduleReconnect(bot);
          }
        }
      } catch (handlerErr) {
        console.error('⚠️ [PollNative] Error in connection.update handler:', handlerErr.message);
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
