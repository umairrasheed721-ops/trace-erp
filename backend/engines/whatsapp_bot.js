/**
 * WhatsApp Bot Engine — Powered by Baileys (WebSocket, no Chrome required)
 * Uses dynamic import() because Baileys is ESM-only.
 */

const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const { db } = require('../db');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'trace_erp.db');
const dbDir = path.dirname(path.resolve(dbPath));
const SESSION_PATH = path.join(dbDir, 'wa_session');

if (!fs.existsSync(SESSION_PATH)) {
  fs.mkdirSync(SESSION_PATH, { recursive: true });
}

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
    const folderPath = path.join(__dirname, '..', 'public', 'uploads');
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

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

    const fileName = `media_${msg.key.id}.${ext}`;
    const filePath = path.join(folderPath, fileName);

    // If file already exists, don't download it again
    if (fs.existsSync(filePath)) {
      return `/uploads/${fileName}`;
    }

    console.log(`📥 Downloading media for message ${msg.key.id} (${mediaDetails.mimeType})...`);
    const buffer = await downloadMediaMessage(
      msg,
      'buffer',
      {},
      { logger: SILENT_LOGGER }
    );

    if (buffer) {
      fs.writeFileSync(filePath, buffer);
      return `/uploads/${fileName}`;
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

class WhatsAppBot {
  constructor() {
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
    
    // Dynamic governance parameters
    this.isPaused = false;
    this.minDelaySec = 5;
    this.maxDelaySec = 15;
    this.maxPerHour = 60;
    this.coolingPeriodMin = 15;
    this.auditLogs = []; // Buffer of recent delivery audits

    // Prevent local dev from running the bot unless explicitly enabled
    if (process.env.NODE_ENV !== 'production' && process.env.BOT_ENABLED !== 'true') {
      console.log('🛑 WhatsApp Bot disabled in local dev to prevent message stealing. Set BOT_ENABLED=true to force.');
      this.status = 'DISABLED';
      return;
    }

    setTimeout(() => this._connect(), 5000);
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
      const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);

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

      this.sock.ev.on('messages.upsert', async (m) => {
        console.log("========================================");
        console.log("🚨 [RAW INCOMING BAILEYS EVENT DETECTED]");
        console.log(JSON.stringify(m, null, 2));
        console.log("========================================");
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
          const text = getMessageText(msg);
          const mediaDetails = getMessageMediaDetails(msg);
          // Don't drop immediately; if both are missing, we still want to log/route it to see if it's a hidden protocol message.
          if (!text && !mediaDetails && !msg.message) continue;

          const isOutgoing = msg.key.fromMe;
          
          // Download media if present
          let mediaUrl = null;
          let mediaType = null;
          if (mediaDetails) {
            try {
              const { downloadMediaMessage } = await import('@whiskeysockets/baileys');
              mediaType = mediaDetails.type;
              mediaUrl = await saveMediaFile(msg, mediaDetails, downloadMediaMessage);
            } catch (mediaErr) {
              console.error('⚠️ Media download error in messages.upsert:', mediaErr.message);
            }
          }

          const finalMessage = text || (mediaType ? `[${mediaType.toUpperCase()}]` : '[Unsupported Message Format]');

          const { db } = require('../db');
          // Robust order routing: match customer even if DB has spaces/dashes like "0303 4070 779"
          const order = db.prepare(`SELECT id, store_id FROM orders WHERE REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ? ORDER BY id DESC LIMIT 1`).get(`%${fromPhone.substring(Math.max(0, fromPhone.length - 10))}%`);
          const orderId = order ? order.id : null;
          const storeId = order ? order.store_id : 1;

          let dbMessageId = null;
          try {
            const result = db.prepare(`
              INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message, message_id, media_url, media_type, status)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'sent')
              ON CONFLICT(message_id) DO NOTHING
            `).run(storeId, orderId, fromPhone, isOutgoing ? 'outgoing' : 'incoming', finalMessage, msg.key.id, mediaUrl, mediaType);
            dbMessageId = result.lastInsertRowid;
          } catch (dbErr) {
            console.error('⚠️ DB Insert Failed for incoming message:', dbErr.message);
          }

          // Broadcast new message via WebSocket to active agents in real-time
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
                created_at: new Date().toISOString()
              }
            });
          } catch (e) {}

          if (isOutgoing) {
            // Human agent manually sent a message: Pause bot replies for 30 minutes for this contact
            this.humanCooldowns[fromPhone] = Date.now();
            console.log(`👤 Human manual message detected for ${fromPhone}. Bot auto-replies paused for 30 mins.`);
            continue;
          }

          console.log(`💬 Incoming WA Message from ${fromPhone}: ${text}`);

          // Check if contact is under active human manual override cooldown
          const lastHumanMsg = this.humanCooldowns[fromPhone];
          if (lastHumanMsg && (Date.now() - lastHumanMsg) < 30 * 60 * 1000) {
            console.log(`⏳ Skipping bot auto-reply for ${fromPhone} due to active human manual override.`);
            continue;
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

            // --- 🧠 GEMINI AUTONOMOUS AI ORCHESTRATION ---
            const { generateAIResponse } = require('./gemini_engine');
            const geminiReply = await generateAIResponse(fromPhone, text);
            if (geminiReply) {
              this.sendMessage(fromPhone, geminiReply, true);
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

                  this.sendMessage(fromPhone, reply, true);
                  console.log(`🤖 AI Fallback: Sent Tracking Intent reply to ${fromPhone}`);
                }
                // 3. Landmark Intent
                else if (['near', 'opposite', 'beside', 'gali', 'house', 'makan', 'street', 'landmark', 'ke paas', 'samne'].some(w => lowerText.includes(w))) {
                  db.prepare(`UPDATE orders SET cs_notes = IFNULL(cs_notes, '') || ' [WA Landmark: ' || ? || ']' WHERE id = ?`).run(text, orderId);
                  
                  let reply = (settings.ai_landmark_template || '🤖 [TRACE Support] Shukriya! Aapka nearest landmark ({landmark}) record kar liya gaya hai aur rider ko update kar diya gaya hai.')
                    .replace(/\{landmark\}/g, text);

                  this.sendMessage(fromPhone, reply, true);
                  console.log(`🤖 AI Fallback: Sent Landmark Intent reply to ${fromPhone}`);
                }
                // 4. General fallback message when they have an order but the intent is not recognized
                else {
                  const customerName = order.customer_name || 'Customer';
                  const reply = `🤖 [TRACE Support] Hi *${customerName}*! Humare system mein aapka order exist karta hai. Agar aap apna parcel track karna chahte hain, toh reply mein *'kahan hai'* ya *'status'* likh kar bhejein. Shukriya!`;
                  this.sendMessage(fromPhone, reply, true);
                  console.log(`🤖 AI Fallback: Sent general order holder message to ${fromPhone}`);
                }
              }
            } else {
              // The phone number does not have any order in the database (e.g. general query, new customer, or test number)
              // 1. Check if they asked for tracking anyway
              if (['kahan', 'tracking', 'status', 'kab aayega', 'parcel', 'where is', 'track'].some(w => lowerText.includes(w))) {
                const reply = `🤖 [TRACE Support] Aapka phone number humare system mein kisi active order se register nahi mila. Agar aapne order kiya hai, toh kindly humein apna *order number* (e.g. TR12345) message karein taake hum update check kar sakein.`;
                this.sendMessage(fromPhone, reply, true);
                console.log(`🤖 AI Fallback: Sent tracking request message to non-order holder ${fromPhone}`);
              } else {
                // 2. Generic greeting / helper fallback
                const reply = `🤖 [TRACE Support] Salam! Aapka message received ho gaya hai. Humare system mein is number se koi current order exist nahi karta. Agar aap new order place karna chahte hain ya agent se baat karna chahte hain, toh apna query reply karein. Humara customer support representative jald hi aapse raabta karega.`;
                this.sendMessage(fromPhone, reply, true);
                console.log(`🤖 AI Fallback: Sent general help reply to non-order holder ${fromPhone}`);
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
      if (fs.existsSync(SESSION_PATH)) {
        const files = fs.readdirSync(SESSION_PATH);
        for (const f of files) {
          if (f.endsWith('.json')) fs.unlinkSync(path.join(SESSION_PATH, f));
        }
        console.log('✅ Session creds wiped');
      }
    } catch (e) {
      console.error('⚠️ Failed to wipe creds:', e.message);
    }
  }

  async sendMessage(phone, message, isManual = false, mediaUrl = null, mediaType = null, fileName = null) {
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

    // Add to queue instead of sending immediately
    return new Promise((resolve) => {
      this.queue.push({ phone, message, isManual, mediaUrl, mediaType, fileName, resolve });
      console.log(`📥 Message queued for ${phone} (Manual: ${isManual}, Media: ${!!mediaUrl}). Queue size: ${this.queue.length}`);
      this._processQueue();
    });
  }

  async _processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    if (this.status !== 'CONNECTED') {
      console.warn('⏳ Queue paused: Bot not connected');
      return;
    }
    if (this.isPaused) {
      console.warn('⏳ Queue paused by Master Emergency Switch');
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0 && !this.isPaused) {
      // 1. Check Hourly Limit
      const now = Date.now();
      if (now - this.lastResetTime > 3600000) {
        this.hourlyCount = 0;
        this.lastResetTime = now;
      }

      if (this.hourlyCount >= this.maxPerHour) {
        console.warn(`🛑 Hourly limit (${this.maxPerHour}) reached. Throttling for ${this.coolingPeriodMin} minutes...`);
        await new Promise(r => setTimeout(r, this.coolingPeriodMin * 60000));
        this.hourlyCount = 0; // Reset after wait
        this.lastResetTime = Date.now();
      }

      const { phone, message, isManual, mediaUrl, mediaType, fileName, resolve } = this.queue.shift();
      let cleaned = phone.replace(/\D/g, '');

      try {
        if (cleaned.startsWith('0')) cleaned = '92' + cleaned.substring(1);
        else if (!cleaned.startsWith('92') && cleaned.length === 10) cleaned = '92' + cleaned;

        const jid = cleaned + '@s.whatsapp.net';
        
        if (isManual) {
          // Manual 1-on-1 agent chat: Instant priority delivery, bypass bulk anti-ban delay & flaky onWhatsApp check
          console.log(`⚡ Manual Agent Chat: Instant priority delivery to ${cleaned}...`);
          await new Promise(r => setTimeout(r, 500));
        } else {
          // Bulk marketing alert: Use dynamic anti-ban pacing & onWhatsApp verification
          const minMs = this.minDelaySec * 1000;
          const maxMs = this.maxDelaySec * 1000;
          const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
          console.log(`⏳ Anti-Ban: Waiting ${delay/1000}s before sending bulk alert to ${cleaned}...`);
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

        // 1. Send composing (typing) state to emulate human behavior
        try {
          await this.sock.sendPresenceUpdate('composing', jid);
        } catch (e) {}

        // 2. Character-based typing delay simulation (30ms per char + random base, max 6s)
        const typingDelay = Math.min((message.length * 30) + (Math.floor(Math.random() * 1000) + 500), 6000);
        console.log(`💬 Simulating typing for ${typingDelay}ms to ${cleaned}...`);
        await new Promise(r => setTimeout(r, typingDelay));

        // 3. Stop composing state
        try {
          await this.sock.sendPresenceUpdate('paused', jid);
        } catch (e) {}

        let finalMediaType = mediaType;
        if (mediaUrl && !finalMediaType) {
          finalMediaType = 'image';
        }

        let sentMsg;
        if (mediaUrl) {
          if (finalMediaType === 'image') {
            sentMsg = await this.sock.sendMessage(jid, { image: { url: mediaUrl }, caption: message });
          } else if (finalMediaType === 'document') {
            sentMsg = await this.sock.sendMessage(jid, { 
              document: { url: mediaUrl }, 
              mimetype: 'application/pdf', 
              fileName: fileName || 'document.pdf', 
              caption: message 
            });
          } else if (finalMediaType === 'audio' || finalMediaType === 'voice') {
            sentMsg = await this.sock.sendMessage(jid, { 
              audio: { url: mediaUrl }, 
              mimetype: 'audio/mp4', 
              ptt: true 
            });
          } else if (finalMediaType === 'video') {
            sentMsg = await this.sock.sendMessage(jid, { 
              video: { url: mediaUrl }, 
              mimetype: 'video/mp4', 
              caption: message 
            });
          } else {
            sentMsg = await this.sock.sendMessage(jid, { text: message });
          }
        } else {
          sentMsg = await this.sock.sendMessage(jid, { text: message });
        }

        const messageId = sentMsg?.key?.id || 'out_' + Date.now();
        this.hourlyCount++;
        console.log(`✉️ Sent to ${cleaned} (Total this hour: ${this.hourlyCount})`);
        this._addAuditLog(cleaned, 'Sent', '');

        let dbMessageId = null;
        try {
          const { db } = require('../db');
          const order = db.prepare(`SELECT id, store_id FROM orders WHERE phone LIKE ? ORDER BY id DESC LIMIT 1`).get(`%${cleaned.substring(cleaned.length - 10)}%`);
          const orderId = order ? order.id : null;
          const storeId = order ? order.store_id : 1;
          const dbMessageContent = mediaUrl ? `[${finalMediaType.toUpperCase()}] ${message}` : message;
          
          try {
            const result = db.prepare(`
              INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message, message_id, media_url, media_type)
              VALUES (?, ?, ?, 'outgoing', ?, ?, ?, ?)
            `).run(storeId, orderId, cleaned, dbMessageContent, messageId, mediaUrl, finalMediaType);
            dbMessageId = result.lastInsertRowid;
          } catch (dbErr) {
            console.error('⚠️ DB insert failed in _processQueue:', dbErr.message);
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
                media_url: mediaUrl,
                media_type: finalMediaType,
                status: 'sent',
                created_at: new Date().toISOString()
              }
            });
          } catch (e) {}
        } catch (dbErr) {}

        resolve({ success: true });

      } catch (err) {
        const reason = err.message || 'Unknown WhatsApp error';
        console.error('❌ sendMessage error:', reason);
        this._addAuditLog(cleaned || phone, 'Failed', reason);
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
    const count = this.queue.length;
    this.queue = [];
    console.log(`🗑️ Cleared ${count} queued messages.`);
    return count;
  }

  getQueueDetails() {
    return {
      isPaused: this.isPaused,
      queueCount: this.queue.length,
      hourlyCount: this.hourlyCount,
      maxPerHour: this.maxPerHour,
      minDelaySec: this.minDelaySec,
      maxDelaySec: this.maxDelaySec,
      coolingPeriodMin: this.coolingPeriodMin,
      auditLogs: this.auditLogs
    };
  }

  resetSession() {
    console.log('🗑️ Manual session reset by admin...');
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
      if (fs.existsSync(SESSION_PATH)) {
        fs.rmSync(SESSION_PATH, { recursive: true, force: true });
        console.log('✅ Session directory cleared');
      }
    } catch (e) {
      console.error('⚠️ Clear error:', e.message);
    }

    // Also clear DB-backed session
    clearDbSession();

    setTimeout(() => this._connect(), 2000);
    return true;
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
    return {
      status: this.status,
      qrCode: this.qrCode,
      reconnectAttempts: this.reconnectAttempts,
    };
  }
}

const bot = new WhatsAppBot();
module.exports = bot;
