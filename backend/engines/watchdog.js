const fetch = require('node-fetch');
const db = require('../db');

const sleep = ms => new Promise(r => setTimeout(r, ms));

function formatTime(dateObj) {
  return dateObj.toTimeString().slice(0, 5);
}

// 🐕 WATCHDOG: Only runs on PostEx orders (as confirmed by user)
async function runWatchdog(store) {
  const { id: storeId } = store;

  // We look back up to 14 days and check orders that are > 12 hours old
  const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

  // Find candidates directly via SQL: must have tracking_history populated in the database
  const candidates = db.prepare(`
    SELECT id, tracking_number, status_date, order_date, delivery_status, courier_status, tracking_history 
    FROM orders
    WHERE store_id = ?
      AND LOWER(courier) = 'postex'
      AND status_date > datetime('now', '-14 days')
      AND status_date < ?
      AND tracking_history IS NOT NULL AND tracking_history != '' AND tracking_history != '[]'
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
    LIMIT 200
  `).all(storeId, cutoff, storeId);

  if (!candidates.length) {
    return { audited: 0, candidatesCount: 0 };
  }

  let audited = 0;
  const rows = [];

  const insertResult = db.prepare(`
    INSERT OR REPLACE INTO watchdog_results (store_id, tracking_number, request_time, latest_status, verdict, duration, evidence)
    VALUES (?,?,?,?,?,?,?)
  `);

  for (const order of candidates) {
    try {
      const history = JSON.parse(order.tracking_history);
      if (!Array.isArray(history) || history.length === 0) continue;

      const requestTime = new Date(order.status_date || order.order_date || Date.now());
      // We pass the parsed tracking history inside an object containing 'trackingHistory' matching the audit parser format
      const result = auditPostExOrder({ 
        trackingHistory: history, 
        transactionStatus: order.courier_status || order.delivery_status 
      }, requestTime);
      
      rows.push([
        storeId, 
        order.tracking_number,
        requestTime.toISOString(),
        result.latestStatus, 
        result.verdict, 
        result.duration, 
        result.evidence
      ]);
      audited++;
    } catch (e) {
      console.error(`[Watchdog Offline Engine Error] Parsing failed for ${order.tracking_number}:`, e.message);
    }
  }

  if (rows.length > 0) {
    const insertMany = db.transaction(items => {
      for (const item of items) insertResult.run(...item);
    });
    insertMany(rows);
  }

  console.log(`🕵️ Offline Watchdog [Store ID ${storeId}]: Audited ${audited} PostEx orders from database`);
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

module.exports = { runWatchdog, auditPostExOrder };
