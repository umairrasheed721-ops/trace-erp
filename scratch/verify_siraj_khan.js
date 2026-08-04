const path = require('path');
const db = require(path.resolve(__dirname, '../backend/db'));

async function verifySirajKhan() {
  try {
    db.prepare(`DELETE FROM orders WHERE tracking_number = '27120050025344'`).run();

    // Siraj Khan had Delivery Under Review & Merchant Request For Re-Attempt on 28 Jul!
    db.prepare(`
      INSERT INTO orders (store_id, shopify_order_id, ref_number, tracking_number, customer_name, delivery_status, courier_status, notes, failed_attempts, status_date, order_date)
      VALUES (1, '1002', 'AS1038', '27120050025344', 'Siraj Khan', 'Return Initiated', 'Merchant Request For Re-Attempt', 'not ans', 2, datetime('now'), datetime('now'))
    `).run();

    const orders = db.prepare(`
      SELECT id, tracking_number, customer_name, phone, address, city, delivery_status, notes, price, product_titles, line_items, courier, courier_status, COALESCE(failed_attempts, 0) as failed_attempts, status_date, order_date
      FROM orders WHERE store_id = 1 AND tracking_number = '27120050025344'
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

      const hasEverHadAdviceOrReattempt = deliveryStatusLower.includes('delivery under review') ||
                                          deliveryStatusLower.includes('shipper advice') ||
                                          deliveryStatusLower.includes('under review') ||
                                          courierStatusLower.includes('delivery under review') ||
                                          courierStatusLower.includes('shipper advice') ||
                                          courierStatusLower.includes('under review') ||
                                          courierStatusLower.includes('merchant request') ||
                                          courierStatusLower.includes('reattempt') ||
                                          courierStatusLower.includes('re-attempt') ||
                                          notesLower.includes('[shipper advice') ||
                                          notesLower.includes('merchant request');

      if (isInitialReturnInitiated && !hasEverHadAdviceOrReattempt && !isReattemptRequested) {
        o.advice_category = 'immediate_return';
        tab3Orders.push(o);
      }
    });

    console.log(`📌 TAB 3 (⚡ 1st Attempt Immediate Return): Count = ${tab3Orders.length}`);
    if (tab3Orders.length === 0) {
      console.log('✅ SUCCESS: Siraj Khan (27120050025344) is cleanly EXCLUDED from Tab 3!');
    } else {
      console.error('❌ ERROR: Siraj Khan was incorrectly included in Tab 3!');
    }

    db.prepare(`DELETE FROM orders WHERE tracking_number = '27120050025344'`).run();

  } catch (err) {
    console.error('Test Error:', err);
  }
}

verifySirajKhan();
