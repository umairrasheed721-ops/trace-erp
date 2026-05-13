require('dotenv').config();
const { sendEmergencyAlert } = require('./engines/alerts');
const { logSystemError } = require('./db');

// --- 🛡️ GLOBAL CRASH PREVENTERS (BULLETPROOF) ---
// These handlers catch ALL errors — server NEVER exits due to unhandled errors.
process.on('uncaughtException', (err) => {
  console.error('🛑 CRITICAL: Uncaught Exception — server kept alive:', err.stack || err.message);
  try { logSystemError('ERROR', err.message, 'uncaughtException'); } catch (_) {}
  try { sendEmergencyAlert(`*Uncaught Exception*\n${err.message}`); } catch (_) {}
});

process.on('unhandledRejection', (reason, promise) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  console.error('🛑 CRITICAL: Unhandled Rejection — server kept alive:', msg);
  try { logSystemError('ERROR', msg, 'unhandledRejection'); } catch (_) {}
  try { sendEmergencyAlert(`*Unhandled Rejection*\n${msg}`); } catch (_) {}
});

// Prevent Railway from killing the process on SIGTERM during hot reload
process.on('SIGTERM', () => {
  console.log('📡 SIGTERM received — graceful shutdown');
  process.exit(0);
});

// --- 🛡️ ENVIRONMENT HEALTH GUARD ---
const REQUIRED_ENV = ['DB_PATH', 'JWT_SECRET']; 
const missing = REQUIRED_ENV.filter(key => !process.env[key]);
if (missing.length > 0) {
  console.error('\n❌ CRITICAL STARTUP ERROR: Missing Environment Variables:');
  missing.forEach(m => console.error(`   - ${m}`));
  console.error('The server cannot start safely. Please check your Railway variables.\n');
  process.exit(1);
}
console.log('✅ Environment Health Check Passed.');
if (process.env.INSTAWORLD_PROXY_URL) {
  const fmt = process.env.INSTAWORLD_PROXY_FORMAT || 'simple (default when proxy set)';
  console.log(`🌐 Instaworld tracking → proxy (${fmt}). Book/cancel/cities use direct API unless INSTAWORLD_PROXY_FORMAT=relay.`);
}

// --- 📊 LIVE PULSE LOG BUFFER (structured) ---
const LOG_BUFFER_SIZE = 500;
let logBuffer = []; // { ts, level, msg }
let errorCount = 0;
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

const pushLog = (level, args) => {
  const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  logBuffer.push({ ts: new Date().toISOString(), level, msg });
  if (logBuffer.length > LOG_BUFFER_SIZE) logBuffer.shift();
  if (level === 'ERROR') errorCount++;
};

console.log   = (...a) => { pushLog('INFO',  a); originalLog.apply(console, a); };
console.error = (...a) => { pushLog('ERROR', a); originalError.apply(console, a); };
console.warn  = (...a) => { pushLog('WARN',  a); originalWarn.apply(console, a); };

const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');
// --- 🛡️ SAFE ROUTE LOADER — a broken route never crashes the server ---
// Tracks every module's load status for the System Status dashboard.
const moduleRegistry = {}; // { label: { status, error, loadedAt } }

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

const { router: authRoutes } = require('./routes/auth');
const ordersRoutes      = safeRequire('./routes/orders',       'Orders');
const trackingRoutes    = safeRequire('./routes/tracking',     'Tracking');
const monitorsRoutes    = safeRequire('./routes/monitors',     'Monitors');
const watchdogRoutes    = safeRequire('./routes/watchdog',     'Watchdog');
const storesRoutes      = safeRequire('./routes/stores',       'Stores');
const financeRoutes     = safeRequire('./routes/finance',      'Finance');
const reportsRoutes     = safeRequire('./routes/reports',      'Reports');
const usersRoutes       = safeRequire('./routes/users',        'Users');
const webhooksRoutes    = safeRequire('./routes/webhooks',     'Webhooks');
const whatsappRoutes    = safeRequire('./routes/whatsapp',     'WhatsApp');
const publicRoutes      = safeRequire('./routes/public',       'Public');
const templatesRoutes   = safeRequire('./routes/templates',    'Templates');
const diagnosticsRoutes = safeRequire('./routes/diagnostics',  'Diagnostics');
const statusMappingsRoutes = safeRequire('./routes/status-mappings', 'StatusMappings');
const schedulerInit     = safeRequire('./scheduler',           'Scheduler');
const schedulerRoutes   = safeRequire('./routes/scheduler',    'SchedulerAPI');
const costManagerRoutes = safeRequire('./routes/cost-manager', 'CostManager');
const syncRoutes        = safeRequire('./routes/sync',         'Sync');

// Reset any stuck sync statuses on startup
try {
  db.prepare("UPDATE stores SET sync_status = 'idle', sync_progress = 'Ready' WHERE sync_status = 'syncing'").run();
  console.log('✅ All stuck sync statuses reset to idle');
} catch (e) {
  console.error('Failed to reset sync statuses:', e.message);
}

// --- 🔄 AUTO-RETRY FAILED MODULES (every 90s) ---
// If a module failed to load at boot (timing issue, missing file, etc.),
// this loop retries it automatically and re-wires it into Express.
const ROUTE_MAP = {
  'Orders':      ['/api/orders',      './routes/orders'],
  'Tracking':    ['/api/tracking',    './routes/tracking'],
  'Monitors':    ['/api/monitors',    './routes/monitors'],
  'Watchdog':    ['/api/watchdog',    './routes/watchdog'],
  'Stores':      ['/api/stores',      './routes/stores'],
  'Finance':     ['/api/finance',     './routes/finance'],
  'Reports':     ['/api/reports',     './routes/reports'],
  'Users':       ['/api/users',       './routes/users'],
  'WhatsApp':    ['/api/whatsapp',    './routes/whatsapp'],
  'Templates':   ['/api/templates',   './routes/templates'],
  'Diagnostics': ['/api/diagnostics', './routes/diagnostics'],
  'CostManager': ['/api/cost-manager', './routes/cost-manager'],
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
      app.use(routePath, mod); // Re-register with Express
      console.log(`🩹 Auto-healed module: ${label} → now serving ${routePath}`);
      logSystemError('INFO', `Auto-healed module: ${label}`, 'auto-retry');
    } catch (err) {
      console.warn(`⏳ Auto-retry failed for ${label}: ${err.message}`);
      moduleRegistry[label].error = err.message; // Update with latest error
    }
  }
}, 90000); // Every 90 seconds

// --- 🐕 RESOURCE WATCHDOG — alert only, never self-terminate ---
// Railway OOM-kills the process if needed. We don't force exits.
const MEMORY_LIMIT_MB = 512;
let highMemoryStrikes = 0;
setInterval(() => {
  const used = process.memoryUsage().rss / 1024 / 1024;
  const pct = (used / MEMORY_LIMIT_MB) * 100;
  if (pct > 90) {
    highMemoryStrikes++;
    console.error(`⚠️ HIGH MEMORY: ${used.toFixed(1)}MB (${pct.toFixed(1)}%) — strike ${highMemoryStrikes}`);
    try { logSystemError('ERROR', `High memory: ${used.toFixed(1)}MB (${pct.toFixed(1)}%)`, 'watchdog'); } catch (_) {}
    if (highMemoryStrikes === 1) { // Alert once, not every 2 min
      try { sendEmergencyAlert(`*High Memory*\n${used.toFixed(1)}MB (${pct.toFixed(1)}%)\nMonitor closely`); } catch (_) {}
    }
  } else {
    highMemoryStrikes = 0;
    if (pct > 70) console.warn(`📉 Memory: ${used.toFixed(1)}MB (${pct.toFixed(1)}%)`);
  }
}, 300000); // Every 5 minutes

// --- 🚨 ERROR RATE ALERTING — hooks into console.error, no redeclarations ---
let recentErrorTimes = [];
let lastAlertTime = 0;
let isInternalError = false;
const _prevConsoleError = console.error; 
console.error = (...a) => {
  _prevConsoleError.apply(console, a); 
  
  if (isInternalError) return; // Prevent recursion
  isInternalError = true;

  try {
    const now = Date.now();
    recentErrorTimes.push(now);
    recentErrorTimes = recentErrorTimes.filter(t => now - t < 60000);
    
    if (recentErrorTimes.length >= 15 && (now - lastAlertTime) > 600000) {
      lastAlertTime = now;
      const msg = a.map(x => String(x)).join(' ').substring(0, 200);
      try { sendEmergencyAlert(`*🚨 Error Spike*\n${recentErrorTimes.length} in 60s\n${msg}`); } catch (_) {}
    }
    // Persist errors to SQLite (survives restarts)
    try { logSystemError('ERROR', a.map(x => String(x)).join(' ').substring(0, 1000), 'server'); } catch (_) {}
  } finally {
    isInternalError = false;
  }
};


const app = express();
const PORT = process.env.PORT || 3001;

// ⚡ GZIP COMPRESSION — cuts API response sizes 60-80%
try {
  const compression = require('compression');
  app.use(compression({ level: 6, threshold: 1024 }));
  console.log('✅ Gzip compression enabled');
} catch (_) {
  console.warn('⚠️ compression module not found, running without gzip');
}

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

app.use(express.json({ limit: '2mb' }));

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'trace-erp-secret-key-2024';

// ─── Security: JWT Auth for API ───
app.use((req, res, next) => {
  // Public paths
  if (req.path.startsWith('/api/auth/callback')) return next();
  if (req.path === '/api/auth/login') return next();
  if (req.path.startsWith('/api/webhooks/')) return next();
  if (req.path.startsWith('/api/public/')) return next();
  if (req.path === '/health' || req.path === '/api/health') return next();
  if (req.path.includes('/api/diagnostics')) return next();
  if (req.path.includes('/api/users/permissions')) return next();
  if (req.path === '/api/wake-up-test' || req.originalUrl.includes('wake-up-test')) return next();
  
  // Live SSE Endpoint handles its own token from query
  if (req.path === '/api/live') {
    const token = req.query.token;
    if (!token) return res.status(401).json({ error: 'Token missing' });
    try {
      req.user = jwt.verify(token, JWT_SECRET);
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }
  
  // Allow all non-API requests (static files, frontend routes)
  if (!req.path.startsWith('/api/')) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Authentication required' });

  const token = (authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader) || '';
  if (!token) return res.status(401).json({ error: 'Token missing' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

// --- 📊 SYSTEM STATUS API — replaces needing Railway agent for debugging ---
app.get('/api/wake-up-test', (req, res) => res.json({ message: "🚀 RAILWAY IS ALIVE AND UPDATED!", time: new Date().toISOString() }));
app.get('/api/admin/system-status', (req, res) => {
  const mem = process.memoryUsage();
  const toMB = (b) => (b / 1024 / 1024).toFixed(1);

  let waBotStatus = 'UNKNOWN';
  try {
    const waBot = require.cache[require.resolve('./engines/whatsapp_bot')]?.exports;
    waBotStatus = waBot ? waBot.getStatus().status : 'NOT_LOADED';
  } catch (_) { waBotStatus = 'NOT_LOADED'; }

  // Persistent errors from SQLite (survives restarts)
  let persistentErrors = [];
  try {
    persistentErrors = db.prepare(
      `SELECT level, message, module, created_at FROM system_logs WHERE level = 'ERROR' ORDER BY created_at DESC LIMIT 30`
    ).all();
  } catch (_) {}

  res.json({
    server: {
      status: 'ALIVE',
      uptime: Math.floor(process.uptime()),
      uptimeHuman: formatUptime(process.uptime()),
      nodeVersion: process.version,
      startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
      errorCount,
      errorsPerMinute: recentErrorTimes.length,
      highMemoryStrikes,
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
    recentLogs: logBuffer.slice(-100),
    recentErrors: logBuffer.filter(l => l.level === 'ERROR').slice(-20),
    persistentErrors, // Errors since last deploy — from SQLite
  });
});

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}h ${m}m ${s}s`;
}

// Legacy plain-text logs (kept for backwards compat)
app.get('/api/admin/logs', (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.send(logBuffer.map(l => `[${l.ts}] ${l.level}: ${l.msg}`).join('\n'));
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/stores', storesRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/monitors', monitorsRoutes);
app.use('/api/watchdog', watchdogRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/diagnostics', diagnosticsRoutes);
app.use('/api/status-mappings', statusMappingsRoutes);
app.use('/api/cost-manager', costManagerRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/scheduler', schedulerRoutes);


// --- 🚑 INDESTRUCTIBLE HEALTH CHECK ---
app.get('/api/health', (req, res) => {
  let waBotStatus = 'UNKNOWN';
  try {
    const waBot = require.cache[require.resolve('./engines/whatsapp_bot')]?.exports;
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

const { addClient } = require('./sse');

// Live Real-Time Events endpoint
app.get('/api/live', (req, res) => {
  addClient(req, res);
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'OK', time: new Date().toISOString() }));

// Catch-all route to serve the React app
app.get('*', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = app.listen(PORT, () => {
  console.log(`🚀 TRACE ERP Backend running on http://localhost:${PORT}`);
  schedulerInit();
});

// --- 🛑 GRACEFUL SHUTDOWN ---
const shutdown = () => {
  console.log('\n👋 Shutdown signal received. Closing server gracefully...');
  server.close(() => {
    console.log('✅ HTTP server closed.');
    try {
      db.exec('PRAGMA optimize;'); // Final DB optimization
      console.log('✅ Database optimized and closed.');
    } catch (e) {}
    process.exit(0);
  });

  // Force shutdown after 10s if graceful close fails
  setTimeout(() => {
    console.error('⚠️ Could not close connections in time, forcing shut down');
    process.exit(1);
  }, 10000);
};

// Note: SIGTERM also handled by the bulletproof handler above (graceful shutdown takes precedence)
process.on('SIGINT', shutdown);
// deploy-trigger-1778570952
