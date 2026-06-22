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

  const tracking = '173013411583';
  console.log(`🔐 Authenticated. Running direct test-instaworld-proxy for tracking: ${tracking}...`);
  const testRes = await fetch(`${API_BASE}/api/diagnostics/test-instaworld-proxy/${tracking}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  console.log(`HTTP Status: ${testRes.status}`);
  const result = await testRes.json();
  console.log("Proxy Instaworld response payload:", JSON.stringify(result, null, 2));
}

main().catch(err => console.error(err));
