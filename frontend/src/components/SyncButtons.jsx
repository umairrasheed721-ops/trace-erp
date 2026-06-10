import React, { useState } from 'react'
import { useApp } from '../context/AppContext'
import useSyncStream from '../hooks/useSyncStream'

export const SyncButtons = React.memo(function SyncButtons() {
  const { token, activeStoreId, addToast } = useApp()
  const { syncState } = useSyncStream()

  const [isSyncingShopify, setSyncingShopify] = useState(false)
  const [isSyncingCourier, setSyncingCourier] = useState(false)

  const handleSync = async (type) => {
    if (!activeStoreId || syncState) return
    const endpoint = type === 'shopify' ? '/api/tracking/sync-shopify' : '/api/tracking/sync-couriers'
    
    if (type === 'shopify') setSyncingShopify(true)
    else setSyncingCourier(true)

    addToast(`${type === 'shopify' ? '🛒' : '🚚'} Sync started...`, 'info')
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ store_id: activeStoreId })
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Sync failed to start');
      }
    } catch (e) {
      addToast(`❌ Sync failed: ${e.message}`, 'error')
    } finally {
      if (type === 'shopify') setSyncingShopify(false)
      else setSyncingCourier(false)
    }
  }

  const processed = syncState?.processed || 0
  const total = syncState?.total || 0
  const rawPercent = total > 0 ? Math.round((processed / total) * 100) : 0
  const percent = Math.min(rawPercent, 100)

  const isShopifyActive = isSyncingShopify || syncState?.sync_type === 'Shopify Sync'
  const isCourierActive = isSyncingCourier || syncState?.sync_type === 'Courier Sync'

  const spinnerSvg = (
    <svg className="btn-spin" style={{ width: 14, height: 14, color: 'currentColor' }} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" style={{ opacity: 0.25 }} />
      <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )

  const shopifyBtnStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '0 14px',
    height: 38,
    borderRadius: isShopifyActive ? 20 : 10,
    background: isShopifyActive ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255,255,255,0.05)',
    border: isShopifyActive ? '1px solid var(--brand)' : '1px solid var(--border)',
    color: isShopifyActive ? 'var(--brand)' : 'inherit',
    cursor: isShopifyActive ? 'not-allowed' : 'pointer',
    animation: isShopifyActive ? 'pulse-btn 1.5s infinite' : 'none'
  }

  const courierBtnStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '0 14px',
    height: 38,
    borderRadius: isCourierActive ? 20 : 10,
    background: isCourierActive ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255,255,255,0.05)',
    border: isCourierActive ? '1px solid var(--brand)' : '1px solid var(--border)',
    color: isCourierActive ? 'var(--brand)' : 'inherit',
    cursor: isCourierActive ? 'not-allowed' : 'pointer',
    animation: isCourierActive ? 'pulse-btn 1.5s infinite' : 'none'
  }

  return (
    <>
      <style>{`
        @keyframes btn-spin {
          to { transform: rotate(360deg); }
        }
        .btn-spin {
          animation: btn-spin 1s linear infinite;
        }
        @keyframes pulse-btn {
          0% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.4); }
          70% { box-shadow: 0 0 0 6px rgba(99, 102, 241, 0); }
          100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
        }
      `}</style>

      <button 
        onClick={() => handleSync('shopify')} 
        disabled={isShopifyActive || !!syncState} 
        className="btn btn-secondary btn-sm"
        style={shopifyBtnStyle}
      >
        {isShopifyActive ? (
          <>
            {spinnerSvg}
            <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
              {percent > 0 ? `Syncing... (${percent}%)` : 'Syncing...'}
            </span>
          </>
        ) : (
          <>
            <span style={{ fontSize: '1.1rem', marginTop: -2 }}>🛒</span>
            <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Shopify Sync</span>
          </>
        )}
      </button>

      <button 
        onClick={() => handleSync('courier')} 
        disabled={isCourierActive || !!syncState} 
        className="btn btn-secondary btn-sm"
        style={courierBtnStyle}
      >
        {isCourierActive ? (
          <>
            {spinnerSvg}
            <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
              {percent > 0 ? `Syncing... (${percent}%)` : 'Syncing...'}
            </span>
          </>
        ) : (
          <>
            <span style={{ fontSize: '1.1rem', marginTop: -2 }}>🚚</span>
            <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Courier Sync</span>
          </>
        )}
      </button>
    </>
  )
})

export default SyncButtons;
