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

  console.log(`🔐 Authenticated with production.`);

  // 1. Fetch system health / settings / logs if route exists
  // Let's see if we can query audit logs or similar.
  // Is there an endpoint for system status?
  // Let's fetch /api/settings/system-health
  console.log('📡 Fetching system health...');
  const healthRes = await fetch(`${API_BASE}/api/settings/system-health`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('Health status:', healthRes.status);
  if (healthRes.ok) {
    const health = await healthRes.json();
    console.log("Health details:", JSON.stringify(health, null, 2));
  }

  // 2. Fetch recent audit logs from Gemini/WA audit logs route
  console.log('\n📡 Fetching Gemini audit logs...');
  const logsRes = await fetch(`${API_BASE}/api/whatsapp-governance/gemini/audit-logs?limit=20`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('Logs status:', logsRes.status);
  if (logsRes.ok) {
    const logs = await logsRes.json();
    console.log("Gemini Audit Logs count:", logs.logs ? logs.logs.length : 0);
    console.log("Gemini Audit Logs sample:", logs.logs ? logs.logs.slice(0, 3) : []);
  }
}

main().catch(err => console.error(err));
