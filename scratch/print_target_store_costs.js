const fetch = require('node-fetch');

const API_BASE = 'https://trace-erp-production.up.railway.app';
const adminPasswords = ['admin123', '03210321'];

async function main() {
  let token = null;
  let loggedInPassword = null;

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
        loggedInPassword = password;
        break;
      }
    } catch (e) {}
  }

  if (!token) {
    console.error('❌ Could not authenticate with production API.');
    return;
  }

  const storeIds = [12, 14];
  for (const storeId of storeIds) {
    console.log(`\n========================================`);
    console.log(`📡 Fetching Master Costs for Store ID: ${storeId}`);
    console.log(`========================================`);
    
    const costsRes = await fetch(`${API_BASE}/api/finance/master-costs?store_id=${storeId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (costsRes.ok) {
      const costs = await costsRes.json();
      console.log(`Total items: ${costs.length}`);
      
      const targets = ["popcorn polo", "adi-hoodie", "hoodie", "crew- cotton", "scoba"];
      const filtered = costs.filter(c => 
        targets.some(t => {
          const parent = (c.parent_title || "").toLowerCase();
          const variant = (c.variant_title || "").toLowerCase();
          return parent.includes(t) || variant.includes(t);
        })
      );
      
      filtered.forEach(c => {
        console.log(`Product: "${c.parent_title}" | Variant: "${c.variant_title || 'Default'}"`);
        console.log(`  Landed Cost (ERP): Rs. ${c.landed_cost} (Unit: ${c.unit_cost}, Pkg: ${c.packaging_cost})`);
        console.log(`  Shopify Cost: Rs. ${c.shopify_cost}`);
      });
    } else {
      console.error(`❌ Failed: ${costsRes.statusText}`);
    }
  }
}

main().catch(err => {
  console.error(err);
});
