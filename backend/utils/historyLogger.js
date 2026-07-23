/**
 * backend/utils/historyLogger.js
 * Utility helper to log status & field changes to order_history table.
 */

function logOrderStatusChange(dbInstance, orderId, oldStatus, newStatus, userId = null, source = 'System Sync') {
  if (!orderId || !newStatus) return;
  const cleanOld = oldStatus ? String(oldStatus).trim() : 'Unset';
  const cleanNew = String(newStatus).trim();
  if (cleanOld.toLowerCase() === cleanNew.toLowerCase()) return;

  try {
    const oldObj = JSON.stringify({ delivery_status: cleanOld });
    const newObj = JSON.stringify({ delivery_status: cleanNew, source });
    dbInstance.prepare(`
      INSERT INTO order_history (order_id, user_id, change_type, old_value, new_value)
      VALUES (?, ?, ?, ?, ?)
    `).run(orderId, userId || null, 'STATUS_CHANGE', oldObj, newObj);
  } catch (err) {
    console.error(`[logOrderStatusChange Error] Failed for Order #${orderId}:`, err.message);
  }
}

module.exports = {
  logOrderStatusChange
};
