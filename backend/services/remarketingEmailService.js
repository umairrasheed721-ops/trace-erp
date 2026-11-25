/**
 * services/remarketingEmailService.js
 *
 * Primary-Inbox Email Remarketing Engine (Strictly Per-Store Isolated):
 * 1. Review -> Instant Thank-You & Coupon Reward (auto-sent on 4★/5★ review submit)
 * 2. Day +10 Post-Delivery Repeat Buyer Check-In Autopilot (0-RTO delivered buyers only)
 * 3. Smart Delivered-Only Broadcast + Auto-Drip Queue (staggered human-like sending, 150-220/day cap)
 * 4. 1-Click Unsubscribe Suppression + Live Order/PKR Revenue Attribution
 */

const crypto = require('crypto');
const db = require('../db');
const { getStoreEmailConfig, getEmailProviderStatus } = require('./reviewEmailService');

const BACKEND_URL = process.env.APP_URL || 'https://trace-erp-production.up.railway.app';
const EMAIL_API_TIMEOUT_MS = 10000;
const MAX_DAILY_DRIP_CAP = 220; // Always reserves 80/day out of 300 free quota for transactional review emails

let _tablesEnsured = false;
function ensureRemarketingTables() {
  if (_tablesEnsured) return;
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS email_unsubscribes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER NOT NULL,
        email TEXT NOT NULL,
        reason TEXT DEFAULT 'user_opt_out',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(store_id, email)
      );
      CREATE TABLE IF NOT EXISTS remarketing_campaigns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        sender_name TEXT DEFAULT '',
        sender_email TEXT DEFAULT '',
        subject TEXT NOT NULL,
        body_text TEXT NOT NULL,
        cta_label TEXT DEFAULT '',
        cta_url TEXT DEFAULT '',
        filters_json TEXT DEFAULT '{}',
        daily_limit INTEGER DEFAULT 150,
        status TEXT DEFAULT 'running',
        total_recipients INTEGER DEFAULT 0,
        sent_count INTEGER DEFAULT 0,
        failed_count INTEGER DEFAULT 0,
        last_error TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS remarketing_recipients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        campaign_id INTEGER NOT NULL,
        store_id INTEGER NOT NULL,
        email TEXT NOT NULL,
        customer_name TEXT DEFAULT '',
        last_order_ref TEXT DEFAULT '',
        last_product TEXT DEFAULT '',
        status TEXT DEFAULT 'pending',
        error_msg TEXT DEFAULT '',
        sent_at DATETIME,
        UNIQUE(campaign_id, email)
      );
    `);
    _tablesEnsured = true;
  } catch (e) {
    console.warn('⚠️ [Remarketing] Table ensure warning:', e.message);
  }
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function generateUnsubscribeToken(storeId, email) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const payload = `${Number(storeId) || 1}:${cleanEmail}`;
  const secret = process.env.JWT_SECRET || 'trace-erp-secret-key-2024';
  const sig = crypto.createHmac('sha256', secret).update(`unsub:${payload}`).digest('hex').slice(0, 16);
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

function parseUnsubscribeToken(token) {
  try {
    if (!token || typeof token !== 'string') return null;
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length < 3) return null;
    const sig = parts.pop();
    const storeId = Number(parts.shift());
    const email = parts.join(':').trim().toLowerCase();
    if (!storeId || !email) return null;
    const secret = process.env.JWT_SECRET || 'trace-erp-secret-key-2024';
    const expected = crypto.createHmac('sha256', secret).update(`unsub:${storeId}:${email}`).digest('hex').slice(0, 16);
    if (sig !== expected) return null;
    return { storeId, email };
  } catch (_) {
    return null;
  }
}

function addUnsubscribe(storeId, email, reason = 'user_opt_out') {
  ensureRemarketingTables();
  const sid = Number(storeId) || 1;
  const clean = String(email || '').trim().toLowerCase();
  if (!clean) return;
  db.prepare(`
    INSERT OR IGNORE INTO email_unsubscribes (store_id, email, reason, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(sid, clean, reason);
  // Also mark any pending drip recipients for this store+email as unsubscribed
  db.prepare(`
    UPDATE remarketing_recipients
    SET status = 'unsubscribed'
    WHERE store_id = ? AND LOWER(TRIM(email)) = ? AND status = 'pending'
  `).run(sid, clean);
}

function isEmailUnsubscribed(storeId, email) {
  ensureRemarketingTables();
  const sid = Number(storeId) || 1;
  const clean = String(email || '').trim().toLowerCase();
  if (!clean) return false;
  const row = db.prepare('SELECT id FROM email_unsubscribes WHERE store_id = ? AND email = ? LIMIT 1').get(sid, clean);
  return Boolean(row);
}

/**
 * Builds an ultra-minimal, human-style white letter email designed to land in Gmail Primary Inbox
 * (no dark marketing banners, no flashy promo blocks, crisp textContent companion, subtle 1-line opt-out).
 */
function buildPrimaryLetterEmail({ brandName, storeUrlDisplay, bodyText, ctaLabel, ctaUrl, unsubscribeUrl }) {
  const paragraphs = String(bodyText || '')
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean);

  const htmlParagraphs = paragraphs
    .map(p => `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#1f2937;">${escHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');

  const safeCtaUrl = (ctaUrl || '').trim();
  const safeCtaLabel = (ctaLabel || '').trim();
  const htmlCta = safeCtaUrl
    ? `<p style="margin:18px 0 20px;"><a href="${escHtml(safeCtaUrl)}" style="color:#111827;font-weight:600;text-decoration:underline;font-size:15px;">${escHtml(safeCtaLabel || safeCtaUrl)} &rarr;</a></p>`
    : '';

  const htmlUnsub = unsubscribeUrl
    ? `<p style="margin:26px 0 0;padding-top:14px;border-top:1px solid #f3f4f6;font-size:12px;color:#9ca3af;line-height:1.5;">If you'd prefer not to receive updates from ${escHtml(brandName)}, you can reply &quot;stop&quot; or <a href="${escHtml(unsubscribeUrl)}" style="color:#6b7280;text-decoration:underline;">opt out here</a>.</p>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#ffffff;color:#1f2937;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:540px;margin:0 auto;padding:24px 18px;">
    ${htmlParagraphs}
    ${htmlCta}
    <p style="margin:18px 0 0;font-size:14px;line-height:1.6;color:#111827;">
      Best,<br>
      <strong>${escHtml(brandName)}</strong><br>
      <span style="font-size:12px;color:#6b7280;">${escHtml(storeUrlDisplay)}</span>
    </p>
    ${htmlUnsub}
  </div>
</body>
</html>`;

  const textParts = [String(bodyText || '').trim()];
  if (safeCtaUrl) {
    textParts.push('', `${safeCtaLabel ? `${safeCtaLabel}: ` : ''}${safeCtaUrl}`);
  }
  textParts.push('', 'Best,', `${brandName} (${storeUrlDisplay})`);
  if (unsubscribeUrl) {
    textParts.push('', `If you'd prefer not to receive updates from ${brandName}, reply "stop" or opt out here: ${unsubscribeUrl}`);
  }

  return { html, text: textParts.join('\n') };
}

/**
 * Low-level sender using strictly this store's isolated Brevo/Resend API credentials.
 */
async function sendStoreIsolatedEmail(storeId, { fromName, fromEmail, replyTo, toEmail, toName, subject, html, text }) {
  const sid = Number(storeId) || 1;
  const status = getEmailProviderStatus(sid);
  if (!status.configured) {
    return { ok: false, provider: status.provider, error: status.error };
  }
  const cfg = getStoreEmailConfig(sid);
  const effectiveFromName = (fromName || cfg.fromName || cfg.storeName).trim();
  const effectiveFromEmail = (fromEmail || cfg.fromEmail).trim();
  const effectiveReplyTo = (replyTo || cfg.replyTo || effectiveFromEmail).trim();

  try {
    if (cfg.provider === 'resend') {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cfg.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${effectiveFromName} <${effectiveFromEmail}>`,
          to: [toEmail],
          reply_to: effectiveReplyTo,
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
      return { ok: true, provider: 'resend', fromEmail: effectiveFromEmail };
    }

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': cfg.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: effectiveFromName, email: effectiveFromEmail },
        to: [{ email: toEmail, name: toName || 'Customer' }],
        replyTo: { email: effectiveReplyTo, name: effectiveFromName },
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
    return { ok: true, provider: 'brevo', fromEmail: effectiveFromEmail };
  } catch (err) {
    return { ok: false, provider: cfg.provider, error: err.message };
  }
}

/**
 * Fetches per-store Remarketing & Autopilot settings.
 */
function getRemarketingConfig(storeId = 1) {
  ensureRemarketingTables();
  const sid = Number(storeId) || 1;
  const base = getStoreEmailConfig(sid);
  let row = null;
  try {
    row = db.prepare(`
      SELECT review_reward_enabled, review_reward_min_rating, review_reward_code, review_reward_message,
             remarketing_from_name, remarketing_from_email,
             post_delivery_enabled, post_delivery_days, post_delivery_code, post_delivery_subject, post_delivery_body
      FROM store_email_settings WHERE store_id = ?
    `).get(sid);
  } catch (_) {}

  const unsubRow = db.prepare('SELECT COUNT(*) as c FROM email_unsubscribes WHERE store_id = ?').get(sid);

  const defaultRewardMsg = `Hi {{first_name}},\n\nThank you so much for taking a moment to review your {{product_title}}. Feedback from customers like you genuinely means a lot to our team.\n\nAs a small thank-you, here is a personal code you can use on your next order: {{coupon_code}}\n\nJust reply to this email anytime if you ever need sizing help.`;
  const defaultPostSubj = `Quick check-in on your {{store_name}} order {{order_ref}}, {{first_name}}`;
  const defaultPostBody = `Hi {{first_name}},\n\nHope you've been enjoying your {{product_title}} from order {{order_ref}}.\n\nWe just restocked a few fresh pieces that pair really well with it. If you're planning to pick up anything else soon, feel free to use code {{coupon_code}} at checkout.\n\nJust reply here if you want sizing advice on any piece.`;

  return {
    storeId: sid,
    storeName: base.storeName,
    fromName: base.fromName,
    fromEmail: base.fromEmail,
    websiteUrl: base.websiteUrl,
    configured: getEmailProviderStatus(sid).configured,
    unsubscribedCount: unsubRow?.c || 0,
    remarketingFromName: (row?.remarketing_from_name || '').trim(),
    remarketingFromEmail: (row?.remarketing_from_email || '').trim(),
    reviewRewardEnabled: Boolean(row?.review_reward_enabled),
    reviewRewardMinRating: Number(row?.review_reward_min_rating) || 4,
    reviewRewardCode: (row?.review_reward_code || '').trim(),
    reviewRewardMessage: (row?.review_reward_message || '').trim() || defaultRewardMsg,
    postDeliveryEnabled: Boolean(row?.post_delivery_enabled),
    postDeliveryDays: Number(row?.post_delivery_days) || 10,
    postDeliveryCode: (row?.post_delivery_code || '').trim(),
    postDeliverySubject: (row?.post_delivery_subject || '').trim() || defaultPostSubj,
    postDeliveryBody: (row?.post_delivery_body || '').trim() || defaultPostBody,
  };
}

function saveRemarketingConfig(storeId, payload = {}) {
  ensureRemarketingTables();
  const sid = Number(storeId) || 1;
  const base = getStoreEmailConfig(sid);
  const curr = getRemarketingConfig(sid);

  // Ensure row exists in store_email_settings first without disturbing API key
  db.prepare(`
    INSERT OR IGNORE INTO store_email_settings
      (store_id, enabled, provider, api_key, from_name, from_email, reply_to, website_url, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(sid, base.enabled ? 1 : 0, base.provider, base.apiKey, base.fromName, base.fromEmail, base.replyTo, base.websiteUrl);

  const reviewRewardEnabled = payload.reviewRewardEnabled !== undefined ? (payload.reviewRewardEnabled ? 1 : 0) : (curr.reviewRewardEnabled ? 1 : 0);
  const reviewRewardMinRating = Math.min(5, Math.max(1, parseInt(payload.reviewRewardMinRating ?? curr.reviewRewardMinRating, 10) || 4));
  const reviewRewardCode = (payload.reviewRewardCode !== undefined ? String(payload.reviewRewardCode) : curr.reviewRewardCode).trim();
  const reviewRewardMessage = (payload.reviewRewardMessage !== undefined ? String(payload.reviewRewardMessage) : curr.reviewRewardMessage).trim();

  const remarketingFromName = (payload.remarketingFromName !== undefined ? String(payload.remarketingFromName) : curr.remarketingFromName).trim();
  const remarketingFromEmail = (payload.remarketingFromEmail !== undefined ? String(payload.remarketingFromEmail) : curr.remarketingFromEmail).trim();

  const postDeliveryEnabled = payload.postDeliveryEnabled !== undefined ? (payload.postDeliveryEnabled ? 1 : 0) : (curr.postDeliveryEnabled ? 1 : 0);
  const postDeliveryDays = Math.min(60, Math.max(3, parseInt(payload.postDeliveryDays ?? curr.postDeliveryDays, 10) || 10));
  const postDeliveryCode = (payload.postDeliveryCode !== undefined ? String(payload.postDeliveryCode) : curr.postDeliveryCode).trim();
  const postDeliverySubject = (payload.postDeliverySubject !== undefined ? String(payload.postDeliverySubject) : curr.postDeliverySubject).trim();
  const postDeliveryBody = (payload.postDeliveryBody !== undefined ? String(payload.postDeliveryBody) : curr.postDeliveryBody).trim();

  db.prepare(`
    UPDATE store_email_settings SET
      review_reward_enabled = ?,
      review_reward_min_rating = ?,
      review_reward_code = ?,
      review_reward_message = ?,
      remarketing_from_name = ?,
      remarketing_from_email = ?,
      post_delivery_enabled = ?,
      post_delivery_days = ?,
      post_delivery_code = ?,
      post_delivery_subject = ?,
      post_delivery_body = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE store_id = ?
  `).run(
    reviewRewardEnabled, reviewRewardMinRating, reviewRewardCode, reviewRewardMessage,
    remarketingFromName, remarketingFromEmail,
    postDeliveryEnabled, postDeliveryDays, postDeliveryCode, postDeliverySubject, postDeliveryBody,
    sid
  );

  return getRemarketingConfig(sid);
}

/**
 * FLOW 1: Instant Thank-You + Coupon Reward when customer submits a 4★/5★ review.
 * Sent from transactional orders@ sender (100% Primary Inbox!).
 */
async function sendReviewRewardEmail({ storeId = 1, customerName, customerEmail, rating, productTitle }) {
  try {
    const sid = Number(storeId) || 1;
    const rmk = getRemarketingConfig(sid);
    if (!rmk.configured || !rmk.reviewRewardEnabled || !rmk.reviewRewardCode) return { skipped: true };
    if (Number(rating) < rmk.reviewRewardMinRating) return { skipped: true };
    if (!customerEmail || isEmailUnsubscribed(sid, customerEmail)) return { skipped: true };

    const firstName = (customerName || 'there').trim().split(' ')[0];
    const storeUrlDisplay = rmk.websiteUrl.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    const applyVars = (s) => String(s || '')
      .replace(/\{\{first_name\}\}/g, firstName)
      .replace(/\{\{customer_name\}\}/g, customerName || 'Customer')
      .replace(/\{\{product_title\}\}/g, productTitle || 'your item')
      .replace(/\{\{coupon_code\}\}/g, rmk.reviewRewardCode)
      .replace(/\{\{store_name\}\}/g, rmk.fromName || rmk.storeName);

    const subject = `Thank you for your review, ${firstName}`;
    const bodyText = applyVars(rmk.reviewRewardMessage);
    const { html, text } = buildPrimaryLetterEmail({
      brandName: rmk.fromName || rmk.storeName,
      storeUrlDisplay,
      bodyText,
      ctaLabel: `Visit ${storeUrlDisplay}`,
      ctaUrl: rmk.websiteUrl,
      unsubscribeUrl: '', // Transactional thank-you reply to customer's own action
    });

    const result = await sendStoreIsolatedEmail(sid, {
      fromName: rmk.fromName,
      fromEmail: rmk.fromEmail,
      toEmail: customerEmail,
      toName: customerName,
      subject,
      html,
      text,
    });
    if (result.ok) {
      console.log(`🎁 [Remarketing/Reward/Store #${sid}] Sent thank-you coupon (${rmk.reviewRewardCode}) to ${customerEmail}`);
    }
    return result;
  } catch (err) {
    console.error('[Remarketing/Reward] Error:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Smart Delivered-Only Audience Query (Strictly Per-Store, Excludes RTO/Returns & Unsubscribes).
 */
function queryRemarketingAudience(storeId, filters = {}, limitRows = 5000) {
  ensureRemarketingTables();
  const sid = Number(storeId) || 1;
  const segment = filters.segment || 'all_delivered';
  const excludeRto = filters.excludeRto !== false;
  const city = (filters.city || '').trim().toLowerCase();
  const product = (filters.product || '').trim().toLowerCase();
  const minSpent = parseFloat(filters.minSpent) || 0;

  const where = [
    'o.store_id = ?',
    "LOWER(o.delivery_status) = 'delivered'",
    "o.email IS NOT NULL AND TRIM(o.email) != '' AND INSTR(o.email, '@') > 1",
    'LOWER(TRIM(o.email)) NOT IN (SELECT LOWER(TRIM(email)) FROM email_unsubscribes WHERE store_id = ?)',
  ];
  const params = [sid, sid];

  if (excludeRto) {
    where.push(`
      LOWER(TRIM(o.email)) NOT IN (
        SELECT DISTINCT LOWER(TRIM(email)) FROM orders
        WHERE store_id = ? AND email IS NOT NULL AND TRIM(email) != ''
          AND LOWER(delivery_status) IN ('returned', 'return received', 'refused', 'rto')
      )
    `);
    params.push(sid);
  }

  if (city) {
    where.push('LOWER(COALESCE(o.city, \'\')) LIKE ?');
    params.push(`%${city}%`);
  }

  if (product) {
    where.push('LOWER(COALESCE(o.product_titles, \'\')) LIKE ?');
    params.push(`%${product}%`);
  }

  const having = [];
  if (segment === 'vip') {
    having.push('COUNT(*) >= 2');
  } else if (segment === 'winback_45') {
    having.push("MAX(date(COALESCE(NULLIF(o.order_date,''), o.created_timestamp))) <= date('now', '-45 days')");
  } else if (segment === 'winback_90') {
    having.push("MAX(date(COALESCE(NULLIF(o.order_date,''), o.created_timestamp))) <= date('now', '-90 days')");
  } else if (segment === 'recent_30') {
    having.push("MAX(date(COALESCE(NULLIF(o.order_date,''), o.created_timestamp))) >= date('now', '-30 days')");
  }
  if (minSpent > 0) {
    having.push('SUM(COALESCE(o.price, 0)) >= ?');
    params.push(minSpent);
  }

  const havingSql = having.length ? `HAVING ${having.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT
      LOWER(TRIM(o.email)) AS email,
      MAX(o.customer_name) AS customer_name,
      MAX(o.ref_number) AS last_order_ref,
      MAX(o.product_titles) AS last_product,
      MAX(o.city) AS city,
      COUNT(*) AS delivered_orders,
      ROUND(SUM(COALESCE(o.price, 0)), 0) AS total_spent,
      MAX(date(COALESCE(NULLIF(o.order_date,''), o.created_timestamp))) AS last_order_date
    FROM orders o
    WHERE ${where.join(' AND ')}
    GROUP BY LOWER(TRIM(o.email))
    ${havingSql}
    ORDER BY last_order_date DESC
    LIMIT ?
  `).all(...params, limitRows);

  return rows;
}

/**
 * Creates a remarketing broadcast campaign and populates its deduplicated drip queue.
 */
function createRemarketingCampaign(storeId, payload = {}) {
  ensureRemarketingTables();
  const sid = Number(storeId) || 1;
  const status = getEmailProviderStatus(sid);
  if (!status.configured) throw new Error(status.error);

  const rmk = getRemarketingConfig(sid);
  const name = (payload.name || '').trim();
  const subject = (payload.subject || '').trim();
  const bodyText = (payload.bodyText || '').trim();
  if (!name || !subject || !bodyText) {
    throw new Error('Campaign name, subject, and message body are required.');
  }

  const dailyLimit = Math.min(MAX_DAILY_DRIP_CAP, Math.max(10, parseInt(payload.dailyLimit, 10) || 150));
  const filters = payload.filters || {};
  const audience = queryRemarketingAudience(sid, filters, 5000);
  if (audience.length === 0) {
    throw new Error('No eligible verified delivered buyers match these filters.');
  }

  const senderName = (payload.senderName || rmk.remarketingFromName || rmk.fromName).trim();
  const senderEmail = (payload.senderEmail || rmk.remarketingFromEmail || rmk.fromEmail).trim();
  const ctaLabel = (payload.ctaLabel || '').trim();
  const ctaUrl = (payload.ctaUrl || '').trim();
  const initialStatus = payload.startImmediately === false ? 'paused' : 'running';

  const insertCamp = db.prepare(`
    INSERT INTO remarketing_campaigns
      (store_id, name, sender_name, sender_email, subject, body_text, cta_label, cta_url, filters_json, daily_limit, status, total_recipients, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    sid, name, senderName, senderEmail, subject, bodyText, ctaLabel, ctaUrl,
    JSON.stringify(filters), dailyLimit, initialStatus, audience.length
  );

  const campaignId = Number(insertCamp.lastInsertRowid);
  const insertRecip = db.prepare(`
    INSERT OR IGNORE INTO remarketing_recipients
      (campaign_id, store_id, email, customer_name, last_order_ref, last_product, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `);

  db.exec('BEGIN');
  try {
    for (const buyer of audience) {
      const cleanProd = String(buyer.last_product || '').split(',')[0].replace(/\s*\(x\d+\)\s*$/i, '').trim();
      insertRecip.run(campaignId, sid, buyer.email, buyer.customer_name || '', buyer.last_order_ref || '', cleanProd);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  return { campaignId, totalRecipients: audience.length, status: initialStatus, dailyLimit };
}

/**
 * FLOW 3: Auto-Drip Queue Worker (runs every 15m or via manual "Send Batch Now").
 * Sends max `maxBatchPerRun` (default 12) staggered human-paced emails per active campaign
 * while strictly respecting per-store daily quota cap (reserves 80/day for transactional reviews).
 */
async function processRemarketingDripQueue(targetCampaignId = null, maxBatchPerRun = 12) {
  ensureRemarketingTables();
  const campaigns = targetCampaignId
    ? db.prepare('SELECT * FROM remarketing_campaigns WHERE id = ?').all(Number(targetCampaignId))
    : db.prepare("SELECT * FROM remarketing_campaigns WHERE status = 'running' ORDER BY id ASC").all();

  if (!campaigns || campaigns.length === 0) {
    return { processed: 0, sent: 0, failed: 0, campaignsChecked: 0 };
  }

  let totalSent = 0;
  let totalFailed = 0;
  let lastError = null;

  for (const camp of campaigns) {
    const sid = Number(camp.store_id);
    const providerStatus = getEmailProviderStatus(sid);
    if (!providerStatus.configured) {
      db.prepare("UPDATE remarketing_campaigns SET status = 'paused', last_error = ?, updated_at = datetime('now') WHERE id = ?")
        .run(providerStatus.error, camp.id);
      continue;
    }

    // Check how many remarketing emails this store already sent today (UTC date)
    const sentTodayRow = db.prepare(`
      SELECT COUNT(*) as c FROM remarketing_recipients
      WHERE store_id = ? AND status = 'sent' AND date(sent_at) = date('now')
    `).get(sid);
    const sentToday = sentTodayRow?.c || 0;
    const storeCap = Math.min(MAX_DAILY_DRIP_CAP, Number(camp.daily_limit) || 150);
    const remainingToday = Math.max(0, storeCap - sentToday);
    if (remainingToday <= 0) {
      continue;
    }

    const batchLimit = Math.min(remainingToday, maxBatchPerRun);
    const pendingRows = db.prepare(`
      SELECT * FROM remarketing_recipients
      WHERE campaign_id = ? AND status = 'pending'
      ORDER BY id ASC
      LIMIT ?
    `).all(camp.id, batchLimit);

    if (pendingRows.length === 0) {
      db.prepare("UPDATE remarketing_campaigns SET status = 'completed', updated_at = datetime('now') WHERE id = ?").run(camp.id);
      continue;
    }

    const cfg = getStoreEmailConfig(sid);
    const brandName = camp.sender_name || cfg.fromName || cfg.storeName;
    const storeUrlDisplay = cfg.websiteUrl.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    let consecutiveFailures = 0;

    for (const recip of pendingRows) {
      if (isEmailUnsubscribed(sid, recip.email)) {
        db.prepare("UPDATE remarketing_recipients SET status = 'unsubscribed' WHERE id = ?").run(recip.id);
        continue;
      }

      const firstName = (recip.customer_name || 'there').trim().split(' ')[0];
      const applyVars = (s) => String(s || '')
        .replace(/\{\{first_name\}\}/g, firstName)
        .replace(/\{\{customer_name\}\}/g, recip.customer_name || 'Customer')
        .replace(/\{\{last_product\}\}/g, recip.last_product || 'your recent order')
        .replace(/\{\{order_ref\}\}/g, recip.last_order_ref || '')
        .replace(/\{\{store_name\}\}/g, cfg.fromName || cfg.storeName)
        .replace(/\{\{store_url\}\}/g, cfg.websiteUrl);

      const subject = applyVars(camp.subject);
      const bodyText = applyVars(camp.body_text);
      const unsubToken = generateUnsubscribeToken(sid, recip.email);
      const unsubUrl = `${BACKEND_URL}/api/public/email-unsubscribe?token=${unsubToken}`;

      const { html, text } = buildPrimaryLetterEmail({
        brandName,
        storeUrlDisplay,
        bodyText,
        ctaLabel: applyVars(camp.cta_label),
        ctaUrl: applyVars(camp.cta_url),
        unsubscribeUrl: unsubUrl,
      });

      const res = await sendStoreIsolatedEmail(sid, {
        fromName: brandName,
        fromEmail: camp.sender_email || cfg.fromEmail,
        toEmail: recip.email,
        toName: recip.customer_name,
        subject,
        html,
        text,
      });

      if (res.ok) {
        consecutiveFailures = 0;
        totalSent++;
        db.prepare("UPDATE remarketing_recipients SET status = 'sent', sent_at = datetime('now'), error_msg = '' WHERE id = ?").run(recip.id);
        db.prepare("UPDATE remarketing_campaigns SET sent_count = sent_count + 1, last_error = '', updated_at = datetime('now') WHERE id = ?").run(camp.id);
      } else {
        consecutiveFailures++;
        totalFailed++;
        lastError = res.error || 'Send failed';
        db.prepare("UPDATE remarketing_recipients SET status = 'failed', error_msg = ? WHERE id = ?").run(lastError, recip.id);
        db.prepare("UPDATE remarketing_campaigns SET failed_count = failed_count + 1, last_error = ?, updated_at = datetime('now') WHERE id = ?").run(lastError, camp.id);

        if (consecutiveFailures >= 3) {
          db.prepare("UPDATE remarketing_campaigns SET status = 'paused', last_error = ?, updated_at = datetime('now') WHERE id = ?")
            .run(`Auto-paused after 3 consecutive errors: ${lastError}`, camp.id);
          console.error(`❌ [Remarketing/Drip] Campaign #${camp.id} auto-paused: ${lastError}`);
          break;
        }
      }

      // Human-paced 1.5s spacing between emails
      await new Promise(r => setTimeout(r, 1500));
    }

    // Check if campaign is now finished
    const leftRow = db.prepare("SELECT COUNT(*) as c FROM remarketing_recipients WHERE campaign_id = ? AND status = 'pending'").get(camp.id);
    if ((leftRow?.c || 0) === 0 && consecutiveFailures < 3) {
      db.prepare("UPDATE remarketing_campaigns SET status = 'completed', updated_at = datetime('now') WHERE id = ?").run(camp.id);
    }
  }

  return { processed: totalSent + totalFailed, sent: totalSent, failed: totalFailed, lastError, campaignsChecked: campaigns.length };
}

/**
 * FLOW 2: Day +10 Post-Delivery Repeat Buyer Check-In Autopilot.
 * Strictly per-store, verified 0-RTO Delivered buyers only, max 40/day per store.
 */
async function runPostDeliveryAutopilot(targetStoreId = null) {
  ensureRemarketingTables();
  try { db.exec('ALTER TABLE orders ADD COLUMN post_delivery_email_sent INTEGER DEFAULT 0'); } catch (_) {}

  const stores = targetStoreId
    ? [{ id: Number(targetStoreId) }]
    : db.prepare('SELECT id FROM stores ORDER BY id ASC').all();

  let totalSent = 0;
  for (const s of stores) {
    const sid = Number(s.id);
    const rmk = getRemarketingConfig(sid);
    if (!rmk.configured || !rmk.postDeliveryEnabled) continue;

    const minDays = rmk.postDeliveryDays || 10;
    const maxDays = minDays + 5;
    const orders = db.prepare(`
      SELECT id, store_id, ref_number, customer_name, email, product_titles
      FROM orders
      WHERE store_id = ?
        AND LOWER(delivery_status) = 'delivered'
        AND (post_delivery_email_sent IS NULL OR post_delivery_email_sent = 0)
        AND email IS NOT NULL AND TRIM(email) != '' AND INSTR(email, '@') > 1
        AND status_date IS NOT NULL
        AND datetime(status_date) <= datetime('now', '-${minDays} days')
        AND datetime(status_date) >= datetime('now', '-${maxDays} days')
        AND LOWER(TRIM(email)) NOT IN (SELECT LOWER(TRIM(email)) FROM email_unsubscribes WHERE store_id = ?)
        AND LOWER(TRIM(email)) NOT IN (
          SELECT DISTINCT LOWER(TRIM(email)) FROM orders
          WHERE store_id = ? AND email IS NOT NULL AND LOWER(delivery_status) IN ('returned', 'return received', 'refused', 'rto')
        )
      ORDER BY status_date DESC
      LIMIT 40
    `).all(sid, sid, sid);

    if (orders.length === 0) continue;
    const storeUrlDisplay = rmk.websiteUrl.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    let fails = 0;

    for (const order of orders) {
      const firstName = (order.customer_name || 'there').trim().split(' ')[0];
      const prod = String(order.product_titles || 'your recent item').split(',')[0].replace(/\s*\(x\d+\)\s*$/i, '').trim();
      const refLabel = order.ref_number || `#${order.id}`;
      const applyVars = (str) => String(str || '')
        .replace(/\{\{first_name\}\}/g, firstName)
        .replace(/\{\{customer_name\}\}/g, order.customer_name || 'Customer')
        .replace(/\{\{product_title\}\}/g, prod)
        .replace(/\{\{order_ref\}\}/g, refLabel)
        .replace(/\{\{coupon_code\}\}/g, rmk.postDeliveryCode || '')
        .replace(/\{\{store_name\}\}/g, rmk.fromName || rmk.storeName);

      const unsubUrl = `${BACKEND_URL}/api/public/email-unsubscribe?token=${generateUnsubscribeToken(sid, order.email)}`;
      const { html, text } = buildPrimaryLetterEmail({
        brandName: rmk.fromName || rmk.storeName,
        storeUrlDisplay,
        bodyText: applyVars(rmk.postDeliveryBody),
        ctaLabel: `Browse new arrivals at ${storeUrlDisplay}`,
        ctaUrl: rmk.websiteUrl,
        unsubscribeUrl: unsubUrl,
      });

      const res = await sendStoreIsolatedEmail(sid, {
        fromName: rmk.fromName,
        fromEmail: rmk.fromEmail,
        toEmail: order.email.trim(),
        toName: order.customer_name,
        subject: applyVars(rmk.postDeliverySubject),
        html,
        text,
      });

      if (res.ok) {
        fails = 0;
        totalSent++;
        db.prepare('UPDATE orders SET post_delivery_email_sent = 1 WHERE id = ?').run(order.id);
      } else {
        fails++;
        if (fails >= 3) break;
      }
      await new Promise(r => setTimeout(r, 800));
    }
  }
  return { sent: totalSent };
}

/**
 * Lists all campaigns for a store with real-time Order & PKR Revenue Attribution
 * (counts new non-cancelled orders by recipients within 14 days after their email was sent).
 */
function listCampaignsWithAttribution(storeId) {
  ensureRemarketingTables();
  const sid = Number(storeId) || 1;
  const campaigns = db.prepare(`
    SELECT * FROM remarketing_campaigns
    WHERE store_id = ?
    ORDER BY id DESC
    LIMIT 30
  `).all(sid);

  const attrStmt = db.prepare(`
    SELECT COUNT(DISTINCT o.id) AS orders_count, ROUND(COALESCE(SUM(o.price), 0), 0) AS revenue_pkr
    FROM remarketing_recipients r
    JOIN orders o ON o.store_id = r.store_id
      AND LOWER(TRIM(o.email)) = LOWER(TRIM(r.email))
      AND LOWER(COALESCE(o.delivery_status, '')) != 'cancelled'
      AND datetime(COALESCE(NULLIF(o.order_date, ''), o.created_timestamp)) >= datetime(r.sent_at)
      AND datetime(COALESCE(NULLIF(o.order_date, ''), o.created_timestamp)) <= datetime(r.sent_at, '+14 days')
    WHERE r.campaign_id = ? AND r.status = 'sent' AND r.sent_at IS NOT NULL
  `);

  const sentTodayRow = db.prepare(`
    SELECT COUNT(*) AS c FROM remarketing_recipients
    WHERE store_id = ? AND status = 'sent' AND date(sent_at) = date('now')
  `).get(sid);

  return {
    sentToday: sentTodayRow?.c || 0,
    maxDailyCap: MAX_DAILY_DRIP_CAP,
    campaigns: campaigns.map(c => {
      let attr = { orders_count: 0, revenue_pkr: 0 };
      if (c.sent_count > 0) {
        try { attr = attrStmt.get(c.id) || attr; } catch (_) {}
      }
      return {
        ...c,
        filters: (() => { try { return JSON.parse(c.filters_json || '{}'); } catch (_) { return {}; } })(),
        attributedOrders: attr.orders_count || 0,
        attributedRevenue: attr.revenue_pkr || 0,
      };
    }),
  };
}

module.exports = {
  ensureRemarketingTables,
  generateUnsubscribeToken,
  parseUnsubscribeToken,
  addUnsubscribe,
  isEmailUnsubscribed,
  buildPrimaryLetterEmail,
  sendStoreIsolatedEmail,
  getRemarketingConfig,
  saveRemarketingConfig,
  sendReviewRewardEmail,
  queryRemarketingAudience,
  createRemarketingCampaign,
  processRemarketingDripQueue,
  runPostDeliveryAutopilot,
  listCampaignsWithAttribution,
};
