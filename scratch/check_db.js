const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const dbPath = path.join(__dirname, '..', 'backend', 'database.sqlite');
const db = new DatabaseSync(dbPath);

console.log('Inspecting database.sqlite tables:');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
for (const table of tables) {
  try {
    const count = db.prepare(`SELECT COUNT(*) as count FROM "${table.name}"`).all()[0].count;
    console.log(`Table: ${table.name} -> ${count} rows`);
  } catch (e) {
    console.log(`Table: ${table.name} -> Error: ${e.message}`);
  }
}

if (tables.some(t => t.name === 'orders')) {
  const orderDateRange = db.prepare("SELECT MIN(order_date) as min_date, MAX(order_date) as max_date FROM orders").all();
  console.log('Order date range:', orderDateRange[0]);
  
  // Let's count by year-month
  const monthCounts = db.prepare(`
    SELECT substr(order_date, 1, 7) as ym, COUNT(*) as cnt 
    FROM orders 
    GROUP BY ym
    ORDER BY ym DESC
    LIMIT 10
  `).all();
  console.log('Order count by year-month:', monthCounts);
}
