const fetch = require('node-fetch');

const API_BASE = 'https://trace-erp-production.up.railway.app';
const adminPasswords = ['admin123', '03210321'];
const STORE_ID = 14; // Rabbi trends

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

  console.log(`\n📡 Dispatching auto-heal-all for Store ID ${STORE_ID} on production...`);
  try {
    const res = await fetch(`${API_BASE}/api/finance/auto-heal-all`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ store_id: STORE_ID })
    });

    console.log(`HTTP Status: ${res.status}`);
    const data = await res.json();
    console.log('Response body:', JSON.stringify(data, null, 2));

    if (res.ok && data.success) {
      console.log(`\n🎉 Costs successfully healed in production for ${data.count} orders!`);
    } else {
      console.error('❌ Heal failed:', data.error || data.message || 'Unknown error');
    }
  } catch (err) {
    console.error('❌ Network error:', err.message);
  }
}

main().catch(err => console.error('Fatal error:', err));
