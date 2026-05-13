const express = require('express');
const router = express.Router();
const db = require('../db');
const { broadcast } = require('../sse');

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

    const data = JSON.parse(log.log_data || '[]');
    if (data.length === 0) return res.status(404).send('No audit data available');

    // Generate CSV
    const headers = ['Order/Tracking ID', 'Status', 'Message', 'Details'];
    const rows = data.map(item => [
      item.id || item.tracking || 'N/A',
      item.status || 'FAILED',
      item.message || '',
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
