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

  const res = await fetch(`${API_BASE}/api/finance/master-costs?store_id=12`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (res.ok) {
    const list = await res.json();
    const match1 = list.filter(item => 
      item.sku === 'AR-000171' ||
      item.shopify_variant_id === '44765194158339'
    );
    console.log("Matches for SKU AR-000171 / Variant 44765194158339:", JSON.stringify(match1, null, 2));
  }
}

main().catch(err => console.error(err));
