const { db } = require('../../db');

const DEAD_STATUSES = ['delivered', 'return received', 'cancelled'];
const EARLY_STATUSES = ['booked', 'unassigned', 'picked up'];
const ATTEMPT_FAILURE_STATUSES = ['attempted', 'refused', 'not available', 'delivery unsuccessful', 'shipper advice'];

function loadStatusMaps() {
  try {
    const rows = db.prepare(`SELECT id, courier, courier_status, erp_status, matching_type FROM status_mappings WHERE is_active = 1`).all();
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

  // Handle legacy flat object format fallback if passed
  const isLegacy = !statusMap.exact;
  if (isLegacy) {
    const courierKey = `${targetCourier}:${raw}`;
    const allKey = `all:${raw}`;
    return statusMap[courierKey] || statusMap[allKey] || null;
  }

  // 1. Try EXACT match first (O(1) lookup)
  const exactKey = `${targetCourier}:${raw}`;
  const exactAllKey = `all:${raw}`;
  if (statusMap.exact[exactKey]) return statusMap.exact[exactKey];
  if (statusMap.exact[exactAllKey]) return statusMap.exact[exactAllKey];

  // Wildcard and Regex matching disabled to prevent greedy status overrides & reverts
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

