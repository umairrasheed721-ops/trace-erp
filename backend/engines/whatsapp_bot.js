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
};

class WhatsAppBot {
  constructor() {
    this.sock = null;
    this.qrCode = null;
    this.status = 'DISCONNECTED';
    this.reconnectAttempts = 0;

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
    if (this.status !== 'CONNECTED' || !this.sock) {
      const reason = `Bot not connected (status: ${this.status})`;
      console.warn(reason);
      return { success: false, error: reason };
    }

    try {
      let cleaned = phone.replace(/\D/g, '');
      if (cleaned.startsWith('0')) cleaned = '92' + cleaned.substring(1);
      else if (!cleaned.startsWith('92') && cleaned.length === 10) cleaned = '92' + cleaned;

      const jid = cleaned + '@s.whatsapp.net';
      console.log(`📱 Checking ${cleaned} on WhatsApp...`);

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
      console.error('❌ sendMessage error:', reason);
      return { success: false, error: reason };
    }
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
