const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { cleanVolume } = require('./utils/volumeCleaner');


// --- 📊 LIVE PULSE LOG BUFFER ---
const LOG_BUFFER_SIZE = 500;
const logBuffer = [];
let errorCount = 0;
let recentErrorTimes = [];
let highMemoryStrikes = 0;
let lastAlertTime = 0;
let isInternalError = false;

// Global logger callbacks
let logSystemErrorReal = null;
function logSystemError(...args) {
  if (logSystemErrorReal) {
    try {
      logSystemErrorReal(...args);
    } catch (_) {}
  } else {
    console.error('[Early Boot Error Logger]', ...args);
  }
}

// Override console logging to capture buffer
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

const pushLog = (level, args) => {
  const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  logBuffer.push({ ts: new Date().toISOString(), level, msg });
  if (logBuffer.length > LOG_BUFFER_SIZE) logBuffer.shift();
  if (level === 'ERROR') errorCount++;
};

console.log   = (...a) => { pushLog('INFO',  a); try { originalLog.apply(console, a); } catch (e) { if (e.code !== 'EIO') throw e; } };
console.warn  = (...a) => { pushLog('WARN',  a); try { originalWarn.apply(console, a); } catch (e) { if (e.code !== 'EIO') throw e; } };

console.error = (...a) => {
  const isEio = a.some(x => {
    if (x instanceof Error) return x.code === 'EIO' || (x.message && x.message.includes('EIO'));
    return typeof x === 'string' && x.includes('EIO');
  });
  if (isEio) return;

  try {
    pushLog('ERROR', a);
    originalError.apply(console, a);
  } catch (e) {
    if (e.code !== 'EIO') throw e;
    return;
  }
  
  if (isInternalError) return; // Prevent recursion
  isInternalError = true;

  try {
    const now = Date.now();
    recentErrorTimes.push(now);
    recentErrorTimes = recentErrorTimes.filter(t => now - t < 60000);
    
    if (recentErrorTimes.length >= 15 && (now - lastAlertTime) > 600000) {
      lastAlertTime = now;
    }
    
    try { logSystemError('ERROR', a.map(x => String(x)).join(' ').substring(0, 1000), 'server'); } catch (_) {}
    
    try {
      const logMsg = `[${new Date().toISOString()}] ERROR: ${a.map(x => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' ')}\n`;
      const dbPath = process.env.DB_PATH || path.join(__dirname, 'trace_erp.db');
      const dbDir = path.dirname(path.resolve(dbPath));
      const logFilePath = path.join(dbDir, 'remote_errors.log');
      fs.appendFileSync(logFilePath, logMsg, 'utf8');
    } catch (err) {}

    try {
      const { broadcast } = require('./websocket');
      broadcast('error_logged', {
        ts: new Date().toISOString(),
        msg: a.map(x => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' ')
      });
    } catch (wsErr) {}
  } finally {
    isInternalError = false;
  }
};

function runDiskCleanup() {
  try {
    const isProduction = process.env.NODE_ENV === 'production' || 
                         process.env.RAILWAY_ENVIRONMENT !== undefined ||
                         process.env.BOT_ENABLED === 'true';
    const checkPath = isProduction ? '/app/data' : '.';
    const stdout = execSync(`df -k "${checkPath}" 2>/dev/null`).toString();
    const lines = stdout.trim().split('\n');
    if (lines.length < 2) return;
    const parts = lines[1].split(/\s+/);
    if (parts.length < 6) return;
    const totalKB = parseInt(parts[1], 10);
    const availableKB = parseInt(parts[3], 10);
    if (isNaN(availableKB) || isNaN(totalKB) || totalKB === 0) return;
    
    const availableMB = Math.round(availableKB / 1024);
    const availablePercent = (availableKB / totalKB) * 100;

    console.log(`💾 Auto-Healer Check: Available disk space is ${availableMB} MB (${availablePercent.toFixed(1)}%)`);
    if (availableMB < 50 || availablePercent < 10) {
      console.warn(`🚨 Auto-Healer: Critical disk space detected (${availableMB} MB, ${availablePercent.toFixed(1)}%). Starting emergency cleanup...`);
      
      // Execute the safe volume cleaner
      try {
        cleanVolume();
      } catch (cleanErr) {
        console.error('⚠️ Auto-Healer: Emergency volume cleaner failed:', cleanErr.message);
      }

      const truncateScript = path.join(__dirname, 'scripts', 'truncate_logs.js');
      const purgeScript = path.join(__dirname, 'scripts', 'purge_old_media.js');
      const optimizeScript = path.join(__dirname, 'scripts', 'optimize_db.js');

      console.log('1/3: Truncating message logs older than 15 days...');
      try { execSync(`node "${truncateScript}"`, { stdio: 'inherit', env: process.env }); } catch (_) {}

      console.log('2/3: Purging old media older than 30 days from Google Drive...');
      try { execSync(`node "${purgeScript}"`, { stdio: 'inherit', env: process.env }); } catch (_) {}

      console.log('3/3: Reclaiming unused space via database VACUUM...');
      try { execSync(`node "${optimizeScript}"`, { stdio: 'inherit', env: process.env }); } catch (_) {}

      console.log('Auto-Healer: Disk space freed automatically');
    }
  } catch (e) {
    console.warn('⚠️ Auto-Healer: Unable to check disk space or run cleanup:', e.message);
  }
}

function setupWatchdogs() {
  const MEMORY_LIMIT_MB = 512;
  setInterval(() => {
    const used = process.memoryUsage().rss / 1024 / 1024;
    const pct = (used / MEMORY_LIMIT_MB) * 100;
    if (pct > 90) {
      highMemoryStrikes++;
      console.error(`⚠️ HIGH MEMORY: ${used.toFixed(1)}MB (${pct.toFixed(1)}%) — strike ${highMemoryStrikes}`);
      try { logSystemError('ERROR', `High memory: ${used.toFixed(1)}MB (${pct.toFixed(1)}%)`, 'watchdog'); } catch (_) {}
    } else {
      highMemoryStrikes = 0;
      if (pct > 70) console.warn(`📉 Memory: ${used.toFixed(1)}MB (${pct.toFixed(1)}%)`);
    }
  }, 300000); // Every 5 minutes
}

function runEarlyStartup() {
  // Global crash preventers
  process.on('uncaughtException', (err) => {
    if (err && (err.code === 'EIO' || (err.message && err.message.includes('EIO')))) return;
    console.error('🛑 CRITICAL: Uncaught Exception — server kept alive:', err.stack || err.message);
    try { logSystemError('ERROR', err.message, 'uncaughtException'); } catch (_) {}
  });

  process.on('unhandledRejection', (reason, promise) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    if (reason && (reason.code === 'EIO' || msg.includes('EIO'))) return;
    console.error('🛑 CRITICAL: Unhandled Rejection — server kept alive:', msg);
    try { logSystemError('ERROR', msg, 'unhandledRejection'); } catch (_) {}
  });

  process.on('SIGTERM', () => {
    console.log('📡 SIGTERM received — graceful shutdown');
    process.exit(0);
  });

  // Environment health guard
  const REQUIRED_ENV = ['DB_PATH', 'JWT_SECRET']; 
  const missing = REQUIRED_ENV.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error('\n❌ CRITICAL STARTUP ERROR: Missing Environment Variables:');
    missing.forEach(m => console.error(`   - ${m}`));
    process.exit(1);
  }
  console.log('✅ Environment Health Check Passed.');

  // Run disk space check / Auto-Healer
  runDiskCleanup();

  // Run database migrations
  require('./scripts/run_migrations');
  const dbModuleForStartup = require('./db');
  logSystemErrorReal = dbModuleForStartup.logSystemError;

  if (process.env.INSTAWORLD_PROXY_URL) {
    const fmt = process.env.INSTAWORLD_PROXY_FORMAT || 'simple (default when proxy set)';
    console.log(`🌐 Instaworld tracking → proxy (${fmt}). Book/cancel/cities use direct API unless INSTAWORLD_PROXY_FORMAT=relay.`);
  }

  // Reset stuck sync statuses
  try {
    const db = require('./db').db;
    db.prepare("UPDATE stores SET sync_status = 'idle', sync_progress = 'Ready' WHERE sync_status = 'syncing'").run();
    console.log('✅ All stuck sync statuses reset to idle');
  } catch (e) {
    console.error('Failed to reset sync statuses:', e.message);
  }

  setupWatchdogs();
}

function initPostListen(server) {
  // Initialize scheduler
  try {
    const schedulerInit = require('./scheduler');
    schedulerInit();
    console.log('✅ Scheduler initialized');
  } catch (err) {
    console.error('⚠️ Failed to initialize scheduler:', err.message);
  }

  // Startup Storage Audit
  try {
    const { runStorageAudit } = require('./scripts/storage_audit');
    console.log('📊 Executing startup storage audit...');
    runStorageAudit(true);
  } catch (auditErr) {
    console.error('⚠️ Startup storage audit failed:', auditErr.message);
  }

  // Graceful shutdown sequence
  const shutdown = () => {
    console.log('\n👋 Shutdown signal received. Closing server gracefully...');
    server.close(() => {
      console.log('✅ HTTP server closed.');
      try {
        const { db } = require('./db');
        db.exec('PRAGMA optimize;');
        console.log('✅ Database optimized and closed.');
      } catch (e) {}
      process.exit(0);
    });

    setTimeout(() => {
      console.error('⚠️ Could not close connections in time, forcing shut down');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGINT', shutdown);
}

// Run early startup tasks on require
runEarlyStartup();

module.exports = {
  initPostListen,
  getStats: () => ({
    errorCount,
    recentErrorTimes,
    highMemoryStrikes,
    logBuffer
  })
};
