const fs = require('fs');
const path = require('path');
const db = require('../db');
const { broadcast } = require('../sse');
const { fetchShopifyOrders, refreshShopifyUpdates } = require('./shopify');

// Run Shopify sync with DB journaling
// Run Shopify sync with DB journaling
async function runShopifySyncWithJournal(store, options = {}) {
  const storeId = store.id;
  const syncType = 'Shopify Sync';

  global.syncProgress = global.syncProgress || {};
  global.syncProgress[storeId] = global.syncProgress[storeId] || {};
  global.syncProgress[storeId].abort = false;

  // 1. Initialize Journal: Delete past journal entries for this sync type
  try {
    db.prepare('DELETE FROM sync_journal WHERE store_id = ? AND sync_type = ?').run(storeId, syncType);
  } catch (e) {
    console.error('Failed to clear old journal entries:', e.message);
  }

  // 2. Set active METADATA record for progress tracking
  const initialMeta = JSON.stringify({ processed: 0, total: 0, status: 'Starting Shopify Sync...' });
  try {
    db.prepare('INSERT INTO sync_journal (store_id, sync_type, order_id, status, error_details) VALUES (?, ?, \'METADATA\', \'ACTIVE\', ?)')
      .run(storeId, syncType, initialMeta);
  } catch (e) {
    console.error('Failed to insert metadata journal row:', e.message);
  }

  let totalProcessed = 0;
  let totalOrders = 0;

  // Progress callback to update active state in DB and broadcast SSE
  const onProgress = (stage, progressMsg, processed = 0, total = 0, currentOrder = '') => {
    totalProcessed = Number(processed) || totalProcessed;
    totalOrders = Number(total) || totalOrders;
    const displayMsg = `Syncing: ${stage} - ${progressMsg || ''}`;

    try {
      const meta = JSON.stringify({ processed: totalProcessed, total: totalOrders, status: displayMsg, currentOrder });
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
      sync_type: syncType,
      currentOrder
    });
  };

  try {
    // Stage 1: Fetch new Shopify Orders
    onProgress('Fetch orders', 'Connecting to Shopify...', 0, 100);
    const r1 = await fetchShopifyOrders(store, (statusMsg, progress, p, t, currentOrder) => {
      onProgress('Fetch orders', statusMsg, p, t, currentOrder);
    }, options);

    // Stage 2: Refresh Updates
    onProgress('Refresh updates', 'Checking status changes...', r1.added || 0, r1.total || 100);
    const r2 = await refreshShopifyUpdates(store, (statusMsg, progress, p, t, currentOrder) => {
      onProgress('Refresh updates', statusMsg, p, t, currentOrder);
    }, options);

    // Compile logs
    const logs = [...(r1.logs || []), ...(r2.logs || [])];
    const total = r1.total || 0;
    const added = r1.added || 0;
    const failed = r1.failed || 0;

    // 3. Log individual steps (Order ID, Status, Error Details) to sync_journal
    db.transaction(() => {
      logs.forEach(log => {
        db.prepare('INSERT INTO sync_journal (store_id, sync_type, order_id, status, error_details) VALUES (?, ?, ?, ?, ?)')
          .run(storeId, syncType, log.id || 'N/A', log.status || 'SUCCESS', log.message || log.details || '');
      });
    })();

    // 4. Mark METADATA complete or aborted
    const isAborted = !!(global.syncProgress && global.syncProgress[storeId] && global.syncProgress[storeId].abort);
    const finalStatus = isAborted ? 'Sync Aborted' : 'Sync Complete';
    const finalJournalStatus = isAborted ? 'ABORTED' : 'COMPLETE';

    try {
      db.prepare('UPDATE sync_journal SET status = ?, error_details = ? WHERE store_id = ? AND sync_type = ? AND order_id = \'METADATA\'')
        .run(finalJournalStatus, JSON.stringify({ processed: totalProcessed, total: totalOrders, status: finalStatus, aborted: isAborted }), storeId, syncType);
    } catch (e) {}

    // 5. Push to sync_history (Notifications)
    const stmt = db.prepare('INSERT INTO sync_history (type, total, success, failed, log_data) VALUES (?, ?, ?, ?, ?)');
    const histResult = stmt.run(syncType, total, added, failed, JSON.stringify(logs));
    const logId = histResult.lastInsertRowid;

    // 6. Generate CSV Report
    await generateCSVReport(logId, storeId, syncType);

    db.prepare("DELETE FROM sync_history WHERE created_at < datetime('now', '+5 hours', '-3 days')").run();
    broadcast('sync_history_updated', { type: syncType });
    if (isAborted) {
      broadcast('aborted', { storeId, sync_type: syncType });
    }
    broadcast('sync_progress', { 
      storeId, 
      status: finalStatus, 
      processed: totalProcessed, 
      total: totalOrders, 
      sync_type: syncType,
      aborted: isAborted
    });

    // Clean up METADATA after 5 seconds
    setTimeout(() => {
      try {
        db.prepare('DELETE FROM sync_journal WHERE store_id = ? AND sync_type = ? AND order_id = \'METADATA\'').run(storeId, syncType);
      } catch (e) {}
    }, 5000);

    return { success: true, added, failed, total };
  } catch (err) {
    console.error('Shopify Sync engine execution failure:', err.message);
    try {
      db.prepare('UPDATE sync_journal SET status = \'FAILED\', error_details = ? WHERE store_id = ? AND sync_type = ? AND order_id = \'METADATA\'')
        .run(JSON.stringify({ processed: 0, total: 0, status: `Failed: ${err.message}` }), storeId, syncType);
    } catch (e) {}
    
    // Broadcast progress failure event via SSE
    try {
      broadcast('sync_progress', { 
        storeId, 
        status: `Failed: ${err.message}`, 
        processed: 0, 
        total: 0, 
        sync_type: syncType,
        failed: true
      });
    } catch (e) {}

    // Create error notification log
    try {
      const stmt = db.prepare('INSERT INTO sync_history (type, total, success, failed, log_data) VALUES (?, ?, ?, ?, ?)');
      const histResult = stmt.run(syncType, 0, 0, 1, JSON.stringify([{ id: 'ERROR', status: 'FAILED', message: err.message }]));
      await generateCSVReport(histResult.lastInsertRowid, storeId, syncType);
      broadcast('sync_history_updated', { type: syncType });
    } catch (e) {}
    
    throw err;
  }
}

// Generate CSV report from sync_journal entries
async function generateCSVReport(logId, storeId, syncType) {
  try {
    const steps = db.prepare('SELECT order_id, status, error_details, created_at FROM sync_journal WHERE store_id = ? AND sync_type = ? AND order_id != \'METADATA\' ORDER BY id ASC').all(storeId, syncType);
    
    const headers = ['Order / Tracking ID', 'Status', 'Details / Errors', 'Timestamp'];
    const rows = steps.map(s => [
      s.order_id,
      s.status,
      s.error_details || '',
      s.created_at
    ]);

    // Fallback row if no granular steps logged
    if (rows.length === 0) {
      rows.push(['SUMMARY', 'SUCCESS', 'No granular errors logged', new Date().toISOString()]);
    }

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const reportsDir = path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const reportPath = path.join(reportsDir, `sync_report_${logId}.csv`);
    fs.writeFileSync(reportPath, csvContent, 'utf8');
    console.log(`📊 Generated sync report at: ${reportPath}`);
  } catch (err) {
    console.error('Failed to generate CSV sync report:', err.message);
  }
}

// Daily Cleanup Task
async function runJournalCleanup() {
  console.log('🧹 Running Sync Journal & Reports Auto-Purge...');
  try {
    const oldLogs = db.prepare("SELECT id FROM sync_history WHERE created_at < datetime('now', '+5 hours', '-3 days')").all();
    const reportsDir = path.join(__dirname, '..', 'reports');
    
    oldLogs.forEach(log => {
      const filePath = path.join(reportsDir, `sync_report_${log.id}.csv`);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          console.log(`Deleted stale report: ${filePath}`);
        } catch (e) {
          console.error(`Failed to delete file ${filePath}:`, e.message);
        }
      }
    });

    db.prepare("DELETE FROM sync_journal WHERE created_at < datetime('now', '+5 hours', '-3 days')").run();
    db.prepare("DELETE FROM sync_history WHERE created_at < datetime('now', '+5 hours', '-3 days')").run();
    console.log('✅ Auto-Purge completed successfully.');
  } catch (err) {
    console.error('Auto-Purge error:', err.message);
  }
}

module.exports = {
  runShopifySyncWithJournal,
  generateCSVReport,
  runJournalCleanup
};
