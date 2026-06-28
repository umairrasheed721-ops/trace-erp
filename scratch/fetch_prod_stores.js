const fetch = require('node-fetch');

const API_BASE = 'https://trace-erp-production.up.railway.app';
const adminPasswords = ['admin123', '03210321'];

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

  // To find stores, let's check what endpoint lists stores.
  // Let's check stores routes in routes/stores.js.
  // Let's query /api/stores endpoint.
  console.log('\n📡 Fetching stores list...');
  const res = await fetch(`${API_BASE}/api/stores`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log(`Status: ${res.status}`);
  const data = await res.json();
  console.log('Stores data:', JSON.stringify(data, null, 2));
}

main().catch(err => console.error('Fatal error:', err));
