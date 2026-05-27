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

function getMessageMediaDetails(msg) {
  const m = msg.message;
  if (!m) return null;

  const content = m.ephemeralMessage?.message || m.viewOnceMessage?.message || m.viewOnceMessageV2?.message || m.documentWithCaptionMessage?.message || m;

  if (content.imageMessage) {
    return { type: 'image', mimeType: content.imageMessage.mimetype, caption: content.imageMessage.caption || '', fileName: null };
  } else if (content.documentMessage) {
    return { type: 'document', mimeType: content.documentMessage.mimetype, caption: content.documentMessage.caption || '', fileName: content.documentMessage.fileName || 'document.pdf' };
  } else if (content.audioMessage) {
    return { type: 'audio', mimeType: content.audioMessage.mimetype, caption: '', fileName: content.audioMessage.ptt ? 'voice_note.mp4' : 'audio.mp4' };
  } else if (content.videoMessage) {
    return { type: 'video', mimeType: content.videoMessage.mimetype, caption: content.videoMessage.caption || '', fileName: null };
  }
  return null;
}

function getMessageText(msg) {
  const m = msg.message;
  if (!m) return '';

  const content = m.ephemeralMessage?.message || m.viewOnceMessage?.message || m.viewOnceMessageV2?.message || m.documentWithCaptionMessage?.message || m;

  return content.conversation || 
         content.extendedTextMessage?.text || 
         content.buttonsResponseMessage?.selectedDisplayText || 
         content.templateButtonReplyMessage?.selectedDisplayText || 
         content.imageMessage?.caption || 
         content.documentMessage?.caption || 
         content.videoMessage?.caption || 
         '';
}

async function saveMediaFile(msg, mediaDetails, downloadMediaMessage) {
  try {
    const fsPromises = require('fs').promises;
    const crypto = require('crypto');
    const storageDir = process.env.MEDIA_STORAGE_DIR 
      ? path.resolve(process.env.MEDIA_STORAGE_DIR)
      : path.resolve(process.cwd(), 'storage', 'media');
    
    // Ensure the permanent storage directory exists asynchronously
    await fsPromises.mkdir(storageDir, { recursive: true });

    const extMap = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'application/pdf': 'pdf',
      'audio/ogg; codecs=opus': 'ogg',
      'audio/ogg': 'ogg',
      'audio/mp4': 'm4a',
      'audio/mpeg': 'mp3',
      'video/mp4': 'mp4'
    };

    let ext = 'bin';
    if (mediaDetails.mimeType) {
      const baseMime = mediaDetails.mimeType.split(';')[0].trim();
      ext = extMap[baseMime] || extMap[mediaDetails.mimeType] || baseMime.split('/')[1] || 'bin';
    }

    const uuid = crypto.randomUUID();
    const fileName = `${uuid}.${ext}`;
    const filePath = path.join(storageDir, fileName);

    console.log(`📥 Decrypting and downloading media for message ${msg.key.id} (${mediaDetails.mimeType})...`);
    const buffer = await downloadMediaMessage(
      msg,
      'buffer',
      {},
      { logger: SILENT_LOGGER }
    );

    if (buffer) {
      await fsPromises.writeFile(filePath, buffer);
      console.log(`💾 Saved proxy media to secure local storage: ${filePath}`);
      return `/api/media/${fileName}`;
    }
  } catch (e) {
    console.warn(`⚠️ Failed to download media for message ${msg.key.id}:`, e.message);
  }
  return null;
}

function getPhoneFromJid(msg) {
  if (!msg || !msg.key) return '';
  const remoteJid = msg.key.remoteJid;
  if (!remoteJid) return '';
  
  const cleanJid = remoteJid.split('@')[0];
  
  if (remoteJid.endsWith('@lid')) {
    if (msg.key.senderPn) {
      const phone = msg.key.senderPn.split('@')[0];
      try {
        const { db } = require('../db');
        db.prepare(`
          INSERT INTO wa_lid_mappings (lid, phone)
          VALUES (?, ?)
          ON CONFLICT(lid) DO UPDATE SET phone = excluded.phone
        `).run(cleanJid, phone);
      } catch (e) {
        console.error('⚠️ Failed to save LID mapping:', e.message);
      }
      return phone;
    }
    
    try {
      const { db } = require('../db');
      const row = db.prepare('SELECT phone FROM wa_lid_mappings WHERE lid = ?').get(cleanJid);
      if (row) return row.phone;
    } catch (e) {}
  }
  
  return cleanJid;
}

// =============================================================================
// FIX 1: STRICT JID NORMALIZATION UTILITY
// Strips +, -, spaces, @s.whatsapp.net. Converts 0XX -> 92XX.
// Used on ALL lock keys (sentMessages, processingReplies, activeChats).
// =============================================================================
function normalizePhone(raw) {
  if (!raw) return '';
  // Strip JID suffix, +, spaces, dashes
  let n = String(raw).split('@')[0].replace(/[\+\-\s]/g, '').replace(/\D/g, '');
  // Pakistan short-form: 03XX -> 923XX
  if (n.startsWith('0') && n.length === 11) n = '92' + n.substring(1);
  // 10-digit with no country code
  else if (!n.startsWith('92') && n.length === 10) n = '92' + n;
  return n;
}

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
    // Exponential backoff: 3s, 5s, 7s, ... up to 30s, then stays at 30s forever
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
      // Dynamic import — Baileys is ESM-only, must use import() not require()
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
          try { fs.writeFileSync(storePath, JSON.stringify(this.store), 'utf8'); } catch (e) {}
        }, 10000);
      }

      // Use standard multi-file auth state (survives Railway deploys inside persistent volume)
      const { state, saveCreds } = await useMultiFileAuthState(this.getSessionPath());

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

          // Capture the active phone number from the Baileys user JID
          // sock.user.id format: "923134725415:15@s.whatsapp.net" — extract digits before the colon
          try {
            const rawId = this.sock?.user?.id || '';
            const digits = rawId.split(':')[0].split('@')[0];
            this.activeNumber = digits ? `+${digits}` : null;
            if (this.activeNumber) console.log(`📱 Active WA number: ${this.activeNumber}`);
          } catch (_) {
            this.activeNumber = null;
          }

          // Trigger Deep History Sync in background after connection
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

          // 401 = explicitly logged out from phone — wipe session and wait for QR scan
          if (statusCode === DisconnectReason.loggedOut || statusCode === 401 || statusCode === 403) {
            console.log('📵 Logged out from phone — clearing session. Rescan QR to reconnect.');
            this._isLoggedOut = true;
            this._wipeCreds();
            clearDbSession(); // Also clear from DB
            this.reconnectAttempts = 0;
            // Don't schedule reconnect — user must scan QR (status stays DISCONNECTED until resetSession)
          } else {
            // Network drop, server restart, deploy, timeout, etc. — always reconnect
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
              if (i % 500 === 0) await new Promise(r => setTimeout(r, 10)); // Yield to event loop to prevent crash

              if (!msg.message) continue;
              const msgTimestamp = Number(msg.messageTimestamp);
              if (msgTimestamp && msgTimestamp < cutoffTimestamp) continue; // Skip old backlog

              const remoteJid = msg.key?.remoteJid;
              if (!remoteJid || remoteJid.includes('@g.us')) continue;
              
              if (!this.store.messages[remoteJid]) this.store.messages[remoteJid] = [];
              this.store.messages[remoteJid].push(msg);

              const fromPhone = getPhoneFromJid(msg);
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
              // Ignore individual message sync errors to keep event loop alive
            }
          }
          console.log(`✅ WhatsApp History Sync processed successfully.`);
        }
      });

      // --- 🔒 STABILITY FIX: Remove all previous listeners before re-registering
      // This prevents duplicate listener accumulation across reconnects (dup-loop elimination)
      try {
        this.sock.ev.removeAllListeners('messages.update');
      } catch (e) {}
      this.sock.ev.on('messages.update', async (updates) => {
        const { db } = require('../db');
        for (const { key, update } of updates) {
          const messageId = key.id;
          const statusVal = update.status;
          
          if (messageId && statusVal >= 2) {
            try {
              db.prepare("UPDATE whatsapp_messages SET status = 'delivered' WHERE message_id = ?").run(messageId);
            } catch (e) {}
            
            // Search and delete matching file in pending_ack
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
        }
      });

      this.sock.ev.removeAllListeners('messages.upsert');

      this.sock.ev.on('messages.upsert', async (m) => {
        const { messages, type } = m;
        if (type !== 'notify' && type !== 'append') return;
        for (const msg of messages) {
          if (!msg.message) continue;
          
          const remoteJid = msg.key?.remoteJid;
          if (!remoteJid || remoteJid.includes('@g.us')) continue; // Skip groups
          
          if (!this.store.messages[remoteJid]) this.store.messages[remoteJid] = [];
          this.store.messages[remoteJid].push(msg);
          if (this.store.messages[remoteJid].length > 100) this.store.messages[remoteJid].shift();

          const fromPhone = getPhoneFromJid(msg);
          
          // Phantom quote deletion protection: Listen for message deletes (protocolMessage)
          if (msg.message?.protocolMessage) {
            const protocolMsg = msg.message.protocolMessage;
            if (protocolMsg.type === 0 || protocolMsg.type === 'REVOKE') {
              const deletedId = protocolMsg.key?.id;
              if (deletedId) {
                console.log(`🚫 Message deletion detected: message_id=${deletedId} was deleted.`);
                
                // Update in local SQLite database
                try {
                  const { db } = require('../db');
                  db.prepare(`
                    UPDATE whatsapp_messages 
                    SET message = '🚫 This message was deleted', media_url = NULL, media_type = NULL 
                    WHERE message_id = ?
                  `).run(deletedId);
                } catch (e) {
                  console.error('Failed to update deleted message in DB:', e.message);
                }

                // Broadcast deletion event to frontend
                try {
                  const { broadcast } = require('../websocket');
                  broadcast('message_deleted', {
                    message_id: deletedId,
                    phone: fromPhone
                  });
                } catch (e) {}
              }
            }
            continue; // Skip normal message processing for protocol messages
          }

          const text = getMessageText(msg);
          const mediaDetails = getMessageMediaDetails(msg);
          if (!text && !mediaDetails && !msg.message) continue;

          const isOutgoing = msg.key.fromMe;
          if (!isOutgoing && fromPhone) {
            this.contactLastIncomingTimestamp[fromPhone] = Date.now();
            // Mark phone as 'active chat' for smart backoff — window: 5 minutes
            this.activeChats.add(fromPhone);
            setTimeout(() => this.activeChats.delete(fromPhone), 5 * 60 * 1000);
          }
          
          // Download media if present
          let mediaUrl = null;
          let mediaType = null;
          if (mediaDetails) {
            const { db } = require('../db');
            const existingMsg = db.prepare(`SELECT media_url FROM whatsapp_messages WHERE message_id = ?`).get(msg.key.id);
            if (existingMsg && existingMsg.media_url) {
              mediaUrl = existingMsg.media_url;
              mediaType = mediaDetails.type;
            } else {
              try {
                const { downloadMediaMessage } = await import('@whiskeysockets/baileys');
                mediaType = mediaDetails.type;
                mediaUrl = await saveMediaFile(msg, mediaDetails, downloadMediaMessage);
              } catch (mediaErr) {
                console.error('⚠️ Media download error in messages.upsert:', mediaErr.message);
              }
            }
          }

          // --- FIX 3: Validate message type — block 'Unsupported' objects from entering the pipeline ---
          const msgKeys = Object.keys(msg.message || {});
          const SUPPORTED_TYPES = ['conversation', 'extendedTextMessage', 'imageMessage', 'audioMessage',
            'videoMessage', 'documentMessage', 'stickerMessage', 'reactionMessage',
            'protocolMessage', 'ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2',
            'ptvMessage', 'locationMessage', 'contactMessage'];
          const hasKnownType = msgKeys.some(k => SUPPORTED_TYPES.includes(k));
          if (!hasKnownType && !text && !mediaDetails) {
            console.log(`[MSG_FILTER] Skipping unsupported protocol message from ${fromPhone}. Keys: ${msgKeys.join(',')}`);
            continue;
          }
          const finalMessage = text || (mediaType ? `[${mediaType.toUpperCase()}]` : null);
          if (!finalMessage) continue; // Drop if still nothing to store

          const m = msg.message;
          const contextInfo = m?.extendedTextMessage?.contextInfo || 
                              m?.imageMessage?.contextInfo || 
                              m?.audioMessage?.contextInfo || 
                              m?.videoMessage?.contextInfo || 
                              m?.documentMessage?.contextInfo;
          let incomingQuoteContext = null;
          if (contextInfo && contextInfo.stanzaId) {
            incomingQuoteContext = {
              id: contextInfo.stanzaId,
              participant: contextInfo.participant,
              text: contextInfo.quotedMessage?.conversation || 
                    contextInfo.quotedMessage?.extendedTextMessage?.text || 
                    "Media"
            };
          }

          const { db } = require('../db');
          // Robust order routing: match customer even if DB has spaces/dashes like "0303 4070 779"
          const order = db.prepare(`SELECT id, store_id FROM orders WHERE REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ? ORDER BY id DESC LIMIT 1`).get(`%${fromPhone.substring(Math.max(0, fromPhone.length - 10))}%`);
          const orderId = order ? order.id : null;
          const storeId = order ? order.store_id : 1;

          let dbMessageId = null;
          let alreadyExists = false;
          try {
            const existing = db.prepare('SELECT id FROM whatsapp_messages WHERE message_id = ?').get(msg.key.id);
            if (existing) {
              alreadyExists = true;
              dbMessageId = existing.id;
            } else {
              const result = db.prepare(`
                INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message, message_id, media_url, media_type, status, quote_context)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?)
              `).run(storeId, orderId, fromPhone, isOutgoing ? 'outgoing' : 'incoming', finalMessage, msg.key.id, mediaUrl, mediaType, incomingQuoteContext ? JSON.stringify(incomingQuoteContext) : null);
              dbMessageId = result.lastInsertRowid;
            }
          } catch (dbErr) {
            console.error('⚠️ DB Insert Failed for incoming message:', dbErr.message);
          }

          // 🎙️ STT: Fire-and-forget transcription for incoming voice notes (Rule F)
          if (mediaType === 'audio' && mediaUrl && dbMessageId && !alreadyExists) {
            setImmediate(async () => {
              try {
                const { transcribeVoiceNote } = require('./stt_engine');
                const { DB_DIR } = require('../db');
                const absPath = mediaUrl.startsWith('/uploads/')
                  ? require('path').join(DB_DIR, 'uploads', mediaUrl.substring(9))
                  : require('path').join(DB_DIR, 'uploads', mediaUrl);
                await transcribeVoiceNote(fromPhone, dbMessageId, absPath);
              } catch(e) { console.error('STT dispatch error:', e.message); }
            });
          }

          // 🔍 OCR: Fire-and-forget receipt scan for incoming images (Rule F)
          if (mediaType === 'image' && mediaUrl && dbMessageId && !alreadyExists) {
            setImmediate(async () => {
              try {
                const { scanReceiptOCR } = require('./ocr_engine');
                const { DB_DIR } = require('../db');
                const absPath = mediaUrl.startsWith('/uploads/')
                  ? require('path').join(DB_DIR, 'uploads', mediaUrl.substring(9))
                  : require('path').join(DB_DIR, 'uploads', mediaUrl);
                await scanReceiptOCR(fromPhone, orderId, dbMessageId, absPath);
              } catch(e) { console.error('OCR dispatch error:', e.message); }
            });
          }

          // Broadcast new message via WebSocket to active agents in real-time
          if (!isOutgoing || !alreadyExists) {
            try {
              const { broadcast } = require('../websocket');
              broadcast('message', {
                order_id: orderId,
                message: {
                  id: dbMessageId || Date.now(),
                  store_id: storeId,
                  order_id: orderId,
                  phone: fromPhone,
                  direction: isOutgoing ? 'outgoing' : 'incoming',
                  message: finalMessage,
                  message_id: msg.key.id,
                  media_url: mediaUrl,
                  media_type: mediaType,
                  status: 'sent',
                  quote_context: incomingQuoteContext ? JSON.stringify(incomingQuoteContext) : null,
                  created_at: new Date().toISOString()
                }
              });
            } catch (e) {}
          }

          if (isOutgoing) {
            // Human agent manually sent a message: Pause bot replies for 30 minutes for this contact
            this.humanCooldowns[fromPhone] = Date.now();
            console.log(`👤 Human manual message detected for ${fromPhone}. Bot auto-replies paused for 30 mins.`);
            
            // Set 15-minute lock in database
            const until = Date.now() + 15 * 60 * 1000;
            try {
              const { db } = require('../db');
              db.prepare(`
                INSERT INTO customer_profiles (phone, human_handoff_until, updated_at)
                VALUES (?, ?, datetime('now'))
                ON CONFLICT(phone) DO UPDATE SET human_handoff_until = ?, updated_at = datetime('now')
              `).run(fromPhone, String(until), String(until));
              console.log(`🧑 [HANDOFF_LOCK] Set 15-minute handoff lock in DB for ${fromPhone} due to outgoing human message.`);
            } catch (e) {
              console.error('⚠️ Failed to set human handoff lock in DB:', e.message);
            }
            continue;
          }

          console.log(`💬 Incoming WA Message from ${fromPhone}: ${text}`);

          // --- 👤 HIGH-RISK INTENT ROUTING (TRIAGE QUEUE) ---
          const HIGH_RISK_KEYWORDS = [
            'refund', 'complaint', 'fraud', 'cheat', 'scam', 'defective', 'damaged',
            'broken', 'wrong item', 'consumer court', 'worst service', 'bad service',
            'fake', 'wapas', 'shikayat', 'dhoka', 'kharab'
          ];
          const lowerText = String(text || '').toLowerCase().trim();
          const isHighRisk = HIGH_RISK_KEYWORDS.some(kw => lowerText.includes(kw));

          if (!isOutgoing && isHighRisk) {
            console.log(`⚠️ [TRIAGE] High-risk message intent detected from ${fromPhone}. Routing to triage queue.`);
            // Update customer profile risk flag and handoff lock
            const until = Date.now() + 15 * 60 * 1000;
            try {
              db.prepare(`
                INSERT INTO customer_profiles (phone, risk_flag, risk_reason, risk_updated_at, human_handoff_until, updated_at)
                VALUES (?, 'HIGH_RISK', 'High-risk message intent: ' || ?, datetime('now'), ?, datetime('now'))
                ON CONFLICT(phone) DO UPDATE SET 
                  risk_flag = 'HIGH_RISK', 
                  risk_reason = 'High-risk message intent: ' || ?, 
                  risk_updated_at = datetime('now'),
                  human_handoff_until = ?,
                  updated_at = datetime('now')
              `).run(fromPhone, text.substring(0, 100), String(until), text.substring(0, 100), String(until));
            } catch (e) {
              console.error('⚠️ Failed to update customer risk profile:', e.message);
            }
            
            // Put in human handoff
            this.setHumanHandoff(fromPhone, true);
            
            // Broadcast triage notification
            try {
              const { broadcast } = require('../websocket');
              broadcast('high_risk_triage', { phone: fromPhone, message: text });
            } catch (_) {}

            // Save/update the incoming message with intent = 'triage'
            try {
              db.prepare(`
                UPDATE whatsapp_messages SET intent = 'triage' WHERE message_id = ?
              `).run(msg.key.id);
            } catch (dbErr) {
              console.error('⚠️ DB update failed for triage message:', dbErr.message);
            }
            
            continue; // CRITICAL: Stop and do NOT trigger bot or Gemini!
          }

          // Check if bot is sleeping to simulate human rest, skip auto-replies completely!
          if (this.isSleeping) {
            console.log(`💤 Bot is currently SLEEPING (simulating rest) for tenant [${this.tenantId}]. Skipping auto-reply to ${fromPhone}.`);
            continue;
          }

          // --- 👤 MODULE 5: HUMAN HANDOFF CHECK ---
          if (this.humanHandoffContacts && this.humanHandoffContacts.has(fromPhone)) {
            console.log(`👤 [HANDOFF] ${fromPhone} is in human intervention mode. Bot silent.`);
            continue;
          }

          // Check DB handoff lock
          try {
            const profile = db.prepare('SELECT human_handoff_until FROM customer_profiles WHERE phone = ?').get(fromPhone);
            if (profile && profile.human_handoff_until) {
              const handoffUntil = Number(profile.human_handoff_until);
              if (Date.now() < handoffUntil) {
                console.log(`👤 [HANDOFF_DB_LOCK] ${fromPhone} has active human handoff lock until ${new Date(handoffUntil).toISOString()}. Bot silent.`);
                continue;
              }
            }
          } catch (e) {
            console.error('⚠️ Failed to check handoff lock in DB:', e.message);
          }

          // Reset consecutive-bot-reply counter on every incoming message
          this.consecutiveBotReplies[fromPhone] = 0;

          // Check if contact is under active human manual override cooldown
          const lastHumanMsg = this.humanCooldowns[fromPhone];
          if (lastHumanMsg && (Date.now() - lastHumanMsg) < 30 * 60 * 1000) {
            console.log(`⏳ Skipping bot auto-reply for ${fromPhone} due to active human manual override.`);
            continue;
          }

          // --- 🔐 COD VERIFICATION INTERCEPTOR ---
          // Must run BEFORE Gemini — intercepts '1' and '2' replies to pending COD verifications
          try {
            const { db: dbRef } = require('../db');
            const pendingCOD = dbRef.prepare(
              `SELECT * FROM cod_pending_verifications WHERE phone = ? AND status = 'pending'
               AND expires_at > datetime('now', '+5 hours') ORDER BY id DESC LIMIT 1`
            ).get(fromPhone);

            if (pendingCOD) {
              const reply = text ? text.toLowerCase().trim() : '';
              const isConfirm = reply === '1' || ['confirm', 'yes', 'haan', 'ji', 'ok', 'bilkul'].some(w => reply.includes(w));
              const isCancel = reply === '2' || ['cancel', 'nahi', 'na', 'no', 'nain'].some(w => reply.includes(w));

              if (isConfirm || isCancel) {
                const newStatus = isConfirm ? 'confirmed' : 'cancelled';
                dbRef.prepare(`UPDATE cod_pending_verifications SET status = ?, replied_at = datetime('now', '+5 hours') WHERE id = ?`).run(newStatus, pendingCOD.id);
                
                if (isConfirm) {
                  dbRef.prepare(`UPDATE orders SET wa_verification_status = 'verified', payment_status = 'COD Confirmed' WHERE id = ?`).run(pendingCOD.order_id);
                  this.sendMessage(fromPhone, `✅ *Shukriya!* Aapka COD order *confirm* ho gaya hai. Insha'Allah 2-3 working days mein deliver ho jayega. 📦`, true);
                  console.log(`🔐 COD Confirmed: Order ${pendingCOD.order_id} by ${fromPhone}`);
                } else {
                  dbRef.prepare(`UPDATE orders SET payment_status = 'COD Cancelled' WHERE id = ?`).run(pendingCOD.order_id);
                  this.sendMessage(fromPhone, `❌ Aapka order cancel note kar liya gaya hai. Agar dobara order karna chahein toh hamari website visit karein. JazakAllah! 🙏`, true);
                  console.log(`🔐 COD Cancelled: Order ${pendingCOD.order_id} by ${fromPhone}`);
                }
                continue; // COD handled — skip Gemini
              }
            }
          } catch (codErr) {
            console.error('🔐 COD interceptor error:', codErr.message);
          }

          try {
            const { db } = require('../db');
            
            // Handle Opt-out / Opt-in keywords
            const lowerText = text.toLowerCase().trim();
            const optOutKeywords = ['stop', 'unsubscribe', 'opt out', 'optout', 'bas karo', 'tang na karo', 'unsub'];
            const isOptOut = optOutKeywords.some(keyword => lowerText === keyword || lowerText.startsWith(keyword + ' '));
            
            if (isOptOut) {
              db.prepare(`
                INSERT INTO customer_profiles (phone, opted_out, updated_at)
                VALUES (?, 1, datetime('now'))
                ON CONFLICT(phone) DO UPDATE SET opted_out = 1, updated_at = datetime('now')
              `).run(fromPhone);
              console.log(`🔕 Customer ${fromPhone} opted out from bot auto-replies.`);
              this.sendMessage(fromPhone, "🤖 [TRACE Support] Aapko unsubscribe kar diya gaya hai. Ab aapko automated messages nahi milenge. Agar dobara activate karna ho toh 'Start' reply karein.", true);
              continue;
            }

            const optInKeywords = ['start', 'subscribe', 'opt in', 'optin', 'activate', 'dobara activate'];
            const isOptIn = optInKeywords.some(keyword => lowerText === keyword || lowerText.startsWith(keyword + ' '));
            
            if (isOptIn) {
              db.prepare(`
                INSERT INTO customer_profiles (phone, opted_out, updated_at)
                VALUES (?, 0, datetime('now'))
                ON CONFLICT(phone) DO UPDATE SET opted_out = 0, updated_at = datetime('now')
              `).run(fromPhone);
              console.log(`🔔 Customer ${fromPhone} opted in to bot auto-replies.`);
              this.sendMessage(fromPhone, "🤖 [TRACE Support] Automated help dobara activate kar di gayi hai. Aap kaisa help chahte hain?", true);
              continue;
            }

            // Check if opted out
            const profile = db.prepare('SELECT opted_out FROM customer_profiles WHERE phone = ?').get(fromPhone);
            if (profile && profile.opted_out === 1) {
              console.log(`🔕 Skipping bot reply for ${fromPhone} because customer is opted out.`);
              continue;
            }

            const order = db.prepare(`SELECT id, store_id, tracking_number, courier, delivery_status, wa_verification_status, address FROM orders WHERE phone LIKE ? ORDER BY id DESC LIMIT 1`).get(`%${fromPhone.substring(fromPhone.length - 10)}%`);
            const orderId = order ? order.id : null;
            const storeId = order ? order.store_id : 1;

            db.prepare(`
              INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message)
              VALUES (?, ?, ?, 'incoming', ?)
            `).run(storeId, orderId, fromPhone, text);

            // --- 🚚 WISMO FAST-INTERCEPT (pre-Gemini to save API tokens) ---
            const wismoKeywords = ['kahan', 'kahan hai', 'tracking', 'track', 'status', 'kab aayega', 'kab ayega', 'parcel', 'where is', 'where is my order', 'wismo', 'order kahan', 'consignment', 'delivery kab'];
            const isWismo = wismoKeywords.some(w => lowerText.includes(w));
            if (isWismo && orderId) {
              const { db: dbWismo } = require('../db');
              const wismoOrder = dbWismo.prepare('SELECT tracking_number, courier, delivery_status, status_date FROM orders WHERE id = ?').get(orderId);
              if (wismoOrder && wismoOrder.tracking_number) {
                const tracking = wismoOrder.tracking_number;
                const courier = wismoOrder.courier || 'Courier';
                const status = wismoOrder.delivery_status || 'In Transit';
                const trackLink = courier === 'PostEx'
                  ? `https://api.postex.pk/services/integration/api/order/v1/track-order/${tracking}`
                  : `https://one-be.instaworld.pk/logistics/v1/trackShipment?tracking=${tracking}`;
                const wismoReply = `📦 *Order Status Update*\n\nTracking: *${tracking}* (${courier})\nCurrent Status: *${status}*\n\n🔗 Live Track: ${trackLink}\n\nKoi aur sawaal ho toh zaroor batayein! 😊`;
                // --- 📊 Rate limiter guard ---
                if ((this.consecutiveBotReplies[fromPhone] || 0) >= 2) {
                  console.warn(`⚠️ [RATE-LIMIT] Skipping WISMO reply to ${fromPhone} — 2 consecutive bot replies without response.`);
                } else {
                  this.sendMessage(fromPhone, wismoReply, true);
                  this.consecutiveBotReplies[fromPhone] = (this.consecutiveBotReplies[fromPhone] || 0) + 1;
                  console.log(`🚚 WISMO fast-intercept replied to ${fromPhone}`);
                }
                continue;
              }
            }

            // --- 🧠 GEMINI AUTONOMOUS AI ORCHESTRATION ---
            const { generateAIResponse } = require('./gemini_engine');
            const geminiReply = await generateAIResponse(fromPhone, text);
            if (geminiReply) {
              // --- 🤝 Handoff detection: if Gemini signals a human agent is needed ---
              const handoffKeywords = ['human agent', 'human support', 'live agent', 'connect you to', 'escalat', 'transfer you'];
              const needsHandoff = handoffKeywords.some(kw => geminiReply.toLowerCase().includes(kw));
              if (needsHandoff) {
                this.setHumanHandoff(fromPhone, true);
                try {
                  const { broadcast } = require('../websocket');
                  broadcast('human_handoff_required', { phone: fromPhone, reason: 'Gemini AI flagged handoff', preview: geminiReply.substring(0, 120) });
                } catch (_) {}
              }
              // --- 📊 Rate limiter guard ---
              if ((this.consecutiveBotReplies[fromPhone] || 0) >= 2) {
                console.warn(`⚠️ [RATE-LIMIT] Skipping Gemini reply to ${fromPhone} — 2 consecutive bot replies without response.`);
              } else {
                this.sendMessage(fromPhone, geminiReply, true);
                this.consecutiveBotReplies[fromPhone] = (this.consecutiveBotReplies[fromPhone] || 0) + 1;
              }
              continue; // Gemini handled the conversation completely!
            }

            // If we reached here, Gemini failed to reply (e.g. rate limit, api key issue, error, etc.)
            // We implement a comprehensive fallback responder to ensure the bot ALWAYS replies to all messages.
            const settings = db.prepare('SELECT ai_responder_enabled, ai_tracking_template, ai_landmark_template FROM whatsapp_settings ORDER BY id DESC LIMIT 1').get() || {};
            
            // Check if customer has an order
            if (orderId) {
              // 1. Verification Intent
              if (['confirm', 'yes', 'haan', 'ji', 'ok', 'verify', 'y'].some(w => lowerText.includes(w))) {
                db.prepare(`UPDATE orders SET wa_verification_status = 'Verified' WHERE id = ?`).run(orderId);
                console.log(`✅ Auto-verified order #${orderId} via WA reply!`);
              }

              // Check if AI fallback responder is enabled (or fallback anyway to prevent silence)
              if (settings.ai_responder_enabled !== 0) {
                // 2. Tracking Intent
                if (['kahan', 'tracking', 'status', 'kab aayega', 'parcel', 'where is', 'track'].some(w => lowerText.includes(w))) {
                  const tracking = order.tracking_number || 'N/A';
                  const courier = order.courier || 'Courier';
                  const status = order.delivery_status || 'In Transit';
                  const link = order.courier === 'PostEx' ? `https://api.postex.pk/services/integration/api/order/v1/track-order/${tracking}` : `https://one-be.instaworld.pk/logistics/v1/trackShipment?tracking=${tracking}`;
                  
                  let reply = (settings.ai_tracking_template || '🤖 [TRACE Support] Aapka parcel ({tracking}) {courier} ke paas hai. Current status: {status}. Track link: {link}')
                    .replace(/\{tracking\}/g, tracking)
                    .replace(/\{courier\}/g, courier)
                    .replace(/\{status\}/g, status)
                    .replace(/\{link\}/g, link);

                  if ((this.consecutiveBotReplies[fromPhone] || 0) >= 2) {
                    console.warn(`⚠️ [RATE-LIMIT] Skipping fallback tracking reply to ${fromPhone} — rate limit hit.`);
                  } else {
                    this.sendMessage(fromPhone, reply, true);
                    this.consecutiveBotReplies[fromPhone] = (this.consecutiveBotReplies[fromPhone] || 0) + 1;
                    console.log(`🤖 AI Fallback: Sent Tracking Intent reply to ${fromPhone}`);
                  }
                }
                // 3. Landmark Intent
                else if (['near', 'opposite', 'beside', 'gali', 'house', 'makan', 'street', 'landmark', 'ke paas', 'samne'].some(w => lowerText.includes(w))) {
                  db.prepare(`UPDATE orders SET cs_notes = IFNULL(cs_notes, '') || ' [WA Landmark: ' || ? || ']' WHERE id = ?`).run(text, orderId);
                  
                  let reply = (settings.ai_landmark_template || '🤖 [TRACE Support] Shukriya! Aapka nearest landmark ({landmark}) record kar liya gaya hai aur rider ko update kar diya gaya hai.')
                    .replace(/\{landmark\}/g, text);

                  if ((this.consecutiveBotReplies[fromPhone] || 0) >= 2) {
                    console.warn(`⚠️ [RATE-LIMIT] Skipping fallback landmark reply to ${fromPhone} — rate limit hit.`);
                  } else {
                    this.sendMessage(fromPhone, reply, true);
                    this.consecutiveBotReplies[fromPhone] = (this.consecutiveBotReplies[fromPhone] || 0) + 1;
                    console.log(`🤖 AI Fallback: Sent Landmark Intent reply to ${fromPhone}`);
                  }
                }
                // 4. General fallback message when they have an order but the intent is not recognized
                else {
                  const customerName = order.customer_name || 'Customer';
                  const reply = `🤖 [TRACE Support] Hi *${customerName}*! Humare system mein aapka order exist karta hai. Agar aap apna parcel track karna chahte hain, toh reply mein *'kahan hai'* ya *'status'* likh kar bhejein. Shukriya!`;
                  if ((this.consecutiveBotReplies[fromPhone] || 0) >= 2) {
                    console.warn(`⚠️ [RATE-LIMIT] Skipping fallback general-order reply to ${fromPhone} — rate limit hit.`);
                  } else {
                    this.sendMessage(fromPhone, reply, true);
                    this.consecutiveBotReplies[fromPhone] = (this.consecutiveBotReplies[fromPhone] || 0) + 1;
                    console.log(`🤖 AI Fallback: Sent general order holder message to ${fromPhone}`);
                  }
                }
              }
            } else {
              // The phone number does not have any order in the database (e.g. general query, new customer, or test number)
              // 1. Check if they asked for tracking anyway
              if (['kahan', 'tracking', 'status', 'kab aayega', 'parcel', 'where is', 'track'].some(w => lowerText.includes(w))) {
                const reply = `🤖 [TRACE Support] Aapka phone number humare system mein kisi active order se register nahi mila. Agar aapne order kiya hai, toh kindly humein apna *order number* (e.g. TR12345) message karein taake hum update check kar sakein.`;
                if ((this.consecutiveBotReplies[fromPhone] || 0) >= 2) {
                  console.warn(`⚠️ [RATE-LIMIT] Skipping fallback no-order-tracking reply to ${fromPhone} — rate limit hit.`);
                } else {
                  this.sendMessage(fromPhone, reply, true);
                  this.consecutiveBotReplies[fromPhone] = (this.consecutiveBotReplies[fromPhone] || 0) + 1;
                  console.log(`🤖 AI Fallback: Sent tracking request message to non-order holder ${fromPhone}`);
                }
              } else {
                // 2. Generic greeting / helper fallback
                const reply = `🤖 [TRACE Support] Salam! Aapka message received ho gaya hai. Humare system mein is number se koi current order exist nahi karta. Agar aap new order place karna chahte hain ya agent se baat karna chahte hain, toh apna query reply karein. Humara customer support representative jald hi aapse raabta karega.`;
                if ((this.consecutiveBotReplies[fromPhone] || 0) >= 2) {
                  console.warn(`⚠️ [RATE-LIMIT] Skipping fallback general-help reply to ${fromPhone} — rate limit hit.`);
                } else {
                  this.sendMessage(fromPhone, reply, true);
                  this.consecutiveBotReplies[fromPhone] = (this.consecutiveBotReplies[fromPhone] || 0) + 1;
                  console.log(`🤖 AI Fallback: Sent general help reply to non-order holder ${fromPhone}`);
                }
              }
            }
          } catch (err) {
            console.error('❌ Error processing incoming WA message:', err.message);
          }
        }
      });

    } catch (err) {
      console.error('❌ _connect() error:', err.message);
      this.status = 'FAILURE';
      this._scheduleReconnect();
    }
  }

  _wipeCreds() {
    try {
      const sessionPath = this.getSessionPath();
      if (fs.existsSync(sessionPath)) {
        const files = fs.readdirSync(sessionPath);
        for (const f of files) {
          if (f.endsWith('.json')) fs.unlinkSync(path.join(sessionPath, f));
        }
        console.log(`✅ Session creds wiped for tenant [${this.tenantId}]`);
      }
    } catch (e) {
      console.error('⚠️ Failed to wipe creds:', e.message);
    }
  }

  variateTemplateMessage(text) {
    if (!text || typeof text !== 'string') return text;
    let modified = text;

    // 1. Variate common greetings
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

    // 2. Inject minor variation tokens like emojis
    const emojis = ['😊', '👍', '📦', '🙏', '✨', ''];
    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
    if (randomEmoji) {
      if (modified.endsWith('.')) {
        modified = modified.slice(0, -1) + ' ' + randomEmoji;
      } else {
        modified = modified + ' ' + randomEmoji;
      }
    }

    // 3. Inject zero-width space or space suffix to modify exact byte matching
    const randomSuffix = Math.random() > 0.5 ? '\u200B' : ' ';
    modified = modified + randomSuffix;

    return modified;
  }

  async sendMessage(phone, message, isManual = false, mediaUrl = null, mediaType = null, fileName = null, customMessageId = null, quoteContext = null) {
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

    // --- ⚡ FIX: Route to HIGH-PRIORITY queue for manual/active-chat messages ---
    return new Promise((resolve) => {
      let cleaned = phone.replace(/\D/g, '');
      if (cleaned.startsWith('0')) cleaned = '92' + cleaned.substring(1);
      else if (!cleaned.startsWith('92') && cleaned.length === 10) cleaned = '92' + cleaned;

      if (isManual) {
        // Manual 1-on-1 agent chat: Instant priority delivery and set/refresh 15-minute handoff lock in DB
        console.log(`⚡ [PRIORITY] Manual agent message to ${cleaned}. No anti-ban delay.`);
        
        const until = Date.now() + 15 * 60 * 1000;
        try {
          const { db } = require('../db');
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

      const isActiveChatSession = isManual || this.activeChats.has(cleaned) || this.activeChats.has(phone);
      const item = { phone, message: finalMessage, isManual, mediaUrl, mediaType, fileName, resolve, isActiveChatSession, uuid, quoteContext };

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
    const totalPending = (this.priorityQueue?.length || 0) + this.queue.length;
    if (this.isProcessing || totalPending === 0) return;

    // --- FIX 4: Bottleneck Logging ---
    if (this.status !== 'CONNECTED') {
      console.warn(`⏳ [WAITING_SOCKET] Bot not connected. Priority pending: ${this.priorityQueue?.length || 0} | Bulk pending: ${this.queue.length}`);
      return;
    }
    if (this.isPaused) {
      console.warn(`⏳ [WAITING_QUEUE] Queue paused by Master Emergency Switch. Items frozen: ${totalPending}`);
      return;
    }
    if (this.isSleeping) {
      console.warn(`⏳ [WAITING_QUEUE] Bot SLEEPING until ${new Date(this.sleepUntil).toISOString()}. Items frozen: ${totalPending}`);
      return;
    }

    this.isProcessing = true;

    // Unified drain loop — priority queue is always drained first
    while ((!this.isPaused && !this.isSleeping) && ((this.priorityQueue?.length || 0) + this.queue.length > 0)) {
      // --- ⚡ FIX: Drain PRIORITY queue before touching bulk queue ---
      const activeQueue = (this.priorityQueue?.length > 0) ? this.priorityQueue : this.queue;
      const queueType = (activeQueue === this.priorityQueue) ? 'PRIORITY' : 'BULK';
      // 1. Check Hourly Limit
      const now = Date.now();
      if (now - this.lastResetTime > 3600000) {
        this.hourlyCount = 0;
        this.lastResetTime = now;
      }

      if (this.hourlyCount >= this.maxPerHour) {
        console.warn(`🛑 [WAITING_QUEUE] Hourly limit (${this.maxPerHour}) reached. Cooling for ${this.coolingPeriodMin} min. Pending: ${(this.priorityQueue?.length || 0) + this.queue.length}`);
        await new Promise(r => setTimeout(r, this.coolingPeriodMin * 60000));
        this.hourlyCount = 0;
        this.lastResetTime = Date.now();
      }

      const { phone, message, isManual, mediaUrl, mediaType, fileName, resolve, isActiveChatSession, uuid, quoteContext } = activeQueue[0]; // Peek!
      let cleaned = phone.replace(/\D/g, '');
      if (cleaned.startsWith('0')) cleaned = '92' + cleaned.substring(1);
      else if (!cleaned.startsWith('92') && cleaned.length === 10) cleaned = '92' + cleaned;

      // --- 3. Rate Limit: Max 3 messages per contact per 60 seconds unless they respond ---
      const sixtySecsAgo = Date.now() - 60000;
      this.contactMessageTimestamps[cleaned] = (this.contactMessageTimestamps[cleaned] || []).filter(t => t > sixtySecsAgo);
      
      const lastIncoming = this.contactLastIncomingTimestamp[cleaned] || 0;
      const sentTimestamps = this.contactMessageTimestamps[cleaned];
      
      if (sentTimestamps.length >= 3) {
        const lastSent = Math.max(...sentTimestamps);
        if (lastIncoming <= lastSent) {
          const oldestTimestamp = sentTimestamps[0];
          const waitTime = Math.max(1000, 60000 - (Date.now() - oldestTimestamp) + 1000);
          console.warn(`🛑 [WAITING_QUEUE] Anti-Ban: +${cleaned} limit reached (3 msgs/60s). Wait: ${(waitTime/1000).toFixed(1)}s | Queue type: ${queueType}`);
          await new Promise(r => setTimeout(r, waitTime));
          continue;
        }
      }

      // Safe to send! Shift from the correct queue
      activeQueue.shift();
      console.log(`🚀 [${queueType}] Processing message for ${phone}. Priority remaining: ${this.priorityQueue?.length || 0} | Bulk remaining: ${this.queue.length}`);

      // --- 🔒 STABILITY FIX: Global dedup lock — block repeat auto-reply within 5 seconds ---
      if (!isManual) {
        const dedupKey = `${normalizePhone(cleaned)}:${String(message).substring(0, 60)}`;
        const lastSentTs = this.sentMessages.get(dedupKey);
        if (lastSentTs && (Date.now() - lastSentTs) < 5000) {
          console.warn(`🔒 DEDUP_LOCK: Blocked duplicate auto-reply to ${cleaned} within 5s window. Skipping.`);
          resolve({ success: false, error: 'DEDUP_BLOCKED' });
          continue;
        }
        this.sentMessages.set(dedupKey, Date.now());
        // Clean up old dedup keys to prevent memory leak (keep last 200)
        if (this.sentMessages.size > 200) {
          const oldestKey = this.sentMessages.keys().next().value;
          this.sentMessages.delete(oldestKey);
        }
      }

      // --- 3. Bulk Batch Staggering ---
      if (!isManual) {
        this.consecutiveBulkSentCount++;
        if (this.consecutiveBulkSentCount >= 5) {
          this.consecutiveBulkSentCount = 0;
          const restInterval = Math.floor(Math.random() * 60000) + 60000; // 60s - 120s rest interval
          console.log(`⏳ Anti-Ban Batch Stagger: Sent 5 bulk messages. Resting queue for ${restInterval/1000}s...`);
          await new Promise(r => setTimeout(r, restInterval));
        }
      }

      let dbMediaUrl = mediaUrl;
      let pendingAckPath = null;
      
      if (mediaUrl) {
        const pendingAckDir = path.resolve(__dirname, '..', 'pending_ack');
        if (!fs.existsSync(pendingAckDir)) {
          fs.mkdirSync(pendingAckDir, { recursive: true });
        }
        const ext = path.extname(mediaUrl) || (mediaType === 'document' ? '.pdf' : mediaType === 'video' ? '.mp4' : mediaType === 'image' ? '.jpg' : '.ogg');
        pendingAckPath = path.join(pendingAckDir, `${uuid}${ext}`);
        
        try {
          if (mediaType !== 'audio' && mediaType !== 'voice') {
            if (mediaUrl.startsWith('http')) {
              const fetch = require('node-fetch');
              const res = await fetch(mediaUrl);
              const buffer = await res.buffer();
              fs.writeFileSync(pendingAckPath, buffer);
            } else if (fs.existsSync(mediaUrl)) {
              fs.copyFileSync(mediaUrl, pendingAckPath);
            }
            console.log(`[PENDING_ACK] Saved outgoing media copy to: ${pendingAckPath}`);
          }
        } catch (err) {
          console.error('⚠️ Failed to save pending_ack media file:', err.message);
        }
      }

      try {
        const jid = cleaned + '@s.whatsapp.net';
        
        if (isManual) {
          // Manual 1-on-1 agent chat: Instant priority delivery
          console.log(`⚡ [PRIORITY] Manual agent message to ${cleaned}. No anti-ban delay.`);
          await new Promise(r => setTimeout(r, 300));
        } else if (isActiveChatSession) {
          // --- FIX 1: SMART BACKOFF — Active chat session: 2-3s delay (feels natural, not robotic) ---
          const smartDelay = Math.floor(Math.random() * 1000) + 2000; // 2000-3000ms
          console.log(`⚡ [SMART_BACKOFF] Active chat session for ${cleaned}. Delay: ${(smartDelay/1000).toFixed(1)}s (vs bulk ${this.minDelaySec}-${this.maxDelaySec}s)`);
          await new Promise(r => setTimeout(r, smartDelay));
        } else {
          // Bulk broadcast: Full anti-ban pacing + onWhatsApp registration check
          const minMs = (this.minDelaySec || 5) * 1000;
          const maxMs = (this.maxDelaySec || 15) * 1000;
          const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
          console.log(`⏳ [BULK_THROTTLE] Anti-Ban spacing: ${(delay/1000).toFixed(1)}s before sending to ${cleaned}. Bulk queue: ${this.queue.length}`);
          await new Promise(r => setTimeout(r, delay));

          try {
            const [reg] = await this.sock.onWhatsApp(jid);
            if (!reg?.exists) {
              const reason = `+${cleaned} is not registered on WhatsApp`;
              this._addAuditLog(cleaned, 'Failed', reason);
              resolve({ success: false, error: reason });
              continue;
            }
          } catch(e) {
            console.warn(`⚠️ onWhatsApp check failed/rate-limited for ${cleaned}, proceeding anyway...`);
          }
        }

        // --- 🔒 STABILITY FIX: Early blank-payload guard (catches ALL send paths) ---
        if (!mediaUrl) {
          const earlyCheck = String(message || '').trim();
          if (!earlyCheck) {
            console.error('🚫 BLANK_MSG_BLOCKED: Empty message detected before API call. Skipping.', { phone: cleaned });
            resolve({ success: false, error: 'BLANK_MSG_BLOCKED' });
            continue;
          }
        }

        // 1. Send composing (typing) state to emulate human behavior
        try {
          await this.sock.sendPresenceUpdate('composing', jid);
        } catch (e) {}

        // 2. Character-based typing delay simulation
        // FIX 1: Cap typing delay for active sessions (max 3s) vs bulk (max 15s)
        const charDelay = (message || '').length * 50;
        const jitterFraction = (Math.random() * 0.4) - 0.2; // -20% to +20%
        const jitter = charDelay * jitterFraction;
        const typingCap = (isManual || isActiveChatSession) ? 3000 : 15000;
        const typingFloor = (isManual || isActiveChatSession) ? 500 : 1000;
        const typingDelay = Math.max(typingFloor, Math.min(charDelay + jitter, typingCap));
        console.log(`💬 [TYPING_SIM] ${isActiveChatSession ? 'Active' : 'Bulk'} | ${typingDelay}ms typing delay to ${cleaned}`);
        await new Promise(r => setTimeout(r, typingDelay));

        // 3. Stop composing state
        try {
          await this.sock.sendPresenceUpdate('paused', jid);
        } catch (e) {}

        // =============================================================================
        // FIX 2: ABSOLUTE PAYLOAD GUARD — safeSend() interceptor
        // Ensures ONLY pure {text} or valid media payloads reach the WA API.
        // Personal WA cannot render Business templates — strip all non-text objects.
        // =============================================================================
        const safeSend = async (jid, payload) => {
          // Normalize string payloads to object
          if (typeof payload === 'string') {
            payload = { text: payload };
          }
          // For text-only payloads: hard validation
          if (!payload || typeof payload !== 'object') {
            console.error('[CRITICAL] Blocked null/non-object payload:', payload);
            return null;
          }
          // If it's a text payload (no media key), ensure text is non-empty
          const isTextPayload = !payload.image && !payload.audio && !payload.video && !payload.document;
          if (isTextPayload) {
            const txt = typeof payload.text === 'string' ? payload.text.trim() : '';
            if (!txt) {
              console.error('[CRITICAL] Blocked empty/malformed text payload:', JSON.stringify(payload));
              return null;
            }
            // Force pure text — strip any business template keys
            payload = { text: txt };
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

          // Exponential backoff loop (2s, 4s, 8s - max 3 retries)
          const delays = [2000, 4000, 8000];
          let attempt = 0;
          while (true) {
            try {
              const options = { messageId: uuid };
              return await this.sock.sendMessage(jid, payload, options);
            } catch (err) {
              attempt++;
              if (attempt > 3) {
                throw err;
              }
              const delay = delays[attempt - 1];
              console.warn(`[RETRY] sendMessage failed for ${jid}, retry ${attempt}/3 in ${delay}ms. Error: ${err.message}`);
              await new Promise(r => setTimeout(r, delay));
            }
          }
        };

        let finalMediaType = mediaType;
        if (mediaUrl && !finalMediaType) {
          finalMediaType = 'image';
        }

        let sentMsg;
        if (mediaUrl) {
          if (finalMediaType === 'image') {
            const payload = { image: { url: mediaUrl }, caption: message || '' };
            sentMsg = await safeSend(jid, payload);
          } else if (finalMediaType === 'document') {
            const payload = { 
              document: { url: mediaUrl }, 
              mimetype: 'application/pdf', 
              fileName: fileName || 'document.pdf', 
              caption: message || '' 
            };
            sentMsg = await safeSend(jid, payload);
          } else if (finalMediaType === 'audio' || finalMediaType === 'voice') {
            // ── WhatsApp PTT Voice Note Pipeline ──────────────────────────────
            // WhatsApp mobile ONLY accepts: ogg container + libopus codec + ptt:true
            // Any other format (aac, mp4, webm) shows "This audio is not available".
            // We always transcode through fluent-ffmpeg regardless of input format.

            const absInputPath = path.resolve(mediaUrl);
            let transcodeOutputPath = null;  // track for cleanup
            let finalAudioBuffer;
            let finalMime = 'audio/ogg; codecs=opus';

            // ── Guard: source file must exist ─────────────────────────────────
            if (!fs.existsSync(absInputPath)) {
              console.error(`${FFMPEG_TAG} SOURCE_MISSING path=${absInputPath}`);
              resolve({ success: false, error: '[FFMPEG_ENCODE] Source audio file not found' });
              continue;
            }

            const inputSizeBytes = fs.statSync(absInputPath).size;
            console.log(`${FFMPEG_TAG} INPUT  path=${absInputPath}  size=${inputSizeBytes}B  type=${finalMediaType}`);

            // ── Transcode → ogg/opus ─────────────────────────────────────────
            try {
              const result = await transcodeToOpus(absInputPath);
              transcodeOutputPath = result.outputPath;

              const outStat = fs.statSync(transcodeOutputPath);
              console.log(`${FFMPEG_TAG} OUTPUT path=${transcodeOutputPath}  size=${outStat.size}B  duration=${result.durationSec}s`);

              // Read into buffer so Baileys never accesses the file path directly
              finalAudioBuffer = fs.readFileSync(transcodeOutputPath);

              if (finalAudioBuffer.length < 100) {
                throw new Error(`${FFMPEG_TAG} Output buffer suspiciously small (${finalAudioBuffer.length}B) — transcode likely failed`);
              }
            } catch (transcodeErr) {
              console.error(`${FFMPEG_TAG} TRANSCODE_FAIL  error=${transcodeErr.message}`);
              // Graceful fallback: send raw file as generic audio (may not play on mobile)
              finalAudioBuffer = fs.readFileSync(absInputPath);
              finalMime = 'audio/mp4';  // signal that this is a degraded fallback
              console.warn(`${FFMPEG_TAG} FALLBACK  sending raw file with mime=audio/mp4`);
            }

            // ── Build the Baileys PTT payload ─────────────────────────────────
            // audio: Buffer  ← NOT { url: ... }  (avoids Baileys re-reading from disk)
            // ptt: true       ← renders as voice note waveform on mobile
            // mimetype        ← must match the opus container exactly
            const payload = {
              audio: finalAudioBuffer,
              ptt: true,
              mimetype: finalMime,
            };

            // Save audio VN buffer to pending_ack
            if (pendingAckPath) {
              try {
                fs.writeFileSync(pendingAckPath, finalAudioBuffer);
                console.log(`[PENDING_ACK] Saved audio VN buffer to: ${pendingAckPath}`);
              } catch (err) {
                console.error('⚠️ Failed to save pending_ack voice note:', err.message);
              }
            }

            console.log(`${FFMPEG_TAG} SEND  jid=${jid}  mime=${finalMime}  bufSize=${finalAudioBuffer.length}B  ptt=true`);
            
            try {
              sentMsg = await safeSend(jid, payload);
            } finally {
              // ── Resource cleanup: delete the transcoded temp file in finally block (Pillar 2 compliance) ──
              if (transcodeOutputPath && transcodeOutputPath !== absInputPath) {
                await safeUnlink(transcodeOutputPath);
              }
            }
          } else if (finalMediaType === 'video') {
            const payload = { 
              video: { url: mediaUrl }, 
              mimetype: 'video/mp4', 
              caption: message || '' 
            };
            sentMsg = await safeSend(jid, payload);
          } else {
            sentMsg = await safeSend(jid, { text: String(message) });
          }
        } else {
          // --- 🔒 STABILITY FIX: Strict blank payload guard ---
          const textContent = String(message || '');
          if (!textContent || textContent.trim() === '') {
            console.error('🚫 BLANK_MSG_BLOCKED: Attempted to send empty text message to', cleaned);
            resolve({ success: false, error: 'BLANK_MSG_BLOCKED' });
            continue;
          }
          sentMsg = await safeSend(jid, { text: textContent });
        }

        const messageId = sentMsg?.key?.id || uuid;
        this.hourlyCount++;
        console.log(`✉️ Sent to ${cleaned} (Total this hour: ${this.hourlyCount})`);
        this._addAuditLog(cleaned, 'Sent', '');

        // Record the sent timestamp for anti-ban contact safety limits
        this.contactMessageTimestamps[cleaned] = this.contactMessageTimestamps[cleaned] || [];
        this.contactMessageTimestamps[cleaned].push(Date.now());

        // Session Rotation Simulated rest check
        if (!isManual) {
          this.sentCountInSession++;
          if (this.sentCountInSession >= this.sleepThreshold) {
            this.sentCountInSession = 0;
            this.isSleeping = true;
            this.status = 'SLEEPING';
            this.sleepUntil = Date.now() + 15 * 60 * 1000; // 15 mins sleep
            
            console.log(`💤 Bot instance [${this.tenantId}] triggers mandatory 15-minute simulated human rest.`);
            
            // Update DB status to SLEEPING
            try {
              const { db } = require('../db');
              db.prepare("UPDATE whatsapp_settings SET status = 'SLEEPING'").run();
            } catch(e){}

            setTimeout(() => {
              this.isSleeping = false;
              this.sleepUntil = null;
              this.status = 'CONNECTED';
              try {
                const { db } = require('../db');
                db.prepare("UPDATE whatsapp_settings SET status = 'CONNECTED'").run();
              } catch(e){}
              console.log(`💤 Bot instance [${this.tenantId}] woke up from simulated human rest.`);
              this._processQueue();
            }, 15 * 60 * 1000);
          }
        }

        let dbMessageId = null;
        try {
          const { db } = require('../db');
          const order = db.prepare(`SELECT id, store_id FROM orders WHERE phone LIKE ? AND tenant_id = ? ORDER BY id DESC LIMIT 1`).get(`%${cleaned.substring(cleaned.length - 10)}%`, this.tenantId);
          const orderId = order ? order.id : null;
          const storeId = order ? order.store_id : 1;
          const dbMessageContent = dbMediaUrl ? `[${finalMediaType.toUpperCase()}] ${message}` : message;
          
          // Convert absolute local path to relative path /uploads/... for frontend compatibility
          let finalDbMediaUrl = dbMediaUrl;
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
            console.log(`[DEDUP] Updated existing message ID ${dbMessageId} (originally message_id=${uuid}) with Baileys ID: ${messageId}`);
          } else {
            const result = db.prepare(`
              INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message, message_id, media_url, media_type, status, tenant_id)
              VALUES (?, ?, ?, 'outgoing', ?, ?, ?, ?, 'sent', ?)
            `).run(storeId, orderId, cleaned, dbMessageContent, messageId, finalDbMediaUrl, finalMediaType, this.tenantId);
            dbMessageId = result.lastInsertRowid;
          }

          // Broadcast outgoing message to WebSockets
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
          console.error('⚠️ DB insert failed in _processQueue:', dbErr.message);
        }

        resolve({ success: true });

      } catch (err) {
        const reason = err.message || 'Unknown WhatsApp error';
        console.error('❌ sendMessage error:', reason);
        this._addAuditLog(cleaned || phone, 'Failed', reason);
        
        try {
          const { db } = require('../db');
          const order = db.prepare(`SELECT id, store_id FROM orders WHERE phone LIKE ? AND tenant_id = ? ORDER BY id DESC LIMIT 1`).get(`%${cleaned.substring(cleaned.length - 10)}%`, this.tenantId);
          const orderId = order ? order.id : null;
          const storeId = order ? order.store_id : 1;
          const dbMessageContent = dbMediaUrl ? `[${finalMediaType.toUpperCase()}] ${message}` : message;

          let finalDbMediaUrl = dbMediaUrl;
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
          if (finalDbMediaUrl) {
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

          // Broadcast failure
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
          console.error('Failed to log failed message status in DB:', dbErr.message);
        }

        if (pendingAckPath && fs.existsSync(pendingAckPath)) {
          try {
            fs.unlinkSync(pendingAckPath);
          } catch (e) {}
        }

        resolve({ success: false, error: reason });
      }
    }

    this.isProcessing = false;
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

  // --- 🤝 MODULE 5: HUMAN HANDOFF TOGGLE ---
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

  // --- 💳 MODULE 5: PAYMENT RECEIVED AUTO-REPLY (callable by OCR engine) ---
  triggerPaymentReceivedReply(phone, orderId) {
    const normalized = normalizePhone(phone);
    // --- 🔒 STABILITY FIX: Per-phone concurrency guard (normalized key) ---
    if (this.processingReplies && this.processingReplies.has(normalized)) {
      console.warn(`🔒 CONCURRENT_LOCK: triggerPaymentReceivedReply already processing for ${normalized}. Skipping duplicate.`);
      return;
    }
    if (this.processingReplies) this.processingReplies.add(normalized);

    const msg = `\u2705 *Payment Confirmed!*\n\nThank you! We have received your payment for order *#${orderId}*. Your parcel is being packed and will be dispatched shortly. \ud83d\udce6\n\n_TRACE ERP Auto-Verification System_`;

    // Validate content before sending
    if (!msg || msg.trim() === '') {
      console.error('\ud83d\udeab BLANK_MSG_BLOCKED: triggerPaymentReceivedReply generated empty message');
      if (this.processingReplies) this.processingReplies.delete(normalized);
      return;
    }

    this.sendMessage(phone, msg, true)
      .finally(() => {
        if (this.processingReplies) this.processingReplies.delete(phone);
      });
    console.log(`\ud83d� PAYMENT_RECEIVED auto-reply queued for ${phone} for order #${orderId}`);
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
      queueCount: (this.priorityQueue?.length || 0) + this.queue.length, // total (backward-compat)
      activeChatsCount: this.activeChats?.size || 0,
      hourlyCount: this.hourlyCount,
      maxPerHour: this.maxPerHour,
      minDelaySec: this.minDelaySec,
      maxDelaySec: this.maxDelaySec,
      coolingPeriodMin: this.coolingPeriodMin,
      auditLogs: this.auditLogs
    };
  }

  resetSession() {
    console.log(`🗑️ Manual session reset by admin for tenant [${this.tenantId}]...`);
    this.status = 'DISCONNECTED';
    this.qrCode = null;
    this.reconnectAttempts = 0;
    this.isConnecting = false;
    this._isLoggedOut = false; // Allow reconnect after manual reset

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

    try {
      const sessionPath = this.getSessionPath();
      if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        console.log(`✅ Session directory cleared for tenant [${this.tenantId}]`);
      }
    } catch (e) {
      console.error('⚠️ Clear error:', e.message);
    }

    // Also clear DB-backed session
    clearDbSession();

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

    try {
      const sessionPath = this.getSessionPath();
      if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        console.log(`✅ Session directory cleared on logout for tenant [${this.tenantId}]`);
      }
    } catch (e) {
      console.error('⚠️ Clear session directory error:', e.message);
    }

    // Also clear DB-backed session
    try {
      db.prepare('DELETE FROM wa_session_store').run();
      console.log(`[WA-DB] ✅ Session cleared from DB for tenant [${this.tenantId}]`);
    } catch (e) {
      console.error('[WA-DB] Clear failed:', e.message);
    }
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

    // Trigger connection
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
    
    // Get last 50 unique order phone numbers
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
        
        // Slight delay to avoid hammering WhatsApp API
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
          
          // Check if message already exists
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

  getStatus() {
    // Attempt a live re-read of the active number in case sock.user populated after connect
    let activeNumber = this.activeNumber || null;
    if (!activeNumber && this.status === 'CONNECTED') {
      try {
        const rawId = this.sock?.user?.id || '';
        const digits = rawId.split(':')[0].split('@')[0];
        if (digits) {
          activeNumber = `+${digits}`;
          this.activeNumber = activeNumber; // Cache it
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

// Pre-initialize default bot instance
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

// --- 🔌 MODULE 5: getBot() — allows OCR/STT engines to call bot methods directly ---
module.exports.getBot = function(tenantId) {
  return getBotInstance(tenantId || 'default');
};

