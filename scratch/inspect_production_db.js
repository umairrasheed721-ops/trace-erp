const fetch = require('node-fetch');

const API_BASE = 'https://trace-erp-production.up.railway.app';
const adminPasswords = ['admin123', '03210321'];

async function main() {
  let token = null;
  for (const password of adminPasswords) {
    try {
      const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password })
      });
      const data = await loginRes.json();
      if (loginRes.ok && data.token) {
        token = data.token;
        break;
      }
    } catch (e) {}
  }

  if (!token) {
    console.error('❌ Could not authenticate.');
    return;
  }

  // Get active stores to retrieve the exact production token
  const storesRes = await fetch(`${API_BASE}/api/stores`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const stores = await storesRes.json();
  const prodStore = stores[0];
  const postex_token = prodStore.postex_token;
  console.log("Production PostEx token length:", postex_token.length);
  console.log("Token value:", postex_token);

  // Test tracking numbers from production
  const testTns = ["26120050024859", "25120050024863"];

  for (const tn of testTns) {
    const url = `https://api.postex.pk/services/integration/api/order/v1/track-order/${tn}`;
    console.log(`\nTesting track-order GET for ${tn}...`);
    
    // Call with the token exactly as stored in DB
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'token': postex_token, 'Content-Type': 'application/json' }
    });
    console.log("GET Response Status:", res.status);
    const data = await res.json();
    console.log("GET Response Body keys:", Object.keys(data));
    console.log("statusCode:", data.statusCode, "statusMessage:", data.statusMessage);
    if (data.dist) {
      console.log("History length:", data.dist.transactionStatusHistory ? data.dist.transactionStatusHistory.length : 0);
      console.log("Sample history:", data.dist.transactionStatusHistory ? data.dist.transactionStatusHistory.slice(0, 2) : []);
    }

    // Call with token plus '=' padding (if length is 87, usually base64 padding is needed to make it multiple of 4, so 88 chars)
    const paddedToken = postex_token.padEnd(88, '=');
    console.log(`Testing track-order GET with padded token (length: ${paddedToken.length})...`);
    const resPadded = await fetch(url, {
      method: 'GET',
      headers: { 'token': paddedToken, 'Content-Type': 'application/json' }
    });
    console.log("Padded GET Response Status:", resPadded.status);
    const dataPadded = await resPadded.json();
    console.log("statusCode:", dataPadded.statusCode, "statusMessage:", dataPadded.statusMessage);
  }
}

main().catch(err => console.error(err));
