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
    if (statusMap.exact[exactKey]) return statusMap.exact[exactKey];

    // Instaworld sub-courier fallback: Leopards/LCS/TCS dispatched via Instaworld network
    // Check 'instaworld' mapping BEFORE global 'all' wildcard
    const INSTAWORLD_SUBCOURIERS = ['leopards', 'lcs', 'tcs', 'private rider', 'instalogistics'];
    if (INSTAWORLD_SUBCOURIERS.includes(targetCourier)) {
      const instaworldKey = `instaworld:${raw}`;
      if (statusMap.exact[instaworldKey]) return statusMap.exact[instaworldKey];
    }

    const exactAllKey = `all:${raw}`;
    if (statusMap.exact[exactAllKey]) return statusMap.exact[exactAllKey];
  }

  // 2. Standard ERP Hardcoded Rules Fallback (7 Core Status Model per Rule 12)
  if (raw === 'delivered' || raw.includes('delivered to customer')) return 'Delivered';
  if (raw === 'cancelled' || raw === 'canceled' || raw === 'void' || raw === 'voided') return 'Cancelled';

  // Physical return to merchant warehouse / shipper = 'Returned'
  if (raw.includes('returned at merchant') || raw.includes('returned to merchant') || raw.includes('returned to shipper') || raw.includes('returned at warehouse') || raw === 'returned' || raw === 'rto') {
    return 'Returned';
  }

  // Exact manual restock = 'Return Received'
  if (raw === 'return received') return 'Return Received';

  // All active parcel movements (Forward Transit, Return Transit, Out for Delivery, "Return received at hub/origin", Attempts, Advice, etc.) map to 'In Transit'
  return 'In Transit';
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

