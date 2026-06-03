const fs = require('fs');
const path = require('path');
const db = require('../db');
const { broadcast } = require('../sse');
const { syncPostEx, syncInstaworld } = require('./tracking');

// Run Courier sync with DB journaling
async function runCourierSyncWithJournal(store, options = {}) {
  const storeId = store.id;
  const syncType = 'Courier Sync';

  // 1. Initialize Journal: Delete past journal entries for this sync type
  try {
    db.prepare('DELETE FROM sync_journal WHERE store_id = ? AND sync_type = ?').run(storeId, syncType);
  } catch (e) {
    console.error('Failed to clear old journal entries:', e.message);
  }

  // 2. Set active METADATA record for progress tracking
  const initialMeta = JSON.stringify({ processed: 0, total: 0, status: 'Starting Courier Sync...' });
  try {
    db.prepare('INSERT INTO sync_journal (store_id, sync_type, order_id, status, error_details) VALUES (?, ?, \'METADATA\', \'ACTIVE\', ?)')
      .run(storeId, syncType, initialMeta);
  } catch (e) {
    console.error('Failed to insert metadata journal row:', e.message);
  }

  let totalProcessed = 0;
  let totalOrders = 0;

  // Progress callback to update active state in DB and broadcast SSE
  const onProgress = (stage, progressMsg, processed = 0, total = 0) => {
    totalProcessed = Number(processed) || totalProcessed;
    totalOrders = Number(total) || totalOrders;
    const displayMsg = `Syncing: ${stage} - ${progressMsg || ''}`;

    try {
      const meta = JSON.stringify({ processed: totalProcessed, total: totalOrders, status: displayMsg });
      db.prepare('UPDATE sync_journal SET error_details = ? WHERE store_id = ? AND sync_type = ? AND order_id = \'METADATA\'')
        .run(meta, storeId, syncType);
    } catch (e) {
      console.error('Failed to update metadata progress:', e.message);
    }

    broadcast('sync_progress', { 
      storeId, 
      status: displayMsg, 
      processed: totalProcessed, 
      total: totalOrders,
      sync_type: syncType 
    });
  };

  try {
    // Run PostEx Sync
    onProgress('PostEx Tracking', 'Starting PostEx update...', 0, 100);
    const r1 = await syncPostEx(store, 'FULL', (stage, processed, total) => {
      onProgress('PostEx Tracking', stage, processed, total);
    });

    // Run Instaworld Sync
    const postExUpdated = r1.updated || 0;
    const postExTotal = r1.total || 0;
    onProgress('Instaworld Tracking', 'Starting Instaworld update...', postExUpdated, postExTotal + 100);
    const r2 = await syncInstaworld(store, 'FULL', (stage, processed, total) => {
      onProgress('Instaworld Tracking', stage, postExUpdated + processed, postExTotal + total);
    });

    const logs = [...(r1.logs || []), ...(r2.logs || [])];
    const total = (r1.total || 0) + (r2.total || 0);
    const success = (r1.updated || 0) + (r2.updated || 0);
    const failed = (r1.failed || 0) + (r2.failed || 0);

    // 3. Log individual steps (Order ID, Status, Error Details) to sync_journal
    db.transaction(() => {
      logs.forEach(log => {
        db.prepare('INSERT INTO sync_journal (store_id, sync_type, order_id, status, error_details) VALUES (?, ?, ?, ?, ?)')
          .run(storeId, syncType, log.id || log.tracking || 'N/A', log.status || 'SUCCESS', log.message || log.details || '');
      });
    })();

    // 4. Mark METADATA complete
    try {
      db.prepare('UPDATE sync_journal SET status = \'COMPLETE\', error_details = ? WHERE store_id = ? AND sync_type = ? AND order_id = \'METADATA\'')
        .run(JSON.stringify({ processed: total, total, status: 'Sync Complete' }), storeId, syncType);
    } catch (e) {}

    // 5. Push to sync_history (Notifications)
    const stmt = db.prepare('INSERT INTO sync_history (type, total, success, failed, log_data) VALUES (?, ?, ?, ?, ?)');
    const histResult = stmt.run(syncType, total, success, failed, JSON.stringify(logs));
    const logId = histResult.lastInsertRowid;

    // 6. Generate CSV Report
    const { generateCSVReport } = require('./shopify_sync');
    await generateCSVReport(logId, storeId, syncType);

    db.prepare("DELETE FROM sync_history WHERE created_at < datetime('now', '+5 hours', '-3 days')").run();
    broadcast('sync_history_updated', { type: syncType });
    broadcast('sync_progress', { storeId, status: 'Sync Complete', processed: total, total, sync_type: syncType });

    // Clean up METADATA after 5 seconds
    setTimeout(() => {
      try {
        db.prepare('DELETE FROM sync_journal WHERE store_id = ? AND sync_type = ? AND order_id = \'METADATA\'').run(storeId, syncType);
      } catch (e) {}
    }, 5000);

    return { success: true, successCount: success, failedCount: failed, total };
  } catch (err) {
    console.error('Courier Sync execution failure:', err.message);
    try {
      db.prepare('UPDATE sync_journal SET status = \'FAILED\', error_details = ? WHERE store_id = ? AND sync_type = ? AND order_id = \'METADATA\'')
        .run(JSON.stringify({ processed: 0, total: 0, status: `Failed: ${err.message}` }), storeId, syncType);
    } catch (e) {}

    // Create error notification log
    try {
      const stmt = db.prepare('INSERT INTO sync_history (type, total, success, failed, log_data) VALUES (?, ?, ?, ?, ?)');
      const histResult = stmt.run(syncType, 0, 0, 1, JSON.stringify([{ id: 'ERROR', status: 'FAILED', message: err.message }]));
      const { generateCSVReport } = require('./shopify_sync');
      await generateCSVReport(histResult.lastInsertRowid, storeId, syncType);
      broadcast('sync_history_updated', { type: syncType });
    } catch (e) {}

    throw err;
  }
}

module.exports = {
  runCourierSyncWithJournal
};
