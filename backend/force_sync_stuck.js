
const { DatabaseSync } = require('node:sqlite');
const fetch = require('node-fetch');

const db = new DatabaseSync('trace_erp.db');

function loadStatusMaps() {
  const rows = db.prepare('SELECT courier, courier_status, erp_status FROM status_mappings WHERE is_active = 1').all();
  const map = {};
  rows.forEach(r => {
    const key = `${r.courier.toLowerCase()}:${r.courier_status.toLowerCase().trim()}`;
    map[key] = r.erp_status;
  });
  return map;
}

function applyMap(statusMap, courierName, raw) {
  if (!raw) return null;
  const rawClean = String(raw).toLowerCase().trim();
  const courierKey = `${(courierName||'all').toLowerCase()}:${rawClean}`;
  const allKey = `all:${rawClean}`;
  return statusMap[courierKey] || statusMap[allKey] || null;
}

async function forceSyncAllStuck() {
  const store = db.prepare('SELECT * FROM stores LIMIT 1').get();
  if (!store) return console.error('No store found');

  // Only sync orders with REAL courier tracking numbers (not Exchange@, TRACE*, etc.)
  // and only TCS/LCS/Instaworld couriers
  const orders = db.prepare(`
    SELECT id, tracking_number, courier, delivery_status 
    FROM orders 
    WHERE tracking_number IS NOT NULL 
    AND delivery_status NOT IN ('Delivered', 'Returned', 'Return Received', 'Cancelled')
    AND (
      courier IN ('TCS', 'LCS', 'InstaWorld ( mix courier )', 'instaworld ( LCS )', 'Instaworld')
      OR (courier = 'Leopards' AND tracking_number LIKE 'LE7%')
    )
    ORDER BY id DESC
  `).all();

  console.log(`🚀 AGENT SYNC START: Processing ${orders.length} real courier orders...`);

  const statusMap = loadStatusMaps();
  const trackUrl = 'https://one-be.instaworld.pk/logistics/v1/trackShipment';
  
  // Backup key first — it has TCS/LCS/Leopards
  const apiKeys = [store.instaworld_key, store.instaworld_key_backup, store.instaworld_key_3].filter(Boolean);

  let updated = 0;
  let notFound = 0;
  let errors = 0;

  for (const order of orders) {
    let success = false;

    for (const key of apiKeys) {
      if (success) break;
      try {
        const res = await fetch(trackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tracking_number: order.tracking_number.trim(), api_key: key }),
          timeout: 8000
        });

        if (res.ok) {
          const data = await res.json();
          let rawStatus = null;
          if (Array.isArray(data) && data.length > 0) rawStatus = data[data.length - 1]?.status;
          else if (data?.status) rawStatus = data.status;

          if (rawStatus) {
            const newStatus = applyMap(statusMap, order.courier, rawStatus);
            db.prepare(`
              UPDATE orders 
              SET delivery_status = COALESCE(?, delivery_status), 
                  courier_status = ?, 
                  status_date = datetime('now') 
              WHERE id = ?
            `).run(newStatus, rawStatus, order.id);
            console.log(`✅ Order ${order.id} [${order.courier}] (${order.tracking_number}): "${rawStatus}" -> "${newStatus || 'kept'}"`);
            updated++;
            success = true;
          }
        } else if (res.status === 400) {
          notFound++;
          break;
        }
      } catch (e) {
        errors++;
        console.error(`❌ Error ${order.tracking_number}: ${e.message}`);
      }
    }

    if ((updated + notFound + errors) % 20 === 0) {
      console.log(`📊 Progress: ${updated + notFound + errors}/${orders.length} (Updated: ${updated}, Not Found: ${notFound}, Errors: ${errors})`);
    }
  }

  console.log(`\n🏁 AGENT SYNC COMPLETE. Updated: ${updated}, Not Found: ${notFound}, Errors: ${errors}`);
}

forceSyncAllStuck();
