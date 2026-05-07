
const Database = require('better-sqlite3');
const db = new Database('trace_erp.db');

// Mock loadStatusMaps
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
  raw = String(raw).toLowerCase().trim();
  const courierKey = `${courierName.toLowerCase()}:${raw}`;
  const allKey = `all:${raw}`;
  return statusMap[courierKey] || statusMap[allKey] || null;
}

async function test() {
  const orderId = 7045;
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  const rawStatus = 'At warehouse';
  
  const statusMap = loadStatusMaps();
  const newStatus = applyMap(statusMap, order.courier || 'Instaworld', rawStatus);
  
  console.log(`Order ID: ${orderId}`);
  console.log(`Courier: ${order.courier}`);
  console.log(`Raw Status: ${rawStatus}`);
  console.log(`Mapped Status: ${newStatus}`);
  
  // Check if it exists in map
  const key = `${order.courier.toLowerCase()}:at warehouse`;
  console.log(`Key: ${key}`);
  console.log(`Value in Map: ${statusMap[key]}`);
}

test();
