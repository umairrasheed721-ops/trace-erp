const fetch = require('node-fetch');

const trackUrl = 'https://one-be.instaworld.pk/logistics/v1/trackShipment';
// Store 12 credentials from production:
const apiKeys = ['qxdpk08t2mhrf2ed1sym', 'juehwqkpycnowff4spoh'];
const trackingNumber = '173013897464';

async function main() {
  for (const key of apiKeys) {
    console.log(`\nTesting Instaworld key: ${key} on ${trackUrl}...`);
    try {
      const res = await fetch(trackUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ tracking_number: trackingNumber, api_key: key }),
        timeout: 20000
      });

      console.log('Response status:', res.status);
      const text = await res.text();
      console.log('Response body:', text);
    } catch (e) {
      console.error('Error:', e.message);
    }
  }
}

main().catch(err => console.error(err));
