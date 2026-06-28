const fetch = require('node-fetch');

const API_BASE = 'https://trace-erp-production.up.railway.app';

async function main() {
  console.log('📡 Pinging production server...');
  try {
    const res = await fetch(`${API_BASE}/api/public/health`, { timeout: 5000 });
    console.log(`HTTP Status: ${res.status}`);
    const text = await res.text();
    console.log(`Response: ${text.substring(0, 100)}`);
  } catch (err) {
    try {
      const res = await fetch(`${API_BASE}/`, { timeout: 5000 });
      console.log(`Home Page HTTP Status: ${res.status}`);
    } catch (e) {
      console.error('❌ Ping failed:', err.message);
    }
  }
}

main().catch(err => console.error(err));
