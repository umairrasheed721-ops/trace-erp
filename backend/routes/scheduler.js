const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/scheduler/schedules
router.get('/schedules', (req, res) => {
    try {
        const schedules = db.prepare('SELECT * FROM sync_schedules').all();
        res.json(schedules);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/scheduler/schedules/:id
router.post('/schedules/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { interval_minutes, is_active } = req.body;
        db.prepare('UPDATE sync_schedules SET interval_minutes = ?, is_active = ? WHERE id = ?')
          .run(interval_minutes, is_active ? 1 : 0, id);
        res.json({ message: 'Schedule updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/scheduler/trigger/:id
router.post('/trigger/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const schedule = db.prepare('SELECT * FROM sync_schedules WHERE id = ?').get(id);
        if (!schedule) return res.status(404).json({ error: 'Schedule not found' });

        const store = db.prepare('SELECT * FROM stores LIMIT 1').get();
        if (!store) return res.status(404).json({ error: 'No store found' });

        const { syncPostEx, syncInstaworld } = require('../engines/tracking');

        res.json({ message: `Sync started for ${schedule.courier} (${schedule.sync_type})` });

        // Background trigger
        if (schedule.courier === 'PostEx') {
            await syncPostEx(store, schedule.sync_type);
        } else {
            await syncInstaworld(store, schedule.sync_type);
        }
        
        db.prepare("UPDATE sync_schedules SET last_run_at = datetime('now') WHERE id = ?").run(id);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
