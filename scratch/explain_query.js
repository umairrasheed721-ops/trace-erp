const db = require('../backend/db');

function runTest(label, where, params) {
  console.log(`\n=== ${label} ===`);
  console.log('WHERE:', where);
  console.log('Params:', params);
  
  // Explain count
  try {
    const explainCount = db.prepare(`EXPLAIN QUERY PLAN SELECT COUNT(*) as count FROM orders o WHERE ${where}`).all(...params);
    console.log('Explain Count:');
    explainCount.forEach(row => console.log('  ', row.detail || row.selectid || row));
  } catch (e) {
    console.error('Count explain failed:', e);
  }

  // Explain fetch
  try {
    const explainFetch = db.prepare(`
      EXPLAIN QUERY PLAN 
      SELECT o.*, s.shop_domain 
      FROM orders o
      JOIN stores s ON o.store_id = s.id
      WHERE ${where}
      ORDER BY o.created_timestamp DESC
      LIMIT 250 OFFSET 0
    `).all(...params);
    console.log('Explain Fetch:');
    explainFetch.forEach(row => console.log('  ', row.detail || row.selectid || row));
  } catch (e) {
    console.error('Fetch explain failed:', e);
  }

  // Time count
  const t0 = Date.now();
  let countResult = null;
  try {
    countResult = db.prepare(`SELECT COUNT(*) as count FROM orders o WHERE ${where}`).get(...params);
  } catch (e) {
    console.error('Count failed:', e);
  }
  const t1 = Date.now();
  console.log(`Count took: ${t1 - t0}ms (Result: ${countResult ? countResult.count : 'error'})`);

  // Time fetch
  const t2 = Date.now();
  let fetchResult = [];
  try {
    const query = db.prepare(`
      SELECT o.*, s.shop_domain 
      FROM orders o
      JOIN stores s ON o.store_id = s.id
      WHERE ${where}
      ORDER BY o.created_timestamp DESC
      LIMIT ? OFFSET ?
    `);
    console.log('Executing with args:', [...params, 250, 0]);
    fetchResult = query.all(...params, 250, 0);
  } catch (e) {
    console.error('Fetch failed:', e);
  }
  const t3 = Date.now();
  console.log(`Fetch took: ${t3 - t2}ms (Result length: ${fetchResult.length})`);
}

const store_id = 1;

// Case 1: All Time, All Statuses (where: store_id = ?)
runTest('All Time, All Statuses', 'o.store_id = ?', [store_id]);
