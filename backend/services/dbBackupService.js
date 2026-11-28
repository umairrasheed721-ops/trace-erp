const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { db, DB_PATH, DB_DIR } = require('../db');

const MAX_LOCAL_BACKUPS = 1; // Keep only 1 rolling verified snapshot on Railway volume to protect disk space (Rule 9)

function getBackupDir() {
  const dir = path.join(DB_DIR, 'backups');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getTenantDbPath(tenantId = 'default') {
  return tenantId === 'default'
    ? DB_PATH
    : path.resolve(path.join(DB_DIR, `trace_erp_${tenantId}.db`));
}

function getFileSizeMB(filePath) {
  try {
    if (!fs.existsSync(filePath)) return 0;
    return Math.round((fs.statSync(filePath).size / (1024 * 1024)) * 100) / 100;
  } catch (_) {
    return 0;
  }
}

function getDiskFreeMB() {
  try {
    const stdout = execSync(`df -k "${DB_DIR}" 2>/dev/null`).toString();
    const lines = stdout.trim().split('\n');
    if (lines.length < 2) return null;
    const parts = lines[1].split(/\s+/);
    const availKB = parseInt(parts[3], 10);
    return Number.isFinite(availKB) ? Math.round(availKB / 1024) : null;
  } catch (_) {
    return null;
  }
}

function listTenantBackups(tenantId = 'default') {
  const dir = getBackupDir();
  const prefix = `trace_erp_${tenantId}_`;
  try {
    return fs.readdirSync(dir)
      .filter(f => f.startsWith(prefix) && f.endsWith('.db'))
      .map(filename => {
        const fullPath = path.join(dir, filename);
        const st = fs.statSync(fullPath);
        return {
          filename,
          sizeMB: Math.round((st.size / (1024 * 1024)) * 100) / 100,
          createdAt: st.mtime.toISOString(),
          mtimeMs: st.mtimeMs,
        };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
  } catch (_) {
    return [];
  }
}

function pruneOldBackups(tenantId = 'default') {
  const backups = listTenantBackups(tenantId);
  const dir = getBackupDir();
  if (backups.length <= MAX_LOCAL_BACKUPS) return 0;
  let removed = 0;
  for (const old of backups.slice(MAX_LOCAL_BACKUPS)) {
    try {
      fs.unlinkSync(path.join(dir, old.filename));
      removed++;
    } catch (_) {}
  }
  return removed;
}

/**
 * Creates a consistent, zero-lock online SQLite snapshot using VACUUM INTO
 * (with WAL checkpoint + copy fallback). Auto-prunes older snapshots to protect Railway disk space.
 */
function createSafeBackup(tenantId = 'default', reason = 'manual') {
  const dir = getBackupDir();
  const activeDbPath = getTenantDbPath(tenantId);
  const dbSizeMB = getFileSizeMB(activeDbPath);
  const freeBeforeMB = getDiskFreeMB();

  // Safety Guard (Rule 9): If free space is tight, prune previous local snapshot first, then verify >= 1.25x DB + 100 MB free
  const minNeededMB = Math.max(150, Math.ceil(dbSizeMB * 1.25) + 100);
  if (freeBeforeMB !== null && freeBeforeMB < minNeededMB) {
    // Clear existing snapshots for this tenant to reclaim room before re-checking
    for (const old of listTenantBackups(tenantId)) {
      try { fs.unlinkSync(path.join(dir, old.filename)); } catch (_) {}
    }
    const freeAfterMB = getDiskFreeMB();
    if (freeAfterMB !== null && freeAfterMB < minNeededMB) {
      throw new Error(`Low disk space (${freeAfterMB} MB free, need ~${minNeededMB} MB for safe snapshot of ${dbSizeMB} MB DB)`);
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `trace_erp_${tenantId}_${stamp}.db`;
  const targetPath = path.join(dir, filename);

  let method = 'vacuum_into';
  try {
    const escapedPath = targetPath.replace(/'/g, "''");
    db.exec(`VACUUM INTO '${escapedPath}'`);
  } catch (vacErr) {
    console.warn(`⚠️ [DB Backup] VACUUM INTO unavailable (${vacErr.message}), using WAL checkpoint + copy fallback.`);
    method = 'wal_copy';
    try { db.exec('PRAGMA wal_checkpoint(TRUNCATE);'); } catch (_) {}
    const srcPath = getTenantDbPath(tenantId);
    if (!fs.existsSync(srcPath)) {
      throw new Error('Active SQLite database file not found');
    }
    fs.copyFileSync(srcPath, targetPath);
  }

  const sizeMB = getFileSizeMB(targetPath);
  const pruned = pruneOldBackups(tenantId);
  console.log(`🛡️ [DB Backup] Created snapshot ${filename} (${sizeMB} MB, method=${method}, reason=${reason}, pruned=${pruned})`);

  return {
    success: true,
    filename,
    filePath: targetPath,
    sizeMB,
    method,
    reason,
    createdAt: new Date().toISOString(),
  };
}

function getBackupStatus(tenantId = 'default') {
  const backups = listTenantBackups(tenantId);
  const latest = backups[0] || null;
  const activeDbPath = getTenantDbPath(tenantId);
  return {
    tenantId,
    dbSizeMB: getFileSizeMB(activeDbPath),
    diskFreeMB: getDiskFreeMB(),
    backupCount: backups.length,
    maxRetained: MAX_LOCAL_BACKUPS,
    autoSchedule: 'Daily 4:00 AM PKT',
    lastBackupAt: latest?.createdAt || null,
    lastBackupFilename: latest?.filename || null,
    lastBackupSizeMB: latest?.sizeMB || 0,
    backups: backups.map(({ mtimeMs, ...rest }) => rest),
  };
}

function resolveBackupDownloadPath(tenantId = 'default', requestedFilename = null) {
  const dir = getBackupDir();
  const prefix = `trace_erp_${tenantId}_`;
  if (requestedFilename) {
    const safeName = path.basename(String(requestedFilename));
    if (!safeName.startsWith(prefix) || !safeName.endsWith('.db')) {
      throw new Error('Invalid backup filename');
    }
    const candidate = path.join(dir, safeName);
    if (!fs.existsSync(candidate)) throw new Error('Requested backup snapshot not found');
    return { filePath: candidate, filename: safeName };
  }

  const backups = listTenantBackups(tenantId);
  if (backups.length > 0) {
    const latest = backups[0];
    return { filePath: path.join(dir, latest.filename), filename: latest.filename };
  }

  const created = createSafeBackup(tenantId, 'download_auto');
  return { filePath: created.filePath, filename: created.filename };
}

module.exports = {
  createSafeBackup,
  getBackupStatus,
  resolveBackupDownloadPath,
};
