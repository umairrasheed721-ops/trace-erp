const fetch = require('node-fetch');

const trackingNumbers = ['LE7526973216', 'LE7526973221', '342362', '173011324678', 'LE7526969049', '365421'];
const apiKey = 'qxdpk08t2mhrf2ed1sym';
const trackUrl = 'https://one-be.instaworld.pk/logistics/v1/trackShipment';

async function testBatch() {
  for (const tNum of trackingNumbers) {
    console.log(`\n--- Testing ${tNum} ---`);
    try {
      const res = await fetch(trackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracking_number: tNum, api_key: apiKey })
      });
      const data = await res.json();
      console.log(`Status: ${res.status}`);
      if (Array.isArray(data) && data.length > 0) {
        console.log(`Latest: ${data[data.length-1].status}`);
      } else {
        console.log(`Response:`, JSON.stringify(data));
      }
    } catch (e) {
      console.log(`Error: ${e.message}`);
    }
  }
}

testBatch();
