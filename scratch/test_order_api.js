const path = require('path');
const db = require(path.resolve(__dirname, '../backend/db'));

try {
  // Insert temporary order AS1037 in local test DB
  db.prepare(`
    INSERT INTO orders (store_id, shopify_order_id, ref_number, tracking_number, customer_name, phone, address, city, delivery_status, notes, price, courier, status_date, order_date)
    VALUES (1, '9991037', 'AS1037', '22120050025574', 'Abid Ali', '03211440599', 'Dha Phase 9 P/o Kahna Nua Lahore', 'Lahore', 'Return Initiated', 'Confirm Order has been shipped via PostEx with Tracking 22120050025574.', 1800, 'PostEx', datetime('now'), datetime('now'))
  `).run();

  console.log('✅ Temporary order AS1037 inserted into DB for verification.');

  // Run the exact backend code from backend/routes/monitors.js
  const rawOrders = db.prepare(`
    SELECT id, ref_number, tracking_number, customer_name, phone, address, city, delivery_status, notes, price, product_titles, line_items, courier, courier_status, COALESCE(failed_attempts, 0) as failed_attempts, status_date, order_date
    FROM orders WHERE store_id = 1
    AND (
      LOWER(delivery_status) = 'reattempt requested'
      OR LOWER(delivery_status) LIKE '%return initiated%'
      OR LOWER(delivery_status) LIKE '%advice ignored%'
      OR LOWER(courier_status) LIKE '%merchant request%'
      OR LOWER(courier_status) LIKE '%reattempt%'
      OR LOWER(courier_status) LIKE '%re-attempt%'
      OR LOWER(courier_status) LIKE '%return process%'
      OR LOWER(courier_status) LIKE '%return initiated%'
      OR notes LIKE '%[Shipper Advice%'
    )
    AND datetime(COALESCE(status_date, order_date)) >= datetime('now', '-60 days')
    ORDER BY COALESCE(status_date, order_date) DESC
  `).all();

  console.log('Fetched Orders count:', rawOrders.length);

  const mapped = rawOrders.map(o => {
    const deliveryStatusLower = (o.delivery_status || '').toLowerCase().trim();
    const courierStatusLower = (o.courier_status || '').toLowerCase().trim();
    const notesLower = (o.notes || '').toLowerCase().trim();
    const combinedStatus = `${deliveryStatusLower} ${courierStatusLower}`;

    const isCsRequestedReturn = notesLower.includes('[shipper advice - return') || 
                                courierStatusLower.includes('merchant request for return');

    const isReturnInTransitOrFinal = deliveryStatusLower === 'returned' || 
                                     deliveryStatusLower.includes('return received') ||
                                     deliveryStatusLower.includes('return in transit') ||
                                     courierStatusLower.includes('return to ') ||
                                     courierStatusLower.includes('waiting for return') ||
                                     courierStatusLower.includes('arrived at transit hub');

    const isFreshReturnInitiated = (deliveryStatusLower === 'return initiated' || courierStatusLower.includes('return process initiated') || courierStatusLower.includes('return initiated')) && !isReturnInTransitOrFinal;

    let outcome = 'out_for_reattempt';
    let outcomeLabel = '🚚 Reattempt In Progress';

    if (deliveryStatusLower.includes('delivered') || deliveryStatusLower.includes('paid')) {
      outcome = 'delivered_post_advice';
      outcomeLabel = '🟢 Delivered Post-Advice';
    } else if (isCsRequestedReturn) {
      outcome = 'cs_requested_return';
      outcomeLabel = '📦 CS Confirmed Return';
    } else if (isFreshReturnInitiated) {
      outcome = 'return_initiated';
      outcomeLabel = '🚨 Advice Ignored -> Return Initiated';
    } else if (isReturnInTransitOrFinal || combinedStatus.includes('return') || combinedStatus.includes('rto')) {
      outcome = 'failed_rto';
      outcomeLabel = '🔴 Return In Transit / RTO';
    }

    return { ...o, outcome, outcomeLabel };
  });

  const found = mapped.find(o => o.ref_number === 'AS1037' || o.tracking_number === '22120050025574');
  console.log('RESULT FOR AS1037 / 22120050025574:');
  console.log(JSON.stringify(found, null, 2));

  // Cleanup test row
  db.prepare(`DELETE FROM orders WHERE ref_number = 'AS1037'`).run();
  console.log('Cleaned up test row.');
} catch (err) {
  console.error('Test Error:', err);
}
