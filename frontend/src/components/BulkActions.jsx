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
  handleBulkBookPostEx,
  handleBulkBookInstaworld,
  handleBulkCancel,
  totalMatching,
  handleSelectAllMatching
}) {
  const { user, activeStore } = useApp()
  if (selectedIds.length === 0) return null

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
        style={styles.selectBook}
        disabled={bulkActionLoading}
        onMouseOver={(e) => e.target.style.background = '#9333ea'}
        onMouseOut={(e) => e.target.style.background = '#a855f7'}
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
        disabled={bulkActionLoading}
        onClick={handleBulkCancel}
        style={styles.btnCancelBooking}
        onMouseOver={(e) => { e.target.style.background = 'rgba(239, 68, 68, 0.2)' }}
        onMouseOut={(e) => { e.target.style.background = 'rgba(239, 68, 68, 0.1)' }}
      >
        🛑 CANCEL BOOKING
      </button>

      <div style={styles.divider} />

      <button 
        disabled={bulkActionLoading}
        onClick={handleBulkConfirm}
        style={styles.btnConfirm}
        onMouseOver={(e) => { e.target.style.background = 'rgba(16, 185, 129, 0.2)' }}
        onMouseOut={(e) => { e.target.style.background = 'rgba(16, 185, 129, 0.1)' }}
      >
        {bulkActionLoading ? '⌛...' : '✅ BULK CONFIRM'}
      </button>

      <button 
        disabled={bulkActionLoading}
        onClick={handleBulkRevert}
        style={styles.btnRevert}
        onMouseOver={(e) => { e.target.style.background = 'rgba(245, 158, 11, 0.2)' }}
        onMouseOut={(e) => { e.target.style.background = 'rgba(245, 158, 11, 0.1)' }}
      >
        {bulkActionLoading ? '⌛...' : '↩️ REVERT TO PENDING'}
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
