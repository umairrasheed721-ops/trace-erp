const path = require('path');
const db = require(path.resolve(__dirname, '../backend/db'));

try {
  // Check store IDs and count of orders per store
  const storeCounts = db.prepare(`
    SELECT store_id, COUNT(*) as cnt 
    FROM orders 
    GROUP BY store_id
  `).all();
  console.log('📊 Store IDs in DB:', storeCounts);

  // Check sample date formats and order count for July 2026 across all stores
  const julyOrders = db.prepare(`
    SELECT store_id, id, ref_number, tracking_number, customer_name, delivery_status, courier, courier_status, order_date, created_timestamp
    FROM orders
    WHERE order_date LIKE '2026-07%' OR created_timestamp LIKE '2026-07%'
  `).all();

  console.log(`\n📌 Found ${julyOrders.length} orders matching July 2026 across all stores.`);

  const storeJulyMap = {};
  julyOrders.forEach(o => {
    storeJulyMap[o.store_id] = (storeJulyMap[o.store_id] || 0) + 1;
  });
  console.log('July 2026 count by store_id:', storeJulyMap);

  // Print all distinct delivery_status for July 2026 per store
  const statusByStore = {};
  julyOrders.forEach(o => {
    if (!statusByStore[o.store_id]) statusByStore[o.store_id] = {};
    const st = (o.delivery_status || 'NULL').trim();
    statusByStore[o.store_id][st] = (statusByStore[o.store_id][st] || 0) + 1;
  });
  console.log('\n📊 Delivery status breakdown by store for July 2026:', JSON.stringify(statusByStore, null, 2));

} catch (e) {
  console.error('Error:', e);
}
