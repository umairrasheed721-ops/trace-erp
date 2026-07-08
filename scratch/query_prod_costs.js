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

  console.log(`🔐 Logged in successfully to production using admin password.`);

  // Directly fetch master costs for store IDs 1 to 20
  for (let storeId = 1; storeId <= 20; storeId++) {
    try {
      const costsRes = await fetch(`${API_BASE}/api/finance/master-costs?store_id=${storeId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (costsRes.ok) {
        const costs = await costsRes.json();
        if (costs && costs.length > 0) {
          console.log(`\n🎉 Found costs for Store ID: ${storeId}! (Total: ${costs.length} items)`);
          
          // Let's filter for our target products
          const targets = ["popcorn polo", "hoodie", "crew- cotton", "scoba"];
          const filtered = costs.filter(c => 
            targets.some(t => c.parent_title.toLowerCase().includes(t) || (c.variant_title && c.variant_title.toLowerCase().includes(t)))
          );
          
          console.log("🔍 Cost entries for target products in Production ERP:");
          filtered.forEach(c => {
            console.log(` - Product: "${c.parent_title}" | Variant: "${c.variant_title || 'Default'}"`);
            console.log(`   Landed Cost (ERP): Rs. ${c.landed_cost} (Unit: ${c.unit_cost}, Pkg: ${c.packaging_cost})`);
            console.log(`   Shopify Cost (from Shopify sync): Rs. ${c.shopify_cost}`);
          });
        }
      }
    } catch (err) {
      // ignore errors
    }
  }
}

main().catch(err => {
  console.error('Fatal production interaction error:', err);
});
