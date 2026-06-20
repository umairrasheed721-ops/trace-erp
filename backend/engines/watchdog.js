const fetch = require('node-fetch');
const db = require('../db');

const sleep = ms => new Promise(r => setTimeout(r, ms));

function formatTime(dateObj) {
  return dateObj.toTimeString().slice(0, 5);
}

// 🐕 WATCHDOG: Only runs on PostEx orders (as confirmed by user)
async function runWatchdog(store) {
  const { id: storeId, postex_token, postex_track_url } = store;
  if (!postex_token) return { audited: 0, reason: 'No PostEx token found' };

  let rawUrl = postex_track_url;
  if (!rawUrl || rawUrl.includes('v3/get-multiple')) {
    rawUrl = 'https://api.postex.pk/services/integration/api/order/v1/track-order/';
  }
  const baseUrl = rawUrl.replace(/\/?$/, '/');

  // We look back up to 14 days and check orders that are > 12 hours old
  const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

  // Find candidates directly via SQL: avoids scanning historical orders or JS filtering
  const candidates = db.prepare(`
    SELECT id, tracking_number, status_date, delivery_status, courier_status 
    FROM orders
    WHERE store_id = ?
      AND LOWER(courier) = 'postex'
      AND status_date > datetime('now', '-14 days')
      AND status_date < ?
      AND tracking_number IS NOT NULL AND tracking_number != ''
      AND tracking_number NOT IN (SELECT tracking_number FROM watchdog_results WHERE store_id = ?)
      AND (
        LOWER(delivery_status) LIKE '%shipper advice%' OR
        LOWER(delivery_status) LIKE '%attempt%' OR
        LOWER(delivery_status) LIKE '%reattempt%' OR
        LOWER(delivery_status) LIKE '%refused%' OR
        LOWER(delivery_status) LIKE '%undelivered%' OR
        LOWER(delivery_status) LIKE '%return%' OR
        LOWER(courier_status) LIKE '%shipper advice%' OR
        LOWER(courier_status) LIKE '%attempt%' OR
        LOWER(courier_status) LIKE '%reattempt%' OR
        LOWER(courier_status) LIKE '%refused%' OR
        LOWER(courier_status) LIKE '%undelivered%' OR
        LOWER(courier_status) LIKE '%return%'
      )
    ORDER BY status_date DESC
    LIMIT 50
  `).all(storeId, cutoff, storeId);

  if (!candidates.length) {
    return { audited: 0, candidatesCount: 0 };
  }

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
              headers: { 
                'token': postex_token, 
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9'
              },
              timeout: 10000
            });
            if (res.status === 429 || res.status === 503) {
              await sleep(4000);
              retries++;
              continue;
            }
            if (!res.ok) {
              console.warn(`[Watchdog Debug] Tracking response not OK (${res.status}) for ${order.tracking_number}`);
              return null;
            }
            const data = await res.json();
            const distData = data?.dist || data;
            if (!distData) {
              console.warn(`[Watchdog Debug] Missing dist data in response for ${order.tracking_number}`);
              return null;
            }

            const requestTime = new Date(order.status_date);
            const result = auditPostExOrder(distData, requestTime);
            return {
              tracking_number: order.tracking_number,
              requestTime,
              result
            };
          } catch (e) {
            console.error(`[Watchdog Debug Error] Exception for ${order.tracking_number}:`, e.message);
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

  console.log(`🕵️ Watchdog [Store ID ${storeId}]: Audited ${audited} PostEx orders`);
  return { 
    audited, 
    candidatesCount: candidates.length, 
    cutoff
  };
}

// ─────────────────────────────────────────
// 🧠 TRI-LAYER AUDIT LOGIC (PostEx Only)
// ─────────────────────────────────────────
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

    if (enrouteTime && attemptTime) {
      const diffMs = attemptTime - enrouteTime;
      const diffMins = Math.floor(diffMs / 60000);
      const hourOfDay = attemptTime.getHours();
      const evidence = `${formatTime(enrouteTime)} ➡️ ${formatTime(attemptTime)}`;

      // Layer 3: Instant/Negative Delta
      if (diffMins <= 0) {
        return { 
          latestStatus: currentStatus, 
          verdict: '🔴 FAKE: INSTANT CLOSE', 
          duration: `${diffMins} mins`, 
          evidence 
        };
      }

      // Layer 1: Speed Trap
      if (diffMins < 30) {
        return { 
          latestStatus: currentStatus, 
          verdict: '🔴 FAKE: IMPOSSIBLE SPEED', 
          duration: `${diffMins} mins`, 
          evidence 
        };
      }

      // Layer 2: Night Owl
      if (hourOfDay >= 21) {
        return { 
          latestStatus: currentStatus, 
          verdict: '🟠 SUSPICIOUS: LATE BULK CLOSE', 
          duration: `${Math.floor(diffMins / 60)} hrs`, 
          evidence 
        };
      }

      // Layer 4: Verified
      return { 
        latestStatus: currentStatus, 
        verdict: '🟢 VERIFIED ATTEMPT', 
        duration: `${Math.floor(diffMins / 60)}h ${diffMins % 60}m`, 
        evidence 
      };
    }

    return { 
      latestStatus: currentStatus, 
      verdict: '⚪ Moving / No Attempt Yet', 
      duration: 'Pending', 
      evidence: 'Enroute but no final status recorded' 
    };
  } catch (e) {
    return { 
      latestStatus: 'Error', 
      verdict: '❌ Parse Error', 
      duration: '-', 
      evidence: e.message 
    };
  }
}

module.exports = { runWatchdog };
