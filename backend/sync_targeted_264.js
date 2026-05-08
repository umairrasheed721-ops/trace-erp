const db = require('./db');
const { syncSpecificCourierOrders } = require('./engines/tracking');

async function syncTargeted264() {
    console.log('🚀 --- TARGETED SYNC: THE ACTIVE 264 ---');
    
    const store = db.prepare('SELECT * FROM stores WHERE id = 1').get();
    
    // 🛡️ TARGETED QUERY: Only sync orders from the LAST 48 HOURS that are NOT in a final status
    const finalStatuses = ['delivered', 'return received', 'returned', 'cancelled', 'void', 'voided'];
    const orders = db.prepare(`
        SELECT id FROM orders 
        WHERE store_id = 1
        AND tracking_number IS NOT NULL AND tracking_number != '' AND tracking_number != '—'
        AND LOWER(delivery_status) NOT IN (${finalStatuses.map(() => '?').join(',')})
        AND (status_date > datetime('now', '-48 hours') OR order_date > datetime('now', '-48 hours') OR created_timestamp > datetime('now', '-48 hours'))
    `).all(...finalStatuses);

    console.log(`📡 Found ${orders.length} active parcels from the last 48 hours. Syncing...`);

    if (orders.length === 0) return console.log('✅ No recently active parcels found.');

    const orderIds = orders.map(o => o.id);
    const updatedCount = await syncSpecificCourierOrders(store, orderIds, (p, t, msg) => {
        if (p % 10 === 0 || p === t) console.log(`⏳ Progress: ${p}/${t} - ${msg}`);
    });

    console.log(`✅ TARGETED SYNC COMPLETE! Updated: ${updatedCount}`);
}

syncTargeted264().catch(console.error);
