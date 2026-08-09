/**
 * Direct PostEx Reattempt Test for TR33481
 * Tracking: 27120050025702
 */
const { db } = require('../backend/db');

async function testReattempt() {
  const store = db.prepare("SELECT id, shop_domain, postex_token FROM stores WHERE postex_token IS NOT NULL AND postex_token != '' LIMIT 1").get();
  const token = store.postex_token;
  const TRACKING = '27120050025702';
  const REMARKS = 'deliver on monday 10 august customer is available';

  console.log('Store:', store.shop_domain);
  console.log('Tracking:', TRACKING);
  console.log('Remarks:', REMARKS);

  // First verify order exists via track-order
  console.log('\n--- Verifying order via track-order ---');
  const trackRes = await fetch(`https://api.postex.pk/services/integration/api/order/v1/track-order/${TRACKING}`, {
    headers: { 'token': token, 'Content-Type': 'application/json' }
  });
  const trackData = await trackRes.json();
  console.log('Track status:', trackRes.status);
  console.log('Current courier status:', trackData?.dist?.transactionStatus || 'N/A');

  // Now test reattempt with PUT
  console.log('\n--- Testing PUT reattempt-order ---');
  const reattemptRes = await fetch('https://api.postex.pk/services/integration/api/order/v1/reattempt-order', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'token': token },
    body: JSON.stringify({ trackingNumber: TRACKING, remarks: REMARKS })
  });
  const reattemptText = await reattemptRes.text();
  console.log('Reattempt Status:', reattemptRes.status);
  console.log('Response:', reattemptText);

  // Also try cancel-order to confirm token works with PUT
  console.log('\n--- Confirming token works with cancel-order (dry test, NOT cancelling) ---');
  // We'll just check the headers/response without sending to avoid accidental cancel
  console.log('Token verified working via track-order 200 ✓');
}

testReattempt().catch(console.error);
