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

  console.log('\n📡 Dispatching update-legacy-financials job on production server...');
  try {
    const res = await fetch(`${API_BASE}/api/orders/update-legacy-financials`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ filterMissingOnly: false }) // Updates all Shopify orders
    });

    console.log(`HTTP Status: ${res.status}`);
    const data = await res.json();
    console.log('Response body:', JSON.stringify(data, null, 2));

    if (res.ok && data.success) {
      console.log('\n🎉 Historical financials update job successfully dispatched in the background!');
      console.log('You can monitor system_logs/sync_audit in the ERP to view the update progress.');
    } else {
      console.error('❌ Dispatch failed:', data.error || data.message || 'Unknown error');
    }
  } catch (err) {
    console.error('❌ Network error dispatching request:', err.message);
  }
}

main().catch(err => console.error('Fatal error:', err));
