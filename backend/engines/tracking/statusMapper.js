const DEAD_STATUSES = ['return received', 'delivered', 'cancelled'];
const EARLY_STATUSES = ['pending', 'confirmed', 'booked', 'picked up', 'unassigned'];
const ATTEMPT_FAILURE_STATUSES = ['attempted', 'shipper advice', 'refused', 'delivery under review', 'failed'];

function getDbSafe() {
  try {
    const dbModule = require('../../db');
    return dbModule.db || dbModule;
  } catch (_) {
    return null;
  }
}

function loadStatusMaps() {
  try {
    const activeDb = getDbSafe();
    if (!activeDb || typeof activeDb.prepare !== 'function') {
      return { exact: {}, wildcard: [], regex: [], rawRows: [] };
    }
    const rows = activeDb.prepare(`SELECT id, courier, courier_status, erp_status, matching_type FROM status_mappings WHERE is_active = 1`).all();
    const exact = {};

    rows.forEach(r => {
      const courier = r.courier.toLowerCase();
      const pattern = r.courier_status.toLowerCase().trim();
      const key = `${courier}:${pattern}`;
      exact[key] = r.erp_status;
      exact[`all:${pattern}`] = r.erp_status;
    });

    return { exact, wildcard: [], regex: [], rawRows: rows };
  } catch (e) {
    console.error('⚠️ Failed to load status maps from DB, using empty map:', e.message);
    return { exact: {}, wildcard: [], regex: [], rawRows: [] };
  }
}

function applyMap(statusMap, courier, rawStatus) {
  if (!rawStatus) return null;
  const raw = rawStatus.toLowerCase().trim();
  const targetCourier = (courier || 'all').toLowerCase().trim();

  // 1. Try DB EXACT match first (O(1) lookup)
  if (statusMap && statusMap.exact) {
    const exactKey = `${targetCourier}:${raw}`;
    const exactAllKey = `all:${raw}`;
    if (statusMap.exact[exactKey]) return statusMap.exact[exactKey];
    if (statusMap.exact[exactAllKey]) return statusMap.exact[exactAllKey];
  }

  // 2. Standard ERP Hardcoded Rules Fallback
  if (raw === 'delivered' || raw === 'delivered to customer') return 'Delivered';
  if (raw.includes('out for delivery')) return 'Out for Delivery';
  if (raw === 'return received' || raw.includes('return received')) return 'Return Received';
  if (raw === 'cancelled' || raw === 'canceled') return 'Cancelled';
  if (raw.includes('delivery under review') || raw.includes('shipper advice')) return 'Shipper Advice';
  if (raw.includes('returned at merchant') || raw.includes('returned to merchant') || raw.includes('returned to shipper')) return 'Returned';
  if (raw.includes('return to') || raw.includes('arrived at transit hub') || raw.includes('departed to') || raw.includes('return in transit') || raw.includes('out for return') || raw.includes('enroute to merchant')) return 'Return In Transit';
  if (raw.includes('return process') || raw.includes('return initiated') || raw.includes('return request')) return 'Return Initiated';
  if (raw.includes('attempted')) return 'Attempted';
  if (raw.includes('refused')) return 'Refused';

  return null;
}

function isFinalStatus(status) {
  if (!status) return false;
  const clean = String(status).toLowerCase().trim();
  const defaultFinals = ['return received', 'delivered', 'cancelled'];
  if (defaultFinals.includes(clean)) return true;

  try {
    const row = db.prepare(`SELECT 1 FROM status_mappings WHERE is_final = 1 AND LOWER(erp_status) = ?`).get(clean);
    return !!row;
  } catch (e) {
    return false;
  }
}

const isDeadStatus = isFinalStatus;

module.exports = {
  DEAD_STATUSES,
  EARLY_STATUSES,
  ATTEMPT_FAILURE_STATUSES,
  loadStatusMaps,
  applyMap,
  isFinalStatus,
  isDeadStatus
};

