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
const { addClient } = require('../sse');

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
const fetch = globalThis.fetch || require('node-fetch');

// GET /api/public/product-video?handle=...
// Fast public API to return Shopify Video CDN URL for product_video metafield
router.get('/product-video', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const handle = req.query.handle;
  if (!handle) {
    return res.status(400).json({ success: false, error: 'Missing product handle' });
  }

  const shopDomain = '041839-3.myshopify.com';
  const accessToken = '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';

  const query = `
    query getProductVideo($handle: String!) {
      product(handle: $handle) {
        metafield(namespace: "custom", key: "product_video") {
          value
          type
          reference {
            ... on Video {
              sources {
                url
                mimeType
                format
              }
            }
            ... on GenericFile {
              url
            }
          }
        }
      }
    }
  `;

  try {
    const fetchRes = await fetch(`https://${shopDomain}/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query, variables: { handle } })
    });

    const data = await fetchRes.json();
    const mf = data?.data?.product?.metafield;

    let videoUrl = null;
    if (mf) {
      if (mf.reference?.sources && mf.reference.sources.length > 0) {
        const mp4Src = mf.reference.sources.find(s => s.mimeType === 'video/mp4' || s.format === 'mp4');
        videoUrl = mp4Src ? mp4Src.url : mf.reference.sources[0].url;
      } else if (mf.reference?.url) {
        videoUrl = mf.reference.url;
      } else if (typeof mf.value === 'string' && mf.value.startsWith('http')) {
        videoUrl = mf.value;
      }
    }

    return res.json({ success: true, video_url: videoUrl });
  } catch (err) {
    console.error('Failed to fetch product video:', err);
    return res.json({ success: false, video_url: null });
  }
});

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

    // 5. Clean & auto-heal target_total to prevent extra decimal zeros (e.g. 283800 -> 2838)
    let cleanTargetTotal = target_total ? Math.round(parseFloat(String(target_total).replace(/,/g, '').replace(/[^0-9.]/g, ''))) : 0;
    if (cleanTargetTotal > 50000 && cleanTargetTotal % 100 === 0) {
      cleanTargetTotal = Math.round(cleanTargetTotal / 100);
    }

    const noteText = `City: ${cleanCity} | Address: ${cleanAddress} | Email: ${cleanEmail}${cleanTargetTotal ? ` | Deal Total: Rs. ${cleanTargetTotal.toLocaleString('en-PK')}` : ''}`;
    const noteAttributes = [
      { name: 'City', value: cleanCity },
      { name: 'Email', value: cleanEmail },
      { name: 'Delivery Address', value: cleanAddress }
    ];
    if (cleanTargetTotal) {
      noteAttributes.push({ name: 'Deal Total', value: `Rs. ${cleanTargetTotal.toLocaleString('en-PK')}` });
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


// OPTIONS preflight for cod order
router.options('/create-cod-order', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
});

/**
 * POST /api/public/create-cod-order
 * 
 * Creates a real Shopify Order (not draft) for Cash on Delivery.
 * Called from the custom 1-page COD checkout modal in theme.
 * 
 * Body: { name, phone, city, address, items: [{variant_id, quantity}], shipping_amount }
 * Returns: { success, order_id, order_name, order_number }
 */
router.post('/create-cod-order', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  try {
    const { name, phone, email, city, address, items, shipping_amount, landing_site, referring_site, user_agent, browser_width, browser_height } = req.body;

    // Validate required fields
    if (!name || !phone || !city || !address || !items || !items.length) {
      return res.status(400).json({ success: false, error: 'Missing required fields: name, phone, city, address, items' });
    }

    // Resolve store from origin
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
      return res.status(500).json({ success: false, error: 'No active store configuration found.' });
    }

    const { shop_domain: shopDomain, access_token: accessToken } = store;

    // Format & clean fields
    const cleanPhone = formatE164Phone((phone || '').trim()) || (phone || '').trim();
    const cleanCity = (city || '').trim();
    const cleanAddress = (address || '').trim();
    const cleanEmail = (email || '').trim().toLowerCase() || `${cleanPhone.replace(/\D/g, '')}@tracepk.com`;
    const nameParts = (name || '').trim().split(/\s+/);
    const firstName = nameParts[0] || 'Customer';
    const lastName = nameParts.slice(1).join(' ') || '.';

    const shippingPrice = typeof shipping_amount === 'number' ? shipping_amount : 299;

    const resolvedLandingSite = (landing_site || '').trim() || '/';
    const resolvedReferringSite = (referring_site || '').trim() || 'https://www.facebook.com';
    const resolvedUserAgent = (user_agent || '').trim() || req.get('user-agent') || 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15';
    const resolvedBrowserWidth = Number(browser_width) || 390;
    const resolvedBrowserHeight = Number(browser_height) || 844;

    const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '119.160.118.1';

    // Build Shopify order payload (real order, COD)
    const orderPayload = {
      order: {
        landing_site: resolvedLandingSite,
        referring_site: resolvedReferringSite,
        browser_ip: clientIp,
        client_details: {
          accept_language: req.get('accept-language') || 'en-US,en;q=0.9',
          browser_height: resolvedBrowserHeight,
          browser_width: resolvedBrowserWidth,
          browser_ip: clientIp,
          session_hash: null,
          user_agent: resolvedUserAgent
        },
        email: cleanEmail,
        phone: cleanPhone,
        line_items: items.map(item => {
          const li = {
            variant_id: item.variant_id || item.id,
            quantity: item.quantity || 1,
            title: item.title || item.name || item.product_title || 'Product Item'
          };
          const parsedPrice = parseFloat(item.price);
          if (!isNaN(parsedPrice) && parsedPrice > 0) {
            li.price = String(parsedPrice.toFixed(2));
          }
          return li;
        }),
        customer: {
          first_name: firstName,
          last_name: lastName,
          email: cleanEmail
        },
        shipping_address: {
          first_name: firstName,
          last_name: lastName,
          address1: cleanAddress,
          city: cleanCity,
          country: 'Pakistan',
          country_code: 'PK',
          phone: cleanPhone
        },
        billing_address: {
          first_name: firstName,
          last_name: lastName,
          address1: cleanAddress,
          city: cleanCity,
          country: 'Pakistan',
          country_code: 'PK',
          phone: cleanPhone
        },
        shipping_lines: [
          {
            title: shippingPrice === 0 ? 'Free Shipping' : 'Standard Shipping',
            price: String(shippingPrice.toFixed(2)),
            code: shippingPrice === 0 ? 'FREE' : 'COD_STANDARD'
          }
        ],
        financial_status: 'pending',
        gateway: 'Cash on Delivery (COD)',
        payment_gateway_names: ['Cash on Delivery (COD)'],
        tags: 'COD, Trace-Custom-Checkout',
        note: '',
        note_attributes: [],
        send_receipt: true,
        send_fulfillment_receipt: true,
        inventory_behaviour: 'decrement_ignoring_policy'
      }
    };

    // POST to Shopify Admin API with 10-second timeout
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 10000);

    let response;
    try {
      response = await fetch(
        `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/orders.json`,
        {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(orderPayload),
          signal: controller.signal
        }
      );
    } finally {
      clearTimeout(abortTimer);
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error('[COD Order Error] Shopify API:', response.status, errText);
      throw new Error(`Shopify API ${response.status}: ${errText}`);
    }

    const { order } = await response.json();
    if (!order) throw new Error('Empty order in Shopify response');

    console.log(`[COD Order] Created: ${order.name} (#${order.id}) for ${cleanPhone}`);

    res.json({
      success: true,
      order_id: order.id,
      order_name: order.name,
      order_number: order.order_number,
      total_price: order.total_price
    });

  } catch (err) {
    console.error('[COD Order Error]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// OPTIONS /api/public/extension-tag-order (CORS preflight)
router.options('/extension-tag-order', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.sendStatus(204);
});

// POST /api/public/extension-tag-order
// Real-time tagging relay for CS Chrome Extension
router.post('/extension-tag-order', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { shopify_order_id, tag, action = 'add' } = req.body;
  if (!shopify_order_id || !tag) {
    return res.status(400).json({ success: false, error: 'shopify_order_id and tag are required' });
  }

  try {
    const cleanOrderNum = String(shopify_order_id).replace(/\D/g, '');
    const localOrder = db.db.prepare('SELECT * FROM orders WHERE shopify_order_id = ? OR id = ? OR ref_number LIKE ? LIMIT 1').get(cleanOrderNum, cleanOrderNum, `%${cleanOrderNum}%`);

    let store = null;
    if (localOrder && localOrder.store_id) {
      store = db.db.prepare('SELECT * FROM stores WHERE id = ?').get(localOrder.store_id);
    }
    
    if (!store || !store.access_token || store.access_token === 'PENDING') {
      store = db.db.prepare("SELECT * FROM stores WHERE access_token IS NOT NULL AND access_token != '' AND access_token != 'PENDING' LIMIT 1").get();
    }

    let shopDomain = store ? (store.shop_domain || store.myshopify_domain) : null;
    let token = store ? store.access_token : null;

    const orderGid = `gid://shopify/Order/${cleanOrderNum}`;
    const mutation = action === 'remove'
      ? `mutation tagsRemove($id: ID!, $tags: [String!]!) { tagsRemove(id: $id, tags: $tags) { userErrors { message } node { id } } }`
      : `mutation tagsAdd($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { userErrors { message } node { id } } }`;

    let shopifyUpdated = false;
    if (token && shopDomain) {
      try {
        const shopifyRes = await fetch(`https://${shopDomain}/admin/api/2024-01/graphql.json`, {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ query: mutation, variables: { id: orderGid, tags: [tag] } })
        });
        const graphResult = await shopifyRes.json();
        shopifyUpdated = true;
        console.log(`🏷️ [Extension Tag Relay] ${action.toUpperCase()} tag '${tag}' on ${cleanOrderNum} via ${shopDomain}:`, JSON.stringify(graphResult));
      } catch (shopErr) {
        console.warn(`⚠️ [Extension Tag Relay] Shopify live edit error:`, shopErr.message);
      }
    }

    // Update local DB tag list
    if (localOrder) {
      let currentTags = (localOrder.tags || '').split(',').map(t => t.trim()).filter(Boolean);
      if (action === 'add') {
        if (!currentTags.includes(tag)) currentTags.push(tag);
      } else {
        currentTags = currentTags.filter(t => t.toLowerCase() !== tag.toLowerCase());
      }
      const newTagsStr = currentTags.join(', ');
      db.db.prepare('UPDATE orders SET tags = ? WHERE id = ?').run(newTagsStr, localOrder.id);
      
      const { broadcast } = require('../sse');
      broadcast('order_updated', { storeId: localOrder.store_id, shopifyOrderId: localOrder.shopify_order_id });
    }

    res.json({ success: true, shopify_order_id: cleanOrderNum, tag, action });
  } catch (err) {
    console.error('❌ [Extension Tag Relay Error]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// OPTIONS /api/public/extension-order-info
router.options('/extension-order-info', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(204);
});

// GET /api/public/extension-order-info?shopify_order_id=...
router.get('/extension-order-info', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { shopify_order_id } = req.query;
  if (!shopify_order_id) return res.status(400).json({ success: false, error: 'shopify_order_id required' });

  try {
    const rawShopifyId = String(shopify_order_id).trim();
    const refNum = req.query.ref_number ? String(req.query.ref_number).trim() : '';
    const cleanRef = refNum.replace(/^#/, '');

    // STRICT Exact Search ONLY — NEVER match loose LIKE '%number%' or raw numeric IDs of unrelated orders
    let order = null;
    if (cleanRef) {
      order = db.db.prepare(`
        SELECT * FROM orders 
        WHERE ref_number = ? 
           OR ref_number = ? 
           OR ref_number = ?
           OR shopify_order_id = ?
        LIMIT 1
      `).get(refNum, cleanRef, `#${cleanRef}`, rawShopifyId);
    } else if (rawShopifyId) {
      order = db.db.prepare(`
        SELECT * FROM orders 
        WHERE shopify_order_id = ? 
           OR ref_number = ?
        LIMIT 1
      `).get(rawShopifyId, rawShopifyId);
    }

    // Fallback: If not found in TRACE ERP database yet, live fetch from Shopify Admin API!
    if (!order) {
      try {
        let store = db.db.prepare("SELECT * FROM stores WHERE access_token IS NOT NULL AND access_token != '' AND access_token != 'PENDING' LIMIT 1").get();
        if (store && store.access_token) {
          const shopDomain = store.shop_domain || store.myshopify_domain;
          const axios = require('axios');
          let shopifyRes = null;

          // 1. Try fetching by numeric Shopify Order ID if passed
          if (/^\d{10,}$/.test(rawShopifyId)) {
            try {
              shopifyRes = await axios.get(
                `https://${shopDomain}/admin/api/2024-01/orders/${rawShopifyId}.json`,
                { headers: { 'X-Shopify-Access-Token': store.access_token }, timeout: 5000 }
              );
            } catch (_) {}
          }

          // 2. Search Shopify API by name (e.g. TR33766 or TR33966)
          const targetName = cleanRef || rawShopifyId;
          if (!shopifyRes?.data?.order && targetName) {
            try {
              const searchRes = await axios.get(
                `https://${shopDomain}/admin/api/2024-01/orders.json?name=${encodeURIComponent(targetName)}&status=any`,
                { headers: { 'X-Shopify-Access-Token': store.access_token }, timeout: 5000 }
              );
              if (searchRes.data?.orders?.length) {
                const match = searchRes.data.orders.find(o => 
                  String(o.name).toLowerCase() === targetName.toLowerCase() ||
                  String(o.name).toLowerCase() === `#${targetName}`.toLowerCase() ||
                  String(o.order_number) === targetName.replace(/\D/g, '')
                );
                if (match) shopifyRes = { data: { order: match } };
              }
            } catch (_) {}
          }

          const so = shopifyRes?.data?.order;
          if (so) {
            const addr = so.shipping_address || {};
            const cust = so.customer || {};
            const phone = addr.phone || so.phone || cust.phone || '';
            let cleanPhone = phone.replace(/\D/g, '');
            if (cleanPhone.startsWith('0')) cleanPhone = '92' + cleanPhone.slice(1);
            if (cleanPhone.length === 10 && cleanPhone.startsWith('3')) cleanPhone = '92' + cleanPhone;

            const itemsStr = (so.line_items || []).map(i => `${i.title}${i.variant_title ? ` - ${i.variant_title}` : ''} (x${i.quantity})`).join(', ');

            return res.json({
              success: true,
              order: {
                id: so.id,
                shopify_order_id: String(so.id),
                ref_number: so.name || `#${so.order_number}`,
                customer_name: (addr.first_name ? `${addr.first_name} ${addr.last_name || ''}`.trim() : cust.first_name ? `${cust.first_name} ${cust.last_name || ''}`.trim() : 'Customer'),
                phone,
                clean_phone: cleanPhone,
                price: so.current_total_price || so.total_price || '',
                product_titles: itemsStr,
                address: [addr.address1, addr.address2].filter(Boolean).join(', '),
                city: addr.city || '',
                tracking_number: '',
                courier_name: '',
                delivery_status: (so.fulfillment_status === 'fulfilled' ? 'In Transit' : 'Pending'),
                courier_status: (so.fulfillment_status === 'fulfilled' ? 'Fulfilled' : 'Unfulfilled'),
                tags: so.tags || '',
                notes: so.note || ''
              }
            });
          }
        }
      } catch (liveErr) {
        console.warn('[Extension Live Shopify Fetch Error]:', liveErr.message);
      }

      return res.json({ success: false, error: 'Order not found in TRACE ERP or Shopify' });
    }

    let phone = order.phone || '';
    
    // Live fetch from Shopify when DB phone is empty
    if (!phone && order.shopify_order_id) {
      try {
        let store = null;
        if (order.store_id) store = db.db.prepare('SELECT * FROM stores WHERE id = ?').get(order.store_id);
        if (!store || !store.access_token || store.access_token === 'PENDING') {
          store = db.db.prepare("SELECT * FROM stores WHERE access_token IS NOT NULL AND access_token != '' AND access_token != 'PENDING' LIMIT 1").get();
        }
        if (store && store.access_token) {
          const shopDomain = store.shop_domain || store.myshopify_domain;
          const axios = require('axios');
          const shopifyRes = await axios.get(
            `https://${shopDomain}/admin/api/2024-01/orders/${order.shopify_order_id}.json?fields=id,phone,shipping_address,customer`,
            { headers: { 'X-Shopify-Access-Token': store.access_token }, timeout: 5000 }
          );
          const so = shopifyRes.data && shopifyRes.data.order;
          if (so) {
            const addr = so.shipping_address || {};
            const cust = so.customer || {};
            phone = addr.phone || so.phone || cust.phone || '';
            // Save back to DB for future lookups
            if (phone) {
              try { db.db.prepare('UPDATE orders SET phone = ? WHERE id = ?').run(phone, order.id); } catch (_) {}
            }
          }
        }
      } catch (fetchErr) {
        console.warn('[Extension Phone Fetch Warn]:', fetchErr.message);
      }
    }

    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.startsWith('0')) cleanPhone = '92' + cleanPhone.slice(1);
    if (cleanPhone.length === 10 && cleanPhone.startsWith('3')) cleanPhone = '92' + cleanPhone;

    res.json({
      success: true,
      order: {
        id: order.id,
        shopify_order_id: order.shopify_order_id,
        ref_number: order.ref_number || `#${order.shopify_order_id}`,
        customer_name: order.customer_name || 'Customer',
        phone,
        clean_phone: cleanPhone,
        price: order.price || order.total_price || '',
        product_titles: order.product_titles || '',
        address: order.address || '',
        city: order.city || '',
        tracking_number: order.tracking_number,
        courier_name: order.courier_name || '',
        delivery_status: order.delivery_status || 'Pending',
        courier_status: order.courier_status || 'N/A',
        tags: order.tags || '',
        notes: [order.notes, order.cs_notes].filter(Boolean).join(' | ') || ''
      }
    });
  } catch (err) {
    console.error('❌ [Extension Order Info Error]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// OPTIONS /api/public/extension-add-note
router.options('/extension-add-note', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(204);
});

// POST /api/public/extension-add-note
router.post('/extension-add-note', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { shopify_order_id, note } = req.body;
  if (!shopify_order_id || !note) {
    return res.status(400).json({ success: false, error: 'shopify_order_id and note required' });
  }

  try {
    const cleanNum = String(shopify_order_id).replace(/\D/g, '');
    const localOrder = db.db.prepare('SELECT * FROM orders WHERE shopify_order_id = ? OR id = ? OR ref_number LIKE ? LIMIT 1').get(cleanNum, cleanNum, `%${cleanNum}%`);

    let store = null;
    if (localOrder && localOrder.store_id) {
      store = db.db.prepare('SELECT * FROM stores WHERE id = ?').get(localOrder.store_id);
    }
    if (!store || !store.access_token || store.access_token === 'PENDING') {
      store = db.db.prepare("SELECT * FROM stores WHERE access_token IS NOT NULL AND access_token != '' AND access_token != 'PENDING' LIMIT 1").get();
    }

    const shopDomain = store ? (store.shop_domain || store.myshopify_domain) : null;
    const token = store ? store.access_token : null;

    if (token && shopDomain) {
      try {
        const timestamp = new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });
        const noteWithTimestamp = `[CS ${timestamp}]: ${note}`;
        
        await fetch(`https://${shopDomain}/admin/api/2024-01/orders/${cleanNum}.json`, {
          method: 'PUT',
          headers: {
            'X-Shopify-Access-Token': token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ order: { id: cleanNum, note: noteWithTimestamp } })
        });
      } catch (shopErr) {
        console.warn('⚠️ [Extension Note Relay] Shopify Note update error:', shopErr.message);
      }
    }

    if (localOrder) {
      const existingNotes = localOrder.notes ? localOrder.notes + '\n' : '';
      const newNotes = existingNotes + `[CS]: ${note}`;
      db.db.prepare('UPDATE orders SET notes = ? WHERE id = ?').run(newNotes, localOrder.id);
      
      const { broadcast } = require('../sse');
      broadcast('order_updated', { storeId: localOrder.store_id, shopifyOrderId: localOrder.shopify_order_id });
    }

    res.json({ success: true, shopify_order_id: cleanNum, note });
  } catch (err) {
    console.error('❌ [Extension Add Note Error]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
