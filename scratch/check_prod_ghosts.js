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

  if (!token) {
    console.error('Failed to log in');
    return;
  }

  console.log('\n👻 Fetching missing products (Ghosts) for Rabbi Trends...');
  const res = await fetch(`${API_BASE}/api/finance/missing-product-list?store_id=${STORE_ID}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const ghosts = await res.json();
  console.log('Total ghost products:', ghosts.length);
  const poloGhosts = ghosts.filter(g => g.name.toLowerCase().includes('polo'));
  console.log('Polo ghosts:', JSON.stringify(poloGhosts, null, 2));
}

main().catch(err => console.error(err));
