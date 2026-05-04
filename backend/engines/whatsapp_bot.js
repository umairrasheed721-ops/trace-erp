const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const SESSION_PATH = path.join(process.cwd(), 'wa_session');

// Detect the best Chromium executable available on this system (local or Railway/Nix)
function detectChromePath() {
  // 1. Explicit env override always wins
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    console.log(`🔍 Using PUPPETEER_EXECUTABLE_PATH: ${process.env.PUPPETEER_EXECUTABLE_PATH}`);
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  // 2. Use 'which' — handles Nix dynamic paths like /nix/store/xxx-chromium/bin/chromium
  const whichTargets = ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable'];
  for (const bin of whichTargets) {
    try {
      const found = execSync(`which ${bin} 2>/dev/null`, { timeout: 3000 }).toString().trim();
      if (found) {
        console.log(`✅ Found Chrome via 'which ${bin}': ${found}`);
        return found;
      }
    } catch (_) {}
  }

  // 3. Common static paths as fallback
  const candidates = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/run/current-system/sw/bin/chromium',
    '/nix/var/nix/profiles/default/bin/chromium',
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        console.log(`✅ Found Chrome at static path: ${p}`);
        return p;
      }
    } catch (_) {}
  }

  // 4. Log PATH to help debug, then let Puppeteer attempt bundled Chrome
  try {
    const pathEnv = execSync('echo $PATH', { timeout: 2000 }).toString().trim();
    console.warn(`⚠️ No system Chromium found. Current PATH: ${pathEnv}`);
  } catch (_) {
    console.warn('⚠️ No system Chromium found — Puppeteer will use bundled Chrome (will likely fail on Railway).');
  }
  return null;
}

const CHROME_PATH = detectChromePath();
const MAX_RECONNECT_ATTEMPTS = 5;

class WhatsAppBot {
  constructor() {
    this.client = null;
    this.qrCode = null;
    this.status = 'DISCONNECTED'; // DISCONNECTED, CONNECTING, QR_READY, CONNECTED, FAILURE
    this.reconnectAttempts = 0;
    this.initTimeout = null;
    // Delay startup so the server fully boots first
    this.initTimeout = setTimeout(() => this._initClient(), 8000);
  }

  _buildClient() {
    return new Client({
      authStrategy: new LocalAuth({
        dataPath: path.join(process.cwd(), 'wa_session')
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--disable-gpu',
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-default-apps',
          '--mute-audio',
          '--hide-scrollbars',
          '--shm-size=256mb',
        ],
        ...(CHROME_PATH ? { executablePath: CHROME_PATH } : {})
      }
    });
  }

  _initClient() {
    console.log(`🚀 Initializing WhatsApp Bot (attempt ${this.reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})...`);
    this.status = 'CONNECTING';

    try {
      this.client = this._buildClient();
    } catch (buildErr) {
      console.error('❌ Failed to build WhatsApp client:', buildErr.message);
      this.status = 'FAILURE';
      return;
    }

    this.client.on('qr', async (qr) => {
      console.log('📸 WhatsApp QR Code Generated — scan with your phone');
      try {
        this.qrCode = await qrcode.toDataURL(qr);
        this.status = 'QR_READY';
      } catch (err) {
        console.error('Failed to generate QR DataURL', err);
      }
    });

    this.client.on('ready', () => {
      console.log('✅ WhatsApp Bot is READY and CONNECTED!');
      this.status = 'CONNECTED';
      this.qrCode = null;
      this.reconnectAttempts = 0; // Reset on successful connect
    });

    this.client.on('authenticated', () => {
      console.log('🔓 WhatsApp session authenticated successfully');
    });

    this.client.on('auth_failure', (msg) => {
      console.error('❌ WhatsApp Auth Failure:', msg);
      this.status = 'FAILURE';
      // Clear broken session and retry so a fresh QR is shown
      this._scheduleReconnect(15000);
    });

    this.client.on('disconnected', (reason) => {
      console.warn(`🔌 WhatsApp Disconnected: ${reason}`);
      this.status = 'DISCONNECTED';
      this._scheduleReconnect(10000);
    });

    // Kick off the actual browser launch
    this.client.initialize().catch(err => {
      console.error('❌ WhatsApp client.initialize() failed:', err.message);
      this.status = 'FAILURE';
      this._scheduleReconnect(20000);
    });
  }

  _scheduleReconnect(delayMs = 10000) {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error(`❌ Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Giving up. Restart the service to retry.`);
      this.status = 'FAILURE';
      return;
    }
    this.reconnectAttempts++;
    console.log(`🔄 Reconnecting WhatsApp in ${delayMs / 1000}s (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);

    // Safely destroy old client before reinit
    if (this.client) {
      try { this.client.destroy().catch(() => {}); } catch (_) {}
      this.client = null;
    }

    setTimeout(() => this._initClient(), delayMs);
  }

  async sendMessage(phone, message) {
    if (this.status !== 'CONNECTED') {
      const reason = `Bot not connected (status: ${this.status})`;
      console.warn(reason);
      return { success: false, error: reason };
    }
    try {
      // Normalize phone: strip non-digits, ensure 92 country code
      let cleaned = phone.replace(/\D/g, '');
      if (cleaned.startsWith('0')) {
        cleaned = '92' + cleaned.substring(1);
      } else if (!cleaned.startsWith('92') && cleaned.length === 10) {
        cleaned = '92' + cleaned;
      }

      console.log(`📱 Attempting to send to: ${cleaned}@c.us`);

      // Check if the number is registered on WhatsApp
      const isRegistered = await this.client.isRegisteredUser(cleaned + '@c.us');
      if (!isRegistered) {
        const reason = `+${cleaned} is not a registered WhatsApp number`;
        console.warn(`⚠️ ${reason}`);
        return { success: false, error: reason };
      }

      await this.client.sendMessage(cleaned + '@c.us', message);
      console.log(`✉️ Message sent to ${cleaned}`);
      return { success: true };
    } catch (err) {
      const reason = err.message || 'Unknown WhatsApp client error';
      console.error(`❌ sendMessage failed for ${phone}:`, reason);
      return { success: false, error: reason };
    }
  }

  async resetSession() {
    console.log('🗑️ Resetting WhatsApp session...');
    this.status = 'DISCONNECTED';
    this.qrCode = null;
    this.reconnectAttempts = 0;

    // 1. Destroy existing client
    if (this.client) {
      try {
        await this.client.logout().catch(() => {});
        await this.client.destroy().catch(() => {});
      } catch (_) {}
      this.client = null;
    }

    // 2. Wipe the session folder so a fresh QR is generated
    try {
      if (fs.existsSync(SESSION_PATH)) {
        fs.rmSync(SESSION_PATH, { recursive: true, force: true });
        console.log('✅ wa_session directory cleared');
      }
    } catch (err) {
      console.error('⚠️ Failed to clear session dir:', err.message);
    }

    // 3. Re-initialize after a short pause
    setTimeout(() => this._initClient(), 3000);
    return true;
  }

  getStatus() {
    return {
      status: this.status,
      qrCode: this.qrCode,
      reconnectAttempts: this.reconnectAttempts
    };
  }
}

// Singleton instance
const bot = new WhatsAppBot();
module.exports = bot;
