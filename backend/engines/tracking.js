const fetch = require('node-fetch');
const db = require('../db');

const DEAD_STATUSES = ['delivered', 'return received', 'cancelled', 'returned'];
const EARLY_STATUSES = ['booked', 'unassigned', 'picked up'];
const CONCURRENT = 10;   // How many requests to fire at once
const SLEEP_MS = 800;

const sleep = ms => new Promise(r => setTimeout(r, ms));

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
            const newStatus = data?.dist?.transactionStatus
              || data?.transactionStatus
              || data?.data?.transactionStatus
              || data?.statusDescription
              || null;

            if (!newStatus) return null;
            return { id: order.id, oldStatus: order.delivery_status, status: newStatus };
          } catch (err) {
            await sleep(1000);
          }
        }
        return null;
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        const { id, status, oldStatus } = r.value;
        if (status && status.toLowerCase() !== (oldStatus || '').toLowerCase()) {
          updatesToApply.push({ id, status });
        }
      }
    }
    
    processed += batch.length;
    if (onProgress) onProgress('Syncing PostEx Tracking', processed, toProcess.length);

    await sleep(SLEEP_MS);
  }

  // Safe bulk write
  const updateStmt = db.prepare("UPDATE orders SET delivery_status=?, status_date=datetime('now') WHERE id=?");
  const updateMany = db.transaction(items => {
    for (const u of items) updateStmt.run(u.status, u.id);
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
    AND (LOWER(courier) IN ('instaworld', 'insta world', 'instalogistics', 'insta logistics', 'leopards', 'lcs', 'tcs', 'private rider')
         OR courier LIKE '%Insta%' OR courier IS NULL OR courier = '')
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

  console.log(`🔄 Instaworld [${store.shop_domain}]: Syncing ${toProcess.length} orders...`);
  const updatesToApply = [];
  let processed = 0;

  const trackOne = async (order, apiKey) => {
    try {
      const res = await fetch(trackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracking_number: order.tracking_number, api_key: apiKey })
      });

      if (!res.ok) {
        // Only retry with backup on server/auth errors, not 404
        return { status: res.status, order, data: null };
      }

      const data = await res.json();

      // Instaworld response: array of history events OR { status, data } wrapper
      let newStatus = null;
      if (Array.isArray(data) && data.length > 0) {
        newStatus = data[data.length - 1]?.status || data[data.length - 1]?.statusDescription;
      } else if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
        newStatus = data.data[data.data.length - 1]?.status;
      } else if (data?.status) {
        newStatus = data.status;
      } else if (data?.currentStatus) {
        newStatus = data.currentStatus;
      }

      return { status: 200, order, newStatus };
    } catch (err) {
      return { status: 0, order, newStatus: null };
    }
  };

  for (const batch of chunks(toProcess, CONCURRENT)) {
    // Fire all with primary key
    const primaryResults = await Promise.all(batch.map(o => trackOne(o, apiKeys[0])));
    const retryOrders = [];

    for (const r of primaryResults) {
      if (!r || !r.order) continue;  // guard against undefined
      if (r.status === 200 && r.newStatus) {
        if (r.newStatus.toLowerCase() !== (r.order.delivery_status || '').toLowerCase()) {
          updatesToApply.push({ id: r.order.id, status: r.newStatus });
        }
      } else if (r.status === 429 || r.status >= 500 || r.status === 401 || r.status === 403 || r.status === 0) {
        retryOrders.push(r.order);
      }
      // 404 = tracking not found yet, skip silently
    }

    // Retry failures with backup key
    if (retryOrders.length > 0 && apiKeys[1]) {
      await sleep(3000);
      const backupResults = await Promise.all(retryOrders.map(o => trackOne(o, apiKeys[1])));
      for (const r of backupResults) {
        if (r.status === 200 && r.newStatus) {
          if (r.newStatus.toLowerCase() !== (r.order.delivery_status || '').toLowerCase()) {
            updatesToApply.push({ id: r.order.id, status: r.newStatus });
          }
        }
      }
    }

    processed += batch.length;
    if (onProgress) onProgress('Syncing Instaworld Tracking', processed, toProcess.length);

    await sleep(SLEEP_MS);
  }

  // Safe bulk write
  const updateStmt = db.prepare("UPDATE orders SET delivery_status=?, status_date=datetime('now') WHERE id=?");
  const updateMany = db.transaction(items => {
    for (const u of items) updateStmt.run(u.status, u.id);
  });
  updateMany(updatesToApply);

  console.log(`✅ Instaworld [${store.shop_domain}] [${syncType}]: Updated ${updatesToApply.length} / ${toProcess.length} orders`);
  return { updated: updatesToApply.length };
}

module.exports = { syncPostEx, syncInstaworld };
