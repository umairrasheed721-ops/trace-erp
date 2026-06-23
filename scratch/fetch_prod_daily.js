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

  const storeId = 12; 
  const startDate = '2026-05-01';
  const endDate = '2026-05-31';

  const dailyUrl = `${API_BASE}/api/reports/daily?store_id=${storeId}&start_date=${startDate}&end_date=${endDate}`;
  const dailyRes = await fetch(dailyUrl, { headers: { 'Authorization': `Bearer ${token}` } });
  
  if (dailyRes.ok) {
    const data = await dailyRes.json();
    console.log('Daily Data keys:', Object.keys(data));
    console.log('dailyData array length:', data.dailyData ? data.dailyData.length : 'undefined');
    if (data.dailyData && data.dailyData.length > 0) {
      console.log('First 5 daily data rows:', data.dailyData.slice(0, 5));
    }
  } else {
    console.error('Failed:', dailyRes.status, await dailyRes.text());
  }
}

main().catch(err => console.error(err));
