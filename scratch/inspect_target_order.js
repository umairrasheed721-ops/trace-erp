const db = require('../backend/db');

const rows = db.prepare(`
  SELECT courier_status, COUNT(*) as count 
  FROM orders 
  GROUP BY courier_status 
  ORDER BY count DESC
`).all();

console.log(JSON.stringify(rows, null, 2));
