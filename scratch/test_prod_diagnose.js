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

  console.log(`🔐 Authenticated. Running diagnostic PostEx probe from Railway server for tracking 20120050024786...`);
  
  try {
    const res = await fetch(`${API_BASE}/api/diagnostics/test-postex/20120050024786`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log("Response status code from Railway server:", res.status);
    const body = await res.text();
    console.log("Response body from Railway server:", body);
  } catch (err) {
    console.error("Failed to query diagnostics route:", err.message);
  }
}

main().catch(err => console.error(err));
