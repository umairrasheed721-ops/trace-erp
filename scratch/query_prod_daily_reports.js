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
    console.error('❌ Could not authenticate with production API.');
    return;
  }

  const storeIds = [12, 14];
  for (const storeId of storeIds) {
    console.log(`\n========================================`);
    console.log(`📡 Fetching Daily Report for Store ID: ${storeId}`);
    console.log(`========================================`);
    
    // Fetch daily report for January 2026
    const res = await fetch(`${API_BASE}/api/reports/daily?store_id=${storeId}&start_date=2026-01-01&end_date=2026-01-31`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (res.ok) {
      const data = await res.json();
      console.log(`Total days returned: ${data.length}`);
      
      let totalDeliveredSale = 0;
      let totalCgs = 0;
      let totalPureCgs = 0;
      let totalPackaging = 0;
      
      data.forEach(day => {
        totalDeliveredSale += day.deliveredSale || 0;
        totalCgs += day.cgs || 0;
        totalPureCgs += day.pureCgs || 0;
        totalPackaging += day.sunkPackaging || 0;
      });
      
      console.log(`Summary for Jan 2026:`);
      console.log(` - Delivered Sale: Rs. ${totalDeliveredSale.toLocaleString()}`);
      console.log(` - Total CGS (pure + packaging): Rs. ${totalCgs.toLocaleString()}`);
      console.log(` - Pure CGS (unit cost of delivered): Rs. ${totalPureCgs.toLocaleString()}`);
      console.log(` - Sunk Packaging Cost: Rs. ${totalPackaging.toLocaleString()}`);
    } else {
      console.error(`❌ Failed: ${res.statusText}`);
    }
  }
}

main().catch(err => {
  console.error(err);
});
