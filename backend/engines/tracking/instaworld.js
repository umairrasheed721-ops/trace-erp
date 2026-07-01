const { db } = require('../../db');
const { instaworldFetch } = require('../instaworld_http');
const { instaworldBreaker } = require('../circuit_breaker');
const { DEAD_STATUSES, EARLY_STATUSES, ATTEMPT_FAILURE_STATUSES, loadStatusMaps, applyMap } = require('./statusMapper');

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

async function syncInstaworld(store, syncType = 'FULL', onProgress) {
  const { id: storeId, instaworld_key, instaworld_key_backup, instaworld_track_url } = store;
  if (!instaworld_key) {
    console.log(`⚠️ Instaworld: No key for store ${store.shop_domain}`);
    return { updated: 0, logs: [{ id: 'CONFIG', status: 'FAILED', message: 'No Instaworld Key', details: 'Check store settings' }], failed: 1 };
  }

  let trackUrl = instaworld_track_url || 'https://one-be.instaworld.pk/logistics/v1/trackShipment';
  if (trackUrl.includes('one.instaworld.pk/track')) {
    trackUrl = 'https://one-be.instaworld.pk/logistics/v1/trackShipment';
  }
  const apiKeys = [instaworld_key, instaworld_key_backup, store.instaworld_key_3].filter(Boolean);

  const orders = db.prepare(`
    SELECT id, ref_number, tracking_number, delivery_status FROM orders
    WHERE store_id = ? AND tracking_number IS NOT NULL AND tracking_number != ''
    AND (
      TRIM(LOWER(courier)) IN ('instaworld', 'insta world', 'instalogistics', 'insta logistics', 'leopards', 'lcs', 'tcs', 'private rider')
      OR courier LIKE '%Insta%' 
      OR courier LIKE '%Leopard%'
      OR courier LIKE '%TCS%'
      OR courier IS NULL 
      OR courier = ''
    )
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
    console.log(`ℹ️ Instaworld [${store.shop_domain}]: No orders to sync`);
    return { updated: 0, logs: [], total: 0, failed: 0 };
  }
  
  const auditLogs = [];

  const trackOne = async (order, apiKey) => {
    try {
      const res = await instaworldBreaker.execute(async () => {
        const fetchRes = await instaworldFetch(trackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tracking_number: String(order.tracking_number).trim(),
            api_key: apiKey
          }),
          proxyUrl: store.gas_proxy_url,
        });
        if (!fetchRes.ok && (fetchRes.status >= 500 || fetchRes.status === 429)) {
          throw new Error(`HTTP ${fetchRes.status}`);
        }
        return fetchRes;
      });

      if (!res.ok) {
        auditLogs.push({ id: order.tracking_number, status: 'FAILED', message: `API Error ${res.status}`, details: `Courier: Instaworld` });
        return { status: res.status, order, newStatus: null };
      }

      const data = await res.json();
      let rawStatus = null;

      if (Array.isArray(data) && data.length > 0) {
        rawStatus = data[data.length - 1]?.status || data[data.length - 1]?.statusDescription;
      } else if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
        rawStatus = data.data[data.data.length - 1]?.status;
      } else if (data?.status) {
        rawStatus = data.status;
      }

      let courierName = null;
      if (Array.isArray(data) && data.length > 0) {
        courierName = data[data.length - 1]?.courier_name || data[data.length - 1]?.vendor_name;
      } else if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
        courierName = data.data[data.data.length - 1]?.courier_name || data.data[data.data.length - 1]?.vendor_name;
      }
      
      if (!courierName && order.tracking_number) {
        const tn = String(order.tracking_number).toUpperCase();
        if (tn.startsWith('LE') || tn.startsWith('LCS')) courierName = 'Leopards';
        else if (tn.match(/^[0-9]{11,12}$/)) courierName = 'TCS';
      }

      if (!rawStatus) {
        auditLogs.push({ id: order.tracking_number, status: 'FAILED', message: 'Status Missing in Response', details: JSON.stringify(data).substring(0, 200) });
        return { status: 200, order, newStatus: null, courierName };
      }

      const lowerRaw = String(rawStatus).toLowerCase();
      const statusMap = loadStatusMaps();
      let newStatus = applyMap(statusMap, courierName || 'Instaworld', lowerRaw) || null;
      
      if (newStatus && newStatus.toLowerCase() === 'return received') {
         newStatus = 'Returned';
      }

      // Extract status date from Instaworld / Leopards / TCS response
      let statusDate = null;
      let lastEvent = null;
      if (Array.isArray(data) && data.length > 0) {
        lastEvent = data[data.length - 1];
      } else if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
        lastEvent = data.data[data.data.length - 1];
      } else {
        lastEvent = data;
      }
      
      if (lastEvent) {
        statusDate = lastEvent.dateTime 
          || lastEvent.dateTimeString 
          || lastEvent.status_date 
          || lastEvent.status_datetime 
          || lastEvent.time 
          || lastEvent.timestamp 
          || lastEvent.created_at 
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

      let historyArray = [];
      if (Array.isArray(data)) {
        historyArray = data;
      } else if (data?.data && Array.isArray(data.data)) {
        historyArray = data.data;
      }

      const mappedHistory = historyArray.map(item => ({
        dateTime: item.dateTime || item.dateTimeString || item.status_date || item.status_datetime || item.time || item.timestamp || item.created_at || null,
        transactionStatus: item.status || item.statusDescription || item.activity || item.remarks || item.description || ''
      })).filter(item => item.transactionStatus);

      if (mappedHistory.length === 0 && rawStatus) {
        mappedHistory.push({
          dateTime: formattedStatusDate || new Date().toISOString(),
          transactionStatus: rawStatus
        });
      }

      return { 
        status: 200, 
        order, 
        newStatus, 
        rawStatus, 
        courierName, 
        statusDate: formattedStatusDate,
        trackingHistoryJson: JSON.stringify(mappedHistory)
      };
    } catch (err) {
      return { status: 0, order, newStatus: null };
    }
  };

  const updatesToApply = [];
  let processedCount = 0;

  const batchChunks = chunks(toProcess, CONCURRENT);
  for (let idx = 0; idx < batchChunks.length; idx++) {
    const batch = batchChunks[idx];
    if (global.syncProgress && global.syncProgress[storeId] && global.syncProgress[storeId].abort) {
      console.log(`🛑 Instaworld Sync aborted by user`);
      auditLogs.push({ id: 'SYSTEM', status: 'ABORTED', message: 'Sync stopped by user', details: `Processed ${processedCount}/${toProcess.length}` });
      break;
    }

    const results = await Promise.all(batch.map(async (o) => {
      for (const key of apiKeys) {
        const r = await trackOne(o, key);
        if (r.status === 200 && r.rawStatus) return r;
      }
      return { status: 404, order: o, newStatus: null };
    }));

    for (const r of results) {
      if (r.status === 200 && r.rawStatus) {
        const isProtected = DEAD_STATUSES.includes((r.order.delivery_status||'').toLowerCase());
        const isAttemptFailure = r.newStatus && ATTEMPT_FAILURE_STATUSES.includes(r.newStatus.toLowerCase());
        
        updatesToApply.push({
          id: r.order.id,
          courier_status: r.rawStatus,
          erp_status: (!isProtected && r.newStatus) ? r.newStatus : null,
          courier: r.courierName || 'Instaworld',
          failed_attempt_increment: (!isProtected && isAttemptFailure) ? 1 : 0,
          status_date: r.statusDate,
          tracking_history: r.trackingHistoryJson
        });
      }
    }

    processedCount += batch.length;
    const currentOrder = batch[0]?.ref_number || '';
    if (onProgress) onProgress('Syncing Instaworld', processedCount, toProcess.length, currentOrder);
    
    if (idx < batchChunks.length - 1) {
      await sleepWithJitter();
    }
  }

  const updateStmt = db.prepare(`
    UPDATE orders
    SET courier_status = COALESCE(?, courier_status),
        courier = COALESCE(?, courier),
        delivery_status = CASE WHEN ? IS NOT NULL THEN ? ELSE delivery_status END,
        status_date = CASE WHEN ? IS NOT NULL THEN COALESCE(?, datetime('now')) ELSE status_date END,
        failed_attempts = failed_attempts + ?,
        tracking_history = COALESCE(?, tracking_history)
    WHERE id = ?
  `);

  const { broadcast } = require('../../sse');
  const lookupStmt2 = db.prepare('SELECT shopify_order_id, store_id FROM orders WHERE id = ?');
  const updateMany = db.transaction(items => {
    for (const u of items) {
      updateStmt.run(u.courier_status||null, u.courier||null, u.erp_status, u.erp_status, u.erp_status, u.status_date, u.failed_attempt_increment||0, u.tracking_history||null, u.id);
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
          const row = lookupStmt2.get(u.id);
          if (row) broadcast('order_updated', { storeId: row.store_id, shopifyOrderId: row.shopify_order_id });
        } catch(e) {}
      }
    }
  }

  console.log(`✅ Instaworld [${store.shop_domain}]: Updated ${updatesToApply.length} orders`);
  return { updated: updatesToApply.length, logs: auditLogs, total: toProcess.length, failed: auditLogs.length };
}

module.exports = { syncInstaworld };
