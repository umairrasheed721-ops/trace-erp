const fetch = require('node-fetch');

const API_BASE = 'https://trace-erp-production.up.railway.app';
const adminPasswords = ['admin123', '03210321'];
const ORDER_ID = 202324; // #34893
const COST = 550;

async function main() {
  let token = null;
  console.log('🔑 Authenticating with production server...');
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

  console.log(`\n📡 Updating cost of order ID ${ORDER_ID} to ${COST} in production...`);
  try {
    const res = await fetch(`${API_BASE}/api/orders/${ORDER_ID}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ cost: COST })
    });

    console.log(`HTTP Status: ${res.status}`);
    const data = await res.json();
    console.log('Response body:', JSON.stringify(data, null, 2));

    if (res.ok && data.success) {
      console.log(`\n🎉 Cost of order #34893 successfully updated to ${COST} in production!`);
    } else {
      console.error('❌ Update failed:', data.error || data.message || 'Unknown error');
    }
  } catch (err) {
    console.error('❌ Network error:', err.message);
  }
}

main().catch(err => console.error(err));
