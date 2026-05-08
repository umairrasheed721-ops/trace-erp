const db = require('./db');
const { syncSpecificCourierOrders } = require('./engines/tracking');

const trackings = [
    'LE7531953710',
    'LE7530341170',
    'LE7530342381',
    'LE7532033074',
    'LE7530384423',
    'LE7530274520'
];

async function liveProbe() {
    console.log('🧪 --- LIVE PROBE: LEOPARDS BACKLOG ---');
    
    const store = db.prepare('SELECT * FROM stores WHERE id = 1').get();
    
    for (const tNum of trackings) {
        console.log(`\n📡 Probing ${tNum}...`);
        const order = db.prepare("SELECT id, delivery_status, courier_status FROM orders WHERE tracking_number = ?").get(tNum);
        
        if (!order) {
            console.log(`❌ Order ${tNum} NOT FOUND.`);
            continue;
        }

        const count = await syncSpecificCourierOrders(store, [order.id], (p, t, msg) => {});
        
        const updated = db.prepare("SELECT delivery_status, courier_status FROM orders WHERE id = ?").get(order.id);
        console.log(`   [Result] ERP: ${updated.delivery_status}, Courier: ${updated.courier_status || '-'}`);
    }
    
    console.log('\n✅ LIVE PROBE COMPLETE.');
}

liveProbe().catch(console.error);
