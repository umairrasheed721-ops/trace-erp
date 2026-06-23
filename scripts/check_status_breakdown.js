const db = require('../backend/db');

const rows = db.prepare(`
  SELECT delivery_status, COUNT(*) as count 
  FROM orders 
  WHERE store_id = 1 AND tracking_number IS NOT NULL AND tracking_number != ''
  GROUP BY delivery_status
`).all();

console.log('Status breakdown for orders with tracking numbers:', rows);
