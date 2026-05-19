const express = require('express');
const router = express.Router();
const { db } = require('../db');
const bot = require('../engines/whatsapp_bot');

// GET /api/whatsapp-governance/settings
router.get('/settings', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM whatsapp_settings ORDER BY id DESC LIMIT 1').get();
    res.json(row || {});
  } catch (e) {
    res.status(500).json({ error: e.message });
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
  try {
    const order = db.prepare('SELECT id, store_id, phone, customer_name, wa_verification_status FROM orders WHERE id = ?').get(Number(order_id));
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
      WHERE phone LIKE ? OR order_id = ? 
      ORDER BY id ASC
    `).all(`%${cleaned.substring(cleaned.length - 10)}%`, order.id);

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

  if (!message) return res.status(400).json({ error: 'Message cannot be empty' });

  try {
    const order = db.prepare('SELECT id, store_id, phone, customer_name FROM orders WHERE id = ?').get(Number(order_id));
    if (!order || !order.phone) return res.status(404).json({ error: 'Order phone not found' });

    let cleaned = order.phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) cleaned = '92' + cleaned.substring(1);
    else if (!cleaned.startsWith('92') && cleaned.length === 10) cleaned = '92' + cleaned;

    // Insert into SQLite database immediately so it persists permanently
    try {
      db.prepare(`
        INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message, status)
        VALUES (?, ?, ?, 'outgoing', ?, 'sent')
      `).run(order.store_id, order.id, cleaned, message);
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

// POST /api/whatsapp-governance/chat/:order_id/fetch-history
router.post('/chat/:order_id/fetch-history', async (req, res) => {
  const { order_id } = req.params;
  try {
    const order = db.prepare('SELECT id, store_id, phone, customer_name FROM orders WHERE id = ?').get(Number(order_id));
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
      WHERE phone LIKE ? OR order_id = ? 
      ORDER BY id ASC
    `).all(`%${cleaned.substring(cleaned.length - 10)}%`, order.id);

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
  try {
    let cleaned = req.params.phone.replace(/\D/g, '');
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

module.exports = router;
