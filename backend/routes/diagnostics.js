const express = require('express');
const router = express.Router();
const db = require('../db');
const { instaworldFetch } = require('../engines/instaworld_http');

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
        
        const order = db.prepare("SELECT id, store_id FROM orders WHERE tracking_number = ?").get(tracking);
        if (!order) return res.status(404).json({ error: 'Order not found in Cloud DB' });

        const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(order.store_id);
        if (!store) return res.status(404).json({ error: 'Store not found' });
        
        // 🔍 DEBUG TRAP: See raw response from Instaworld during the sync
        const trackUrl = store.instaworld_track_url || 'https://one-be.instaworld.pk/logistics/v1/trackShipment';
        const rawRes = await instaworldFetch(trackUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tracking_number: tracking, api_key: store.instaworld_key }),
            proxyUrl: store.gas_proxy_url,
        });
        const rawBody = await rawRes.text();

        const updatedCount = await syncSpecificCourierOrders(store, [order.id]);
        
        const final = db.prepare("SELECT delivery_status, courier_status FROM orders WHERE id = ?").get(order.id);
        res.json({ 
            message: '✅ Cloud Force Sync Triggered', 
            courierRawStatus: rawRes.status,
            courierRawBody: rawBody.substring(0, 500),
            updatedCount, 
            finalState: final 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 🧪 CLOUD WIRETAP: See what the Railway server sees from the V2 API
router.get('/test-v2/:tracking', async (req, res) => {
    try {
        const { tracking } = req.params;
        const v2Url = `https://one-be.instaworld.pk/v2/public/track/${tracking}`;
        const v2Res = await instaworldFetch(v2Url, {
            method: 'GET',
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000,
        });
        const data = await v2Res.json();
        res.json({ url: v2Url, status: v2Res.status, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 🛠️ CLOUD PROVISION: Securely update config on the live server
router.get('/provision', async (req, res) => {
    try {
        const { urlBase64 } = req.query;
        if (!urlBase64) return res.status(400).json({ error: "Missing urlBase64 query param" });
        const decodedUrl = Buffer.from(urlBase64, 'base64').toString('utf-8');
        db.prepare("UPDATE stores SET gas_proxy_url = ?").run(decodedUrl);
        res.json({ message: "✅ Cloud Proxy Updated", url: decodedUrl });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 🛡️ DIRECT TEST: Explicitly bypass proxy to check IP whitelisting
router.get('/test-direct/:tracking', async (req, res) => {
    try {
        const { tracking } = req.params;
        const order = db.prepare("SELECT store_id FROM orders WHERE tracking_number = ?").get(tracking);
        if (!order) return res.status(404).json({ error: 'Order not found' });
        const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(order.store_id);

        const fetch = require('node-fetch');
        const url = 'https://one-be.instaworld.pk/logistics/v1/trackShipment';
        
        console.log(`📡 Testing direct connection to Instaworld for ${tracking}...`);
        const start = Date.now();
        const response = await fetch(url, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({ 
                tracking_number: tracking,
                api_key: store.instaworld_key 
            }),
            timeout: 15000
        });
        const duration = Date.now() - start;
        const body = await response.text();

        res.json({
            direct_test: true,
            status: response.status,
            duration: `${duration}ms`,
            response: body.substring(0, 1000)
        });
    } catch (err) {
        res.status(500).json({ 
            direct_test: false,
            error: err.message,
            tip: "If this times out or gives 403, Instaworld hasn't whitelisted the IP yet."
        });
    }
});

module.exports = router;
