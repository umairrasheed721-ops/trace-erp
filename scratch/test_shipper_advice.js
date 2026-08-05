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
    ORDER BY COALESCE(status_date, order_date) DESC
  `).all(store_id);

  console.log(`✅ Shipper Advice Query executed successfully! Found ${orders.length} active tracked orders for store ${store_id}.`);

  const ADVICE_COURIER_KEYWORDS = [
    'delivery under review',
    'shipper advice',
    'merchant request',
    'attempt made',
    'reattempt',
    're-attempt',
    'cna',
    'address incomplete',
    'consignee refused',
    'refused by customer',
    'consignee not available',
    'customer not answering',
    'wrong phone number',
    'out of service',
    'door closed',
    'customer requested open parcel',
    'consignee wants open parcel'
  ];

  const adviceRequired = [];
  const reattemptsSent = [];
  const returnsRequested = [];

  orders.forEach(o => {
    if (blacklistSet.has(o.tracking_number)) return;

    const courierStatusLower = (o.courier_status || '').toLowerCase().trim();
    const notesLower = (o.notes || '').toLowerCase().trim();
    const combinedFeed = `${courierStatusLower} ${notesLower}`;

    const isReattemptSent = notesLower.includes('[shipper advice - reattempt') || 
                            courierStatusLower.includes('reattempt requested') ||
                            courierStatusLower.includes('re-attempt requested');

    const isReturnRequested = notesLower.includes('[shipper advice - return') || 
                              courierStatusLower.includes('return requested') ||
                              courierStatusLower.includes('merchant requested return');

    const matchesAdviceKeyword = ADVICE_COURIER_KEYWORDS.some(k => combinedFeed.includes(k));

    if (isReattemptSent) {
      reattemptsSent.push(o);
    } else if (isReturnRequested) {
      returnsRequested.push(o);
    } else if (matchesAdviceKeyword) {
      adviceRequired.push(o);
    }
  });

  console.log(`📊 Breakdown for store ${store_id}:`);
  console.log(`- 🚨 Advice Required: ${adviceRequired.length}`);
  console.log(`- 🔄 Reattempts Sent: ${reattemptsSent.length}`);
  console.log(`- 📦 Returns Requested: ${returnsRequested.length}`);
  
  if (adviceRequired.length > 0) {
    console.log('Sample Advice Required Order:', {
      ref_number: adviceRequired[0].ref_number,
      tracking_number: adviceRequired[0].tracking_number,
      courier_status: adviceRequired[0].courier_status,
      delivery_status: adviceRequired[0].delivery_status,
      notes: adviceRequired[0].notes
    });
  }
} catch (e) {
  console.error('❌ Error executing Shipper Advice query:', e.message);
}
