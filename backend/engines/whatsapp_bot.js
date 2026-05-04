const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const path = require('path');

class WhatsAppBot {
  constructor() {
    this.client = null;
    this.qrCode = null;
    this.status = 'DISCONNECTED'; // DISCONNECTED, CONNECTING, QR_READY, CONNECTED, FAILURE
    this.init();
  }

  init() {
    console.log('🚀 Initializing WhatsApp Bot Engine...');
    
    this.client = new Client({
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
          '--no-zygote',
          '--single-process',
          '--disable-gpu'
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null
      }
    });

    this.client.on('qr', async (qr) => {
      console.log('📸 WhatsApp QR Code Generated');
      try {
        this.qrCode = await qrcode.toDataURL(qr);
        this.status = 'QR_READY';
      } catch (err) {
        console.error('Failed to generate QR DataURL', err);
      }
    });

    this.client.on('ready', () => {
      console.log('✅ WhatsApp Bot is READY!');
      this.status = 'CONNECTED';
      this.qrCode = null;
    });

    this.client.on('authenticated', () => {
      console.log('🔓 WhatsApp Authenticated');
      this.status = 'CONNECTED';
    });

    this.client.on('auth_failure', (msg) => {
      console.error('❌ WhatsApp Auth Failure', msg);
      this.status = 'FAILURE';
    });

    this.client.on('disconnected', (reason) => {
      console.log('🔌 WhatsApp Disconnected', reason);
      this.status = 'DISCONNECTED';
      // Auto-reinit
      this.client.initialize();
    });

    this.client.initialize().catch(err => {
      console.error('Failed to initialize WA client', err);
    });
  }

  async sendMessage(phone, message) {
    if (this.status !== 'CONNECTED') {
      console.warn('Cannot send message: Bot not connected');
      return false;
    }
    try {
      // Clean phone number: remove non-digits, ensure 92 prefix
      let cleaned = phone.replace(/\D/g, '');
      if (cleaned.startsWith('0')) {
        cleaned = '92' + cleaned.substring(1);
      } else if (!cleaned.startsWith('92') && cleaned.length === 10) {
        cleaned = '92' + cleaned;
      }
      
      const chatId = cleaned + '@c.us';
      await this.client.sendMessage(chatId, message);
      console.log(`✉️ Message sent to ${cleaned}`);
      return true;
    } catch (err) {
      console.error(`Failed to send message to ${phone}`, err);
      return false;
    }
  }

  getStatus() {
    return {
      status: this.status,
      qrCode: this.qrCode
    };
  }
}

// Singleton instance
const bot = new WhatsAppBot();
module.exports = bot;
