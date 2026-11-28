import React from 'react'
import { useApp } from '../context/AppContext'

export default function BulkActions({
  selectedIds,
  selectedOrders = [],
  setSelectedIds,
  bulkActionLoading,
  handleBulkConfirm,
  handleBulkSyncStatus,
  handleBulkSyncCourier,
  handleBulkRevert,
  handleBulkUpdateStatus,
  handleBulkWhatsApp,
  handleExportTracking,
  handleBulkBookPostEx,
  handleBulkBookInstaworld,
  handleBulkCancel,
  totalMatching,
  handleSelectAllMatching
}) {
  const { user, activeStore } = useApp()
  if (selectedIds.length === 0) return null

  // Smart Selection Breakdown Pills
  let pendingCount = 0
  let confirmedCount = 0
  let trackedCount = 0
  let zeroCostCount = 0
  for (const o of selectedOrders) {
    const st = (o.delivery_status || '').toLowerCase()
    const hasTrack = Boolean(o.tracking_number && String(o.tracking_number).trim() !== '')
    if (hasTrack) trackedCount++
    else if (st === 'confirmed') confirmedCount++
    else pendingCount++
    if (!o.cost || parseFloat(o.cost) <= 0) zeroCostCount++
  }
  const hasSelectionMeta = selectedOrders.length > 0
  const canBook = !hasSelectionMeta || (selectedOrders.length - trackedCount > 0)
  const canCancel = !hasSelectionMeta || trackedCount > 0
  const canRevert = !hasSelectionMeta || (selectedOrders.length - trackedCount > 0)

  const styles = {
    container: {
      background: '#111827', // Slate 900
      color: '#f3f4f6',      // Slate 100
      padding: '10px 18px',
      borderRadius: '12px',
      marginBottom: '16px',
      position: 'sticky',
      top: '12px',
      zIndex: 100,
      boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
      border: '1px solid rgba(168, 85, 247, 0.25)', // Brand purple border
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      flexWrap: 'wrap'
    },
    divider: {
      width: '1px',
      height: '22px',
      background: 'rgba(255, 255, 255, 0.12)',
      margin: '0 4px'
    },
    selectionText: {
      fontSize: '13.5px',
      fontWeight: '600',
      color: '#e5e7eb',
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    },
    btnSelectAll: {
      background: '#ffffff',
      color: '#111827',
      fontWeight: '600',
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      padding: '6px 12px',
      fontSize: '12.5px',
      cursor: 'pointer',
      transition: 'all 0.2s'
    },
    selectBook: {
      background: '#a855f7',
      color: '#ffffff',
      fontWeight: '600',
      border: 'none',
      borderRadius: '8px',
      padding: '6px 12px',
      fontSize: '12.5px',
      cursor: 'pointer',
      outline: 'none',
      boxShadow: '0 4px 10px rgba(168, 85, 247, 0.15)'
    },
    btnCancelBooking: {
      background: 'rgba(239, 68, 68, 0.1)',
      color: '#fca5a5',
      fontWeight: '600',
      border: '1px solid rgba(239, 68, 68, 0.25)',
      borderRadius: '8px',
      padding: '6px 12px',
      fontSize: '12.5px',
      cursor: 'pointer',
      transition: 'all 0.2s'
    },
    btnConfirm: {
      background: 'rgba(16, 185, 129, 0.1)',
      color: '#34d399',
      fontWeight: '600',
      border: '1px solid rgba(16, 185, 129, 0.25)',
      borderRadius: '8px',
      padding: '6px 12px',
      fontSize: '12.5px',
      cursor: 'pointer',
      transition: 'all 0.2s'
    },
    btnRevert: {
      background: 'rgba(245, 158, 11, 0.1)',
      color: '#fbbf24',
      fontWeight: '600',
      border: '1px solid rgba(245, 158, 11, 0.25)',
      borderRadius: '8px',
      padding: '6px 12px',
      fontSize: '12.5px',
      cursor: 'pointer',
      transition: 'all 0.2s'
    },
    selectStatus: {
      background: '#1f2937',
      color: '#f3f4f6',
      fontWeight: '600',
      border: '1px solid #374151',
      borderRadius: '8px',
      padding: '6px 12px',
      fontSize: '12.5px',
      cursor: 'pointer',
      outline: 'none'
    },
    btnSecondary: {
      background: '#1f2937',
      color: '#e5e7eb',
      fontWeight: '600',
      border: '1px solid #374151',
      borderRadius: '8px',
      padding: '6px 12px',
      fontSize: '12.5px',
      cursor: 'pointer',
      transition: 'all 0.2s'
    },
    btnCancel: {
      background: 'transparent',
      color: '#9ca3af',
      border: 'none',
      fontWeight: '600',
      padding: '6px 12px',
      fontSize: '12.5px',
      cursor: 'pointer',
      transition: 'all 0.2s'
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.selectionText}>📦 {selectedIds.length} selected</div>

      {hasSelectionMeta && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          {pendingCount > 0 && (
            <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: 'rgba(148,163,184,0.18)', color: '#cbd5e1' }}>
              {pendingCount} Pending
            </span>
          )}
          {confirmedCount > 0 && (
            <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: 'rgba(16,185,129,0.18)', color: '#34d399' }}>
              {confirmedCount} Confirmed
            </span>
          )}
          {trackedCount > 0 && (
            <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: 'rgba(99,102,241,0.22)', color: '#a5b4fc' }}>
              {trackedCount} Tracked
            </span>
          )}
          {zeroCostCount > 0 && (
            <span style={{ fontSize: '11px', fontWeight: 800, padding: '2px 7px', borderRadius: 99, background: 'rgba(239,68,68,0.22)', color: '#fca5a5' }}>
              🛑 {zeroCostCount} Rs 0 Cost
            </span>
          )}
        </div>
      )}
      
      {totalMatching > selectedIds.length && (
        <button 
          onClick={handleSelectAllMatching}
          style={styles.btnSelectAll}
          onMouseOver={(e) => e.target.style.background = '#f3f4f6'}
          onMouseOut={(e) => e.target.style.background = '#ffffff'}
        >
          Select all {totalMatching} matching orders
        </button>
      )}

      {/* --- BULK BOOKING CONTROLS --- */}
      <select 
        style={{ ...styles.selectBook, opacity: (!canBook || bulkActionLoading) ? 0.45 : 1, cursor: (!canBook || bulkActionLoading) ? 'not-allowed' : 'pointer' }}
        disabled={bulkActionLoading || !canBook}
        title={canBook ? 'Book selected untracked orders' : 'All selected orders already have tracking numbers'}
        onMouseOver={(e) => { if (canBook) e.target.style.background = '#9333ea' }}
        onMouseOut={(e) => { e.target.style.background = '#a855f7' }}
        onChange={(e) => {
          const val = e.target.value;
          if (val === 'postex') handleBulkBookPostEx();
          else if (val) handleBulkBookInstaworld(val);
          e.target.value = ''; // Reset
        }}
        value=""
      >
        <option value="" disabled>🚀 BOOK ORDER...</option>
        {activeStore?.postex_token && <option value="postex">PostEx</option>}
        {activeStore?.instaworld_key && (
          <option value="insta:primary">
            Instaworld (API 1: {activeStore.instaworld_key.substring(0, 4)}...)
          </option>
        )}
        {activeStore?.instaworld_key_backup && (
          <option value="insta:backup">
            Instaworld (API 2: {activeStore.instaworld_key_backup.substring(0, 4)}...)
          </option>
        )}
        {activeStore?.instaworld_key_3 && (
          <option value="insta:key3">
            Instaworld (API 3: {activeStore.instaworld_key_3.substring(0, 4)}...)
          </option>
        )}
      </select>

      <button 
        disabled={bulkActionLoading || !canCancel}
        onClick={handleBulkCancel}
        title={canCancel ? `Cancel booking on ${trackedCount} tracked order(s)` : 'No tracked/booked orders selected'}
        style={{ ...styles.btnCancelBooking, opacity: (!canCancel || bulkActionLoading) ? 0.45 : 1, cursor: (!canCancel || bulkActionLoading) ? 'not-allowed' : 'pointer' }}
        onMouseOver={(e) => { if (canCancel) e.target.style.background = 'rgba(239, 68, 68, 0.2)' }}
        onMouseOut={(e) => { e.target.style.background = 'rgba(239, 68, 68, 0.1)' }}
      >
        🛑 CANCEL BOOKING{trackedCount > 0 ? ` (${trackedCount})` : ''}
      </button>

      <div style={styles.divider} />

      <button 
        disabled={bulkActionLoading}
        onClick={handleBulkConfirm}
        title='Mark Confirmed & add "Ready to Book" tag on Shopify'
        style={styles.btnConfirm}
        onMouseOver={(e) => { e.target.style.background = 'rgba(16, 185, 129, 0.2)' }}
        onMouseOut={(e) => { e.target.style.background = 'rgba(16, 185, 129, 0.1)' }}
      >
        {bulkActionLoading ? '⌛...' : '✅ CONFIRM + TAG'}
      </button>

      <button 
        disabled={bulkActionLoading || !canRevert}
        onClick={handleBulkRevert}
        title={canRevert ? 'Revert untracked orders to Pending & remove "Ready to Book" tag' : 'Tracked orders must use Cancel Booking instead of Revert'}
        style={{ ...styles.btnRevert, opacity: (!canRevert || bulkActionLoading) ? 0.45 : 1, cursor: (!canRevert || bulkActionLoading) ? 'not-allowed' : 'pointer' }}
        onMouseOver={(e) => { if (canRevert) e.target.style.background = 'rgba(245, 158, 11, 0.2)' }}
        onMouseOut={(e) => { e.target.style.background = 'rgba(245, 158, 11, 0.1)' }}
      >
        {bulkActionLoading ? '⌛...' : '↩️ REVERT + UNTAG'}
      </button>

      <div style={styles.divider} />

      <select 
        style={styles.selectStatus}
        disabled={bulkActionLoading}
        onMouseOver={(e) => { e.target.style.background = '#374151' }}
        onMouseOut={(e) => { e.target.style.background = '#1f2937' }}
        onChange={(e) => handleBulkUpdateStatus(e.target.value)}
        value=""
      >
        <option value="" disabled>🏷️ BULK STATUS...</option>
        <option value="Pending">Pending</option>
        <option value="Confirmed">Confirmed</option>
        <option value="Booked">Booked</option>
        <option value="In Transit">In Transit</option>
        {(user?.role === 'admin' || user?.can_set_final_status === 1) && (
          <>
            <option value="Delivered">Delivered</option>
            <option value="Return Received">Return Received</option>
          </>
        )}
        <option value="Returned">Returned</option>
        <option value="Cancelled">Cancelled</option>
      </select>

      {typeof handleBulkSyncStatus === 'function' && (
        <button 
          disabled={bulkActionLoading}
          onClick={handleBulkSyncStatus}
          title="Pull latest status, tags & details from Shopify for selected orders"
          style={styles.btnSecondary}
          onMouseOver={(e) => { e.target.style.background = '#374151' }}
          onMouseOut={(e) => { e.target.style.background = '#1f2937' }}
        >
          🔄 SYNC SHOPIFY
        </button>
      )}

      {typeof handleBulkSyncCourier === 'function' && (
        <button 
          disabled={bulkActionLoading || !canCancel}
          onClick={handleBulkSyncCourier}
          title={canCancel ? 'Fetch live PostEx / Instaworld courier status for selected orders' : 'Select tracked orders to sync courier status'}
          style={{ ...styles.btnSecondary, opacity: (!canCancel || bulkActionLoading) ? 0.45 : 1, cursor: (!canCancel || bulkActionLoading) ? 'not-allowed' : 'pointer' }}
          onMouseOver={(e) => { if (canCancel) e.target.style.background = '#374151' }}
          onMouseOut={(e) => { e.target.style.background = '#1f2937' }}
        >
          🚚 SYNC COURIER
        </button>
      )}

      <button 
        onClick={handleExportTracking}
        style={styles.btnSecondary}
        onMouseOver={(e) => { e.target.style.background = '#374151' }}
        onMouseOut={(e) => { e.target.style.background = '#1f2937' }}
      >
        📋 EXPORT TRACKINGS
      </button>

      <button 
        onClick={handleBulkWhatsApp}
        style={{
          ...styles.btnSecondary,
          color: '#34d399',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          background: 'rgba(16, 185, 129, 0.05)'
        }}
        onMouseOver={(e) => { e.target.style.background = 'rgba(16, 185, 129, 0.15)' }}
        onMouseOut={(e) => { e.target.style.background = 'rgba(16, 185, 129, 0.05)' }}
      >
        💬 BULK WHATSAPP
      </button>

      <button 
        onClick={() => setSelectedIds([])}
        style={styles.btnCancel}
        onMouseOver={(e) => { e.target.style.color = '#ffffff' }}
        onMouseOut={(e) => { e.target.style.color = '#9ca3af' }}
      >
        CANCEL
      </button>
    </div>
  )
}
