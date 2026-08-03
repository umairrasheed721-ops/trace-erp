const fetch = typeof globalThis.fetch === 'function' ? globalThis.fetch : require('node-fetch');

async function testLiveMonitor() {
  try {
    // 1. Fetch from local backend or mock query to verify SQL returns AS1037
    const path = require('path');
    const db = require(path.resolve(__dirname, '../backend/db'));
    
    // Simulate store_id = 1 (or query all stores)
    const store = db.prepare('SELECT id, store_name FROM stores LIMIT 1').get();
    if (!store) {
      console.log('No store found in DB');
      return;
    }

    // Run the exact updated SQL query from backend/routes/monitors.js
    const rawOrders = db.prepare(`
      SELECT id, ref_number, tracking_number, customer_name, phone, address, city, delivery_status, notes, price, product_titles, courier, courier_status, COALESCE(failed_attempts, 0) as failed_attempts, status_date, order_date
      FROM orders WHERE store_id = ?
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
    `).all(store.id);

    console.log(`✅ [Query Test] Total matching reattempt/return-initiated orders fetched: ${rawOrders.length}`);

    // Check if query logic matches orders with "Return Initiated"
    const returnInitiated = rawOrders.filter(o => (o.delivery_status || '').toLowerCase().includes('return initiated'));
    console.log(`✅ [Query Test] Orders with 'Return Initiated' in results: ${returnInitiated.length}`);

    if (returnInitiated.length > 0) {
      console.log('Sample Return Initiated Order:', JSON.stringify(returnInitiated[0], null, 2));
    }
  } catch (err) {
    console.error('Error testing live monitor:', err);
  }
}

testLiveMonitor();
