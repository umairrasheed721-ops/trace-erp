const express = require('express');
const router = express.Router();
const db = require('../db');
const { runWatchdog } = require('../engines/watchdog');

// GET /api/watchdog?store_id=1
router.get('/', (req, res) => {
  const { store_id } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });

  const results = db.prepare(`
    SELECT * FROM watchdog_results WHERE store_id = ?
    ORDER BY created_at DESC LIMIT 500
  `).all(store_id);

  res.json(results);
});

// POST /api/watchdog/run - Manually trigger watchdog for a store
router.post('/run', async (req, res) => {
  const { store_id } = req.body;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });

  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(store_id);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  res.json({ success: true, message: 'Watchdog running in background...' });

  (async () => {
    try {
      await runWatchdog(store);
    } catch (e) {
      console.error(`Watchdog error: ${e.message}`);
    }
  })();
});

// DELETE /api/watchdog/:id - Remove a watchdog result (allow re-audit)
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM watchdog_results WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
