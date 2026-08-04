const path = require('path');
const db = require(path.resolve(__dirname, '../backend/db'));

try {
  const trackings = [
    '27120050025663', // TR33403
    '23120050025658', // TR33424
    '24120050025640', // AS1058
    '26120050025624', // TR33415
    '24120050025623', // AS1036
    '27120050025608', // TR33368
    '24120050025601', // TR33375
    '29120050025572', // TR33101
    '26120050025560', // TR33344
    '29120050025419'  // TR33193
  ];

  const orders = db.prepare(`
    SELECT id, ref_number, tracking_number, customer_name, phone, address, city, delivery_status, notes, price, product_titles, line_items, courier, courier_status, COALESCE(failed_attempts, 0) as failed_attempts, status_date, order_date
    FROM orders
    WHERE tracking_number IN (${trackings.map(() => '?').join(',')})
  `).all(...trackings);

  console.log(`📌 Found ${orders.length} order(s) in DB matching the 10 trackings:`);
  
  orders.forEach(o => {
    const deliveryStatusLower = (o.delivery_status || '').toLowerCase().trim();
    const courierStatusLower = (o.courier_status || '').toLowerCase().trim();
    const notesLower = (o.notes || '').toLowerCase().trim();
    const combinedStatus = `${deliveryStatusLower} ${courierStatusLower}`;

    const isReattemptRequested = deliveryStatusLower.includes('reattempt requested') ||
                                 courierStatusLower.includes('merchant request') ||
                                 courierStatusLower.includes('reattempt') ||
                                 courierStatusLower.includes('re-attempt');

    const isPastReturnProcess = courierStatusLower.includes('return to ') ||
                               courierStatusLower.includes('return in transit') ||
                               courierStatusLower.includes('returned') ||
                               courierStatusLower.includes('at origin') ||
                               courierStatusLower.includes('en route') ||
                               courierStatusLower.includes('enroute') ||
                               courierStatusLower.includes('transit hub') ||
                               courierStatusLower.includes('departed') ||
                               courierStatusLower.includes('merchant warehouse') ||
                               deliveryStatusLower.includes('returned') ||
                               deliveryStatusLower.includes('return in transit');

    const isExplicitAdviceRequired = deliveryStatusLower.includes('delivery under review') ||
                                     deliveryStatusLower.includes('shipper advice') ||
                                     deliveryStatusLower.includes('under review') ||
                                     courierStatusLower.includes('delivery under review') ||
                                     courierStatusLower.includes('shipper advice') ||
                                     courierStatusLower.includes('under review') ||
                                     courierStatusLower.includes('postex advice');

    console.log(`\nOrder ${o.ref_number} (${o.tracking_number}):`);
    console.log(` - delivery_status: '${o.delivery_status}'`);
    console.log(` - courier_status:  '${o.courier_status}'`);
    console.log(` - isExplicitAdviceRequired: ${isExplicitAdviceRequired}`);
    console.log(` - isReattemptRequested:    ${isReattemptRequested}`);
    console.log(` - isPastReturnProcess:     ${isPastReturnProcess}`);
  });

} catch (e) {
  console.error('Error:', e);
}
