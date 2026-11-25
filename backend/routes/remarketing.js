/**
 * routes/remarketing.js
 *
 * Protected endpoints for Primary-Inbox Email Remarketing (Per-Store Isolated):
 * - GET/PUT /api/remarketing/config             (Review->Coupon & Day+10 Check-in & Sender)
 * - POST    /api/remarketing/audience-preview   (Live verified Delivered-only audience count)
 * - GET     /api/remarketing/campaigns          (Campaign history + live PKR attribution)
 * - POST    /api/remarketing/campaigns          (Create & start/pause Auto-Drip campaign)
 * - POST    /api/remarketing/campaigns/send-test (Send live Primary-Inbox test email)
 * - PUT     /api/remarketing/campaigns/:id/status (Pause / Resume)
 * - POST    /api/remarketing/campaigns/:id/drip-now (Trigger immediate 12-email batch)
 * - DELETE  /api/remarketing/campaigns/:id
 */

const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { getStoreEmailConfig } = require('../services/reviewEmailService');
const {
  getRemarketingConfig,
  saveRemarketingConfig,
  queryRemarketingAudience,
  createRemarketingCampaign,
  processRemarketingDripQueue,
  listCampaignsWithAttribution,
  buildPrimaryLetterEmail,
  sendStoreIsolatedEmail,
  generateUnsubscribeToken,
} = require('../services/remarketingEmailService');

const BACKEND_URL = process.env.APP_URL || 'https://trace-erp-production.up.railway.app';

function resolveStoreId(req) {
  return parseInt(req.body?.store_id || req.query.store_id || req.headers['x-active-store-id'], 10) || 1;
}

router.get('/config', (req, res) => {
  try {
    const sid = resolveStoreId(req);
    res.json({ success: true, data: getRemarketingConfig(sid) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/config', (req, res) => {
  try {
    const sid = resolveStoreId(req);
    const updated = saveRemarketingConfig(sid, req.body || {});
    res.json({ success: true, message: 'Remarketing settings saved', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/audience-preview', (req, res) => {
  try {
    const sid = resolveStoreId(req);
    const rows = queryRemarketingAudience(sid, req.body?.filters || {}, 5000);
    res.json({
      success: true,
      data: {
        total: rows.length,
        sample: rows.slice(0, 8),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/campaigns', (req, res) => {
  try {
    const sid = resolveStoreId(req);
    res.json({ success: true, data: listCampaignsWithAttribution(sid) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/campaigns', (req, res) => {
  try {
    const sid = resolveStoreId(req);
    const created = createRemarketingCampaign(sid, req.body || {});
    res.json({
      success: true,
      message: `Campaign queued for ${created.totalRecipients} verified buyers (max ${created.dailyLimit}/day auto-drip)`,
      data: created,
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/campaigns/send-test', async (req, res) => {
  try {
    const sid = resolveStoreId(req);
    const toEmail = (req.body?.email || '').trim();
    if (!toEmail || !toEmail.includes('@')) {
      return res.status(400).json({ success: false, error: 'Please enter a valid test email address.' });
    }
    const cfg = getStoreEmailConfig(sid);
    const rmk = getRemarketingConfig(sid);
    const senderName = (req.body?.senderName || rmk.remarketingFromName || cfg.fromName || cfg.storeName).trim();
    const senderEmail = (req.body?.senderEmail || rmk.remarketingFromEmail || cfg.fromEmail).trim();
    const storeUrlDisplay = cfg.websiteUrl.replace(/^https?:\/\//i, '').replace(/\/+$/, '');

    const applyVars = (s) => String(s || '')
      .replace(/\{\{first_name\}\}/g, 'Salar')
      .replace(/\{\{customer_name\}\}/g, 'Salar Khan')
      .replace(/\{\{last_product\}\}/g, 'Heavyweight Oversized Hoodie')
      .replace(/\{\{order_ref\}\}/g, '#TR35089')
      .replace(/\{\{store_name\}\}/g, cfg.fromName || cfg.storeName)
      .replace(/\{\{store_url\}\}/g, cfg.websiteUrl);

    const subject = applyVars(req.body?.subject || `Quick note from ${cfg.fromName || cfg.storeName}`);
    const bodyText = applyVars(req.body?.bodyText || 'Hi Salar,\n\nJust a quick personal note to test Primary Inbox delivery.');
    const unsubUrl = `${BACKEND_URL}/api/public/email-unsubscribe?token=${generateUnsubscribeToken(sid, toEmail)}`;

    const { html, text } = buildPrimaryLetterEmail({
      brandName: senderName,
      storeUrlDisplay,
      bodyText,
      ctaLabel: applyVars(req.body?.ctaLabel || ''),
      ctaUrl: applyVars(req.body?.ctaUrl || ''),
      unsubscribeUrl: unsubUrl,
    });

    const result = await sendStoreIsolatedEmail(sid, {
      fromName: senderName,
      fromEmail: senderEmail,
      toEmail,
      toName: 'Salar Khan',
      subject,
      html,
      text,
    });
    if (result.ok) {
      return res.json({ success: true, message: `Test email sent to ${toEmail} from ${result.fromEmail}` });
    }
    return res.status(500).json({ success: false, error: result.error || 'Failed to send test email' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/campaigns/:id/status', (req, res) => {
  try {
    const sid = resolveStoreId(req);
    const id = parseInt(req.params.id, 10);
    const nextStatus = req.body?.status;
    if (!['running', 'paused'].includes(nextStatus)) {
      return res.status(400).json({ success: false, error: 'Status must be running or paused' });
    }
    const upd = db.prepare("UPDATE remarketing_campaigns SET status = ?, updated_at = datetime('now') WHERE id = ? AND store_id = ?").run(nextStatus, id, sid);
    if (!upd.changes) return res.status(404).json({ success: false, error: 'Campaign not found for this store' });
    res.json({ success: true, message: nextStatus === 'running' ? 'Campaign resumed' : 'Campaign paused' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/campaigns/:id/drip-now', async (req, res) => {
  try {
    const sid = resolveStoreId(req);
    const id = parseInt(req.params.id, 10);
    const owned = db.prepare('SELECT id FROM remarketing_campaigns WHERE id = ? AND store_id = ?').get(id, sid);
    if (!owned) return res.status(404).json({ success: false, error: 'Campaign not found for this store' });
    const result = await processRemarketingDripQueue(id, 12);
    if (result.sent === 0 && result.lastError) {
      return res.status(500).json({ success: false, error: result.lastError, data: result });
    }
    res.json({ success: true, message: `Drip batch sent: ${result.sent}${result.failed ? ` (${result.failed} failed)` : ''}`, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/campaigns/:id', (req, res) => {
  try {
    const sid = resolveStoreId(req);
    const id = parseInt(req.params.id, 10);
    const owned = db.prepare('SELECT id FROM remarketing_campaigns WHERE id = ? AND store_id = ?').get(id, sid);
    if (!owned) return res.status(404).json({ success: false, error: 'Campaign not found for this store' });
    db.prepare('DELETE FROM remarketing_recipients WHERE campaign_id = ? AND store_id = ?').run(id, sid);
    db.prepare('DELETE FROM remarketing_campaigns WHERE id = ? AND store_id = ?').run(id, sid);
    res.json({ success: true, message: 'Campaign deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
