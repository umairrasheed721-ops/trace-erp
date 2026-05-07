const express = require('express');
const router = express.Router();
const db = require('../db');

// 🔍 SECURE DIAGNOSTICS: Check any parcel's REAL status in the Cloud DB
router.get('/check-status/:tracking', (req, res) => {
    try {
        const { tracking } = req.params;
        const order = db.prepare(`
            SELECT id, shopify_order_id, tracking_number, courier, delivery_status, courier_status, status_date 
            FROM orders 
            WHERE tracking_number = ? OR shopify_order_id = ?
        `).get(tracking, tracking);

        if (!order) {
            return res.status(404).json({ error: 'Parcel not found in Cloud Database' });
        }

        res.json({
            message: '✅ Parcel Found in Cloud DB',
            data: order
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 🚀 CLOUD-FORCE: Force the Railway server to fetch from courier and SAVE
router.get('/force-update/:tracking', async (req, res) => {
    try {
        const { tracking } = req.params;
        const { syncSpecificCourierOrders } = require('../engines/tracking');
        
        const order = db.prepare("SELECT id FROM orders WHERE tracking_number = ?").get(tracking);
        if (!order) return res.status(404).json({ error: 'Order not found in Cloud DB' });

        const store = db.prepare('SELECT * FROM stores LIMIT 1').get();
        if (!store) return res.status(404).json({ error: 'No store found in Cloud DB' });

        const updatedCount = await syncSpecificCourierOrders(store, [order.id]);
        
        const final = db.prepare("SELECT delivery_status, courier_status FROM orders WHERE id = ?").get(order.id);
        res.json({ 
            message: '✅ Cloud Force Sync Triggered', 
            updatedCount, 
            finalState: final 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
