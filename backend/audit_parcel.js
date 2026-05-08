const db = require('./db');
const { syncSpecificCourierOrders } = require('./engines/tracking');

async function auditSpecificParcel(tNum) {
    console.log(`🔍 --- DEEP AUDIT: ${tNum} ---`);
    
    // 1. Check current DB state
    const order = db.prepare("SELECT id, delivery_status, courier_status, courier FROM orders WHERE tracking_number = ?").get(tNum);
    if (!order) return console.error('❌ Order not found in DB');
    console.log('📦 CURRENT DB STATE:', order);

    // 2. Run sync for this parcel
    const store = db.prepare('SELECT * FROM stores WHERE id = 1').get();
    console.log(`📡 Probing API for ${tNum}...`);
    
    const count = await syncSpecificCourierOrders(store, [order.id], (p, t, msg) => {
        console.log(`⏳ Progress: ${p}/${t} - ${msg}`);
    });

    // 3. Check final DB state
    const final = db.prepare("SELECT id, delivery_status, courier_status, courier FROM orders WHERE id = ?").get(order.id);
    console.log('✅ SYNC FINISHED. Updated count:', count);
    console.log('📦 FINAL DB STATE:', final);
}

auditSpecificParcel('173012441589').catch(console.error);
