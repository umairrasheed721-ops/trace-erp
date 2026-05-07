
const fetch = require('node-fetch');

async function test() {
  const trackingNumber = 'LE7531953714';
  const token = 'NWE5NTU4YmE0Y2ExNDk3Y2E5MTc4MzA1ZGNlYjYzZTc6NDhkMmUzYzc0NWJhNDZiM2E3NWNkYWQxYWU4ZjZhYWQ=';
  const url = `https://api.postex.pk/services/integration/api/order/v1/track-order/${trackingNumber}`;

  console.log(`Testing PostEx Tracking for ${trackingNumber}...`);
  
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'token': token, 'Content-Type': 'application/json' },
      timeout: 15000
    });

    console.log(`Response Status: ${res.status}`);
    const data = await res.json();
    console.log('Response Body:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();
