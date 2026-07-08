const fetch = require('node-fetch');

const token = 'NWE5NTU4YmE0Y2ExNDk3Y2E5MTc4MzA1ZGNlYjYzZTc6NDhkMmUzYzc0NWJhNDZiM2E3NWNkYWQxYWU4ZjZhYWQ';
const trackingNumber = '20120050024976';

async function testV1() {
  const url = `https://api.postex.pk/services/integration/api/order/v1/track-order/${trackingNumber}`;
  console.log(`📡 Fetching PostEx V1: ${url}`);
  try {
    const res = await fetch(url, {
      headers: { 'token': token, 'Content-Type': 'application/json' }
    });
    console.log(`V1 Status:`, res.status);
    const data = await res.json();
    console.log(`V1 Response:`, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`V1 Error:`, err.message);
  }
}

async function testV3() {
  const url = `https://api.postex.pk/services/integration/api/order/v3/get-multiple-order-detail-by-tracking-numbers?trackingNumbers=${trackingNumber}`;
  console.log(`📡 Fetching PostEx V3: ${url}`);
  try {
    const res = await fetch(url, {
      headers: { 'token': token, 'Content-Type': 'application/json' }
    });
    console.log(`V3 Status:`, res.status);
    const data = await res.json();
    console.log(`V3 Response:`, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`V3 Error:`, err.message);
  }
}

async function run() {
  await testV1();
  await testV3();
}

run();
