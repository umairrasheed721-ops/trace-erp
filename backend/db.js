// Uses Node.js v22+ built-in sqlite (no npm install needed)
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const tenantContext = require('./tenant-context');
const { execSync } = require('child_process');

// Import domain migrations
const ordersMigrations = require('./db/migrations/orders');
const whatsappMigrations = require('./db/migrations/whatsapp');
const financeMigrations = require('./db/migrations/finance');
const trackingMigrations = require('./db/migrations/tracking');

const isProduction = process.env.NODE_ENV === 'production' || 
                     process.env.RAILWAY_ENVIRONMENT !== undefined ||
                     process.env.BOT_ENABLED === 'true';

const defaultDbPath = isProduction 
  ? '/app/data/trace_erp.db' 
  : path.join(__dirname, 'trace_erp.db');
const DB_PATH = path.resolve(process.env.DB_PATH || defaultDbPath);

// Ensure the parent directory exists (important for Railway volume mounts)
const DB_DIR = path.dirname(DB_PATH);
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
  console.log(`📁 Created database directory: ${DB_DIR}`);
}

const dbInstances = {};

function getDbInstance() {
  const tenantId = tenantContext.getStore() || 'default';
  if (!dbInstances[tenantId]) {
    const dbPath = tenantId === 'default'
      ? DB_PATH
      : path.resolve(path.join(DB_DIR, `trace_erp_${tenantId}.db`));
    
    // Ensure the parent directory exists
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    
    console.log("Connecting to DB at:", dbPath);
    console.log(`🔌 [Multi-Tenant DB] Opening database for tenant [${tenantId}] at: ${dbPath}`);
    const conn = new DatabaseSync(dbPath);
    dbInstances[tenantId] = conn;
    
    // Initialize schema on the new connection
    initDb(conn);
  }
  return dbInstances[tenantId];
}

const db = new Proxy({}, {
  get(target, prop) {
    const conn = getDbInstance();
    const val = conn[prop];
    if (typeof val === 'function') {
      return val.bind(conn);
    }
    return val;
  }
});

function checkDiskSpace() {
  try {
    const checkPath = isProduction ? '/app/data' : '.';
    const stdout = execSync(`df -k "${checkPath}" 2>/dev/null`).toString();
    const lines = stdout.trim().split('\n');
    if (lines.length < 2) return null;
    const parts = lines[1].split(/\s+/);
    if (parts.length < 6) return null;
    const totalKB = parseInt(parts[1], 10);
    const availableKB = parseInt(parts[3], 10);
    if (isNaN(availableKB) || isNaN(totalKB)) return null;
    const availableMB = Math.round(availableKB / 1024);
    const percentAvailable = (availableKB / totalKB) * 100;
    return { availableMB, percentAvailable };
  } catch (e) {
    return null;
  }
}

function initDb(db) {
  // Check disk availability first
  const space = checkDiskSpace();
  if (space) {
    console.log(`💾 [Disk Space Check] ${space.availableMB} MB (${space.percentAvailable.toFixed(1)}%) available on disk.`);
    if (space.availableMB < 20) {
      console.warn(`⚠️ WARNING: Critical disk space limit reached! Only ${space.availableMB} MB remains.`);
      console.warn(`⚠️ Skipping database schema initialization to prevent startup crash or corruption.`);
      return;
    }
  }

  try {
    // --- ⚡ PERFORMANCE PRAGMAs ---
    db.exec(`PRAGMA journal_mode = WAL`);
    db.exec(`PRAGMA synchronous = NORMAL`);       // Faster writes, safe with WAL
    db.exec(`PRAGMA cache_size = -32000`);         // 32MB page cache
    db.exec(`PRAGMA temp_store = MEMORY`);         // Temp tables in RAM
    db.exec(`PRAGMA mmap_size = 536870912`);       // 512MB memory-mapped I/O
    db.exec(`PRAGMA foreign_keys = ON`);
    db.exec(`PRAGMA busy_timeout = 15000`);         // Wait 15s instead of failing on lock
    db.exec(`PRAGMA wal_autocheckpoint = 1000`);   // Checkpoint every 1000 pages

    // Run domain-specific migrations sequentially
    const migrationBatches = [
      ordersMigrations,
      whatsappMigrations,
      financeMigrations,
      trackingMigrations
    ];

    for (const batch of migrationBatches) {
      for (const migration of batch) {
        if (typeof migration === 'string') {
          db.exec(migration);
        } else if (typeof migration === 'function') {
          migration(db);
        }
      }
    }

    console.log('✅ Database initialized at', db.path || DB_PATH);
  } catch (err) {
    console.error('🛑 Database initialization failed:', err.stack || err.message);
    if (err.message.includes('full') || err.message.includes('disk')) {
      console.warn('⚠️ Disk full error caught. Continuing boot without full schema initialization to prevent crash loop.');
    } else {
      throw err;
    }
  }
}

// Pre-initialize default tenant database
getDbInstance();

// Helper wrappers to mimic better-sqlite3's API pattern
// so the rest of the code doesn't need to change

// --- ⚡ PREPARED STATEMENT CACHE ---
// Compiles each SQL statement ONCE per tenant and reuses it — huge speed gain.
const _prepare_caches = {};

function getPrepared(sql) {
  const tenantId = tenantContext.getStore() || 'default';
  if (!_prepare_caches[tenantId]) {
    _prepare_caches[tenantId] = new Map();
  }
  const cache = _prepare_caches[tenantId];
  if (!cache.has(sql)) {
    const conn = getDbInstance();
    if (cache.size > 1000) cache.clear();
    cache.set(sql, conn.prepare(sql));
  }
  return cache.get(sql);
}

function prepare(sql) {
  return {
    get: (...params) => {
      const start = Date.now();
      const res = getPrepared(sql).get(...params);
      const duration = Date.now() - start;
      if (duration > 300) logAction({ action: 'SLOW_QUERY', level: 'WARN', details: { sql: sql.substring(0, 80), duration } });
      return res;
    },
    all: (...params) => {
      const start = Date.now();
      const res = getPrepared(sql).all(...params);
      const duration = Date.now() - start;
      if (duration > 300) logAction({ action: 'SLOW_QUERY', level: 'WARN', details: { sql: sql.substring(0, 80), duration } });
      return res;
    },
    run: (...params) => {
      const start = Date.now();
      const res = getPrepared(sql).run(...params);
      const duration = Date.now() - start;
      if (duration > 300) logAction({ action: 'SLOW_QUERY', level: 'WARN', details: { sql: sql.substring(0, 80), duration } });
      return res;
    }
  };
}

function transaction(fn) {
  return (...args) => {
    db.exec('BEGIN');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };
}

function logAction({ store_id, order_id, user_id, action, details, snapshot, level = 'INFO' }) {
  try {
    db.prepare(`
      INSERT INTO audit_logs (store_id, order_id, user_id, action, details, snapshot, level)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      store_id ?? null,
      order_id ?? null,
      user_id ?? null,
      action ?? null,
      typeof details === 'object' ? JSON.stringify(details) : (details ?? null),
      typeof snapshot === 'object' ? JSON.stringify(snapshot) : (snapshot ?? null),
      level
    );
  } catch (err) {
    console.error('❌ Failed to write audit log:', err.message);
  }
}

function logOrderChange({ order_id, user_id, type, old_val, new_val }) {
  try {
    // Only log if something actually changed
    const oldStr = JSON.stringify(old_val);
    const newStr = JSON.stringify(new_val);
    if (oldStr === newStr) return;

    db.prepare(`
      INSERT INTO order_history (order_id, user_id, change_type, old_value, new_value)
      VALUES (?, ?, ?, ?, ?)
    `).run(order_id ?? null, user_id ?? null, type ?? null, oldStr, newStr);
  } catch (err) {
    console.error('❌ Failed to log order change:', err.message);
  }
}

function logSystemError(level, message, module = 'server') {
  try {
    db.prepare(`INSERT INTO system_logs (level, message, module) VALUES (?, ?, ?)`)
      .run(level, message.substring(0, 2000), module);
  } catch (_) { } // Never let error logging crash anything
}

function backupDatabase() {
  try {
    const fs = require('fs');
    const path = require('path');
    const backupDir = path.join(DB_DIR, 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const tenantId = tenantContext.getStore() || 'default';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const mainBackupPath = path.join(backupDir, `trace_erp_backup_${tenantId}_${timestamp}.db`);
    
    const conn = getDbInstance();
    conn.exec(`VACUUM INTO '${mainBackupPath}'`);
    console.log(`💾 [BACKUP] Successfully backed up database for tenant [${tenantId}] to: ${mainBackupPath}`);
    
    // Cleanup old backups (> 7 days)
    const files = fs.readdirSync(backupDir);
    const now = Date.now();
    const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
    
    for (const file of files) {
      const filePath = path.join(backupDir, file);
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > maxAgeMs) {
        fs.unlinkSync(filePath);
        console.log(`🗑️ [BACKUP] Cleaned up old backup file: ${filePath}`);
      }
    }
  } catch (err) {
    console.error('❌ [BACKUP] Database backup failed:', err.message);
    logSystemError('ERROR', `[Database Backup] Failed: ${err.message}`, 'database');
  }
}

module.exports = {
  db,
  prepare,
  transaction,
  exec: (sql) => db.exec(sql),
  logAction,
  logOrderChange,
  logSystemError,
  DB_DIR,
  DB_PATH,
  isProduction,
  backupDatabase
};
