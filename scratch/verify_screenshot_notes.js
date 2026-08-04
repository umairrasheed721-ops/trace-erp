const path = require('path');
const db = require(path.resolve(__dirname, '../backend/db'));

async function verifyNotesFilter() {
  try {
    db.prepare(`DELETE FROM orders WHERE tracking_number IN ('27120050025344', '221200568', '2912005554', 'FRESH_999')`).run();

    // Siraj Khan (notes: 'not ans')
    db.prepare(`
      INSERT INTO orders (store_id, shopify_order_id, ref_number, tracking_number, customer_name, delivery_status, courier_status, notes, failed_attempts, status_date, order_date)
      VALUES (1, '1001', 'AS1038', '27120050025344', 'Siraj Khan', 'Return Initiated', 'Return Process Initiated', 'not ans Order has been shipped via PostEx with Tracking 27120050025344.', 2, datetime('now'), datetime('now'))
    `).run();

    // Waleed Ahmed (notes: 'confirm')
    db.prepare(`
      INSERT INTO orders (store_id, shopify_order_id, ref_number, tracking_number, customer_name, delivery_status, courier_status, notes, failed_attempts, status_date, order_date)
      VALUES (1, '1002', 'AS1039', '221200568', 'Waleed Ahmed', 'Return Initiated', 'Return Process Initiated', 'confirm', 1, datetime('now'), datetime('now'))
    `).run();

    // Asad Ali (notes: 'confirm in wp')
    db.prepare(`
      INSERT INTO orders (store_id, shopify_order_id, ref_number, tracking_number, customer_name, delivery_status, courier_status, notes, failed_attempts, status_date, order_date)
      VALUES (1, '1003', 'AS1040', '2912005554', 'Asad Ali', 'Return Initiated', 'Return Process Initiated', 'confirm in wp', 1, datetime('now'), datetime('now'))
    `).run();

    // Fresh Parcel (no CS notes at all, only default shipping note)
    db.prepare(`
      INSERT INTO orders (store_id, shopify_order_id, ref_number, tracking_number, customer_name, delivery_status, courier_status, notes, failed_attempts, status_date, order_date)
      VALUES (1, '1004', 'AS1041', 'FRESH_999', 'Fresh Customer', 'Return Initiated', 'Return Process Initiated', 'Confirm Order has been shipped via PostEx with Tracking FRESH_999.', 1, datetime('now'), datetime('now'))
    `).run();

    // 1. TEST ADVICE ENDPOINT (TAB 3)
    const orders = db.prepare(`
      SELECT id, tracking_number, customer_name, delivery_status, notes, courier_status, COALESCE(failed_attempts, 0) as failed_attempts
      FROM orders WHERE store_id = 1 AND tracking_number IN ('27120050025344', '221200568', '2912005554', 'FRESH_999')
    `).all();

    const IGNORE_STATUSES = ['delivered', 'return received', 'paid', 'pending', 'cancelled', 'returned', 'return in transit', 'void', 'voided'];
    const tab3Orders = [];

    orders.forEach(o => {
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

      const cleanNoteText = notesLower
        .replace(/confirm order has been shipped via [^.]+\.?/gi, '')
        .replace(/\[shipper advice - [^\]]+\]/g, '')
        .trim();

      const hasCsNoteOrAdvice = cleanNoteText.length > 0 ||
                                notesLower.includes('[shipper advice') ||
                                notesLower.includes('merchant request') ||
                                deliveryStatusLower.includes('delivery under review') ||
                                deliveryStatusLower.includes('shipper advice') ||
                                deliveryStatusLower.includes('under review') ||
                                courierStatusLower.includes('delivery under review') ||
                                courierStatusLower.includes('shipper advice') ||
                                courierStatusLower.includes('under review') ||
                                courierStatusLower.includes('merchant request') ||
                                courierStatusLower.includes('reattempt') ||
                                courierStatusLower.includes('re-attempt');

      if (isInitialReturnInitiated && !hasCsNoteOrAdvice && !isReattemptRequested) {
        o.advice_category = 'immediate_return';
        tab3Orders.push(o);
      }
    });

    console.log(`📌 TAB 3 (⚡ 1st Attempt Immediate Return): Count = ${tab3Orders.length}`);
    tab3Orders.forEach(o => console.log(`   👉 ${o.tracking_number} (${o.customer_name}) -> category: ${o.advice_category}`));

    // 2. TEST REATTEMPTS ENDPOINT (TAB 4)
    const rawReattempts = db.prepare(`
      SELECT tracking_number, customer_name, notes
      FROM orders WHERE store_id = 1
      AND (
        LOWER(delivery_status) = 'reattempt requested'
        OR LOWER(courier_status) LIKE '%merchant request%'
        OR LOWER(courier_status) LIKE '%reattempt%'
        OR LOWER(courier_status) LIKE '%re-attempt%'
        OR notes LIKE '%[Shipper Advice%'
        OR (
          (LOWER(delivery_status) LIKE '%return initiated%' OR LOWER(courier_status) LIKE '%return process%' OR LOWER(courier_status) LIKE '%return initiated%')
          AND notes IS NOT NULL 
          AND TRIM(notes) != ''
          AND LOWER(notes) NOT LIKE 'confirm order has been shipped%'
        )
      )
      AND tracking_number IN ('27120050025344', '221200568', '2912005554', 'FRESH_999')
    `).all();

    console.log(`\n📌 TAB 4 (🔄 Reattempts Sent): Count = ${rawReattempts.length}`);
    rawReattempts.forEach(o => console.log(`   👉 ${o.tracking_number} (${o.customer_name}) -> notes: "${o.notes}"`));

    // Cleanup
    db.prepare(`DELETE FROM orders WHERE tracking_number IN ('27120050025344', '221200568', '2912005554', 'FRESH_999')`).run();

  } catch (err) {
    console.error('Test Error:', err);
  }
}

verifyNotesFilter();
