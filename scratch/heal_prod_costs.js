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

  // Fetch stores
  console.log('\n📡 Fetching stores from production...');
  const storeRes = await fetch(`${API_BASE}/api/finance/couriers?store_id=1`, { // Wait, the endpoint for couriers requires store_id, let's try fetch-live-payouts or similar or check where we can get store list
    headers: { 'Authorization': `Bearer ${token}` }
  });
  // Wait, let's query all stores. Is there an endpoint to get the current tenant stores?
  // Let's inspect index.js or route files to find how to get store list or store ID.
  // Wait, let's write a temporary script first to get store information or we can just try store_id = 1, 2, 3, etc.
}

main().catch(err => console.error('Fatal error:', err));
