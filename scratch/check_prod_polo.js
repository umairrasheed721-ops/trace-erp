const fetch = require('node-fetch');

const API_BASE = 'https://trace-erp-production.up.railway.app';
const adminPasswords = ['admin123', '03210321'];
const STORE_ID = 14; // Rabbi trends

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

  if (!token) return;

  console.log('\n📡 Fetching master costs for Rabbi Trends...');
  const res = await fetch(`${API_BASE}/api/finance/master-costs?store_id=${STORE_ID}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  const polo = data.filter(c => c.parent_title.toLowerCase().includes('fed prey polo'));
  console.log('Fed Prey Polo Costs (Count:', polo.length, '):', JSON.stringify(polo, null, 2));
}

main().catch(err => console.error(err));
