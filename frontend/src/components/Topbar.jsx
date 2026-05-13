import React, { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'

export default function Topbar() {
  const { 
    activeStore, activeStoreId, addToast, theme, toggleTheme,
    syncState, syncHistory, fetchSyncHistory 
  } = useApp()
  
  const [showNotifications, setShowNotifications] = useState(false)
  const notificationRef = useRef(null)

  // Close notifications on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setShowNotifications(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
  
  const hasErrors = Array.isArray(syncHistory) && syncHistory.some(log => log.failed > 0)

  return (
    <header className="topbar" style={{ position: 'relative', borderBottom: 'none' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px', height: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
          <div className="topbar-title" style={{ fontSize: '1rem', fontWeight: 700 }}>
            {activeStore?.store_name || activeStore?.shop_domain || 'Select Store'}
          </div>
          
          {/* 💊 SYNC CAPSULE (Global Progress) */}
          {syncState && (
            <div className="sync-capsule" style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.3)',
              borderRadius: 20, padding: '4px 12px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--brand)',
              animation: 'pulse-glow 2s infinite'
            }}>
              <span className="loading-spinner" style={{ width: 12, height: 12, borderWeight: '2px' }}></span>
              <span style={{ whiteSpace: 'nowrap' }}>{syncState.status}</span>
              <span style={{ color: 'var(--text-muted)', fontWeight: 400, whiteSpace: 'nowrap' }}>
                {processed} / {Math.max(processed, total)} ({percent}%)
              </span>
            </div>
          )}
        </div>

        <div className="topbar-actions" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button onClick={() => handleSync('shopify')} disabled={!!syncState} className="btn btn-secondary btn-sm">
            🛒 Shopify Sync
          </button>
          <button onClick={() => handleSync('courier')} disabled={!!syncState} className="btn btn-secondary btn-sm">
            🚚 Courier Sync
          </button>

          <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 5px' }}></div>

          {/* 🔔 NOTIFICATION HUB */}
          <div style={{ position: 'relative' }} ref={notificationRef}>
            <button 
              onClick={() => setShowNotifications(!showNotifications)}
              className="btn btn-secondary btn-sm"
              style={{ width: 36, height: 36, borderRadius: '50%', padding: 0, position: 'relative' }}
            >
              🔔
              {hasErrors && <span style={{ position: 'absolute', top: 0, right: 0, width: 10, height: 10, background: 'var(--red)', borderRadius: '50%', border: '2px solid var(--bg-elevated)' }}></span>}
            </button>

            {showNotifications && (
              <div style={{
                position: 'absolute', top: '120%', right: 0, width: 320, 
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: 12, boxShadow: '0 10px 25px rgba(0,0,0,0.3)', zIndex: 1000,
                maxHeight: 450, overflowY: 'auto', padding: 15
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 15, alignItems: 'center' }}>
                  <h4 style={{ margin: 0, fontSize: '0.9rem' }}>Sync History (3d)</h4>
                  <button onClick={fetchSyncHistory} style={{ fontSize: '0.7rem', background: 'none', border: 'none', color: 'var(--brand)', cursor: 'pointer' }}>Refresh</button>
                </div>
                
                {syncHistory.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20, fontSize: '0.8rem' }}>No recent sync logs</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {syncHistory.map(log => (
                      <div key={log.id} style={{ 
                        padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8,
                        borderLeft: `3px solid ${log.failed > 0 ? 'var(--red)' : 'var(--green)'}`
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>
                          <span>{log.type}</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                          ✅ {log.success} Success | {log.failed > 0 ? <span style={{ color: 'var(--red)' }}>❌ {log.failed} Failed</span> : '🎉 0 Failed'}
                        </div>
                        {log.failed > 0 && (
                          <a 
                            href={`/api/sync/history/${log.id}/download`} 
                            target="_blank" rel="noreferrer"
                            className="btn btn-primary btn-sm" 
                            style={{ width: '100%', fontSize: '0.7rem', padding: '4px 0', textDecoration: 'none', textAlign: 'center', display: 'block' }}
                          >
                            📊 Download Audit Report
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <button onClick={toggleTheme} className="btn btn-secondary btn-sm" style={{ width: 36, height: 36, borderRadius: '50%', padding: 0 }}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </div>

      {/* 📏 GLOBAL PROGRESS RAIL */}
      {syncState && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 2,
          background: 'rgba(255,255,255,0.1)', overflow: 'hidden'
        }}>
          <div style={{
            height: '100%', background: 'var(--brand)', 
            width: `${percent}%`, transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
          }}></div>
        </div>
      )}

      <style>{`
        @keyframes pulse-glow {
          0% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.4); }
          70% { box-shadow: 0 0 0 8px rgba(99, 102, 241, 0); }
          100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
        }
      `}</style>
    </header>
  )
}
