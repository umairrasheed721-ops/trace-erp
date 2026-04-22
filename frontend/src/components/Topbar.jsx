import React, { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'

export default function Topbar() {
  const { activeStore, activeStoreId, addToast, theme, toggleTheme } = useApp()
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
    <header className="topbar" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="topbar-title">{activeStore?.store_name || activeStore?.shop_domain || 'No Store Connected'}</div>
          {activeStore?.last_synced_at && (
            <div className="sync-indicator" style={{ marginTop: 2 }}>
              <span className="sync-dot"></span>
              Last synced: {new Date(activeStore.last_synced_at).toLocaleString()}
            </div>
          )}
        </div>
        <div className="topbar-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button 
            onClick={toggleTheme} 
            className="btn btn-secondary btn-sm"
            style={{ width: 34, height: 34, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', borderRadius: '50%' }}
            title={theme === 'dark' ? 'Switch to Light Mode (Eye-Care)' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleShopifySync}
            disabled={syncing || !activeStoreId}
          >
            {syncingShopify ? <><span className="loading-spinner"></span> Syncing...</> : '🛒 Shopify Sync'}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleCourierSync}
            disabled={syncing || !activeStoreId}
          >
            {syncingCouriers ? <><span className="loading-spinner"></span> Syncing...</> : '🚚 Courier Sync'}
          </button>
        </div>
      </div>
      {syncing && progress && (
        <div style={{ marginTop: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 6 }}>
            <span style={{ fontWeight: 500, color: 'var(--brand)' }}>{progress.status}</span>
            <span style={{ color: 'var(--text-muted)' }}>
              {progress.total > 0 ? `${progress.processed} / ${progress.total} (${percent}%)` : `${progress.processed} processed`}
            </span>
          </div>
          <div style={{ height: 6, background: 'var(--bg-base)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: 'var(--brand)', width: `${percent}%`, transition: 'width 0.3s ease' }}></div>
          </div>
        </div>
      )}
    </header>
  )
}
