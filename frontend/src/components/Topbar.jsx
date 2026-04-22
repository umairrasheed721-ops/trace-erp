import React, { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'

export default function Topbar() {
  const { activeStore, activeStoreId, addToast } = useApp()
  const [syncingShopify, setSyncingShopify] = useState(false)
  const [syncingCouriers, setSyncingCouriers] = useState(false)
  const [progress, setProgress] = useState(null)

  const syncing = syncingShopify || syncingCouriers

  useEffect(() => {
    if (!activeStoreId) return
    let isComplete = false

    const check = async () => {
      try {
        const res = await fetch(`/api/tracking/progress?store_id=${activeStoreId}`)
        const data = await res.json()
        if (data && data.status && data.status !== 'idle') {
          if (data.status === 'Sync Complete') {
            if (!isComplete) {
              addToast('✅ Sync complete! Refreshing...', 'success')
              isComplete = true
              setSyncingShopify(false)
              setSyncingCouriers(false)
              setProgress(null)
              setTimeout(() => window.location.reload(), 1500)
            }
          } else {
            setProgress(data)
            isComplete = false
          }
        } else {
          setSyncingShopify(false)
          setSyncingCouriers(false)
          setProgress(null)
        }
      } catch (e) {}
    }

    check()
    const iv = setInterval(check, 2000)
    return () => clearInterval(iv)
  }, [activeStoreId, addToast])

  const handleShopifySync = async () => {
    if (!activeStoreId || syncing) return
    setSyncingShopify(true)
    addToast('🛒 Shopify sync started...', 'info')
    try {
      await fetch('/api/tracking/sync-shopify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: activeStoreId })
      })
    } catch (e) {
      addToast('❌ Shopify sync failed to start', 'error')
      setSyncingShopify(false)
    }
  }

  const handleCourierSync = async () => {
    if (!activeStoreId || syncing) return
    setSyncingCouriers(true)
    addToast('🚚 Courier sync started...', 'info')
    try {
      await fetch('/api/tracking/sync-couriers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: activeStoreId })
      })
    } catch (e) {
      addToast('❌ Courier sync failed to start', 'error')
      setSyncingCouriers(false)
    }
  }

  const percent = progress?.total ? Math.round((progress.processed / progress.total) * 100) : 0

  return (
    <header className="topbar">
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="topbar-title">{activeStore?.store_name || activeStore?.shop_domain || 'Welcome to TRACE'}</div>
        {activeStore?.last_synced_at && (
          <div className="sync-indicator" style={{ marginTop: 2, fontSize: '0.7rem' }}>
            <span className="sync-dot"></span>
            Synced {new Date(activeStore.last_synced_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>

      <div className="topbar-actions">
        {syncing && progress && (
          <div className="progress-container animate-fade" style={{ minWidth: 200, marginRight: 20 }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', marginBottom: 4, fontWeight: 600 }}>
                <span className="text-brand">{progress.status}</span>
                <span className="text-secondary">{percent}%</span>
             </div>
             <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${percent}%` }}></div>
             </div>
          </div>
        )}
        
        <button className="btn btn-secondary btn-sm" onClick={handleShopifySync} disabled={syncing || !activeStoreId}>
          {syncingShopify ? <span className="loading-spinner"></span> : '🛒 Sync Products'}
        </button>
        <button className="btn btn-primary btn-sm" onClick={handleCourierSync} disabled={syncing || !activeStoreId}>
          {syncingCouriers ? <span className="loading-spinner"></span> : '🚚 Update Tracking'}
        </button>
      </div>
    </header>
  )
}
