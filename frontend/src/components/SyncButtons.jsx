import React from 'react'
import { useApp } from '../context/AppContext'
import useSyncStream from '../hooks/useSyncStream'

export const SyncButtons = React.memo(function SyncButtons() {
  const { activeStoreId, addToast } = useApp()
  const { syncState } = useSyncStream()

  const handleSync = async (type) => {
    if (!activeStoreId || syncState) return
    const endpoint = type === 'shopify' ? '/api/tracking/sync-shopify' : '/api/tracking/sync-couriers'
    addToast(`${type === 'shopify' ? '🛒' : '🚚'} Sync started...`, 'info')
    try {
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: activeStoreId })
      })
    } catch (e) {
      addToast('❌ Sync failed to start', 'error')
    }
  }

  const processed = syncState?.processed || 0
  const total = syncState?.total || 0
  const rawPercent = total > 0 ? Math.round((processed / total) * 100) : 0
  const percent = Math.min(rawPercent, 100)

  return (
    <>
      <button 
        onClick={() => handleSync('shopify')} 
        disabled={!!syncState} 
        className="btn btn-secondary btn-sm"
        style={{ 
          display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', height: 38,
          borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)'
        }}
      >
        <span style={{ fontSize: '1.1rem', marginTop: -2 }}>🛒</span>
        <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
          {syncState?.sync_type === 'Shopify Sync' 
            ? `Shopify Sync (${percent}%)` 
            : 'Shopify Sync'}
        </span>
      </button>

      <button 
        onClick={() => handleSync('courier')} 
        disabled={!!syncState} 
        className="btn btn-secondary btn-sm"
        style={{ 
          display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', height: 38,
          borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)'
        }}
      >
        <span style={{ fontSize: '1.1rem', marginTop: -2 }}>🚚</span>
        <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
          {syncState?.sync_type === 'Courier Sync' 
            ? `Courier Sync (${percent}%)` 
            : 'Courier Sync'}
        </span>
      </button>
    </>
  )
})

export default SyncButtons;
