import React from 'react'
import { useApp } from '../context/AppContext'
import useSyncStream from '../hooks/useSyncStream'

export const SyncProgressCapsule = React.memo(function SyncProgressCapsule() {
  const { activeStore, addToast } = useApp()
  const { status, syncState } = useSyncStream()

  const processed = syncState?.processed || 0
  const total = syncState?.total || 0
  const rawPercent = total > 0 ? Math.round((processed / total) * 100) : 0
  const percent = Math.min(rawPercent, 100)

  const handleCancelSync = async () => {
    if (!activeStore?.id) return;
    try {
      const token = localStorage.getItem('trace_token') || '';
      const res = await fetch('/api/sync/abort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ store_id: activeStore.id })
      });
      if (res.ok) {
        addToast('🛑 Stopping sync...', 'info');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const isReconnecting = status === 'reconnecting'

  return (
    <>
      <div className="sync-capsule" style={{
        display: syncState ? 'flex' : 'none', alignItems: 'center', gap: 10,
        background: isReconnecting ? 'rgba(245, 158, 11, 0.1)' : 'rgba(99, 102, 241, 0.1)', 
        border: isReconnecting ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(99, 102, 241, 0.3)',
        borderRadius: 20, padding: '4px 12px', fontSize: '0.8rem', fontWeight: 600, 
        color: isReconnecting ? '#f59e0b' : 'var(--brand)',
        animation: 'pulse-glow 2s infinite'
      }}>
        {isReconnecting ? (
          <span style={{ fontSize: '0.85rem' }}>⚠️</span>
        ) : (
          <span className="loading-spinner" style={{ width: 12, height: 12, borderWidth: '2px' }}></span>
        )}
        <span style={{ whiteSpace: 'nowrap' }}>
          {isReconnecting ? 'Waiting for Reconnect...' : (
            syncState?.currentOrder 
              ? `Syncing ${syncState.currentOrder}` 
              : (syncState?.status || '')
          )}
        </span>
        <span style={{ color: 'var(--text-muted)', fontWeight: 400, whiteSpace: 'nowrap' }}>
          ({processed}/{Math.max(processed, total)})
        </span>
        <button 
          onClick={handleCancelSync}
          title="Stop Sync"
          style={{
            background: '#ef4444', border: 'none', color: 'white', borderRadius: '4px',
            padding: '2px 8px', fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', 
            alignItems: 'center', gap: '4px', cursor: 'pointer', marginLeft: 8,
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}
        >
          🛑 Stop
        </button>
      </div>

      {/* 📏 GLOBAL PROGRESS RAIL */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 2,
        background: 'rgba(255,255,255,0.1)', overflow: 'hidden', zIndex: 10,
        display: syncState ? 'block' : 'none'
      }}>
        <div style={{
          height: '100%', 
          background: isReconnecting ? '#f59e0b' : 'var(--brand)', 
          width: `${percent}%`, transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
        }}></div>
      </div>
    </>
  )
})

export default SyncProgressCapsule;
