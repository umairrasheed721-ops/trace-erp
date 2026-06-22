const db = require('../backend/db');

function testMatch(orderIdInput, masterKey) {
  const store_id = 1; // From the mock database
  const row = { orderId: orderIdInput, trackingNumber: '' };
  
  const rawId = String(row.orderId || '').trim();
  const cleanDigits = rawId.replace(/\D/g, '');
  const candidates = Array.from(new Set([
    rawId,
    cleanDigits,
    cleanDigits ? 'TR' + cleanDigits : null,
    cleanDigits ? '#' + cleanDigits : null
  ].filter(Boolean)));

  console.log(`\n🔍 Input: "${orderIdInput}" | Candidates:`, candidates);

  if (candidates.length > 0) {
    const placeholders = candidates.map(() => '?').join(',');
    const query = `
      SELECT id, ref_number, shopify_order_id, tracking_number 
      FROM orders 
      WHERE store_id = ? 
      AND (shopify_order_id IN (${placeholders}) OR ref_number IN (${placeholders}))
      LIMIT 1
    `;
    const order = db.prepare(query).get(store_id, ...candidates, ...candidates);
    if (order) {
      console.log(`✅ MATCH FOUND! ID: ${order.id} | Ref: ${order.ref_number} | Shopify ID: ${order.shopify_order_id}`);
    } else {
      console.log(`❌ NO MATCH FOUND`);
    }
  } else {
    console.log(`❌ No candidates generated`);
  }
}

console.log('--- TESTING ORDER ID MATCHING UPGRADE ---');
// TR32526 exists in database with ref_number='TR32526' and shopify_order_id='shopify_order_123'
testMatch('TR32526');
testMatch('32526');
testMatch('#32526');
testMatch('shopify_order_123');
testMatch('nonexistent');
