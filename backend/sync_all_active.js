const db = require('./db');
const { syncSpecificCourierOrders } = require('./engines/tracking');

async function syncAllActive() {
    console.log('🚀 --- BULK SYNC: ALL ACTIVE PARCELS ---');
    
    // 1. Get Store
    const store = db.prepare('SELECT * FROM stores WHERE id = 1').get();
    
    // 2. Find All 'In Transit' or 'Booked' orders with tracking numbers
    const orders = db.prepare(`
        SELECT id FROM orders 
        WHERE (delivery_status = 'In Transit' OR delivery_status = 'Booked') 
        AND tracking_number IS NOT NULL 
        AND tracking_number != ''
    `).all();

    if (orders.length === 0) {
        return console.log('✅ No active parcels found to sync.');
    }

    const orderIds = orders.map(o => o.id);
    console.log(`📡 Found ${orderIds.length} parcels. Starting bulk sync...`);

    const updatedCount = await syncSpecificCourierOrders(store, orderIds, (processed, total, msg) => {
        if (processed % 10 === 0 || processed === total) {
            console.log(`⏳ Progress: ${processed}/${total} - ${msg}`);
        }
    });

    console.log(`✅ BULK SYNC COMPLETE!`);
    console.log(`📦 Total Updated: ${updatedCount} orders.`);
}

syncAllActive().catch(err => {
    console.error('❌ Bulk Sync Failed:', err);
});
