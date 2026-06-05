const express = require('express');
const router = express.Router();
const db = require('../db');
const { broadcast } = require('../sse');
const fs = require('fs');
const path = require('path');

// Get sync history (last 3 days)
router.get('/history', (req, res) => {
  try {
    const logs = db.prepare(`
      SELECT * FROM sync_history 
      WHERE created_at >= datetime('now', '+5 hours', '-3 days') 
      ORDER BY created_at DESC 
      LIMIT 50
    `).all();
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Download audit CSV
router.get('/history/:id/download', (req, res) => {
  try {
    const log = db.prepare('SELECT * FROM sync_history WHERE id = ?').get(req.params.id);
    if (!log) return res.status(404).send('Log not found');

    // 1. Check if the generated CSV report file exists on disk
    const reportPath = path.join(__dirname, '..', 'reports', `sync_report_${req.params.id}.csv`);
    if (fs.existsSync(reportPath)) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=Sync_Audit_${(log.type || 'report').replace(/\s+/g, '_')}_${log.id}.csv`);
      return res.sendFile(reportPath);
    }

    // 2. Fallback to generating CSV from JSON log_data
    let data = [];
    try {
      data = JSON.parse(log.log_data || '[]');
    } catch(e) {}
    
    // If no granular logs exist, provide a fallback summary row so the download still works
    if (!data || data.length === 0) {
      data = [{
        type: log.type,
        tracking: 'SUMMARY',
        status: `${log.success} Succeeded`,
        message: `${log.failed} Failed`,
        details: `Total Processed: ${log.total}`
      }];
    }

    // Generate CSV
    const headers = ['Courier / Type', 'Tracking ID', 'Status', 'Message / Error', 'Details'];
    const rows = data.map(item => [
      item.type || item.courier || log.type || 'N/A',
      item.tracking_number || item.tracking || item.id || 'N/A',
      item.status || 'FAILED',
      item.message || item.error || '',
      item.details || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=Sync_Audit_${log.type}_${log.id}.csv`);
    res.send(csvContent);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

const { addTenantClient } = require('../sse');

// SSE stream endpoint for active sync progress
router.get('/stream', (req, res) => {
  const tenantId = req.tenantId || 'default';
  
  // Register client stream
  addTenantClient(tenantId, req, res);

  // Push immediate current state from journal if store_id provided
  const { store_id } = req.query;
  if (store_id) {
    try {
      const row = db.prepare("SELECT sync_type, error_details FROM sync_journal WHERE store_id = ? AND order_id = 'METADATA' AND (status = 'ACTIVE' OR status = 'SYNCING') ORDER BY id DESC LIMIT 1").get(store_id);
      if (row) {
        const details = JSON.parse(row.error_details || '{}');
        const payload = {
          storeId: Number(store_id),
          status: details.status || 'Syncing...',
          processed: Number(details.processed) || 0,
          total: Number(details.total) || 0,
          sync_type: row.sync_type
        };
        res.write(`event: sync_progress\ndata: ${JSON.stringify(payload)}\n\n`);
      }
    } catch (e) {
      console.error('Failed to stream initial sync progress:', e.message);
    }
  }
});

// Helper function to save sync session
router.post('/save-log', (req, res) => {
  const { type, total, success, failed, log_data } = req.body;
  try {
    // 1. Save new log
    const stmt = db.prepare('INSERT INTO sync_history (type, total, success, failed, log_data) VALUES (?, ?, ?, ?, ?)');
    stmt.run(type, total, success, failed, JSON.stringify(log_data));

    // 2. Cleanup old logs (> 3 days)
    db.prepare("DELETE FROM sync_history WHERE created_at < datetime('now', '+5 hours', '-3 days')").run();

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/sync/reconciliation/stats
router.get('/reconciliation/stats', (req, res) => {
  try {
    // 1. Pending Syncs: Booked orders without tracking numbers, not in failed list
    const pendingQuery = db.prepare(`
      SELECT COUNT(*) as count FROM orders
      WHERE LOWER(delivery_status) = 'booked'
        AND (tracking_number IS NULL OR tracking_number = '' OR tracking_number = '—')
        AND id NOT IN (SELECT order_id FROM tracking_reconciliation_logs WHERE status = 'failed')
    `);
    const pending = pendingQuery.get().count;

    // 2. Failed Syncs: Booked orders without tracking numbers, in failed list
    const failedQuery = db.prepare(`
      SELECT COUNT(*) as count FROM orders
      WHERE LOWER(delivery_status) = 'booked'
        AND (tracking_number IS NULL OR tracking_number = '' OR tracking_number = '—')
        AND id IN (SELECT order_id FROM tracking_reconciliation_logs WHERE status = 'failed')
    `);
    const failed = failedQuery.get().count;

    // 3. Successfully Resolved: logs with status = 'resolved'
    const resolvedQuery = db.prepare(`
      SELECT COUNT(*) as count FROM tracking_reconciliation_logs
      WHERE status = 'resolved'
    `);
    const resolved = resolvedQuery.get().count;

    // 4. Orphaned List: failed attempts
    const orphanedList = db.prepare(`
      SELECT r.order_id, r.order_ref, r.error_message, r.last_attempted_at
      FROM tracking_reconciliation_logs r
      JOIN orders o ON r.order_id = o.id
      WHERE r.status = 'failed'
        AND (o.tracking_number IS NULL OR o.tracking_number = '' OR o.tracking_number = '—')
      ORDER BY r.last_attempted_at DESC
      LIMIT 100
    `).all();

    res.json({
      success: true,
      metrics: {
        pending,
        resolved,
        failed
      },
      orphanedList
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/sync/reconciliation/run
router.post('/reconciliation/run', async (req, res) => {
  try {
    const { runReconciliation } = require('../scripts/trackingReconciler');
    const results = await runReconciliation();
    res.json({
      success: true,
      message: 'Reconciliation completed',
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/sync/abort
router.post('/abort', (req, res) => {
  const storeId = req.body.store_id || req.body.storeId;
  if (!storeId) return res.status(400).json({ error: 'store_id required' });

  global.syncProgress = global.syncProgress || {};
  global.syncProgress[storeId] = global.syncProgress[storeId] || {};
  global.syncProgress[storeId].abort = true;

  try {
    db.prepare("UPDATE sync_journal SET status = 'ABORTED' WHERE store_id = ? AND order_id = 'METADATA'").run(storeId);
  } catch (e) {}

  // Emit aborted event to SSE client streams
  broadcast('aborted', { storeId });

  res.json({ success: true, message: 'Cancellation signal sent.' });
});

module.exports = router;

