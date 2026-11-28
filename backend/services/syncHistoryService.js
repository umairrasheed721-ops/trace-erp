/**
 * 🔔 Centralized Sync & Activity History Service (Rule 3 Reuse + Rule 9 Railway RAM/Disk Safe)
 *
 * Powers the Topbar Bell Notification Hub (`Sync History (3d)`) across all background crons,
 * manual store syncs, courier tracking syncs, bulk bookings/cancels, catalog syncs,
 * Ready-to-Book tag cleanups, and automated email drips.
 */
const { db } = require('../db');
const { broadcast } = require('../sse');

const MAX_LOG_DETAILS = 150;
const MAX_HISTORY_ROWS = 200;

function ensureSyncHistoryColumns() {
  const cols = [
    'ALTER TABLE sync_history ADD COLUMN store_id INTEGER DEFAULT NULL',
    'ALTER TABLE sync_history ADD COLUMN store_name TEXT DEFAULT NULL',
    "ALTER TABLE sync_history ADD COLUMN category TEXT DEFAULT 'sync'",
    "ALTER TABLE sync_history ADD COLUMN summary TEXT DEFAULT ''"
  ];
  for (const sql of cols) {
    try { db.exec(sql); } catch (_) {}
  }
}

let columnsChecked = false;

function resolveStoreName(storeId, storeName) {
  if (storeName && String(storeName).trim()) return String(storeName).trim();
  if (!storeId) return null;
  try {
    const row = db.prepare('SELECT store_name, shop_domain FROM stores WHERE id = ?').get(Number(storeId));
    if (!row) return null;
    if (row.store_name && row.store_name !== 'My Store' && row.store_name !== 'Store') return row.store_name;
    return row.shop_domain ? row.shop_domain.replace('.myshopify.com', '') : `Store #${storeId}`;
  } catch (_) {
    return null;
  }
}

/**
 * Record a sync / automation / bulk event into sync_history and push live SSE update to Bell icon.
 */
function recordSyncEvent({
  storeId = null,
  storeName = null,
  type = 'System Sync',
  category = 'sync',
  total = 0,
  success = 0,
  failed = 0,
  summary = '',
  details = [],
  onlyIfNonEmpty = false
} = {}) {
  const nTotal = Number(total) || 0;
  const nSuccess = Number(success) || 0;
  const nFailed = Number(failed) || 0;

  if (onlyIfNonEmpty && nSuccess === 0 && nFailed === 0 && (!Array.isArray(details) || details.length === 0)) {
    return null;
  }

  try {
    if (!columnsChecked) {
      ensureSyncHistoryColumns();
      columnsChecked = true;
    }

    const resolvedStoreName = resolveStoreName(storeId, storeName);
    const trimmedDetails = Array.isArray(details) ? details.slice(0, MAX_LOG_DETAILS) : [];
    const safeSummary = String(summary || '').slice(0, 240);

    const res = db.prepare(`
      INSERT INTO sync_history (store_id, store_name, type, category, total, success, failed, summary, log_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      storeId ? Number(storeId) : null,
      resolvedStoreName,
      String(type).slice(0, 80),
      String(category || 'sync').slice(0, 32),
      nTotal,
      nSuccess,
      nFailed,
      safeSummary,
      JSON.stringify(trimmedDetails)
    );

    // Keep last 3 days and hard-cap total rows so SQLite never bloats
    db.prepare("DELETE FROM sync_history WHERE created_at < datetime('now', '+5 hours', '-3 days')").run();
    db.prepare(`
      DELETE FROM sync_history
      WHERE id NOT IN (SELECT id FROM sync_history ORDER BY id DESC LIMIT ?)
    `).run(MAX_HISTORY_ROWS);

    try {
      broadcast('sync_history_updated', {
        id: res.lastInsertRowid,
        storeId: storeId ? Number(storeId) : null,
        type,
        category,
        success: nSuccess,
        failed: nFailed
      });
    } catch (_) {}

    return res.lastInsertRowid;
  } catch (err) {
    console.warn(`[SyncHistory] Failed to record "${type}":`, err.message);
    return null;
  }
}

/**
 * List recent sync history (last 3 days) with lightweight inline detail preview (max 6 items).
 */
function listSyncHistory({ storeId = null, limit = 60 } = {}) {
  if (!columnsChecked) {
    ensureSyncHistoryColumns();
    columnsChecked = true;
  }

  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 60, 1), 150);
  const rows = storeId
    ? db.prepare(`
        SELECT id, store_id, store_name, type, category, total, success, failed, summary, log_data, created_at
        FROM sync_history
        WHERE created_at >= datetime('now', '+5 hours', '-3 days')
          AND (store_id = ? OR store_id IS NULL)
        ORDER BY id DESC
        LIMIT ?
      `).all(Number(storeId), safeLimit)
    : db.prepare(`
        SELECT id, store_id, store_name, type, category, total, success, failed, summary, log_data, created_at
        FROM sync_history
        WHERE created_at >= datetime('now', '+5 hours', '-3 days')
        ORDER BY id DESC
        LIMIT ?
      `).all(safeLimit);

  return rows.map(row => {
    let parsed = [];
    try {
      const raw = JSON.parse(row.log_data || '[]');
      if (Array.isArray(raw)) parsed = raw;
    } catch (_) {}

    const failures = parsed.filter(item => {
      const st = String(item?.status || '').toUpperCase();
      return st === 'FAILED' || st === 'ERROR' || Boolean(item?.reason) || Boolean(item?.error);
    });
    const previewSource = failures.length > 0 ? failures : parsed;
    const preview = previewSource.slice(0, 6).map(item => ({
      id: item?.ref_number || item?.tracking_number || item?.tracking || item?.id || 'ITEM',
      status: item?.status || (item?.reason || item?.error ? 'FAILED' : 'INFO'),
      message: item?.reason || item?.message || item?.error || item?.details || ''
    }));

    return {
      id: row.id,
      store_id: row.store_id ?? null,
      store_name: row.store_name || null,
      type: row.type,
      category: row.category || inferCategory(row.type),
      total: Number(row.total) || 0,
      success: Number(row.success) || 0,
      failed: Number(row.failed) || 0,
      summary: row.summary || '',
      details_count: parsed.length,
      preview,
      created_at: row.created_at
    };
  });
}

function inferCategory(type) {
  const t = String(type || '').toLowerCase();
  if (t.includes('book') || t.includes('cancel')) return 'booking';
  if (t.includes('postex') || t.includes('insta') || t.includes('courier') || t.includes('tracking')) return 'courier';
  if (t.includes('catalog') || t.includes('cost') || t.includes('inventory')) return 'catalog';
  if (t.includes('tag') || t.includes('ready')) return 'tags';
  if (t.includes('email') || t.includes('review') || t.includes('drip')) return 'email';
  if (t.includes('payout') || t.includes('reconcil')) return 'finance';
  if (t.includes('shopify')) return 'shopify';
  return 'sync';
}

module.exports = {
  recordSyncEvent,
  listSyncHistory,
  inferCategory
};
