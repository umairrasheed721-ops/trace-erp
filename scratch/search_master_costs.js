const fetch = require('node-fetch');
const API_BASE = 'https://trace-erp-production.up.railway.app';

async function main() {
  const loginRes = await fetch(API_BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  });
  const { token } = await loginRes.json();
  const res = await fetch(API_BASE + '/api/finance/master-costs?store_id=12', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  const costs = await res.json();
  
  // Find matches for 'trouser' or 'jerssy' or 'jersey' or 'big'
  const matched = costs.filter(c => {
    const title = (c.parent_title || '').toLowerCase();
    return title.includes('trouser') || title.includes('jerssy') || title.includes('jersey') || title.includes('big');
  });
  
  console.log('Similar Cost Entries Found:');
  matched.forEach(m => {
    console.log(`- Title: "${m.parent_title}" | Variant: "${m.variant_title}" | Landed Cost: Rs. ${m.landed_cost} | unit_cost: Rs. ${m.unit_cost}`);
  });
}
main().catch(console.error);
