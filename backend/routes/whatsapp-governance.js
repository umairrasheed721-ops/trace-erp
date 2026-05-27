const express = require('express');
const router = express.Router();
const { db, DB_DIR } = require('../db');
const bot = require('../engines/whatsapp_bot');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const cron = require('node-cron');
const tenantContext = require('../tenant-context');

const tenantLastChecks = {};

// STRICT JID NORMALIZATION UTILITY
function normalizePhone(raw) {
  if (!raw) return '';
  // Strip JID suffix, +, spaces, dashes
  let n = String(raw).split('@')[0].replace(/[\+\-\s]/g, '').replace(/\D/g, '');
  // Pakistan short-form: 03XX -> 923XX
  if (n.startsWith('0') && n.length === 11) n = '92' + n.substring(1);
  // 10-digit with no country code
  else if (!n.startsWith('92') && n.length === 10) n = '92' + n;
  return n;
}

function getAllTenants() {
  const tenants = ['default'];
  try {
    const files = fs.readdirSync(DB_DIR);
    for (const file of files) {
      if (file.startsWith('trace_erp_') && file.endsWith('.db')) {
        const tenantId = file.substring(10, file.length - 3);
        if (tenantId && !tenants.includes(tenantId)) {
          tenants.push(tenantId);
        }
      }
    }
  } catch (e) {
    console.error('⚠️ Failed to scan tenants for heartbeat:', e.message);
  }
  return tenants;
}

// Scheduled heartbeat task (runs every 30 seconds)
cron.schedule('*/30 * * * * *', () => {
  const tenants = getAllTenants();
  
  for (const tenantId of tenants) {
    tenantContext.run(tenantId, async () => {
      try {
        const sock = bot.sock;
        const isSocketOpen = !!(sock && sock.ws && sock.ws.isOpen);
        const isFullyConnected = isSocketOpen && !!(sock && sock.user);
        
        tenantLastChecks[tenantId] = {
          connected: isFullyConnected,
          last_check: new Date().toISOString()
        };
        
        if (!isSocketOpen) {
          if (bot.status === 'DISABLED') {
            return;
          }
          console.warn(`⚠️ [Heartbeat] Tenant [${tenantId}] WhatsApp socket is inactive.`);
          
          // 1. Immediately update DB status to 'DISCONNECTED'
          const { db: tenantDb } = require('../db');
          try {
            tenantDb.prepare("UPDATE whatsapp_settings SET status = 'DISCONNECTED'").run();
          } catch (dbErr) {
            console.error(`⚠️ Failed to update DB status for tenant [${tenantId}]:`, dbErr.message);
          }
          
          // 2. Set in-memory status to DISCONNECTED
          bot.status = 'DISCONNECTED';
          
          // 3. Trigger soft-reconnect
          if (typeof bot.softReconnect === 'function') {
            await bot.softReconnect();
          }
        } else {
          // Update DB status to match the actual bot status (e.g. 'CONNECTED' or 'QR_READY')
          const { db: tenantDb } = require('../db');
          try {
            tenantDb.prepare("UPDATE whatsapp_settings SET status = ?").run(bot.status || 'CONNECTED');
          } catch (_) {}
        }
      } catch (err) {
        console.error(`❌ [Heartbeat] Error checking status for tenant [${tenantId}]:`, err.message);
      }
    });
  }
});

const getMediaFilePath = (mediaUrl) => {
  if (!mediaUrl) return null;
  if (mediaUrl.startsWith('/uploads/')) {
    return path.join(DB_DIR, 'uploads', mediaUrl.substring(9));
  }
  return path.join(DB_DIR, 'uploads', mediaUrl);
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folderPath = path.join(DB_DIR, 'uploads');
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
    cb(null, folderPath);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// GET /api/whatsapp-governance/settings
router.get('/settings', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM whatsapp_settings ORDER BY id DESC LIMIT 1').get();
    res.json(row || {});
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/whatsapp-governance/status
router.get('/status', (req, res) => {
  try {
    const statusObj = bot.getStatus();
    const sock = bot.sock;
    
    // Heartbeat check: check if Baileys socket object exists and is open
    const isSocketOpen = !!(sock && sock.ws && sock.ws.isOpen);
    const isFullyConnected = isSocketOpen && !!(sock && sock.user);
    
    if (statusObj.status === 'CONNECTED' && !isFullyConnected) {
      statusObj.status = 'DISCONNECTED';
    }
    
    statusObj.connected = isFullyConnected;
    
    // Also include a map of the current connection status for all tenants merged at the top level
    const tenantsStatusMap = {};
    const tenants = getAllTenants();
    for (const tId of tenants) {
      tenantsStatusMap[tId] = tenantLastChecks[tId] || {
        connected: false,
        last_check: null
      };
    }
    
    res.json({
      ...statusObj,
      ...tenantsStatusMap
    });
  } catch (e) {
    res.status(500).json({ error: e.message, status: 'DISCONNECTED', connected: false });
  }
});

// POST /api/whatsapp-governance/settings
router.post('/settings', (req, res) => {
  const { mode, cod_verification_enabled, attempted_delivery_enabled, dispatch_alerts_enabled, min_delay_sec, max_delay_sec, max_per_hour, cooling_period_min, cod_template, attempted_template, dispatch_template, ai_responder_enabled, ai_tracking_template, ai_landmark_template } = req.body;
  try {
    db.prepare(`
      UPDATE whatsapp_settings SET
        mode = ?, cod_verification_enabled = ?, attempted_delivery_enabled = ?, dispatch_alerts_enabled = ?, min_delay_sec = ?, max_delay_sec = ?, max_per_hour = ?, cooling_period_min = ?, cod_template = ?, attempted_template = ?, dispatch_template = ?, ai_responder_enabled = ?, ai_tracking_template = ?, ai_landmark_template = ?, updated_at = datetime('now')
    `).run(mode, cod_verification_enabled ? 1 : 0, attempted_delivery_enabled ? 1 : 0, dispatch_alerts_enabled ? 1 : 0, Number(min_delay_sec), Number(max_delay_sec), Number(max_per_hour), Number(cooling_period_min), cod_template, attempted_template, dispatch_template, ai_responder_enabled ? 1 : 0, ai_tracking_template || '', ai_landmark_template || '');

    // Update bot in memory
    bot.setSettings({ minDelaySec: min_delay_sec, maxDelaySec: max_delay_sec, maxPerHour: max_per_hour, coolingPeriodMin: cooling_period_min, aiResponderEnabled: ai_responder_enabled ? 1 : 0, aiTrackingTemplate: ai_tracking_template, aiLandmarkTemplate: ai_landmark_template });

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/whatsapp-governance/queue
router.get('/queue', (req, res) => {
  try {
    res.json(bot.getQueueDetails());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/whatsapp-governance/queue/pause
router.post('/queue/pause', (req, res) => {
  try {
    const isPaused = bot.togglePause();
    res.json({ success: true, isPaused });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/whatsapp-governance/queue/clear
router.post('/queue/clear', (req, res) => {
  try {
    const count = bot.clearQueue();
    res.json({ success: true, count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/whatsapp-governance/chat/:order_id
router.get('/chat/:order_id', (req, res) => {
  const { order_id } = req.params;
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';
  try {
    const order = db.prepare('SELECT id, store_id, phone, customer_name, wa_verification_status FROM orders WHERE id = ? AND tenant_id = ?').get(Number(order_id), tenantId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (!order.phone) {
      return res.json({ order, messages: [] });
    }

    let cleaned = order.phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) cleaned = '92' + cleaned.substring(1);
    else if (!cleaned.startsWith('92') && cleaned.length === 10) cleaned = '92' + cleaned;

    // 1. Pull from SQLite DB
    const dbMessages = db.prepare(`
      SELECT * FROM whatsapp_messages 
      WHERE (phone LIKE ? OR order_id = ?) AND tenant_id = ? 
      ORDER BY id ASC
    `).all(`%${cleaned.substring(cleaned.length - 10)}%`, order.id, tenantId);

    // 2. Pull from live Baileys WebSocket memory store
    const baileysMessages = typeof bot.getChatHistory === 'function' ? bot.getChatHistory(cleaned) : [];

    // 3. Merge and deduplicate by message text
    const merged = [...dbMessages];
    for (const bm of baileysMessages) {
      const exists = merged.some(dm => dm.message.trim() === bm.message.trim());
      if (!exists) {
        merged.push(bm);
      }
    }

    // Sort by created_at ascending
    merged.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    res.json({ order, messages: merged });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/whatsapp-governance/chat/:order_id/send
router.post('/chat/:order_id/send', async (req, res) => {
  const { order_id } = req.params;
  const { message } = req.body;
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';

  if (!message) return res.status(400).json({ error: 'Message cannot be empty' });

  try {
    const order = db.prepare('SELECT id, store_id, phone, customer_name FROM orders WHERE id = ? AND tenant_id = ?').get(Number(order_id), tenantId);
    if (!order || !order.phone) return res.status(404).json({ error: 'Order phone not found' });

    let cleaned = order.phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) cleaned = '92' + cleaned.substring(1);
    else if (!cleaned.startsWith('92') && cleaned.length === 10) cleaned = '92' + cleaned;

    // Insert into SQLite database immediately so it persists permanently
    try {
      db.prepare(`
        INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message, status, tenant_id)
        VALUES (?, ?, ?, 'outgoing', ?, 'sent', ?)
      `).run(order.store_id, order.id, cleaned, message, tenantId);
    } catch (err) {}

    // Queue message via Baileys bot with isManual = true for instant priority delivery
    bot.sendMessage(cleaned, message, true);

    // Return optimistic message object
    const newMsg = {
      id: Date.now(),
      store_id: order.store_id,
      order_id: order.id,
      phone: cleaned,
      direction: 'outgoing',
      message,
      status: 'sent',
      created_at: new Date().toISOString()
    };

    res.json({ success: true, message: newMsg });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/whatsapp-governance/chat/:order_id/upload-media
router.post('/chat/:order_id/upload-media', upload.single('media'), async (req, res) => {
  const { order_id } = req.params;
  const caption = req.body.caption || '';
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';
  
  if (!req.file) return res.status(400).json({ error: 'No media file provided' });

  try {
    const order = db.prepare('SELECT id, store_id, phone FROM orders WHERE id = ? AND tenant_id = ?').get(Number(order_id), tenantId);
    if (!order || !order.phone) return res.status(404).json({ error: 'Order phone not found' });

    let cleaned = order.phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) cleaned = '92' + cleaned.substring(1);
    else if (!cleaned.startsWith('92') && cleaned.length === 10) cleaned = '92' + cleaned;

    // Use full URL or relative path for mediaUrl
    const baseUrl = req.protocol + '://' + req.get('host');
    const fileUrl = `/uploads/${req.file.filename}`; // Or `baseUrl + fileUrl` if bot expects absolute. Bot expects relative path and prepends public/ or we can just send the local path
    // Let's pass the relative URL. The bot uses it as a path to download or we can use the local filesystem path.
    // Wait, bot expects absolute URL or local path?
    // Let's pass the absolute URL for the bot to fetch if needed, OR local path.
    // wait, bot.sendMessage uses { url: mediaUrl } which can be absolute url or local path.
    // Actually, baileys { url: '...' } expects an http url or absolute file path.
    // Let's pass the local absolute path for reliable reading.
    const absolutePath = req.file.path;
    
    const mediaType = req.file.mimetype.startsWith('image/') ? 'image' : 
                      req.file.mimetype.startsWith('audio/') ? 'audio' :
                      req.file.mimetype.startsWith('video/') ? 'video' : 'document';
                      
    // Queue message via Baileys bot with isManual = true
    bot.sendMessage(cleaned, caption, true, absolutePath, mediaType, req.file.originalname);

    res.json({ success: true, message: `Media queued successfully` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/whatsapp-governance/chat/:order_id/send-images
router.post('/chat/:order_id/send-images', async (req, res) => {
  const { order_id } = req.params;
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';
  try {
    const order = db.prepare('SELECT id, store_id, phone, customer_name, line_items FROM orders WHERE id = ? AND tenant_id = ?').get(Number(order_id), tenantId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!order.phone) return res.status(400).json({ error: 'Order phone not found' });

    let cleaned = order.phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) cleaned = '92' + cleaned.substring(1);
    else if (!cleaned.startsWith('92') && cleaned.length === 10) cleaned = '92' + cleaned;

    let lineItems = [];
    try {
      lineItems = typeof order.line_items === 'string' ? JSON.parse(order.line_items) : (order.line_items || []);
    } catch (e) {
      return res.status(400).json({ error: 'Failed to parse order line items' });
    }

    const itemsWithImages = lineItems.filter(item => item.image_url && item.image_url.trim() !== '');

    if (itemsWithImages.length === 0) {
      return res.status(400).json({ error: 'No item images found for this order. Please fetch order details from Shopify first to sync variant images.' });
    }

    let sentCount = 0;
    for (const item of itemsWithImages) {
      const caption = `🤖 [TRACE Support] Ordered item: *${item.title}*${item.variant_title ? ` (${item.variant_title})` : ''} — Qty: ${item.quantity}`;
      const dbMessageContent = `[Image: ${item.image_url}] ${caption}`;

      try {
        db.prepare(`
          INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message, status, tenant_id)
          VALUES (?, ?, ?, 'outgoing', ?, 'sent', ?)
        `).run(order.store_id, order.id, cleaned, dbMessageContent, tenantId);
      } catch (err) {}

      bot.sendMessage(cleaned, caption, true, item.image_url);
      sentCount++;
    }

    res.json({ success: true, message: `Successfully queued ${sentCount} image(s) to send via WhatsApp.` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/whatsapp-governance/chat/:order_id/fetch-history
router.post('/chat/:order_id/fetch-history', async (req, res) => {
  const { order_id } = req.params;
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';
  try {
    const order = db.prepare('SELECT id, store_id, phone, customer_name FROM orders WHERE id = ? AND tenant_id = ?').get(Number(order_id), tenantId);
    if (!order || !order.phone) return res.status(404).json({ error: 'Order phone not found' });

    let cleaned = order.phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) cleaned = '92' + cleaned.substring(1);
    else if (!cleaned.startsWith('92') && cleaned.length === 10) cleaned = '92' + cleaned;

    if (typeof bot.fetchHistoryForPhone === 'function') {
      const result = await bot.fetchHistoryForPhone(cleaned);
      if (!result.success) {
        return res.status(400).json({ error: result.error || 'Failed to fetch history' });
      }
    }

    // Pull from SQLite DB
    const dbMessages = db.prepare(`
      SELECT * FROM whatsapp_messages 
      WHERE (phone LIKE ? OR order_id = ?) AND tenant_id = ? 
      ORDER BY id ASC
    `).all(`%${cleaned.substring(cleaned.length - 10)}%`, order.id, tenantId);

    // Pull from live Baileys WebSocket memory store
    const baileysMessages = typeof bot.getChatHistory === 'function' ? bot.getChatHistory(cleaned) : [];

    // Merge and deduplicate by message text
    const merged = [...dbMessages];
    for (const bm of baileysMessages) {
      const exists = merged.some(dm => dm.message.trim() === bm.message.trim());
      if (!exists) {
        merged.push(bm);
      }
    }

    // Sort by created_at ascending
    merged.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    res.json({ success: true, messages: merged });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/whatsapp-governance/chats
router.get('/chats', (req, res) => {
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';
  try {
    const uniqueChats = db.prepare(`
      SELECT phone, MAX(id) as max_id 
      FROM whatsapp_messages 
      WHERE tenant_id = ?
      GROUP BY phone 
      ORDER BY max_id DESC
    `).all(tenantId);

    const chats = [];
    for (const chat of uniqueChats) {
      const msg = db.prepare('SELECT * FROM whatsapp_messages WHERE id = ? AND tenant_id = ?').get(chat.max_id, tenantId);
      if (!msg) continue;

      const last10 = chat.phone.substring(chat.phone.length - 10);
      const order = db.prepare(`
        SELECT id, customer_name, wa_verification_status, financial_status, fulfillment_status, total_price 
        FROM orders 
        WHERE phone LIKE ? AND tenant_id = ?
        ORDER BY id DESC LIMIT 1
      `).get(`%${last10}%`, tenantId);

      chats.push({
        phone: chat.phone,
        lastMessage: msg,
        order: order || null,
        customerName: order ? order.customer_name : null
      });
    }

    res.json({ success: true, chats });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/whatsapp-governance/chats/:phone
router.get('/chats/:phone', async (req, res) => {
  const { phone } = req.params;
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';
  console.log("req.params.phone:", phone);
  try {
    const normalized = normalizePhone(phone);
    const last10 = normalized.substring(normalized.length - 10);

    // 1. Pull from SQLite DB
    let dbMessages = [];
    try {
      dbMessages = db.prepare(`
        SELECT * FROM whatsapp_messages 
        WHERE phone = ? AND tenant_id = ?
        ORDER BY id ASC
      `).all(normalized, tenantId);

      // 2. DB FALLBACK CHECK: If the exact normalized phone returns empty, try a fallback query with the '+' prefix
      if (dbMessages.length === 0) {
        dbMessages = db.prepare(`
          SELECT * FROM whatsapp_messages 
          WHERE phone = ? AND tenant_id = ?
          ORDER BY id ASC
        `).all('+' + normalized, tenantId);
      }
    } catch (err) {
      console.log("ROUTE_ERROR:", err.message);
      throw err;
    }

    // 3. Pull from live Baileys WebSocket memory store
    const baileysMessages = typeof bot.getChatHistory === 'function' ? bot.getChatHistory(normalized) : [];

    // 4. Merge and deduplicate by message text
    const merged = [...dbMessages];
    for (const bm of baileysMessages) {
      const exists = merged.some(dm => dm.message.trim() === bm.message.trim());
      if (!exists) {
        merged.push(bm);
      }
    }

    // Sort by created_at ascending
    merged.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    // Get order history and customer details
    let orderHistory = [];
    try {
      orderHistory = db.prepare(`
        SELECT id, store_id, customer_name, total_price, financial_status, fulfillment_status, wa_verification_status, created_timestamp AS created_at, phone
        FROM orders 
        WHERE phone LIKE ? AND tenant_id = ?
        ORDER BY id DESC
      `).all(`%${last10}%`, tenantId);
    } catch (err) {
      console.log("ROUTE_ERROR:", err.message);
      throw err;
    }

    if (dbMessages.length === 0 && orderHistory.length === 0) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const latestOrder = orderHistory[0] || null;

    // Get Gemini Chat Memory dynamically constructed from customer_profiles
    let geminiMemoryText = null;
    try {
      const profile = db.prepare('SELECT size_preference, is_big_and_tall, preferences, ad_source, risk_flag FROM customer_profiles WHERE phone = ?').get(normalized);
      if (profile) {
        let lines = [];
        if (profile.size_preference) {
          lines.push(`📏 Size Preference: ${profile.size_preference}${profile.is_big_and_tall ? ' (Big & Tall)' : ''}`);
        }
        if (profile.ad_source) {
          lines.push(`🎯 Attribution: ${profile.ad_source}`);
        }
        if (profile.risk_flag && profile.risk_flag !== 'NORMAL') {
          lines.push(`🚩 Risk Flag: ${profile.risk_flag}`);
        }
        if (profile.preferences) {
          try {
            const parsed = JSON.parse(profile.preferences);
            Object.entries(parsed).forEach(([key, val]) => {
              const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
              lines.push(`💡 ${label}: ${val}`);
            });
          } catch (_) {}
        }
        if (lines.length > 0) {
          geminiMemoryText = lines.join('\n');
        }
      }
    } catch (e) {
      console.error('Failed to load dynamic Gemini memory:', e.message);
    }

    res.json({
      success: true,
      phone: normalized,
      messages: merged,
      latestOrder,
      orderHistory,
      geminiMemory: geminiMemoryText
    });
  } catch (e) {
    console.log("ROUTE_ERROR:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/whatsapp-governance/chats/:phone/send
router.post('/chats/:phone/send', async (req, res) => {
  const { phone } = req.params;
  const { message } = req.body;
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';

  if (!message) return res.status(400).json({ error: 'Message cannot be empty' });

  try {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) cleaned = '92' + cleaned.substring(1);
    else if (!cleaned.startsWith('92') && cleaned.length === 10) cleaned = '92' + cleaned;

    const last10 = cleaned.substring(cleaned.length - 10);
    // Find latest order for store_id and order_id mapping
    const order = db.prepare(`
      SELECT id, store_id FROM orders 
      WHERE phone LIKE ? AND tenant_id = ?
      ORDER BY id DESC LIMIT 1
    `).get(`%${last10}%`, tenantId);

    const storeId = order ? order.store_id : 1; // Fallback to store 1
    const orderId = order ? order.id : null;

    const clientUuid = req.body.clientUuid || null;
    let quoteContext = req.body.quoteContext || null;
    if (typeof quoteContext === 'string') {
      try {
        quoteContext = JSON.parse(quoteContext);
      } catch (e) {}
    }

    let verifiedQuote = null;
    const qid = quoteContext?.id || quoteContext?.message_id;
    if (quoteContext && qid) {
      let participant = quoteContext.participant;
      let text = quoteContext.text;
      try {
        const quotedRow = db.prepare(`
          SELECT * FROM whatsapp_messages 
          WHERE message_id = ? AND tenant_id = ?
          LIMIT 1
        `).get(qid, tenantId);

        if (quotedRow) {
          const fromMe = quotedRow.direction === 'outgoing';
          const remoteJid = cleaned + '@s.whatsapp.net';
          if (!participant) {
            participant = fromMe 
              ? (bot.sock?.user?.id ? bot.sock.user.id.split(':')[0] + '@s.whatsapp.net' : remoteJid)
              : remoteJid;
          }
          if (!text) {
            text = quotedRow.message || '';
          }
        }
      } catch (err) {
        console.warn('⚠️ Failed to verify quoted message in SQLite:', err.message);
      }

      if (!participant) {
        participant = cleaned + '@s.whatsapp.net';
      }

      verifiedQuote = {
        id: qid,
        participant: participant,
        text: text || 'Media'
      };
    }

    // Insert into SQLite database immediately so it persists permanently
    let dbMessageId = null;
    try {
      const result = db.prepare(`
        INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message, message_id, status, tenant_id, quote_context)
        VALUES (?, ?, ?, 'outgoing', ?, ?, 'sent', ?, ?)
      `).run(storeId, orderId, cleaned, message, clientUuid, tenantId, verifiedQuote ? JSON.stringify(verifiedQuote) : null);
      dbMessageId = result.lastInsertRowid;
    } catch (err) {
      console.error('Failed to save manual chat message:', err.message);
    }

    // Queue message via Baileys bot with isManual = true for instant priority delivery
    bot.sendMessage(cleaned, message, true, null, null, null, clientUuid, verifiedQuote);

    // Return optimistic message object
    const newMsg = {
      id: dbMessageId || Date.now(),
      store_id: storeId,
      order_id: orderId,
      phone: cleaned,
      direction: 'outgoing',
      message,
      status: 'sent',
      quote_context: verifiedQuote ? JSON.stringify(verifiedQuote) : null,
      created_at: new Date().toISOString()
    };

    res.json({ success: true, message: newMsg });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/whatsapp-governance/chats/:phone/upload-media
router.post('/chats/:phone/upload-media', upload.single('media'), async (req, res) => {
  const { phone } = req.params;
  const caption = req.body.caption || '';
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';
  
  if (!req.file) return res.status(400).json({ error: 'No media file provided' });

  try {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) cleaned = '92' + cleaned.substring(1);
    else if (!cleaned.startsWith('92') && cleaned.length === 10) cleaned = '92' + cleaned;

    const last10 = cleaned.substring(cleaned.length - 10);
    // Find latest order for store_id and order_id mapping
    const order = db.prepare(`
      SELECT id, store_id FROM orders 
      WHERE phone LIKE ? AND tenant_id = ?
      ORDER BY id DESC LIMIT 1
    `).get(`%${last10}%`, tenantId);

    const storeId = order ? order.store_id : 1;
    const orderId = order ? order.id : null;

    const absolutePath = req.file.path;
    const relativeUrl = `/uploads/${req.file.filename}`;
    
    const mediaType = req.file.mimetype.startsWith('image/') ? 'image' : 
                      req.file.mimetype.startsWith('audio/') ? 'audio' :
                      req.file.mimetype.startsWith('video/') ? 'video' : 'document';
                      
    const dbMsgContent = mediaType === 'image' ? `[Image] ${caption}` : 
                         mediaType === 'audio' ? `[Audio] ${caption}` : 
                         mediaType === 'video' ? `[Video] ${caption}` : `[Document] ${caption}`;

    const clientUuid = req.body.clientUuid || null;
    let quoteContext = req.body.quoteContext || null;
    if (typeof quoteContext === 'string') {
      try {
        quoteContext = JSON.parse(quoteContext);
      } catch (e) {}
    }

    let verifiedQuote = null;
    const qid = quoteContext?.id || quoteContext?.message_id;
    if (quoteContext && qid) {
      let participant = quoteContext.participant;
      let text = quoteContext.text;
      try {
        const quotedRow = db.prepare(`
          SELECT * FROM whatsapp_messages 
          WHERE message_id = ? AND tenant_id = ?
          LIMIT 1
        `).get(qid, tenantId);

        if (quotedRow) {
          const fromMe = quotedRow.direction === 'outgoing';
          const remoteJid = cleaned + '@s.whatsapp.net';
          if (!participant) {
            participant = fromMe 
              ? (bot.sock?.user?.id ? bot.sock.user.id.split(':')[0] + '@s.whatsapp.net' : remoteJid)
              : remoteJid;
          }
          if (!text) {
            text = quotedRow.message || '';
          }
        }
      } catch (err) {
        console.warn('⚠️ Failed to verify quoted message in SQLite:', err.message);
      }

      if (!participant) {
        participant = cleaned + '@s.whatsapp.net';
      }

      verifiedQuote = {
        id: qid,
        participant: participant,
        text: text || 'Media'
      };
    }

    let dbMessageId = null;
    try {
      const result = db.prepare(`
        INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message, message_id, media_url, media_type, status, tenant_id, quote_context)
        VALUES (?, ?, ?, 'outgoing', ?, ?, ?, ?, 'sent', ?, ?)
      `).run(storeId, orderId, cleaned, dbMsgContent, clientUuid, relativeUrl, mediaType, tenantId, verifiedQuote ? JSON.stringify(verifiedQuote) : null);
      dbMessageId = result.lastInsertRowid;
    } catch (err) {
      console.error('Failed to log manual media message:', err.message);
    }

    // Queue message via Baileys bot with isManual = true
    bot.sendMessage(cleaned, caption, true, absolutePath, mediaType, req.file.originalname, clientUuid, verifiedQuote);

    res.json({ 
      success: true, 
      message: {
        id: dbMessageId || Date.now(),
        store_id: storeId,
        order_id: orderId,
        phone: cleaned,
        direction: 'outgoing',
        message: dbMsgContent,
        media_url: relativeUrl,
        media_type: mediaType,
        status: 'sent',
        quote_context: verifiedQuote ? JSON.stringify(verifiedQuote) : null,
        created_at: new Date().toISOString()
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/whatsapp-governance/chats/:phone/log-call-handoff
// Feature 3: Smart Call Handoff — logs internal system note without sending WA message
router.post('/chats/:phone/log-call-handoff', async (req, res) => {
  const { phone } = req.params;
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';
  try {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) cleaned = '92' + cleaned.substring(1);
    else if (!cleaned.startsWith('92') && cleaned.length === 10) cleaned = '92' + cleaned;

    const last10 = cleaned.substring(cleaned.length - 10);
    const order = db.prepare(`SELECT id, store_id FROM orders WHERE phone LIKE ? AND tenant_id = ? ORDER BY id DESC LIMIT 1`).get(`%${last10}%`, tenantId);
    const storeId = order ? order.store_id : 1;
    const orderId = order ? order.id : null;

    const systemMsg = '📞 Agent initiated native WhatsApp handoff call.';
    let dbMessageId = null;
    try {
      const result = db.prepare(`
        INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message, status, tenant_id)
        VALUES (?, ?, ?, 'outgoing', ?, 'sent', ?)
      `).run(storeId, orderId, cleaned, systemMsg, tenantId);
      dbMessageId = result.lastInsertRowid;
    } catch (err) {
      console.error('Failed to log call handoff message:', err.message);
    }

    res.json({
      success: true,
      message: {
        id: dbMessageId || Date.now(),
        store_id: storeId,
        order_id: orderId,
        phone: cleaned,
        direction: 'outgoing',
        message: systemMsg,
        status: 'sent',
        created_at: new Date().toISOString()
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/whatsapp-governance/chats/:phone/upload-voice
// Feature 2: Web Push-to-Talk — accepts audio blob, sends as native PTT Voice Note
const voiceUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const folderPath = path.join(DB_DIR, 'uploads');
      if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
      cb(null, folderPath);
    },
    filename: (req, file, cb) => {
      cb(null, `voice_${Date.now()}.webm`);
    }
  }),
  limits: { fileSize: 16 * 1024 * 1024 }, // 16MB max voice note
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) cb(null, true);
    else cb(new Error('Only audio files accepted for voice notes'));
  }
});

router.post('/chats/:phone/upload-voice', voiceUpload.single('audio'), async (req, res) => {
  const { phone } = req.params;
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';
  if (!req.file) return res.status(400).json({ error: 'No audio file received' });

  try {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) cleaned = '92' + cleaned.substring(1);
    else if (!cleaned.startsWith('92') && cleaned.length === 10) cleaned = '92' + cleaned;

    const last10 = cleaned.substring(cleaned.length - 10);
    const order = db.prepare(`SELECT id, store_id FROM orders WHERE phone LIKE ? AND tenant_id = ? ORDER BY id DESC LIMIT 1`).get(`%${last10}%`, tenantId);
    const storeId = order ? order.store_id : 1;
    const orderId = order ? order.id : null;

    const absolutePath = req.file.path;
    const relativeUrl = `/uploads/${req.file.filename}`;
    const clientUuid = req.body.clientUuid || null;
    let quoteContext = req.body.quoteContext || null;
    if (typeof quoteContext === 'string') {
      try {
        quoteContext = JSON.parse(quoteContext);
      } catch (e) {}
    }

    let verifiedQuote = null;
    const qid = quoteContext?.id || quoteContext?.message_id;
    if (quoteContext && qid) {
      let participant = quoteContext.participant;
      let text = quoteContext.text;
      try {
        const quotedRow = db.prepare(`
          SELECT * FROM whatsapp_messages 
          WHERE message_id = ? AND tenant_id = ?
          LIMIT 1
        `).get(qid, tenantId);

        if (quotedRow) {
          const fromMe = quotedRow.direction === 'outgoing';
          const remoteJid = cleaned + '@s.whatsapp.net';
          if (!participant) {
            participant = fromMe 
              ? (bot.sock?.user?.id ? bot.sock.user.id.split(':')[0] + '@s.whatsapp.net' : remoteJid)
              : remoteJid;
          }
          if (!text) {
            text = quotedRow.message || '';
          }
        }
      } catch (err) {
        console.warn('⚠️ Failed to verify quoted message in SQLite:', err.message);
      }

      if (!participant) {
        participant = cleaned + '@s.whatsapp.net';
      }

      verifiedQuote = {
        id: qid,
        participant: participant,
        text: text || 'Media'
      };
    }

    let dbMessageId = null;
    try {
      const result = db.prepare(`
        INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message, message_id, media_url, media_type, status, tenant_id, quote_context)
        VALUES (?, ?, ?, 'outgoing', '[Voice Note]', ?, ?, 'audio', 'sent', ?, ?)
      `).run(storeId, orderId, cleaned, clientUuid, relativeUrl, tenantId, verifiedQuote ? JSON.stringify(verifiedQuote) : null);
      dbMessageId = result.lastInsertRowid;
    } catch (err) {
      console.error('Failed to log voice note:', err.message);
    }

    // Send as PTT (Push-to-Talk) voice note via Baileys
    // isManual=true to skip bulk throttle; mediaType='voice' triggers PTT encoding
    bot.sendMessage(cleaned, '', true, absolutePath, 'voice', req.file.filename, clientUuid, verifiedQuote);

    res.json({
      success: true,
      clientUuid: clientUuid,
      message: {
        id: dbMessageId || Date.now(),
        store_id: storeId,
        order_id: orderId,
        phone: cleaned,
        direction: 'outgoing',
        message: '[Voice Note]',
        media_url: relativeUrl,
        media_type: 'audio',
        status: 'sent',
        message_id: clientUuid,
        quote_context: verifiedQuote ? JSON.stringify(verifiedQuote) : null,
        created_at: new Date().toISOString()
      }
    });
  } catch (e) {
    console.error('Voice upload error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/whatsapp-governance/chats/:phone/send-quick-reply
router.post('/chats/:phone/send-quick-reply', async (req, res) => {
  const { phone } = req.params;
  const { replyId } = req.body;
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';
  
  if (!replyId) return res.status(400).json({ error: 'Quick reply ID is required' });
  
  try {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) cleaned = '92' + cleaned.substring(1);
    else if (!cleaned.startsWith('92') && cleaned.length === 10) cleaned = '92' + cleaned;

    const last10 = cleaned.substring(cleaned.length - 10);
    // Find latest order
    const order = db.prepare(`
      SELECT id, store_id, customer_name, tracking_number, courier FROM orders 
      WHERE phone LIKE ? AND tenant_id = ?
      ORDER BY id DESC LIMIT 1
    `).get(`%${last10}%`, tenantId);

    const quickReply = db.prepare('SELECT * FROM whatsapp_quick_replies WHERE id = ?').get(Number(replyId));
    if (!quickReply) return res.status(404).json({ error: 'Quick reply template not found' });
    
    // Resolve dynamic variables
    let resolvedCaption = quickReply.caption || '';
    resolvedCaption = resolvedCaption
      .replace(/\{\{customer_name\}\}/g, order ? order.customer_name : 'Customer')
      .replace(/\{\{order_id\}\}/g, order ? order.id : '')
      .replace(/\{\{tracking_number\}\}/g, order ? order.tracking_number : '')
      .replace(/\{\{courier\}\}/g, order ? order.courier : '');
    
    let absolutePath = null;
    if (quickReply.media_url) {
      absolutePath = getMediaFilePath(quickReply.media_url);
    }
    
    const dbMsgContent = quickReply.media_url 
      ? `[${quickReply.media_type.toUpperCase()}] ${resolvedCaption}`.trim()
      : resolvedCaption;
      
    const storeId = order ? order.store_id : 1;
    const orderId = order ? order.id : null;

    const clientUuid = req.body.clientUuid || null;
    let quoteContext = req.body.quoteContext || null;
    if (typeof quoteContext === 'string') {
      try {
        quoteContext = JSON.parse(quoteContext);
      } catch (e) {}
    }

    let verifiedQuote = null;
    const qid = quoteContext?.id || quoteContext?.message_id;
    if (quoteContext && qid) {
      let participant = quoteContext.participant;
      let text = quoteContext.text;
      try {
        const quotedRow = db.prepare(`
          SELECT * FROM whatsapp_messages 
          WHERE message_id = ? AND tenant_id = ?
          LIMIT 1
        `).get(qid, tenantId);

        if (quotedRow) {
          const fromMe = quotedRow.direction === 'outgoing';
          const remoteJid = cleaned + '@s.whatsapp.net';
          if (!participant) {
            participant = fromMe 
              ? (bot.sock?.user?.id ? bot.sock.user.id.split(':')[0] + '@s.whatsapp.net' : remoteJid)
              : remoteJid;
          }
          if (!text) {
            text = quotedRow.message || '';
          }
        }
      } catch (err) {
        console.warn('⚠️ Failed to verify quoted message in SQLite:', err.message);
      }

      if (!participant) {
        participant = cleaned + '@s.whatsapp.net';
      }

      verifiedQuote = {
        id: qid,
        participant: participant,
        text: text || 'Media'
      };
    }

    let dbMessageId = null;
    try {
      const result = db.prepare(`
        INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message, message_id, media_url, media_type, status, tenant_id, quote_context)
        VALUES (?, ?, ?, 'outgoing', ?, ?, ?, ?, 'sent', ?, ?)
      `).run(storeId, orderId, cleaned, dbMsgContent, clientUuid, quickReply.media_url || null, quickReply.media_type || null, tenantId, verifiedQuote ? JSON.stringify(verifiedQuote) : null);
      dbMessageId = result.lastInsertRowid;
    } catch (err) {
      console.error('Failed to log quick reply message:', err.message);
    }
    
    // Send message via Baileys bot
    if (quickReply.media_url && absolutePath) {
      bot.sendMessage(cleaned, resolvedCaption, true, absolutePath, quickReply.media_type, null, clientUuid, verifiedQuote);
    } else {
      bot.sendMessage(cleaned, resolvedCaption, true, null, null, null, clientUuid, verifiedQuote);
    }
    
    res.json({ 
      success: true, 
      message: {
        id: dbMessageId || Date.now(),
        store_id: storeId,
        order_id: orderId,
        phone: cleaned,
        direction: 'outgoing',
        message: dbMsgContent,
        media_url: quickReply.media_url || null,
        media_type: quickReply.media_type || null,
        status: 'sent',
        quote_context: verifiedQuote ? JSON.stringify(verifiedQuote) : null,
        created_at: new Date().toISOString()
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/whatsapp-governance/chats/:phone/send-invoice
router.post('/chats/:phone/send-invoice', async (req, res) => {
  const { phone } = req.params;
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';
  try {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) cleaned = '92' + cleaned.substring(1);
    else if (!cleaned.startsWith('92') && cleaned.length === 10) cleaned = '92' + cleaned;

    const last10 = cleaned.substring(cleaned.length - 10);
    // Find latest order
    const order = db.prepare(`
      SELECT * FROM orders 
      WHERE phone LIKE ? AND tenant_id = ?
      ORDER BY id DESC LIMIT 1
    `).get(`%${last10}%`, tenantId);

    if (!order) return res.status(404).json({ error: 'No order found for this phone number to generate an invoice' });

    const invoiceFilename = `invoice_${order.id}_${Date.now()}.pdf`;
    const folderPath = path.join(DB_DIR, 'uploads');
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
    const destPath = path.join(folderPath, invoiceFilename);

    await generateInvoicePdf(order, destPath);

    const relativeUrl = `/uploads/${invoiceFilename}`;
    const caption = `📄 *Invoice for Order #${order.id || order.ref_number}* — Thank you for your business!`;
    const dbMsgContent = `[DOCUMENT] ${caption}`;

    let dbMessageId = null;
    try {
      const result = db.prepare(`
        INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message, media_url, media_type, status, tenant_id)
        VALUES (?, ?, ?, 'outgoing', ?, ?, 'document', 'sent', ?)
      `).run(order.store_id, order.id, cleaned, dbMsgContent, relativeUrl, tenantId);
      dbMessageId = result.lastInsertRowid;
    } catch (err) {
      console.error('Failed to log invoice message:', err.message);
    }

    // Send PDF document via Baileys bot
    bot.sendMessage(cleaned, caption, true, destPath, 'document', `Invoice_${order.id || order.ref_number}.pdf`);

    res.json({ 
      success: true, 
      message: {
        id: dbMessageId || Date.now(),
        store_id: order.store_id,
        order_id: order.id,
        phone: cleaned,
        direction: 'outgoing',
        message: dbMsgContent,
        media_url: relativeUrl,
        media_type: 'document',
        status: 'sent',
        created_at: new Date().toISOString()
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- 🧠 GEMINI AUTONOMOUS AI GOVERNANCE ROUTES ---

// GET /api/whatsapp-governance/gemini/settings
router.get('/gemini/settings', (req, res) => {
  try {
    const s = db.prepare('SELECT api_key, ai_active, model_name, system_prompt, strictness, auto_learning_enabled FROM gemini_bot_settings ORDER BY id DESC LIMIT 1').get();
    res.json(s || {});
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/whatsapp-governance/gemini/settings
router.post('/gemini/settings', (req, res) => {
  const { api_key, ai_active, model_name, system_prompt, strictness, auto_learning_enabled } = req.body;
  try {
    db.prepare(`
      UPDATE gemini_bot_settings SET
        api_key = ?, ai_active = ?, model_name = ?, system_prompt = ?, strictness = ?, auto_learning_enabled = ?, updated_at = datetime('now')
    `).run(api_key || '', ai_active ? 1 : 0, model_name || 'gemini-2.5-flash', system_prompt || '', strictness || 'balanced', auto_learning_enabled ? 1 : 0);

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/whatsapp-governance/gemini/profiles
router.get('/gemini/profiles', (req, res) => {
  try {
    const profiles = db.prepare('SELECT phone, customer_name, preferences, vip_status, total_orders, updated_at FROM customer_profiles ORDER BY updated_at DESC LIMIT 50').all() || [];
    res.json({ success: true, profiles });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/whatsapp-governance/gemini/memory/:phone
router.get('/gemini/memory/:phone', (req, res) => {
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';
  try {
    let cleaned = req.params.phone.replace(/\D/g, '');
    
    // Verify phone belongs to this tenant
    const hasRecord = db.prepare(`
      SELECT 1 FROM orders WHERE phone LIKE ? AND tenant_id = ?
      UNION ALL
      SELECT 1 FROM whatsapp_messages WHERE phone = ? AND tenant_id = ?
      LIMIT 1
    `).get(`%${cleaned.substring(cleaned.length - 10)}%`, tenantId, cleaned, tenantId);

    if (!hasRecord) {
      return res.status(404).json({ error: 'Chat memory not found' });
    }

    const memory = db.prepare('SELECT role, content, created_at FROM gemini_chat_memory WHERE phone = ? ORDER BY id ASC LIMIT 50').all(cleaned) || [];
    res.json({ success: true, memory });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/whatsapp-governance/gemini/audit-logs
router.get('/gemini/audit-logs', (req, res) => {
  try {
    const logs = db.prepare('SELECT audit_date, messages_analyzed, friction_points, prompt_refinements, created_at FROM gemini_audit_logs ORDER BY id DESC LIMIT 30').all() || [];
    res.json({ success: true, logs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/whatsapp-governance/gemini/trigger-audit
router.post('/gemini/trigger-audit', async (req, res) => {
  try {
    const { runNightlyAudit } = require('../engines/gemini_engine');
    const result = await runNightlyAudit();
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/whatsapp-governance/gemini/simulate-incoming
router.post('/gemini/simulate-incoming', async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ success: false, error: 'Phone and message are required.' });
    }

    const { generateAIResponse } = require('../engines/gemini_engine');
    const reply = await generateAIResponse(phone, message);

    res.json({ success: true, reply: reply || 'No response generated (check API key or fallback settings).' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// --- ⚡ RICH QUICK REPLIES CRUD & SEND ENDPOINTS ---

// GET /api/whatsapp-governance/quick-replies
router.get('/quick-replies', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM whatsapp_quick_replies ORDER BY id DESC').all();
    res.json({ success: true, quickReplies: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/whatsapp-governance/quick-replies (Upload media and save)
router.post('/quick-replies', upload.single('media'), (req, res) => {
  const { title, caption } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });
  
  try {
    let mediaUrl = null;
    let mediaType = null;
    
    if (req.file) {
      mediaUrl = `/uploads/${req.file.filename}`;
      mediaType = req.file.mimetype.startsWith('image/') ? 'image' : 'video';
    }
    
    db.prepare(`
      INSERT INTO whatsapp_quick_replies (title, media_url, media_type, caption)
      VALUES (?, ?, ?, ?)
    `).run(title, mediaUrl, mediaType, caption || '');
    
    res.json({ success: true, message: 'Quick reply saved successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/whatsapp-governance/quick-replies/:id
router.delete('/quick-replies/:id', (req, res) => {
  const { id } = req.params;
  try {
    // Delete file from disk if it exists
    const row = db.prepare('SELECT media_url FROM whatsapp_quick_replies WHERE id = ?').get(Number(id));
    if (row && row.media_url) {
      const filePath = getMediaFilePath(row.media_url);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    db.prepare('DELETE FROM whatsapp_quick_replies WHERE id = ?').run(Number(id));
    res.json({ success: true, message: 'Quick reply deleted successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/whatsapp-governance/chat/:order_id/send-quick-reply
router.post('/chat/:order_id/send-quick-reply', async (req, res) => {
  const { order_id } = req.params;
  const { replyId } = req.body;
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';
  
  if (!replyId) return res.status(400).json({ error: 'Quick reply ID is required' });
  
  try {
    const order = db.prepare('SELECT id, store_id, phone, customer_name, tracking_number, courier FROM orders WHERE id = ? AND tenant_id = ?').get(Number(order_id), tenantId);
    if (!order || !order.phone) return res.status(404).json({ error: 'Order phone not found' });
    
    const quickReply = db.prepare('SELECT * FROM whatsapp_quick_replies WHERE id = ?').get(Number(replyId));
    if (!quickReply) return res.status(404).json({ error: 'Quick reply template not found' });
    
    let cleaned = order.phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) cleaned = '92' + cleaned.substring(1);
    else if (!cleaned.startsWith('92') && cleaned.length === 10) cleaned = '92' + cleaned;
    
    // Resolve dynamic variables (e.g. {{customer_name}}, {{order_id}}, {{tracking_number}}, {{courier}})
    let resolvedCaption = quickReply.caption || '';
    resolvedCaption = resolvedCaption
      .replace(/\{\{customer_name\}\}/g, order.customer_name || 'Customer')
      .replace(/\{\{order_id\}\}/g, order.id || '')
      .replace(/\{\{tracking_number\}\}/g, order.tracking_number || '')
      .replace(/\{\{courier\}\}/g, order.courier || '');
    
    let absolutePath = null;
    if (quickReply.media_url) {
      absolutePath = getMediaFilePath(quickReply.media_url);
    }
    
    const dbMsgContent = quickReply.media_url 
      ? `[${quickReply.media_type.toUpperCase()}] ${resolvedCaption}`.trim()
      : resolvedCaption;
      
    try {
      db.prepare(`
        INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message, media_url, media_type, status, tenant_id)
        VALUES (?, ?, ?, 'outgoing', ?, ?, ?, 'sent', ?)
      `).run(order.store_id, order.id, cleaned, dbMsgContent, quickReply.media_url || null, quickReply.media_type || null, tenantId);
    } catch (err) {
      console.error('Failed to log quick reply message:', err.message);
    }
    
    // Send message via Baileys bot
    if (quickReply.media_url && absolutePath) {
      bot.sendMessage(cleaned, resolvedCaption, true, absolutePath, quickReply.media_type);
    } else {
      bot.sendMessage(cleaned, resolvedCaption, true);
    }
    
    res.json({ success: true, message: 'Quick reply sent successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- ⚙️ QUICK PILLS CRUD ENDPOINTS ---

// GET /api/whatsapp-governance/quick-pills
router.get('/quick-pills', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM whatsapp_quick_pills ORDER BY sort_order ASC').all();
    res.json({ success: true, quickPills: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/whatsapp-governance/quick-pills
router.post('/quick-pills', (req, res) => {
  const { pill_text } = req.body;
  if (!pill_text || !pill_text.trim()) return res.status(400).json({ error: 'Pill text is required' });

  try {
    const row = db.prepare('SELECT MAX(sort_order) as max_sort FROM whatsapp_quick_pills').get();
    const nextSort = (row?.max_sort || 0) + 1;

    db.prepare('INSERT INTO whatsapp_quick_pills (pill_text, sort_order) VALUES (?, ?)').run(pill_text, nextSort);
    res.json({ success: true, message: 'Quick pill saved successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/whatsapp-governance/quick-pills/:id
router.delete('/quick-pills/:id', (req, res) => {
  const { id } = req.params;
  try {
    db.prepare('DELETE FROM whatsapp_quick_pills WHERE id = ?').run(Number(id));
    res.json({ success: true, message: 'Quick pill deleted successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- 📄 PDF INVOICE AUTO-SENDER ---

// Helper function to generate professional invoice PDF using pdfkit
function generateInvoicePdf(order, destPath) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const writeStream = fs.createWriteStream(destPath);
      doc.pipe(writeStream);

      // Header Brand
      doc.fillColor('#6366f1').fontSize(20).text('TRACE ERP INVOICE', { align: 'right' });
      doc.fillColor('#475569').fontSize(10).text(`Date: ${new Date().toLocaleDateString()}`, { align: 'right' });
      doc.moveDown(1);

      // Store Contact details
      doc.fillColor('#0f172a').fontSize(12).text('TRACE E-Commerce Store', { bold: true });
      doc.fontSize(10).text('Support: support@trace.pk');
      doc.moveDown(1.5);

      // Customer section
      doc.fontSize(12).text('Bill To:', { underline: true });
      doc.fontSize(10).text(`Customer Name: ${order.customer_name || 'Valued Customer'}`);
      doc.text(`Phone: ${order.phone || ''}`);
      doc.text(`Address: ${order.address || ''}`);
      doc.text(`City: ${order.city || ''}`);
      doc.moveDown(2);

      // Table Title
      doc.fontSize(12).text('Order Items:', { underline: true });
      doc.moveDown(0.5);

      // Table Header Row
      const tableTop = doc.y;
      doc.fontSize(10).text('Item', 50, tableTop, { bold: true });
      doc.text('SKU', 250, tableTop, { bold: true });
      doc.text('Qty', 350, tableTop, { align: 'right', bold: true });
      doc.text('Price', 400, tableTop, { align: 'right', bold: true });
      doc.text('Total', 480, tableTop, { align: 'right', bold: true });

      doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

      let yPosition = tableTop + 25;
      let lineItems = [];
      try {
        lineItems = typeof order.line_items === 'string' ? JSON.parse(order.line_items) : (order.line_items || []);
      } catch (e) {
        lineItems = [];
      }

      lineItems.forEach(item => {
        doc.text(item.title || 'Product', 50, yPosition, { width: 190 });
        doc.text(item.sku || '-', 250, yPosition);
        doc.text(String(item.quantity || 1), 350, yPosition, { align: 'right' });
        doc.text(`Rs. ${parseFloat(item.price || 0).toFixed(0)}`, 400, yPosition, { align: 'right' });
        doc.text(`Rs. ${(parseFloat(item.price || 0) * parseInt(item.quantity || 1)).toFixed(0)}`, 480, yPosition, { align: 'right' });
        yPosition += 25;
      });

      doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();
      yPosition += 15;

      // Summary lines
      doc.text('Subtotal:', 350, yPosition, { align: 'right' });
      const subtotal = lineItems.reduce((acc, item) => acc + (parseFloat(item.price || 0) * parseInt(item.quantity || 1)), 0);
      doc.text(`Rs. ${subtotal.toFixed(0)}`, 480, yPosition, { align: 'right' });
      yPosition += 15;

      doc.text('Discount:', 350, yPosition, { align: 'right' });
      doc.text(`Rs. ${parseFloat(order.discount_amount || 0).toFixed(0)}`, 480, yPosition, { align: 'right' });
      yPosition += 15;

      doc.text('Courier Shipping:', 350, yPosition, { align: 'right' });
      doc.text(`Rs. ${parseFloat(order.courier_fee || 250).toFixed(0)}`, 480, yPosition, { align: 'right' });
      yPosition += 20;

      doc.fontSize(12).text('Total Amount:', 350, yPosition, { align: 'right', bold: true });
      const totalAmount = Math.max(0, subtotal - parseFloat(order.discount_amount || 0) + parseFloat(order.courier_fee || 250));
      doc.text(`Rs. ${totalAmount.toFixed(0)}`, 480, yPosition, { align: 'right', bold: true });

      // Footer brand notice
      doc.fontSize(9).fillColor('#64748b').text('Thank you for shopping with us! This is an electronically generated invoice.', 50, 700, { align: 'center' });

      doc.end();

      writeStream.on('finish', () => resolve());
      writeStream.on('error', (err) => reject(err));
    } catch (e) {
      reject(e);
    }
  });
}

// POST /api/whatsapp-governance/chat/:order_id/send-invoice
router.post('/chat/:order_id/send-invoice', async (req, res) => {
  const { order_id } = req.params;
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';
  try {
    const order = db.prepare('SELECT * FROM orders WHERE id = ? AND tenant_id = ?').get(Number(order_id), tenantId);
    if (!order || !order.phone) return res.status(404).json({ error: 'Order or customer phone not found' });

    let cleaned = order.phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) cleaned = '92' + cleaned.substring(1);
    else if (!cleaned.startsWith('92') && cleaned.length === 10) cleaned = '92' + cleaned;

    const invoiceFilename = `invoice_${order.id}_${Date.now()}.pdf`;
    const folderPath = path.join(DB_DIR, 'uploads');
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
    const destPath = path.join(folderPath, invoiceFilename);

    await generateInvoicePdf(order, destPath);

    const relativeUrl = `/uploads/${invoiceFilename}`;
    const caption = `📄 *Invoice for Order #${order.id || order.ref_number}* — Thank you for your business!`;
    const dbMsgContent = `[DOCUMENT] ${caption}`;

    try {
      db.prepare(`
        INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message, media_url, media_type, status, tenant_id)
        VALUES (?, ?, ?, 'outgoing', ?, ?, 'document', 'sent', ?)
      `).run(order.store_id, order.id, cleaned, dbMsgContent, relativeUrl, tenantId);
    } catch (err) {
      console.error('Failed to log invoice message:', err.message);
    }

    // Send PDF document via Baileys bot
    bot.sendMessage(cleaned, caption, true, destPath, 'document', `Invoice_${order.id || order.ref_number}.pdf`);

    res.json({ success: true, message: 'Invoice PDF generated and queued successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AD CAMPAIGNS — Feature 2: Ad-to-Chat Attribution
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/whatsapp-governance/ad-campaigns
router.get('/ad-campaigns', (req, res) => {
  try {
    const campaigns = db.prepare('SELECT * FROM ad_campaigns ORDER BY id DESC').all();
    res.json({ success: true, campaigns });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/whatsapp-governance/ad-campaigns
router.post('/ad-campaigns', (req, res) => {
  const { name, platform, pattern } = req.body;
  if (!name || !platform || !pattern) return res.status(400).json({ success: false, error: 'name, platform, and pattern are required' });
  try {
    const result = db.prepare('INSERT INTO ad_campaigns (name, platform, pattern) VALUES (?, ?, ?)').run(name, platform, pattern);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// PUT /api/whatsapp-governance/ad-campaigns/:id
router.put('/ad-campaigns/:id', (req, res) => {
  const { name, platform, pattern, active } = req.body;
  try {
    db.prepare('UPDATE ad_campaigns SET name = COALESCE(?, name), platform = COALESCE(?, platform), pattern = COALESCE(?, pattern), active = COALESCE(?, active) WHERE id = ?')
      .run(name || null, platform || null, pattern || null, active !== undefined ? (active ? 1 : 0) : null, req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER RISK PROFILE — Feature 3
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/whatsapp-governance/chats/:phone/risk-profile
router.get('/chats/:phone/risk-profile', (req, res) => {
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';
  try {
    const phone = req.params.phone.replace(/\D/g, '');
    const suffix = phone.substring(Math.max(0, phone.length - 10));

    const totalOrders = db.prepare(`SELECT COUNT(*) as c FROM orders WHERE REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ? AND tenant_id = ?`).get(`%${suffix}%`, tenantId);
    if (!totalOrders || totalOrders.c === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const returns = db.prepare(`
      SELECT COUNT(*) as c 
      FROM returns_log r
      INNER JOIN orders o ON r.order_id = o.id
      WHERE REPLACE(REPLACE(REPLACE(o.phone, ' ', ''), '-', ''), '+', '') LIKE ? AND o.tenant_id = ?
    `).get(`%${suffix}%`, tenantId);

    const totalCount = totalOrders?.c || 0;
    const returnCount = returns?.c || 0;
    const returnRate = totalCount > 0 ? Math.round((returnCount / totalCount) * 100) : 0;

    // Auto-compute risk flag
    let autoFlag = 'NORMAL';
    if (returnCount >= 3 || (returnRate >= 40 && totalCount >= 2)) autoFlag = 'HIGH';
    else if (returnRate >= 20 && totalCount >= 2) autoFlag = 'WATCH';

    // Fetch stored manual override
    const profile = db.prepare('SELECT risk_flag, risk_reason FROM customer_profiles WHERE phone = ?').get(phone);
    const storedFlag = profile?.risk_flag || 'NORMAL';
    // Manual HIGH/BLOCKED override takes precedence
    const finalFlag = (storedFlag === 'BLOCKED' || storedFlag === 'HIGH') ? storedFlag : autoFlag;

    res.json({
      success: true,
      totalOrders: totalCount,
      returnCount,
      returnRate,
      riskFlag: finalFlag,
      riskReason: profile?.risk_reason || null,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/whatsapp-governance/chats/:phone/risk-flag
router.post('/chats/:phone/risk-flag', (req, res) => {
  const { flag, reason } = req.body;
  const validFlags = ['NORMAL', 'WATCH', 'HIGH', 'BLOCKED'];
  if (!validFlags.includes(flag)) return res.status(400).json({ success: false, error: 'Invalid flag. Must be NORMAL, WATCH, HIGH, or BLOCKED.' });
  try {
    const phone = req.params.phone.replace(/\D/g, '');
    db.prepare(`
      INSERT INTO customer_profiles (phone, risk_flag, risk_reason, risk_updated_at, updated_at)
      VALUES (?, ?, ?, datetime('now', '+5 hours'), datetime('now', '+5 hours'))
      ON CONFLICT(phone) DO UPDATE SET
        risk_flag = excluded.risk_flag,
        risk_reason = excluded.risk_reason,
        risk_updated_at = excluded.risk_updated_at,
        updated_at = excluded.updated_at
    `).run(phone, flag, reason || null);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// STUCK PARCEL SNIPER — Feature 8
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/whatsapp-governance/sniper/queue
router.get('/sniper/queue', async (req, res) => {
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';
  try {
    const settings = db.prepare('SELECT stuck_threshold_hours FROM whatsapp_settings ORDER BY id DESC LIMIT 1').get();
    const hours = settings?.stuck_threshold_hours || 36;
    const STUCK_STATUSES = ['Consignee Not Available', 'Attempted Delivery', 'Hold', 'Address Issue', 'RTO Initiated', 'Return to Sender'];
    const stuck = db.prepare(`
      SELECT o.id, o.ref_number, o.phone, o.customer_name, o.tracking_number, o.courier,
             o.delivery_status, o.status_date
      FROM orders o
      LEFT JOIN sniper_alerts s
        ON s.order_id = o.id AND s.alert_type = 'stuck_parcel'
        AND s.sent_at > datetime('now', '+5 hours', '-48 hours')
      WHERE o.delivery_status IN (${STUCK_STATUSES.map(() => '?').join(',')})
        AND (o.status_date IS NULL OR datetime(o.status_date) < datetime('now', '+5 hours', '-' || ? || ' hours'))
        AND o.phone IS NOT NULL AND o.phone != ''
        AND s.id IS NULL
        AND o.tenant_id = ?
      ORDER BY o.id ASC LIMIT 50
    `).all(...STUCK_STATUSES, hours, tenantId);
    res.json({ success: true, queue: stuck, thresholdHours: hours });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/whatsapp-governance/sniper/fire  (body: { order_id })
router.post('/sniper/fire', async (req, res) => {
  const { order_id } = req.body;
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';
  if (!order_id) return res.status(400).json({ success: false, error: 'order_id required' });
  try {
    const { runSniperScan } = require('../engines/sniper');
    const order = db.prepare('SELECT id, phone, customer_name, ref_number, tracking_number, courier, delivery_status FROM orders WHERE id = ? AND tenant_id = ?').get(order_id, tenantId);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    // Clear recent sniper block so fire-now works even if recently alerted
    db.prepare(`DELETE FROM sniper_alerts WHERE order_id = ? AND sent_at > datetime('now', '+5 hours', '-48 hours')`).run(order_id);
    await runSniperScan();
    res.json({ success: true, message: `Sniper alert queued for order ${order.ref_number || order.id}` });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/whatsapp-governance/sniper/log
router.get('/sniper/log', (req, res) => {
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';
  try {
    const limit = parseInt(req.query.limit) || 50;
    const logs = db.prepare(`
      SELECT s.*, o.ref_number, o.customer_name
      FROM sniper_alerts s
      INNER JOIN orders o ON o.id = s.order_id AND o.tenant_id = ?
      ORDER BY s.sent_at DESC LIMIT ?
    `).all(tenantId, limit);
    res.json({ success: true, logs });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// RECEIPT OCR — Feature 10
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/whatsapp-governance/chats/:phone/ocr-scans
router.get('/chats/:phone/ocr-scans', (req, res) => {
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';
  try {
    const phone = req.params.phone.replace(/\D/g, '');
    
    // Verify phone belongs to this tenant
    const hasRecord = db.prepare(`
      SELECT 1 FROM orders WHERE phone LIKE ? AND tenant_id = ?
      UNION ALL
      SELECT 1 FROM whatsapp_messages WHERE phone = ? AND tenant_id = ?
      LIMIT 1
    `).get(`%${phone.substring(phone.length - 10)}%`, tenantId, phone, tenantId);

    if (!hasRecord) {
      return res.status(404).json({ error: 'OCR scans not found' });
    }

    const scans = db.prepare('SELECT * FROM payment_ocr_scans WHERE phone = ? ORDER BY scanned_at DESC LIMIT 10').all(phone);
    res.json({ success: true, scans });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/whatsapp-governance/chats/:phone/ocr-verify  (body: { scan_id, action: 'confirm'|'reject' })
router.post('/chats/:phone/ocr-verify', (req, res) => {
  const { scan_id, action } = req.body;
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';
  if (!scan_id || !['confirm', 'reject'].includes(action)) return res.status(400).json({ success: false, error: 'scan_id and action (confirm/reject) required' });
  try {
    const status = action === 'confirm' ? 'matched' : 'rejected';
    const scan = db.prepare('SELECT * FROM payment_ocr_scans WHERE id = ?').get(scan_id);
    if (!scan) return res.status(404).json({ error: 'Scan not found' });

    if (scan.order_id) {
      const order = db.prepare('SELECT id FROM orders WHERE id = ? AND tenant_id = ?').get(scan.order_id, tenantId);
      if (!order) return res.status(404).json({ error: 'Associated order not found for this tenant' });
    }

    db.prepare('UPDATE payment_ocr_scans SET status = ? WHERE id = ?').run(status, scan_id);
    if (action === 'confirm' && scan?.order_id && scan?.detected_amount) {
      db.prepare(`UPDATE orders SET payment_status = 'OCR Verified', paid_amount = ?, payment_ref = ? WHERE id = ? AND tenant_id = ?`)
        .run(scan.detected_amount, scan.detected_txn_id || 'Manual OCR', scan.order_id, tenantId);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// COD VERIFICATION TRIGGER — Feature 5 (Manual trigger from portal)
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/whatsapp-governance/cod-verify/trigger  body: { order_id }
router.post('/cod-verify/trigger', async (req, res) => {
  const { order_id } = req.body;
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';
  if (!order_id) return res.status(400).json({ success: false, error: 'order_id required' });
  try {
    const order = db.prepare('SELECT id, phone, customer_name, ref_number FROM orders WHERE id = ? AND tenant_id = ?').get(order_id, tenantId);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    if (!order.phone) return res.status(400).json({ success: false, error: 'Order has no phone number' });

    const { dispatchCODVerification } = require('../engines/cod_verifier');
    // Fire-and-forget — Rule D
    setImmediate(() => dispatchCODVerification(order));

    res.json({ success: true, message: `COD verification queued for order ${order.ref_number || order_id}` });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
