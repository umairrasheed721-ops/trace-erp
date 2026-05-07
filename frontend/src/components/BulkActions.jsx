import React from 'react'
import { useApp } from '../context/AppContext'

export default function BulkActions({
  selectedIds,
  setSelectedIds,
  bulkActionLoading,
  handleBulkConfirm,
  handleBulkSyncStatus,
  handleBulkSyncCourier,
  handleBulkRevert,
  handleBulkUpdateStatus,
  handleBulkWhatsApp,
  handleExportTracking,
  totalMatching,
  handleSelectAllMatching
}) {
  const { user } = useApp()
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
      
      {totalMatching > selectedIds.length && (
        <button 
          onClick={handleSelectAllMatching}
          className="btn btn-sm"
          style={{ background: 'white', color: 'black', border: '1px solid black' }}
        >
          Select all {totalMatching} matching orders
        </button>
      )}
      
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
        {(user?.role === 'admin' || user?.can_set_final_status === 1) && (
          <>
            <option value="Return Received">Return Received</option>
            <option value="Delivered">Delivered</option>
          </>
        )}
        <option value="Returned">Returned</option>
        <option value="RTO">RTO</option>
        <option value="Cancelled">Cancelled</option>
        <option value="Confirmed">Confirmed</option>
        <option value="Pending">Pending</option>
      </select>

      <button 
        onClick={handleExportTracking}
        className="btn btn-sm" 
        style={{ background: 'white', color: 'black', fontWeight: 800, border: '2px solid black' }}
      >
        📋 EXPORT TRACKINGS
      </button>

      <button 
        onClick={handleBulkWhatsApp}
        className="btn btn-sm" 
        style={{ background: 'white', color: 'var(--green)', fontWeight: 800, border: '2px solid var(--green)' }}
      >
        💬 BULK WHATSAPP
      </button>

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
