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

  const storeId = 12;
  console.log(`🔐 Authenticated. Fetching daily reports data from production...`);
  
  const res = await fetch(`${API_BASE}/api/reports/daily?store_id=${storeId}&t=${Date.now()}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (res.ok) {
    const data = await res.json();
    console.log(`Successfully retrieved ${data.length} daily rows.`);
    const activeRows = data.filter(row => row.cashInTransit > 0 || row.intransit > 0);
    console.log(`Found ${activeRows.length} rows with transit activity.`);
    if (activeRows.length > 0) {
      console.log("Sample rows with Cash In Transit:");
      console.log(activeRows.slice(0, 5).map(r => ({
        date: r.date,
        intransitCount: r.intransit,
        cashInTransit: r.cashInTransit
      })));
    }
  } else {
    console.error(`❌ Failed: ${res.status}`);
  }
}

main().catch(err => console.error(err));
