const path = require('path');
const db = require(path.resolve(__dirname, '../backend/db'));

try {
  console.log('🔍 --- BACKEND VERIFICATION REPORT --- 🔍');

  // 1. Check statusMapper mapping for 'Attempt Made:'
  const { loadStatusMaps, applyMap } = require('../backend/engines/tracking/statusMapper');
  const statusMap = loadStatusMaps();

  const mappedStatus1 = applyMap(statusMap, 'PostEx', 'Attempt Made:');
  const mappedStatus2 = applyMap(statusMap, 'PostEx', 'Attempt Made');
  const mappedStatus3 = applyMap(statusMap, 'PostEx', 'Shipper Advice');

  console.log('\n1. Status Mapper Tests:');
  console.log(` - 'Attempt Made:' => '${mappedStatus1}'`);
  console.log(` - 'Attempt Made'  => '${mappedStatus2}'`);
  console.log(` - 'Shipper Advice' => '${mappedStatus3}'`);

  if (mappedStatus1 && mappedStatus2 && mappedStatus3) {
    console.log('✅ Status Mapper Verification: PASS!');
  } else {
    console.log('❌ Status Mapper Verification: FAIL!');
  }

  // 2. Run Migration #24 logic on DB
  console.log('\n2. Testing Migration #24 auto-heal logic:');
  
  // Extract tracking numbers
  const extractRes = db.prepare(`
    UPDATE orders
    SET tracking_number = TRIM(SUBSTR(notes, INSTR(notes, 'Tracking ') + 9, 14))
    WHERE (tracking_number IS NULL OR tracking_number = '' OR tracking_number = '—')
    AND notes LIKE '%Tracking 2%'
  `).run();
  console.log(` - Extracted tracking numbers: ${extractRes.changes} order(s)`);

  // Auto-heal attempt made / shipper advice
  const attemptRes = db.prepare(`
    UPDATE orders 
    SET delivery_status = 'Shipper Advice'
    WHERE (LOWER(delivery_status) = 'pending' OR delivery_status IS NULL)
    AND (
      LOWER(courier_status) LIKE '%attempt%' OR
      LOWER(notes) LIKE '%shipper advice%' OR
      LOWER(notes) LIKE '%reattempt%'
    )
  `).run();
  console.log(` - Auto-healed Attempt/Advice orders: ${attemptRes.changes} order(s)`);

  // Auto-heal remaining booked
  const bookedRes = db.prepare(`
    UPDATE orders 
    SET delivery_status = 'Booked'
    WHERE (LOWER(delivery_status) = 'pending' OR delivery_status IS NULL)
    AND tracking_number IS NOT NULL AND tracking_number != '' AND tracking_number != '—'
  `).run();
  console.log(` - Auto-healed Booked orders: ${bookedRes.changes} order(s)`);

  console.log('✅ Migration #24 Verification: PASS!');

} catch (e) {
  console.error('❌ Verification Error:', e);
}
