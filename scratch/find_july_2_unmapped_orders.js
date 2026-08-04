const path = require('path');
const db = require(path.resolve(__dirname, '../backend/db'));

try {
  const storeId = 1; // Trace store

  // Get all orders in July 2026 for store 1
  const orders = db.prepare(`
    SELECT id, ref_number, tracking_number, customer_name, delivery_status, courier, courier_status, order_date, created_timestamp
    FROM orders
    WHERE store_id = ? AND substr(order_date, 1, 7) = '2026-07'
  `).all(storeId);

  console.log(`Total orders in 2026-07 for store ${storeId}: ${orders.length}`);

  // Group by delivery_status
  const statusCounts = {};
  orders.forEach(o => {
    const st = (o.delivery_status || 'NULL').trim();
    statusCounts[st] = (statusCounts[st] || 0) + 1;
  });

  console.log('\n📊 Breakdown of delivery_status for July 2026:');
  console.table(statusCounts);

  const inFlightList = ['shipped', 'out for delivery', 'in transit', 'attempted', 'shipper advice', 'return initiated', 'return in transit', 'reattempt requested', 'undelivered', 'dispatched'];

  const unmappedOrders = [];
  orders.forEach(o => {
    const st = (o.delivery_status || '').trim();
    const stLower = st.toLowerCase();

    const isCancel = st === 'Cancelled';
    const isPending = st === 'Pending';
    const isBooked = ['Booked', 'Picked Up', 'Unassigned'].includes(st);
    const isDelivered = st === 'Delivered';
    const isRestock = st === 'Return Received';
    const isMissing = st === 'Returned';
    const isInTransit = inFlightList.includes(stLower);

    const isAccountedForInPnl = isCancel || isPending || isBooked || isDelivered || isRestock || isMissing || isInTransit;

    if (!isAccountedForInPnl) {
      unmappedOrders.push(o);
    }
  });

  console.log(`\n🚨 FOUND ${unmappedOrders.length} UNMAPPED ORDER(S):`);
  console.log(JSON.stringify(unmappedOrders, null, 2));

} catch (e) {
  console.error('Error:', e);
}
