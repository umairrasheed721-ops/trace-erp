const fetch = require('node-fetch');

const trackingNumber = '173011324678';
const apiKey = 'qxdpk08t2mhrf2ed1sym';
const trackUrl = 'https://one-be.instaworld.pk/logistics/v1/trackShipment';

async function test() {
  console.log(`Testing Instaworld API for ${trackingNumber}...`);
  try {
    const res = await fetch(trackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        tracking_number: trackingNumber, 
        api_key: apiKey 
      })
    });

    console.log(`Status: ${res.status}`);
    const data = await res.json();
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();
