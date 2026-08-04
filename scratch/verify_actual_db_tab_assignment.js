const path = require('path');
const db = require(path.resolve(__dirname, '../backend/db'));

async function verifyActualOrdersInDb() {
  try {
    const stores = db.prepare('SELECT id, store_name FROM stores').all();
    if (!stores.length) {
      console.log('No stores in DB.');
      return;
    }

    const storeId = stores[0].id;
    console.log(`🔍 Checking Store ID: ${storeId} (${stores[0].store_name})`);

    // Fetch Advice Monitor Tab 3 (Immediate Return)
    const blacklistSet = new Set(
      db.prepare('SELECT tracking_number FROM blacklist WHERE store_id = ?').all(storeId).map(r => r.tracking_number)
    );

    const IGNORE_STATUSES = ['delivered', 'return received', 'paid', 'pending', 'cancelled', 'returned', 'return in transit', 'void', 'voided'];

    const orders = db.prepare(`
      SELECT id, tracking_number, customer_name, phone, address, city, delivery_status, notes, price, product_titles, courier, courier_status, COALESCE(failed_attempts, 0) as failed_attempts, status_date, order_date
      FROM orders WHERE store_id = ?
      AND tracking_number IS NOT NULL AND tracking_number != ''
    `).all(storeId);

    const tab3Orders = [];

    orders.forEach(o => {
      if (blacklistSet.has(o.tracking_number)) return;

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
                                 courierStatusLower.includes('at origin') ||
                                 courierStatusLower.includes('en route') ||
                                 courierStatusLower.includes('enroute') ||
                                 courierStatusLower.includes('transit hub') ||
                                 courierStatusLower.includes('departed') ||
                                 courierStatusLower.includes('merchant warehouse') ||
                                 deliveryStatusLower.includes('returned') ||
                                 deliveryStatusLower.includes('return in transit');

      const isInitialReturnInitiated = (deliveryStatusLower.includes('return initiated') ||
                                        deliveryStatusLower.includes('return process') ||
                                        courierStatusLower.includes('return initiated') ||
                                        courierStatusLower.includes('return process')) &&
                                       !isPastReturnProcess;

      if (isInitialReturnInitiated && !isReattemptRequested && !notesLower.includes('[shipper advice')) {
        tab3Orders.push(o);
      }
    });

    console.log(`\n✅ [TAB 3: ⚡ 1st Attempt Immediate Return] Total Count: ${tab3Orders.length}`);
    tab3Orders.forEach(o => {
      console.log(`  • Tracking: ${o.tracking_number} | Customer: ${o.customer_name} | Courier Status: "${o.courier_status}" | Notes: "${o.notes}"`);
    });

    // Fetch Advice Monitor Tab 4 (Reattempts Sent)
    const rawReattempts = db.prepare(`
      SELECT id, ref_number, tracking_number, customer_name, phone, address, city, delivery_status, notes, price, product_titles, courier, courier_status, COALESCE(failed_attempts, 0) as failed_attempts, status_date, order_date
      FROM orders WHERE store_id = ?
      AND (
        LOWER(delivery_status) = 'reattempt requested'
        OR LOWER(courier_status) LIKE '%merchant request%'
        OR LOWER(courier_status) LIKE '%reattempt%'
        OR LOWER(courier_status) LIKE '%re-attempt%'
        OR notes LIKE '%[Shipper Advice%'
      )
      AND datetime(COALESCE(status_date, order_date)) >= datetime('now', '-60 days')
      ORDER BY COALESCE(status_date, order_date) DESC
    `).all(storeId);

    const adviceIgnoredTab4 = [];
    rawReattempts.forEach(o => {
      const deliveryStatusLower = (o.delivery_status || '').toLowerCase().trim();
      const courierStatusLower = (o.courier_status || '').toLowerCase().trim();
      const notesLower = (o.notes || '').toLowerCase().trim();

      const isReturnInTransitOrFinal = deliveryStatusLower === 'returned' || 
                                       deliveryStatusLower.includes('return received') ||
                                       deliveryStatusLower.includes('return in transit') ||
                                       courierStatusLower.includes('return to ') ||
                                       courierStatusLower.includes('waiting for return') ||
                                       courierStatusLower.includes('arrived at transit hub');

      const isFreshReturnInitiated = (deliveryStatusLower === 'return initiated' || courierStatusLower.includes('return process initiated') || courierStatusLower.includes('return initiated')) && !isReturnInTransitOrFinal;

      if (isFreshReturnInitiated && notesLower.includes('[shipper advice')) {
        adviceIgnoredTab4.push(o);
      }
    });

    console.log(`\n✅ [TAB 4: 🔄 Reattempts Sent -> 🚨 Advice Ignored Sub-Pill] Total Count: ${adviceIgnoredTab4.length}`);
    adviceIgnoredTab4.forEach(o => {
      console.log(`  • Tracking: ${o.tracking_number} | Customer: ${o.customer_name} | Courier Status: "${o.courier_status}" | Notes: "${o.notes}"`);
    });

  } catch (err) {
    console.error('Error:', err);
  }
}

verifyActualOrdersInDb();
