const fetch = require('../fetch');
const { db } = require('../../db');
const { postexBreaker } = require('../circuit_breaker');
const { DEAD_STATUSES, EARLY_STATUSES, ATTEMPT_FAILURE_STATUSES, loadStatusMaps, applyMap } = require('./statusMapper');
const { auditPostExOrder } = require('../watchdog');

const CONCURRENT = 5;
const BASE_SLEEP_MS = 600;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const sleepWithJitter = async () => {
  const jitter = Math.floor(Math.random() * 400);
  await new Promise(r => setTimeout(r, BASE_SLEEP_MS + jitter));
};

function chunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function syncPostEx(store, syncType = 'FULL', onProgress) {
  const { id: storeId, postex_token, postex_track_url } = store;
  if (!postex_token) {
    console.log(`⚠️ PostEx: No token for store ${store.shop_domain}`);
    return { updated: 0 };
  }

  let rawUrl = postex_track_url;
  if (!rawUrl || rawUrl.includes('v3/get-multiple')) {
    rawUrl = 'https://api.postex.pk/services/integration/api/order/v1/track-order/';
  }
  const baseUrl = rawUrl.replace(/\/?$/, '/');

  const orders = db.prepare(`
    SELECT id, ref_number, tracking_number, delivery_status, status_date, order_date FROM orders
    WHERE store_id = ? AND tracking_number IS NOT NULL AND tracking_number != ''
    AND (LOWER(courier) IN ('postex', 'post ex') OR courier IS NULL OR courier = '')
  `).all(storeId);

  const toProcess = orders.filter(o => {
    const st = (o.delivery_status || '').toLowerCase();
    if (DEAD_STATUSES.includes(st)) return false;
    if (syncType === 'SMART' && EARLY_STATUSES.includes(st)) {
      const tn = String(o.tracking_number || '').trim();
      const hasRealTracking = tn && tn !== '—';
      if (!hasRealTracking) return false;
    }
    return true;
  });

  if (!toProcess.length) {
    console.log(`ℹ️ PostEx [${store.shop_domain}]: No orders to sync`);
    return { updated: 0 };
  }

  console.log(`🔄 PostEx [${store.shop_domain}]: Syncing ${toProcess.length} orders...`);
  const updatesToApply = [];
  const auditLogs = [];
  let processed = 0;
  const statusMap = loadStatusMaps();

  const batchChunks = chunks(toProcess, CONCURRENT);
  for (let idx = 0; idx < batchChunks.length; idx++) {
    const batch = batchChunks[idx];
    if (global.syncProgress && global.syncProgress[storeId] && global.syncProgress[storeId].abort) {
      console.log(`🛑 PostEx Sync aborted by user`);
      auditLogs.push({ id: 'SYSTEM', status: 'ABORTED', message: 'Sync stopped by user', details: `Processed ${processed}/${toProcess.length}` });
      break;
    }

    const results = await Promise.allSettled(
      batch.map(async order => {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const res = await postexBreaker.execute(async () => {
              const fetchRes = await fetch(`${baseUrl}${order.tracking_number}`, {
                method: 'GET',
                headers: { 'token': postex_token, 'Content-Type': 'application/json' },
              });
              if (!fetchRes.ok && (fetchRes.status >= 500 || fetchRes.status === 429)) {
                throw new Error(`HTTP ${fetchRes.status}`);
              }
              return fetchRes;
            });

            if (res.status === 429 || res.status === 503) {
              await sleep(4000);
              continue;
            }

            if (!res.ok) {
              auditLogs.push({ id: order.tracking_number, status: 'FAILED', message: `API Error ${res.status}`, details: `Courier: PostEx` });
              return null;
            }
  
            const data = await res.json();
            const distData = data?.dist || data;
  
            let statusDate = null;
            let latestHistoryStatus = null;
            const history = data?.dist?.transactionStatusHistory 
              || data?.transactionStatusHistory 
              || data?.data?.transactionStatusHistory 
              || data?.dist?.trackingHistory 
              || data?.trackingHistory 
              || data?.data?.trackingHistory 
              || [];

            if (Array.isArray(history) && history.length > 0) {
              const sorted = [...history].sort((a, b) => {
                const dateA = new Date(a.dateTime || a.date || a.timestamp || a.updatedAt);
                const dateB = new Date(b.dateTime || b.date || b.timestamp || b.updatedAt);
                return dateA - dateB;
              });
              const latest = sorted[sorted.length - 1];
              statusDate = latest?.dateTime || latest?.date || latest?.timestamp || latest?.updatedAt || null;
              latestHistoryStatus = latest?.transactionStatusMessage || latest?.statusMessage || latest?.message || latest?.status || null;
            }

            let rawStatus = latestHistoryStatus
              || distData?.transactionStatus
              || data?.transactionStatus
              || data?.data?.transactionStatus
              || data?.statusDescription
              || null;
   
            if (!rawStatus) {
              auditLogs.push({ id: order.tracking_number, status: 'FAILED', message: 'Status Missing in Response', details: JSON.stringify(data).substring(0, 200) });
              return null;
            }
            
            const mappedStatus = applyMap(statusMap, 'PostEx', rawStatus);
            
            if (!statusDate) {
              statusDate = data?.dist?.statusDateTime 
                || data?.statusDateTime 
                || data?.dist?.transactionDateTime 
                || data?.transactionDateTime 
                || data?.dist?.dateTime 
                || data?.dateTime 
                || null;
            }
            let formattedStatusDate = null;
            if (statusDate) {
              const d = new Date(statusDate);
              if (!isNaN(d.getTime())) {
                const pad = n => String(n).padStart(2, '0');
                formattedStatusDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
              }
            }


            // Watchdog Rider Fraud Audit (PostEx candidate status match)
            let watchdogResult = null;
            const statusLower = (rawStatus || '').toLowerCase();
            const ADVICE_KEYWORDS = [
              'attempt', 'failed', 'refused', 'undelivered', 'reattempt', 
              'shipper advice', 'return', 'delivery under review', 
              'incomplete address', 'consignee not available', 'review'
            ];
            const needsWatchdog = ADVICE_KEYWORDS.some(kw => statusLower.includes(kw));
            if (needsWatchdog && distData) {
              try {
                const requestTime = new Date(order.status_date || order.order_date || Date.now());
                const auditRes = auditPostExOrder(distData, requestTime);
                watchdogResult = {
                  tracking_number: order.tracking_number,
                  request_time: requestTime.toISOString(),
                  latest_status: auditRes.latestStatus,
                  verdict: auditRes.verdict,
                  duration: auditRes.duration,
                  evidence: auditRes.evidence
                };
              } catch (e) {
                console.error(`[Watchdog Sync Audit Error] Exception for ${order.tracking_number}:`, e.message);
              }
            }

            const trackingHistoryJson = history && history.length > 0 ? JSON.stringify(history) : null;
            return { 
              id: order.id, 
              oldStatus: order.delivery_status, 
              rawStatus, 
              mappedStatus, 
              statusDate: formattedStatusDate,
              trackingHistoryJson,
              watchdogResult
            };
          } catch (err) {
            await sleep(1000);
          }
        }
        return null;
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        const { id, rawStatus, mappedStatus, oldStatus, statusDate, trackingHistoryJson, watchdogResult } = r.value;
        if (!rawStatus) continue;
        const isProtected = DEAD_STATUSES.includes((oldStatus||'').toLowerCase());
        const isAttemptFailure = ATTEMPT_FAILURE_STATUSES.includes((rawStatus||'').toLowerCase());
        updatesToApply.push({
          id,
          courier_status: rawStatus,
          erp_status: (!isProtected && mappedStatus) ? mappedStatus : null,
          failed_attempt_increment: (!isProtected && isAttemptFailure) ? 1 : 0,
          status_date: statusDate,
          tracking_history: trackingHistoryJson,
          watchdogResult
        });
      }
    }
    
    processed += batch.length;
    const currentOrder = batch[0]?.ref_number || '';
    if (onProgress) onProgress('Syncing PostEx Tracking', processed, toProcess.length, currentOrder);

    if (idx < batchChunks.length - 1) {
      await sleepWithJitter();
    }
  }

  const updateStmt = db.prepare(`
    UPDATE orders
    SET courier_status = ?,
        delivery_status = CASE WHEN ? IS NOT NULL THEN ? ELSE delivery_status END,
        status_date = CASE WHEN ? IS NOT NULL THEN ? ELSE status_date END,
        failed_attempts = failed_attempts + ?,
        tracking_history = ?
    WHERE id = ?
  `);
  const insertWatchdogStmt = db.prepare(`
    INSERT OR REPLACE INTO watchdog_results (store_id, tracking_number, request_time, latest_status, verdict, duration, evidence)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const { broadcast } = require('../../sse');
  const lookupStmt = db.prepare('SELECT shopify_order_id, store_id FROM orders WHERE id = ?');
  const updateMany = db.transaction(items => {
    for (const u of items) {
      updateStmt.run(u.courier_status, u.erp_status, u.erp_status, u.status_date, u.status_date, u.failed_attempt_increment || 0, u.tracking_history, u.id);
      if (u.watchdogResult) {
        const w = u.watchdogResult;
        insertWatchdogStmt.run(storeId, w.tracking_number, w.request_time, w.latest_status, w.verdict, w.duration, w.evidence);
      }
    }
  });
  updateMany(updatesToApply);
  if (updatesToApply.length > 5) {
    try {
      broadcast('orders_bulk_updated', {
        storeId,
        updates: updatesToApply.map(u => ({ orderId: u.id, erpStatus: u.erp_status }))
      });
    } catch(e) {}
  } else {
    for (const u of updatesToApply) {
      if (u.erp_status) {
        try {
          const row = lookupStmt.get(u.id);
          if (row) broadcast('order_updated', { storeId: row.store_id, shopifyOrderId: row.shopify_order_id });
        } catch(e) {}
      }
    }
  }

  console.log(`✅ PostEx [${store.shop_domain}] [${syncType}]: Updated ${updatesToApply.length} / ${toProcess.length} orders`);
  return { updated: updatesToApply.length, logs: auditLogs, total: toProcess.length, failed: auditLogs.length };
}

module.exports = { syncPostEx };
