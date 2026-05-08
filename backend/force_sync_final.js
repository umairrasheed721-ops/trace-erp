const db = require('./db');
const { syncSpecificCourierOrders } = require('./engines/tracking');

async function forceSync() {
    console.log('🚀 --- FORCING BACKGROUND SYNC FOR LE7530338720 ---');
    
    // 1. Get Store
    const store = db.prepare('SELECT * FROM stores WHERE id = 1').get();
    
    // 2. Find Order ID
    const order = db.prepare("SELECT id FROM orders WHERE tracking_number = 'LE7530338720'").get();
    if (!order) return console.error('❌ Order not found');

    console.log(`📡 Syncing Order ID: ${order.id}...`);
    const count = await syncSpecificCourierOrders(store, [order.id], (p, t, msg) => {
        console.log(`⏳ Progress: ${p}/${t} - ${msg}`);
    });

    console.log(`✅ Sync Complete. Updated ${count} orders.`);
    
    // 3. Final Verification
    const final = db.prepare("SELECT delivery_status, courier_status FROM orders WHERE id = ?").get(order.id);
    console.log('📦 FINAL DB STATE:', final);
}

forceSync();
