const express = require('express');
const router = express.Router();
const db = require('../db');
const { instaworldFetch } = require('../engines/instaworld_http');

// 📊 SYSTEM STATS: Quick pulse check for the dashboard
router.get('/stats', (req, res) => {
    try {
        const { store_id } = req.query;
        if (!store_id) return res.status(400).json({ error: 'store_id required' });

        const orders = db.prepare('SELECT COUNT(*) as count FROM orders WHERE store_id = ?').get(store_id).count;
        const auditLogs = db.prepare('SELECT COUNT(*) as count FROM audit_logs WHERE store_id = ?').get(store_id).count;
        const missingItems = db.prepare('SELECT COUNT(*) as count FROM orders WHERE store_id = ? AND (cost IS NULL OR cost = 0)').get(store_id).count;
        
        const mem = process.memoryUsage();
        const memory = mem.rss / 1024 / 1024;

        res.json({
            orders,
            auditLogs,
            missingItems,
            memory
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 🚀 SMOKE TEST: Connectivity check
router.get('/smoke-test', async (req, res) => {
    try {
        const { store_id } = req.query;
        if (!store_id) return res.status(400).json({ error: 'store_id required' });

        const results = {
            database: 'OK',
            shopify: []
        };

        const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(store_id);
        if (store) {
            try {
                const shopifyRes = await fetch(`https://${store.shop_domain}/admin/api/2024-10/shop.json`, {
                    headers: { 'X-Shopify-Access-Token': store.access_token }
                });
                results.shopify.push({
                    domain: store.shop_domain,
                    status: shopifyRes.ok ? 'OK' : 'ERROR (' + shopifyRes.status + ')'
                });
            } catch (e) {
                results.shopify.push({ domain: store.shop_domain, status: 'FAILED' });
            }
        }

        res.json({ results });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 🔍 AUDIT: Find data inconsistencies
router.get('/audit/:type', (req, res) => {
    try {
        const { type } = req.params;
        const { store_id } = req.query;
        if (!store_id) return res.status(400).json({ error: 'store_id required' });

        let results = [];
        if (type === 'zero-costs') {
            results = db.prepare(`
                SELECT id, ref_number, customer_name, order_date, price, delivery_status 
                FROM orders 
                WHERE store_id = ? AND price > 0 AND (cost IS NULL OR cost = 0)
                ORDER BY order_date DESC LIMIT 500
            `).all(store_id);
        } else if (type === 'orphaned-costs') {
            results = db.prepare(`
                SELECT mc.id, mc.parent_title, mc.variant_title, mc.sku, mc.unit_cost 
                FROM product_master_costs mc
                LEFT JOIN products p ON mc.shopify_variant_id = p.shopify_variant_id
                WHERE mc.store_id = ? AND p.id IS NULL
                LIMIT 500
            `).all(store_id);
        } else if (type === 'duplicates') {
            results = db.prepare(`
                SELECT ref_number, COUNT(*) as count 
                FROM orders 
                WHERE store_id = ? AND ref_number IS NOT NULL AND ref_number != ''
                GROUP BY ref_number HAVING count > 1
                LIMIT 500
            `).all(store_id);
        } else if (type === 'missing-master-costs') {
            results = db.prepare(`
                SELECT p.shopify_variant_id, p.title, p.sku, p.price
                FROM products p
                LEFT JOIN product_master_costs mc ON p.shopify_variant_id = mc.shopify_variant_id
                WHERE p.store_id = ? AND mc.id IS NULL
                LIMIT 500
            `).all(store_id);
        } else if (type === 'profit-anomalies') {
            results = db.prepare(`
                SELECT id, ref_number, price, cost, (price - cost) as profit
                FROM orders 
                WHERE store_id = ? AND (price - cost) < 0 AND price > 0
                LIMIT 500
            `).all(store_id);
        }

        res.json({ results });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ✨ HEAL: Automated repair operations
router.post('/heal/zero-costs', (req, res) => {
    try {
        const { store_id } = req.body;
        if (!store_id) return res.status(400).json({ error: 'store_id required' });

        // Logic: Try to find costs from master registry for zero-cost orders
        const orders = db.prepare(`
            SELECT o.id, o.line_items 
            FROM orders o 
            WHERE o.store_id = ? AND (o.cost IS NULL OR o.cost = 0)
        `).all(store_id);

        let healedCount = 0;
        const masterCosts = db.prepare('SELECT shopify_variant_id, unit_cost, packaging_cost FROM product_master_costs WHERE store_id = ?').all(store_id);
        const costMap = new Map(masterCosts.map(c => [c.shopify_variant_id, (c.unit_cost || 0) + (c.packaging_cost || 0)]));

        const updateStmt = db.prepare('UPDATE orders SET cost = ? WHERE id = ?');

        for (const order of orders) {
            try {
                const items = JSON.parse(order.line_items || '[]');
                let totalCost = 0;
                let foundAll = true;
                for (const item of items) {
                    const c = costMap.get(String(item.variant_id));
                    if (c !== undefined) {
                        totalCost += c * (item.quantity || 1);
                    } else {
                        foundAll = false;
                    }
                }
                if (totalCost > 0) {
                    updateStmt.run(totalCost, order.id);
                    healedCount++;
                }
            } catch (e) {}
        }

        res.json({ success: true, healedCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/heal/line-items', async (req, res) => {
    try {
        const { store_id } = req.body;
        if (!store_id) return res.status(400).json({ error: 'store_id required' });

        const batchSize = 10;
        const orders = db.prepare(`
            SELECT id, shopify_order_id 
            FROM orders 
            WHERE store_id = ? AND (line_items IS NULL OR line_items = '[]')
            LIMIT ?
        `).all(store_id, batchSize);

        let healedCount = 0;
        const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(store_id);

        if (store) {
            for (const order of orders) {
                try {
                    // Fetch from Shopify
                    const shopifyUrl = `https://${store.shop_domain}/admin/api/2024-10/orders/${order.shopify_order_id}.json`;
                    const sRes = await fetch(shopifyUrl, { headers: { 'X-Shopify-Access-Token': store.access_token } });
                    const sData = await sRes.json();
                    if (sData.order && sData.order.line_items) {
                        const lineItems = sData.order.line_items.map(item => ({
                            id: item.id,
                            variant_id: item.variant_id,
                            title: item.title,
                            sku: item.sku,
                            quantity: item.quantity,
                            price: item.price,
                            variant_title: item.variant_title
                        }));
                        db.prepare('UPDATE orders SET line_items = ? WHERE id = ?').run(JSON.stringify(lineItems), order.id);
                        healedCount++;
                    }
                } catch (e) {}
            }
        }

        const remaining = db.prepare('SELECT COUNT(*) as count FROM orders WHERE store_id = ? AND (line_items IS NULL OR line_items = "[]")').get(store_id).count;

        res.json({ success: true, healedCount, remaining: remaining > 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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

        const { instaworldFetch } = require('../engines/instaworld_http');
        const url = 'https://one-be.instaworld.pk/logistics/v1/trackShipment';
        
        console.log(`📡 Testing connection to Instaworld for ${tracking}...`);
        const start = Date.now();
        const response = await instaworldFetch(url, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({ 
                tracking_number: tracking,
                api_key: store.instaworld_key 
            }),
            timeout: 15000,
            proxyUrl: store.gas_proxy_url
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

// 🛡️ RAW DIRECT TEST: Hard-bypass all proxy logic to verify IP whitelisting
router.get('/test-raw/:tracking', async (req, res) => {
    try {
        const { tracking } = req.params;
        const order = db.prepare("SELECT store_id FROM orders WHERE tracking_number = ?").get(tracking);
        if (!order) return res.status(404).json({ error: 'Order not found' });
        const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(order.store_id);

        const fetch = require('node-fetch');
        const url = 'https://one-be.instaworld.pk/logistics/v1/trackShipment';
        
        console.log(`🔌 RAW TEST: Attempting direct connection to Instaworld (BYPASS PROXY) for ${tracking}...`);
        const start = Date.now();
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                tracking_number: tracking,
                api_key: store.instaworld_key 
            }),
            timeout: 10000
        });
        const duration = Date.now() - start;
        const body = await response.text();

        res.json({
            raw_direct_test: true,
            status: response.status,
            duration: `${duration}ms`,
            response: body.substring(0, 1000),
            tip: response.status === 200 ? "✅ Success! They have unblocked the IP." : "❌ Failed. Still blocked or returning error."
        });
    } catch (err) {
        res.status(500).json({ 
            raw_direct_test: false,
            error: err.message,
            tip: "This usually means the Railway IP is still blocked by their firewall."
        });
    }
});

const errorLogs = [];
const originalConsoleError = console.error;
console.error = (...args) => {
    errorLogs.push({ time: new Date().toISOString(), message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') });
    if (errorLogs.length > 100) errorLogs.shift();
    originalConsoleError(...args);
};

router.get('/errors', (req, res) => {
    res.json({ success: true, errors: errorLogs });
});

router.get('/debug-messages', (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM whatsapp_messages ORDER BY id DESC LIMIT 15').all();
        res.json({ success: true, messages: rows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
