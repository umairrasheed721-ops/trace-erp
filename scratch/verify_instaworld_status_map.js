const path = require('path');
const db = require(path.resolve(__dirname, '../backend/db'));
const { loadStatusMaps, applyMap } = require(path.resolve(__dirname, '../backend/engines/tracking/statusMapper'));

try {
  // 1. Verify status_mappings table
  const mapping = db.prepare(`
    SELECT courier, courier_status, erp_status, is_final 
    FROM status_mappings 
    WHERE LOWER(courier_status) LIKE '%return received at insta hub%'
  `).all();
  
  console.log('1. DB status_mappings check for "return received at insta hub":');
  console.log(JSON.stringify(mapping, null, 2));

  // 2. Test applyMap function directly
  const statusMap = loadStatusMaps();
  const resultInsta = applyMap(statusMap, 'Instaworld', 'return received at insta hub');
  const resultAll = applyMap(statusMap, 'all', 'return received at insta hub');
  const resultCase = applyMap(statusMap, 'Instaworld', 'Return Received At Insta Hub');

  console.log('\n2. applyMap() Function Output Verification:');
  console.log('Instaworld + "return received at insta hub" -> ERP Status:', resultInsta);
  console.log('all + "return received at insta hub" -> ERP Status:', resultAll);
  console.log('Case-insensitive test -> ERP Status:', resultCase);

  // 3. Test database orders check
  const affectedOrders = db.prepare(`
    SELECT id, ref_number, tracking_number, courier, courier_status, delivery_status 
    FROM orders 
    WHERE LOWER(courier_status) LIKE '%return received at insta hub%'
  `).all();

  console.log(`\n3. Database Orders with courier_status "return received at insta hub": (${affectedOrders.length} orders found)`);
  console.log(JSON.stringify(affectedOrders, null, 2));

} catch (e) {
  console.error('Verification Error:', e);
}
