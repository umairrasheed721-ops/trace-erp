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
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('❌ Max reconnect attempts reached. Click Reset Session to retry.');
      this.status = 'FAILURE';
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
          return;
        }

        if (connection === 'close') {
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

      this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const msg of messages) {
          if (!msg.message || msg.key.fromMe) continue;
          
          const remoteJid = msg.key.remoteJid;
          if (!remoteJid || remoteJid.includes('@g.us')) continue; // Skip groups
          
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

  async sendMessage(phone, message) {
    // Add to queue instead of sending immediately
    return new Promise((resolve) => {
      this.queue.push({ phone, message, resolve });
      console.log(`📥 Message queued for ${phone}. Queue size: ${this.queue.length}`);
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

      const { phone, message, resolve } = this.queue.shift();
      let cleaned = phone.replace(/\D/g, '');

      try {
        if (cleaned.startsWith('0')) cleaned = '92' + cleaned.substring(1);
        else if (!cleaned.startsWith('92') && cleaned.length === 10) cleaned = '92' + cleaned;

        const jid = cleaned + '@s.whatsapp.net';
        
        // 2. Anti-Ban Human Delay (Dynamic range)
        const minMs = this.minDelaySec * 1000;
        const maxMs = this.maxDelaySec * 1000;
        const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
        console.log(`⏳ Anti-Ban: Waiting ${delay/1000}s before sending to ${cleaned}...`);
        await new Promise(r => setTimeout(r, delay));

        const [reg] = await this.sock.onWhatsApp(jid);
        if (!reg?.exists) {
          const reason = `+${cleaned} is not registered on WhatsApp`;
          this._addAuditLog(cleaned, 'Failed', reason);
          resolve({ success: false, error: reason });
          continue;
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
        } catch (dbErr) {
          console.error('❌ Error logging outgoing WA message to DB:', dbErr.message);
        }

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

    const oldSock = this.sock;
    this.sock = null;
    if (oldSock) {
      try { oldSock.end(new Error('reset')); } catch (_) {}
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
