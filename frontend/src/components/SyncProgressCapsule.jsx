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

  // Extract courier name from status string e.g. "Syncing: PostEx (booked) - Fetching orders..."
  const courierName = (() => {
    if (!syncState?.status) return null
    const match = syncState.status.match(/Syncing:\s*([^(]+)/i)
    if (match) return match[1].trim()
    if (syncState?.sync_type) return syncState.sync_type
    return null
  })()

  const isShopify = syncState?.sync_type === 'Shopify Sync' || syncState?.sync_type?.toLowerCase().includes('shopify')
  const courierEmoji = isShopify ? '🛒' : '🚚'

  if (!syncState) return null

  return (
    <>
      {/* CAPSULE */}
      <div className="sync-capsule" style={{
        display: 'flex', flexDirection: 'column', gap: 4,
        background: isReconnecting ? 'rgba(245, 158, 11, 0.08)' : 'rgba(99, 102, 241, 0.08)',
        border: isReconnecting ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(99, 102, 241, 0.35)',
        borderRadius: 14, padding: '6px 14px 6px 10px',
        minWidth: 220, maxWidth: 320,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        animation: 'pulse-glow 2s infinite',
        position: 'relative', overflow: 'hidden'
      }}>
        {/* ROW 1: icon + courier name + counter + stop button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {isReconnecting ? (
            <span style={{ fontSize: '0.85rem' }}>⚠️</span>
          ) : (
            <span className="loading-spinner" style={{ width: 12, height: 12, borderWidth: '2px', flexShrink: 0 }}></span>
          )}

          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: isReconnecting ? '#f59e0b' : 'var(--brand)', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {courierEmoji} {courierName || (isReconnecting ? 'Reconnecting...' : 'Syncing')}
          </span>

          {total > 0 && (
            <span style={{
              marginLeft: 'auto', background: 'rgba(255,255,255,0.12)',
              borderRadius: 8, padding: '1px 7px',
              fontSize: '0.72rem', fontWeight: 700,
              color: isReconnecting ? '#f59e0b' : 'var(--brand)',
              whiteSpace: 'nowrap', flexShrink: 0
            }}>
              {processed} / {total}
            </span>
          )}

          <button
            onClick={handleCancelSync}
            title="Stop Sync"
            style={{
              background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
              color: '#ef4444', borderRadius: 6, padding: '1px 7px',
              fontSize: '0.7rem', fontWeight: 700,
              cursor: 'pointer', marginLeft: 4, flexShrink: 0,
              lineHeight: 1.6
            }}
          >
            🛑
          </button>
        </div>

        {/* ROW 2: progress bar */}
        <div style={{
          height: 5, borderRadius: 4,
          background: 'rgba(99,102,241,0.15)',
          overflow: 'hidden',
          position: 'relative'
        }}>
          <div style={{
            height: '100%',
            background: isReconnecting
              ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
              : 'linear-gradient(90deg, #6366f1, #818cf8)',
            width: total > 0 ? `${percent}%` : '40%',
            transition: total > 0 ? 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
            animation: total === 0 ? 'indeterminate-slide 1.4s ease-in-out infinite' : 'none',
            borderRadius: 4,
            minWidth: 30
          }}></div>
        </div>

        {/* ROW 3: current order / stage text */}
        {(syncState?.currentOrder || syncState?.status) && (
          <div style={{
            fontSize: '0.68rem', color: 'var(--text-muted)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            maxWidth: 280
          }}>
            {syncState?.currentOrder || syncState?.status}
          </div>
        )}
      </div>

      {/* GLOBAL BOTTOM RAIL */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 2,
        background: 'rgba(255,255,255,0.1)', overflow: 'hidden', zIndex: 10
      }}>
        <div style={{
          height: '100%',
          background: isReconnecting ? '#f59e0b' : 'var(--brand)',
          width: `${percent}%`,
          transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
        }}></div>
      </div>
    </>
  )
})

export default SyncProgressCapsule;
