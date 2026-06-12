const express = require('express');
const router = express.Router();
const { DB_DIR } = require('../db');
const bot = require('../engines/whatsapp_bot');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const waGovernanceService = require('../services/waGovernanceService');

// STRICT JID NORMALIZATION UTILITY
function normalizePhone(raw) {
  if (!raw) return '';
  let n = String(raw).split('@')[0].replace(/[\+\-\s]/g, '').replace(/\D/g, '');
  if (n.startsWith('9292') && n.length > 12) {
    n = n.substring(2);
  }
  if (n.startsWith('920') && n.length === 13) {
    n = '92' + n.substring(3);
  }
  if (n.startsWith('0') && n.length === 11) {
    n = '92' + n.substring(1);
  }
  else if (!n.startsWith('92') && n.length === 10) {
    n = '92' + n;
  }
  return n;
}

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

// Mount split sub-routers
router.use('/', require('./whatsapp/wa-templates'));
router.use('/', require('./whatsapp/wa-broadcasts'));
router.use('/', require('./whatsapp/wa-optouts'));
router.use('/', require('./whatsapp/wa-rules'));

// GET /api/whatsapp-governance/chat/:order_id
router.get('/chat/:order_id', async (req, res) => {
  const { order_id } = req.params;
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';
  try {
    const order = await waGovernanceService.getOrderById(order_id, tenantId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (!order.phone) {
      return res.json({ order, messages: [] });
    }

    const cleaned = normalizePhone(order.phone);

    const dbMessages = await waGovernanceService.getMessagesForChat(cleaned, order.id, tenantId);

    const baileysMessages = typeof bot.getChatHistory === 'function' ? bot.getChatHistory(cleaned) : [];

    const merged = [...dbMessages];
    for (const bm of baileysMessages) {
      const exists = merged.some(dm => dm.message.trim() === bm.message.trim());
      if (!exists) {
        merged.push(bm);
      }
    }

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
    const order = await waGovernanceService.getOrderForSend(order_id, tenantId);
    if (!order || !order.phone) return res.status(404).json({ error: 'Order phone not found' });

    console.log(`[WA-SEND-ORDER-MANUAL] Inbound payload: orderId="${order_id}", phone="${order.phone}", message_length=${message?.length}`);

    const cleaned = normalizePhone(order.phone);
    const jid = cleaned + '@s.whatsapp.net';
    console.log(`[WA-SEND-ORDER-MANUAL] Formatted JID: "${jid}"`);
    console.log(`[WA-SEND-ORDER-MANUAL] Active Baileys socket connected: ${!!bot.sock}, status: "${bot.status}"`);

    const crypto = require('crypto');
    const clientUuid = crypto.randomUUID();
    let dbMessageId = null;

    try {
      const result = await waGovernanceService.saveOutgoingMessage({
        storeId: order.store_id,
        orderId: order.id,
        phone: cleaned,
        message,
        messageId: clientUuid,
        tenantId
      });
      dbMessageId = result.lastInsertRowid;
    } catch (err) {
      console.error('Failed to save manual order message in DB:', err.message);
    }

    const sendResult = await bot.sendMessage(cleaned, message, true, null, null, null, clientUuid);
    if (sendResult && sendResult.success === false) {
      console.error(`[WA-SEND-ORDER-ERROR] bot.sendMessage failed: ${sendResult.error}`);
      return res.status(500).json({ error: sendResult.error || 'Failed to dispatch message via Baileys socket' });
    }

    const newMsg = {
      id: dbMessageId || Date.now(),
      store_id: order.store_id,
      order_id: order.id,
      phone: cleaned,
      direction: 'outgoing',
      message,
      status: 'sent',
      message_id: clientUuid,
      created_at: new Date().toISOString()
    };

    res.json({ success: true, message: newMsg });
  } catch (e) {
    console.error('[WA-SEND-ORDER-CATCH]', e);
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
    const order = await waGovernanceService.getOrderForUploadMedia(order_id, tenantId);
    if (!order || !order.phone) return res.status(404).json({ error: 'Order phone not found' });

    const cleaned = normalizePhone(order.phone);

    const absolutePath = req.file.path;
    
    const mediaType = req.file.mimetype.startsWith('image/') ? 'image' : 
                      req.file.mimetype.startsWith('audio/') ? 'audio' :
                      req.file.mimetype.startsWith('video/') ? 'video' : 'document';
                      
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
    const order = await waGovernanceService.getOrderForSendImages(order_id, tenantId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!order.phone) return res.status(400).json({ error: 'Order phone not found' });

    const cleaned = normalizePhone(order.phone);

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
        await waGovernanceService.saveOutgoingTextMessageSimple({
          storeId: order.store_id,
          orderId: order.id,
          phone: cleaned,
          message: dbMessageContent,
          tenantId
        });
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
    const order = await waGovernanceService.getOrderForSend(order_id, tenantId);
    if (!order || !order.phone) return res.status(404).json({ error: 'Order phone not found' });

    const cleaned = normalizePhone(order.phone);

    if (typeof bot.fetchHistoryForPhone === 'function') {
      const result = await bot.fetchHistoryForPhone(cleaned);
      if (!result.success) {
        return res.status(400).json({ error: result.error || 'Failed to fetch history' });
      }
    }

    const dbMessages = await waGovernanceService.getMessagesForChat(cleaned, order.id, tenantId);

    const baileysMessages = typeof bot.getChatHistory === 'function' ? bot.getChatHistory(cleaned) : [];

    const merged = [...dbMessages];
    for (const bm of baileysMessages) {
      const exists = merged.some(dm => dm.message.trim() === bm.message.trim());
      if (!exists) {
        merged.push(bm);
      }
    }

    merged.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    res.json({ success: true, messages: merged });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/whatsapp-governance/chats
router.get('/chats', async (req, res) => {
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';
  try {
    const chats = await waGovernanceService.getRecentChats(tenantId);
    res.json({ success: true, chats });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/whatsapp-governance/chats/:phone
router.get('/chats/:phone', async (req, res) => {
  const { phone } = req.params;
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';
  try {
    const normalized = normalizePhone(phone);

    let dbMessages = [];
    try {
      dbMessages = await waGovernanceService.getChatMessages(normalized, tenantId);
    } catch (err) {
      throw err;
    }

    const baileysMessages = typeof bot.getChatHistory === 'function' ? bot.getChatHistory(normalized) : [];

    const merged = [...dbMessages];
    for (const bm of baileysMessages) {
      const exists = merged.some(dm => dm.message.trim() === bm.message.trim());
      if (!exists) {
        merged.push(bm);
      }
    }

    merged.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    let orderHistory = [];
    try {
      orderHistory = await waGovernanceService.getOrderHistoryByPhone(normalized, tenantId);
    } catch (err) {
      throw err;
    }

    if (dbMessages.length === 0 && orderHistory.length === 0) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const latestOrder = orderHistory[0] || null;

    let geminiMemoryText = null;
    try {
      const profile = await waGovernanceService.getCustomerProfile(normalized);
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
    res.status(500).json({ error: e.message });
  }
});

// POST /api/whatsapp-governance/chats/:phone/read
router.post('/chats/:phone/read', async (req, res) => {
  const { phone } = req.params;
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';
  try {
    const normalized = normalizePhone(phone);
    
    const latestIncoming = await waGovernanceService.getLatestIncomingMessage(normalized, tenantId);

    if (latestIncoming) {
      await waGovernanceService.updateMessageStatus(latestIncoming.id, 'read');
      
      const order = await waGovernanceService.getLatestOrderByPhone(normalized, tenantId);
      
      if (order && order.shopify_order_id) {
        try {
          const { broadcast } = require('../sse');
          broadcast('order_updated', { storeId: order.store_id, shopifyOrderId: order.shopify_order_id });
        } catch (err) {}
      }
    }
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/whatsapp-governance/chats/:phone/send
router.post('/chats/:phone/send', async (req, res) => {
  const { phone } = req.params;
  const { message } = req.body;
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';

  if (!message) return res.status(400).json({ error: 'Message cannot be empty' });

  console.log(`[WA-SEND-MANUAL] Inbound payload from frontend: phone="${phone}", message_length=${message?.length}, tenantId="${tenantId}"`);

  try {
    const cleaned = normalizePhone(phone);
    const jid = cleaned + '@s.whatsapp.net';
    console.log(`[WA-SEND-MANUAL] Formatted JID: "${jid}"`);
    console.log(`[WA-SEND-MANUAL] Active Baileys socket connected: ${!!bot.sock}, status: "${bot.status}"`);

    const order = await waGovernanceService.getLatestOrderByPhone(cleaned, tenantId);

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
        const quotedRow = await waGovernanceService.getMessageByMessageId(qid, tenantId);

        if (quotedRow) {
          const fromMe = quotedRow.direction === 'outgoing';
          const remoteJid = jid;
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
        participant = jid;
      }

      verifiedQuote = {
        id: qid,
        participant: participant,
        text: text || 'Media'
      };
    }

    let dbMessageId = null;
    try {
      const result = await waGovernanceService.saveOutgoingMessage({
        storeId,
        orderId,
        phone: cleaned,
        message,
        messageId: clientUuid,
        tenantId,
        quoteContext: verifiedQuote
      });
      dbMessageId = result.lastInsertRowid;
    } catch (err) {
      console.error('Failed to save manual chat message:', err.message);
    }

    const sendResult = await bot.sendMessage(cleaned, message, true, null, null, null, clientUuid, verifiedQuote);
    if (sendResult && sendResult.success === false) {
      console.error(`[WA-SEND-MANUAL-ERROR] bot.sendMessage failed: ${sendResult.error}`);
      return res.status(500).json({ error: sendResult.error || 'Failed to dispatch message via Baileys socket' });
    }

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

    if (order && order.shopify_order_id) {
      try {
        const { broadcast } = require('../sse');
        broadcast('order_updated', { storeId: order.store_id, shopifyOrderId: order.shopify_order_id });
      } catch (err) {}
    }

    res.json({ success: true, message: newMsg });
  } catch (e) {
    console.error('[WA-SEND-MANUAL-CATCH]', e);
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
    const cleaned = normalizePhone(phone);

    const order = await waGovernanceService.getLatestOrderByPhone(cleaned, tenantId);

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
        const quotedRow = await waGovernanceService.getMessageByMessageId(qid, tenantId);

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
      const result = await waGovernanceService.saveOutgoingMediaMessage({
        storeId,
        orderId,
        phone: cleaned,
        message: dbMsgContent,
        messageId: clientUuid,
        mediaUrl: relativeUrl,
        mediaType,
        tenantId,
        quoteContext: verifiedQuote
      });
      dbMessageId = result.lastInsertRowid;
    } catch (err) {
      console.error('Failed to log manual media message:', err.message);
    }

    bot.sendMessage(cleaned, caption, true, absolutePath, mediaType, req.file.originalname, clientUuid, verifiedQuote);

    if (order && order.shopify_order_id) {
      try {
        const { broadcast } = require('../sse');
        broadcast('order_updated', { storeId: order.store_id, shopifyOrderId: order.shopify_order_id });
      } catch (err) {}
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
router.post('/chats/:phone/log-call-handoff', async (req, res) => {
  const { phone } = req.params;
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';
  try {
    const cleaned = normalizePhone(phone);

    const order = await waGovernanceService.getLatestOrderByPhone(cleaned, tenantId);
    const storeId = order ? order.store_id : 1;
    const orderId = order ? order.id : null;

    const systemMsg = '📞 Agent initiated native WhatsApp handoff call.';
    let dbMessageId = null;
    try {
      const result = await waGovernanceService.saveOutgoingTextMessageSimple({
        storeId,
        orderId,
        phone: cleaned,
        message: systemMsg,
        tenantId
      });
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
  limits: { fileSize: 16 * 1024 * 1024 },
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
    const cleaned = normalizePhone(phone);

    const order = await waGovernanceService.getLatestOrderByPhone(cleaned, tenantId);
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
        const quotedRow = await waGovernanceService.getMessageByMessageId(qid, tenantId);

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
      const result = await waGovernanceService.saveOutgoingMediaMessage({
        storeId,
        orderId,
        phone: cleaned,
        message: '[Voice Note]',
        messageId: clientUuid,
        mediaUrl: relativeUrl,
        mediaType: 'audio',
        tenantId,
        quoteContext: verifiedQuote
      });
      dbMessageId = result.lastInsertRowid;
    } catch (err) {
      console.error('Failed to log voice note:', err.message);
    }

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
    const cleaned = normalizePhone(phone);
    const jid = cleaned + '@s.whatsapp.net';

    const order = await waGovernanceService.getLatestOrderByPhone(cleaned, tenantId);

    const quickReply = await waGovernanceService.getQuickReplyTemplate(replyId, tenantId);
    if (!quickReply) return res.status(404).json({ error: 'Quick reply template not found' });
    
    quickReply.buttons = [];
    try {
      quickReply.buttons = await waGovernanceService.getQuickReplyButtons(quickReply.id);
    } catch (_) {}

    let resolvedCaption = quickReply.text || quickReply.caption || '';
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
        const quotedRow = await waGovernanceService.getMessageByMessageId(qid, tenantId);

        if (quotedRow) {
          const fromMe = quotedRow.direction === 'outgoing';
          const remoteJid = jid;
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
        participant = jid;
      }

      verifiedQuote = {
        id: qid,
        participant: participant,
        text: text || 'Media'
      };
    }

    let dbMessageId = null;
    try {
      const result = await waGovernanceService.saveOutgoingMediaMessage({
        storeId,
        orderId,
        phone: cleaned,
        message: dbMsgContent,
        messageId: clientUuid,
        mediaUrl: quickReply.media_url || null,
        mediaType: quickReply.media_type || null,
        tenantId,
        quoteContext: verifiedQuote
      });
      dbMessageId = result.lastInsertRowid;
    } catch (err) {
      console.error('Failed to log quick reply message:', err.message);
    }
    
    const buttonsList = quickReply.buttons && quickReply.buttons.length > 0 ? quickReply.buttons : null;
    const buttonsMode = quickReply.buttons_mode || 'native';
    let sendResult;
    if (quickReply.media_url && absolutePath) {
      sendResult = await bot.sendMessage(cleaned, resolvedCaption, true, absolutePath, quickReply.media_type, null, clientUuid, verifiedQuote, buttonsList, buttonsMode);
    } else {
      sendResult = await bot.sendMessage(cleaned, resolvedCaption, true, null, null, null, clientUuid, verifiedQuote, buttonsList, buttonsMode);
    }

    if (sendResult && sendResult.success === false) {
      console.error(`[WA-SEND-QR-ERROR] bot.sendMessage failed: ${sendResult.error}`);
      return res.status(500).json({ error: sendResult.error || 'Failed to dispatch quick reply via Baileys socket' });
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

// Helper function to generate professional invoice PDF using pdfkit
function generateInvoicePdf(order, destPath) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const writeStream = fs.createWriteStream(destPath);
      doc.pipe(writeStream);

      doc.fillColor('#6366f1').fontSize(20).text('TRACE ERP INVOICE', { align: 'right' });
      doc.fillColor('#475569').fontSize(10).text(`Date: ${new Date().toLocaleDateString()}`, { align: 'right' });
      doc.moveDown(1);

      doc.fillColor('#0f172a').fontSize(12).text('TRACE E-Commerce Store', { bold: true });
      doc.fontSize(10).text('Support: support@trace.pk');
      doc.moveDown(1.5);

      doc.fontSize(12).text('Bill To:', { underline: true });
      doc.fontSize(10).text(`Customer Name: ${order.customer_name || 'Valued Customer'}`);
      doc.text(`Phone: ${order.phone || ''}`);
      doc.text(`Address: ${order.address || ''}`);
      doc.text(`City: ${order.city || ''}`);
      doc.moveDown(2);

      doc.fontSize(12).text('Order Items:', { underline: true });
      doc.moveDown(0.5);

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

      doc.fontSize(9).fillColor('#64748b').text('Thank you for shopping with us! This is an electronically generated invoice.', 50, 700, { align: 'center' });

      doc.end();

      writeStream.on('finish', () => resolve());
      writeStream.on('error', (err) => reject(err));
    } catch (e) {
      reject(e);
    }
  });
}

// POST /api/whatsapp-governance/chats/:phone/send-invoice
router.post('/chats/:phone/send-invoice', async (req, res) => {
  const { phone } = req.params;
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';
  try {
    const cleaned = normalizePhone(phone);

    const order = await waGovernanceService.getLatestOrderByPhone(cleaned, tenantId);

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
      const result = await waGovernanceService.saveOutgoingMediaMessageSimple({
        storeId: order.store_id,
        orderId: order.id,
        phone: cleaned,
        message: dbMsgContent,
        mediaUrl: relativeUrl,
        mediaType: 'document',
        tenantId
      });
      dbMessageId = result.lastInsertRowid;
    } catch (err) {
      console.error('Failed to log invoice message:', err.message);
    }

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

// POST /api/whatsapp-governance/chat/:order_id/send-quick-reply
router.post('/chat/:order_id/send-quick-reply', async (req, res) => {
  const { order_id } = req.params;
  const { replyId } = req.body;
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';
  
  if (!replyId) return res.status(400).json({ error: 'Quick reply ID is required' });
  
  try {
    const order = await waGovernanceService.getOrderForSendQuickReply(order_id, tenantId);
    if (!order || !order.phone) return res.status(404).json({ error: 'Order phone not found' });
    
    const quickReply = await waGovernanceService.getGlobalQuickReplyTemplate(replyId);
    if (!quickReply) return res.status(404).json({ error: 'Quick reply template not found' });
    
    const cleaned = normalizePhone(order.phone);
    
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
      await waGovernanceService.saveOutgoingMediaMessageSimple({
        storeId: order.store_id,
        orderId: order.id,
        phone: cleaned,
        message: dbMsgContent,
        mediaUrl: quickReply.media_url || null,
        mediaType: quickReply.media_type || null,
        tenantId
      });
    } catch (err) {
      console.error('Failed to log quick reply message:', err.message);
    }
    
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

// POST /api/whatsapp-governance/chat/:order_id/send-invoice
router.post('/chat/:order_id/send-invoice', async (req, res) => {
  const { order_id } = req.params;
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';
  try {
    const order = await waGovernanceService.getFullOrderById(order_id, tenantId);
    if (!order || !order.phone) return res.status(404).json({ error: 'Order or customer phone not found' });

    const cleaned = normalizePhone(order.phone);

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
      await waGovernanceService.saveOutgoingMediaMessageSimple({
        storeId: order.store_id,
        orderId: order.id,
        phone: cleaned,
        message: dbMsgContent,
        mediaUrl: relativeUrl,
        mediaType: 'document',
        tenantId
      });
    } catch (err) {
      console.error('Failed to log invoice message:', err.message);
    }

    bot.sendMessage(cleaned, caption, true, destPath, 'document', `Invoice_${order.id || order.ref_number}.pdf`);

    res.json({ success: true, message: 'Invoice PDF generated and queued successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/whatsapp-governance/test-poll
router.post('/test-poll', async (req, res) => {
  const { phone, order_id } = req.body;
  try {
    const order = await waGovernanceService.getOrderByIdNoTenant(order_id);
    const { dispatchCODVerification } = require('../engines/cod_verifier');
    
    await dispatchCODVerification(order);
    res.json({ success: true, message: 'Poll triggered successfully' });
  } catch (e) {
    console.error('❌ POLL TESTER FAILED:', e);
    res.status(500).json({ success: false, error: e.message, stack: e.stack });
  }
});

// GET /api/whatsapp-governance/health
router.get('/health', async (req, res) => {
  const status = {
    status: 'OK',
    uptime: process.uptime(),
    db_size: require('fs').statSync('database.sqlite').size,
    bot_connected: global.bot ? global.bot.isOnline() : false,
    timestamp: new Date().toISOString()
  };
  res.json(status);
});

module.exports = router;
