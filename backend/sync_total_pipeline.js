const db = require('./db');
const { syncSpecificCourierOrders } = require('./engines/tracking');

async function syncEntirePipeline() {
    console.log('🚀 --- TOTAL PIPELINE REFRESH ---');
    
    // 1. Get Store
    const store = db.prepare('SELECT * FROM stores WHERE id = 1').get();
    
    // 2. Find ALL orders with a tracking number that are NOT in a final status
    const finalStatuses = ['delivered', 'return received', 'cancelled', 'returned'];
    const orders = db.prepare(`
        SELECT id FROM orders 
        WHERE tracking_number IS NOT NULL 
        AND tracking_number != ''
        AND LOWER(delivery_status) NOT IN (${finalStatuses.map(() => '?').join(',')})
    `).all(...finalStatuses);

    if (orders.length === 0) {
        return console.log('✅ No active pipeline parcels found.');
    }

    const orderIds = orders.map(o => o.id);
    console.log(`📡 Found ${orderIds.length} active parcels in the pipeline. Syncing everything...`);

    const updatedCount = await syncSpecificCourierOrders(store, orderIds, (processed, total, msg) => {
        if (processed % 20 === 0 || processed === total) {
            console.log(`⏳ Progress: ${processed}/${total} - ${msg}`);
        }
    });

    console.log(`✅ TOTAL PIPELINE REFRESH COMPLETE!`);
    console.log(`📦 Total Updated: ${updatedCount} orders.`);
}

syncEntirePipeline().catch(err => {
    console.error('❌ Pipeline Sync Failed:', err);
});
