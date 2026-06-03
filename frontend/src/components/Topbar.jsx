import React, { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import SyncProgressCapsule from './SyncProgressCapsule'
import SyncButtons from './SyncButtons'

export default function Topbar() {
  const { 
    activeStore, activeStoreId, addToast, theme, toggleTheme,
    syncHistory, fetchSyncHistory,
    isFocusMode, toggleFocusMode
  } = useApp()
  const location = useLocation()
  const isCommandCenter = location.pathname === '/search'
  
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

  const downloadAuditReport = async (logId, logType) => {
    try {
      const token = localStorage.getItem('trace_token') || '';
      const res = await fetch(`/api/sync/history/${logId}/download`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Sync_Audit_${(logType || 'report').replace(/\s+/g, '_')}_${logId}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      addToast('❌ Download failed', 'error')
    }
  }

  const hasErrors = Array.isArray(syncHistory) && syncHistory.some(log => log.failed > 0)

  return (
    <header className="topbar" style={{ borderBottom: 'none' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px', height: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
          <div className="topbar-title" style={{ fontSize: '1rem', fontWeight: 700 }}>
            {activeStore?.store_name || activeStore?.shop_domain || 'Select Store'}
          </div>
          
          {/* 💊 SYNC CAPSULE (Global Progress) */}
          {/* 💊 SYNC CAPSULE (Global Progress) */}
          <SyncProgressCapsule />
        </div>

        <div className="topbar-actions" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <SyncButtons />

          <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 8px', opacity: 0.5 }}></div>

          {/* 🔔 NOTIFICATION HUB */}
          <div style={{ position: 'relative' }} ref={notificationRef}>
            <button 
              onClick={() => setShowNotifications(!showNotifications)}
              className="btn btn-secondary btn-sm"
              style={{ 
                width: 38, height: 38, borderRadius: '50%', padding: 0, position: 'relative',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)'
              }}
            >
              <span style={{ fontSize: '1.2rem' }}>🔔</span>
              <span style={{ 
                position: 'absolute', top: -2, right: -2, width: 12, height: 12, 
                background: 'var(--red)', borderRadius: '50%', border: '2px solid var(--bg-elevated)',
                boxShadow: '0 0 10px rgba(239, 68, 68, 0.4)',
                display: hasErrors ? 'block' : 'none'
              }}></span>
            </button>

              <div style={{
                position: 'absolute', top: '120%', right: 0, width: 320, 
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: 12, boxShadow: '0 10px 25px rgba(0,0,0,0.3)', zIndex: 1000,
                maxHeight: 450, overflowY: 'auto', padding: 15,
                display: showNotifications ? 'block' : 'none'
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
                        <button
                          onClick={() => downloadAuditReport(log.id, log.type)}
                          className="btn btn-primary btn-sm" 
                          style={{ width: '100%', fontSize: '0.7rem', padding: '4px 0', cursor: 'pointer', marginTop: 4 }}
                        >
                          📊 Download Report
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
          </div>

            <button 
              onClick={toggleFocusMode} 
              className={`btn btn-sm ${isFocusMode ? 'btn-brand' : 'btn-secondary'}`}
              title={isFocusMode ? "Exit Focus Mode" : "Enter Focus Mode (Hide Filters & Stats)"}
              style={{ 
                width: 38, height: 38, borderRadius: '50%', padding: 0,
                display: isCommandCenter ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center',
                background: isFocusMode ? 'var(--brand-glow)' : 'rgba(255,255,255,0.05)', 
                border: isFocusMode ? '1px solid var(--brand)' : '1px solid var(--border)',
                boxShadow: isFocusMode ? '0 0 15px rgba(99, 102, 241, 0.4)' : 'none'
              }}
            >
              <span style={{ fontSize: '1.2rem' }}>🎯</span>
            </button>

          <button 
            onClick={toggleTheme} 
            className="btn btn-secondary btn-sm" 
            style={{ 
              width: 38, height: 38, borderRadius: '50%', padding: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)'
            }}
          >
            <span style={{ fontSize: '1.2rem' }}>{theme === 'dark' ? '☀️' : '🌙'}</span>
          </button>
        </div>
      </div>

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
