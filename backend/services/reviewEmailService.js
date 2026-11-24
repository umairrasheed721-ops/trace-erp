/**
 * services/reviewEmailService.js
 *
 * Sends review request emails to customers after order delivery.
 * Uses nodemailer with Gmail SMTP (same as auth.js pattern).
 *
 * Email is sent 24 hours after order marked as Delivered.
 * Uses a secure token so customer can submit review without login.
 */

const crypto = require('crypto');
const db = require('../db');

const BACKEND_URL = process.env.APP_URL || 'https://trace-erp-production.up.railway.app';
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'TRACE Pakistan';
const EMAIL_API_TIMEOUT_MS = 10000;

/**
 * Inspects active email provider configuration in priority order:
 * 1. Resend HTTP API (RESEND_API_KEY)
 * 2. Brevo HTTP API (BREVO_API_KEY + EMAIL_FROM/EMAIL_USER)
 * 3. Gmail SMTP via nodemailer (EMAIL_USER + EMAIL_PASS)
 */
function getEmailProviderStatus() {
  if (process.env.RESEND_API_KEY) {
    return {
      configured: true,
      provider: 'resend',
      label: 'Resend API',
      fromEmail: process.env.EMAIL_FROM || 'onboarding@resend.dev',
    };
  }
  if (process.env.BREVO_API_KEY) {
    const sender = (process.env.EMAIL_FROM || process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_USER || '').trim();
    if (!sender) {
      return {
        configured: false,
        provider: 'brevo',
        label: 'Brevo (Missing EMAIL_FROM)',
        fromEmail: '',
        error: 'BREVO_API_KEY is set, but EMAIL_FROM (your verified Brevo sender email) is missing in Railway Variables.',
      };
    }
    return {
      configured: true,
      provider: 'brevo',
      label: 'Brevo API',
      fromEmail: sender,
    };
  }
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    return {
      configured: true,
      provider: 'gmail_smtp',
      label: 'Gmail SMTP',
      fromEmail: process.env.EMAIL_USER,
    };
  }
  return {
    configured: false,
    provider: 'none',
    label: 'Not Configured',
    fromEmail: '',
    error: 'No email provider configured. Set BREVO_API_KEY (+ EMAIL_FROM) or RESEND_API_KEY in Railway Variables.',
  };
}

function getTransporter() {
  const nodemailer = require('nodemailer');
  return nodemailer.createTransport({
    service: 'gmail',
    connectionTimeout: EMAIL_API_TIMEOUT_MS,
    greetingTimeout: EMAIL_API_TIMEOUT_MS,
    socketTimeout: EMAIL_API_TIMEOUT_MS,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

/**
 * Generate a secure review token for an order.
 * Token encodes: orderId + customerEmail + productHandle + expiry
 */
function generateReviewToken(orderId, customerEmail, productHandle) {
  const payload = `${orderId}:${customerEmail}:${productHandle}:${Date.now()}`;
  const secret = process.env.JWT_SECRET || 'trace-erp-secret-key-2024';
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 16);
  const encoded = Buffer.from(`${payload}:${signature}`).toString('base64url');
  return encoded;
}

/**
 * Parse and validate a review token.
 * Returns { orderId, customerEmail, productHandle } or null if invalid.
 */
function parseReviewToken(token) {
  try {
    if (!token || typeof token !== 'string') return null;
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length < 5) return null;

    // Payload order in generateReviewToken: orderId : customerEmail : productHandle : timestamp : signature
    const signature = parts.pop();
    const timestamp = parts.pop();
    const productHandle = parts.pop();
    const customerEmail = parts.pop();
    const orderId = parts.join(':');

    // Verify HMAC signature
    const payload = `${orderId}:${customerEmail}:${productHandle}:${timestamp}`;
    const secret = process.env.JWT_SECRET || 'trace-erp-secret-key-2024';
    const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 16);
    if (signature !== expectedSig) return null;

    // Check expiry — 30 days
    const ts = parseInt(timestamp, 10);
    if (isNaN(ts)) return null;
    const age = Date.now() - ts;
    if (age > 30 * 24 * 60 * 60 * 1000) return null;

    return { orderId, customerEmail, productHandle };
  } catch (e) {
    return null;
  }
}

const DEFAULT_SUBJECT = 'Your TRACE order {{order_ref}} — how was it, {{first_name}}?';
const DEFAULT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your TRACE order {{order_ref}}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;color:#111827;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:540px;margin:0 auto;padding:28px 20px;">
    <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#111827;">
      Hi {{first_name}},
    </p>

    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
      Your TRACE order <strong>{{order_ref}}</strong> (<strong>{{product_title}}</strong>) was recently delivered. We hope everything fits and looks great.
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
      <strong>TRACE Pakistan</strong><br>
      <span style="font-size:12px;color:#6b7280;">tracepk.com</span>
    </p>
  </div>
</body>
</html>`;

function getTemplateFromDb() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS email_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        template_key TEXT UNIQUE,
        name TEXT,
        subject TEXT,
        body_html TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const row = db.prepare("SELECT subject, body_html FROM email_templates WHERE template_key = 'review_request'").get();
    if (row && row.subject && row.body_html) {
      return { subject: row.subject, body_html: row.body_html };
    }
  } catch (e) {
    console.warn('⚠️ [Reviews] Failed to read email template from DB:', e.message);
  }
  return { subject: DEFAULT_SUBJECT, body_html: DEFAULT_HTML };
}

/**
 * Send a review request email to a customer.
 * Auto-selects Resend HTTP API -> Brevo HTTP API -> Gmail SMTP fallback.
 * Returns { ok: boolean, provider: string, error?: string }.
 */
async function sendReviewRequestEmail({ orderId, orderRef, customerName, customerEmail, productHandle, productTitle }) {
  const status = getEmailProviderStatus();
  if (!status.configured) {
    console.warn(`⚠️ [Reviews] ${status.error}`);
    return { ok: false, provider: status.provider, error: status.error };
  }

  const token = generateReviewToken(orderId, customerEmail, productHandle);
  const reviewUrl = `${BACKEND_URL}/api/public/review-form?token=${token}`;

  const template = getTemplateFromDb();
  const firstName = customerName?.split(' ')[0] || 'there';
  const fullName = customerName || 'Valued Customer';
  const itemTitle = productTitle || 'your recent purchase';
  const refLabel = orderRef ? (String(orderRef).startsWith('#') ? String(orderRef) : `#${orderRef}`) : `#${orderId}`;
  const replyToEmail = (process.env.EMAIL_REPLY_TO || 'trace721.t@gmail.com').trim();

  const subject = (template.subject || DEFAULT_SUBJECT)
    .replace(/\{\{customer_name\}\}/g, fullName)
    .replace(/\{\{first_name\}\}/g, firstName)
    .replace(/\{\{product_title\}\}/g, itemTitle)
    .replace(/\{\{order_ref\}\}/g, refLabel);

  const html = (template.body_html || DEFAULT_HTML)
    .replace(/\{\{customer_name\}\}/g, fullName)
    .replace(/\{\{first_name\}\}/g, firstName)
    .replace(/\{\{product_title\}\}/g, itemTitle)
    .replace(/\{\{order_ref\}\}/g, refLabel)
    .replace(/\{\{review_url\}\}/g, reviewUrl);

  const text = [
    `Hi ${firstName},`,
    '',
    `Your TRACE order ${refLabel} (${itemTitle}) was recently delivered. We hope everything fits and looks great.`,
    '',
    'Could you take 20 seconds to leave a quick review? Your honest feedback helps us improve:',
    reviewUrl,
    '',
    'If there is any issue with sizing or quality, just reply directly to this email and our team will help you out.',
    '',
    'Thanks,',
    'TRACE Pakistan (tracepk.com)',
  ].join('\n');

  try {
    if (status.provider === 'resend') {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${EMAIL_FROM_NAME} <${status.fromEmail}>`,
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
      console.log(`📧 [Reviews/Resend] Review email sent to ${customerEmail} for order #${orderId}`);
      return { ok: true, provider: 'resend' };
    }

    if (status.provider === 'brevo') {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: EMAIL_FROM_NAME, email: status.fromEmail },
          to: [{ email: customerEmail, name: fullName }],
          replyTo: { email: replyToEmail, name: EMAIL_FROM_NAME },
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
      console.log(`📧 [Reviews/Brevo] Review email sent to ${customerEmail} for order #${orderId}`);
      return { ok: true, provider: 'brevo' };
    }

    // Fallback: Gmail SMTP via nodemailer
    const transporter = getTransporter();
    await transporter.sendMail({
      from: `"${EMAIL_FROM_NAME}" <${status.fromEmail}>`,
      replyTo: replyToEmail,
      to: customerEmail,
      subject,
      html,
      text,
    });
    console.log(`📧 [Reviews/SMTP] Review email sent to ${customerEmail} for order #${orderId}`);
    return { ok: true, provider: 'gmail_smtp' };
  } catch (err) {
    console.error(`❌ [Reviews/${status.provider}] Failed to send review email to ${customerEmail}:`, err.message);
    return { ok: false, provider: status.provider, error: err.message };
  }
}

module.exports = {
  sendReviewRequestEmail,
  getEmailProviderStatus,
  parseReviewToken,
  generateReviewToken,
  getTemplateFromDb,
  DEFAULT_SUBJECT,
  DEFAULT_HTML
};
