const path = require('path');
const db = require(path.resolve(__dirname, '../backend/db'));
const { loadStatusMaps, applyMap } = require(path.resolve(__dirname, '../backend/engines/tracking/statusMapper'));

async function testTrackingIdMapping() {
  const testTrackingId = 'TEST_INSTA_HUB_999';
  
  try {
    // 1. Insert a mock order with courier_status = 'return received at insta hub'
    db.prepare(`DELETE FROM orders WHERE tracking_number = ?`).run(testTrackingId);

    db.prepare(`
      INSERT INTO orders (store_id, shopify_order_id, ref_number, tracking_number, customer_name, courier, courier_status, delivery_status, status_date)
      VALUES (1, '9999999', 'TEST999', ?, 'Test Customer', 'Instaworld', 'return received at insta hub', 'Pending', datetime('now'))
    `).run(testTrackingId);

    console.log(`📌 Created test order in DB with tracking: ${testTrackingId}`);
    console.log('Initial raw courier_status: "return received at insta hub"');

    // 2. Simulate status mapper execution (same code run by Instaworld tracking sync engine)
    const statusMap = loadStatusMaps();
    const erpStatus = applyMap(statusMap, 'Instaworld', 'return received at insta hub');

    db.prepare(`
      UPDATE orders 
      SET delivery_status = ?, status_date = datetime('now') 
      WHERE tracking_number = ?
    `).run(erpStatus, testTrackingId);

    // 3. Fetch from DB to verify the resulting record
    const updatedRecord = db.prepare(`
      SELECT tracking_number, courier, courier_status, delivery_status 
      FROM orders 
      WHERE tracking_number = ?
    `).get(testTrackingId);

    console.log('\n✅ [VERIFICATION RESULT FOR TRACKING ID]:');
    console.log(JSON.stringify(updatedRecord, null, 2));

    if (updatedRecord.delivery_status === 'Return In Transit') {
      console.log('\n🎉 SUCCESS: Tracking ID mapped to ERP Status: "Return In Transit"!');
    } else {
      console.error('\n❌ FAILURE: Expected "Return In Transit" but got:', updatedRecord.delivery_status);
    }

    // Clean up test order
    db.prepare(`DELETE FROM orders WHERE tracking_number = ?`).run(testTrackingId);
    console.log('🧹 Cleaned up test order from DB.');

  } catch (err) {
    console.error('Test error:', err);
  }
}

testTrackingIdMapping();
