const express = require('express');
const router = express.Router();
const db = require('../db');
const { broadcast } = require('../sse');
const fs = require('fs');
const path = require('path');

const { recordSyncEvent, listSyncHistory } = require('../services/syncHistoryService');

// Get sync history (last 3 days) — optional ?store_id= filter
router.get('/history', (req, res) => {
  try {
    const storeId = req.query.store_id ? parseInt(req.query.store_id, 10) : null;
    const logs = listSyncHistory({ storeId, limit: req.query.limit || 60 });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/sync/history — Admin-only clear sync history
router.delete('/history', (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  try {
    db.prepare('DELETE FROM sync_history').run();
    broadcast('sync_history_updated', { cleared: true });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/sync/live-logs — get log entries of the latest sync session
router.get('/live-logs', (req, res) => {
  try {
    const latest = db.prepare('SELECT type, log_data, created_at FROM sync_history ORDER BY created_at DESC LIMIT 1').get();
    if (!latest) return res.json({ type: 'None', logs: [], created_at: null });
    
    let logs = [];
    try {
      logs = JSON.parse(latest.log_data || '[]');
    } catch (e) {}

    res.json({
      type: latest.type,
      logs: Array.isArray(logs) ? logs : [],
      created_at: latest.created_at
    });
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
      } else if (global.syncProgress && global.syncProgress[store_id]) {
        const prog = global.syncProgress[store_id];
        const payload = {
          storeId: Number(store_id),
          status: prog.status || 'Syncing...',
          processed: Number(prog.processed) || 0,
          total: Number(prog.total) || 0,
          sync_type: prog.sync_type || 'Courier Sync'
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




// POST /api/sync/start - Trigger manual Shopify or Courier sync
router.post('/start', async (req, res) => {
  try {
    const { type, mode, days, order_number } = req.body;
    let storeId = req.body.store_id || req.body.storeId;
    
    let store;
    if (storeId) {
      store = db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId);
    }
    if (!store) {
      store = db.prepare('SELECT * FROM stores ORDER BY id ASC LIMIT 1').get();
    }
    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }

    const { fetchShopifyOrders, syncOrderByNumber } = require('../engines/shopify');
    const { syncPostEx, syncInstaworld } = require('../engines/tracking');

    if (type === 'Shopify Sync' || (type && type.toLowerCase().includes('shopify'))) {
      if (order_number) {
        await syncOrderByNumber(store, order_number);
        recordSyncEvent({
          storeId: store.id,
          storeName: store.store_name || store.shop_domain,
          type: 'Shopify Order Sync',
          category: 'shopify',
          total: 1,
          success: 1,
          failed: 0,
          summary: `Synced order ${order_number}`
        });
        return res.json({ success: true, message: `Synced Shopify order ${order_number}` });
      }
      
      // Run sync in background and notify frontend via SSE + Sync History upon completion
      const { refreshShopifyUpdates } = require('../engines/shopify');
      (async () => {
        try {
          const r1 = await fetchShopifyOrders(store, null, { forceDeepSync: mode === 'full' });
          const r2 = await refreshShopifyUpdates(store);
          const added = Number(r1?.added || 0);
          const updated = Number(r2?.updated || 0);
          const failed = Number(r1?.failed || 0);
          recordSyncEvent({
            storeId: store.id,
            storeName: store.store_name || store.shop_domain,
            type: mode === 'full' ? 'Shopify Full Sync' : 'Shopify Sync',
            category: 'shopify',
            total: Number(r1?.total || added + updated),
            success: added + updated,
            failed,
            summary: `${added} new, ${updated} refreshed`,
            details: r1?.logs || []
          });
          console.log(`[SyncRoute] Shopify order sync complete for ${store.shop_domain}: added=${added}, updated=${updated}`);
          try { broadcast('order_updated', { storeId: store.id }); } catch (e) {}
        } catch (err) {
          console.error(`[SyncRoute] Shopify order sync error:`, err.message);
          recordSyncEvent({
            storeId: store.id,
            storeName: store.store_name || store.shop_domain,
            type: 'Shopify Sync',
            category: 'shopify',
            total: 1,
            success: 0,
            failed: 1,
            summary: err.message,
            details: [{ id: store.shop_domain, status: 'FAILED', message: err.message }]
          });
        }
      })();

      return res.json({ success: true, message: '🛒 Shopify Order Sync initiated! Fetching latest orders...' });
    } else {
      // Courier Sync (PostEx + Instaworld)
      (async () => {
        let total = 0, success = 0, failed = 0;
        const details = [];
        try {
          if (store.postex_token) {
            const pRes = await syncPostEx(store);
            total += Number(pRes?.total || 0);
            success += Number(pRes?.updated || 0);
            failed += Number(pRes?.failed || 0);
            if (Array.isArray(pRes?.logs)) details.push(...pRes.logs);
          }
        } catch (e) {
          failed++;
          details.push({ id: 'PostEx', status: 'FAILED', message: e.message });
        }
        try {
          if (store.instaworld_key || store.instaworld_key_backup || store.instaworld_key_3) {
            const iRes = await syncInstaworld(store);
            total += Number(iRes?.total || 0);
            success += Number(iRes?.updated || 0);
            failed += Number(iRes?.failed || 0);
            if (Array.isArray(iRes?.logs)) details.push(...iRes.logs);
          }
        } catch (e) {
          failed++;
          details.push({ id: 'Instaworld', status: 'FAILED', message: e.message });
        }
        recordSyncEvent({
          storeId: store.id,
          storeName: store.store_name || store.shop_domain,
          type: 'Courier Tracking Sync',
          category: 'courier',
          total,
          success,
          failed,
          summary: `${success} tracking updates`,
          details
        });
      })();
      return res.json({ success: true, message: '🚚 Courier tracking sync initiated in background!' });
    }
  } catch (error) {
    console.error('Error starting sync:', error);
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

  const tenantId = req.tenantId || 'default';
  if (global.activeSyncs && global.activeSyncs[tenantId]) {
    global.activeSyncs[tenantId].shopify = false;
    global.activeSyncs[tenantId].courier = false;
  }

  res.json({ success: true, message: 'Cancellation signal sent.' });
});

module.exports = router;

