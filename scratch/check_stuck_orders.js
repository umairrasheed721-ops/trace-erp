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

  const storeId = 12;
  console.log(`🔐 Authenticated. Fetching Stuck Monitor data from /api/monitors/stuck...`);
  
  const res = await fetch(`${API_BASE}/api/monitors/stuck?store_id=${storeId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (res.ok) {
    const data = await res.json();
    console.log(`Stuck Monitor returned ${data.length} orders.`);
    if (data.length > 0) {
      console.log("Sample stuck orders:", data.slice(0, 3));
    }
  } else {
    console.error(`❌ Failed to fetch stuck orders: ${res.status}`);
  }

  // Let's also query the general diagnostics stats to see table size
  const statsRes = await fetch(`${API_BASE}/api/diagnostics/stats?store_id=${storeId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (statsRes.ok) {
    const stats = await statsRes.json();
    console.log("Store stats in production:", stats);
  }
}

main().catch(err => console.error(err));
