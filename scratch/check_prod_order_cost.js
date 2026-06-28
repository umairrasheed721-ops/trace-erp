const fetch = require('node-fetch');

const API_BASE = 'https://trace-erp-production.up.railway.app';
const adminPasswords = ['admin123', '03210321'];
const STORE_ID = 14; // Rabbi trends
const SEARCH_KEY = '34893';

async function main() {
  let token = null;
  console.log('🔑 Authenticating with production server...');
  for (const password of adminPasswords) {
    try {
      console.log(`Trying password: ${password}...`);
      const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password })
      });
      const data = await loginRes.json();
      if (loginRes.ok && data.token) {
        console.log('✅ Login successful!');
        token = data.token;
        break;
      }
    } catch (e) {
      console.error(`Login error: ${e.message}`);
    }
  }

  if (!token) {
    console.error('❌ Could not authenticate.');
    return;
  }

  console.log(`\n📡 Fetching order matching "${SEARCH_KEY}"...`);
  const url = `${API_BASE}/api/orders?store_id=${STORE_ID}&limit=10&page=1&search=${encodeURIComponent(SEARCH_KEY)}`;
  try {
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log(`HTTP Status: ${res.status}`);
    const data = await res.json();
    if (res.ok && data.orders && data.orders.length > 0) {
      console.log('Order Details:', JSON.stringify(data.orders, null, 2));
    } else {
      console.log('No order found. Response:', JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.error('Network error:', err.message);
  }
}

main().catch(err => console.error('Fatal error:', err));
