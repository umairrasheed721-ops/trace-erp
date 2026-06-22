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

  console.log(`🔐 Authenticated. Fetching status for order 173013411583 from diagnostics...`);
  const statusRes = await fetch(`${API_BASE}/api/diagnostics/check-status/173013411583`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (statusRes.ok) {
    const data = await statusRes.json();
    console.log("Database fields:", JSON.stringify(data, null, 2));
  } else {
    console.error(`❌ Failed to fetch: ${statusRes.status}`, await statusRes.text());
  }
}

main().catch(err => console.error(err));
