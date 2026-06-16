const fetch = require('node-fetch');

const API_BASE = 'https://trace-erp-production.up.railway.app';
const adminPasswords = ['admin123', '03210321'];
const targetTracking = '173013897464';

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

  console.log(`📡 Searching for order with tracking ID: ${targetTracking} in production...`);
  
  // We can fetch from GET /api/orders?store_id=12&search=173013897464
  const searchUrl = `${API_BASE}/api/orders?store_id=12&search=${targetTracking}&limit=10`;
  const res = await fetch(searchUrl, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  console.log('Search response status:', res.status);
  if (res.ok) {
    const data = await res.json();
    console.log('Search Results:', JSON.stringify(data, null, 2));
  } else {
    console.error('Failed to search order:', await res.text());
  }
}

main().catch(err => {
  console.error(err);
});
