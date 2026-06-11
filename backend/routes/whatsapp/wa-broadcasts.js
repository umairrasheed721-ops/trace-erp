const express = require('express');
const router = express.Router();
const { db, DB_DIR } = require('../../db');
const bot = require('../../engines/whatsapp_bot');
const fs = require('fs');
const cron = require('node-cron');
const tenantContext = require('../../tenant-context');

const tenantLastChecks = {};

function getAllTenants() {
  const tenants = ['default'];
  try {
    const files = fs.readdirSync(DB_DIR);
    for (const file of files) {
      if (file.startsWith('trace_erp_') && file.endsWith('.db')) {
        const tenantId = file.substring(10, file.length - 3);
        if (tenantId && !tenants.includes(tenantId)) {
          tenants.push(tenantId);
        }
      }
    }
  } catch (e) {
    console.error('⚠️ Failed to scan tenants for heartbeat:', e.message);
  }
  return tenants;
}

// Scheduled heartbeat task (runs every 30 seconds)
cron.schedule('*/30 * * * * *', () => {
  const tenants = getAllTenants();
  
  for (const tenantId of tenants) {
    tenantContext.run(tenantId, async () => {
      try {
        const sock = bot.sock;
        const isSocketOpen = !!(sock && sock.ws && sock.sock?.ws?.isOpen || sock && sock.ws && sock.ws.isOpen);
        const isFullyConnected = isSocketOpen && !!(sock && sock.user);
        
        tenantLastChecks[tenantId] = {
          connected: isFullyConnected,
          last_check: new Date().toISOString()
        };
        
        if (!isSocketOpen) {
          if (bot.status === 'DISABLED') {
            return;
          }
          console.warn(`⚠️ [Heartbeat] Tenant [${tenantId}] WhatsApp socket is inactive.`);
          
          // 1. Immediately update DB status to 'DISCONNECTED'
          const { db: tenantDb } = require('../../db');
          try {
            tenantDb.prepare("UPDATE whatsapp_settings SET status = 'DISCONNECTED'").run();
          } catch (dbErr) {
            console.error(`⚠️ Failed to update DB status for tenant [${tenantId}]:`, dbErr.message);
          }
          
          // 2. Set in-memory status to DISCONNECTED
          bot.status = 'DISCONNECTED';
          
          // 3. Trigger soft-reconnect
          if (typeof bot.softReconnect === 'function') {
            await bot.softReconnect();
          }
        } else {
          // Update DB status to match the actual bot status (e.g. 'CONNECTED' or 'QR_READY')
          const { db: tenantDb } = require('../../db');
          try {
            tenantDb.prepare("UPDATE whatsapp_settings SET status = ?").run(bot.status || 'CONNECTED');
          } catch (_) {}
        }
      } catch (err) {
        console.error(`❌ [Heartbeat] Error checking status for tenant [${tenantId}]:`, err.message);
      }
    });
  }
});

// GET /api/whatsapp-governance/settings
router.get('/settings', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM whatsapp_settings ORDER BY id DESC LIMIT 1').get();
    res.json(row || {});
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/whatsapp-governance/status
router.get('/status', (req, res) => {
  try {
    const statusObj = bot.getStatus();
    const sock = bot.sock;
    
    // Heartbeat check: check if Baileys socket object exists and is open
    const isSocketOpen = !!(sock && sock.ws && sock.ws.isOpen);
    const isFullyConnected = isSocketOpen && !!(sock && sock.user);
    
    if (statusObj.status === 'CONNECTED' && !isFullyConnected) {
      statusObj.status = 'DISCONNECTED';
    }
    
    statusObj.connected = isFullyConnected;
    
    // Also include a map of the current connection status for all tenants merged at the top level
    const tenantsStatusMap = {};
    const tenants = getAllTenants();
    for (const tId of tenants) {
      tenantsStatusMap[tId] = tenantLastChecks[tId] || {
        connected: false,
        last_check: null
      };
    }
    
    res.json({
      ...statusObj,
      ...tenantsStatusMap
    });
  } catch (e) {
    res.status(500).json({ error: e.message, status: 'DISCONNECTED', connected: false });
  }
});

// POST /api/whatsapp-governance/settings
router.post('/settings', (req, res) => {
  try {
    // Fetch current settings to support partial updates safely
    const current = db.prepare('SELECT * FROM whatsapp_settings ORDER BY id DESC LIMIT 1').get() || {};
    
    // Merge req.body with current settings
    const merged = { ...current, ...req.body };

    const { mode, cod_verification_enabled, attempted_delivery_enabled, dispatch_alerts_enabled, enable_cod_reminders, enable_post_delivery_feedback, post_delivery_template, min_delay_sec, max_delay_sec, max_per_hour, cooling_period_min, cod_template, attempted_template, dispatch_template, ai_responder_enabled, ai_tracking_template, ai_landmark_template, poll_options, auto_responders } = merged;

    const pollOptionsStr = Array.isArray(poll_options) ? JSON.stringify(poll_options) : (typeof poll_options === 'string' ? poll_options : '[]');
    const autoRespondersStr = Array.isArray(auto_responders) ? JSON.stringify(auto_responders) : (typeof auto_responders === 'string' ? auto_responders : '[]');

    db.prepare(`
      UPDATE whatsapp_settings SET
        mode = ?, cod_verification_enabled = ?, attempted_delivery_enabled = ?, dispatch_alerts_enabled = ?, enable_cod_reminders = ?, enable_post_delivery_feedback = ?, post_delivery_template = ?, min_delay_sec = ?, max_delay_sec = ?, max_per_hour = ?, cooling_period_min = ?, cod_template = ?, attempted_template = ?, dispatch_template = ?, ai_responder_enabled = ?, ai_tracking_template = ?, ai_landmark_template = ?, poll_options = ?, auto_responders = ?, updated_at = datetime('now')
    `).run(
      mode,
      cod_verification_enabled ? 1 : 0,
      attempted_delivery_enabled ? 1 : 0,
      dispatch_alerts_enabled ? 1 : 0,
      enable_cod_reminders !== undefined ? (enable_cod_reminders ? 1 : 0) : 1,
      enable_post_delivery_feedback !== undefined ? (enable_post_delivery_feedback ? 1 : 0) : 1,
      post_delivery_template || '',
      Number(min_delay_sec),
      Number(max_delay_sec),
      Number(max_per_hour),
      Number(cooling_period_min),
      cod_template,
      attempted_template,
      dispatch_template,
      ai_responder_enabled ? 1 : 0,
      ai_tracking_template || '',
      ai_landmark_template || '',
      pollOptionsStr,
      autoRespondersStr
    );

    // Update bot in memory
    bot.setSettings({ minDelaySec: min_delay_sec, maxDelaySec: max_per_hour, maxPerHour: max_per_hour, coolingPeriodMin: cooling_period_min, aiResponderEnabled: ai_responder_enabled ? 1 : 0, aiTrackingTemplate: ai_tracking_template, aiLandmarkTemplate: ai_landmark_template });

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/whatsapp-governance/queue
router.get('/queue', (req, res) => {
  try {
    res.json(bot.getQueueDetails());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/whatsapp-governance/queue/pause
router.post('/queue/pause', (req, res) => {
  try {
    const isPaused = bot.togglePause();
    res.json({ success: true, isPaused });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/whatsapp-governance/queue/clear
router.post('/queue/clear', (req, res) => {
  try {
    const count = bot.clearQueue();
    res.json({ success: true, count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
