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

module.exports = router;
