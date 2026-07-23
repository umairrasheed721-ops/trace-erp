const fetch = typeof globalThis.fetch === 'function' ? globalThis.fetch : require('node-fetch');
const path = require('path');
const db = require('../db');
const { instaworldFetch } = require('./instaworld_http');
const { postexBreaker, instaworldBreaker } = require('./circuit_breaker');
const { syncPostEx } = require('./tracking/postex');
const { syncInstaworld } = require('./tracking/instaworld');
const { 
  DEAD_STATUSES, 
  EARLY_STATUSES, 
  ATTEMPT_FAILURE_STATUSES, 
  loadStatusMaps, 
  applyMap 
} = require('./tracking/statusMapper');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function syncSpecificCourierOrders(store, orderIds, onProgress) {
  if (!orderIds || !orderIds.length) return 0;
  
  const orders = db.prepare(`
    SELECT id, tracking_number, delivery_status, courier FROM orders
    WHERE id IN (${orderIds.map(() => '?').join(',')})
  `).all(...orderIds);

  const total = orders.length;
  let processed = 0;
  const updatesToApply = [];
  const logs = [];

  const postexOrders = orders.filter(o => (o.courier || '').toLowerCase().includes('postex'));
  const otherOrders = orders.filter(o => !(o.courier || '').toLowerCase().includes('postex') && o.tracking_number);

  console.log(`[Manual Sync] PostEx: ${postexOrders.length}, Others: ${otherOrders.length}`);

  if (postexOrders.length && store.postex_token) {
    let rawUrl = store.postex_track_url;
    if (!rawUrl || rawUrl.includes('v3/get-multiple')) {
      rawUrl = 'https://api.postex.pk/services/integration/api/order/v1/track-order/';
    }
    const baseUrl = rawUrl.replace(/\/?$/, '/');
    
    const batchSize = 5;
    for (let i = 0; i < postexOrders.length; i += batchSize) {
      const storeId = store.id;
      if (global.syncProgress && global.syncProgress[storeId] && global.syncProgress[storeId].abort) {
        console.log(`🛑 Bulk Courier Sync (PostEx) aborted by user`);
        logs.push({ type: 'SYSTEM', tracking_number: 'ABORTED', status: 'Failed', details: 'Sync stopped by user' });
        break;
      }
      const batch = postexOrders.slice(i, i + batchSize);
      await Promise.allSettled(batch.map(async order => {
        try {
          const res = await postexBreaker.execute(async () => {
            const fetchRes = await fetch(`${baseUrl}${order.tracking_number}`, {
              method: 'GET',
              headers: { 'token': store.postex_token, 'Content-Type': 'application/json' }
            });
            if (!fetchRes.ok && (fetchRes.status >= 500 || fetchRes.status === 429)) {
              throw new Error(`HTTP ${fetchRes.status}`);
            }
            return fetchRes;
          });
          if (res.ok) {
            const data = await res.json();
            const rawStatus = data?.dist?.transactionStatus || data?.transactionStatus || data?.data?.transactionStatus || data?.statusDescription;
            if (rawStatus) {
              const statusMap = loadStatusMaps();
              const newStatus = applyMap(statusMap, 'PostEx', rawStatus);
              const isAttemptFailure = ATTEMPT_FAILURE_STATUSES.includes((newStatus||rawStatus).toLowerCase());
              updatesToApply.push({ 
                id: order.id, 
                courier_status: rawStatus, 
                delivery_status: newStatus, 
                courier: 'PostEx',
                failed_attempt_increment: isAttemptFailure ? 1 : 0 
              });
              logs.push({ type: 'PostEx', tracking_number: order.tracking_number, status: 'Success', details: `Status: ${rawStatus}` });
            } else {
              logs.push({ type: 'PostEx', tracking_number: order.tracking_number, status: 'Failed', details: `API OK, but no status found in response` });
            }
          } else {
             logs.push({ type: 'PostEx', tracking_number: order.tracking_number, status: 'Failed', details: `API HTTP ${res.status}` });
          }
        } catch (e) {
          console.error(`PostEx Sync Error [${order.tracking_number}]:`, e.message);
          logs.push({ type: 'PostEx', tracking_number: order.tracking_number, status: 'Failed', details: `API Error: ${e.message}` });
        } finally {
          processed++;
          if (onProgress) onProgress(processed, total, `Syncing PostEx tracking...`);
        }
      }));
      await sleep(100);
    }
  }

  if (otherOrders.length && store.instaworld_key) {
    let trackUrl = store.instaworld_track_url || 'https://one-be.instaworld.pk/logistics/v1/trackShipment';
    if (trackUrl.includes('one.instaworld.pk/track')) {
      trackUrl = 'https://one-be.instaworld.pk/logistics/v1/trackShipment';
    }
    const apiKeys = [store.instaworld_key, store.instaworld_key_backup, store.instaworld_key_3].filter(Boolean);
    const statusMap = loadStatusMaps();

    const batchSize = 5;
    for (let i = 0; i < otherOrders.length; i += batchSize) {
      const storeId = store.id;
      if (global.syncProgress && global.syncProgress[storeId] && global.syncProgress[storeId].abort) {
        console.log(`🛑 Bulk Courier Sync (Instaworld) aborted by user`);
        logs.push({ type: 'SYSTEM', tracking_number: 'ABORTED', status: 'Failed', details: 'Sync stopped by user' });
        break;
      }

      const batch = otherOrders.slice(i, i + batchSize);
      await Promise.allSettled(batch.map(async order => {
        let success = false;
        
        for (const key of apiKeys) {
          if (success) break;
          try {
            const trimmedKey = String(key).trim();
            const res = await instaworldBreaker.execute(async () => {
              const fetchRes = await instaworldFetch(trackUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tracking_number: String(order.tracking_number).trim(), api_key: trimmedKey }),
                timeout: 30000,
                proxyUrl: store.gas_proxy_url,
              });
              if (!fetchRes.ok && (fetchRes.status >= 500 || fetchRes.status === 429)) {
                throw new Error(`HTTP ${fetchRes.status}`);
              }
              return fetchRes;
            });

            if (res.ok) {
              const data = await res.json();
              let rawStatus = null;
              
              if (Array.isArray(data) && data.length > 0) {
                rawStatus = data[data.length - 1].status || data[data.length - 1].statusDescription;
              } else if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
                rawStatus = data.data[data.data.length - 1].status;
              } else if (data?.history && Array.isArray(data.history) && data.history.length > 0) {
                rawStatus = data.history[data.history.length - 1].status;
              } else if (data?.status) {
                rawStatus = data.status;
              }

              if (rawStatus) {
                let courierName = null;
                if (Array.isArray(data) && data.length > 0) {
                   courierName = data[data.length - 1].courier_name || data[data.length - 1].vendor_name;
                } else if (data?.courier) {
                  courierName = data.courier;
                }
                
                const newStatus = applyMap(statusMap, courierName || order.courier || 'Instaworld', rawStatus);
                const isAttemptFailure = ATTEMPT_FAILURE_STATUSES.includes(String(newStatus || rawStatus).toLowerCase());
                
                updatesToApply.push({ 
                  id: order.id, 
                  courier_status: String(rawStatus).substring(0, 100), 
                  delivery_status: newStatus, 
                  courier: courierName || order.courier,
                  failed_attempt_increment: isAttemptFailure ? 1 : 0 
                });
                success = true;
                logs.push({ type: 'Instaworld', tracking_number: order.tracking_number, status: 'Success', details: `Status: ${rawStatus}` });
              } else {
                 if(key === apiKeys[apiKeys.length-1]) logs.push({ type: 'Instaworld', tracking_number: order.tracking_number, status: 'Failed', details: `API OK, but no status found` });
              }
            } else {
               if(key === apiKeys[apiKeys.length-1]) logs.push({ type: 'Instaworld', tracking_number: order.tracking_number, status: 'Failed', details: `API HTTP ${res.status}` });
            }
          } catch (e) {
             if(key === apiKeys[apiKeys.length-1]) logs.push({ type: 'Instaworld', tracking_number: order.tracking_number, status: 'Failed', details: `API Error: ${e.message}` });
          }
        }
        processed++;
        if (onProgress) onProgress(processed, total, `Syncing Instaworld tracking...`);
      }));
      if (i + batchSize < otherOrders.length) {
        await sleep(1500);
      }
    }
  }

  if (updatesToApply.length > 0) {
    const { logOrderStatusChange } = require('../utils/historyLogger');
    const getStatusStmt = db.prepare('SELECT delivery_status FROM orders WHERE id = ?');
    const updateStmt = db.prepare(`
      UPDATE orders 
      SET courier_status = ?, 
          delivery_status = CASE 
            WHEN LOWER(delivery_status) IN ('return received', 'delivered', 'cancelled') THEN delivery_status
            WHEN EXISTS (SELECT 1 FROM status_mappings WHERE is_final = 1 AND LOWER(erp_status) = LOWER(orders.delivery_status)) THEN orders.delivery_status
            WHEN ? IS NOT NULL THEN ? 
            ELSE delivery_status 
          END,
          courier = COALESCE(?, courier),
          status_date = datetime('now'), 
          failed_attempts = failed_attempts + ? 
      WHERE id = ?
    `);
    const { broadcast } = require('../sse');
    const updateMany = db.transaction(items => {
      for (const u of items) {
        const prevOrder = getStatusStmt.get(u.id);
        const oldStatus = prevOrder ? prevOrder.delivery_status : null;
        updateStmt.run(u.courier_status, u.delivery_status, u.delivery_status, u.courier, u.failed_attempt_increment || 0, u.id);
        const updatedOrder = getStatusStmt.get(u.id);
        if (updatedOrder && oldStatus && updatedOrder.delivery_status !== oldStatus) {
          logOrderStatusChange(db, u.id, oldStatus, updatedOrder.delivery_status, null, 'Auto Sync Tracking');
        }
      }
    });
    updateMany(updatesToApply);

    if (updatesToApply.length > 5) {
      try {
        broadcast('message', {
          type: 'orders_bulk_updated',
          count: updatesToApply.length,
          updates: updatesToApply.map(u => ({ orderId: u.id, status: u.delivery_status, courier_status: u.courier_status }))
        });
      } catch(e) {}
    } else {
      for (const u of updatesToApply) {
        try {
          broadcast('message', { 
            type: 'order_updated', 
            orderId: u.id, 
            status: u.delivery_status,
            courier_status: u.courier_status
          });
        } catch(e) {}
      }
    }
  }

  return { updatedCount: updatesToApply.length, logs };
}

module.exports = { 
  syncPostEx, 
  syncInstaworld, 
  syncSpecificCourierOrders, 
  loadStatusMaps, 
  applyMap 
};
