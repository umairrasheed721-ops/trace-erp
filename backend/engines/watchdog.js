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

  let rawUrl = postex_track_url;
  if (!rawUrl || rawUrl.includes('v3/get-multiple')) {
    rawUrl = 'https://api.postex.pk/services/integration/api/order/v1/track-order/';
  }
  const baseUrl = rawUrl.replace(/\/?$/, '/');

  const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

  // Get PostEx shipper-advice/failed attempt orders > 12 hours old, not yet audited
  const alreadyAudited = new Set(
    db.prepare('SELECT tracking_number FROM watchdog_results WHERE store_id = ?').all(storeId).map(r => r.tracking_number)
  );

  const ADVICE_KEYWORDS = ['shipper advice', 'delivery under review', 'reattempt', 'undelivered', 'refused', 'incomplete address', 'consignee not available', 'attempt'];

  const candidates = db.prepare(`
    SELECT id, tracking_number, status_date, delivery_status, courier_status FROM orders
    WHERE store_id = ?
    AND LOWER(courier) = 'postex'
    AND status_date < ?
    AND tracking_number IS NOT NULL AND tracking_number != ''
  `).all(storeId, cutoff).filter(o => {
    if (alreadyAudited.has(o.tracking_number)) return false;
    const status = (o.delivery_status || '').toLowerCase();
    const courierStatus = (o.courier_status || '').toLowerCase();
    return ADVICE_KEYWORDS.some(kw => status.includes(kw) || courierStatus.includes(kw)) ||
           status.includes('return') || courierStatus.includes('return');
  });

  if (!candidates.length) return { audited: 0 };

  const CONCURRENT = 5;
  let audited = 0;

  const insertResult = db.prepare(`
    INSERT OR REPLACE INTO watchdog_results (store_id, tracking_number, request_time, latest_status, verdict, duration, evidence)
    VALUES (?,?,?,?,?,?,?)
  `);

  const chunks = (arr, size) => {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  for (const batch of chunks(candidates, CONCURRENT)) {
    const results = await Promise.allSettled(
      batch.map(async order => {
        let retries = 0;
        const trackUrl = `${baseUrl}${order.tracking_number}`;
        while (retries < 3) {
          try {
            const res = await fetch(trackUrl, {
              method: 'GET',
              headers: { 'token': postex_token, 'Content-Type': 'application/json' },
              timeout: 10000
            });
            if (res.status === 429 || res.status === 503) {
              await sleep(4000);
              retries++;
              continue;
            }
            if (!res.ok) return null;
            const data = await res.json();
            const distData = data?.dist || data;
            if (!distData) return null;

            const requestTime = new Date(order.status_date);
            const result = auditPostExOrder(distData, requestTime);
            return {
              tracking_number: order.tracking_number,
              requestTime,
              result
            };
          } catch (e) {
            retries++;
            await sleep(1000);
          }
        }
        return null;
      })
    );

    const rows = [];
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        const { tracking_number, requestTime, result } = r.value;
        rows.push([
          storeId, tracking_number,
          requestTime.toISOString(),
          result.latestStatus, result.verdict, result.duration, result.evidence
        ]);
        audited++;
      }
    }

    if (rows.length > 0) {
      const insertMany = db.transaction(items => {
        for (const item of items) insertResult.run(...item);
      });
      insertMany(rows);
    }

    await sleep(1200);
  }

  console.log(`🕵️ Watchdog [${store.shop_domain}]: Audited ${audited} PostEx orders`);
  return { audited };
}

// ─────────────────────────────────────────
// 🧠 TRI-LAYER AUDIT LOGIC (PostEx Only)
// ─────────────────────────────────────────
function auditPostExOrder(distData, requestTime) {
  try {
    const history = distData.trackingHistory || distData.transactionStatusHistory || [];
    const currentStatus = distData.transactionStatus || 'Unknown';

    const getMoveTime = h => h.dateTime || h.dateTimeStr || h.date || h.updatedAt || h.timestamp;
    const getMoveStatus = h => h.transactionStatus || h.transactionStatusMessage || '';

    const validMoves = history.filter(h => {
      const t = getMoveTime(h);
      return t && new Date(t) > requestTime;
    });

    if (!validMoves.length) {
      return { latestStatus: currentStatus, verdict: '🔴 IGNORED (No movement)', duration: 'N/A', evidence: 'Status unchanged since request' };
    }

    validMoves.sort((a, b) => new Date(getMoveTime(a)) - new Date(getMoveTime(b)));

    let enrouteTime = null;
    let attemptTime = null;

    for (const move of validMoves) {
      const st = getMoveStatus(move).toLowerCase();
      if (st.includes('enroute') || st.includes('out for delivery')) {
        enrouteTime = new Date(getMoveTime(move));
      } else if (enrouteTime && (st.includes('attempt') || st.includes('refused') || st.includes('return') || st.includes('undelivered') || st.includes('shipper advice') || st.includes('delivered'))) {
        attemptTime = new Date(getMoveTime(move));
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
