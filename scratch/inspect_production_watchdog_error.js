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

  console.log(`🔐 Authenticated.`);

  // Let's check system logs from production!
  console.log('📡 Fetching system logs...');
  const logsRes = await fetch(`${API_BASE}/api/diagnostics/logs`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (logsRes.ok) {
    const logs = await logsRes.json();
    console.log("Recent system logs:");
    console.table(logs.slice(0, 10).map(l => ({ module: l.module, message: l.message, level: l.level })));
  }

  // Let's run a test query on one order to see if it works or fails
  const testTn = "26120050024859"; // From store 12 candidate list
  const getStores = await fetch(`${API_BASE}/api/stores`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const stores = await getStores.json();
  const store = stores[0];
  const postex_token = store.postex_token;

  console.log(`\nTesting manual audit for tracking number ${testTn}...`);
  const url = `https://api.postex.pk/services/integration/api/order/v1/track-order/${testTn}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'token': postex_token, 'Content-Type': 'application/json' },
      timeout: 10000
    });
    console.log("Fetch Status:", res.status);
    const data = await res.json();
    const distData = data?.dist || data;
    
    // Simulate the audit logic
    const requestTime = new Date('2026-06-18T10:00:00.000Z');
    const result = auditPostExOrder(distData, requestTime);
    console.log("Audited Result:", result);
  } catch (err) {
    console.error("Error during manual audit test:", err);
  }
}

function formatTime(dateObj) {
  return dateObj.toTimeString().slice(0, 5);
}

function auditPostExOrder(distData, requestTime) {
  try {
    const history = distData.trackingHistory || distData.transactionStatusHistory || distData.statusHistory || [];
    const currentStatus = distData.transactionStatus || distData.status || 'Unknown';

    const getMoveTime = h => h.dateTime || h.dateTimeStr || h.date || h.updatedAt || h.timestamp;
    const getMoveStatus = h => h.transactionStatus || h.transactionStatusMessage || h.status || '';

    const validMoves = history.filter(h => {
      const t = getMoveTime(h);
      return t && new Date(t) > requestTime;
    });

    console.log(`History count: ${history.length}, Valid moves count (after ${requestTime.toISOString()}): ${validMoves.length}`);

    if (!validMoves.length) {
      return { 
        latestStatus: currentStatus, 
        verdict: '🔴 IGNORED (No movement)', 
        duration: 'N/A', 
        evidence: 'Status unchanged since request' 
      };
    }

    validMoves.sort((a, b) => new Date(getMoveTime(a)) - new Date(getMoveTime(b)));

    let enrouteTime = null;
    let attemptTime = null;

    for (const move of validMoves) {
      const st = getMoveStatus(move).toLowerCase();
      const timeVal = new Date(getMoveTime(move));
      console.log(`- Status: "${st}" at ${timeVal.toISOString()}`);

      if (st.includes('enroute') || st.includes('out for delivery') || st.includes('dispatched')) {
        enrouteTime = timeVal;
      } else if (enrouteTime && (
        st.includes('attempt') || 
        st.includes('refused') || 
        st.includes('return') || 
        st.includes('undelivered') || 
        st.includes('shipper advice') || 
        st.includes('delivered') ||
        st.includes('failed')
      )) {
        attemptTime = timeVal;
        break;
      }
    }

    console.log(`enrouteTime: ${enrouteTime ? enrouteTime.toISOString() : 'none'}, attemptTime: ${attemptTime ? attemptTime.toISOString() : 'none'}`);

    if (enrouteTime && attemptTime) {
      const diffMs = attemptTime - enrouteTime;
      const diffMins = Math.floor(diffMs / 60000);
      const hourOfDay = attemptTime.getHours();
      const evidence = `${formatTime(enrouteTime)} ➡️ ${formatTime(attemptTime)}`;

      if (diffMins <= 0) {
        return { latestStatus: currentStatus, verdict: '🔴 FAKE: INSTANT CLOSE', duration: `${diffMins} mins`, evidence };
      }
      if (diffMins < 30) {
        return { latestStatus: currentStatus, verdict: '🔴 FAKE: IMPOSSIBLE SPEED', duration: `${diffMins} mins`, evidence };
      }
      if (hourOfDay >= 21) {
        return { latestStatus: currentStatus, verdict: '🟠 SUSPICIOUS: LATE BULK CLOSE', duration: `${Math.floor(diffMins / 60)} hrs`, evidence };
      }
      return { latestStatus: currentStatus, verdict: '🟢 VERIFIED ATTEMPT', duration: `${Math.floor(diffMins / 60)}h ${diffMins % 60}m`, evidence };
    }

    return { latestStatus: currentStatus, verdict: '⚪ Moving / No Attempt Yet', duration: 'Pending', evidence: 'Enroute but no final status recorded' };
  } catch (e) {
    return { latestStatus: 'Error', verdict: '❌ Parse Error', duration: '-', evidence: e.message };
  }
}

main().catch(err => console.error(err));
