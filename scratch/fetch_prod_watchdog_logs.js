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

  console.log(`🔐 Authenticated. Triggering watchdog run in production...`);
  const runRes = await fetch(`${API_BASE}/api/watchdog/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ store_id: 12 })
  });
  console.log("Run trigger status:", runRes.status, await runRes.json());

  console.log("Waiting 3 seconds for logs to write...");
  await new Promise(r => setTimeout(r, 3000));

  console.log('📡 Fetching recent system logs...');
  const logsRes = await fetch(`${API_BASE}/api/diagnostics/logs`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (logsRes.ok) {
    const logs = await logsRes.json();
    console.log(`Retrieved ${logs.length} logs. Filtering for Watchdog or error logs:`);
    const filtered = logs.filter(l => 
      l.module?.toLowerCase().includes('watchdog') || 
      l.message?.toLowerCase().includes('watchdog') ||
      l.message?.toLowerCase().includes('debug')
    );
    console.table(filtered.map(l => ({
      created_at: l.created_at,
      module: l.module,
      message: l.message,
      level: l.level
    })));
  }
}

main().catch(err => console.error(err));
