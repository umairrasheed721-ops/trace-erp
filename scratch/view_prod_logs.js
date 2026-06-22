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

  try {
    const res = await fetch(`${API_BASE}/api/admin/logs`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (!res.ok) {
      console.error(`HTTP Error ${res.status}: ${await res.text()}`);
      return;
    }
    const text = await res.text();
    console.log('--- PRODUCTION CONSOLE LOGS ---');
    
    // Print the last 40 lines of console logs
    const lines = text.trim().split('\n');
    console.log(lines.slice(-40).join('\n'));
  } catch (err) {
    console.error('Network error:', err.message);
  }
}

main().catch(err => console.error(err));
