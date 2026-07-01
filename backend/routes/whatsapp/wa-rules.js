const express = require('express');
const router = express.Router();
const { db } = require('../../db');

function normalizePhone(raw) {
  if (!raw) return '';
  let n = String(raw).split('@')[0].replace(/[\+\-\s]/g, '').replace(/\D/g, '');
  if (n.startsWith('9292') && n.length > 12) {
    n = n.substring(2);
  }
  if (n.startsWith('920') && n.length === 13) {
    n = '92' + n.substring(3);
  }
  if (n.startsWith('0') && n.length === 11) {
    n = '92' + n.substring(1);
  }
  else if (!n.startsWith('92') && n.length === 10) {
    n = '92' + n;
  }
  return n;
}

// --- 🧠 GEMINI AUTONOMOUS AI GOVERNANCE ROUTES ---

// GET /api/whatsapp-governance/gemini/settings
router.get('/gemini/settings', (req, res) => {
  try {
    const s = db.prepare(`
      SELECT 
        api_key, ai_active, model_name, system_prompt, strictness, auto_learning_enabled,
        tool_check_stock, tool_order_status, tool_create_order, tool_update_profile, tool_fetch_catalog, tool_recommendations,
        feature_interactive_lists, feature_quick_replies, feature_media_cards, feature_voice_notes,
        voice_name, recommendation_rules
      FROM gemini_bot_settings 
      ORDER BY id DESC LIMIT 1
    `).get();
    res.json(s || {});
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/whatsapp-governance/gemini/settings
router.post('/gemini/settings', (req, res) => {
  const { 
    api_key, ai_active, model_name, system_prompt, strictness, auto_learning_enabled,
    tool_check_stock, tool_order_status, tool_create_order, tool_update_profile, tool_fetch_catalog, tool_recommendations,
    feature_interactive_lists, feature_quick_replies, feature_media_cards, feature_voice_notes,
    voice_name, recommendation_rules
  } = req.body;
  try {
    db.prepare(`
      UPDATE gemini_bot_settings SET
        api_key = ?, ai_active = ?, model_name = ?, system_prompt = ?, strictness = ?, auto_learning_enabled = ?,
        tool_check_stock = ?, tool_order_status = ?, tool_create_order = ?, tool_update_profile = ?, tool_fetch_catalog = ?, tool_recommendations = ?,
        feature_interactive_lists = ?, feature_quick_replies = ?, feature_media_cards = ?, feature_voice_notes = ?,
        voice_name = ?, recommendation_rules = ?, updated_at = datetime('now')
    `).run(
      api_key || '', ai_active ? 1 : 0, model_name || 'gemini-2.5-flash', system_prompt || '', strictness || 'balanced', auto_learning_enabled ? 1 : 0,
      tool_check_stock ? 1 : 0, tool_order_status ? 1 : 0, tool_create_order ? 1 : 0, tool_update_profile ? 1 : 0, tool_fetch_catalog ? 1 : 0, tool_recommendations ? 1 : 0,
      feature_interactive_lists ? 1 : 0, feature_quick_replies ? 1 : 0, feature_media_cards ? 1 : 0, feature_voice_notes ? 1 : 0,
      voice_name || 'Aoede', recommendation_rules || '{}'
    );

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/whatsapp-governance/gemini/profiles
router.get('/gemini/profiles', (req, res) => {
  try {
    const profiles = db.prepare('SELECT phone, customer_name, preferences, vip_status, total_orders, updated_at FROM customer_profiles ORDER BY updated_at DESC LIMIT 50').all() || [];
    res.json({ success: true, profiles });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/whatsapp-governance/gemini/memory/:phone
router.get('/gemini/memory/:phone', (req, res) => {
  try {
    const rawPhone = req.params.phone;
    const cleaned = rawPhone.replace(/\D/g, '');
    const last10 = cleaned.substring(cleaned.length - 10);

    const profileExists = db.prepare(
      'SELECT phone FROM customer_profiles WHERE phone = ? OR phone = ? OR phone LIKE ? LIMIT 1'
    ).get(rawPhone, cleaned, `%${last10}`);

    const msgExists = !profileExists
      ? db.prepare(
          'SELECT 1 FROM whatsapp_messages WHERE phone = ? OR phone = ? OR phone LIKE ? LIMIT 1'
        ).get(rawPhone, cleaned, `%${last10}`)
      : null;

    if (!profileExists && !msgExists) {
      return res.status(404).json({ error: 'Customer not found', memory: [] });
    }

    const phoneToUse = profileExists ? profileExists.phone : cleaned;
    let memory = db.prepare(
      'SELECT role, content, created_at FROM gemini_chat_memory WHERE phone = ? ORDER BY id ASC LIMIT 50'
    ).all(phoneToUse) || [];

    if (memory.length === 0 && phoneToUse !== cleaned) {
      memory = db.prepare(
        'SELECT role, content, created_at FROM gemini_chat_memory WHERE phone = ? ORDER BY id ASC LIMIT 50'
      ).all(cleaned) || [];
    }

    if (memory.length === 0) {
      memory = db.prepare(
        'SELECT role, content, created_at FROM gemini_chat_memory WHERE phone LIKE ? ORDER BY id ASC LIMIT 50'
      ).all(`%${last10}`) || [];
    }

    res.json({ success: true, memory });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/whatsapp-governance/gemini/reset-locks
router.post('/gemini/reset-locks', (req, res) => {
  try {
    const result = db.prepare('UPDATE customer_profiles SET human_handoff_until = NULL').run();
    try {
      const { getBot } = require('../../engines/whatsapp_bot');
      const botInstance = getBot();
      if (botInstance) {
        botInstance.humanHandoffContacts.clear();
        botInstance.humanCooldowns = {};
        botInstance.consecutiveBotReplies = {};
      }
    } catch(_) {}
    res.json({ success: true, cleared: result.changes, message: `✅ Cleared ${result.changes} handoff locks. Bot is now active for all customers.` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/whatsapp-governance/gemini/usage-stats
router.get('/gemini/usage-stats', (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const todayStats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_count,
        ROUND(AVG(response_ms)) as avg_response_ms
      FROM gemini_usage_logs 
      WHERE created_at LIKE ?
    `).get(`${today}%`) || {};

    const hourly = db.prepare(`
      SELECT 
        CAST(strftime('%H', created_at) AS INTEGER) as hour,
        COUNT(*) as calls
      FROM gemini_usage_logs
      WHERE created_at LIKE ?
      GROUP BY hour
      ORDER BY hour ASC
    `).all(`${today}%`) || [];

    const hourlyFull = Array.from({ length: 24 }, (_, i) => {
      const found = hourly.find(h => h.hour === i);
      return { hour: i, calls: found ? found.calls : 0 };
    });

    const recentLogs = db.prepare(`
      SELECT id, phone, status, model, tool_called, error_msg, response_ms, created_at
      FROM gemini_usage_logs
      ORDER BY id DESC
      LIMIT 50
    `).all() || [];

    const toolBreakdown = db.prepare(`
      SELECT tool_called, COUNT(*) as count
      FROM gemini_usage_logs
      WHERE created_at LIKE ? AND tool_called IS NOT NULL
      GROUP BY tool_called
      ORDER BY count DESC
    `).all(`${today}%`) || [];

    res.json({
      success: true,
      today: {
        total: todayStats.total || 0,
        success: todayStats.success_count || 0,
        errors: todayStats.error_count || 0,
        avg_response_ms: todayStats.avg_response_ms || 0,
        daily_limit: 1500,
        percent_used: Math.round(((todayStats.total || 0) / 1500) * 100)
      },
      hourly: hourlyFull,
      recentLogs,
      toolBreakdown
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/whatsapp-governance/gemini/audit-logs
router.get('/gemini/audit-logs', (req, res) => {
  try {
    const logs = db.prepare('SELECT audit_date, messages_analyzed, friction_points, prompt_refinements, created_at FROM gemini_audit_logs ORDER BY id DESC LIMIT 30').all() || [];
    res.json({ success: true, logs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/whatsapp-governance/gemini/trigger-audit
router.post('/gemini/trigger-audit', async (req, res) => {
  try {
    const { runNightlyAudit } = require('../../engines/gemini_engine');
    const result = await runNightlyAudit();
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/whatsapp-governance/gemini/simulate-incoming
router.post('/gemini/simulate-incoming', async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ success: false, error: 'Phone and message are required.' });
    }

    const { generateAIResponse } = require('../../engines/gemini_engine');
    const reply = await generateAIResponse(phone, message);

    res.json({ success: true, reply: reply || 'No response generated (check API key or fallback settings).' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AD CAMPAIGNS — Feature 2: Ad-to-Chat Attribution
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/whatsapp-governance/ad-campaigns
router.get('/ad-campaigns', (req, res) => {
  try {
    const campaigns = db.prepare('SELECT * FROM ad_campaigns ORDER BY id DESC').all();
    res.json({ success: true, campaigns });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/whatsapp-governance/ad-campaigns
router.post('/ad-campaigns', (req, res) => {
  const { name, platform, pattern } = req.body;
  if (!name || !platform || !pattern) return res.status(400).json({ success: false, error: 'name, platform, and pattern are required' });
  try {
    const result = db.prepare('INSERT INTO ad_campaigns (name, platform, pattern) VALUES (?, ?, ?)').run(name, platform, pattern);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// PUT /api/whatsapp-governance/ad-campaigns/:id
router.put('/ad-campaigns/:id', (req, res) => {
  const { name, platform, pattern, active } = req.body;
  try {
    db.prepare('UPDATE ad_campaigns SET name = COALESCE(?, name), platform = COALESCE(?, platform), pattern = COALESCE(?, pattern), active = COALESCE(?, active) WHERE id = ?')
      .run(name || null, platform || null, pattern || null, active !== undefined ? (active ? 1 : 0) : null, req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER RISK PROFILE — Feature 3
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/whatsapp-governance/chats/:phone/risk-profile
router.get('/chats/:phone/risk-profile', (req, res) => {
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';
  try {
    const phone = req.params.phone.replace(/\D/g, '');
    const suffix = phone.substring(Math.max(0, phone.length - 10));

    const totalOrders = db.prepare(`SELECT COUNT(*) as c FROM orders WHERE REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ? AND tenant_id = ?`).get(`%${suffix}%`, tenantId);
    if (!totalOrders || totalOrders.c === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const returns = db.prepare(`
      SELECT COUNT(*) as c 
      FROM returns_log r
      INNER JOIN orders o ON r.order_id = o.id
      WHERE REPLACE(REPLACE(REPLACE(o.phone, ' ', ''), '-', ''), '+', '') LIKE ? AND o.tenant_id = ?
    `).get(`%${suffix}%`, tenantId);

    const totalCount = totalOrders?.c || 0;
    const returnCount = returns?.c || 0;
    const returnRate = totalCount > 0 ? Math.round((returnCount / totalCount) * 100) : 0;

    let autoFlag = 'NORMAL';
    if (returnCount >= 3 || (returnRate >= 40 && totalCount >= 2)) autoFlag = 'HIGH';
    else if (returnRate >= 20 && totalCount >= 2) autoFlag = 'WATCH';

    const profile = db.prepare('SELECT risk_flag, risk_reason FROM customer_profiles WHERE phone = ?').get(phone);
    const storedFlag = profile?.risk_flag || 'NORMAL';
    const finalFlag = (storedFlag === 'BLOCKED' || storedFlag === 'HIGH') ? storedFlag : autoFlag;

    res.json({
      success: true,
      totalOrders: totalCount,
      returnCount,
      returnRate,
      riskFlag: finalFlag,
      riskReason: profile?.risk_reason || null,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/whatsapp-governance/chats/:phone/risk-flag
router.post('/chats/:phone/risk-flag', (req, res) => {
  const { flag, reason } = req.body;
  const validFlags = ['NORMAL', 'WATCH', 'HIGH', 'BLOCKED'];
  if (!validFlags.includes(flag)) return res.status(400).json({ success: false, error: 'Invalid flag. Must be NORMAL, WATCH, HIGH, or BLOCKED.' });
  try {
    const phone = req.params.phone.replace(/\D/g, '');
    db.prepare(`
      INSERT INTO customer_profiles (phone, risk_flag, risk_reason, risk_updated_at, updated_at)
      VALUES (?, ?, ?, datetime('now', '+5 hours'), datetime('now', '+5 hours'))
      ON CONFLICT(phone) DO UPDATE SET
        risk_flag = excluded.risk_flag,
        risk_reason = excluded.risk_reason,
        risk_updated_at = excluded.risk_updated_at,
        updated_at = excluded.updated_at
    `).run(phone, flag, reason || null);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// STUCK PARCEL SNIPER — Feature 8
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/whatsapp-governance/sniper/queue
router.get('/sniper/queue', async (req, res) => {
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';
  try {
    const settings = db.prepare('SELECT stuck_threshold_hours FROM whatsapp_settings ORDER BY id DESC LIMIT 1').get();
    const hours = settings?.stuck_threshold_hours || 36;
    const STUCK_STATUSES = ['Consignee Not Available', 'Attempted Delivery', 'Hold', 'Address Issue', 'RTO Initiated', 'Return to Sender'];
    const stuck = db.prepare(`
      SELECT o.id, o.ref_number, o.phone, o.customer_name, o.tracking_number, o.courier,
             o.delivery_status, o.status_date
      FROM orders o
      LEFT JOIN sniper_alerts s
        ON s.order_id = o.id AND s.alert_type = 'stuck_parcel'
        AND s.sent_at > datetime('now', '-48 hours')
      WHERE o.delivery_status IN (${STUCK_STATUSES.map(() => '?').join(',')})
        AND datetime(COALESCE(o.status_date, o.order_date)) < datetime('now', '-' || ? || ' hours')
        AND o.phone IS NOT NULL AND o.phone != ''
        AND s.id IS NULL
        AND o.tenant_id = ?
      ORDER BY o.id ASC LIMIT 50
    `).all(...STUCK_STATUSES, hours, tenantId);
    res.json({ success: true, queue: stuck, thresholdHours: hours });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/whatsapp-governance/sniper/fire
router.post('/sniper/fire', async (req, res) => {
  const { order_id } = req.body;
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';
  if (!order_id) return res.status(400).json({ success: false, error: 'order_id required' });
  try {
    const { runSniperScan } = require('../../engines/sniper');
    const order = db.prepare('SELECT id, phone, customer_name, ref_number, tracking_number, courier, delivery_status FROM orders WHERE id = ? AND tenant_id = ?').get(order_id, tenantId);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    db.prepare(`DELETE FROM sniper_alerts WHERE order_id = ? AND sent_at > datetime('now', '-48 hours')`).run(order_id);
    await runSniperScan();
    res.json({ success: true, message: `Sniper alert queued for order ${order.ref_number || order.id}` });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/whatsapp-governance/sniper/log
router.get('/sniper/log', (req, res) => {
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';
  try {
    const limit = parseInt(req.query.limit) || 50;
    const logs = db.prepare(`
      SELECT s.*, o.ref_number, o.customer_name
      FROM sniper_alerts s
      INNER JOIN orders o ON o.id = s.order_id AND o.tenant_id = ?
      ORDER BY s.sent_at DESC LIMIT ?
    `).all(tenantId, limit);
    res.json({ success: true, logs });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// RECEIPT OCR — Feature 10
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/whatsapp-governance/chats/:phone/ocr-scans
router.get('/chats/:phone/ocr-scans', (req, res) => {
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';
  try {
    const phone = req.params.phone.replace(/\D/g, '');
    
    const hasRecord = db.prepare(`
      SELECT 1 FROM orders WHERE phone LIKE ? AND tenant_id = ?
      UNION ALL
      SELECT 1 FROM whatsapp_messages WHERE phone = ? AND tenant_id = ?
      LIMIT 1
    `).get(`%${phone.substring(phone.length - 10)}%`, tenantId, phone, tenantId);

    if (!hasRecord) {
      return res.status(404).json({ error: 'OCR scans not found' });
    }

    const scans = db.prepare('SELECT * FROM payment_ocr_scans WHERE phone = ? ORDER BY scanned_at DESC LIMIT 10').all(phone);
    res.json({ success: true, scans });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/whatsapp-governance/chats/:phone/ocr-verify
router.post('/chats/:phone/ocr-verify', (req, res) => {
  const { scan_id, action } = req.body;
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';
  if (!scan_id || !['confirm', 'reject'].includes(action)) return res.status(400).json({ success: false, error: 'scan_id and action (confirm/reject) required' });
  try {
    const status = action === 'confirm' ? 'matched' : 'rejected';
    const scan = db.prepare('SELECT * FROM payment_ocr_scans WHERE id = ?').get(scan_id);
    if (!scan) return res.status(404).json({ error: 'Scan not found' });

    if (scan.order_id) {
      const order = db.prepare('SELECT id FROM orders WHERE id = ? AND tenant_id = ?').get(scan.order_id, tenantId);
      if (!order) return res.status(404).json({ error: 'Associated order not found for this tenant' });
    }

    db.prepare('UPDATE payment_ocr_scans SET status = ? WHERE id = ?').run(status, scan_id);
    if (action === 'confirm' && scan?.order_id && scan?.detected_amount) {
      db.prepare(`UPDATE orders SET payment_status = 'OCR Verified', paid_amount = ?, payment_ref = ? WHERE id = ? AND tenant_id = ?`)
        .run(scan.detected_amount, scan.detected_txn_id || 'Manual OCR', scan.order_id, tenantId);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// COD VERIFICATION TRIGGER — Feature 5 (Manual trigger from portal)
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/whatsapp-governance/cod-verify/trigger
router.post('/cod-verify/trigger', async (req, res) => {
  const { order_id } = req.body;
  const tenantId = req.user?.tenant_id || req.tenantId || 'default';
  if (!order_id) return res.status(400).json({ success: false, error: 'order_id required' });
  try {
    const order = db.prepare('SELECT id, phone, customer_name, ref_number FROM orders WHERE id = ? AND tenant_id = ?').get(order_id, tenantId);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    if (!order.phone) return res.status(400).json({ success: false, error: 'Order has no phone number' });

    const { dispatchCODVerification } = require('../../engines/cod_verifier');
    setImmediate(() => dispatchCODVerification(order));

    res.json({ success: true, message: `COD verification queued for order ${order.ref_number || order_id}` });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
