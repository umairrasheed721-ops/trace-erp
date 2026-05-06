const fetch = require('node-fetch');
const path = require('path');
const db = require('../db');

const DEAD_STATUSES = ['delivered', 'return received', 'cancelled', 'returned'];
const EARLY_STATUSES = ['booked', 'unassigned', 'picked up'];
const ATTEMPT_FAILURE_STATUSES = ['attempted', 'refused', 'not available', 'delivery unsuccessful', 'shipper advice'];
const CONCURRENT = 10;
const SLEEP_MS = 800;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Load status mappings from DB (replaces hardcoded maps)
function loadStatusMaps() {
  try {
    const rows = db.prepare(`SELECT courier, courier_status, erp_status FROM status_mappings WHERE is_active = 1`).all();
    const map = {};
    rows.forEach(r => {
      const key = `${r.courier.toLowerCase()}:${r.courier_status.toLowerCase()}`;
      map[key] = r.erp_status;
      // Also add All: prefix as fallback
      map[`all:${r.courier_status.toLowerCase()}`] = r.erp_status;
    });
    return map;
  } catch (e) {
    console.error('⚠️ Failed to load status maps from DB, using empty map:', e.message);
    return {};
  }
}

function applyMap(statusMap, courier, rawStatus) {
  if (!rawStatus) return null;
  const raw = rawStatus.toLowerCase().trim();
  const courierKey = `${(courier || 'all').toLowerCase()}:${raw}`;
  const allKey = `all:${raw}`;
  // Exact courier match first, then generic All
  return statusMap[courierKey] || statusMap[allKey] || null;
}

// Chunk array into groups
function chunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ─────────────────────────────────────────
// 🚚 POSTEX ENGINE
// GET /v1/track-order/{trackingNumber} — individual requests, run concurrently
// ─────────────────────────────────────────
async function syncPostEx(store, syncType = 'FULL', onProgress) {
  const { id: storeId, postex_token, postex_track_url } = store;
  if (!postex_token) {
    console.log(`⚠️ PostEx: No token for store ${store.shop_domain}`);
    return { updated: 0 };
  }

  // Base URL — ensure trailing slash
  let rawUrl = postex_track_url;
  // If the DB has the bad v3 bulk endpoint saved as the default, override it for individual v1 tracking
  if (!rawUrl || rawUrl.includes('v3/get-multiple')) {
    rawUrl = 'https://api.postex.pk/services/integration/api/order/v1/track-order/';
  }
  const baseUrl = rawUrl.replace(/\/?$/, '/');

  const orders = db.prepare(`
    SELECT id, tracking_number, delivery_status FROM orders
    WHERE store_id = ? AND tracking_number IS NOT NULL AND tracking_number != ''
    AND (LOWER(courier) IN ('postex', 'post ex') OR courier IS NULL OR courier = '')
  `).all(storeId);

  const toProcess = orders.filter(o => {
    const st = (o.delivery_status || '').toLowerCase();
    if (DEAD_STATUSES.includes(st)) return false;
    if (syncType === 'SMART' && EARLY_STATUSES.includes(st)) return false;
    return true;
  });

  if (!toProcess.length) {
    console.log(`ℹ️ PostEx [${store.shop_domain}]: No orders to sync`);
    return { updated: 0 };
  }

  console.log(`🔄 PostEx [${store.shop_domain}]: Syncing ${toProcess.length} orders...`);
  const updatesToApply = [];
  let processed = 0;
  const statusMap = loadStatusMaps();

  for (const batch of chunks(toProcess, CONCURRENT)) {
    const results = await Promise.allSettled(
      batch.map(async order => {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const res = await fetch(`${baseUrl}${order.tracking_number}`, {
              method: 'GET',
              headers: { 'token': postex_token, 'Content-Type': 'application/json' },
            });

            if (res.status === 429 || res.status === 503) {
              await sleep(4000);
              continue;
            }

            if (!res.ok) return null; // 404 = tracking not found yet, skip

            const data = await res.json();

            // PostEx v1 individual response format
            let rawStatus = data?.dist?.transactionStatus
              || data?.transactionStatus
              || data?.data?.transactionStatus
              || data?.statusDescription
              || null;

            if (!rawStatus) return null;
            
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
    if (onProgress) onProgress('Syncing PostEx Tracking', processed, toProcess.length);

    await sleep(SLEEP_MS);
  }

  // Safe bulk write — courier_status always written, ERP status only if not protected + mapping found
  const updateStmt = db.prepare(`
    UPDATE orders
    SET courier_status = ?,
        delivery_status = CASE WHEN ? IS NOT NULL THEN ? ELSE delivery_status END,
        status_date = CASE WHEN ? IS NOT NULL THEN datetime('now') ELSE status_date END,
        failed_attempts = failed_attempts + ?
    WHERE id = ?
  `);
  const updateMany = db.transaction(items => {
    for (const u of items)
      updateStmt.run(u.courier_status, u.erp_status, u.erp_status, u.erp_status, u.failed_attempt_increment || 0, u.id);
  });
  updateMany(updatesToApply);

  console.log(`✅ PostEx [${store.shop_domain}] [${syncType}]: Updated ${updatesToApply.length} / ${toProcess.length} orders`);
  return { updated: updatesToApply.length };
}

// ─────────────────────────────────────────
// 🚚 INSTAWORLD ENGINE
// POST /logistics/v1/trackShipment — individual per order, concurrent
// ─────────────────────────────────────────
async function syncInstaworld(store, syncType = 'FULL', onProgress) {
  const { id: storeId, instaworld_key, instaworld_key_backup, instaworld_track_url } = store;
  if (!instaworld_key) {
    console.log(`⚠️ Instaworld: No key for store ${store.shop_domain}`);
    return { updated: 0 };
  }

  const trackUrl = instaworld_track_url || 'https://one-be.instaworld.pk/logistics/v1/trackShipment';
  const apiKeys = [instaworld_key, instaworld_key_backup].filter(Boolean);

  const orders = db.prepare(`
    SELECT id, tracking_number, delivery_status FROM orders
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
    if (syncType === 'SMART' && EARLY_STATUSES.includes(st)) return false;
    return true;
  });

  if (!toProcess.length) {
    console.log(`ℹ️ Instaworld [${store.shop_domain}]: No orders to sync`);
    return { updated: 0 };
  }

      // Using global INSTAWORLD_STATUS_MAP

  const trackOne = async (order, apiKey) => {
    try {
      const res = await fetch(trackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          tracking_number: String(order.tracking_number).trim(), 
          api_key: apiKey 
        })
      });

      if (!res.ok) return { status: res.status, order, newStatus: null };

      const data = await res.json();
      let rawStatus = null;

      if (Array.isArray(data) && data.length > 0) {
        rawStatus = data[data.length - 1]?.status || data[data.length - 1]?.statusDescription;
      } else if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
        rawStatus = data.data[data.data.length - 1]?.status;
      } else if (data?.status) {
        rawStatus = data.status;
      }

      // Capture Sub-Courier (LCS, TCS, etc) from Instaworld response
      let courierName = null;
      if (Array.isArray(data) && data.length > 0) {
        courierName = data[data.length - 1]?.courier_name || data[data.length - 1]?.vendor_name;
      } else if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
        courierName = data.data[data.data.length - 1]?.courier_name || data.data[data.data.length - 1]?.vendor_name;
      }
      
      // Auto-detect by tracking number if still null
      if (!courierName && order.tracking_number) {
        const tn = String(order.tracking_number).toUpperCase();
        if (tn.startsWith('LE') || tn.startsWith('LCS')) courierName = 'LCS';
        else if (tn.match(/^[0-9]{11,12}$/)) courierName = 'TCS'; // TCS is usually 11-12 digits
      }

      if (!rawStatus) return { status: 200, order, newStatus: null, courierName };

      const lowerRaw = String(rawStatus).toLowerCase();
      const newStatus = applyMap(statusMap, courierName || 'Instaworld', lowerRaw) || null;

      return { status: 200, order, newStatus, rawStatus, courierName };
    } catch (err) {
      const logStmt = db.prepare("INSERT INTO sync_audit (tracking_number, message) VALUES (?, ?)");
      logStmt.run(order.tracking_number, `ERR: ${err.message} | ${err.stack.split('\n')[0]}`);
      return { status: 0, order, newStatus: null };
    }
  };

  const updatesToApply = [];
  let processed = 0;
  const statusMap = loadStatusMaps();

  for (const batch of chunks(toProcess, 10)) {
    const primaryResults = await Promise.all(batch.map(o => trackOne(o, apiKeys[0])));
    const retryOrders = [];

    for (const r of primaryResults) {
      if (r.status === 200 && r.rawStatus) {
        const isProtected = DEAD_STATUSES.includes((r.order.delivery_status||'').toLowerCase());
        const isAttemptFailure = r.newStatus && ATTEMPT_FAILURE_STATUSES.includes(r.newStatus.toLowerCase());
        updatesToApply.push({
          id: r.order.id,
          courier_status: r.rawStatus,
          erp_status: (!isProtected && r.newStatus) ? r.newStatus : null,
          courier: r.courierName,
          failed_attempt_increment: (!isProtected && isAttemptFailure) ? 1 : 0
        });
      } else if (r.status !== 404 && apiKeys[1]) {
        retryOrders.push(r.order);
      }
    }

    if (retryOrders.length > 0) {
      await sleep(2000);
      const backupResults = await Promise.all(retryOrders.map(o => trackOne(o, apiKeys[1])));
      for (const r of backupResults) {
        if (r.status === 200 && r.rawStatus) {
          const isProtected = DEAD_STATUSES.includes((r.order.delivery_status||'').toLowerCase());
          const isAttemptFailure = r.newStatus && ATTEMPT_FAILURE_STATUSES.includes(r.newStatus.toLowerCase());
          updatesToApply.push({
            id: r.order.id,
            courier_status: r.rawStatus,
            erp_status: (!isProtected && r.newStatus) ? r.newStatus : null,
            courier: r.courierName,
            failed_attempt_increment: (!isProtected && isAttemptFailure) ? 1 : 0
          });
        }
      }
    }

    processed += batch.length;
    if (onProgress) onProgress('Syncing Instaworld Tracking', processed, toProcess.length);
    await sleep(SLEEP_MS);
  }

  // LOG TO CONSOLE FOR RAILWAY DEBUGGING
  if (updatesToApply.length > 0) {
    console.log(`[Instaworld Sync] Updated ${updatesToApply.length} orders for ${store.shop_domain}`);
  }


  // Safe bulk write
  const updateStmt = db.prepare(`
    UPDATE orders
    SET courier_status = COALESCE(?, courier_status),
        courier = COALESCE(?, courier),
        delivery_status = CASE WHEN ? IS NOT NULL THEN ? ELSE delivery_status END,
        status_date = CASE WHEN ? IS NOT NULL THEN datetime('now') ELSE status_date END,
        failed_attempts = failed_attempts + ?
    WHERE id = ?
  `);
  const updateMany = db.transaction(items => {
    for (const u of items)
      updateStmt.run(u.courier_status||null, u.courier||null, u.erp_status, u.erp_status, u.erp_status, u.failed_attempt_increment||0, u.id);
  });
  updateMany(updatesToApply);

  console.log(`✅ Instaworld [${store.shop_domain}] [${syncType}]: Updated ${updatesToApply.length} / ${toProcess.length} orders`);
  return { updated: updatesToApply.length };
}

async function syncSpecificCourierOrders(store, orderIds, onProgress) {
  if (!orderIds || !orderIds.length) return 0;
  
  const orders = db.prepare(`
    SELECT id, tracking_number, delivery_status, courier FROM orders
    WHERE id IN (${orderIds.map(() => '?').join(',')})
  `).all(...orderIds);

  const total = orders.length;
  let processed = 0;
  const updatesToApply = [];

  // Group by type
  const postexOrders = orders.filter(o => (o.courier || '').toLowerCase().includes('postex'));
  const otherOrders = orders.filter(o => !(o.courier || '').toLowerCase().includes('postex') && o.tracking_number);

  // 1. Sync PostEx
  if (postexOrders.length && store.postex_token) {
    let rawUrl = store.postex_track_url || 'https://api.postex.pk/services/integration/api/order/v1/track-order/';
    const baseUrl = rawUrl.replace(/\/?$/, '/');
    
    // Process in smaller chunks for progress
    const batchSize = 10;
    for (let i = 0; i < postexOrders.length; i += batchSize) {
      const batch = postexOrders.slice(i, i + batchSize);
      await Promise.allSettled(batch.map(async order => {
        try {
          const res = await fetch(`${baseUrl}${order.tracking_number}`, {
            method: 'GET',
            headers: { 'token': store.postex_token, 'Content-Type': 'application/json' },
          });
          if (!res.ok) return;
          const data = await res.json();
          const rawStatus = data?.dist?.transactionStatus || data?.transactionStatus || data?.data?.transactionStatus || data?.statusDescription;
          if (rawStatus) {
            const statusMap = loadStatusMaps();
            const newStatus = applyMap(statusMap, 'PostEx', rawStatus);
            if (newStatus && newStatus.toLowerCase() !== (order.delivery_status || '').toLowerCase()) {
               const isAttemptFailure = ATTEMPT_FAILURE_STATUSES.includes(newStatus.toLowerCase());
               updatesToApply.push({ id: order.id, status: newStatus, failed_attempt_increment: isAttemptFailure ? 1 : 0 });
            }
          }
        } catch (e) {}
      }));
      processed += batch.length;
      if (onProgress) onProgress(processed, total, `Syncing PostEx tracking...`);
      await sleep(200);
    }
  }

  // 2. Sync Others (Instaworld engine)
  if (otherOrders.length && store.instaworld_key) {
    const trackUrl = store.instaworld_track_url || 'https://one-be.instaworld.pk/logistics/v1/trackShipment';
    const apiKeys = [store.instaworld_key, store.instaworld_key_backup].filter(Boolean);

    const batchSize = 10;
    for (let i = 0; i < otherOrders.length; i += batchSize) {
      const batch = otherOrders.slice(i, i + batchSize);
      await Promise.allSettled(batch.map(async order => {
         for (const key of apiKeys) {
           try {
              const res = await fetch(trackUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tracking_number: String(order.tracking_number).trim(), api_key: key })
              });
              if (!res.ok) continue;
              const data = await res.json();
              let rawStatus = null;
              if (Array.isArray(data) && data.length > 0) rawStatus = data[data.length - 1]?.status || data[data.length - 1]?.statusDescription;
              else if (data?.data && Array.isArray(data.data) && data.data.length > 0) rawStatus = data.data[data.data.length - 1]?.status;
              else if (data?.status) rawStatus = data.status;

              if (rawStatus) {
                 const statusMap = loadStatusMaps();
                 const newStatus = applyMap(statusMap, order.courier || 'Instaworld', rawStatus);
                 if (newStatus && String(newStatus).toLowerCase() !== String(order.delivery_status || '').toLowerCase()) {
                    const isAttemptFailure = ATTEMPT_FAILURE_STATUSES.includes(String(newStatus).toLowerCase());
                    updatesToApply.push({ id: order.id, status: newStatus, failed_attempt_increment: isAttemptFailure ? 1 : 0 });
                 }
                 break; // Success with this key
              }
           } catch (e) {}
         }
      }));
      processed += batch.length;
      if (onProgress) onProgress(processed, total, `Syncing Courier tracking...`);
      await sleep(200);
    }
  }

  if (updatesToApply.length > 0) {
    const updateStmt = db.prepare("UPDATE orders SET delivery_status=?, status_date=datetime('now'), failed_attempts = failed_attempts + ? WHERE id=?");
    const updateMany = db.transaction(items => {
      for (const u of items) updateStmt.run(u.status, u.failed_attempt_increment || 0, u.id);
    });
    updateMany(updatesToApply);
  }

  return updatesToApply.length;
}

module.exports = { syncPostEx, syncInstaworld, syncSpecificCourierOrders };
