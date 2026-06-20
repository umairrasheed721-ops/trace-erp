const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('./auth');
const { runWatchdog } = require('../engines/watchdog');
const { syncPostEx } = require('../engines/tracking/postex');
const whatsappService = require('../services/whatsappService');

// GET /api/watchdog?store_id=1
router.get('/', authenticateToken, (req, res) => {
  const { store_id } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });
  const tenantId = req.user?.tenant_id || 'default';

  const results = db.prepare(`
    SELECT w.*, o.id as order_id, o.customer_name, o.phone, o.ref_number
    FROM watchdog_results w
    LEFT JOIN orders o ON w.tracking_number = o.tracking_number AND w.store_id = o.store_id
    WHERE w.store_id = ? AND o.tenant_id = ?
    ORDER BY w.created_at DESC LIMIT 500
  `).all(Number(store_id), tenantId);

  res.json(results);
});

// POST /api/watchdog/run - Manually trigger watchdog for a store (completely offline)
router.post('/run', authenticateToken, async (req, res) => {
  const { store_id } = req.body;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });

  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(store_id);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  try {
    // Run the offline watchdog audit which will check saved tracking history in DB
    console.log(`🚀 [Watchdog Route] Triggering offline watchdog audit for store ${store.shop_domain}...`);
    const auditRes = await runWatchdog(store);
    res.json({ 
      success: true, 
      result: { 
        audited: auditRes.audited, 
        candidatesCount: auditRes.candidatesCount
      } 
    });
  } catch (e) {
    console.error(`[Watchdog Route Error] Failed to run offline watchdog audit:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/watchdog/send-warning - Send rider fraud warning message to customer
router.post('/send-warning', authenticateToken, async (req, res) => {
  const { tracking_number } = req.body;
  if (!tracking_number) return res.status(400).json({ error: 'tracking_number required' });
  const tenantId = req.user?.tenant_id || 'default';

  const order = db.prepare(`
    SELECT id, store_id, customer_name, phone, ref_number 
    FROM orders 
    WHERE tracking_number = ? AND tenant_id = ?
    LIMIT 1
  `).get(tracking_number, tenantId);

  if (!order) return res.status(404).json({ error: 'Order not found' });

  // Format Pakistani numbers (e.g. 03xx -> 923xx)
  let cleanPhone = order.phone.toString().replace(/[^0-9]/g, '');
  if (cleanPhone.startsWith('03')) {
    cleanPhone = '92' + cleanPhone.substring(1);
  }

  const messageText = `Hi ${order.customer_name || 'Customer'}, rider ne aapke order #${order.ref_number || ''} ki delivery attempt fail report ki hai. Kya rider ne aapse delivery ke liye rabta kiya tha?`;

  const botInstance = whatsappService.getBotForTenant(tenantId);
  if (!botInstance || botInstance.status !== 'CONNECTED' || !botInstance.sock) {
    return res.json({ 
      success: false, 
      error: 'WhatsApp Bot is offline. Use direct link instead.',
      fallbackUrl: `https://wa.me/${cleanPhone}?text=${encodeURIComponent(messageText)}`
    });
  }

  try {
    const sendResult = await whatsappService.sendText(cleanPhone, messageText, tenantId);
    
    // Save to database
    db.prepare(`
      INSERT INTO whatsapp_messages (store_id, order_id, phone, direction, message, message_id, status, tenant_id)
      VALUES (?, ?, ?, 'outgoing', ?, ?, 'sent', ?)
    `).run(order.store_id, order.id, cleanPhone, messageText, sendResult.messageId || null, tenantId);

    // Broadcast message via WebSocket
    try {
      const { broadcast } = require('../websocket');
      broadcast('message', {
        order_id: order.id,
        message: {
          id: Date.now(),
          store_id: order.store_id,
          order_id: order.id,
          phone: cleanPhone,
          direction: 'outgoing',
          message: messageText,
          message_id: sendResult.messageId,
          status: 'sent',
          created_at: new Date().toISOString()
        }
      });
    } catch (wsErr) {}

    return res.json({ success: true, messageId: sendResult.messageId });
  } catch (err) {
    console.error('Watchdog warning send error:', err);
    return res.json({ 
      success: false, 
      error: err.message,
      fallbackUrl: `https://wa.me/${cleanPhone}?text=${encodeURIComponent(messageText)}`
    });
  }
});

// DELETE /api/watchdog/:id - Remove a watchdog result (allow re-audit)
router.delete('/:id', authenticateToken, (req, res) => {
  db.prepare('DELETE FROM watchdog_results WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
