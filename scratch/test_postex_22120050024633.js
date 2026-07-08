const fetch = require('node-fetch');

const token = 'NWE5NTU4YmE0Y2ExNDk3Y2E5MTc4MzA1ZGNlYjYzZTc6NDhkMmUzYzc0NWJhNDZiM2E3NWNkYWQxYWU4ZjZhYWQ';
const trackingNumber = '22120050024633';

async function main() {
  const url = `https://api.postex.pk/services/integration/api/order/v1/track-order/${trackingNumber}`;
  console.log(`📡 Fetching PostEx V1: ${url}`);
  try {
    const res = await fetch(url, {
      headers: { 'token': token, 'Content-Type': 'application/json' }
    });
    console.log(`Status:`, res.status);
    const data = await res.json();
    console.log(`Responsedist:`, JSON.stringify(data.dist, null, 2));
  } catch (err) {
    console.error(`Error:`, err.message);
  }
}

main();
