const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { db, DB_DIR } = require('../db');
const startup = require('../startup');

// --- 🛡️ SAFE ROUTE LOADER ---
const moduleRegistry = {};

function safeRequire(modulePath, label) {
  try {
    const mod = require(modulePath);
    moduleRegistry[label] = { status: 'OK', error: null, loadedAt: new Date().toISOString() };
    console.log(`✅ Loaded: ${label}`);
    return mod;
  } catch (err) {
    moduleRegistry[label] = { status: 'FAILED', error: err.message, loadedAt: new Date().toISOString() };
    console.error(`⚠️ Failed to load ${label}: ${err.message}`);
    const { Router } = require('express');
    const fallback = Router();
    fallback.all('*', (req, res) => res.status(503).json({
      error: `${label} module failed to load`,
      details: err.message,
      fix: 'Check /api/admin/system-status for details'
    }));
    return fallback;
  }
}

// Load routes relative to routes directory
const { router: authRoutes } = require('./auth');
const ordersRoutes      = safeRequire('./orders',       'Orders');
const trackingRoutes    = safeRequire('./tracking',     'Tracking');
const monitorsRoutes    = safeRequire('./monitors',     'Monitors');
const watchdogRoutes    = safeRequire('./watchdog',     'Watchdog');
const storesRoutes      = safeRequire('./stores',       'Stores');
const financeRoutes     = safeRequire('./finance',      'Finance');
const reportsRoutes     = safeRequire('./reports',      'Reports');
const usersRoutes       = safeRequire('./users',        'Users');
const webhooksRoutes    = safeRequire('./webhooks',     'Webhooks');
const whatsappRoutes    = safeRequire('./whatsapp',     'WhatsApp');
const publicRoutes      = safeRequire('./public',       'Public');
const templatesRoutes   = safeRequire('./templates',    'Templates');
const diagnosticsRoutes = safeRequire('./diagnostics',  'Diagnostics');
const statusMappingsRoutes = safeRequire('./status-mappings', 'StatusMappings');
const schedulerRoutes   = safeRequire('./scheduler',    'SchedulerAPI');
const costManagerRoutes = safeRequire('./cost-manager', 'CostManager');
const syncRoutes        = safeRequire('./sync',         'Sync');
const customerSuccessRoutes = safeRequire('./customer-success', 'CustomerSuccess');
const whatsappGovernanceRoutes = safeRequire('./whatsapp-governance', 'WhatsAppGovernance');
const settingsRoutes    = safeRequire('./settings',     'Settings');
const systemRoutes      = safeRequire('./system',       'System');
const citiesRoutes      = require('./cities');
const bulkRoutes        = require('./bulk_booking');
const postexRoutes      = safeRequire('./postex',       'PostEx');
const reviewsRoutes     = safeRequire('./reviews',      'Reviews');

// Register routes
router.use('/api/auth', authRoutes);
router.use('/api/stores', storesRoutes);
router.use('/api/orders', ordersRoutes);
router.use('/api/tracking', trackingRoutes);
router.use('/api/monitors', monitorsRoutes);
router.use('/api/watchdog', watchdogRoutes);
router.use('/api/finance', financeRoutes);
router.use('/api/reports', reportsRoutes);
router.use('/api/users', usersRoutes);
router.use('/api/webhooks', webhooksRoutes);
router.use('/api/whatsapp', whatsappRoutes);
router.use('/api/public', publicRoutes);
router.use('/api/templates', templatesRoutes);
router.use('/api/diagnostics', diagnosticsRoutes);
router.use('/api/status-mappings', statusMappingsRoutes);
router.use('/api/cost-manager', costManagerRoutes);
router.use('/api/sync', syncRoutes);
router.use('/api/scheduler', schedulerRoutes);
router.use('/api/customer-success', customerSuccessRoutes);
router.use('/api/whatsapp-governance', whatsappGovernanceRoutes);
router.use('/api/settings', settingsRoutes);
router.use('/api/system', systemRoutes);
router.use('/api/cities', citiesRoutes);
router.use('/api/bulk', bulkRoutes);
router.use('/api/postex', postexRoutes);
router.use('/api/reviews', reviewsRoutes);

// --- 🔄 AUTO-RETRY FAILED MODULES (every 90s) ---
const ROUTE_MAP = {
  'Orders':      ['/api/orders',      './orders'],
  'Tracking':    ['/api/tracking',    './tracking'],
  'Monitors':    ['/api/monitors',    './monitors'],
  'Watchdog':    ['/api/watchdog',    './watchdog'],
  'Stores':      ['/api/stores',      './stores'],
  'Finance':     ['/api/finance',     './finance'],
  'Reports':     ['/api/reports',     './reports'],
  'Users':       ['/api/users',       './users'],
  'WhatsApp':    ['/api/whatsapp',    './whatsapp'],
  'Templates':   ['/api/templates',   './templates'],
  'Diagnostics': ['/api/diagnostics', './diagnostics'],
  'CostManager': ['/api/cost-manager', './cost-manager'],
  'Settings':    ['/api/settings',    './settings'],
};

setInterval(() => {
  const failed = Object.entries(moduleRegistry).filter(([, v]) => v.status === 'FAILED');
  if (failed.length === 0) return;

  for (const [label] of failed) {
    const mapping = ROUTE_MAP[label];
    if (!mapping) continue;
    const [routePath, modulePath] = mapping;
    try {
      delete require.cache[require.resolve(modulePath)];
      const mod = require(modulePath);
      moduleRegistry[label] = { status: 'OK', error: null, loadedAt: new Date().toISOString(), autoHealed: true };
      router.use(routePath, mod);
      console.log(`🩹 Auto-healed module: ${label} → now serving ${routePath}`);
      try {
        db.logSystemError('INFO', `Auto-healed module: ${label}`, 'auto-retry');
      } catch (_) {}
    } catch (err) {
      console.warn(`⏳ Auto-retry failed for ${label}: ${err.message}`);
      moduleRegistry[label].error = err.message;
    }
  }
}, 90000);

// --- OTHER SPECIFIC ROUTES FROM index.js ---

router.get('/api/wake-up-test', (req, res) => res.json({ message: "🚀 RAILWAY IS ALIVE AND UPDATED!", time: new Date().toISOString() }));

router.get('/api/fire-test', async (req, res) => {
  try {
    const bot = require('../engines/whatsapp_bot');
    const sock = bot.sock;
    if (!sock) {
      return res.status(500).json({ error: 'WhatsApp bot is not connected. Socket is undefined.' });
    }
    await sock.sendMessage('923034070779@s.whatsapp.net', { 
      text: "🤖 AUTOMATED SERVER TEST: Text pipeline is fully operational." 
    });

    const uploadsDir = path.join(DB_DIR, 'uploads');
    
    let latestMp4 = null;
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      let latestTime = 0;
      files.forEach(file => {
        if (file.endsWith('.mp4')) {
          const filePath = path.join(uploadsDir, file);
          try {
            const stat = fs.statSync(filePath);
            if (stat.mtimeMs > latestTime) {
              latestTime = stat.mtimeMs;
              latestMp4 = filePath;
            }
          } catch (statErr) {}
        }
      });
    }

    if (!latestMp4) {
      return res.json({ 
        success: true, 
        message: "Text message fired, but no .mp4 voice notes were found in persistent storage uploads folder to test." 
      });
    }

    await sock.sendMessage('923034070779@s.whatsapp.net', { 
      audio: { url: latestMp4 }, 
      mimetype: 'audio/mp4', 
      ptt: true 
    });

    res.json({ success: true, message: `Test fired to 03034070779! Sent voice note: ${path.basename(latestMp4)}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/admin/system-status', (req, res) => {
  const mem = process.memoryUsage();
  const toMB = (b) => (b / 1024 / 1024).toFixed(1);

  let waBotStatus = 'UNKNOWN';
  try {
    const waBot = require.cache[require.resolve('../engines/whatsapp_bot')]?.exports;
    waBotStatus = waBot ? waBot.getStatus().status : 'NOT_LOADED';
  } catch (_) { waBotStatus = 'NOT_LOADED'; }

  let persistentErrors = [];
  try {
    persistentErrors = db.prepare(
      `SELECT level, message, module, created_at FROM system_logs WHERE level = 'ERROR' ORDER BY created_at DESC LIMIT 30`
    ).all();
  } catch (_) {}

  const stats = startup.getStats();

  res.json({
    server: {
      status: 'ALIVE',
      uptime: Math.floor(process.uptime()),
      uptimeHuman: formatUptime(process.uptime()),
      nodeVersion: process.version,
      startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
      errorCount: stats.errorCount,
      errorsPerMinute: stats.recentErrorTimes.length,
      highMemoryStrikes: stats.highMemoryStrikes,
    },
    memory: {
      rss: toMB(mem.rss),
      heapUsed: toMB(mem.heapUsed),
      heapTotal: toMB(mem.heapTotal),
      external: toMB(mem.external),
      limitMB: 512,
      percentUsed: ((mem.rss / 1024 / 1024) / 512 * 100).toFixed(1),
    },
    modules: moduleRegistry,
    whatsappBot: waBotStatus,
    recentLogs: stats.logBuffer.slice(-100),
    recentErrors: stats.logBuffer.filter(l => l.level === 'ERROR').slice(-20),
    persistentErrors,
  });
});

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}h ${m}m ${s}s`;
}

router.get('/api/admin/logs', (req, res) => {
  const stats = startup.getStats();
  res.setHeader('Content-Type', 'text/plain');
  res.send(stats.logBuffer.map(l => `[${l.ts}] ${l.level}: ${l.msg}`).join('\n'));
});

// Incoming media local proxy serving route (prevents ephemeral link expiry)
router.get('/api/media/:filename', async (req, res) => {
  try {
    const fsPromises = require('fs').promises;
    const filename = path.basename(req.params.filename);
    const storageDir = process.env.MEDIA_STORAGE_DIR 
      ? path.resolve(process.env.MEDIA_STORAGE_DIR)
      : path.join(DB_DIR || '/app/data', 'media');
    let filePath = path.join(storageDir, filename);

    try {
      await fsPromises.access(filePath);
    } catch (err) {
      const fallbackPath = path.join(process.cwd(), 'storage', 'media', filename);
      try {
        await fsPromises.access(fallbackPath);
        filePath = fallbackPath;
      } catch (fallbackErr) {
        console.warn(`⚠️ Media file not found: ${filePath}`);
        return res.status(404).json({ error: 'Media file not found' });
      }
    }

    const userTenantId = req.user?.tenant_id || 'default';
    const targetUrl = `/api/media/${filename}`;

    const tenantContext = require('../tenant-context');
    const hasMedia = tenantContext.run(userTenantId, () => {
      const { db } = require('../db');
      try {
        const row = db.prepare("SELECT id FROM whatsapp_messages WHERE media_url = ? LIMIT 1").get(targetUrl);
        return !!row;
      } catch (err) {
        console.error(`Error querying media in tenant [${userTenantId}]:`, err.message);
        return false;
      }
    });

    if (!hasMedia) {
      console.error(`🛑 Access denied: Media file [${filename}] does not belong to tenant [${userTenantId}]`);
      return res.status(403).json({ error: 'Access denied: Tenant mismatch or media not found' });
    }

    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.sendFile(filePath);
  } catch (error) {
    console.error(`[MEDIA_PROXY_ROUTE_ERROR]: ${error.message}`);
    return res.status(500).json({ error: 'Internal server error serving media proxy' });
  }
});

// Indestructible Health Check
router.get('/api/health', (req, res) => {
  let waBotStatus = 'UNKNOWN';
  try {
    const waBot = require.cache[require.resolve('../engines/whatsapp_bot')]?.exports;
    waBotStatus = waBot ? waBot.getStatus().status : 'NOT_LOADED';
  } catch (_) {}

  res.json({
    status: 'ALIVE',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    wa_bot: waBotStatus,
    failedModules: Object.entries(moduleRegistry)
      .filter(([, v]) => v.status === 'FAILED')
      .map(([k]) => k),
  });
});

const { addClient } = require('../sse');

// Live Real-Time Events endpoint
router.get('/api/live', (req, res) => {
  addClient(req, res);
});

// Health check
router.get('/health', (req, res) => res.json({ status: 'OK', time: new Date().toISOString() }));

module.exports = router;
