/**
 * services/reviewEmailService.js
 *
 * Strictly per-store isolated review request email engine.
 * Each store configures its own Brevo or Resend API key + sender identity in `store_email_settings`
 * via the ERP UI (Plug & Play — no Railway env var edits needed for new stores).
 *
 * Zero-Leak Rule:
 * - Store #1 (primary TRACE store) may fall back to legacy Railway env vars if no DB row exists yet.
 * - All other stores (Store #2, #3, ..., #N) NEVER inherit Store #1's API key or sender email.
 */

const crypto = require('crypto');
const db = require('../db');

const BACKEND_URL = process.env.APP_URL || 'https://trace-erp-production.up.railway.app';
const EMAIL_API_TIMEOUT_MS = 10000;
const SHOPIFY_HANDLE_TIMEOUT_MS = 5000;

let _emailTableEnsured = false;
function ensureStoreEmailTable() {
  if (_emailTableEnsured) return;
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS store_email_settings (
        store_id INTEGER PRIMARY KEY,
        enabled INTEGER DEFAULT 0,
        provider TEXT DEFAULT 'brevo',
        api_key TEXT DEFAULT '',
        from_name TEXT DEFAULT '',
        from_email TEXT DEFAULT '',
        reply_to TEXT DEFAULT '',
        website_url TEXT DEFAULT '',
        subject TEXT DEFAULT '',
        body_html TEXT DEFAULT '',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    _emailTableEnsured = true;
  } catch (e) {
    console.warn('⚠️ [Reviews] Failed to ensure store_email_settings table:', e.message);
  }
}

function maskApiKey(key) {
  if (!key || typeof key !== 'string') return '';
  const clean = key.trim();
  if (clean.length <= 10) return '••••••••';
  return `${clean.slice(0, 7)}••••${clean.slice(-4)}`;
}

function normalizeWebsiteUrl(url, shopDomain) {
  const raw = (url || '').trim();
  if (raw) {
    return /^https?:\/\//i.test(raw) ? raw.replace(/\/+$/, '') : `https://${raw.replace(/\/+$/, '')}`;
  }
  const dom = (shopDomain || '').trim();
  if (dom) {
    return /^https?:\/\//i.test(dom) ? dom.replace(/\/+$/, '') : `https://${dom.replace(/\/+$/, '')}`;
  }
  return 'https://tracepk.com';
}

function getStoreRow(storeId) {
  try {
    const sid = Number(storeId);
    if (!sid || isNaN(sid)) return null;
    return db.prepare('SELECT id, store_name, shop_domain FROM stores WHERE id = ?').get(sid) || null;
  } catch (_) {
    return null;
  }
}

function isPrimaryTraceStore(sid, storeRow) {
  if (!storeRow) return Number(sid) === 1;
  const name = String(storeRow.store_name || '').toLowerCase().trim();
  const dom = String(storeRow.shop_domain || '').toLowerCase().trim();
  return name === 'trace' || name.includes('trace pk') || name.includes('trace pakistan') || dom.includes('tracepk') || dom.includes('041839-3');
}

/**
 * Resolves strictly isolated email configuration for a specific store_id.
 * Never falls back to global Railway env vars for non-primary stores.
 */
function getStoreEmailConfig(storeId) {
  ensureStoreEmailTable();
  const sid = Number(storeId) || 1;
  const storeRow = getStoreRow(sid);
  const isTrace = isPrimaryTraceStore(sid, storeRow);
  const storeName = (storeRow?.store_name || (isTrace ? 'TRACE Pakistan' : `Store #${sid}`)).trim();
  const defaultWebsite = isTrace
    ? 'https://tracepk.com'
    : normalizeWebsiteUrl('', storeRow?.shop_domain);

  let row = null;
  try {
    row = db.prepare('SELECT * FROM store_email_settings WHERE store_id = ?').get(sid);
  } catch (_) {}

  if (row) {
    // For primary Trace store only: if row exists with empty api_key, allow env key continuity
    let apiKey = (row.api_key || '').trim();
    let provider = (row.provider || 'brevo').trim().toLowerCase();
    let fromEmail = (row.from_email || '').trim();
    if (isTrace && !apiKey) {
      if (process.env.RESEND_API_KEY) { apiKey = process.env.RESEND_API_KEY.trim(); provider = 'resend'; }
      else if (process.env.BREVO_API_KEY) { apiKey = process.env.BREVO_API_KEY.trim(); provider = 'brevo'; }
    }
    if (isTrace && !fromEmail) {
      fromEmail = (process.env.EMAIL_FROM || process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_USER || '').trim();
    }

    return {
      storeId: sid,
      storeName,
      shopDomain: storeRow?.shop_domain || '',
      enabled: Boolean(row.enabled),
      provider: ['brevo', 'resend'].includes(provider) ? provider : 'brevo',
      apiKey,
      hasApiKey: Boolean(apiKey),
      maskedApiKey: maskApiKey(apiKey),
      fromName: (row.from_name || (isTrace ? 'TRACE Pakistan' : storeName)).trim(),
      fromEmail,
      replyTo: (row.reply_to || fromEmail || (isTrace ? 'trace721.t@gmail.com' : '')).trim(),
      websiteUrl: normalizeWebsiteUrl(row.website_url, storeRow?.shop_domain || (isTrace ? 'tracepk.com' : '')),
      subject: row.subject || '',
      bodyHtml: row.body_html || '',
      updatedAt: row.updated_at || null,
      source: 'store_db',
    };
  }

  // Primary Trace store env-var fallback ONLY (strictly zero leak to ACE, Rabbi Trends, or any other store)
  if (isTrace) {
    if (process.env.RESEND_API_KEY) {
      const fromEmail = (process.env.EMAIL_FROM || 'onboarding@resend.dev').trim();
      return {
        storeId: sid,
        storeName,
        shopDomain: storeRow?.shop_domain || '',
        enabled: true,
        provider: 'resend',
        apiKey: process.env.RESEND_API_KEY.trim(),
        hasApiKey: true,
        maskedApiKey: maskApiKey(process.env.RESEND_API_KEY),
        fromName: (process.env.EMAIL_FROM_NAME || 'TRACE Pakistan').trim(),
        fromEmail,
        replyTo: (process.env.EMAIL_REPLY_TO || 'trace721.t@gmail.com').trim(),
        websiteUrl: 'https://tracepk.com',
        subject: '',
        bodyHtml: '',
        updatedAt: null,
        source: 'env_primary',
      };
    }
    if (process.env.BREVO_API_KEY) {
      const fromEmail = (process.env.EMAIL_FROM || process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_USER || '').trim();
      return {
        storeId: sid,
        storeName,
        shopDomain: storeRow?.shop_domain || '',
        enabled: Boolean(fromEmail),
        provider: 'brevo',
        apiKey: process.env.BREVO_API_KEY.trim(),
        hasApiKey: true,
        maskedApiKey: maskApiKey(process.env.BREVO_API_KEY),
        fromName: (process.env.EMAIL_FROM_NAME || 'TRACE Pakistan').trim(),
        fromEmail,
        replyTo: (process.env.EMAIL_REPLY_TO || 'trace721.t@gmail.com').trim(),
        websiteUrl: 'https://tracepk.com',
        subject: '',
        bodyHtml: '',
        updatedAt: null,
        source: 'env_primary',
      };
    }
  }

  // All unconfigured stores: STRICTLY DISABLED & ISOLATED
  return {
    storeId: sid,
    storeName,
    shopDomain: storeRow?.shop_domain || '',
    enabled: false,
    provider: 'brevo',
    apiKey: '',
    hasApiKey: false,
    maskedApiKey: '',
    fromName: storeName,
    fromEmail: '',
    replyTo: '',
    websiteUrl: defaultWebsite,
    subject: '',
    bodyHtml: '',
    updatedAt: null,
    source: 'unconfigured',
  };
}

/**
 * Inspects active email provider status strictly for a specific store_id.
 */
function getEmailProviderStatus(storeId = 1) {
  const cfg = getStoreEmailConfig(storeId);
  const labelMap = { brevo: 'Brevo API', resend: 'Resend API' };
  const baseLabel = labelMap[cfg.provider] || 'Brevo API';

  if (!cfg.apiKey) {
    return {
      storeId: cfg.storeId,
      storeName: cfg.storeName,
      configured: false,
      enabled: false,
      provider: cfg.provider,
      label: 'Not Configured',
      fromName: cfg.fromName,
      fromEmail: '',
      websiteUrl: cfg.websiteUrl,
      error: `Email is not configured for ${cfg.storeName}. Open Email Setup and add this store's own Brevo or Resend API key.`,
    };
  }

  if (!cfg.fromEmail) {
    return {
      storeId: cfg.storeId,
      storeName: cfg.storeName,
      configured: false,
      enabled: false,
      provider: cfg.provider,
      label: `${baseLabel} (Missing Sender)`,
      fromName: cfg.fromName,
      fromEmail: '',
      websiteUrl: cfg.websiteUrl,
      error: `Sender email is missing for ${cfg.storeName}. Open Email Setup and add this store's verified sender email.`,
    };
  }

  return {
    storeId: cfg.storeId,
    storeName: cfg.storeName,
    configured: true,
    enabled: cfg.enabled,
    provider: cfg.provider,
    label: baseLabel,
    fromName: cfg.fromName,
    fromEmail: cfg.fromEmail,
    websiteUrl: cfg.websiteUrl,
  };
}

/**
 * Saves per-store email settings safely (preserves existing API key if blank).
 */
function saveStoreEmailConfig(storeId, payload = {}) {
  ensureStoreEmailTable();
  const sid = Number(storeId);
  if (!sid || isNaN(sid)) throw new Error('Valid store_id is required');

  const current = getStoreEmailConfig(sid);
  const provider = ['brevo', 'resend'].includes(String(payload.provider || current.provider).toLowerCase())
    ? String(payload.provider || current.provider).toLowerCase()
    : 'brevo';

  const incomingKey = typeof payload.api_key === 'string' ? payload.api_key.trim() : '';
  const apiKey = payload.clear_api_key ? '' : (incomingKey || current.apiKey || '');
  const enabled = payload.enabled !== undefined ? (payload.enabled ? 1 : 0) : (current.enabled ? 1 : 0);
  const fromName = (payload.from_name !== undefined ? String(payload.from_name) : current.fromName).trim();
  const fromEmail = (payload.from_email !== undefined ? String(payload.from_email) : current.fromEmail).trim();
  const replyTo = (payload.reply_to !== undefined ? String(payload.reply_to) : current.replyTo).trim();
  const websiteUrl = (payload.website_url !== undefined ? String(payload.website_url) : current.websiteUrl).trim();

  db.prepare(`
    INSERT INTO store_email_settings
      (store_id, enabled, provider, api_key, from_name, from_email, reply_to, website_url, subject, body_html, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(store_id) DO UPDATE SET
      enabled = excluded.enabled,
      provider = excluded.provider,
      api_key = excluded.api_key,
      from_name = excluded.from_name,
      from_email = excluded.from_email,
      reply_to = excluded.reply_to,
      website_url = excluded.website_url,
      updated_at = CURRENT_TIMESTAMP
  `).run(sid, enabled, provider, apiKey, fromName, fromEmail, replyTo, websiteUrl, current.subject || '', current.bodyHtml || '');

  return getStoreEmailConfig(sid);
}

/**
 * Extracts Shopify product handle from a product URL like https://tracepk.com/products/my-hoodie
 */
function extractHandleFromUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const match = url.match(/\/products\/([^/?#]+)/i);
  return match ? decodeURIComponent(match[1]).trim() : '';
}

/**
 * Resolves a single order line item's real Shopify product handle from local `products` table:
 * 1. Explicit item.handle (if present & not 'general')
 * 2. Exact shopify_variant_id match in products table
 * 3. Exact SKU match in products table
 * 4. Title prefix match in products table
 */
function resolveItemHandleFromDb(storeId, item) {
  let handle = '';
  let imageUrl = item?.image_url || '';

  if (item?.handle && item.handle !== 'general') {
    return { handle: String(item.handle).trim(), image_url: imageUrl };
  }

  const sid = Number(storeId) || 1;
  try {
    if (item?.variant_id) {
      const row = db.prepare(`
        SELECT product_url, image_url FROM products
        WHERE shopify_variant_id = ? AND product_url IS NOT NULL AND product_url != ''
        ORDER BY CASE WHEN store_id = ? THEN 0 ELSE 1 END
        LIMIT 1
      `).get(String(item.variant_id), sid);
      if (row) {
        handle = extractHandleFromUrl(row.product_url);
        if (!imageUrl && row.image_url) imageUrl = row.image_url;
        if (handle) return { handle, image_url: imageUrl };
      }
    }

    if (item?.sku && String(item.sku).trim()) {
      const row = db.prepare(`
        SELECT product_url, image_url FROM products
        WHERE sku = ? AND product_url IS NOT NULL AND product_url != ''
        ORDER BY CASE WHEN store_id = ? THEN 0 ELSE 1 END
        LIMIT 1
      `).get(String(item.sku).trim(), sid);
      if (row) {
        handle = extractHandleFromUrl(row.product_url);
        if (!imageUrl && row.image_url) imageUrl = row.image_url;
        if (handle) return { handle, image_url: imageUrl };
      }
    }

    if (item?.title && String(item.title).trim()) {
      const cleanTitle = String(item.title).trim().toLowerCase();
      const row = db.prepare(`
        SELECT product_url, image_url FROM products
        WHERE LOWER(title) LIKE ? AND product_url IS NOT NULL AND product_url != ''
        ORDER BY CASE WHEN store_id = ? THEN 0 ELSE 1 END
        LIMIT 1
      `).get(`${cleanTitle}%`, sid);
      if (row) {
        handle = extractHandleFromUrl(row.product_url);
        if (!imageUrl && row.image_url) imageUrl = row.image_url;
        if (handle) return { handle, image_url: imageUrl };
      }
    }
  } catch (err) {
    console.warn('⚠️ [Reviews] DB handle lookup error:', err.message);
  }

  return { handle: '', image_url: imageUrl };
}

/**
 * Tier 4 fallback: Fetches real Shopify product handle via GraphQL if product isn't in local `products` table yet.
 */
async function resolveHandleViaShopifyGraphQL(storeId, variantId) {
  if (!variantId) return { handle: '', image_url: '' };
  try {
    const store = db.prepare('SELECT shop_domain, access_token FROM stores WHERE id = ?').get(Number(storeId) || 1);
    if (!store || !store.shop_domain || !store.access_token) return { handle: '', image_url: '' };

    const cleanId = String(variantId).replace(/^gid:\/\/shopify\/ProductVariant\//, '');
    const query = `query { productVariant(id: "gid://shopify/ProductVariant/${cleanId}") { image { url } product { handle featuredImage { url } } } }`;
    const res = await fetch(`https://${store.shop_domain}/admin/api/2025-10/graphql.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': store.access_token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(SHOPIFY_HANDLE_TIMEOUT_MS),
    });
    if (!res.ok) return { handle: '', image_url: '' };
    const json = await res.json();
    const pv = json?.data?.productVariant;
    return {
      handle: pv?.product?.handle || '',
      image_url: pv?.image?.url || pv?.product?.featuredImage?.url || '',
    };
  } catch (err) {
    console.warn('⚠️ [Reviews] Shopify GraphQL handle fallback skipped:', err.message);
    return { handle: '', image_url: '' };
  }
}

/**
 * Resolves all distinct reviewable products (with real Shopify handles & photos) for an order.
 */
async function resolveOrderReviewItems(order) {
  if (!order) return [];
  const storeId = order.store_id || 1;
  let parsedItems = [];

  if (order.line_items) {
    try {
      const arr = JSON.parse(order.line_items);
      if (Array.isArray(arr)) parsedItems = arr;
    } catch (_) {}
  }

  const resolved = [];
  const seenKeys = new Set();

  for (const item of parsedItems) {
    let { handle, image_url } = resolveItemHandleFromDb(storeId, item);
    if (!handle && item?.variant_id) {
      const gql = await resolveHandleViaShopifyGraphQL(storeId, item.variant_id);
      if (gql.handle) handle = gql.handle;
      if (!image_url && gql.image_url) image_url = gql.image_url;
    }

    const title = (item?.title || item?.name || order.product_titles || 'Your recent item').trim();
    const finalHandle = handle || 'general';
    const dedupKey = finalHandle !== 'general' ? finalHandle : title.toLowerCase();
    if (seenKeys.has(dedupKey)) continue;
    seenKeys.add(dedupKey);

    resolved.push({
      handle: finalHandle,
      title,
      variant_title: item?.variant_title || '',
      image_url: image_url || '',
    });
  }

  if (resolved.length === 0 && order.product_titles) {
    const firstTitle = String(order.product_titles).split(',')[0].replace(/\s*\(x\d+\)\s*$/i, '').trim();
    const fromDb = resolveItemHandleFromDb(storeId, { title: firstTitle });
    resolved.push({
      handle: fromDb.handle || 'general',
      title: firstTitle || 'Your recent item',
      variant_title: '',
      image_url: fromDb.image_url || '',
    });
  }

  return resolved;
}

/**
 * Generate a secure review token for an order.
 */
function generateReviewToken(orderId, customerEmail, productHandle) {
  const payload = `${orderId}:${customerEmail}:${productHandle}:${Date.now()}`;
  const secret = process.env.JWT_SECRET || 'trace-erp-secret-key-2024';
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 16);
  return Buffer.from(`${payload}:${signature}`).toString('base64url');
}

/**
 * Parse and validate a review token.
 */
function parseReviewToken(token) {
  try {
    if (!token || typeof token !== 'string') return null;
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length < 5) return null;

    const signature = parts.pop();
    const timestamp = parts.pop();
    const productHandle = parts.pop();
    const customerEmail = parts.pop();
    const orderId = parts.join(':');

    const payload = `${orderId}:${customerEmail}:${productHandle}:${timestamp}`;
    const secret = process.env.JWT_SECRET || 'trace-erp-secret-key-2024';
    const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 16);
    if (signature !== expectedSig) return null;

    const ts = parseInt(timestamp, 10);
    if (isNaN(ts)) return null;
    if (Date.now() - ts > 30 * 24 * 60 * 60 * 1000) return null;

    return { orderId, customerEmail, productHandle };
  } catch (e) {
    return null;
  }
}

const DEFAULT_SUBJECT = 'Your {{store_name}} order {{order_ref}} — how was it, {{first_name}}?';
const DEFAULT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your {{store_name}} order {{order_ref}}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;color:#111827;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:540px;margin:0 auto;padding:28px 20px;">
    <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#111827;">
      Hi {{first_name}},
    </p>

    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
      Your {{store_name}} order <strong>{{order_ref}}</strong> (<strong>{{product_title}}</strong>) was recently delivered. We hope everything fits and looks great.
    </p>

    <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#374151;">
      Could you take 20 seconds to rate your item? Your honest feedback helps us improve and helps other shoppers pick the right size.
    </p>

    <div style="margin:22px 0;padding:18px 20px;border:1px solid #e5e7eb;border-radius:10px;background:#f9fafb;text-align:center;">
      <div style="font-size:13px;color:#6b7280;margin-bottom:8px;">Tap a star to rate {{product_title}}</div>
      <a href="{{review_url}}" style="text-decoration:none;font-size:30px;letter-spacing:6px;color:#f59e0b;display:inline-block;margin-bottom:14px;">&#9733;&#9733;&#9733;&#9733;&#9733;</a>
      <div>
        <a href="{{review_url}}" style="display:inline-block;background:#111827;color:#ffffff;font-size:14px;font-weight:600;padding:11px 24px;border-radius:7px;text-decoration:none;">
          Write a quick review
        </a>
      </div>
    </div>

    <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#4b5563;">
      If there is any issue with sizing or quality, just reply directly to this email and our team will sort it out for you.
    </p>

    <p style="margin:0;font-size:14px;line-height:1.6;color:#111827;">
      Thanks,<br>
      <strong>{{store_name}}</strong><br>
      <span style="font-size:12px;color:#6b7280;">{{store_url_display}}</span>
    </p>
  </div>
</body>
</html>`;

/**
 * Fetches custom email template strictly scoped to `storeId`.
 */
function getTemplateFromDb(storeId = 1) {
  ensureStoreEmailTable();
  const sid = Number(storeId) || 1;
  try {
    const row = db.prepare('SELECT subject, body_html FROM store_email_settings WHERE store_id = ?').get(sid);
    if (row && row.subject && row.body_html) {
      return { subject: row.subject, body_html: row.body_html };
    }
    // Legacy fallback ONLY for primary Trace store
    if (isPrimaryTraceStore(sid, getStoreRow(sid))) {
      const legacy = db.prepare("SELECT subject, body_html FROM email_templates WHERE template_key = 'review_request'").get();
      if (legacy && legacy.subject && legacy.body_html) {
        return { subject: legacy.subject, body_html: legacy.body_html };
      }
    }
  } catch (_) {}
  return { subject: DEFAULT_SUBJECT, body_html: DEFAULT_HTML };
}

function saveStoreTemplate(storeId, subject, bodyHtml) {
  ensureStoreEmailTable();
  const sid = Number(storeId) || 1;
  const current = getStoreEmailConfig(sid);
  db.prepare(`
    INSERT INTO store_email_settings
      (store_id, enabled, provider, api_key, from_name, from_email, reply_to, website_url, subject, body_html, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(store_id) DO UPDATE SET
      subject = excluded.subject,
      body_html = excluded.body_html,
      updated_at = CURRENT_TIMESTAMP
  `).run(sid, current.enabled ? 1 : 0, current.provider, current.apiKey, current.fromName, current.fromEmail, current.replyTo, current.websiteUrl, subject, bodyHtml);
}

function resetStoreTemplate(storeId) {
  ensureStoreEmailTable();
  const sid = Number(storeId) || 1;
  try {
    db.prepare("UPDATE store_email_settings SET subject = '', body_html = '', updated_at = CURRENT_TIMESTAMP WHERE store_id = ?").run(sid);
    if (sid === 1) {
      try { db.prepare("DELETE FROM email_templates WHERE template_key = 'review_request'").run(); } catch (_) {}
    }
  } catch (_) {}
}

/**
 * Send a review request email strictly using the store's own isolated Brevo/Resend credentials.
 */
async function sendReviewRequestEmail({ storeId = 1, orderId, orderRef, customerName, customerEmail, productHandle, productTitle }) {
  const sid = Number(storeId) || 1;
  const status = getEmailProviderStatus(sid);
  if (!status.configured) {
    console.warn(`⚠️ [Reviews/Store #${sid}] ${status.error}`);
    return { ok: false, provider: status.provider, error: status.error };
  }

  const cfg = getStoreEmailConfig(sid);
  const token = generateReviewToken(orderId, customerEmail, productHandle);
  const reviewUrl = `${BACKEND_URL}/api/public/review-form?token=${token}`;

  const template = getTemplateFromDb(sid);
  const firstName = customerName?.split(' ')[0] || 'there';
  const fullName = customerName || 'Valued Customer';
  const itemTitle = productTitle || 'your recent purchase';
  const refLabel = orderRef ? (String(orderRef).startsWith('#') ? String(orderRef) : `#${orderRef}`) : `#${orderId}`;
  const brandName = cfg.fromName || cfg.storeName || 'Our Store';
  const storeUrl = cfg.websiteUrl || 'https://tracepk.com';
  const storeUrlDisplay = storeUrl.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const replyToEmail = (cfg.replyTo || cfg.fromEmail).trim();

  const applyVars = (str) => String(str || '')
    .replace(/\{\{customer_name\}\}/g, fullName)
    .replace(/\{\{first_name\}\}/g, firstName)
    .replace(/\{\{product_title\}\}/g, itemTitle)
    .replace(/\{\{order_ref\}\}/g, refLabel)
    .replace(/\{\{store_name\}\}/g, brandName)
    .replace(/\{\{store_url\}\}/g, storeUrl)
    .replace(/\{\{store_url_display\}\}/g, storeUrlDisplay)
    .replace(/\{\{review_url\}\}/g, reviewUrl);

  const subject = applyVars(template.subject || DEFAULT_SUBJECT);
  const html = applyVars(template.body_html || DEFAULT_HTML);
  const text = [
    `Hi ${firstName},`,
    '',
    `Your ${brandName} order ${refLabel} (${itemTitle}) was recently delivered. We hope everything fits and looks great.`,
    '',
    'Could you take 20 seconds to leave a quick review? Your honest feedback helps us improve:',
    reviewUrl,
    '',
    'If there is any issue with sizing or quality, just reply directly to this email and our team will help you out.',
    '',
    'Thanks,',
    `${brandName} (${storeUrlDisplay})`,
  ].join('\n');

  try {
    if (cfg.provider === 'resend') {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cfg.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${brandName} <${cfg.fromEmail}>`,
          to: [customerEmail],
          reply_to: replyToEmail,
          subject,
          html,
          text,
        }),
        signal: AbortSignal.timeout(EMAIL_API_TIMEOUT_MS),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.message || errBody.error || `Resend HTTP ${res.status}`);
      }
      console.log(`📧 [Reviews/Resend/Store #${sid}] Sent to ${customerEmail} from ${cfg.fromEmail} (order #${orderId})`);
      return { ok: true, provider: 'resend', fromEmail: cfg.fromEmail };
    }

    // Brevo HTTP API (default)
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': cfg.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: brandName, email: cfg.fromEmail },
        to: [{ email: customerEmail, name: fullName }],
        replyTo: { email: replyToEmail, name: brandName },
        subject,
        htmlContent: html,
        textContent: text,
      }),
      signal: AbortSignal.timeout(EMAIL_API_TIMEOUT_MS),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.message || errBody.code || `Brevo HTTP ${res.status}`);
    }
    console.log(`📧 [Reviews/Brevo/Store #${sid}] Sent to ${customerEmail} from ${cfg.fromEmail} (order #${orderId})`);
    return { ok: true, provider: 'brevo', fromEmail: cfg.fromEmail };
  } catch (err) {
    console.error(`❌ [Reviews/${cfg.provider}/Store #${sid}] Failed for ${customerEmail}:`, err.message);
    return { ok: false, provider: cfg.provider, error: err.message };
  }
}

module.exports = {
  sendReviewRequestEmail,
  getEmailProviderStatus,
  getStoreEmailConfig,
  saveStoreEmailConfig,
  saveStoreTemplate,
  resetStoreTemplate,
  resolveOrderReviewItems,
  extractHandleFromUrl,
  parseReviewToken,
  generateReviewToken,
  getTemplateFromDb,
  DEFAULT_SUBJECT,
  DEFAULT_HTML,
};
