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
        const token = localStorage.getItem('trace_token');
        const res = await fetch(`/api/tracking/progress?store_id=${activeStoreId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
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
      const token = localStorage.getItem('trace_token');
      await fetch('/api/tracking/sync-shopify', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
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
      const token = localStorage.getItem('trace_token');
      await fetch('/api/tracking/sync-couriers', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ store_id: activeStoreId })
      })
    } catch (e) {
      addToast('❌ Courier sync failed to start', 'error')
      setSyncingCouriers(false)
    }
  }

  const percent = progress?.total ? Math.round((progress.processed / progress.total) * 100) : 0

  return (
    <header className="topbar" style={{ position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div>
            <div className="topbar-title">{activeStore?.store_name || activeStore?.shop_domain || 'No Store Connected'}</div>
            {activeStore?.last_synced_at && (
              <div className="sync-indicator" style={{ marginTop: 2 }}>
                <span className="sync-dot"></span>
                Last synced: {new Date(activeStore.last_synced_at).toLocaleString()}
              </div>
            )}
          </div>

          {/* Global Compact Progress Badge */}
          {syncing && progress && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 10, 
              background: 'var(--brand-glow)', 
              padding: '6px 14px', 
              borderRadius: '20px',
              border: '1px solid var(--brand)',
              fontSize: '0.78rem',
              color: 'var(--brand)',
              fontWeight: 600,
              animation: 'slideUp 0.3s ease'
            }}>
              <span className="loading-spinner" style={{ width: 12, height: 12, borderWidth: '1.5px' }}></span>
              <span style={{ whiteSpace: 'nowrap' }}>{progress.status}</span>
              <span style={{ opacity: 0.8, fontSize: '0.7rem', background: 'var(--brand)', color: 'white', padding: '1px 6px', borderRadius: '10px' }}>
                {progress.total > 0 ? `${percent}%` : progress.processed}
              </span>
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
            {syncingShopify ? <><span className="loading-spinner"></span> Starting...</> : '🛒 Shopify Sync'}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleCourierSync}
            disabled={syncing || !activeStoreId}
          >
            {syncingCouriers ? <><span className="loading-spinner"></span> Starting...</> : '🚚 Courier Sync'}
          </button>
        </div>
      </div>

      {/* Slim Global Progress Line */}
      {syncing && progress && (
        <div style={{ 
          position: 'absolute', 
          bottom: 0, 
          left: 0, 
          right: 0, 
          height: '3px', 
          background: 'rgba(255,255,255,0.05)',
          zIndex: 10
        }}>
          <div style={{ 
            height: '100%', 
            background: 'var(--brand)', 
            width: `${percent}%`, 
            transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: '0 0 10px var(--brand)'
          }}></div>
        </div>
      )}
    </header>
  )
}
