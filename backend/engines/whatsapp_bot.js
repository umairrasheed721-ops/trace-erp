/**
 * WhatsApp Bot Engine — Powered by Baileys (WebSocket, no Chrome required)
 * Uses the canonical Baileys reconnect pattern to avoid race conditions during QR auth.
 */

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const { Boom } = require('@hapi/boom');

const SESSION_PATH = path.join(process.cwd(), 'wa_session');
const MAX_RECONNECT_ATTEMPTS = 10;

// Silence Baileys' verbose internal logger
const SILENT_LOGGER = {
  level: 'silent',
  trace: () => {}, debug: () => {}, info: () => {},
  warn: () => {}, error: () => {}, fatal: () => {},
  child() { return SILENT_LOGGER; },
};

class WhatsAppBot {
  constructor() {
    this.sock = null;
    this.qrCode = null;
    this.status = 'DISCONNECTED';
    this.reconnectAttempts = 0;
    this._authState = null;
    this._saveCreds = null;

    // Delay first init so server fully boots
    setTimeout(() => this._connect(), 5000);
  }

  // ─── Core connect loop (canonical Baileys pattern) ─────────────────────────
  async _connect() {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error(`❌ Max reconnect attempts reached. Click Reset Session to retry.`);
      this.status = 'FAILURE';
      return;
    }

    console.log(`🚀 WhatsApp Bot connecting (attempt ${this.reconnectAttempts + 1})...`);
    this.status = 'CONNECTING';

    try {
      if (!fs.existsSync(SESSION_PATH)) fs.mkdirSync(SESSION_PATH, { recursive: true });

      // Load (or create) auth state from disk
      const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);
      this._saveCreds = saveCreds;

      // Fetch latest WA version — fallback to known-good if it fails
      let version;
      try {
        const result = await fetchLatestBaileysVersion();
        version = result.version;
        console.log(`📦 WA version: ${version.join('.')}`);
      } catch (_) {
        version = [2, 3000, 1023209842]; // last known good
        console.warn(`⚠️ Could not fetch latest WA version, using fallback ${version.join('.')}`);
      }

      this.sock = makeWASocket({
        version,
        auth: state,
        logger: SILENT_LOGGER,
        printQRInTerminal: false,
        browser: ['TRACE ERP', 'Chrome', '120.0'],
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        retryRequestDelayMs: 250,
        maxRetries: 5,
        getMessage: async () => ({ conversation: '' }), // prevent message fetch errors
      });

      // Save credentials whenever updated (critical for session persistence)
      this.sock.ev.on('creds.update', saveCreds);

      // ─── QR + Connection events ─────────────────────────────────────────────
      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          console.log('📸 QR Code ready — waiting for scan');
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
          this.reconnectAttempts = 0; // reset on success
          return;
        }

        if (connection === 'close') {
          const err = lastDisconnect?.error;
          const statusCode = err instanceof Boom ? err.output?.statusCode : 0;
          const reason = DisconnectReason;

          console.warn(`🔌 Connection closed. Code: ${statusCode}`);

          if (statusCode === reason.loggedOut) {
            // Deliberately unlinked from phone — wipe creds, show fresh QR
            console.log('📵 Logged out — clearing session for fresh QR');
            this.status = 'DISCONNECTED';
            this._wipeCreds();
            this.reconnectAttempts = 0;
            setTimeout(() => this._connect(), 3000);
            return;
          }

          if (statusCode === reason.connectionReplaced) {
            // Another device opened the same session
            console.warn('⚠️ Connection replaced by another session');
            this.status = 'DISCONNECTED';
            setTimeout(() => this._connect(), 5000);
            return;
          }

          // Any other disconnect — just reconnect (network blip, restart, QR phase close, etc.)
          this.status = 'DISCONNECTED';
          this.reconnectAttempts++;
          const delay = Math.min(3000 + this.reconnectAttempts * 2000, 20000);
          console.log(`🔄 Reconnecting in ${delay / 1000}s...`);
          setTimeout(() => this._connect(), delay);
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

  // ─── Public API ─────────────────────────────────────────────────────────────

  async sendMessage(phone, message) {
    if (this.status !== 'CONNECTED' || !this.sock) {
      const reason = `Bot not connected (status: ${this.status})`;
      console.warn(reason);
      return { success: false, error: reason };
    }

    try {
      // Normalize to E.164 Pakistan format
      let cleaned = phone.replace(/\D/g, '');
      if (cleaned.startsWith('0')) cleaned = '92' + cleaned.substring(1);
      else if (!cleaned.startsWith('92') && cleaned.length === 10) cleaned = '92' + cleaned;

      const jid = cleaned + '@s.whatsapp.net';
      console.log(`📱 Verifying ${cleaned} on WhatsApp...`);

      const [reg] = await this.sock.onWhatsApp(jid);
      if (!reg?.exists) {
        const reason = `+${cleaned} is not registered on WhatsApp`;
        console.warn(`⚠️ ${reason}`);
        return { success: false, error: reason };
      }

      await this.sock.sendMessage(jid, { text: message });
      console.log(`✉️ Sent to ${cleaned}`);
      return { success: true };

    } catch (err) {
      const reason = err.message || 'Unknown WhatsApp error';
      console.error(`❌ sendMessage error:`, reason);
      return { success: false, error: reason };
    }
  }

  async resetSession() {
    console.log('🗑️ Full session reset...');
    this.status = 'DISCONNECTED';
    this.qrCode = null;
    this.reconnectAttempts = 0;

    if (this.sock) {
      try { await this.sock.logout().catch(() => {}); } catch (_) {}
      this.sock = null;
    }

    // Wipe everything
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
