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

  const wdRes = await fetch(`${API_BASE}/api/watchdog?store_id=12`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const wdData = await wdRes.json();
  console.log('Production watchdog results count:', wdData.length);
  if (wdData.length > 0) {
    console.log("Latest 5 results:");
    console.table(wdData.slice(0, 5).map(r => ({
      tracking: r.tracking_number,
      verdict: r.verdict,
      latest_status: r.latest_status,
      evidence: r.evidence
    })));
  }
}

main().catch(err => console.error(err));
