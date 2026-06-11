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

// Send Order Product Images directly via Baileys as memory buffer
router.post('/send-order-images', authenticateToken, async (req, res) => {
  const { orderId, phone } = req.body;
  if (!orderId || !phone) {
    return res.status(400).json({ error: 'Missing orderId or phone' });
  }

  try {
    const tenantId = req.user?.tenant_id || req.tenantId || 'default';
    const { db } = require('../db');
    const order = db.prepare('SELECT line_items FROM orders WHERE id = ? AND tenant_id = ?').get(orderId, tenantId);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!order.line_items) {
      return res.status(400).json({ error: 'Order has no items' });
    }

    const items = JSON.parse(order.line_items);
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Order has no items' });
    }

    // Extract valid Shopify image URLs
    const imageTasks = [];
    for (const item of items) {
      if (item.image_url) {
        imageTasks.push({
          url: item.image_url,
          itemName: item.title || item.variant_title || 'Product'
        });
      }
    }

    if (imageTasks.length === 0) {
      return res.status(400).json({ error: 'No product images found for this order' });
    }

    // Connect to bot and ensure it's connected
    const bot = getBot();
    if (bot.status !== 'CONNECTED' || !bot.sock) {
      return res.status(500).json({ error: 'WhatsApp bot is not connected. Connect via WhatsApp Portal.' });
    }

    // Normalize phone number to 92... without non-digits
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) {
      cleaned = '92' + cleaned.substring(1);
    } else if (!cleaned.startsWith('92') && cleaned.length === 10) {
      cleaned = '92' + cleaned;
    }
    const remoteJid = cleaned + '@s.whatsapp.net';

    const axios = require('axios');
    let sentCount = 0;
    let failedCount = 0;
    const errors = [];

    for (const task of imageTasks) {
      try {
        console.log(`[Send Order Images] Downloading image for ${task.itemName} from URL: ${task.url}`);
        const response = await axios.get(task.url, { responseType: 'arraybuffer', timeout: 15000 });
        const imageBuffer = Buffer.from(response.data);

        console.log(`[Send Order Images] Sending image to ${remoteJid} via Baileys socket...`);
        await bot.sock.sendMessage(remoteJid, { image: imageBuffer, caption: task.itemName });
        sentCount++;
      } catch (err) {
        failedCount++;
        const errMsg = err.message || 'Unknown error';
        console.error(`[Send Order Images] Failed to send image for ${task.itemName}:`, errMsg);
        errors.push({ itemName: task.itemName, error: errMsg });
      }
    }

    res.json({
      success: true,
      sentCount,
      failedCount,
      errors
    });

  } catch (err) {
    console.error('WhatsApp /send-order-images error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── WA ERP Status Poll Endpoint ─────────────────────────────────────────────
// GET /api/whatsapp/poll-status/:orderId
// Lightweight endpoint to return the latest erp_status for a given order_id.
// Used by the frontend to live-poll the whatsapp_polls table every few seconds.
router.get('/poll-status/:orderId', authenticateToken, (req, res) => {
  try {
    const { db } = require('../db');
    const { orderId } = req.params;
    if (!orderId) return res.status(400).json({ error: 'orderId required' });

    const row = db.prepare(
      `SELECT erp_status, message_id, poll_name, created_at
       FROM whatsapp_polls
       WHERE order_id = ?
       ORDER BY id DESC LIMIT 1`
    ).get(orderId);

    res.json({
      order_id: parseInt(orderId),
      erp_status: row ? row.erp_status : null,
      poll_name: row ? row.poll_name : null,
      message_id: row ? row.message_id : null,
      last_updated: row ? row.created_at : null,
    });
  } catch (err) {
    console.error('WhatsApp /poll-status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Batch WA ERP Status Endpoint ────────────────────────────────────────────
// GET /api/whatsapp/poll-statuses?order_ids=1,2,3
// Returns erp_status for multiple order IDs at once (used for table refresh).
router.get('/poll-statuses', authenticateToken, (req, res) => {
  try {
    const { db } = require('../db');
    const { order_ids } = req.query;
    if (!order_ids) return res.json({ statuses: {} });

    const ids = order_ids.split(',').map(id => parseInt(id.trim())).filter(Boolean);
    if (ids.length === 0) return res.json({ statuses: {} });

    const placeholders = ids.map(() => '?').join(',');
    const rows = db.prepare(
      `SELECT order_id, erp_status
       FROM whatsapp_polls
       WHERE order_id IN (${placeholders})
       GROUP BY order_id
       HAVING id = MAX(id)`
    ).all(...ids);

    const statuses = {};
    rows.forEach(row => {
      if (row.order_id) statuses[row.order_id] = row.erp_status;
    });

    res.json({ statuses });
  } catch (err) {
    console.error('WhatsApp /poll-statuses error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
