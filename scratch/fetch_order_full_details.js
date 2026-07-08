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

  console.log(`🔐 Authenticated. Fetching stores list...`);
  const storesRes = await fetch(`${API_BASE}/api/stores`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const stores = await storesRes.json();
  console.log("Stores:", stores);

  for (const store of stores) {
    const storeId = store.id;
    console.log(`Searching for TR32826 in Store ${storeId} (${store.name})...`);
    // Search orders
    const searchUrl = `${API_BASE}/api/orders?store_id=${storeId}&search=TR32826&limit=10&page=1&status=`;
    const res = await fetch(searchUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.orders && data.orders.length > 0) {
        console.log(`FOUND!`, JSON.stringify(data.orders, null, 2));
      }
    }
  }
}

main().catch(err => console.error(err));
