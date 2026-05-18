/**
 * WhatsApp Bot Engine — Powered by Baileys (WebSocket, no Chrome required)
 * Uses dynamic import() because Baileys is ESM-only.
 */

const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');

const SESSION_PATH = path.join(process.cwd(), 'wa_session');
const MAX_RECONNECT_ATTEMPTS = 10;

// Silence Baileys logger
const SILENT_LOGGER = {
  level: 'silent',
  trace: () => {}, debug: () => {}, info: () => {},
  warn: () => {}, error: () => {}, fatal: () => {},
  child() { return SILENT_LOGGER; },
};class WhatsAppBot {
  constructor() {
    this.sock = null;
    this.qrCode = null;
    this.status = 'DISCONNECTED';
    this.reconnectAttempts = 0;
    this.isConnecting = false;
    
    // --- 🛡️ ANTI-BAN THROTTLING SYSTEM ---
    this.queue = [];
    this.isProcessing = false;
    this.hourlyCount = 0;
    this.lastResetTime = Date.now();
    
    // Dynamic governance parameters
    this.isPaused = false;
    this.minDelaySec = 5;
    this.maxDelaySec = 15;
    this.maxPerHour = 60;
    this.coolingPeriodMin = 15;
    this.auditLogs = []; // Buffer of recent delivery audits

    setTimeout(() => this._connect(), 5000);
  }

  async _connect() {
    if (this.isConnecting) return;
    this.isConnecting = true;

    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('❌ Max reconnect attempts reached. Click Reset Session to retry.');
      this.status = 'FAILURE';
      this.isConnecting = false;
      return;
    }

    console.log(`🚀 WhatsApp Bot connecting (attempt ${this.reconnectAttempts + 1})...`);
    this.status = 'CONNECTING';

    try {
      // Dynamic import — Baileys is ESM-only, must use import() not require()
      const {
        default: makeWASocket,
        useMultiFileAuthState,
        DisconnectReason,
        fetchLatestBaileysVersion,
      } = await import('@whiskeysockets/baileys');
      const { Boom } = await import('@hapi/boom');

      if (!this.store) {
        this.store = { messages: {} };
        const storePath = path.join(process.cwd(), 'wa_store.json');
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

      if (!fs.existsSync(SESSION_PATH)) fs.mkdirSync(SESSION_PATH, { recursive: true });

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
          return;
        }

        if (connection === 'close') {
          this.isConnecting = false;
          const err = lastDisconnect?.error;
          const statusCode = err instanceof Boom ? err.output?.statusCode : 0;

          console.warn(`🔌 Connection closed. Code: ${statusCode}`);
          this.status = 'DISCONNECTED';

          if (statusCode === DisconnectReason.loggedOut) {
            console.log('📵 Logged out — clearing session for fresh QR');
            this._wipeCreds();
            this.reconnectAttempts = 0;
          } else {
            this.reconnectAttempts++;
          }

          const delay = Math.min(3000 + this.reconnectAttempts * 2000, 20000);
          console.log(`🔄 Reconnecting in ${delay / 1000}s...`);
          setTimeout(() => this._connect(), delay);
        }
      });

      this.sock.ev.on('messaging-history.set', async ({ chats, messages, isLatest }) => {
        console.log(`📦 WhatsApp History Sync received: ${chats?.length || 0} chats, ${messages?.length || 0} messages`);
        if (messages) {
          for (const msg of messages) {
            if (!msg.message) continue;
            const remoteJid = msg.key?.remoteJid;
            if (!remoteJid || remoteJid.includes('@g.us')) continue;
            if (!this.store.messages[remoteJid]) this.store.messages[remoteJid] = [];
            this.store.messages[remoteJid].push(msg);
          }
        }
      });

      this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const msg of messages) {
          if (!msg.message) continue;
          
          const remoteJid = msg.key?.remoteJid;
          if (!remoteJid || remoteJid.includes('@g.us')) continue; // Skip groups
          
          if (!this.store.messages[remoteJid]) this.store.messages[remoteJid] = [];
          this.store.messages[remoteJid].push(msg);
          if (this.store.messages[remoteJid].length > 100) this.store.messages[remoteJid].shift();

          if (msg.key.fromMe) continue;

          const fromPhone = remoteJid.split('@')[0];
          const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
          if (!text) continue;

          console.log(`💬 Incoming WA Message from ${fromPhone}: ${text}`);

          try {
            const { db } = require('../db');
            const order = db.prepare(`SELECT id, store_id FROM orders WHERE phone LIKE ? ORDER BY id DESC LIMIT 1`).get(`%${fromPhone.substring(fromPhone.length - 10)}%`);
            const orderId = order ? order.id : null;
            const storeId = order ? order.store_id : 1;

            db.prepare(`
              INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message)
              VALUES (?, ?, ?, 'incoming', ?)
            `).run(storeId, orderId, fromPhone, text);

            if (orderId && ['confirm', 'yes', 'haan', 'ji', 'ok', 'verify', 'y'].some(w => text.toLowerCase().includes(w))) {
              db.prepare(`UPDATE orders SET wa_verification_status = 'Verified' WHERE id = ?`).run(orderId);
              console.log(`✅ Auto-verified order #${orderId} via WA reply!`);
            }
          } catch (err) {
            console.error('❌ Error processing incoming WA message:', err.message);
          }
        }
      });

    } catch (err) {
      console.error('❌ _connect() error:', err.message);
      this.status = 'FAILURE';
      this.reconnectAttempts++;
      setTimeout(() => this._connect(), 15000);
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

  async sendMessage(phone, message, isManual = false) {
    // Add to queue instead of sending immediately
    return new Promise((resolve) => {
      this.queue.push({ phone, message, isManual, resolve });
      console.log(`📥 Message queued for ${phone} (Manual: ${isManual}). Queue size: ${this.queue.length}`);
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

      const { phone, message, isManual, resolve } = this.queue.shift();
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

        await this.sock.sendMessage(jid, { text: message });
        this.hourlyCount++;
        console.log(`✉️ Sent to ${cleaned} (Total this hour: ${this.hourlyCount})`);
        this._addAuditLog(cleaned, 'Sent', '');

        try {
          const { db } = require('../db');
          const order = db.prepare(`SELECT id, store_id FROM orders WHERE phone LIKE ? ORDER BY id DESC LIMIT 1`).get(`%${cleaned.substring(cleaned.length - 10)}%`);
          const orderId = order ? order.id : null;
          const storeId = order ? order.store_id : 1;
          db.prepare(`
            INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message)
            VALUES (?, ?, ?, 'outgoing', ?)
          `).run(storeId, orderId, cleaned, message);
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

  setSettings({ minDelaySec, maxDelaySec, maxPerHour, coolingPeriodMin }) {
    if (minDelaySec !== undefined) this.minDelaySec = Number(minDelaySec);
    if (maxDelaySec !== undefined) this.maxDelaySec = Number(maxDelaySec);
    if (maxPerHour !== undefined) this.maxPerHour = Number(maxPerHour);
    if (coolingPeriodMin !== undefined) this.coolingPeriodMin = Number(coolingPeriodMin);
    console.log(`🎛️ Bot pacing updated: ${this.minDelaySec}-${this.maxDelaySec}s delay | max ${this.maxPerHour}/hr | cooling ${this.coolingPeriodMin}m`);
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
    console.log('🗑️ Session reset...');
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
      const text = m.message?.conversation || m.message?.extendedTextMessage?.text || m.message?.buttonsResponseMessage?.selectedDisplayText || m.message?.templateButtonReplyMessage?.selectedDisplayText || '';
      if (!text) return null;
      return {
        id: m.key.id,
        phone: cleaned,
        direction: m.key.fromMe ? 'outgoing' : 'incoming',
        message: text,
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
