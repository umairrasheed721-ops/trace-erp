
const fetch = require('node-fetch');

// Test 3 different request formats to find what Instaworld actually expects
async function test() {
  const trackingNumber = '173013135094'; // Known good TCS number from screenshot
  const primaryKey = 'qxdpk08t2mhrf2ed1sym';
  const backupKey = 'juehwqkpycnowff4spoh';
  const url = 'https://one-be.instaworld.pk/logistics/v1/trackShipment';

  // Format 1: api_key in body (current ERP format)
  console.log('--- Format 1: api_key in body ---');
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tracking_number: trackingNumber, api_key: primaryKey }),
      timeout: 10000
    });
    console.log('Status:', res.status);
    const d = await res.json();
    console.log('Response:', JSON.stringify(d).substring(0, 200));
  } catch(e) { console.log('Error:', e.message); }

  // Format 2: api_key in header (like Google Apps Script might use)
  console.log('\n--- Format 2: api_key in header ---');
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': primaryKey },
      body: JSON.stringify({ tracking_number: trackingNumber }),
      timeout: 10000
    });
    console.log('Status:', res.status);
    const d = await res.json();
    console.log('Response:', JSON.stringify(d).substring(0, 200));
  } catch(e) { console.log('Error:', e.message); }

  // Format 3: api_key in header as Authorization Bearer
  console.log('\n--- Format 3: Authorization Bearer header ---');
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${primaryKey}` },
      body: JSON.stringify({ tracking_number: trackingNumber }),
      timeout: 10000
    });
    console.log('Status:', res.status);
    const d = await res.json();
    console.log('Response:', JSON.stringify(d).substring(0, 200));
  } catch(e) { console.log('Error:', e.message); }

  // Format 4: backup key in body
  console.log('\n--- Format 4: backup key in body ---');
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tracking_number: trackingNumber, api_key: backupKey }),
      timeout: 10000
    });
    console.log('Status:', res.status);
    const d = await res.json();
    console.log('Response:', JSON.stringify(d).substring(0, 200));
  } catch(e) { console.log('Error:', e.message); }
}

test();
