const fetch = require('node-fetch');
const db = require('../db');

const sleep = ms => new Promise(r => setTimeout(r, ms));

function formatTime(dateObj) {
  return dateObj.toTimeString().slice(0, 5);
}

// 🐕 WATCHDOG: Only runs on PostEx orders (as confirmed by user)
async function runWatchdog(store) {
  const { id: storeId, postex_token, postex_track_url } = store;
  if (!postex_token) return { audited: 0 };

  const trackUrl = postex_track_url || 'https://api.postex.pk/services/integration/api/order/v3/get-multiple-order-detail-by-tracking-numbers';
  const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

  // Get PostEx shipper-advice orders > 12 hours old, not yet audited
  const alreadyAudited = new Set(
    db.prepare('SELECT tracking_number FROM watchdog_results WHERE store_id = ?').all(storeId).map(r => r.tracking_number)
  );

  const ADVICE_KEYWORDS = ['shipper advice', 'delivery under review', 'reattempt', 'undelivered', 'refused', 'incomplete address', 'consignee not available', 'attempt'];

  const candidates = db.prepare(`
    SELECT id, tracking_number, status_date FROM orders
    WHERE store_id = ?
    AND LOWER(courier) = 'postex'
    AND status_date < ?
    AND tracking_number IS NOT NULL AND tracking_number != ''
  `).all(storeId, cutoff).filter(o => {
    if (alreadyAudited.has(o.tracking_number)) return false;
    return true;
  });

  if (!candidates.length) return { audited: 0 };

  const CHUNK_SIZE = 50;
  let audited = 0;

  const insertResult = db.prepare(`
    INSERT OR REPLACE INTO watchdog_results (store_id, tracking_number, request_time, latest_status, verdict, duration, evidence)
    VALUES (?,?,?,?,?,?,?)
  `);

  for (let i = 0; i < candidates.length; i += CHUNK_SIZE) {
    const chunk = candidates.slice(i, i + CHUNK_SIZE);
    const trackingNumbers = chunk.map(o => o.tracking_number);

    let responses = null;
    let retries = 0;
    while (retries < 3) {
      try {
        const res = await fetch(trackUrl, {
          method: 'POST',
          headers: { 'token': postex_token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ trackingNumbers })
        });
        if (res.status === 429 || res.status === 503) { await sleep(4000); retries++; continue; }
        const data = await res.json();
        responses = data.dist || [];
        break;
      } catch (e) { retries++; }
    }

    if (!responses) continue;

    const insertMany = db.transaction(items => {
      for (const item of items) insertResult.run(...item);
    });

    const rows = [];
    for (const order of chunk) {
      const distData = responses.find(r => r.trackingNumber === order.tracking_number);
      if (!distData) continue;

      const requestTime = new Date(order.status_date);
      const result = auditPostExOrder(distData, requestTime);

      rows.push([
        storeId, order.tracking_number,
        requestTime.toISOString(),
        result.latestStatus, result.verdict, result.duration, result.evidence
      ]);
      audited++;
    }

    insertMany(rows);
    await sleep(1000);
  }

  console.log(`🕵️ Watchdog [${store.shop_domain}]: Audited ${audited} PostEx orders`);
  return { audited };
}

// ─────────────────────────────────────────
// 🧠 TRI-LAYER AUDIT LOGIC (PostEx Only)
// ─────────────────────────────────────────
function auditPostExOrder(distData, requestTime) {
  try {
    const history = distData.trackingHistory || [];
    const currentStatus = distData.transactionStatus || 'Unknown';

    const validMoves = history.filter(h => new Date(h.dateTime) > requestTime);

    if (!validMoves.length) {
      return { latestStatus: currentStatus, verdict: '🔴 IGNORED (No movement)', duration: 'N/A', evidence: 'Status unchanged since request' };
    }

    validMoves.sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));

    let enrouteTime = null;
    let attemptTime = null;

    for (const move of validMoves) {
      const st = (move.transactionStatus || '').toLowerCase();
      if (st.includes('enroute') || st.includes('out for delivery')) {
        enrouteTime = new Date(move.dateTime);
      } else if (enrouteTime && (st.includes('attempt') || st.includes('refused') || st.includes('return'))) {
        attemptTime = new Date(move.dateTime);
        break;
      }
    }

    if (enrouteTime && attemptTime) {
      const diffMs = attemptTime - enrouteTime;
      const diffMins = Math.floor(diffMs / 60000);
      const hourOfDay = attemptTime.getHours();
      const evidence = `${formatTime(enrouteTime)} ➡️ ${formatTime(attemptTime)}`;

      // Layer 1: Speed Trap
      if (diffMins < 30) return { latestStatus: currentStatus, verdict: '🔴 FAKE: IMPOSSIBLE SPEED', duration: `${diffMins} mins`, evidence };
      // Layer 2: Night Owl
      if (hourOfDay >= 21) return { latestStatus: currentStatus, verdict: '🟠 SUSPICIOUS: LATE BULK CLOSE', duration: `${Math.floor(diffMins / 60)} hrs`, evidence };
      // Layer 3: Verified
      return { latestStatus: currentStatus, verdict: '🟢 VERIFIED ATTEMPT', duration: `${Math.floor(diffMins / 60)}h ${diffMins % 60}m`, evidence };
    }

    return { latestStatus: currentStatus, verdict: '⚪ Moving / No Attempt Yet', duration: 'Pending', evidence: 'Enroute but no result' };
  } catch (e) {
    return { latestStatus: 'Error', verdict: '❌ Parse Error', duration: '-', evidence: e.message };
  }
}

module.exports = { runWatchdog };
