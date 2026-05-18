/**
 * WhatsApp Bot Route — Bulletproof Edition
 * 
 * The bot is loaded lazily with a null-fallback pattern.
 * If the bot module crashes for ANY reason, the entire ERP keeps running.
 * Bot errors are contained and never propagate to the main server.
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('./auth');

// ─── Null-Bot Fallback ────────────────────────────────────────────────────────
// Used if the real bot module fails to load for any reason.
const NULL_BOT = {
  getStatus: () => ({ status: 'UNAVAILABLE', qrCode: null, reconnectAttempts: 0 }),
  sendMessage: async () => ({ success: false, error: 'WhatsApp bot is unavailable. Check server logs.' }),
  resetSession: () => true,
};

// ─── Safe Lazy Load ───────────────────────────────────────────────────────────
// The bot is loaded once on first request, not at server startup.
// This way, a bot crash never affects the server boot sequence.
let _bot = null;
function getBot() {
  if (_bot) return _bot;
  try {
    _bot = require('../engines/whatsapp_bot');
    console.log('✅ WhatsApp bot module loaded successfully');
  } catch (err) {
    console.error('⚠️ WhatsApp bot module failed to load:', err.message);
    _bot = NULL_BOT;
  }
  return _bot;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// Get Bot Status and QR Code
router.get('/status', authenticateToken, (req, res) => {
  try {
    res.json(getBot().getStatus());
  } catch (err) {
    console.error('WhatsApp /status error:', err.message);
    res.json(NULL_BOT.getStatus());
  }
});

// Send Test Message
router.post('/send-test', authenticateToken, async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) return res.status(400).json({ error: 'Missing phone or message' });
    
    const result = await getBot().sendMessage(phone, message);
    if (result.success) {
      res.json({ success: true, message: 'Test message sent!' });
    } else {
      res.status(500).json({ success: false, error: result.error || 'Failed to send message.' });
    }
  } catch (err) {
    console.error('WhatsApp /send-test error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Reset Session
router.post('/reset', authenticateToken, (req, res) => {
  try {
    getBot().resetSession();
    res.json({ success: true, message: 'Session reset. QR code will appear shortly.' });
  } catch (err) {
    console.error('WhatsApp /reset error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
