
const fetch = require('node-fetch');

async function test() {
  const trackingNumber = 'LE784585069';
  const apiKey = 'juehwqkpycnowff4spoh';
  const url = 'https://one-be.instaworld.pk/logistics/v1/trackShipment';

  console.log(`Testing Tracking for ${trackingNumber}...`);
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tracking_number: trackingNumber, api_key: 'juehwqkpycnowff4spoh' }),
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
