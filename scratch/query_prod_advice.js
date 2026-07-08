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

  // Fetch the remote error/system logs from the diagnostics endpoint
  // Let's check how DiagnosticCenter fetches logs. In frontend, it calls:
  // fetch("/api/diagnostics/logs")
  const logsRes = await fetch(`${API_BASE}/api/diagnostics/logs`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (logsRes.ok) {
    const logs = await logsRes.json();
    console.log("Last 20 System Logs:");
    console.log(JSON.stringify(logs.slice(0, 20), null, 2));
  } else {
    console.log("Failed to fetch logs:", logsRes.status, await logsRes.text());
  }
}

main().catch(console.error);
