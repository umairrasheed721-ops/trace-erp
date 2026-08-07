const path = require('path');
const { db } = require(path.resolve(__dirname, '../backend/db'));

try {
  const rows = db.prepare(`
    SELECT id, store_id, ref_number, tracking_number, customer_name, delivery_status, courier_status, status_date, order_date, notes
    FROM orders
    WHERE customer_name LIKE '%Sohaib%' OR customer_name LIKE '%samraiz%' OR tracking_number LIKE '22334032778268%'
  `).all();

  console.log(`📌 Found ${rows.length} order(s):`);
  rows.forEach(r => {
    console.log({
      id: r.id,
      store_id: r.store_id,
      ref_number: r.ref_number,
      tracking_number: r.tracking_number,
      customer_name: r.customer_name,
      delivery_status: r.delivery_status,
      courier_status: r.courier_status,
      status_date: r.status_date,
      order_date: r.order_date,
      notes: r.notes
    });
  });
} catch (e) {
  console.error('Error:', e.message);
}
