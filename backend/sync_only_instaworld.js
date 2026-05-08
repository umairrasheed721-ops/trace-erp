const db = require('./db');
const { syncSpecificCourierOrders } = require('./engines/tracking');

async function syncOnlyInstaworld() {
    console.log('🚀 --- DEDICATED INSTAWORLD SYNC (TCS, LCS, Leopards) ---');
    
    const store = db.prepare('SELECT * FROM stores WHERE id = 1').get();
    
    // 🛡️ REFINED QUERY: Get active orders that are NOT PostEx
    const finalStatuses = ['delivered', 'return received', 'returned', 'cancelled', 'void', 'voided'];
    const orders = db.prepare(`
        SELECT id FROM orders 
        WHERE store_id = 1
        AND tracking_number IS NOT NULL AND tracking_number != '' AND tracking_number != '—'
        AND LOWER(delivery_status) NOT IN (${finalStatuses.map(() => '?').join(',')})
        AND LOWER(courier) NOT LIKE '%postex%'
        AND (status_date > datetime('now', '-15 days') OR order_date > datetime('now', '-15 days'))
    `).all(...finalStatuses);

    console.log(`📡 Found ${orders.length} Instaworld-related parcels (TCS, LCS, Leopards) to sync...`);

    if (orders.length === 0) return console.log('✅ No active Instaworld parcels found.');

    const orderIds = orders.map(o => o.id);
    const updatedCount = await syncSpecificCourierOrders(store, orderIds, (p, t, msg) => {
        if (p % 10 === 0 || p === t) console.log(`⏳ Progress: ${p}/${t} - ${msg}`);
    });

    console.log(`✅ INSTAWORLD SYNC COMPLETE! Updated: ${updatedCount}`);
}

syncOnlyInstaworld().catch(console.error);
