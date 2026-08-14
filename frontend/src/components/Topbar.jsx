import React, { useState, useEffect, useRef } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import SyncProgressCapsule from './SyncProgressCapsule'

export default function Topbar() {
  const { 
    stores, activeStore, activeStoreId, setActiveStoreId, user, addToast, theme, toggleTheme,
    syncHistory, fetchSyncHistory,
    isFocusMode, toggleFocusMode
  } = useApp()
  const location = useLocation()
  const isCommandCenter = location.pathname === '/search'
  
  const [showNotifications, setShowNotifications] = useState(false)
  const notificationRef = useRef(null)

  const [showStoreDropdown, setShowStoreDropdown] = useState(false)
  const storeDropdownRef = useRef(null)

  const [adviceCount, setAdviceCount] = useState(0)
  const [stuckCount, setStuckCount] = useState(0)

  // 🔔 Live Monitor Alert Counters Engine
  useEffect(() => {
    if (!activeStoreId) return;
    const fetchCounts = async () => {
      try {
        const [advRes, stuckRes] = await Promise.all([
          fetch(`/api/monitors/advice?store_id=${activeStoreId}`),
          fetch(`/api/monitors/stuck?store_id=${activeStoreId}`)
        ]);
        if (advRes.ok) {
          const advData = await advRes.json();
          setAdviceCount(Array.isArray(advData) ? advData.length : (advData.total || 0));
        }
        if (stuckRes.ok) {
          const stuckData = await stuckRes.json();
          setStuckCount(Array.isArray(stuckData) ? stuckData.length : (stuckData.total || 0));
        }
      } catch (e) {
        console.warn('Failed to fetch monitor alert counts:', e.message);
      }
    };

    fetchCounts();
    const interval = setInterval(fetchCounts, 60000);
    return () => clearInterval(interval);
  }, [activeStoreId]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setShowNotifications(false)
      }
      if (storeDropdownRef.current && !storeDropdownRef.current.contains(event.target)) {
        setShowStoreDropdown(false)
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px', height: '100%', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
          
          {/* 🏪 SUPER ADMIN QUICK STORE SWITCHER PILL */}
          <div style={{ position: 'relative' }} ref={storeDropdownRef}>
            <button
              onClick={() => setShowStoreDropdown(!showStoreDropdown)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 14px',
                borderRadius: 20,
                background: 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(168,85,247,0.12) 100%)',
                border: '1px solid rgba(99,102,241,0.25)',
                color: 'var(--text-primary)',
                fontWeight: 800,
                fontSize: '0.88rem',
                cursor: 'pointer',
                boxShadow: '0 2px 10px rgba(99,102,241,0.15)',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.25)'; e.currentTarget.style.transform = 'translateY(0)' }}
            >
              <span style={{ fontSize: '1rem' }}>🏪</span>
              <span>{activeStore?.store_name || activeStore?.shop_domain || 'Select Store'}</span>
              {stores.length > 1 && (
                <span style={{
                  fontSize: '0.62rem',
                  background: 'rgba(99,102,241,0.2)',
                  color: '#818cf8',
                  padding: '2px 6px',
                  borderRadius: 10,
                  fontWeight: 800
                }}>{stores.length} Stores</span>
              )}
              <span style={{ fontSize: '0.65rem', opacity: 0.6, transform: showStoreDropdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
            </button>

            {/* STORE DROPDOWN MENU */}
            {showStoreDropdown && (
              <div style={{
                position: 'absolute',
                top: '125%',
                left: 0,
                width: 280,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 16,
                boxShadow: '0 15px 35px rgba(0,0,0,0.4)',
                zIndex: 1000,
                overflow: 'hidden',
                backdropFilter: 'blur(10px)'
              }}>
                <div style={{
                  padding: '12px 16px',
                  background: 'rgba(99,102,241,0.06)',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  justify: 'space-between',
                  alignItems: 'center'
                }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Switch Connected Store
                  </span>
                  <span style={{ fontSize: '0.68rem', color: '#818cf8', fontWeight: 700 }}>
                    {user?.role === 'admin' ? '👑 Super Admin' : 'Store Access'}
                  </span>
                </div>

                <div style={{ maxHeight: 260, overflowY: 'auto', padding: '6px' }}>
                  {stores.map(store => {
                    const isActive = store.id === activeStoreId
                    return (
                      <button
                        key={store.id}
                        onClick={() => {
                          setActiveStoreId(store.id)
                          localStorage.setItem('activeStoreId', store.id)
                          setShowStoreDropdown(false)
                          addToast(`Switched active store to "${store.store_name || store.shop_domain}"`, 'success')
                        }}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justify: 'space-between',
                          padding: '10px 14px',
                          borderRadius: 10,
                          border: 'none',
                          background: isActive ? 'linear-gradient(135deg, rgba(99,102,241,0.2) 0%, rgba(168,85,247,0.2) 100%)' : 'transparent',
                          color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                          fontWeight: isActive ? 800 : 600,
                          fontSize: '0.82rem',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.15s ease',
                          marginBottom: 2
                        }}
                        onMouseEnter={e => { if(!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                        onMouseLeave={e => { if(!isActive) e.currentTarget.style.background = 'transparent' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: 8,
                            background: isActive ? 'var(--brand)' : 'rgba(255,255,255,0.08)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.8rem', fontWeight: 900, color: '#fff', flexShrink: 0
                          }}>
                            {(store.store_name || store.shop_domain || 'S')[0].toUpperCase()}
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {store.store_name || store.shop_domain}
                            </div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                              {store.shop_domain}
                            </div>
                          </div>
                        </div>
                        {isActive && <span style={{ color: '#34d399', fontSize: '0.9rem', fontWeight: 900, marginLeft: 8 }}>✓</span>}
                      </button>
                    )
                  })}
                </div>

                <div style={{ borderTop: '1px solid var(--border)', padding: '8px' }}>
                  <Link
                    to="/connect"
                    onClick={() => setShowStoreDropdown(false)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justify: 'center',
                      gap: 6,
                      padding: '8px 12px',
                      borderRadius: 10,
                      background: 'rgba(99,102,241,0.08)',
                      color: '#818cf8',
                      fontWeight: 700,
                      fontSize: '0.78rem',
                      textDecoration: 'none',
                      transition: 'all 0.15s'
                    }}
                  >
                    🔌 Connect New Store →
                  </Link>
                </div>
              </div>
            )}
          </div>
          
          {/* 💊 SYNC CAPSULE (Global Progress) */}
          <SyncProgressCapsule />

          {/* 🔔 LIVE ALERT BADGES */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 6 }}>
            {adviceCount > 0 && (
              <Link
                to="/advice"
                className="btn btn-xs"
                style={{
                  padding: '3px 10px',
                  fontSize: '0.72rem',
                  borderRadius: 12,
                  background: 'rgba(249,115,22,0.15)',
                  color: '#f97316',
                  border: '1px solid rgba(249,115,22,0.4)',
                  fontWeight: 700,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4
                }}
                title="Orders requiring Shipper Advice"
              >
                ⚡ Advice ({adviceCount})
              </Link>
            )}
            {stuckCount > 0 && (
              <Link
                to="/stuck"
                className="btn btn-xs"
                style={{
                  padding: '3px 10px',
                  fontSize: '0.72rem',
                  borderRadius: 12,
                  background: 'rgba(239,68,68,0.15)',
                  color: '#ef4444',
                  border: '1px solid rgba(239,68,68,0.4)',
                  fontWeight: 700,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4
                }}
                title="Stuck Parcels Monitor"
              >
                🚨 Stuck ({stuckCount})
              </Link>
            )}
          </div>
        </div>

        <div className="topbar-actions" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>

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

          {/* ⌨️ KEYBOARD SHORTCUTS BUTTON */}
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('toggle-keyboard-shortcuts'))}
            className="btn btn-secondary btn-sm"
            title="Keyboard Shortcuts Cheatsheet (⌘/ or ?)"
            style={{
              height: 38,
              borderRadius: 20,
              padding: '0 12px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.78rem',
              fontWeight: 600,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)'
            }}
          >
            <span>⌨️</span> Shortcuts <kbd style={{ fontSize: '0.65rem', background: 'rgba(255,255,255,0.1)', padding: '1px 5px', borderRadius: 4, opacity: 0.8 }}>⌘/</kbd>
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
