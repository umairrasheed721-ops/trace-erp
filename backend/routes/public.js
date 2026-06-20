const express = require('express');
const router = express.Router();
const { db, logAction } = require('../db');
const { addClient } = require('../sse');

// ── Reviews public endpoints (sub-mount) ──
const reviewsRouter = require('./reviews');
router.use('/', reviewsRouter);

// SSE Endpoint for Global Progress and Notifications
router.get('/sse', (req, res) => addClient(req, res));

// Public Order Confirmation
router.get('/confirm-order/:token', (req, res) => {
  const { token } = req.params;
  if (!token) return res.status(400).send('Invalid Link');

  try {
    const order = db.prepare('SELECT id, ref_number, customer_name, delivery_status FROM orders WHERE confirmation_token = ?').get(token);
    
    if (!order) {
      return res.status(404).send('<h1>Order Not Found</h1><p>This link may have expired or is invalid.</p>');
    }

    if (order.delivery_status === 'Confirmed on WhatsApp' || order.delivery_status === 'Confirmed') {
      return res.send(`
        <div style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h1 style="color: #4CAF50;">✅ Already Confirmed</h1>
          <p>Hi ${order.customer_name}, your order #${order.ref_number || order.id} is already confirmed. We are processing it!</p>
        </div>
      `);
    }

    // Update the order status
    db.prepare("UPDATE orders SET delivery_status = 'Confirmed on WhatsApp', status_date = datetime('now') WHERE id = ?").run(order.id);

    res.send(`
      <div style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h1 style="color: #4CAF50;">✅ Order Confirmed!</h1>
        <p>Thank you ${order.customer_name}! Your order #${order.ref_number || order.id} has been confirmed on WhatsApp.</p>
        <p>Our team will process it shortly.</p>
      </div>
    `);
  } catch (err) {
    console.error('Public confirmation error', err);
    res.status(500).send('Server Error');
  }
});

// --- 🐞 PUBLIC CRASH REPORTING ---
router.post('/crash-report', (req, res) => {
  const { error, info, url } = req.body;
  
  logAction({
    action: 'FRONTEND_CRASH',
    level: 'ERROR',
    details: { url, error: error?.substring(0, 500) },
    snapshot: info
  });

  res.json({ success: true });
});

// --- 🔍 TEMP POLL DIAGNOSTIC (remove after debugging) ---
router.get('/poll-diag', (req, res) => {
  try {
    const crypto = require('crypto');
    const result = {};

    // whatsapp_polls table
    try {
      result.polls = db.prepare('SELECT id, message_id, remote_jid, poll_name, poll_options, created_at FROM whatsapp_polls ORDER BY id DESC LIMIT 5').all();
      result.poll_count = db.prepare('SELECT COUNT(*) as c FROM whatsapp_polls').get().c;
    } catch (e) {
      result.polls_error = e.message;
    }

    // temporary timeline diagnostics
    try {
      result.postex_errors = db.prepare(`
        SELECT id, level, message, module, created_at 
        FROM system_logs 
        WHERE message LIKE '%PostEx%' OR message LIKE '%Premature close%' 
        ORDER BY created_at DESC 
        LIMIT 50
      `).all();
      
      result.sync_audits = db.prepare(`
        SELECT id, tracking_number, message, timestamp, store_id, level 
        FROM sync_audit 
        ORDER BY timestamp DESC 
        LIMIT 50
      `).all();

      result.postex_orders = db.prepare(`
        SELECT id, shopify_order_id, ref_number, tracking_number, delivery_status, courier_status, status_date 
        FROM orders 
        WHERE LOWER(courier) = 'postex' 
        ORDER BY status_date DESC 
        LIMIT 20
      `).all();
    } catch (e) {
      result.timeline_error = e.message;
    }

    // recent orders
    try {
      result.recent_orders = db.prepare('SELECT id, shopify_order_id, phone, delivery_status, store_id FROM orders ORDER BY id DESC LIMIT 5').all();
    } catch (e) {
      result.orders_error = e.message;
    }

    // stores
    try {
      result.stores = db.prepare("SELECT id, shop_domain FROM stores").all();
    } catch (e) {
      result.stores_error = e.message;
    }

    // SHA-256 test
    const opts = ['✅ Confirm Order', '❌ Cancel Order', '✏️ Edit Order'];
    result.sha256_test = opts.map(o => ({ option: o, hash: crypto.createHash('sha256').update(o).digest('hex') }));

    // All tables
    try {
      result.tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(t => t.name);
    } catch (e) {
      result.tables_error = e.message;
    }

    // system_logs
    try {
      result.system_logs = db.prepare("SELECT * FROM system_logs ORDER BY id DESC LIMIT 30").all();
    } catch (e) {
      result.system_logs_error = e.message;
    }

    // Bots status
    try {
      const botModule = require('../engines/whatsapp_bot');
      result.bots = [];
      if (botModule.sessions) {
        for (const [tenantId, botInstance] of botModule.sessions.entries()) {
          result.bots.push({
            tenantId,
            status: botInstance.status,
            activeNumber: botInstance.activeNumber,
            reconnectAttempts: botInstance.reconnectAttempts
          });
        }
      }
    } catch (e) {
      result.bots_error = e.message;
    }

    // Session keys list
    try {
      result.session_keys = db.prepare("SELECT key FROM wa_session_store WHERE key LIKE 'key:session%'").all().map(r => r.key);
    } catch (e) {
      result.session_keys_error = e.message;
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- 🔍 TEMP SESSION RESET ENDPOINT (remove after debugging) ---
router.post('/reset-session', (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Missing phone' });
    const pattern = `%${phone.replace(/\D/g, '')}%`;
    const result = db.prepare("DELETE FROM wa_session_store WHERE key LIKE ?").run(pattern);
    res.json({ success: true, deleted: result.changes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/public/track - Track order by phone or order number / tracking number
router.get('/track', (req, res) => {
  const { query } = req.query;
  if (!query) {
    return res.status(400).json({ error: 'Search query is required' });
  }

  // Set CORS headers manually to guarantee it works from any Shopify front-end domain
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  try {
    const cleanedQuery = query.trim();
    const cleanPhoneVal = cleanedQuery.replace(/\D/g, '');

    let whereClauses = [];
    let params = [];

    // 1. Phone number match (last 10 digits)
    if (cleanPhoneVal.length >= 10) {
      whereClauses.push('(phone IS NOT NULL AND phone != \'\' AND SUBSTR(phone, -10) = ?)');
      params.push(cleanPhoneVal.slice(-10));
    }

    // 2. Exact match on ref_number, tracking_number, shopify_order_id, etc.
    whereClauses.push('ref_number = ?');
    params.push(cleanedQuery);

    whereClauses.push('tracking_number = ?');
    params.push(cleanedQuery);

    // If query has '#' prefix or not, we also check the opposite
    if (cleanedQuery.startsWith('#')) {
      whereClauses.push('ref_number = ?');
      params.push(cleanedQuery.substring(1));
    } else {
      whereClauses.push('ref_number = ?');
      params.push('#' + cleanedQuery);
    }

    // Also match shopify_order_id
    whereClauses.push('shopify_order_id = ?');
    params.push(cleanedQuery);

    const querySql = `
      SELECT ref_number, shopify_order_id, customer_name, order_date, city, tracking_number, delivery_status, courier, status_date, product_titles
      FROM orders
      WHERE ${whereClauses.join(' OR ')}
      ORDER BY order_date DESC
      LIMIT 5
    `;

    const orders = db.prepare(querySql).all(...params);

    // If no orders found, return 404
    if (!orders || orders.length === 0) {
      return res.status(404).json({ error: 'No orders found matching the details provided.' });
    }

    res.json({ success: true, orders });
  } catch (err) {
    console.error('Public order tracking error:', err);
    res.status(500).json({ error: 'Server error retrieving tracking information' });
  }
});

// OPTIONS preflight for tracking
router.options('/track', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
});

module.exports = router;
