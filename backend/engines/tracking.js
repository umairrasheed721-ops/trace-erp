const fetch = require('node-fetch');
const path = require('path');
const db = require('../db');

const DEAD_STATUSES = ['delivered', 'return received', 'cancelled', 'returned'];
const EARLY_STATUSES = ['booked', 'unassigned', 'picked up'];
const ATTEMPT_FAILURE_STATUSES = ['attempted', 'refused', 'not available', 'delivery unsuccessful', 'shipper advice'];
const CONCURRENT = 10;
const SLEEP_MS = 800;

const sleep = ms => new Promise(r => setTimeout(r, ms));
function logAudit(storeId, level, message, trackingNumber = null) {
  try {
    db.prepare('INSERT INTO sync_audit (store_id, level, message, tracking_number) VALUES (?, ?, ?, ?)').run(storeId, level, message, trackingNumber);
  } catch (e) { console.error('Audit Log Error:', e.message); }
}

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

  let trackUrl = instaworld_track_url || 'https://one-be.instaworld.pk/logistics/v1/trackShipment';
  // 🛡️ Auto-Correction: If the user saved a portal URL, force it to the API endpoint
  if (trackUrl.includes('one.instaworld.pk/track')) {
    trackUrl = 'https://one-be.instaworld.pk/logistics/v1/trackShipment';
  }
  const apiKeys = [instaworld_key, instaworld_key_backup, store.instaworld_key_3].filter(Boolean);

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

      let courierName = null;
      if (Array.isArray(data) && data.length > 0) {
        courierName = data[data.length - 1]?.courier_name || data[data.length - 1]?.vendor_name;
      } else if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
        courierName = data.data[data.data.length - 1]?.courier_name || data.data[data.data.length - 1]?.vendor_name;
      }
      
      if (!courierName && order.tracking_number) {
        const tn = String(order.tracking_number).toUpperCase();
        if (tn.startsWith('LE') || tn.startsWith('LCS')) courierName = 'LCS';
        else if (tn.match(/^[0-9]{11,12}$/)) courierName = 'TCS';
      }

      if (!rawStatus) return { status: 200, order, newStatus: null, courierName };

      const lowerRaw = String(rawStatus).toLowerCase();
      const statusMap = loadStatusMaps();
      let newStatus = applyMap(statusMap, courierName || 'Instaworld', lowerRaw) || null;
      
      // 🛡️ Final Status Protection: Auto-sync can't mark 'Return Received'
      if (newStatus && newStatus.toLowerCase() === 'return received') {
         newStatus = 'Returned'; // Downgrade to Returned for manual verification
      }

      return { status: 200, order, newStatus, rawStatus, courierName };
    } catch (err) {
      return { status: 0, order, newStatus: null };
    }
  };

  const updatesToApply = [];
  let processedCount = 0;

  for (const batch of chunks(toProcess, 10)) {
    const results = await Promise.all(batch.map(async (o) => {
      // Try keys sequentially until we get a result
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
          failed_attempt_increment: (!isProtected && isAttemptFailure) ? 1 : 0
        });
      }
    }

    processedCount += batch.length;
    if (onProgress) onProgress('Syncing Instaworld', processedCount, toProcess.length);
    await sleep(SLEEP_MS);
  }

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

  console.log(`✅ Instaworld [${store.shop_domain}]: Updated ${updatesToApply.length} orders`);
  return { updated: updatesToApply.length };
}

const https = require('https');
const agent = new https.Agent({ rejectUnauthorized: false });

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

  console.log(`[Manual Sync] PostEx: ${postexOrders.length}, Others: ${otherOrders.length}`);

  // 1. Sync PostEx
  if (postexOrders.length && store.postex_token) {
    let rawUrl = store.postex_track_url || 'https://api.postex.pk/services/integration/api/order/v1/track-order/';
    const baseUrl = rawUrl.replace(/\/?$/, '/');
    
    const batchSize = 5;
    for (let i = 0; i < postexOrders.length; i += batchSize) {
      const batch = postexOrders.slice(i, i + batchSize);
      await Promise.allSettled(batch.map(async order => {
        try {
          const res = await fetch(`${baseUrl}${order.tracking_number}`, {
            method: 'GET',
            headers: { 'token': store.postex_token, 'Content-Type': 'application/json' },
            agent
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
            }
          }
        } catch (e) {
          console.error(`PostEx Sync Error [${order.tracking_number}]:`, e.message);
        } finally {
          processed++;
          if (onProgress) onProgress(processed, total, `Syncing PostEx tracking...`);
        }
      }));
      await sleep(100);
    }
  }

  // 2. Sync Others (Instaworld engine)
  if (otherOrders.length && store.instaworld_key) {
    let trackUrl = store.instaworld_track_url || 'https://one-be.instaworld.pk/logistics/v1/trackShipment';
    if (trackUrl.includes('one.instaworld.pk/track')) {
      trackUrl = 'https://one-be.instaworld.pk/logistics/v1/trackShipment';
    }
    const apiKeys = [store.instaworld_key, store.instaworld_key_backup, store.instaworld_key_3].filter(Boolean);
    const statusMap = loadStatusMaps();

    const batchSize = 5;
    const fs = require('fs');
    const logFile = path.join(__dirname, '../sync_debug.log');

    for (let i = 0; i < otherOrders.length; i += batchSize) {
      const batch = otherOrders.slice(i, i + batchSize);
      await Promise.allSettled(batch.map(async order => {
        let success = false;
        
        for (const key of apiKeys) {
          if (success) break;
          try {
            const trimmedKey = String(key).trim();
            const res = await fetch(trackUrl, {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Origin': 'https://one.instaworld.pk',
                'Referer': 'https://one.instaworld.pk/'
              },
              body: JSON.stringify({ tracking_number: String(order.tracking_number).trim(), api_key: trimmedKey }),
              agent,
              timeout: 30000
            });

            if (res.ok) {
              const data = await res.json();
              let rawStatus = null;
              
              // 🚀 AGGRESSIVE PARSING: Check all known Instaworld formats
              if (Array.isArray(data) && data.length > 0) {
                rawStatus = data[data.length - 1].status || data[data.length - 1].statusDescription;
              } else if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
                rawStatus = data.data[data.data.length - 1].status;
              } else if (data?.history && Array.isArray(data.history) && data.history.length > 0) {
                rawStatus = data.history[data.history.length - 1].status;
              } else if (data?.status) {
                rawStatus = data.status;
              }

              // 🚀 DIRECT COURIER FALLBACK: If Instaworld fails, go straight to the source
              if (!rawStatus) {
                const courier = (order.courier || '').toLowerCase();
                if (courier.includes('leopard')) {
                  const leopardUrl = `https://www.leopardscourier.com/tracking?track_number=${order.tracking_number}`;
                  const leopardRes = await fetch(leopardUrl, { timeout: 10000 });
                  if (leopardRes.ok) {
                    const html = await leopardRes.text();
                    // Match the status from Leopards table
                    const match = html.match(/<td[^>]*>Status:<\/td>\s*<td[^>]*>([^<]+)<\/td>/i);
                    if (match && match[1]) rawStatus = match[1].trim();
                  }
                } else if (courier.includes('tcs')) {
                  const tcsUrl = `https://www.tcsexpress.com/tracking/${order.tracking_number}`;
                  const tcsRes = await fetch(tcsUrl, { timeout: 10000 });
                  if (tcsRes.ok) {
                    const html = await tcsRes.text();
                    const match = html.match(/Status:<\/strong>\s*([^<]+)/i);
                    if (match && match[1]) rawStatus = match[1].trim();
                  }
                }
              }

              // 🚀 SECRET V2 FALLBACK: Use the GET endpoint discovered from the React portal
              if (!rawStatus) {
                const v2Url = `https://one-be.instaworld.pk/v2/public/track/${order.tracking_number}`;
                const v2Res = await fetch(v2Url, { 
                  headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*'
                  },
                  timeout: 10000 
                });
                if (v2Res.ok) {
                  const v2Data = await v2Res.json();
                  // V2 format: v2Data.data is an array or object containing history
                  if (v2Data?.data) {
                    const history = Array.isArray(v2Data.data) ? v2Data.data : (v2Data.data.history || []);
                    if (history.length > 0) {
                      rawStatus = history[history.length - 1].status || history[history.length - 1].statusDescription;
                    } else if (v2Data.data.status) {
                      rawStatus = v2Data.data.status;
                    }
                  }
                }
              }

              // 🚀 HUMAN FALLBACK: If API is silent, scrape the public portal
              if (!rawStatus) {
                const publicUrl = `https://one.instaworld.pk/track/${order.tracking_number}`;
                const publicRes = await fetch(publicUrl, { 
                  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36' },
                  timeout: 10000 
                });
                if (publicRes.ok) {
                  const html = await publicRes.text();
                  // Extract status using regex (searching for common status patterns in the HTML)
                  const match = html.match(/class="status-text"[^>]*>([^<]+)<\/span>/i) || html.match(/Status:\s*([^<]+)/i);
                  if (match && match[1]) rawStatus = match[1].trim();
                }
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
                
                fs.appendFileSync(logFile, `[${new Date().toISOString()}] Match: ${order.tracking_number} -> ${rawStatus} (${newStatus})\n`);

                updatesToApply.push({ 
                  id: order.id, 
                  courier_status: String(rawStatus).substring(0, 100), 
                  delivery_status: newStatus, 
                  courier: courierName || order.courier,
                  failed_attempt_increment: isAttemptFailure ? 1 : 0 
                });
                success = true;
              } else {
                fs.appendFileSync(logFile, `[${new Date().toISOString()}] No status found in data for ${order.tracking_number}\n`);
              }
            } else {
              fs.appendFileSync(logFile, `[${new Date().toISOString()}] API Error ${res.status} for ${order.tracking_number}\n`);
            }
          } catch (e) {
            fs.appendFileSync(logFile, `[${new Date().toISOString()}] Sync Crash for ${order.tracking_number}: ${e.message}\n`);
            console.error(`Instaworld Sync Error [${order.tracking_number}]:`, e.message);
          }
        }
        processed++;
        if (onProgress) onProgress(processed, total, `Syncing Courier tracking...`);
      }));
      await sleep(1500); 
    }
  }

  if (updatesToApply.length > 0) {
    const updateStmt = db.prepare(`
      UPDATE orders 
      SET courier_status = ?, 
          delivery_status = COALESCE(?, delivery_status),
          courier = COALESCE(?, courier),
          status_date = datetime('now'), 
          failed_attempts = failed_attempts + ? 
      WHERE id = ?
    `);
    const { broadcast } = require('../sse');
    const updateMany = db.transaction(items => {
      for (const u of items) {
        updateStmt.run(u.courier_status, u.delivery_status, u.courier, u.failed_attempt_increment || 0, u.id);
        // 🚀 REAL-TIME PUSH: Tell the frontend to update this row
        broadcast({ 
          type: 'ORDER_UPDATED', 
          orderId: u.id, 
          status: u.delivery_status,
          courier_status: u.courier_status
        });
      }
    });
    updateMany(updatesToApply);
  }

  return updatesToApply.length;
}

module.exports = { syncPostEx, syncInstaworld, syncSpecificCourierOrders, loadStatusMaps, applyMap };

