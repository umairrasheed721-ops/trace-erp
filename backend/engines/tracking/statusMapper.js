const { db } = require('../../db');

const DEAD_STATUSES = ['delivered', 'return received', 'cancelled', 'returned'];
const EARLY_STATUSES = ['booked', 'unassigned', 'picked up'];
const ATTEMPT_FAILURE_STATUSES = ['attempted', 'refused', 'not available', 'delivery unsuccessful', 'shipper advice'];

function loadStatusMaps() {
  try {
    const rows = db.prepare(`SELECT courier, courier_status, erp_status FROM status_mappings WHERE is_active = 1`).all();
    const map = {};
    rows.forEach(r => {
      const key = `${r.courier.toLowerCase()}:${r.courier_status.toLowerCase()}`;
      map[key] = r.erp_status;
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

  // Pattern matching for dynamic PostEx en-route statuses
  if (courier && courier.toLowerCase().includes('postex')) {
    if (raw.startsWith('en-route to') && raw.endsWith('warehouse')) {
      return 'In Transit';
    }
    if (
      raw.startsWith('arrived at') ||
      raw.startsWith('departed to') ||
      raw.startsWith('received at') ||
      raw.startsWith('at ') ||
      raw.includes('transit hub') ||
      raw.includes('warehouse') ||
      raw === 'waiting for delivery'
    ) {
      return 'In Transit';
    }
  }
  // Pattern matching for return in-transit statuses across couriers
  if (raw.includes('return in-transit') || raw.startsWith('return in-transit')) {
    return 'Return Initiated';
  }

  const courierKey = `${(courier || 'all').toLowerCase()}:${raw}`;
  const allKey = `all:${raw}`;
  return statusMap[courierKey] || statusMap[allKey] || null;
}

module.exports = {
  DEAD_STATUSES,
  EARLY_STATUSES,
  ATTEMPT_FAILURE_STATUSES,
  loadStatusMaps,
  applyMap
};
