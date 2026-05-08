const { instaworldFetch } = require('./engines/instaworld_http');

const proxyUrl = 'https://script.google.com/macros/s/AKfycbw2F0u68Itn-JXutvkSAm3gKZy4OA6THs1oxhC8Aag6yw6wr8muAUe3hLx_2shceO1nsg/exec';
const trackUrl = 'https://one-be.instaworld.pk/logistics/v1/trackShipment';
const keys = [
  'qxdpk08t2mhrf2ed1sym',
  'juehwqkpycnowff4spoh',
  'e5bqohxcqvd0fe39ldxs'
];

const testNumbers = [
  'LE7524657057',
  'LE7524657055',
  'LE7524506439'
];

async function runTest() {
  console.log(`🚀 Starting Proxy Test via GAS...`);
  console.log(`Proxy URL: ${proxyUrl}`);
  
  for (const tn of testNumbers) {
    console.log(`\n--- Testing ${tn} ---`);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      try {
        console.log(`Trying Key ${i + 1}...`);
        const res = await instaworldFetch(trackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tracking_number: tn, api_key: key }),
          proxyUrl: proxyUrl,
          timeout: 30000
        });

        console.log(`Status: ${res.status}`);
        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          console.log(`❌ Failed to parse JSON. Raw body: ${text.substring(0, 500)}`);
          continue;
        }
        
        if (Array.isArray(data) && data.length > 0) {
          const latest = data[data.length - 1];
          console.log(`✅ Success! Current Status: "${latest.status}" (${latest.courier_name || 'Unknown Courier'})`);
          break; // Key worked, move to next number
        } else if (data && data.data && Array.isArray(data.data) && data.data.length > 0) {
          const latest = data.data[data.data.length - 1];
          console.log(`✅ Success! Current Status: "${latest.status}"`);
          break;
        } else if (data && data.status) {
          console.log(`✅ Success! Status: "${data.status}"`);
          break;
        } else {
          console.log(`❌ No data found with this key. Response: ${JSON.stringify(data)}`);
        }
      } catch (err) {
        console.error(`💥 Error with Key ${i + 1}: ${err.message}`);
      }
    }
  }
}

runTest();
