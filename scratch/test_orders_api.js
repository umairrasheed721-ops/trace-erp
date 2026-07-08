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
    console.error('❌ Could not authenticate with production API.');
    return;
  }

  console.log(`🔐 Authenticated successfully.`);

  // Fetch orders for Store ID 12 in Jan 2026
  const url = `${API_BASE}/api/orders?store_id=12&start_date=2026-01-01&end_date=2026-01-31&status=delivered&limit=1000`;
  console.log(`📡 Fetching from: ${url}`);
  
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (res.ok) {
    const data = await res.json();
    console.log(`Response type:`, typeof data);
    if (data.orders) {
      console.log(`Total orders found:`, data.orders.length);
      console.log(`First order:`, JSON.stringify(data.orders[0], null, 2));
    } else {
      console.log(`Response:`, JSON.stringify(data, null, 2));
    }
  } else {
    console.error(`❌ Failed:`, res.status, await res.text());
  }
}

main().catch(err => {
  console.error(err);
});
