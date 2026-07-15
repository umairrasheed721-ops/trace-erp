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
        const reqStoreId = req.query.store_id || req.body.store_id || req.body.storeId;

        const schedule = db.prepare('SELECT * FROM sync_schedules WHERE id = ?').get(id);
        if (!schedule) return res.status(404).json({ error: 'Schedule not found' });

        let store;
        if (reqStoreId) {
            store = db.prepare('SELECT * FROM stores WHERE id = ?').get(reqStoreId);
        }
        if (!store) {
            store = db.prepare('SELECT * FROM stores LIMIT 1').get();
        }
        if (!store) return res.status(404).json({ error: 'No store found' });

        const { syncPostEx, syncInstaworld } = require('../engines/tracking');
        const { broadcast } = require('../sse');
        const storeId = store.id;
        const tenantId = req.tenantId || 'default';

        // Toggle active sync flag so the top bar button immediately goes active
        global.activeSyncs = global.activeSyncs || {};
        global.activeSyncs[tenantId] = global.activeSyncs[tenantId] || { shopify: false, courier: false };
        global.activeSyncs[tenantId].courier = true;

        // Initialize progress state
        if (!global.syncProgress) global.syncProgress = {};
        global.syncProgress[storeId] = { 
            status: `Starting ${schedule.courier} (${schedule.sync_type}) Sync...`, 
            processed: 0, 
            total: 0, 
            abort: false 
        };

        const updateProgress = (stage, processed, total, currentOrder = '') => {
            if (global.syncProgress[storeId]) {
                const displayMsg = `Syncing: ${schedule.courier} (${schedule.sync_type}) - ${stage || ''}`;
                global.syncProgress[storeId] = { 
                    status: displayMsg, 
                    processed, 
                    total, 
                    abort: global.syncProgress[storeId].abort || false 
                };
                broadcast('sync_progress', { 
                    storeId, 
                    status: displayMsg, 
                    processed, 
                    total,
                    sync_type: 'Courier Sync',
                    currentOrder
                });
            }
        };

        res.json({ message: `Sync started for ${schedule.courier} (${schedule.sync_type})` });

        // Run sync asynchronously in background wrapped in tenant context
        (async () => {
            try {
                const tenantContext = require('../tenant-context');
                await tenantContext.run(tenantId, async () => {
                    updateProgress('Initializing connection...', 0, 100);
                    if (schedule.courier === 'PostEx') {
                        await syncPostEx(store, schedule.sync_type, (stage, processed, total, currentOrder) => {
                            updateProgress(stage, processed, total, currentOrder);
                        });
                    } else {
                        await syncInstaworld(store, schedule.sync_type, (stage, processed, total, currentOrder) => {
                            updateProgress(stage, processed, total, currentOrder);
                        });
                    }
                    updateProgress('Sync Complete', 100, 100);
                    db.prepare("UPDATE sync_schedules SET last_run_at = datetime('now') WHERE id = ?").run(id);
                });
            } catch (err) {
                console.error(`Error during manual scheduler trigger for schedule #${id}:`, err.message);
                updateProgress('Sync Failed: ' + err.message, 0, 100);
            } finally {
                if (global.activeSyncs && global.activeSyncs[tenantId]) {
                    global.activeSyncs[tenantId].courier = false;
                }
                setTimeout(() => { delete global.syncProgress[storeId]; }, 5000);
            }
        })();

    } catch (err) {
        if (!res.headersSent) {
            res.status(500).json({ error: err.message });
        }
    }
});

module.exports = router;
