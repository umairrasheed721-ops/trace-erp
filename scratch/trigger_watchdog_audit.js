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

  const storeId = 12; // ID of Trace store
  console.log(`🔐 Authenticated. Triggering Watchdog run for store ${storeId} on production...`);
  
  const runRes = await fetch(`${API_BASE}/api/watchdog/run`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}` 
    },
    body: JSON.stringify({ store_id: storeId })
  });
  
  console.log("Run HTTP status:", runRes.status);
  const runResult = await runRes.json();
  console.log("Run result:", JSON.stringify(runResult, null, 2));

  // Now fetch the latest watchdog results to see the verdict and couriers!
  console.log("\nFetching watchdog results from /api/watchdog...");
  const getRes = await fetch(`${API_BASE}/api/watchdog?store_id=${storeId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (getRes.ok) {
    const results = await getRes.json();
    console.log(`Found ${results.length} total watchdog results in database.`);
    
    // Group by verdict
    const verdicts = {};
    for (const r of results) {
      verdicts[r.verdict] = (verdicts[r.verdict] || 0) + 1;
    }
    console.log("\nVerdicts breakdown:", verdicts);

    // Print top 15 results
    console.log("\nSample watchdog records (latest 15):");
    console.log(results.slice(0, 15).map(r => ({
      ref_number: r.ref_number,
      tracking_number: r.tracking_number,
      verdict: r.verdict,
      duration: r.duration,
      evidence: r.evidence,
      created_at: r.created_at
    })));
  } else {
    console.error(`❌ Failed to fetch watchdog results: ${getRes.status}`);
  }
}

main().catch(err => console.error(err));
