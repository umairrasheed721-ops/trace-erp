const express = require('express');
const router = express.Router();
const bot = require('../engines/whatsapp_bot');
const { authenticateToken } = require('./auth');

// Get Bot Status and QR Code
router.get('/status', authenticateToken, (req, res) => {
  res.json(bot.getStatus());
});

// Send Test Message
router.post('/send-test', authenticateToken, async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) return res.status(400).json({ error: 'Missing phone or message' });
  
  const result = await bot.sendMessage(phone, message);
  if (result.success) {
    res.json({ success: true, message: 'Test message sent!' });
  } else {
    res.status(500).json({ success: false, error: result.error || 'Failed to send message. Check bot connection.' });
  }
});

// Reset Session — wipes wa_session and forces fresh QR scan
router.post('/reset', authenticateToken, async (req, res) => {
  try {
    await bot.resetSession();
    res.json({ success: true, message: 'Session reset. Scan the new QR code to reconnect.' });
  } catch (err) {
    console.error('Reset session error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
