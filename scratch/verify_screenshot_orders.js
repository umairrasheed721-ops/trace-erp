const path = require('path');
const db = require(path.resolve(__dirname, '../backend/db'));

async function verifyScreenshotOrders() {
  try {
    // Insert 3 orders matching the user's screenshot
    db.prepare(`DELETE FROM orders WHERE tracking_number IN ('22120050025537', '27120050025344', '28120050025459')`).run();

    // Saqib Hanif (No CS advice sent yet, notes: 'confirm')
    db.prepare(`
      INSERT INTO orders (store_id, shopify_order_id, ref_number, tracking_number, customer_name, delivery_status, courier_status, notes, failed_attempts, status_date, order_date)
      VALUES (1, '1001', 'AS1037', '22120050025537', 'Saqib Hanif', 'Return Initiated', 'Return Process Initiated', 'confirm', 1, datetime('now'), datetime('now'))
    `).run();

    // Siraj Khan (No CS advice sent yet, notes: 'not ans')
    db.prepare(`
      INSERT INTO orders (store_id, shopify_order_id, ref_number, tracking_number, customer_name, delivery_status, courier_status, notes, failed_attempts, status_date, order_date)
      VALUES (1, '1002', 'AS1038', '27120050025344', 'Siraj Khan', 'Return Initiated', 'Return Process Initiated', 'not ans', 1, datetime('now'), datetime('now'))
    `).run();

    // Esmat Khan (No CS advice sent yet, notes: 'rider nahi aya confirm')
    db.prepare(`
      INSERT INTO orders (store_id, shopify_order_id, ref_number, tracking_number, customer_name, delivery_status, courier_status, notes, failed_attempts, status_date, order_date)
      VALUES (1, '1003', 'AS1039', '28120050025459', 'Esmat Khan', 'Return Initiated', 'Return Process Initiated', 'rider nahi aya confirm', 1, datetime('now'), datetime('now'))
    `).run();

    // 1. TEST ADVICE ENDPOINT QUERY (TAB 3)
    const blacklistSet = new Set();
    const IGNORE_STATUSES = ['delivered', 'return received', 'paid', 'pending', 'cancelled', 'returned', 'return in transit', 'void', 'voided'];

    const orders = db.prepare(`
      SELECT id, tracking_number, customer_name, phone, address, city, delivery_status, notes, price, product_titles, line_items, courier, courier_status, COALESCE(failed_attempts, 0) as failed_attempts, status_date, order_date
      FROM orders WHERE store_id = 1 AND tracking_number IN ('22120050025537', '27120050025344', '28120050025459')
    `).all();

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

      if (isInitialReturnInitiated && !isReattemptRequested && !notesLower.includes('[shipper advice')) {
        o.advice_category = 'immediate_return';
        tab3Orders.push(o);
      }
    });

    console.log(`📌 TAB 3 (⚡ 1st Attempt Immediate Return): Count = ${tab3Orders.length}`);
    tab3Orders.forEach(o => console.log(`   👉 ${o.tracking_number} (${o.customer_name}) -> category: ${o.advice_category}`));

    // 2. TEST REATTEMPTS ENDPOINT QUERY (TAB 4)
    const rawReattempts = db.prepare(`
      SELECT id, ref_number, tracking_number, customer_name, notes
      FROM orders WHERE store_id = 1
      AND (
        LOWER(delivery_status) = 'reattempt requested'
        OR LOWER(courier_status) LIKE '%merchant request%'
        OR LOWER(courier_status) LIKE '%reattempt%'
        OR LOWER(courier_status) LIKE '%re-attempt%'
        OR notes LIKE '%[Shipper Advice%'
      )
      AND tracking_number IN ('22120050025537', '27120050025344', '28120050025459')
    `).all();

    console.log(`\n📌 TAB 4 (🔄 Reattempts Sent): Count = ${rawReattempts.length}`);

    // Cleanup
    db.prepare(`DELETE FROM orders WHERE tracking_number IN ('22120050025537', '27120050025344', '28120050025459')`).run();

  } catch (err) {
    console.error('Error:', err);
  }
}

verifyScreenshotOrders();
