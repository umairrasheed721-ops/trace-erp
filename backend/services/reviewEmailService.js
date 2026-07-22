/**
 * services/reviewEmailService.js
 *
 * Sends review request emails to customers after order delivery.
 * Uses nodemailer with Gmail SMTP (same as auth.js pattern).
 *
 * Email is sent 24 hours after order marked as Delivered.
 * Uses a secure token so customer can submit review without login.
 */

const nodemailer = require('nodemailer');
const crypto = require('crypto');

const BACKEND_URL = process.env.APP_URL || 'https://trace-erp-production.up.railway.app';

function getTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
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
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length < 5) return null;

    const signature = parts.pop();
    const productHandle = parts.pop();
    const timestamp = parts.pop();
    const customerEmail = parts.pop();
    const orderId = parts.join(':'); // handles emails with colons

    // Verify signature
    const payload = `${orderId}:${customerEmail}:${productHandle}:${timestamp}`;
    const secret = process.env.JWT_SECRET || 'trace-erp-secret-key-2024';
    const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 16);
    if (signature !== expectedSig) return null;

    // Check expiry — 30 days
    const age = Date.now() - parseInt(timestamp, 10);
    if (age > 30 * 24 * 60 * 60 * 1000) return null;

    return { orderId, customerEmail, productHandle };
  } catch (e) {
    return null;
  }
}

const DEFAULT_SUBJECT = 'How was your TRACE order, {{first_name}}? ⭐';
const DEFAULT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>How was your TRACE order?</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#141414;border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1a1a1a,#222);padding:36px 40px;text-align:center;border-bottom:1px solid #2a2a2a;">
              <div style="font-size:28px;font-weight:900;letter-spacing:6px;color:#fff;text-transform:uppercase;">TRACE</div>
              <div style="font-size:11px;letter-spacing:3px;color:#888;margin-top:4px;text-transform:uppercase;">Premium Streetwear</div>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#fff;">Hi {{customer_name}}, 👋</p>
              <p style="margin:0 0 24px;font-size:15px;color:#aaa;line-height:1.6;">
                Your order has been delivered! We hope you're loving your <strong style="color:#fff;">{{product_title}}</strong>.
              </p>

              <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:24px;text-align:center;margin:0 0 28px;">
                <p style="margin:0 0 8px;font-size:14px;color:#888;text-transform:uppercase;letter-spacing:2px;">Share Your Experience</p>
                <div style="font-size:32px;letter-spacing:4px;margin:12px 0;">⭐⭐⭐⭐⭐</div>
                <p style="margin:0;font-size:13px;color:#666;">It only takes 30 seconds!</p>
              </div>

              <div style="text-align:center;margin:0 0 28px;">
                <a href="{{review_url}}"
                   style="display:inline-block;background:#fff;color:#000;font-weight:700;font-size:14px;letter-spacing:2px;text-transform:uppercase;padding:16px 40px;border-radius:8px;text-decoration:none;">
                  Write a Review →
                </a>
              </div>

              <p style="margin:0;font-size:13px;color:#555;text-align:center;line-height:1.6;">
                Your review helps other customers and helps us improve.<br>
                Thank you for choosing TRACE.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #1e1e1e;text-align:center;">
              <p style="margin:0;font-size:12px;color:#444;">
                © 2025 TRACE Pakistan · <a href="https://tracepk.com" style="color:#666;text-decoration:none;">tracepk.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

function getTemplateFromDb() {
  try {
    const path = require('path');
    const { DatabaseSync } = require('node:sqlite');
    const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../trace_erp.db');
    const db = new DatabaseSync(DB_PATH);
    
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
  } catch (e) {}
  return { subject: DEFAULT_SUBJECT, body_html: DEFAULT_HTML };
}

/**
 * Send a review request email to a customer.
 */
async function sendReviewRequestEmail({ orderId, customerName, customerEmail, productHandle, productTitle }) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('⚠️ [Reviews] EMAIL_USER/EMAIL_PASS not set — skipping review email');
    return false;
  }

  const token = generateReviewToken(orderId, customerEmail, productHandle);
  const reviewUrl = `${BACKEND_URL}/api/public/review-form?token=${token}`;

  const template = getTemplateFromDb();
  const firstName = customerName?.split(' ')[0] || 'there';
  const fullName = customerName || 'Valued Customer';
  const itemTitle = productTitle || 'your recent purchase';

  const subject = (template.subject || DEFAULT_SUBJECT)
    .replace(/\{\{customer_name\}\}/g, fullName)
    .replace(/\{\{first_name\}\}/g, firstName)
    .replace(/\{\{product_title\}\}/g, itemTitle);

  const html = (template.body_html || DEFAULT_HTML)
    .replace(/\{\{customer_name\}\}/g, fullName)
    .replace(/\{\{first_name\}\}/g, firstName)
    .replace(/\{\{product_title\}\}/g, itemTitle)
    .replace(/\{\{review_url\}\}/g, reviewUrl);

  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: `"TRACE Pakistan" <${process.env.EMAIL_USER}>`,
      to: customerEmail,
      subject,
      html,
    });
    console.log(`📧 [Reviews] Review request email sent to ${customerEmail} for order #${orderId}`);
    return true;
  } catch (err) {
    console.error(`❌ [Reviews] Failed to send review email to ${customerEmail}:`, err.message);
    return false;
  }
}

module.exports = {
  sendReviewRequestEmail,
  parseReviewToken,
  generateReviewToken,
  getTemplateFromDb,
  DEFAULT_SUBJECT,
  DEFAULT_HTML
};
