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

  const id = '173013411583';
  console.log(`🔐 Authenticated. Fetching full details for order ${id}...`);
  const res = await fetch(`${API_BASE}/api/diagnostics/order-full-details/${id}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (res.ok) {
    const data = await res.json();
    console.log("Response payload:");
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.error(`❌ Failed: ${res.status}`);
  }
}

main().catch(err => console.error(err));
