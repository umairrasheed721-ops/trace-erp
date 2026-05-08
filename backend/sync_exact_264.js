const db = require('./db');
const { syncSpecificCourierOrders } = require('./engines/tracking');

async function syncExact264() {
    console.log('🚀 --- ULTRA-TARGETED SYNC: ACTIVE PIPELINE ONLY ---');
    
    const store = db.prepare('SELECT * FROM stores WHERE id = 1').get();
    
    // 🛡️ ULTRA-TARGETED: Only sync orders that are ALREADY with the courier (Not Booked/Pending)
    const finalStatuses = ['delivered', 'return received', 'returned', 'cancelled', 'void', 'voided', 'booked', 'pending'];
    const orders = db.prepare(`
        SELECT id FROM orders 
        WHERE store_id = 1
        AND tracking_number IS NOT NULL AND tracking_number != '' AND tracking_number != '—'
        AND LOWER(delivery_status) NOT IN (${finalStatuses.map(() => '?').join(',')})
    `).all(...finalStatuses);

    console.log(`📡 Found ${orders.length} parcels actively moving with the courier. Syncing...`);

    if (orders.length === 0) return console.log('✅ No actively moving parcels found.');

    const orderIds = orders.map(o => o.id);
    const updatedCount = await syncSpecificCourierOrders(store, orderIds, (p, t, msg) => {
        console.log(`⏳ Progress: ${p}/${t} - ${msg}`);
    });

    console.log(`✅ ULTRA-TARGETED SYNC COMPLETE! Updated: ${updatedCount}`);
}

syncExact264().catch(console.error);
