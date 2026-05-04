/**
 * WhatsApp Bot Engine — Powered by Baileys (WebSocket, no Chrome required)
 * Drop-in replacement for the old whatsapp-web.js/Puppeteer implementation.
 */

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  isJidUser,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const { Boom } = require('@hapi/boom');

const SESSION_PATH = path.join(process.cwd(), 'wa_session');
const MAX_RECONNECT_ATTEMPTS = 5;

// Silence Baileys' verbose internal logger
const NOOP_LOGGER = {
  level: 'silent',
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  child: () => NOOP_LOGGER,
};

class WhatsAppBot {
  constructor() {
    this.sock = null;
    this.qrCode = null;
    this.status = 'DISCONNECTED';
    this.reconnectAttempts = 0;
    this._connecting = false;

    // Delay first init so server fully boots first
    setTimeout(() => this._initClient(), 6000);
  }

  async _initClient() {
    if (this._connecting) return;
    this._connecting = true;

    console.log(`🚀 Initializing WhatsApp Bot (Baileys, attempt ${this.reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})...`);
    this.status = 'CONNECTING';

    try {
      // Ensure session directory exists
      if (!fs.existsSync(SESSION_PATH)) fs.mkdirSync(SESSION_PATH, { recursive: true });

      const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);
      const { version } = await fetchLatestBaileysVersion();

      console.log(`📦 Using Baileys WA version: ${version.join('.')}`);

      this.sock = makeWASocket({
        version,
        auth: state,
        logger: NOOP_LOGGER,
        printQRInTerminal: false, // We generate our own QR image
        browser: ['TRACE ERP', 'Chrome', '120.0'],
        connectTimeoutMs: 30000,
        retryRequestDelayMs: 2000,
        maxRetries: 3,
      });

      // ─── Save credentials whenever they update ────────────────────────────
      this.sock.ev.on('creds.update', saveCreds);

      // ─── QR Code ─────────────────────────────────────────────────────────
      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          console.log('📸 WhatsApp QR Code generated — awaiting scan');
          try {
            this.qrCode = await qrcode.toDataURL(qr);
            this.status = 'QR_READY';
          } catch (err) {
            console.error('Failed to generate QR image:', err.message);
          }
        }

        if (connection === 'open') {
          console.log('✅ WhatsApp Bot CONNECTED via Baileys!');
          this.status = 'CONNECTED';
          this.qrCode = null;
          this.reconnectAttempts = 0;
          this._connecting = false;
        }

        if (connection === 'close') {
          this._connecting = false;
          const statusCode = (lastDisconnect?.error instanceof Boom)
            ? lastDisconnect.error.output.statusCode
            : 0;

          const isLoggedOut = statusCode === DisconnectReason.loggedOut;

          console.warn(`🔌 WhatsApp disconnected. Code: ${statusCode}, loggedOut: ${isLoggedOut}`);

          if (isLoggedOut) {
            // Session explicitly revoked — clear creds so QR is shown again
            console.log('🗑️ Session was logged out. Clearing creds for fresh QR...');
            this.status = 'DISCONNECTED';
            this._clearSessionFiles();
            this._scheduleReconnect(5000);
          } else {
            // Network blip or server restart — just reconnect
            this.status = 'DISCONNECTED';
            this._scheduleReconnect(8000);
          }
        }
      });

    } catch (err) {
      console.error('❌ Baileys init error:', err.message);
      this.status = 'FAILURE';
      this._connecting = false;
      this._scheduleReconnect(15000);
    }
  }

  _clearSessionFiles() {
    try {
      if (fs.existsSync(SESSION_PATH)) {
        const files = fs.readdirSync(SESSION_PATH);
        // Only remove credential files, not the directory itself
        for (const f of files) {
          if (f.endsWith('.json')) {
            fs.unlinkSync(path.join(SESSION_PATH, f));
          }
        }
        console.log('✅ Session credential files cleared');
      }
    } catch (err) {
      console.error('⚠️ Error clearing session files:', err.message);
    }
  }

  _scheduleReconnect(delayMs = 10000) {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error(`❌ Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Restart the service to retry.`);
      this.status = 'FAILURE';
      return;
    }
    this.reconnectAttempts++;
    console.log(`🔄 Reconnecting WhatsApp in ${delayMs / 1000}s (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);

    // Close existing socket if any
    if (this.sock) {
      try { this.sock.end(undefined); } catch (_) {}
      this.sock = null;
    }

    setTimeout(() => this._initClient(), delayMs);
  }

  async sendMessage(phone, message) {
    if (this.status !== 'CONNECTED' || !this.sock) {
      const reason = `Bot not connected (status: ${this.status})`;
      console.warn(reason);
      return { success: false, error: reason };
    }

    try {
      // Normalize: strip non-digits, ensure 92 country code for Pakistan
      let cleaned = phone.replace(/\D/g, '');
      if (cleaned.startsWith('0')) {
        cleaned = '92' + cleaned.substring(1);
      } else if (!cleaned.startsWith('92') && cleaned.length === 10) {
        cleaned = '92' + cleaned;
      }

      const jid = cleaned + '@s.whatsapp.net'; // Baileys uses @s.whatsapp.net
      console.log(`📱 Checking if ${cleaned} is on WhatsApp...`);

      // Verify number is registered on WhatsApp
      const [result] = await this.sock.onWhatsApp(jid);
      if (!result?.exists) {
        const reason = `+${cleaned} is not registered on WhatsApp`;
        console.warn(`⚠️ ${reason}`);
        return { success: false, error: reason };
      }

      console.log(`✉️ Sending message to ${cleaned}...`);
      await this.sock.sendMessage(jid, { text: message });
      console.log(`✅ Message sent to ${cleaned}`);
      return { success: true };

    } catch (err) {
      const reason = err.message || 'Unknown WhatsApp error';
      console.error(`❌ sendMessage failed:`, reason);
      return { success: false, error: reason };
    }
  }

  async resetSession() {
    console.log('🗑️ Full session reset requested...');
    this.status = 'DISCONNECTED';
    this.qrCode = null;
    this.reconnectAttempts = 0;
    this._connecting = false;

    // Close socket
    if (this.sock) {
      try { await this.sock.logout().catch(() => {}); } catch (_) {}
      try { this.sock.end(undefined); } catch (_) {}
      this.sock = null;
    }

    // Wipe entire session folder for clean slate
    try {
      if (fs.existsSync(SESSION_PATH)) {
        fs.rmSync(SESSION_PATH, { recursive: true, force: true });
        console.log('✅ wa_session directory cleared');
      }
    } catch (err) {
      console.error('⚠️ Failed to clear session dir:', err.message);
    }

    setTimeout(() => this._initClient(), 3000);
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

// Singleton instance
const bot = new WhatsAppBot();
module.exports = bot;
