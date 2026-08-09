/**
 * PostEx - Test actual working endpoints from existing codebase
 */
const { db } = require('../backend/db');

async function testEndpoints() {
  const store = db.prepare("SELECT id, shop_domain, postex_token FROM stores WHERE postex_token IS NOT NULL AND postex_token != '' LIMIT 1").get();
  const token = store.postex_token;
  const trackingNumber = db.prepare(
    "SELECT tracking_number FROM orders WHERE store_id = ? AND tracking_number LIKE '2%' AND LENGTH(tracking_number) > 10 AND LOWER(COALESCE(courier_status,'')) NOT IN ('delivered','return received','returned') LIMIT 1"
  ).get(store.id)?.tracking_number;
  
  console.log('Store:', store.shop_domain, '| Tracking:', trackingNumber);
  console.log('Token prefix:', token?.substring(0,12));

  // Test the working track-order to verify token is valid
  const trackRes = await fetch(`https://api.postex.pk/services/integration/api/order/v1/track-order/${trackingNumber}`, {
    method: 'GET',
    headers: { 'token': token, 'Content-Type': 'application/json' }
  });
  const trackData = await trackRes.json().catch(() => ({}));
  console.log('\ntrack-order status:', trackRes.status, '| transactionStatus:', trackData?.dist?.transactionStatus || trackData?.statusCode);

  // Try order detail endpoint
  const detailEndpoints = [
    { method: 'POST', url: 'https://api.postex.pk/services/integration/api/order/v1/order-detail', body: { trackingNumber } },
    { method: 'GET',  url: `https://api.postex.pk/services/integration/api/order/v1/get-order-detail-by-ref-number?orderRefNumber=${trackingNumber}`, body: null },
    { method: 'POST', url: 'https://api.postex.pk/services/integration/api/order/v1/reschedule-order', body: { trackingNumber, remarks: 'test reattempt' } },
    { method: 'PUT',  url: 'https://api.postex.pk/services/integration/api/order/v1/reschedule-order', body: { trackingNumber, remarks: 'test reattempt' } },
    { method: 'POST', url: 'https://api.postex.pk/services/integration/api/order/v1/hold-order', body: { trackingNumber } },
    { method: 'PUT',  url: 'https://api.postex.pk/services/integration/api/order/v1/hold-order', body: { trackingNumber } },
  ];

  for (const ep of detailEndpoints) {
    const opts = { method: ep.method, headers: { 'Content-Type': 'application/json', 'token': token } };
    if (ep.body) opts.body = JSON.stringify(ep.body);
    const res = await fetch(ep.url, opts);
    const shortPath = ep.url.split('/').slice(-2).join('/').split('?')[0];
    console.log(`${ep.method} ${shortPath} -> ${res.status}`);
  }
}

testEndpoints().catch(console.error);
