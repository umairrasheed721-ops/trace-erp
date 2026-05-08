const db = require('./db');
const { syncSpecificCourierOrders } = require('./engines/tracking');

const trackings = [
    'LE7530274515',
    'LE7530274513',
    'LE7530274514',
    'LE7530338726',
    '402001',
    'LE7530338720',
    'LE7530382473',
    'LE7530339828'
];

async function forensicAudit() {
    console.log('🧪 --- FORENSIC AUDIT: INSTAWORLD PIPELINE ---');
    
    const store = db.prepare('SELECT * FROM stores WHERE id = 1').get();
    
    for (const tNum of trackings) {
        console.log(`\n📡 Probing ${tNum}...`);
        const order = db.prepare("SELECT id, delivery_status, courier_status FROM orders WHERE tracking_number = ?").get(tNum);
        
        if (!order) {
            console.log(`❌ Order ${tNum} NOT FOUND in DB.`);
            continue;
        }

        console.log(`   [Current DB] Status: ${order.delivery_status}, Courier: ${order.courier_status || '-'}`);
        
        const count = await syncSpecificCourierOrders(store, [order.id], (p, t, msg) => {});
        
        const updated = db.prepare("SELECT delivery_status, courier_status FROM orders WHERE id = ?").get(order.id);
        console.log(`   [API Response] Updated Status: ${updated.delivery_status}, Courier: ${updated.courier_status || '-'}`);
    }
    
    console.log('\n✅ FORENSIC AUDIT COMPLETE.');
}

forensicAudit().catch(console.error);
