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
const { normalizePhone } = require('../engines/whatsapp_message_processor');
const whatsappService = require('../services/whatsappService');

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
    
    const bot = getBot();
    if (bot.status !== 'CONNECTED' || !bot.sock) {
      return res.status(500).json({ error: 'WhatsApp bot is not connected. Connect via WhatsApp Portal.' });
    }
    
    const activeSocket = bot.sock;
    let jid = phone.toString().replace(/[^0-9]/g, '');
    if (!jid.endsWith('@s.whatsapp.net')) jid = `${jid}@s.whatsapp.net`;
    
    console.log(`[WA-DEBUG] Verifying if JID exists on WhatsApp: ${jid}`);
    
    try {
      const [result] = await activeSocket.onWhatsApp(jid);
      
      if (!result || !result.exists) {
        console.error(`[WA-ERROR] The number ${jid} is not registered on WhatsApp or cannot be resolved by Baileys.`);
        return res.status(400).json({ error: `Number ${jid} is not registered on WhatsApp.` });
      }
      
      console.log(`[WA-DEBUG] JID Verified safely. Using strict formatted JID: ${result.jid}`);
      
      // NOW send the message using the exact JID returned by Meta:
      const sendResult = await activeSocket.sendMessage(result.jid, { text: message });
      
      console.log(`[WA-SUCCESS] Message actually dispatched to ${result.jid}`);
      return res.json({ success: true, messageId: sendResult?.key?.id });
    } catch (error) {
      console.error(`[WA-FATAL-SEND-ERROR]`, error);
      return res.status(500).json({ error: error.message });
    }
  } catch (err) {
    console.error('WhatsApp /send-test error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Send Manual Chat/Order message via active Baileys socket
router.post('/send', authenticateToken, async (req, res) => {
  console.log('[WA-SEND] Surgical raw socket dispatch hit!');
  console.log('[WA-SEND] Payload Body:', req.body);

  const { phone, text, message, clientUuid, quoteContext } = req.body;
  const textContent = text || message;
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';

  if (!phone || !textContent) {
    console.error('[WA-SEND-VALIDATION-FAILED] Missing phone or text content in req.body!');
    return res.status(400).json({ error: 'Phone and message text are required' });
  }

  // 1. Strict JID Formatting (Auto-fix local Pakistani numbers)
  let cleanPhone = phone.toString().replace(/[^0-9]/g, '');
  if (cleanPhone.startsWith('03')) {
    cleanPhone = '92' + cleanPhone.substring(1); // Converts 03xx to 923xx
  }
  let jid = `${cleanPhone}@s.whatsapp.net`;

  // 2. Get the active socket
  const activeSocket = whatsappService.getBotForTenant(tenantId)?.sock;

  if (!activeSocket) {
    console.error('[WA-SEND-ERROR] WhatsApp socket is offline or disconnected.');
    return res.status(500).json({ error: "WhatsApp socket is offline." });
  }

  console.log(`[WA-SURGICAL-DISPATCH] Sending to exact JID: ${jid}`);

  try {
    const { db } = require('../db');

    // Query order metadata matching phone search pattern
    const last10 = cleanPhone.substring(cleanPhone.length - 10);
    const order = db.prepare(`
      SELECT id, store_id, shopify_order_id FROM orders 
      WHERE phone LIKE ? AND tenant_id = ?
      ORDER BY id DESC LIMIT 1
    `).get(`%${last10}%`, tenantId);

    const storeId = order ? order.store_id : 1;
    const orderId = order ? order.id : null;

    let parsedQuoteContext = quoteContext || null;
    if (typeof parsedQuoteContext === 'string') {
      try {
        parsedQuoteContext = JSON.parse(parsedQuoteContext);
      } catch (e) {}
    }

    let verifiedQuote = null;
    const qid = parsedQuoteContext?.id || parsedQuoteContext?.message_id;
    if (parsedQuoteContext && qid) {
      let participant = parsedQuoteContext.participant;
      let qtext = parsedQuoteContext.text;
      try {
        const quotedRow = db.prepare(`
          SELECT * FROM whatsapp_messages 
          WHERE message_id = ? AND tenant_id = ?
          LIMIT 1
        `).get(qid, tenantId);

        if (quotedRow) {
          if (!participant) participant = jid;
          if (!qtext) qtext = quotedRow.message || '';
        }
      } catch (err) {}

      if (!participant) participant = jid;
      verifiedQuote = {
        id: qid,
        participant: participant,
        text: qtext || 'Media'
      };
    }

    // RAW SEND (Bypassing all mocks and queues)
    let sendOptions = {};
    if (verifiedQuote) {
      sendOptions.quoted = {
        key: {
          remoteJid: jid,
          fromMe: false,
          id: verifiedQuote.id,
          participant: verifiedQuote.participant
        },
        message: {
          conversation: verifiedQuote.text
        }
      };
    }

    const result = await activeSocket.sendMessage(jid, { text: textContent }, sendOptions);
    const realMessageId = result?.key?.id || clientUuid || require('crypto').randomUUID();
    console.log(`[WA-SUCCESS] Dispatched ID: ${realMessageId}`);

    // Insert into SQLite database as 'sent'
    let dbMessageId = null;
    try {
      const dbResult = db.prepare(`
        INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message, message_id, status, tenant_id, quote_context)
        VALUES (?, ?, ?, 'outgoing', ?, ?, 'sent', ?, ?)
      `).run(storeId, orderId, cleanPhone, textContent, realMessageId, tenantId, verifiedQuote ? JSON.stringify(verifiedQuote) : null);
      dbMessageId = dbResult.lastInsertRowid;
    } catch (dbErr) {
      console.error('[WA-SEND] Failed to save manual chat message to SQLite:', dbErr.message);
    }

    const newMsg = {
      id: dbMessageId || Date.now(),
      store_id: storeId,
      order_id: orderId,
      phone: cleanPhone,
      direction: 'outgoing',
      message: textContent,
      message_id: realMessageId,
      clientUuid: clientUuid || realMessageId,
      status: 'sent',
      quote_context: verifiedQuote ? JSON.stringify(verifiedQuote) : null,
      created_at: new Date().toISOString()
    };

    // Broadcast message via WebSocket for instant UI update
    try {
      const { broadcast } = require('../websocket');
      broadcast('message', {
        order_id: orderId,
        message: newMsg
      });
    } catch (wsErr) {}

    if (order && order.shopify_order_id) {
      try {
        const { broadcast } = require('../sse');
        broadcast('order_updated', { storeId: order.store_id, shopifyOrderId: order.shopify_order_id });
      } catch (err) {}
    }

    return res.status(200).json({ success: true, messageId: realMessageId, message: newMsg });
  } catch (err) {
    console.error('[WA-SEND-ERROR]', err);
    return res.status(500).json({ error: err.message });
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
