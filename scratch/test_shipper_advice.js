const path = require('path');
const { db } = require(path.resolve(__dirname, '../backend/db'));

try {
  const store_id = 1;
  const blacklistSet = new Set(
    db.prepare('SELECT tracking_number FROM blacklist WHERE store_id = ?').all(store_id).map(r => r.tracking_number)
  );

  const orders = db.prepare(`
    SELECT id, ref_number, tracking_number, customer_name, phone, address, city, 
           delivery_status, courier_status, notes, price, product_titles, line_items, courier, 
           COALESCE(failed_attempts, 0) as failed_attempts, status_date, order_date
    FROM orders 
    WHERE store_id = ?
    AND tracking_number IS NOT NULL AND tracking_number != '' AND tracking_number != '—'
    AND LOWER(COALESCE(courier_status, '')) NOT IN ('delivered', 'return received', 'returned', 'rto received')
    AND LOWER(COALESCE(delivery_status, '')) NOT IN ('delivered', 'return received', 'returned')
    AND datetime(COALESCE(status_date, order_date)) >= datetime('now', '-45 days')
    ORDER BY COALESCE(status_date, order_date) DESC
  `).all(store_id);

  console.log(`✅ [Option C Test] Active orders in last 45 days: ${orders.length}`);
  orders.forEach(o => {
    console.log(`- #${o.ref_number} | Tracking: ${o.tracking_number} | Date: ${o.order_date || o.status_date} | Status: ${o.courier_status}`);
  });
} catch (e) {
  console.error('❌ Error:', e.message);
}
