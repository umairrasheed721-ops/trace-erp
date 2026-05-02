import React from 'react'

export default function BulkActions({
  selectedIds,
  setSelectedIds,
  bulkActionLoading,
  handleBulkConfirm,
  handleBulkSyncStatus,
  handleBulkSyncCourier,
  handleBulkRevert,
  handleBulkUpdateStatus
}) {
  if (selectedIds.length === 0) return null

  return (
    <div className="flex items-center gap-4" style={{ 
      background: 'var(--brand)', 
      color: 'black', 
      padding: '8px 16px', 
      borderRadius: 8, 
      marginBottom: 12,
      position: 'sticky',
      top: 0,
      zIndex: 100,
      boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
    }}>
      <div className="font-bold">📦 {selectedIds.length} selected</div>
      
      <button 
        disabled={bulkActionLoading}
        onClick={handleBulkConfirm}
        className="btn btn-sm" 
        style={{ background: 'black', color: 'var(--brand)', fontWeight: 700 }}
      >
        {bulkActionLoading ? '⌛...' : '✅ BULK CONFIRM'}
      </button>

      <button 
        disabled={bulkActionLoading}
        onClick={handleBulkSyncStatus}
        className="btn btn-sm" 
        style={{ background: 'black', color: 'white', fontWeight: 700 }}
      >
        {bulkActionLoading ? '⌛...' : '🔄 SYNC STATUS (FORCE)'}
      </button>

      <button 
        disabled={bulkActionLoading}
        onClick={handleBulkSyncCourier}
        className="btn btn-sm" 
        style={{ background: 'black', color: 'var(--brand)', fontWeight: 700, border: '1px solid var(--brand)' }}
      >
        {bulkActionLoading ? '⌛...' : '⚡ SYNC COURIER (FORCE)'}
      </button>

      <button 
        disabled={bulkActionLoading}
        onClick={handleBulkRevert}
        className="btn btn-sm" 
        style={{ background: 'black', color: '#ff4444', fontWeight: 700 }}
      >
        {bulkActionLoading ? '⌛...' : '↩️ REVERT ALL'}
      </button>

      <select 
        className="btn btn-sm" 
        style={{ background: 'black', color: 'white', fontWeight: 700, cursor: 'pointer' }}
        disabled={bulkActionLoading}
        onChange={(e) => handleBulkUpdateStatus(e.target.value)}
        value=""
      >
        <option value="" disabled>🏷️ BULK STATUS...</option>
        <option value="Delivered">Delivered</option>
        <option value="Returned">Returned</option>
        <option value="RTO">RTO</option>
        <option value="Cancelled">Cancelled</option>
        <option value="Confirmed">Confirmed</option>
        <option value="Pending">Pending</option>
      </select>

      <button 
        onClick={() => setSelectedIds([])}
        className="btn btn-sm" 
        style={{ background: 'rgba(0,0,0,0.1)', color: 'black' }}
      >
        CANCEL
      </button>
    </div>
  )
}
