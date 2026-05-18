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
  const { mode, cod_verification_enabled, attempted_delivery_enabled, dispatch_alerts_enabled, min_delay_sec, max_delay_sec, max_per_hour, cooling_period_min, cod_template, attempted_template, dispatch_template } = req.body;
  try {
    db.prepare(`
      UPDATE whatsapp_settings SET
        mode = ?, cod_verification_enabled = ?, attempted_delivery_enabled = ?, dispatch_alerts_enabled = ?, min_delay_sec = ?, max_delay_sec = ?, max_per_hour = ?, cooling_period_min = ?, cod_template = ?, attempted_template = ?, dispatch_template = ?, updated_at = datetime('now')
    `).run(mode, cod_verification_enabled ? 1 : 0, attempted_delivery_enabled ? 1 : 0, dispatch_alerts_enabled ? 1 : 0, Number(min_delay_sec), Number(max_delay_sec), Number(max_per_hour), Number(cooling_period_min), cod_template, attempted_template, dispatch_template);

    // Update bot in memory
    bot.setSettings({ minDelaySec: min_delay_sec, maxDelaySec: max_delay_sec, maxPerHour: max_per_hour, coolingPeriodMin: cooling_period_min });

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

    const messages = db.prepare(`
      SELECT * FROM whatsapp_messages 
      WHERE phone LIKE ? OR order_id = ? 
      ORDER BY id ASC
    `).all(`%${cleaned.substring(cleaned.length - 10)}%`, order.id);

    res.json({ order, messages });
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

    // Queue message via Baileys bot
    bot.sendMessage(cleaned, message);

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

module.exports = router;
