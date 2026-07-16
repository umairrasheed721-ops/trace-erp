import React, { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import useSyncStream from '../hooks/useSyncStream'

export const SyncButtons = React.memo(function SyncButtons() {
  const { token, activeStoreId, setSyncHistory, fetchSyncHistory, addToast } = useApp()
  const { syncState } = useSyncStream()

  const [isSyncingShopify, setSyncingShopify] = useState(false)
  const [isSyncingCourier, setSyncingCourier] = useState(false)

  useEffect(() => {
    if (!token) return

    let active = true
    let intervalId = null

    const checkSyncStatus = async () => {
      try {
        const res = await fetch('/api/finance/sync-status', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
        if (res.ok && active) {
          const data = await res.json()
          if (data.success) {
            setSyncingShopify(data.shopify)
            setSyncingCourier(data.courier)
          }
        }
      } catch (err) {
        console.error('[SyncButtons] Failed to check sync status:', err)
      }
    }

    checkSyncStatus()
    intervalId = setInterval(checkSyncStatus, 5000)

    return () => {
      active = false
      if (intervalId) clearInterval(intervalId)
    }
  }, [token])

  const handleSync = async (type) => {
    if (!activeStoreId || syncState) return
    const endpoint = type === 'shopify' ? '/api/tracking/sync-shopify' : '/api/tracking/sync-couriers'
    
    if (type === 'shopify') setSyncingShopify(true)
    else setSyncingCourier(true)

    try {
      addToast(`🔄 Starting ${type === 'shopify' ? 'Shopify' : 'Courier'} Sync...`, 'info');
      
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ store_id: activeStoreId })
      })
      
      const data = await res.json().catch(() => ({}));
      
      if (!res.ok) {
        throw new Error(data.error || 'Sync failed to start');
      }

      // Dispatch success to notification center
      setSyncHistory(prev => [
        {
          id: data.logId || Date.now(),
          type: type === 'shopify' ? 'Shopify Sync' : 'Courier Sync',
          success: data.added !== undefined ? data.added : (data.successCount || 0),
          failed: data.failed !== undefined ? data.failed : (data.failedCount || 0),
          log_data: JSON.stringify(data.logs || []),
          created_at: new Date().toISOString()
        },
        ...prev
      ]);
      fetchSyncHistory();
      
      const successCount = type === 'shopify' 
        ? (data.added !== undefined ? data.added : (data.successCount || 0))
        : (data.successCount || 0);
      const failedCount = type === 'shopify'
        ? (data.failed !== undefined ? data.failed : (data.failedCount || 0))
        : (data.failedCount || 0);
      addToast(`✅ ${type === 'shopify' ? 'Shopify' : 'Courier'} Sync complete: ${successCount} processed, ${failedCount} failed`, 'success');
    } catch (e) {
      // Dispatch error to notification center
      setSyncHistory(prev => [
        {
          id: Date.now(),
          type: type === 'shopify' ? 'Shopify Sync' : 'Courier Sync',
          success: 0,
          failed: 1,
          log_data: JSON.stringify([{ id: 'ERROR', status: 'FAILED', message: e.message }]),
          created_at: new Date().toISOString()
        },
        ...prev
      ]);
      fetchSyncHistory();
      addToast(`❌ ${type === 'shopify' ? 'Shopify' : 'Courier'} Sync failed: ${e.message}`, 'error');
    } finally {
      if (type === 'shopify') setSyncingShopify(false)
      else setSyncingCourier(false)
    }
  }

  const handleCancelSync = async () => {
    if (!activeStoreId) return
    try {
      await fetch('/api/sync/abort', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ store_id: activeStoreId })
      });
      // Reset local syncing states immediately
      setSyncingShopify(false);
      setSyncingCourier(false);
    } catch (e) {
      console.error('Abort failed', e);
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button 
          onClick={() => handleSync('shopify')} 
          disabled={isShopifyActive || !!syncState} 
          className="btn btn-secondary btn-sm"
          style={{ ...shopifyBtnStyle, flexDirection: 'column', gap: 2, height: 'auto', minHeight: 38, paddingTop: 6, paddingBottom: 6, position: 'relative', overflow: 'hidden', minWidth: isShopifyActive ? 170 : 'auto' }}
        >
          {isShopifyActive ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                {spinnerSvg}
                <span style={{ fontWeight: 700, fontSize: '0.8rem', flex: 1 }}>🛒 Shopify Sync</span>
                {total > 0 && (
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, background: 'rgba(99,102,241,0.15)', borderRadius: 6, padding: '1px 6px' }}>
                    {processed}/{total}
                  </span>
                )}
                <button onClick={handleCancelSync} title="Stop" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem', padding: 0, lineHeight: 1 }}>🛑</button>
              </div>
              <div style={{ width: '100%', height: 3, borderRadius: 2, background: 'rgba(99,102,241,0.15)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 2, background: 'linear-gradient(90deg,#6366f1,#818cf8)', width: total > 0 ? `${percent}%` : '40%', animation: total === 0 ? 'indeterminate-slide 1.4s ease-in-out infinite' : 'none', transition: 'width 0.4s ease', minWidth: 20 }}></div>
              </div>
            </>
          ) : (
            <>
              <span style={{ fontSize: '1.1rem', marginTop: -2 }}>🛒</span>
              <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Shopify Sync</span>
            </>
          )}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button 
          onClick={() => handleSync('courier')} 
          disabled={isCourierActive || !!syncState} 
          className="btn btn-secondary btn-sm"
          style={{ ...courierBtnStyle, flexDirection: 'column', gap: 2, height: 'auto', minHeight: 38, paddingTop: 6, paddingBottom: 6, position: 'relative', overflow: 'hidden', minWidth: isCourierActive ? 190 : 'auto' }}
        >
          {isCourierActive ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                {spinnerSvg}
                <span style={{ fontWeight: 700, fontSize: '0.8rem', flex: 1 }}>
                  {syncState?.status?.match(/Syncing:\s*([^(-]+)/i)?.[1]?.trim() || '🚚 Courier'}
                </span>
                {total > 0 && (
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, background: 'rgba(99,102,241,0.15)', borderRadius: 6, padding: '1px 6px' }}>
                    {processed}/{total}
                  </span>
                )}
                <button onClick={handleCancelSync} title="Stop" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem', padding: 0, lineHeight: 1 }}>🛑</button>
              </div>
              <div style={{ width: '100%', height: 3, borderRadius: 2, background: 'rgba(99,102,241,0.15)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 2, background: 'linear-gradient(90deg,#6366f1,#818cf8)', width: total > 0 ? `${percent}%` : '40%', animation: total === 0 ? 'indeterminate-slide 1.4s ease-in-out infinite' : 'none', transition: 'width 0.4s ease', minWidth: 20 }}></div>
              </div>
            </>
          ) : (
            <>
              <span style={{ fontSize: '1.1rem', marginTop: -2 }}>🚚</span>
              <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Courier Sync</span>
            </>
          )}
        </button>
      </div>
    </>
  )
})

export default SyncButtons;
