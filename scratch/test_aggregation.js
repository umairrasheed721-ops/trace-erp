const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = path.resolve(__dirname, '../backend/trace_erp.db');
const db = new DatabaseSync(dbPath);

console.log('--- UPDATED SQL QUERY TESTS ---');

try {
  const orders = db.prepare(`
    SELECT o.id, o.ref_number, o.customer_name, o.phone, o.delivery_status,
           (
             SELECT COUNT(*) 
             FROM orders 
             WHERE (phone IS NOT NULL AND phone != '' AND o.phone IS NOT NULL AND o.phone != '' AND SUBSTR(phone, -10) = SUBSTR(o.phone, -10))
                OR (email = o.email AND o.email IS NOT NULL AND o.email != '')
           ) as customer_order_count
    FROM orders o
    WHERE o.customer_name = 'Usman Khan'
  `).all();

  console.log('Orders found in database for Usman Khan:');
  orders.forEach(o => {
    console.log(`  - Ref: ${o.ref_number}, Name: ${o.customer_name}, Phone: ${o.phone}, Status: ${o.delivery_status}, Calculated Count: ${o.customer_order_count}`);
  });
} catch (e) {
  console.error('Error running updated query:', e.message);
}

console.log('\n--- SIMULATING UPDATED DEEP HISTORY SEARCH (phone = "+923356343244") ---');
function simulateHistorySearch(phone, email, name) {
  let whereClauses = [];
  let params = [];

  let dualKeys = [];
  if (phone && phone.trim() && phone.trim() !== 'null' && phone.trim() !== 'undefined') {
    const cleanPhoneVal = phone.trim().replace(/\D/g, '');
    if (cleanPhoneVal.length >= 10) {
      dualKeys.push('(o.phone IS NOT NULL AND o.phone != \'\' AND SUBSTR(o.phone, -10) = ?)');
      params.push(cleanPhoneVal.slice(-10));
    } else {
      dualKeys.push('o.phone = ?');
      params.push(phone.trim());
    }
  }
  if (email && email.trim() && email.trim() !== 'null' && email.trim() !== 'undefined') {
    dualKeys.push('o.email = ?');
    params.push(email.trim());
  }

  if (dualKeys.length > 0) {
    whereClauses.push(`(${dualKeys.join(' OR ')})`);
  } else if (name && name.trim()) {
    whereClauses.push('o.customer_name LIKE ?');
    params.push(`%${name.trim()}%`);
  }

  const query = `
    SELECT o.id, o.ref_number, o.customer_name, o.phone, o.delivery_status
    FROM orders o 
    WHERE ${whereClauses.join(' AND ')}
  `;

  console.log(`SQL query constructed:`, query.trim());
  console.log(`Params:`, params);

  const results = db.prepare(query).all(...params);
  console.log(`Results returned (${results.length}):`);
  results.forEach(o => {
    console.log(`  - Ref: ${o.ref_number}, Name: ${o.customer_name}, Phone: ${o.phone}, Status: ${o.delivery_status}`);
  });
}

simulateHistorySearch('+923356343244', null, 'Usman Khan');
