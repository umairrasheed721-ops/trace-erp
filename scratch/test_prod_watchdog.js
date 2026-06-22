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

  console.log(`🔐 Logged in successfully to production.`);

  // 1. Trigger watchdog run in production for store_id 12
  console.log('\n⏳ [Watchdog Run] Triggering watchdog run in production for store 12...');
  const runRes = await fetch(`${API_BASE}/api/watchdog/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ store_id: 12 })
  });
  console.log("Watchdog run trigger status:", runRes.status);
  const runData = await runRes.json();
  console.log("Watchdog run response:", runData);

  // Wait 12 seconds and fetch results again to see if any new ones populated
  console.log("\nWaiting 12 seconds for background audit to run in production...");
  await new Promise(r => setTimeout(r, 12000));

  console.log('📡 Fetching production watchdog results after audit...');
  const postRes = await fetch(`${API_BASE}/api/watchdog?store_id=12`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const postData = await postRes.json();
  console.log("Results count after audit:", postData.length);
  if (postData.length > 0) {
    console.log("Audited Results:", JSON.stringify(postData, null, 2));
  }
}

main().catch(err => console.error(err));
