const fetch = require('node-fetch');
const { db } = require('../../db');
const { postexBreaker } = require('../circuit_breaker');
const { DEAD_STATUSES, EARLY_STATUSES, ATTEMPT_FAILURE_STATUSES, loadStatusMaps, applyMap } = require('./statusMapper');

const CONCURRENT = 5;
const BASE_SLEEP_MS = 1200;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const sleepWithJitter = async () => {
  const jitter = Math.floor(Math.random() * 800);
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
    SELECT id, ref_number, tracking_number, delivery_status FROM orders
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

  for (const batch of chunks(toProcess, CONCURRENT)) {
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
  
            let rawStatus = data?.dist?.transactionStatus
              || data?.transactionStatus
              || data?.data?.transactionStatus
              || data?.statusDescription
              || null;
  
            if (!rawStatus) {
              auditLogs.push({ id: order.tracking_number, status: 'FAILED', message: 'Status Missing in Response', details: JSON.stringify(data).substring(0, 200) });
              return null;
            }
            
            const mappedStatus = applyMap(statusMap, 'PostEx', rawStatus);
            return { id: order.id, oldStatus: order.delivery_status, rawStatus, mappedStatus };
          } catch (err) {
            await sleep(1000);
          }
        }
        return null;
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        const { id, rawStatus, mappedStatus, oldStatus } = r.value;
        if (!rawStatus) continue;
        const isProtected = DEAD_STATUSES.includes((oldStatus||'').toLowerCase());
        const isAttemptFailure = ATTEMPT_FAILURE_STATUSES.includes((rawStatus||'').toLowerCase());
        updatesToApply.push({
          id,
          courier_status: rawStatus,
          erp_status: (!isProtected && mappedStatus) ? mappedStatus : null,
          failed_attempt_increment: (!isProtected && isAttemptFailure) ? 1 : 0
        });
      }
    }
    
    processed += batch.length;
    const currentOrder = batch[0]?.ref_number || '';
    if (onProgress) onProgress('Syncing PostEx Tracking', processed, toProcess.length, currentOrder);

    await sleepWithJitter();
  }

  const updateStmt = db.prepare(`
    UPDATE orders
    SET courier_status = ?,
        delivery_status = CASE WHEN ? IS NOT NULL THEN ? ELSE delivery_status END,
        status_date = CASE WHEN ? IS NOT NULL THEN datetime('now') ELSE status_date END,
        failed_attempts = failed_attempts + ?
    WHERE id = ?
  `);
  const { broadcast } = require('../../sse');
  const lookupStmt = db.prepare('SELECT shopify_order_id, store_id FROM orders WHERE id = ?');
  const updateMany = db.transaction(items => {
    for (const u of items) {
      updateStmt.run(u.courier_status, u.erp_status, u.erp_status, u.erp_status, u.failed_attempt_increment || 0, u.id);
    }
  });
  updateMany(updatesToApply);
  for (const u of updatesToApply) {
    if (u.erp_status) {
      try {
        const row = lookupStmt.get(u.id);
        if (row) broadcast('order_updated', { storeId: row.store_id, shopifyOrderId: row.shopify_order_id });
      } catch(e) {}
    }
  }

  console.log(`✅ PostEx [${store.shop_domain}] [${syncType}]: Updated ${updatesToApply.length} / ${toProcess.length} orders`);
  return { updated: updatesToApply.length, logs: auditLogs, total: toProcess.length, failed: auditLogs.length };
}

module.exports = { syncPostEx };
