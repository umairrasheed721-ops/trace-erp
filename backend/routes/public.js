/**
 * ⚡ PUBLIC ROUTES — No authentication required
 *
 * These endpoints are called directly from the Shopify storefront (theme JS).
 * CORS is manually set per-route to allow any storefront origin.
 *
 * Routes:
 *   GET  /api/public/reviews          — Fetch product reviews
 *   GET  /api/public/track            — Customer order tracking lookup
 *   POST /api/public/create-draft-order — Securely create a Shopify Draft Order
 *                                         (locks stock, generates checkout link)
 *
 * AI AGENT NOTE:
 *   - Do NOT add authentication middleware here — these are public-facing.
 *   - Store credentials are resolved server-side by matching request origin to
 *     the `stores` DB table. Never expose access_token to the client.
 *   - SHOPIFY_API_VERSION is defined below — update it here when upgrading.
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { SHOPIFY_API_VERSION } = require('../utils/constants');

function formatE164Phone(rawPhone) {
  if (!rawPhone) return '';
  const digits = String(rawPhone).replace(/[^0-9]/g, '');
  if (digits.startsWith('92') && digits.length === 12) {
    return '+' + digits;
  }
  if (digits.startsWith('03') && digits.length === 11) {
    return '+92' + digits.substring(1);
  }
  if (digits.startsWith('3') && digits.length === 10) {
    return '+92' + digits;
  }
  return digits.length > 5 ? '+' + digits : String(rawPhone).trim();
}

// node-fetch v2 shim — use native fetch if available (Node 18+), fallback to require
const fetch = typeof globalThis.fetch === 'function' ? globalThis.fetch : require('node-fetch');

// ── Shopify API version — update here when upgrading ──
const SHOPIFY_API_VERSION = '2024-10';

// ── Ensure draft session log table exists at startup (runs once) ──
db.prepare(`
  CREATE TABLE IF NOT EXISTS whatsapp_draft_sessions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    draft_order_id  TEXT,
    draft_order_name TEXT,
    phone           TEXT,
    name            TEXT,
    email           TEXT,
    city            TEXT,
    address         TEXT,
    invoice_url     TEXT,
    status          TEXT DEFAULT 'pending',
    created_at      TEXT DEFAULT (datetime('now'))
  )
`).run();

try {
  db.prepare('ALTER TABLE whatsapp_draft_sessions ADD COLUMN city TEXT').run();
} catch (_) {}

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

// OPTIONS preflight for draft order
router.options('/create-draft-order', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
});

// POST /api/public/create-draft-order
// Called from storefront JS (trace-cro-funnel.liquid) on WhatsApp checkout submit.
// Creates a Shopify Draft Order to lock stock and generate an instant payment link.
// The storefront enforces a 1500ms timeout — if this takes longer, it falls back
// gracefully to a plain WhatsApp redirect. This endpoint must always respond fast.
router.post('/create-draft-order', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  try {
    const { name, phone, email, city, address, target_total, items } = req.body;

    // 1. Validate required fields
    if (!name || !phone || !email || !city || !address || !items || !items.length) {
      return res.status(400).json({ error: 'Missing required checkout details' });
    }

    // 2. Resolve the active store from request origin (multi-store safe)
    //    Tries exact hostname match first, then LIKE match, then first store fallback.
    const origin = req.get('origin') || '';
    let store = null;

    if (origin) {
      try {
        const hostname = new URL(origin).hostname;
        store = db.prepare(
          'SELECT id, shop_domain, access_token FROM stores WHERE shop_domain = ? OR shop_domain LIKE ? LIMIT 1'
        ).get(hostname, `%${hostname}%`);
      } catch (_) {}
    }

    if (!store) {
      store = db.prepare('SELECT id, shop_domain, access_token FROM stores LIMIT 1').get();
    }

    if (!store) {
      return res.status(500).json({ error: 'No active store configuration found.' });
    }

    const { shop_domain: shopDomain, access_token: accessToken } = store;

    // 3. Clean fields, format phone to E.164, and split customer name
    const cleanEmail   = (email || '').trim().toLowerCase();
    const cleanCity    = (city || '').trim();
    const cleanAddress = (address || '').trim();
    const rawPhone     = (phone || '').trim();
    const cleanPhone   = formatE164Phone(rawPhone) || rawPhone;

    const nameParts = name.trim().split(/\s+/);
    const firstName = nameParts[0] || 'Customer';
    const lastName  = nameParts.slice(1).join(' ') || '.';

    // 4. Check if customer profile already exists in Shopify, update profile email/phone
    let customerObj = {
      first_name: firstName,
      last_name:  lastName,
      email:      cleanEmail,
      phone:      cleanPhone
    };

    try {
      const searchRes = await fetch(
        `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/customers/search.json?query=${encodeURIComponent(cleanEmail)}`,
        { headers: { 'X-Shopify-Access-Token': accessToken } }
      );
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.customers && searchData.customers.length > 0) {
          const found = searchData.customers[0];
          customerObj = {
            id:         found.id,
            first_name: firstName,
            last_name:  lastName,
            email:      cleanEmail,
            phone:      cleanPhone
          };
          // Always update customer profile so Contact Information has both email & E.164 phone
          await fetch(
            `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/customers/${found.id}.json`,
            {
              method:  'PUT',
              headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' },
              body:    JSON.stringify({ customer: { id: found.id, email: cleanEmail, phone: cleanPhone, first_name: firstName, last_name: lastName } })
            }
          ).catch(() => {});
        }
      }
    } catch (_) {}

    // 5. Build clean, standard Shopify Draft Order payload
    const noteText = `City: ${cleanCity} | Address: ${cleanAddress} | Email: ${cleanEmail}${target_total ? ` | Deal Total: Rs. ${target_total}` : ''}`;
    const noteAttributes = [
      { name: 'City', value: cleanCity },
      { name: 'Email', value: cleanEmail },
      { name: 'Delivery Address', value: cleanAddress }
    ];
    if (target_total) {
      noteAttributes.push({ name: 'Deal Total', value: `Rs. ${target_total}` });
    }

    const payload = {
      draft_order: {
        email:      cleanEmail,
        phone:      cleanPhone,
        line_items: items.map(item => ({
          variant_id: item.id,
          quantity:   item.quantity || 1
        })),
        customer: customerObj,
        shipping_address: {
          first_name:   firstName,
          last_name:    lastName,
          address1:     cleanAddress,
          city:         cleanCity,
          country:      'Pakistan',
          country_code: 'PK',
          phone:        cleanPhone
        },
        billing_address: {
          first_name:   firstName,
          last_name:    lastName,
          address1:     cleanAddress,
          city:         cleanCity,
          country:      'Pakistan',
          country_code: 'PK',
          phone:        cleanPhone
        },
        note:            noteText,
        note_attributes: noteAttributes,
        tags:            'WhatsApp-In-Funnel, Trace-CRO-Funnels',
        use_customer_default_address: false
      }
    };

    // 6. POST to Shopify Admin API with 8-second AbortController timeout
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 8000);

    let response;
    try {
      response = await fetch(
        `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/draft_orders.json`,
        {
          method:  'POST',
          headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload),
          signal:  controller.signal
        }
      );
    } finally {
      clearTimeout(abortTimer);
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Shopify API ${response.status}: ${errText}`);
    }

    const { draft_order: draft } = await response.json();
    if (!draft) throw new Error('Empty draft_order in Shopify response');

    // 8. Log the session to SQLite for abandoned-cart recovery tracking
    db.prepare(
      `INSERT INTO whatsapp_draft_sessions
         (draft_order_id, draft_order_name, phone, name, email, city, address, invoice_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(String(draft.id), draft.name || '', cleanPhone, name.trim(), cleanEmail, cleanCity, cleanAddress, draft.invoice_url || '');

    res.json({
      success:          true,
      draft_order_id:   draft.id,
      draft_order_name: draft.name,
      invoice_url:      draft.invoice_url
    });

  } catch (err) {
    console.error('[Draft Order Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
