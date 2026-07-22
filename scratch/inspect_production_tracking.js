const fetch = require('node-fetch');

const API_BASE = 'https://trace-erp-production.up.railway.app';

async function main() {
  const url = `${API_BASE}/api/diagnostics/order-full-details/20120050024922`;
  try {
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      console.log('Order:', data.order);
      console.log('History:', data.history);
      console.log('Recon Logs:', data.reconLogs);
    } else {
      console.error('Failed to fetch:', res.status);
    }
  } catch (e) {
    console.error('Error fetching details:', e.message);
  }
}

main();
