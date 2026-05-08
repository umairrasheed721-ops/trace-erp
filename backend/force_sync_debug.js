const { syncSpecificCourierOrders, loadStatusMaps } = require('./engines/tracking');
const db = require('./db');

async function testSync() {
    console.log('🚀 Starting Targeted Debug Sync for LE7530338720...');
    
    // 1. Check Store
    const store = db.prepare('SELECT * FROM stores WHERE id = 1').get();
    if (!store) return console.error('❌ Store 1 not found');

    // 2. Perform Targeted Sync
    const order = db.prepare("SELECT id FROM orders WHERE tracking_number = 'LE7530338720'").get();
    if (!order) return console.error('❌ Order LE7530338720 not found in DB');

    console.log(`🔍 Found Order ID: ${order.id}. Syncing now...`);
    const count = await syncSpecificCourierOrders(store, [order.id]);
    console.log(`📊 Sync completed. Updated ${count} orders.`);

    // 3. Verify final DB state
    const final = db.prepare("SELECT delivery_status, courier_status, courier FROM orders WHERE id = ?").get(order.id);
    console.log('📦 Final DB State:', final);
}

testSync();
