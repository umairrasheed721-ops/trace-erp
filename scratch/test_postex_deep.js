/**
 * Testing PostEx Merchant API Authorization and Endpoints
 */
const { db } = require('../backend/db');

async function testMerchantAuth() {
  const store = db.prepare("SELECT id, shop_domain, postex_token FROM stores WHERE postex_token IS NOT NULL AND postex_token != '' LIMIT 1").get();
  const token = store.postex_token;
  const trackingNumber = '27120050025702';

  console.log('Token:', token);

  const authHeadersToTest = [
    { 'token': token },
    { 'Authorization': token },
    { 'Authorization': `Bearer ${token}` },
    { 'api-key': token },
    { 'x-api-key': token },
    { 'merchant-token': token },
    { 'token': token, 'Authorization': token }
  ];

  const endpoints = [
    'https://api.postex.pk/services/merchant/api/order/v1/create-order-remarks',
    'https://api.postex.pk/services/merchant/api/order/v1/add-remarks',
    'https://api.postex.pk/services/merchant/api/order/v1/reattempt-order',
    'https://api.postex.pk/services/merchant/api/order/v1/update-order'
  ];

  for (const ep of endpoints) {
    const urlShort = ep.split('/').slice(-2).join('/');
    for (let i = 0; i < authHeadersToTest.length; i++) {
      const headers = { 'Content-Type': 'application/json', ...authHeadersToTest[i] };
      try {
        const res = await fetch(ep, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({
            trackingNumber: trackingNumber,
            orderTrackingNumber: trackingNumber,
            remarks: 'Test remark',
            comment: 'Test remark'
          })
        });
        const text = await res.text();
        console.log(`${urlShort} | Header #${i+1} -> ${res.status}: ${text.substring(0, 120)}`);
        if (res.status === 200 || !text.includes('Unauthorized')) {
          console.log(`🎉 SUCCESS! Headers #${i+1} worked! Response:`, text);
        }
      } catch (e) {
        console.log(`${urlShort} -> Error: ${e.message}`);
      }
    }
  }
}

testMerchantAuth().catch(console.error);
