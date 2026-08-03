const path = require('path');
const db = require(path.resolve(__dirname, '../backend/db'));

async function runTest() {
  try {
    // 1. Clean up test rows
    db.prepare(`DELETE FROM orders WHERE tracking_number LIKE 'TEST_TAB%'`).run();

    // Insert Case A: 1st Attempt Immediate Return (No CS advice sent yet)
    db.prepare(`
      INSERT INTO orders (store_id, shopify_order_id, ref_number, tracking_number, customer_name, delivery_status, courier_status, notes, failed_attempts, status_date, order_date)
      VALUES (1, '90001', 'TAB3_001', 'TEST_TAB3_001', 'Customer A', 'Return Initiated', 'Return Process Initiated', 'confirm', 1, datetime('now'), datetime('now'))
    `).run();

    // Insert Case B: Advice Ignored (CS SENT reattempt advice, but courier ignored it)
    db.prepare(`
      INSERT INTO orders (store_id, shopify_order_id, ref_number, tracking_number, customer_name, delivery_status, courier_status, notes, failed_attempts, status_date, order_date)
      VALUES (1, '90002', 'TAB4_001', 'TEST_TAB4_001', 'Customer B', 'Return Initiated', 'Return Process Initiated', '[Shipper Advice - Reattempt Requested] Call customer before delivery', 1, datetime('now'), datetime('now'))
    `).run();

    // Insert Case C: Progressed to Return In Transit
    db.prepare(`
      INSERT INTO orders (store_id, shopify_order_id, ref_number, tracking_number, customer_name, delivery_status, courier_status, notes, failed_attempts, status_date, order_date)
      VALUES (1, '90003', 'TRANSIT_001', 'TEST_TRANSIT_001', 'Customer C', 'Return In Transit', 'Return in transit to LHE', 'confirm', 1, datetime('now'), datetime('now'))
    `).run();

    // Execute Advice Endpoint Logic (Tab 3)
    const adviceList = db.prepare(`
      SELECT tracking_number, delivery_status, courier_status, notes, COALESCE(failed_attempts, 0) as failed_attempts
      FROM orders WHERE store_id = 1 AND tracking_number LIKE 'TEST_TAB%'
    `).all();

    const IGNORE_STATUSES = ['delivered', 'return received', 'paid', 'pending', 'cancelled', 'returned', 'return in transit', 'void', 'voided'];

    const tab3Orders = [];
    adviceList.forEach(o => {
      const deliveryStatusLower = (o.delivery_status || '').toLowerCase().trim();
      const courierStatusLower = (o.courier_status || '').toLowerCase().trim();
      const notesLower = (o.notes || '').toLowerCase().trim();

      const isReattemptRequested = deliveryStatusLower.includes('reattempt requested') ||
                                   courierStatusLower.includes('merchant request') ||
                                   courierStatusLower.includes('reattempt') ||
                                   courierStatusLower.includes('re-attempt');

      if (IGNORE_STATUSES.includes(deliveryStatusLower)) return;

      const isPastReturnProcess = courierStatusLower.includes('return to ') ||
                                 courierStatusLower.includes('return in transit') ||
                                 courierStatusLower.includes('returned') ||
                                 deliveryStatusLower.includes('returned') ||
                                 deliveryStatusLower.includes('return in transit');

      const isInitialReturnInitiated = (deliveryStatusLower.includes('return initiated') ||
                                        deliveryStatusLower.includes('return process') ||
                                        courierStatusLower.includes('return initiated') ||
                                        courierStatusLower.includes('return process')) &&
                                       !isPastReturnProcess;

      if (isInitialReturnInitiated && !isReattemptRequested && !notesLower.includes('[shipper advice')) {
        o.advice_category = 'immediate_return';
        tab3Orders.push(o);
      }
    });

    console.log('📌 TAB 3 (⚡ 1st Attempt Immediate Return - No CS Advice Sent Yet) Results:');
    console.log(JSON.stringify(tab3Orders, null, 2));

    // Execute Reattempts Endpoint Logic (Tab 4)
    const reattemptList = db.prepare(`
      SELECT tracking_number, delivery_status, courier_status, notes
      FROM orders WHERE store_id = 1
      AND (
        LOWER(delivery_status) = 'reattempt requested'
        OR LOWER(courier_status) LIKE '%merchant request%'
        OR LOWER(courier_status) LIKE '%reattempt%'
        OR LOWER(courier_status) LIKE '%re-attempt%'
        OR notes LIKE '%[Shipper Advice%'
      )
      AND tracking_number LIKE 'TEST_TAB%'
    `).all();

    console.log('\n📌 TAB 4 (🔄 Reattempts Sent - CS Advice WAS Sent) Results:');
    console.log(JSON.stringify(reattemptList, null, 2));

    // Clean up
    db.prepare(`DELETE FROM orders WHERE tracking_number LIKE 'TEST_TAB%'`).run();
    console.log('\n🧹 Cleaned up test records.');

  } catch (err) {
    console.error('Test Error:', err);
  }
}

runTest();
