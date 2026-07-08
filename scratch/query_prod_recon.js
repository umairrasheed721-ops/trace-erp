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

  // Fetch full details of the last reconciled order in batch 1: TR32707 (tracking: 29120050024964)
  const res = await fetch(`${API_BASE}/api/diagnostics/order-full-details/29120050024964`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (res.ok) {
    const order = await res.json();
    console.log("TR32707 (29120050024964) Details:");
    console.log(JSON.stringify(order, null, 2));
  } else {
    console.error("Failed:", res.status, await res.text());
  }
}

main().catch(console.error);
