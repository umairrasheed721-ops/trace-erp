/**
 * WhatsApp Bot Engine — Powered by Baileys (WebSocket, no Chrome required)
 * Uses dynamic import() because Baileys is ESM-only.
 */

const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const { db, DB_DIR } = require('../db');
const { transcodeToOpus, safeUnlink, TAG: FFMPEG_TAG } = require('./ffmpeg_transcode');

const isProduction = process.env.NODE_ENV === 'production' || 
                     process.env.RAILWAY_ENVIRONMENT !== undefined ||
                     process.env.BOT_ENABLED === 'true';

const defaultDbPath = isProduction
  ? '/app/data/trace_erp.db'
  : path.join(__dirname, '..', 'trace_erp.db');
const dbPath = process.env.DB_PATH || defaultDbPath;
const dbDir = path.dirname(path.resolve(dbPath));
const tenantContext = require('../tenant-context');

const {
  normalizePhone,
  getPhoneFromJid,
  getMessageMediaDetails,
  getMessageText,
  saveMediaFile,
  processQueue,
  processIncomingMessage,
  adaptiveStrategy
} = require('./whatsapp_message_processor');

// No hard limit on reconnects — we retry forever with backoff.
// Only a manual resetSession() or WhatsApp loggedOut (401) clears the session.
const MAX_RECONNECT_DELAY_MS = 30000; // cap backoff at 30s

/**
 * DB-backed auth state — stores Baileys creds in SQLite wa_session_store.
 * This survives Railway container restarts and redeployments.
 * Falls back to file system only if DB is unavailable.
 */
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

// Silence Baileys logger
const SILENT_LOGGER = {
  level: 'silent',
  trace: () => {}, debug: () => {}, info: () => {},
  warn: () => {}, error: () => {}, fatal: () => {},
  child() { return SILENT_LOGGER; },
};

class WhatsAppBot {
  constructor(tenantId) {
    this.tenantId = tenantId || 'default';
    this.sock = null;
    this.qrCode = null;
    this.status = 'DISCONNECTED';
    this.reconnectAttempts = 0;
    this.isConnecting = false;
    this._isLoggedOut = false; // set true only on 401 loggedOut
    
    // --- 🛡️ ANTI-BAN THROTTLING SYSTEM ---
    this.queue = [];
    this.isProcessing = false;
    this.hourlyCount = 0;
    this.lastResetTime = Date.now();
    this.humanCooldowns = {}; // { phone: timestamp }
    
    // --- 🛡️ MODULE 6: ANTI-BAN SHIELD PROPERTIES ---
    this.sentCountInSession = 0;
    this.sleepThreshold = 30; // Rotate / Rest after 30 messages
    this.isSleeping = false;
    this.sleepUntil = null;
    this.consecutiveBulkSentCount = 0;
    this.contactMessageTimestamps = {}; // maps phone number to arrays of timestamps
    this.contactLastIncomingTimestamp = {}; // maps phone number to timestamp of last incoming msg

    // Dynamic governance parameters
    this.isPaused = false;
    this.minDelaySec = 5;
    this.maxDelaySec = 15;
    this.maxPerHour = 60;
    this.coolingPeriodMin = 15;
    this.auditLogs = []; // Buffer of recent delivery audits

    // --- 🤖 MODULE 5: AUTO-RESPONSE STUDIO ---
    this.humanHandoffContacts = new Set(); // phones currently in human-intervention mode
    this.consecutiveBotReplies = {};       // phone -> count of consecutive bot replies without a human reply

    // --- ⚡ FIX: HIGH-PRIORITY QUEUE (active chat sessions jump the bulk queue) ---
    this.priorityQueue = [];   // Messages from live agent sessions or active incoming chats
    this.activeChats = new Set(); // phones with recent incoming activity (within 5 min)

    // --- 🔒 STABILITY FIX: Global dedup lock + per-phone concurrency guard ---
    // sentMessages: Map<phone, lastTimestamp> — blocks identical auto-replies within 5s
    this.sentMessages = new Map();
    // processingReplies: Set<phone> — prevents concurrent auto-reply execution for same phone
    this.processingReplies = new Set();

    // Prevent local dev from running the bot unless explicitly enabled
    if (!isProduction) {
      console.log('🛑 WhatsApp Bot disabled in local dev to prevent message stealing. Set BOT_ENABLED=true to force.');
      this.status = 'DISABLED';
      return;
    }

    setTimeout(() => this._connect(), 5000);
  }

  getSessionPath() {
    const sessionDir = this.tenantId === 'default'
      ? path.join(dbDir, 'wa_session')
      : path.join(dbDir, 'sessions', this.tenantId);
    
    try {
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
        console.log(`📁 Created session directory for tenant [${this.tenantId}]: ${sessionDir}`);
      }
    } catch (e) {
      console.error(`⚠️ Failed to create session directory ${sessionDir}:`, e.message);
    }
    return sessionDir;
  }

  _scheduleReconnect() {
    const delay = Math.min(3000 + this.reconnectAttempts * 2000, MAX_RECONNECT_DELAY_MS);
    console.log(`🔄 Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts + 1})...`);
    this.reconnectAttempts++;
    setTimeout(() => {
      this.isConnecting = false;
      this._connect();
    }, delay);
  }

  async _connect() {
    if (this.isConnecting) return;
    if (this._isLoggedOut) {
      console.log('📵 Session was logged out. Waiting for manual QR scan or resetSession().');
      return;
    }
    this.isConnecting = true;

    console.log(`🚀 WhatsApp Bot connecting (attempt ${this.reconnectAttempts + 1})...`);
    this.status = 'CONNECTING';

    try {
      const {
        default: makeWASocket,
        useMultiFileAuthState,
        initAuthCreds,
        BufferJSON,
        DisconnectReason,
        fetchLatestBaileysVersion,
      } = await import('@whiskeysockets/baileys');
      const { Boom } = await import('@hapi/boom');

      if (!this.store) {
        this.store = { messages: {} };
        const storePath = path.join(dbDir, 'wa_store.json');
        try { 
          if (fs.existsSync(storePath)) {
            const data = JSON.parse(fs.readFileSync(storePath, 'utf8'));
            if (data?.messages) this.store.messages = data.messages;
          } 
        } catch (e) {}
        setInterval(() => {
          try {
            // 1. AUTO-PURGE: Prevent RAM explosion by keeping only the latest 35 messages per chat
            for (const jid in this.store.messages) {
              if (this.store.messages[jid].length > 35) {
                this.store.messages[jid] = this.store.messages[jid].slice(-35);
              }
            }
            // 2. I/O OPTIMIZATION: Write to disk every 60 seconds (instead of 10s) to free up the Event Loop
            fs.writeFileSync(storePath, JSON.stringify(this.store), 'utf8');
          } catch (e) {
            console.error('[MEMORY_MANAGER] Auto-purge failed:', e.message);
          }
        }, 60000);
      }

      let authState;
      if (process.env.REDIS_URL) {
        const { useRedisAuthState } = require('./redis_auth');
        const redisAuth = await useRedisAuthState(this.tenantId, initAuthCreds, BufferJSON, process.env.REDIS_URL);
        authState = { state: redisAuth.state, saveCreds: redisAuth.saveCreds };
        this.wipeRedisSession = redisAuth.wipeSession;
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

      this.sock = makeWASocket({
        version,
        auth: state,
        logger: SILENT_LOGGER,
        printQRInTerminal: false,
        browser: ['TRACE ERP', 'Chrome', '120.0'],
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        getMessage: async () => ({ conversation: '' }),
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('presence.update', (update) => {
        const { id, presences } = update;
        if (!presences) return;
        for (const key of Object.keys(presences)) {
          const presence = presences[key];
          const cleanJid = key.split('@')[0];
          let phone = cleanJid;
          if (key.endsWith('@lid')) {
            try {
              const { db } = require('../db');
              const row = db.prepare('SELECT phone FROM wa_lid_mappings WHERE lid = ?').get(cleanJid);
              if (row) phone = row.phone;
            } catch (e) {}
          }
          const isTyping = presence.lastKnownPresence === 'composing' || presence.lastKnownPresence === 'recording';
          
          try {
            const { broadcast } = require('../websocket');
            broadcast('typing', { phone, isTyping });
          } catch (e) {}
        }
      });

      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          console.log('📸 QR Code ready — scan with WhatsApp');
          try {
            this.qrCode = await qrcode.toDataURL(qr);
            this.status = 'QR_READY';
          } catch (e) {
            console.error('QR generation error:', e.message);
          }
          return;
        }

        if (connection === 'open') {
          console.log('✅ WhatsApp CONNECTED!');
          this.status = 'CONNECTED';
          this.qrCode = null;
          this.reconnectAttempts = 0;
          this.isConnecting = false;

          try {
            const rawId = this.sock?.user?.id || '';
            const digits = rawId.split(':')[0].split('@')[0];
            this.activeNumber = digits ? `+${digits}` : null;
            if (this.activeNumber) console.log(`📱 Active WA number: ${this.activeNumber}`);
          } catch (_) {
            this.activeNumber = null;
          }

          setTimeout(() => {
            this.syncDeepHistory().catch(err => console.error('❌ Deep History Sync error:', err.message));
          }, 8000);

          return;
        }

        if (connection === 'close') {
          this.isConnecting = false;
          const err = lastDisconnect?.error;
          const statusCode = err instanceof Boom ? err.output?.statusCode : 0;

          console.warn(`🔌 Connection closed. Code: ${statusCode}`);
          this.status = 'DISCONNECTED';

          if (statusCode === DisconnectReason.loggedOut || statusCode === 401 || statusCode === 403) {
            console.log('📵 Logged out from phone — clearing session. Rescan QR to reconnect.');
            this._isLoggedOut = true;
            this._wipeCreds();
            clearDbSession();
            this.reconnectAttempts = 0;
          } else {
            this._scheduleReconnect();
          }
        }
      });

      this.sock.ev.on('messaging-history.set', async ({ chats, messages, isLatest }) => {
        console.log(`📦 WhatsApp History Sync received: ${chats?.length || 0} chats, ${messages?.length || 0} messages`);
        if (messages) {
          const { db } = require('../db');
          const cutoffTimestamp = (Date.now() / 1000) - (14 * 24 * 60 * 60); // 14 days ago
          
          for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            try {
              if (i % 500 === 0) await new Promise(r => setTimeout(r, 10));

              if (!msg.message) continue;
              const msgTimestamp = Number(msg.messageTimestamp);
              if (msgTimestamp && msgTimestamp < cutoffTimestamp) continue;

              const remoteJid = msg.key?.remoteJid;
              if (!remoteJid || remoteJid.includes('@g.us')) continue;
              
              if (!this.store.messages[remoteJid]) this.store.messages[remoteJid] = [];
              this.store.messages[remoteJid].push(msg);

              const fromPhone = getPhoneFromJid(msg, db);
              const text = getMessageText(msg);
              const mediaDetails = getMessageMediaDetails(msg);
              if (!text && !mediaDetails) continue;

              const isOutgoing = msg.key.fromMe;
              let mediaType = mediaDetails ? mediaDetails.type : null;
              const finalMessage = text || (mediaType ? `[${mediaType.toUpperCase()}]` : '');

              const order = db.prepare(`SELECT id, store_id FROM orders WHERE phone LIKE ? ORDER BY id DESC LIMIT 1`).get(`%${fromPhone.substring(Math.max(0, fromPhone.length - 10))}%`);
              if (order) {
                db.prepare(`
                  INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message, message_id, media_url, media_type, status)
                  VALUES (?, ?, ?, ?, ?, ?, null, ?, 'sent')
                  ON CONFLICT(message_id) DO NOTHING
                `).run(order.store_id, order.id, fromPhone, isOutgoing ? 'outgoing' : 'incoming', finalMessage, msg.key.id, mediaType);
              }
            } catch (err) {
              // Ignore individual errors
            }
          }
          console.log(`✅ WhatsApp History Sync processed successfully.`);
        }
      });

      try {
        this.sock.ev.removeAllListeners('messages.update');
      } catch (e) {}
      this.sock.ev.on('messages.update', async (updates) => {
        const { db } = require('../db');
        for (const { key, update } of updates) {
          const messageId = key.id;
          const statusVal = update.status;
          
          if (messageId && statusVal >= 2) {
            let statusStr = 'delivered';
            if (statusVal === 2) statusStr = 'sent';
            else if (statusVal === 3) statusStr = 'delivered';
            else if (statusVal >= 4) statusStr = 'read';

            try {
              db.prepare("UPDATE whatsapp_messages SET status = ? WHERE message_id = ?").run(statusStr, messageId);
            } catch (e) {}

            try {
              const { broadcast } = require('../websocket');
              broadcast('messages.update', { id: messageId, status: statusStr });
            } catch (e) {}
            
            const pendingAckDir = path.resolve(__dirname, '..', 'pending_ack');
            if (fs.existsSync(pendingAckDir)) {
              try {
                const files = fs.readdirSync(pendingAckDir);
                for (const file of files) {
                  if (file.startsWith(messageId)) {
                    const filePath = path.join(pendingAckDir, file);
                    if (fs.existsSync(filePath)) {
                      fs.unlinkSync(filePath);
                      console.log(`🗑️ [PENDING_ACK] Unlinked file upon delivery confirmation: ${filePath}`);
                    }
                  }
                }
              } catch (err) {
                console.error(`⚠️ Failed to cleanup pending_ack file for message ${messageId}:`, err.message);
              }
            }
          }

          if (update.pollUpdates && key.remoteJid && !key.remoteJid.includes('@g.us')) {
            try {
              const remoteJid = key.remoteJid;
              const fromPhone = remoteJid.split('@')[0];
              
              const pollMsg = this.store.messages[remoteJid]?.find(m => m.key.id === key.id);
              if (pollMsg && pollMsg.message) {
                const { getAggregateVotesInPollMessage } = await import('@whiskeysockets/baileys');
                const votes = getAggregateVotesInPollMessage({
                  message: pollMsg.message,
                  pollUpdates: update.pollUpdates,
                });
                
                let selectedOption = null;
                for (const option of votes) {
                  if (option.voters && option.voters.includes(remoteJid)) {
                    selectedOption = option.name;
                    break;
                  }
                }
                
                if (selectedOption) {
                  console.log(`🗳️ [POLL_VOTE] Customer +${fromPhone} voted: "${selectedOption}" in poll: ${key.id}`);
                  const cleanPhone = fromPhone.replace(/\D/g, '');
                  
                  const pendingCOD = db.prepare(
                    `SELECT * FROM cod_pending_verifications WHERE phone = ? AND status = 'pending'
                     AND expires_at > datetime('now', '+5 hours') ORDER BY id DESC LIMIT 1`
                  ).get(cleanPhone);
                  
                  if (pendingCOD) {
                    const isConfirm = selectedOption.toLowerCase().includes('confirm') || selectedOption.includes('✅');
                    const isCancel = selectedOption.toLowerCase().includes('cancel') || selectedOption.includes('❌');
                    
                    if (isConfirm || isCancel) {
                      const newStatus = isConfirm ? 'confirmed' : 'cancelled';
                      db.prepare(`UPDATE cod_pending_verifications SET status = ?, replied_at = datetime('now', '+5 hours') WHERE id = ?`).run(newStatus, pendingCOD.id);
                      
                      try {
                        const order = db.prepare('SELECT store_id FROM orders WHERE id = ?').get(pendingCOD.order_id);
                        const storeId = order ? order.store_id : 1;
                        db.prepare(`
                          INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message)
                          VALUES (?, ?, ?, 'incoming', ?)
                        `).run(storeId, pendingCOD.order_id, cleanPhone, `🗳️ Selected: ${selectedOption}`);
                        
                        const { broadcast } = require('../websocket');
                        broadcast('message', {
                          order_id: pendingCOD.order_id,
                          message: {
                            store_id: storeId,
                            order_id: pendingCOD.order_id,
                            phone: cleanPhone,
                            direction: 'incoming',
                            message: `🗳️ Selected: ${selectedOption}`,
                            created_at: new Date().toISOString()
                          }
                        });
                      } catch (e) {}

                      if (isConfirm) {
                        db.prepare(`UPDATE orders SET wa_verification_status = 'verified', payment_status = 'COD Confirmed', delivery_status = 'confirmed' WHERE id = ?`).run(pendingCOD.order_id);
                        const order = db.prepare('SELECT store_id, shopify_order_id FROM orders WHERE id = ?').get(pendingCOD.order_id);
                        if (order) {
                          const { broadcast } = require('../sse');
                          broadcast('order_updated', { storeId: order.store_id, shopifyOrderId: order.shopify_order_id });
                        }
                        await this.sendMessage(fromPhone, `✅ *Shukriya!* Aapka COD order *confirm* ho gaya hai. Insha'Allah 2-3 working days mein deliver ho jayega. 📦`, true);
                        console.log(`🗳️ [POLL] COD Confirmed: Order ${pendingCOD.order_id} by customer +${fromPhone}`);
                      } else {
                        db.prepare(`UPDATE orders SET payment_status = 'COD Cancelled' WHERE id = ?`).run(pendingCOD.order_id);
                        const order = db.prepare('SELECT store_id, shopify_order_id FROM orders WHERE id = ?').get(pendingCOD.order_id);
                        if (order) {
                          const { broadcast } = require('../sse');
                          broadcast('order_updated', { storeId: order.store_id, shopifyOrderId: order.shopify_order_id });
                        }
                        await this.sendMessage(fromPhone, `❌ Aapka order cancel note kar liya gaya hai. Agar dobara order karna chahein toh hamari website visit karein. JazakAllah! 🙏`, true);
                        console.log(`🗳️ [POLL] COD Cancelled: Order ${pendingCOD.order_id} by customer +${fromPhone}`);
                      }
                    }
                  }
                }
              }
            } catch (pollErr) {
              console.error('⚠️ Poll vote handling failed:', pollErr.message);
            }
          }
        }
      });

      this.sock.ev.removeAllListeners('messages.upsert');

      this.sock.ev.on('messages.upsert', async (m) => {
        const { messages, type } = m;
        if (type !== 'notify' && type !== 'append') return;
        for (const msg of messages) {
          try {
            const port = process.env.PORT || 3001;
            const url = `http://localhost:${port}/api/webhooks/whatsapp/portal-hook?tenant_id=${encodeURIComponent(this.tenantId)}`;
            const response = await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Tenant-Id': this.tenantId,
                'auth': 'tracepk'
              },
              body: JSON.stringify({ msg })
            });
            if (!response.ok) {
              const errText = await response.text();
              console.error(`[Portal Hook Router] API call failed: status=${response.status}, body=${errText}`);
              await processIncomingMessage(this, msg, this.sock, db);
            }
          } catch (err) {
            console.error(`[Portal Hook Router] Failed to route via API, falling back to local:`, err.message);
            await processIncomingMessage(this, msg, this.sock, db);
          }
        }
      });

    } catch (err) {
      console.error('❌ _connect() error:', err.message);
      this.status = 'FAILURE';
      this._scheduleReconnect();
    }
  }

  async _clearSessionStore() {
    try {
      if (process.env.REDIS_URL && typeof this.wipeRedisSession === 'function') {
        await this.wipeRedisSession();
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
      const sessionPath = this.getSessionPath();
      if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        console.log(`✅ Session directory cleared for tenant [${this.tenantId}]`);
      }
    } catch (e) {
      console.error('⚠️ File session clear failed:', e.message);
    }
  }

  async _wipeCreds() {
    await this._clearSessionStore();
  }

  variateTemplateMessage(text) {
    if (!text || typeof text !== 'string') return text;
    let modified = text;

    const greetings = [
      { pattern: /^(👋\s*)?hello\b/i, replacements: ['Salam', 'Hi', 'Hello', 'Hi there', '👋 Salam', '👋 Hello', '👋 Hi'] },
      { pattern: /^(👋\s*)?hi\b/i, replacements: ['Salam', 'Hi', 'Hello', 'Hi there', '👋 Salam', '👋 Hello', '👋 Hi'] },
      { pattern: /^(👋\s*)?salam\b/i, replacements: ['Salam', 'Hi', 'Hello', 'Hi there', '👋 Salam', '👋 Hello', '👋 Hi'] }
    ];

    for (const g of greetings) {
      if (g.pattern.test(modified)) {
        const randomGreeting = g.replacements[Math.floor(Math.random() * g.replacements.length)];
        modified = modified.replace(g.pattern, randomGreeting);
        break;
      }
    }

    const emojis = ['😊', '👍', '📦', '🙏', '✨', ''];
    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
    if (randomEmoji) {
      if (modified.endsWith('.')) {
        modified = modified.slice(0, -1) + ' ' + randomEmoji;
      } else {
        modified = modified + ' ' + randomEmoji;
      }
    }

    const randomSuffix = Math.random() > 0.5 ? '\u200B' : ' ';
    modified = modified + randomSuffix;

    return modified;
  }

  async ensureConnected() {
    if (this.status === 'CONNECTED' && this.sock) {
      return;
    }
    console.log(`[TRACER_LOG] Connection not active (status: ${this.status}). Waiting for connection...`);
    
    const start = Date.now();
    while (Date.now() - start < 10000) {
      if (this.status === 'CONNECTED' && this.sock) {
        console.log(`[TRACER_LOG] Connection restored dynamically after ${Date.now() - start}ms.`);
        return;
      }
      await new Promise(r => setTimeout(r, 200));
    }
    
    throw new Error(`WhatsApp is not connected (current status: ${this.status})`);
  }

  async directSendMessage(phone, message, isManual = false, mediaUrl = null, mediaType = null, fileName = null, customMessageId = null, quoteContext = null, buttons = null, buttonsMode = 'native', poll = null, options = {}) {
    await this.ensureConnected();

    const cleaned = normalizePhone(phone);
    const jid = cleaned + '@s.whatsapp.net';
    const uuid = customMessageId || require('crypto').randomUUID();

    const { db } = require('../db');
    const adapted = adaptiveStrategy(phone, {
      message, quoteContext, buttons, buttonsMode, poll
    }, db, isManual);

    let finalMessage = adapted.message;
    quoteContext = adapted.quoteContext;
    buttons = adapted.buttons;
    buttonsMode = adapted.buttonsMode;
    poll = adapted.poll;

    if (isManual) {
      console.log(`⚡ [DIRECT_SEND] Manual agent message to ${cleaned}. Refreshing 15-minute handoff lock.`);
      const until = Date.now() + 15 * 60 * 1000;
      try {
        db.prepare(`
          INSERT INTO customer_profiles (phone, human_handoff_until, updated_at)
          VALUES (?, ?, datetime('now'))
          ON CONFLICT(phone) DO UPDATE SET human_handoff_until = ?, updated_at = datetime('now')
        `).run(cleaned, String(until), String(until));
        console.log(`🧑 [HANDOFF_LOCK] Refreshed 15-minute handoff lock in DB for ${cleaned}`);
      } catch (e) {
        console.error('⚠️ Failed to refresh human handoff lock in DB:', e.message);
      }
    }

    if (!isManual && finalMessage && !adapted.hasComplained) {
      finalMessage = this.variateTemplateMessage(finalMessage);
    }

    let payload;
    let finalMediaType = mediaType;
    if (mediaUrl && !finalMediaType) {
      finalMediaType = 'image';
    }

    const hasButtons = buttons && Array.isArray(buttons) && buttons.length > 0;

    try {
      if (poll) {
        payload = {
          poll: {
            name: poll.name,
            values: poll.values,
            selectableCount: poll.selectableCount || 1
          }
        };
      } else if (hasButtons && buttonsMode === 'text') {
        const numberEmojis = ['1️⃣', '2️⃣', '3️⃣'];
        const listText = buttons.map((btn, idx) => {
          const emoji = numberEmojis[idx] || '🔘';
          return `${emoji} ${btn.label}`;
        }).join('\n');
        const textAppend = `\n\n${listText}`;
        const captionText = `${finalMessage || ''}${textAppend}`;

        if (mediaUrl) {
          if (finalMediaType === 'image') {
            payload = { image: { url: mediaUrl }, caption: captionText };
          } else if (finalMediaType === 'document') {
            payload = { document: { url: mediaUrl }, mimetype: 'application/pdf', fileName: fileName || 'document.pdf', caption: captionText };
          } else if (finalMediaType === 'video') {
            payload = { video: { url: mediaUrl }, mimetype: 'video/mp4', caption: captionText };
          } else {
            payload = { text: captionText };
          }
        } else {
          payload = { text: captionText };
        }
      } else if (hasButtons && buttonsMode === 'native') {
        const nativeButtons = buttons.map((btn, idx) => {
          if (btn.button_type === 'url') {
            return {
              name: "cta_url",
              buttonParamsJson: JSON.stringify({
                display_text: btn.label,
                url: btn.value,
                merchant_url: btn.value
              })
            };
          } else {
            return {
              name: "quick_reply",
              buttonParamsJson: JSON.stringify({
                display_text: btn.label,
                id: btn.value || `btn_${idx}`
              })
            };
          }
        });

        const interactivePayload = {
          viewOnceMessage: {
            message: {
              interactiveMessage: {
                body: { text: finalMessage || 'Please select an option:' },
                nativeFlowMessage: {
                  buttons: nativeButtons
                }
              }
            }
          }
        };

        if (mediaUrl) {
          if (finalMediaType === 'image') {
            payload = { image: { url: mediaUrl }, caption: finalMessage || '' };
          } else if (finalMediaType === 'document') {
            payload = { document: { url: mediaUrl }, mimetype: 'application/pdf', fileName: fileName || 'document.pdf', caption: finalMessage || '' };
          } else if (finalMediaType === 'video') {
            payload = { video: { url: mediaUrl }, mimetype: 'video/mp4', caption: finalMessage || '' };
          }
          payload = interactivePayload;
        } else {
          payload = interactivePayload;
        }
      } else if (options?.list || (mediaType === 'list' && message && typeof message === 'object')) {
        const listConfig = options.list || message;
        payload = {
          viewOnceMessage: {
            message: {
              interactiveMessage: {
                body: { text: listConfig.text },
                footer: listConfig.footer ? { text: listConfig.footer } : undefined,
                header: listConfig.header ? { title: listConfig.header } : undefined,
                nativeFlowMessage: {
                  buttons: [
                    {
                      name: "single_select",
                      buttonParamsJson: JSON.stringify({
                        title: listConfig.buttonText || "Options",
                        sections: listConfig.sections.map(sec => ({
                          title: sec.title,
                          rows: sec.rows.map(row => ({
                            title: row.title,
                            description: row.description || "",
                            id: row.rowId
                          }))
                        }))
                      })
                    }
                  ]
                }
              }
            }
          }
        };
      } else {
        if (mediaUrl) {
          if (finalMediaType === 'image') {
            payload = { image: { url: mediaUrl }, caption: finalMessage || '' };
          } else if (finalMediaType === 'document') {
            payload = { 
              document: { url: mediaUrl }, 
              mimetype: 'application/pdf', 
              fileName: fileName || 'document.pdf', 
              caption: finalMessage || '' 
            };
          } else if (finalMediaType === 'audio' || finalMediaType === 'voice') {
            const { transcodeToOpus, safeUnlink, TAG: FFMPEG_TAG } = require('./ffmpeg_transcode');
            const getSecureMediaPath = (fname) => {
              const paths = [
                path.join('/app/data/media', fname),
                path.join('/app/data/uploads', fname),
                path.join(process.cwd(), 'data', 'media', fname)
              ];
              for (const p of paths) {
                if (fs.existsSync(p)) return p;
              }
              return null;
            };
            const resolvedPath = getSecureMediaPath(path.basename(mediaUrl)) || (fs.existsSync(path.resolve(mediaUrl)) ? path.resolve(mediaUrl) : null);
            if (!resolvedPath) {
              console.error(`${FFMPEG_TAG} SOURCE_MISSING path=${mediaUrl}`);
              throw new Error('[FFMPEG_ENCODE] Source audio file not found');
            }
            const absInputPath = resolvedPath;
            let transcodeOutputPath = null;
            let finalAudioBuffer;
            let finalMime = 'audio/ogg; codecs=opus';

            const inputSizeBytes = fs.statSync(absInputPath).size;
            console.log(`${FFMPEG_TAG} [DIRECT] INPUT  path=${absInputPath}  size=${inputSizeBytes}B  type=${finalMediaType}`);

            try {
              const result = await transcodeToOpus(absInputPath);
              transcodeOutputPath = result.outputPath;
              const outStat = fs.statSync(transcodeOutputPath);
              console.log(`${FFMPEG_TAG} [DIRECT] OUTPUT path=${transcodeOutputPath}  size=${outStat.size}B  duration=${result.durationSec}s`);
              finalAudioBuffer = fs.readFileSync(transcodeOutputPath);
              if (finalAudioBuffer.length < 100) {
                throw new Error(`${FFMPEG_TAG} Output buffer suspiciously small (${finalAudioBuffer.length}B) — transcode likely failed`);
              }
            } catch (transcodeErr) {
              console.error(`${FFMPEG_TAG} [DIRECT] TRANSCODE_FAIL  error=${transcodeErr.message}`);
              finalAudioBuffer = fs.readFileSync(absInputPath);
              finalMime = 'audio/mp4';
              console.warn(`${FFMPEG_TAG} [DIRECT] FALLBACK  sending raw file with mime=audio/mp4`);
            }

            payload = {
              audio: finalAudioBuffer,
              ptt: true,
              mimetype: finalMime,
            };

            if (transcodeOutputPath && transcodeOutputPath !== absInputPath) {
              try { await safeUnlink(transcodeOutputPath); } catch(_) {}
            }
          } else if (finalMediaType === 'video') {
            payload = { 
              video: { url: mediaUrl }, 
              mimetype: 'video/mp4', 
              caption: finalMessage || '' 
            };
          } else {
            payload = { text: String(finalMessage) };
          }
        } else {
          const textContent = String(finalMessage || '');
          if (!textContent || textContent.trim() === '') {
            console.error('🚫 DIRECT_BLANK_MSG_BLOCKED: Attempted to send empty text message to', cleaned);
            throw new Error('BLANK_MSG_BLOCKED');
          }
          payload = { text: textContent };
        }
      }

      if (quoteContext) {
        const stanzaId = quoteContext.id || quoteContext.stanzaId || quoteContext.message_id;
        if (stanzaId) {
          payload.contextInfo = {
            stanzaId: stanzaId,
            participant: quoteContext.participant,
            quotedMessage: {
              conversation: quoteContext.text || "Media"
            }
          };
        }
      }

      try {
        await this.sock.sendPresenceUpdate('composing', jid);
      } catch (e) {}

      const delays = [2000, 4000, 8000];
      let attempt = 0;
      let sentMsg;

      while (true) {
        try {
          const sendOptions = { messageId: uuid };
          sentMsg = await this.sock.sendMessage(jid, payload, sendOptions);
          break;
        } catch (err) {
          attempt++;
          if (attempt > 3) {
            throw err;
          }
          const retryDelay = delays[attempt - 1];
          console.warn(`[DIRECT_RETRY] sendMessage failed for ${jid}, retry ${attempt}/3 in ${retryDelay}ms. Error: ${err.message}`);
          await new Promise(r => setTimeout(r, retryDelay));
        }
      }

      try {
        await this.sock.sendPresenceUpdate('paused', jid);
      } catch (e) {}

      const messageId = sentMsg?.key?.id || uuid;
      this.hourlyCount++;
      console.log(`✉️ [DIRECT] Sent to ${cleaned} (Total this hour: ${this.hourlyCount})`);
      this._addAuditLog(cleaned, 'Sent', '');

      // Log success to DB & broadcast via WebSocket
      const { db } = require('../db');
      let dbMessageId = null;
      try {
        const order = db.prepare(`SELECT id, store_id FROM orders WHERE phone LIKE ? AND tenant_id = ? ORDER BY id DESC LIMIT 1`).get(`%${cleaned.substring(cleaned.length - 10)}%`, this.tenantId);
        const orderId = order ? order.id : null;
        const storeId = order ? order.store_id : 1;
        
        let dbMessageContent;
        if (poll) {
          dbMessageContent = `🗳️ Poll: ${poll.name}`;
        } else if (payload.viewOnceMessage?.message?.interactiveMessage?.nativeFlowMessage?.buttons?.[0]?.name === 'single_select') {
          dbMessageContent = payload.viewOnceMessage.message.interactiveMessage.body?.text || 'Interactive List';
        } else {
          dbMessageContent = mediaUrl ? `[${finalMediaType.toUpperCase()}] ${finalMessage || ''}` : finalMessage;
        }
        
        let finalDbMediaUrl = mediaUrl;
        if (finalDbMediaUrl && typeof finalDbMediaUrl === 'string' && !finalDbMediaUrl.startsWith('http') && !finalDbMediaUrl.startsWith('blob:')) {
          const publicIndex = finalDbMediaUrl.indexOf('/public/');
          if (publicIndex !== -1) {
            finalDbMediaUrl = finalDbMediaUrl.substring(publicIndex + 7);
          } else {
            const uploadsIndex = finalDbMediaUrl.indexOf('/uploads/');
            if (uploadsIndex !== -1) {
              finalDbMediaUrl = finalDbMediaUrl.substring(uploadsIndex);
            }
          }
        }

        let existingRow = null;
        if (uuid) {
          existingRow = db.prepare(`
            SELECT id FROM whatsapp_messages 
            WHERE phone = ? AND message_id = ? AND direction = 'outgoing' AND tenant_id = ?
            ORDER BY id DESC LIMIT 1
          `).get(cleaned, uuid, this.tenantId);
        }
        if (!existingRow && finalDbMediaUrl) {
          existingRow = db.prepare(`
            SELECT id FROM whatsapp_messages 
            WHERE phone = ? AND media_url = ? AND direction = 'outgoing' AND tenant_id = ?
            ORDER BY id DESC LIMIT 1
          `).get(cleaned, finalDbMediaUrl, this.tenantId);
        }

        if (existingRow) {
          db.prepare(`
            UPDATE whatsapp_messages 
            SET message_id = ?, status = 'sent'
            WHERE id = ?
          `).run(messageId, existingRow.id);
          dbMessageId = existingRow.id;
        } else {
          const result = db.prepare(`
            INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message, message_id, media_url, media_type, status, tenant_id)
            VALUES (?, ?, ?, 'outgoing', ?, ?, ?, ?, 'sent', ?)
          `).run(storeId, orderId, cleaned, dbMessageContent, messageId, finalDbMediaUrl, finalMediaType, this.tenantId);
          dbMessageId = result.lastInsertRowid;
        }

        try {
          const { broadcast } = require('../websocket');
          broadcast('message', {
            order_id: orderId,
            message: {
              id: dbMessageId || Date.now(),
              store_id: storeId,
              order_id: orderId,
              phone: cleaned,
              direction: 'outgoing',
              message: dbMessageContent,
              message_id: messageId,
              clientUuid: uuid,
              media_url: finalDbMediaUrl,
              media_type: finalMediaType,
              status: 'sent',
              quote_context: quoteContext ? JSON.stringify(quoteContext) : null,
              created_at: new Date().toISOString()
            }
          });
        } catch (e) {}
      } catch (dbErr) {
        console.error('⚠️ DB insert/update failed in directSendMessage:', dbErr.message);
      }

      return { success: true, messageId: uuid };
    } catch (err) {
      const reason = err.message || 'Unknown WhatsApp error';
      console.error('❌ directSendMessage error:', reason);
      try {
        const { logSystemError } = require('../db');
        logSystemError('ERROR', `[directSendMessage] Failed to send directly to +${cleaned || phone}: ${reason}`, 'whatsapp_bot');
      } catch (_) {}
      this._addAuditLog(cleaned || phone, 'Failed', reason);

      // Log failure to DB & broadcast via WebSocket
      const { db } = require('../db');
      try {
        const order = db.prepare(`SELECT id, store_id FROM orders WHERE phone LIKE ? AND tenant_id = ? ORDER BY id DESC LIMIT 1`).get(`%${cleaned.substring(cleaned.length - 10)}%`, this.tenantId);
        const orderId = order ? order.id : null;
        const storeId = order ? order.store_id : 1;
        
        let dbMessageContent;
        if (poll) {
          dbMessageContent = `🗳️ Poll: ${poll.name}`;
        } else if (payload?.viewOnceMessage?.message?.interactiveMessage?.nativeFlowMessage?.buttons?.[0]?.name === 'single_select') {
          dbMessageContent = payload.viewOnceMessage.message.interactiveMessage.body?.text || 'Interactive List';
        } else {
          dbMessageContent = mediaUrl ? `[${finalMediaType.toUpperCase()}] ${finalMessage || ''}` : finalMessage;
        }

        let finalDbMediaUrl = mediaUrl;
        if (finalDbMediaUrl && typeof finalDbMediaUrl === 'string' && !finalDbMediaUrl.startsWith('http') && !finalDbMediaUrl.startsWith('blob:')) {
          const publicIndex = finalDbMediaUrl.indexOf('/public/');
          if (publicIndex !== -1) {
            finalDbMediaUrl = finalDbMediaUrl.substring(publicIndex + 7);
          } else {
            const uploadsIndex = finalDbMediaUrl.indexOf('/uploads/');
            if (uploadsIndex !== -1) {
              finalDbMediaUrl = finalDbMediaUrl.substring(uploadsIndex);
            }
          }
        }

        let existingRow = null;
        if (uuid) {
          existingRow = db.prepare(`
            SELECT id FROM whatsapp_messages 
            WHERE phone = ? AND message_id = ? AND direction = 'outgoing' AND tenant_id = ?
            ORDER BY id DESC LIMIT 1
          `).get(cleaned, uuid, this.tenantId);
        }
        if (!existingRow && finalDbMediaUrl) {
          existingRow = db.prepare(`
            SELECT id FROM whatsapp_messages 
            WHERE phone = ? AND media_url = ? AND direction = 'outgoing' AND tenant_id = ?
            ORDER BY id DESC LIMIT 1
          `).get(cleaned, finalDbMediaUrl, this.tenantId);
        }

        if (existingRow) {
          db.prepare(`
            UPDATE whatsapp_messages 
            SET message_id = ?, status = 'failed'
            WHERE id = ?
          `).run(uuid, existingRow.id);
        } else {
          db.prepare(`
            INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message, message_id, media_url, media_type, status, tenant_id)
            VALUES (?, ?, ?, 'outgoing', ?, ?, ?, ?, 'failed', ?)
          `).run(storeId, orderId, cleaned, dbMessageContent, uuid, finalDbMediaUrl, finalMediaType, this.tenantId);
        }

        try {
          const { broadcast } = require('../websocket');
          broadcast('message', {
            order_id: orderId,
            message: {
              id: Date.now(),
              store_id: storeId,
              order_id: orderId,
              phone: cleaned,
              direction: 'outgoing',
              message: dbMessageContent,
              message_id: uuid,
              clientUuid: uuid,
              media_url: finalDbMediaUrl,
              media_type: finalMediaType,
              status: 'failed',
              created_at: new Date().toISOString()
            }
          });
        } catch (e) {}
      } catch (dbErr) {
        console.error('Failed to log failed message status in DB (directSendMessage):', dbErr.message);
      }

      throw err;
    }
  }

  async sendMessage(phone, message, isManual = false, mediaUrl = null, mediaType = null, fileName = null, customMessageId = null, quoteContext = null, buttons = null, buttonsMode = 'native', poll = null, options = {}) {
    if (isManual || options?.force) {
      console.log(`⚡ [DIRECT_SEND_ROUTING] Manual/forced message to ${phone}. Routing directly to directSendMessage.`);
      return this.directSendMessage(phone, message, isManual, mediaUrl, mediaType, fileName, customMessageId, quoteContext, buttons, buttonsMode, poll, options);
    }

    if (!isManual) {
      try {
        const { db } = require('../db');
        let cleaned = phone.replace(/\D/g, '');
        if (cleaned.startsWith('0')) cleaned = '92' + cleaned.substring(1);
        else if (!cleaned.startsWith('92') && cleaned.length === 10) cleaned = '92' + cleaned;

        const profile = db.prepare('SELECT opted_out FROM customer_profiles WHERE phone = ?').get(cleaned);
        if (profile && profile.opted_out === 1) {
          console.log(`🔕 Skipping automated sendMessage to ${cleaned} because customer has opted out.`);
          return { success: false, error: 'Customer has opted out of automated WhatsApp messages.' };
        }
      } catch (e) {
        console.error('⚠️ Opt-out pre-check failed:', e.message);
      }
    }

    let finalMessage = message;
    if (!isManual && finalMessage) {
      finalMessage = this.variateTemplateMessage(finalMessage);
    }

    const uuid = customMessageId || require('crypto').randomUUID();

    return new Promise((resolve) => {
      let cleaned = phone.replace(/\D/g, '');
      if (cleaned.startsWith('0')) cleaned = '92' + cleaned.substring(1);
      else if (!cleaned.startsWith('92') && cleaned.length === 10) cleaned = '92' + cleaned;

      const isActiveChatSession = this.activeChats.has(cleaned) || this.activeChats.has(phone);
      const item = { phone, message: finalMessage, isManual, mediaUrl, mediaType, fileName, resolve, isActiveChatSession, uuid, quoteContext, buttons, buttonsMode, poll };

      if (isActiveChatSession) {
        this.priorityQueue.push(item);
        console.log(`⚡ [PRIORITY_QUEUE] Message queued for ${phone} (active session). Priority size: ${this.priorityQueue.length} | Bulk size: ${this.queue.length}`);
      } else {
        this.queue.push(item);
        console.log(`📥 [BULK_QUEUE] Message queued for ${phone}. Priority size: ${this.priorityQueue.length} | Bulk size: ${this.queue.length}`);
      }
      this._processQueue();
    });
  }

  async _processQueue() {
    await processQueue(this, this.sock, db);
  }

  _addAuditLog(phone, status, error) {
    this.auditLogs.unshift({
      time: new Date().toLocaleTimeString(),
      phone,
      status,
      error
    });
    if (this.auditLogs.length > 100) this.auditLogs.pop();
  }

  setHumanHandoff(phone, active) {
    const normalized = normalizePhone(phone);
    if (!this.humanHandoffContacts) this.humanHandoffContacts = new Set();
    if (active) {
      this.humanHandoffContacts.add(normalized);
      console.log(`🧑 Human handoff ACTIVE for ${normalized}`);
    } else {
      this.humanHandoffContacts.delete(normalized);
      console.log(`🤖 Human handoff REMOVED for ${normalized}`);
    }
  }

  triggerPaymentReceivedReply(phone, orderId) {
    const normalized = normalizePhone(phone);
    if (this.processingReplies && this.processingReplies.has(normalized)) {
      console.warn(`🔒 CONCURRENT_LOCK: triggerPaymentReceivedReply already processing for ${normalized}. Skipping duplicate.`);
      return;
    }
    if (this.processingReplies) this.processingReplies.add(normalized);

    const msg = `✅ *Payment Confirmed!*\n\nThank you! We have received your payment for order *#${orderId}*. Your parcel is being packed and will be dispatched shortly. 📦\n\n_TRACE ERP Auto-Verification System_`;

    if (!msg || msg.trim() === '') {
      console.error('🚫 BLANK_MSG_BLOCKED: triggerPaymentReceivedReply generated empty message');
      if (this.processingReplies) this.processingReplies.delete(normalized);
      return;
    }

    this.sendMessage(phone, msg, true)
      .finally(() => {
        if (this.processingReplies) this.processingReplies.delete(phone);
      });
    console.log(`💳 PAYMENT_RECEIVED auto-reply queued for ${phone} for order #${orderId}`);
  }

  setSettings({ minDelaySec, maxDelaySec, maxPerHour, coolingPeriodMin, aiResponderEnabled, aiTrackingTemplate, aiLandmarkTemplate }) {
    if (minDelaySec !== undefined) this.minDelaySec = Number(minDelaySec);
    if (maxDelaySec !== undefined) this.maxDelaySec = Number(maxDelaySec);
    if (maxPerHour !== undefined) this.maxPerHour = Number(maxPerHour);
    if (coolingPeriodMin !== undefined) this.coolingPeriodMin = Number(coolingPeriodMin);
    if (aiResponderEnabled !== undefined) this.aiResponderEnabled = Number(aiResponderEnabled);
    if (aiTrackingTemplate !== undefined) this.aiTrackingTemplate = aiTrackingTemplate;
    if (aiLandmarkTemplate !== undefined) this.aiLandmarkTemplate = aiLandmarkTemplate;
    console.log(`🎛️ Bot pacing & AI updated: ${this.minDelaySec}-${this.maxDelaySec}s delay | max ${this.maxPerHour}/hr | cooling ${this.coolingPeriodMin}m | AI Responder: ${this.aiResponderEnabled}`);
  }

  togglePause() {
    this.isPaused = !this.isPaused;
    console.log(`🎛️ Master Emergency Switch: isPaused = ${this.isPaused}`);
    if (!this.isPaused) {
      this._processQueue();
    }
    return this.isPaused;
  }

  clearQueue() {
    const bulkCount = this.queue.length;
    const priorityCount = this.priorityQueue?.length || 0;
    this.queue = [];
    if (this.priorityQueue) this.priorityQueue = [];
    console.log(`🗑️ Cleared ${bulkCount} bulk + ${priorityCount} priority queued messages.`);
    return bulkCount + priorityCount;
  }

  getQueueDetails() {
    const bottleneck = this.status !== 'CONNECTED' ? 'WAITING_SOCKET'
      : this.isPaused ? 'WAITING_QUEUE'
      : this.isSleeping ? 'SLEEPING'
      : 'RUNNING';
    return {
      isPaused: this.isPaused,
      isSleeping: this.isSleeping,
      bottleneck,
      priorityQueueCount: this.priorityQueue?.length || 0,
      bulkQueueCount: this.queue.length,
      queueCount: (this.priorityQueue?.length || 0) + this.queue.length,
      activeChatsCount: this.activeChats?.size || 0,
      hourlyCount: this.hourlyCount,
      maxPerHour: this.maxPerHour,
      minDelaySec: this.minDelaySec,
      maxDelaySec: this.maxDelaySec,
      coolingPeriodMin: this.coolingPeriodMin,
      auditLogs: this.auditLogs
    };
  }

  async resetSession() {
    console.log(`🗑️ Manual session reset by admin for tenant [${this.tenantId}]...`);
    this.status = 'DISCONNECTED';
    this.qrCode = null;
    this.reconnectAttempts = 0;
    this.isConnecting = false;
    this._isLoggedOut = false;

    const oldSock = this.sock;
    this.sock = null;
    if (oldSock) {
      try { oldSock.ev.removeAllListeners('connection.update'); } catch (_) {}
      try { oldSock.ev.removeAllListeners('creds.update'); } catch (_) {}
      try { oldSock.ev.removeAllListeners('messages.upsert'); } catch (_) {}
      try { oldSock.logout(); } catch (_) {}
      try { oldSock.end(new Error('reset')); } catch (_) {}
      try { oldSock.ws?.close(); } catch (_) {}
    }

    await this._clearSessionStore();

    setTimeout(() => this._connect(), 2000);
    return true;
  }

  async logoutSession() {
    this._isLoggedOut = true;
    this.status = 'DISCONNECTED';
    this.qrCode = null;
    this.reconnectAttempts = 0;
    this.isConnecting = false;

    const oldSock = this.sock;
    this.sock = null;
    if (oldSock) {
      try { oldSock.ev.removeAllListeners('connection.update'); } catch (_) {}
      try { oldSock.ev.removeAllListeners('creds.update'); } catch (_) {}
      try { oldSock.ev.removeAllListeners('messages.upsert'); } catch (_) {}
      try { await oldSock.logout(); } catch (_) {}
      try { oldSock.end(new Error('logout')); } catch (_) {}
      try { oldSock.ws?.close(); } catch (_) {}
    }

    await this._clearSessionStore();
    return true;
  }

  async softReconnect() {
    if (this.isConnecting) return;
    console.log(`🔄 [Soft Reconnect] Re-initializing Baileys session for tenant: [${this.tenantId}]`);

    const oldSock = this.sock;
    this.sock = null;
    if (oldSock) {
      try { oldSock.ev.removeAllListeners('connection.update'); } catch (_) {}
      try { oldSock.ev.removeAllListeners('creds.update'); } catch (_) {}
      try { oldSock.ev.removeAllListeners('messages.upsert'); } catch (_) {}
      try { oldSock.logout(); } catch (_) {}
      try { oldSock.end(new Error('soft_reconnect')); } catch (_) {}
      try { oldSock.ws?.close(); } catch (_) {}
    }

    this.status = 'DISCONNECTED';
    this.isConnecting = false;

    await this._connect();
  }

  getChatHistory(phone) {
    if (!this.store || !this.store.messages) return [];
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) cleaned = '92' + cleaned.substring(1);
    else if (!cleaned.startsWith('92') && cleaned.length === 10) cleaned = '92' + cleaned;
    const jid = cleaned + '@s.whatsapp.net';
    
    const msgs = this.store.messages[jid] || [];
    return msgs.map(m => {
      const text = getMessageText(m);
      const mediaDetails = getMessageMediaDetails(m);
      if (!text && !mediaDetails) return null;
      let mediaType = mediaDetails ? mediaDetails.type : null;
      const finalMessage = text || (mediaType ? `[${mediaType.toUpperCase()}]` : '');

      return {
        id: m.key.id,
        phone: cleaned,
        direction: m.key.fromMe ? 'outgoing' : 'incoming',
        message: finalMessage,
        media_type: mediaType,
        status: m.key.fromMe ? (m.status === 3 ? 'delivered' : 'sent') : 'received',
        created_at: new Date((Number(m.messageTimestamp) || Date.now()/1000) * 1000).toISOString()
      };
    }).filter(Boolean);
  }

  async fetchHistoryForPhone(phone) {
    if (!this.sock) return { success: false, error: 'Bot not connected' };
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) cleaned = '92' + cleaned.substring(1);
    else if (!cleaned.startsWith('92') && cleaned.length === 10) cleaned = '92' + cleaned;
    const jid = cleaned + '@s.whatsapp.net';

    try {
      console.log(`📂 Fetching older message chunks from WhatsApp for ${cleaned}...`);
      let fetched = [];
      if (typeof this.sock.fetchMessagesFromWA === 'function') {
        try {
          fetched = await this.sock.fetchMessagesFromWA(jid, 50) || [];
          for (const msg of fetched) {
            if (!msg.message) continue;
            if (!this.store.messages[jid]) this.store.messages[jid] = [];
            if (!this.store.messages[jid].some(m => m.key.id === msg.key.id)) {
              this.store.messages[jid].push(msg);
            }
          }
        } catch (e) {
          console.warn('⚠️ fetchMessagesFromWA error:', e.message);
        }
      }
      return { success: true, count: fetched.length, messages: this.getChatHistory(cleaned) };
    } catch (err) {
      console.error('❌ fetchHistory error:', err.message);
      return { success: false, error: err.message };
    }
  }

  async syncDeepHistory() {
    if (!this.sock) return;
    console.log('🔄 Starting Deep History Sync for active customers...');
    
    const { db } = require('../db');
    let downloadMediaMessage;
    try {
      const baileys = await import('@whiskeysockets/baileys');
      downloadMediaMessage = baileys.downloadMediaMessage;
    } catch (err) {
      console.error('⚠️ Failed to load downloadMediaMessage from Baileys:', err.message);
    }
    
    const activeCustomers = db.prepare(`
      SELECT DISTINCT phone, id as order_id, store_id 
      FROM orders 
      WHERE phone IS NOT NULL AND phone != ''
      ORDER BY id DESC 
      LIMIT 50
    `).all();

    console.log(`📱 Found ${activeCustomers.length} active customers to sync.`);

    for (const customer of activeCustomers) {
      let cleaned = customer.phone.replace(/\D/g, '');
      if (cleaned.startsWith('0')) cleaned = '92' + cleaned.substring(1);
      else if (!cleaned.startsWith('92') && cleaned.length === 10) cleaned = '92' + cleaned;
      const jid = cleaned + '@s.whatsapp.net';

      try {
        console.log(`📥 Syncing history for +${cleaned}...`);
        await new Promise(r => setTimeout(r, 600));

        let fetched = [];
        if (typeof this.sock.fetchMessagesFromWA === 'function') {
          fetched = await this.sock.fetchMessagesFromWA(jid, 50) || [];
        } else {
          console.warn('⚠️ fetchMessagesFromWA is not a function on this.sock');
          break;
        }

        let newMsgsCount = 0;
        for (const msg of fetched) {
          if (!msg.message) continue;
          
          const messageId = msg.key.id;
          const exists = db.prepare('SELECT id FROM whatsapp_messages WHERE message_id = ?').get(messageId);
          if (exists) continue;

          const isOutgoing = msg.key.fromMe;
          const text = getMessageText(msg);
          const mediaDetails = getMessageMediaDetails(msg);

          let mediaUrl = null;
          let mediaType = null;
          
          if (mediaDetails && downloadMediaMessage) {
            mediaType = mediaDetails.type;
            mediaUrl = await saveMediaFile(msg, mediaDetails, downloadMediaMessage);
          }

          const finalMessage = text || (mediaType ? `[${mediaType.toUpperCase()}]` : '');
          const timestampSec = Number(msg.messageTimestamp) || Date.now() / 1000;
          const createdAt = new Date(timestampSec * 1000).toISOString().replace('T', ' ').substring(0, 19);

          db.prepare(`
            INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message, message_id, media_url, media_type, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?)
          `).run(
            customer.store_id || 1,
            customer.order_id,
            cleaned,
            isOutgoing ? 'outgoing' : 'incoming',
            finalMessage,
            messageId,
            mediaUrl,
            mediaType,
            createdAt
          );

          newMsgsCount++;
        }
        
        if (newMsgsCount > 0) {
          console.log(`✅ Synced ${newMsgsCount} new messages for +${cleaned}`);
        }
      } catch (err) {
        console.error(`❌ Error syncing history for +${cleaned}:`, err.message);
      }
    }
    console.log('🔄 Deep History Sync completed!');
  }

  isOnline() {
    return this.status === 'CONNECTED';
  }

  getStatus() {
    let activeNumber = this.activeNumber || null;
    if (!activeNumber && this.status === 'CONNECTED') {
      try {
        const rawId = this.sock?.user?.id || '';
        const digits = rawId.split(':')[0].split('@')[0];
        if (digits) {
          activeNumber = `+${digits}`;
          this.activeNumber = activeNumber;
        }
      } catch (_) {}
    }
    return {
      status: this.status,
      qrCode: this.qrCode,
      reconnectAttempts: this.reconnectAttempts,
      activeNumber,
    };
  }
}

const sessions = new Map();

function getBotInstance(tenantId = 'default') {
  if (!sessions.has(tenantId)) {
    sessions.set(tenantId, new WhatsAppBot(tenantId));
  }
  return sessions.get(tenantId);
}

if (isProduction) {
  getBotInstance('default');
}

const botProxy = new Proxy({}, {
  get(target, prop) {
    const tenantId = tenantContext.getStore() || 'default';
    const instance = getBotInstance(tenantId);
    const value = instance[prop];
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  },
  set(target, prop, value) {
    const tenantId = tenantContext.getStore() || 'default';
    const instance = getBotInstance(tenantId);
    instance[prop] = value;
    return true;
  }
});

module.exports = botProxy;
module.exports.sessions = sessions;

module.exports.getBot = function(tenantId) {
  return getBotInstance(tenantId || 'default');
};
