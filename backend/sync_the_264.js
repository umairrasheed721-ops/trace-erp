const db = require('./db');
const { syncSpecificCourierOrders } = require('./engines/tracking');

async function syncThe264() {
    console.log('🚀 --- FINAL MISSION: SYNCING THE 264 ---');
    
    const store = db.prepare('SELECT * FROM stores WHERE id = 1').get();
    
    // 🛡️ REFINED: Get the TOP 264 most recent pending orders
    const finalStatuses = ['delivered', 'return received', 'returned', 'cancelled', 'void', 'voided'];
    const orders = db.prepare(`
        SELECT id FROM orders 
        WHERE store_id = 1
        AND tracking_number IS NOT NULL AND tracking_number != '' AND tracking_number != '—'
        AND LOWER(delivery_status) NOT IN (${finalStatuses.map(() => '?').join(',')})
        ORDER BY order_date DESC
        LIMIT 264
    `).all(...finalStatuses);

    console.log(`📡 Found ${orders.length} orders. Starting the exact 264 sync...`);

    const orderIds = orders.map(o => o.id);
    const updatedCount = await syncSpecificCourierOrders(store, orderIds, (p, t, msg) => {
        if (p % 20 === 0 || p === t) console.log(`⏳ Progress: ${p}/${t} - ${msg}`);
    });

    console.log(`✅ MISSION COMPLETE! Updated: ${updatedCount}`);
}

syncThe264().catch(console.error);
