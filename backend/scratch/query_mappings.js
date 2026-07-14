const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('/Users/umairrasheed/Desktop/antigravity/trace-erp/backend/trace_erp.db');
const rows = db.prepare(`
  SELECT DISTINCT courier_status 
  FROM orders 
  WHERE LOWER(courier_status) LIKE '%merchant%' 
     OR LOWER(courier_status) LIKE '%returned%'
`).all();
console.log("Found courier statuses:", rows);
