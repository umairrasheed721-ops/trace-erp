const db = require('./db');
const { applyMap, loadStatusMaps } = require('./engines/tracking');
const fetch = require('node-fetch');
const https = require('https');
const agent = new https.Agent({ rejectUnauthorized: false });

async function auditInstaworld() {
    console.log('📊 --- INSTAWORLD BACKEND AUDIT ---');
    
    // 1. Check Status Mappings
    const maps = loadStatusMaps();
    console.log(`✅ Loaded ${Object.keys(maps).length} active status mappings.`);
    const returnedMapping = maps['all:returned to shipper'];
    console.log(`📌 Mapping for 'all:returned to shipper': ${returnedMapping || '❌ NOT FOUND'}`);

    // 2. Check Store 1 Config
    const store = db.prepare('SELECT id, instaworld_key, instaworld_track_url FROM stores WHERE id = 1').get();
    if (!store) return console.error('❌ Store 1 not found in DB');
    console.log(`✅ Store 1 found. Key starts with: ${store.instaworld_key ? store.instaworld_key.substring(0, 5) : 'MISSING'}...`);
    console.log(`✅ Track URL: ${store.instaworld_track_url || 'DEFAULT'}`);

    // 3. Test API Connection for LE7530338720
    const trackingNumber = 'LE7530338720';
    console.log(`📡 Probing Instaworld API for ${trackingNumber}...`);
    
    try {
        const trackUrl = store.instaworld_track_url || 'https://one-be.instaworld.pk/logistics/v1/trackShipment';
        const res = await fetch(trackUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
            },
            body: JSON.stringify({ tracking_number: trackingNumber, api_key: store.instaworld_key.trim() }),
            agent,
            timeout: 15000
        });

        console.log(`🌐 API Response Code: ${res.status}`);
        if (res.ok) {
            const data = await res.json();
            console.log('📦 RAW API DATA:', JSON.stringify(data, null, 2));
            
            // Extract status like the engine does
            let rawStatus = null;
            if (Array.isArray(data) && data.length > 0) rawStatus = data[data.length - 1].status;
            else if (data?.data && Array.isArray(data.data) && data.data.length > 0) rawStatus = data.data[data.data.length - 1].status;
            
            console.log(`🔍 Extracted Raw Status: "${rawStatus}"`);
            
            const erpStatus = applyMap(maps, 'Leopards', rawStatus);
            console.log(`🎯 Resulting ERP Status: "${erpStatus || '❌ NO MAPPING FOUND'}"`);
        } else {
            const text = await res.text();
            console.error(`❌ API Request Failed: ${text}`);
        }
    } catch (e) {
        console.error(`❌ Connection Crash: ${e.message}`);
    }
}

auditInstaworld();
