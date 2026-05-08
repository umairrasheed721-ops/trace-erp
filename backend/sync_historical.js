const db = require('./db');
const { syncSpecificCourierOrders } = require('./engines/tracking');

async function historicalDeepSync() {
    console.log('🚀 --- 30-DAY HISTORICAL DEEP SYNC ---');
    
    const store = db.prepare('SELECT * FROM stores WHERE id = 1').get();
    
    // 🛡️ HISTORICAL QUERY: Sync ALL non-PostEx orders from the last 30 days, even if Delivered/Returned
    const orders = db.prepare(`
        SELECT id FROM orders 
        WHERE store_id = 1
        AND tracking_number IS NOT NULL AND tracking_number != '' AND tracking_number != '—'
        AND LOWER(courier) NOT LIKE '%postex%'
        AND (status_date > datetime('now', '-30 days') OR order_date > datetime('now', '-30 days'))
    `).all();

    console.log(`📡 Found ${orders.length} historical parcels to refresh. Syncing...`);

    if (orders.length === 0) return console.log('✅ No historical parcels found.');

    const orderIds = orders.map(o => o.id);
    const updatedCount = await syncSpecificCourierOrders(store, orderIds, (p, t, msg) => {
        if (p % 20 === 0 || p === t) console.log(`⏳ Progress: ${p}/${t} - ${msg}`);
    });

    console.log(`✅ HISTORICAL SYNC COMPLETE! Updated: ${updatedCount}`);
}

historicalDeepSync().catch(console.error);
