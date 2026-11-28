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
  const [notifFilter, setNotifFilter] = useState('all') // 'all' | 'errors' | 'store'
  const [expandedLogId, setExpandedLogId] = useState(null)
  const [quickSyncBusy, setQuickSyncBusy] = useState('')
  const [seenSyncId, setSeenSyncId] = useState(() => Number(localStorage.getItem('trace_seen_sync_id') || 0))
  const notificationRef = useRef(null)

  const [showStoreDropdown, setShowStoreDropdown] = useState(false)
  const storeDropdownRef = useRef(null)

  const [adviceCount, setAdviceCount] = useState(0)
  const [stuckCount, setStuckCount] = useState(0)
  const [driftCount, setDriftCount] = useState(0)

  // 📝 Super Admin Quick Notepad Engine
  const isAdmin = !user || user.role === 'admin';
  const [showNotepadModal, setShowNotepadModal] = useState(false);
  const [notepadContent, setNotepadContent] = useState('');
  const [savingNotepad, setSavingNotepad] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState('');
  const saveTimeoutRef = useRef(null);

  // Fetch notepad contents when store changes or modal opens
  useEffect(() => {
    if (!activeStoreId || !isAdmin) return;
    const localSaved = localStorage.getItem(`admin_notepad_${activeStoreId}`);
    if (localSaved !== null) setNotepadContent(localSaved);

    const token = localStorage.getItem('trace_token') || '';
    fetch(`/api/users/notepad?store_id=${activeStoreId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.success && data.content !== undefined) {
          setNotepadContent(data.content);
          localStorage.setItem(`admin_notepad_${activeStoreId}`, data.content);
        }
      })
      .catch(() => {});
  }, [activeStoreId, isAdmin]);

  const saveNotepadToBackend = async (text) => {
    setSavingNotepad(true);
    try {
      localStorage.setItem(`admin_notepad_${activeStoreId}`, text);
      const token = localStorage.getItem('trace_token') || '';
      await fetch('/api/users/notepad', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ store_id: activeStoreId, content: text })
      });
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setLastSavedTime(nowStr);
    } catch (_) {
    } finally {
      setSavingNotepad(false);
    }
  };

  const handleNotepadChange = (val) => {
    setNotepadContent(val);
    localStorage.setItem(`admin_notepad_${activeStoreId}`, val);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveNotepadToBackend(val);
    }, 600);
  };

  // 🔔 Live Monitor Alert Counters Engine
  useEffect(() => {
    if (!activeStoreId) return;
    const fetchCounts = async () => {
      try {
        const [advRes, stuckRes, driftRes] = await Promise.all([
          fetch(`/api/monitors/advice?store_id=${activeStoreId}`),
          fetch(`/api/monitors/stuck?store_id=${activeStoreId}`),
          fetch(`/api/cost-manager/drift-summary?store_id=${activeStoreId}`)
        ]);
        if (advRes.ok) {
          const advData = await advRes.json();
          setAdviceCount(Array.isArray(advData) ? advData.length : (advData.total || 0));
        }
        if (stuckRes.ok) {
          const stuckData = await stuckRes.json();
          setStuckCount(Array.isArray(stuckData) ? stuckData.length : (stuckData.total || 0));
        }
        if (driftRes && driftRes.ok) {
          const driftData = await driftRes.json();
          setDriftCount(driftData.drift_count || 0);
        }
      } catch (e) {
        console.warn('Failed to fetch monitor alert counts:', e.message);
      }
    };

    fetchCounts();
    const interval = setInterval(fetchCounts, 60000);
    const handleRefresh = () => fetchCounts();
    window.addEventListener('refresh-drift-count', handleRefresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener('refresh-drift-count', handleRefresh);
    };
  }, [activeStoreId]);

  // Close dropdowns on outside click & Handle keyboard shortcuts
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setShowNotifications(false)
      }
      if (storeDropdownRef.current && !storeDropdownRef.current.contains(event.target)) {
        setShowStoreDropdown(false)
      }
    }

    const handleToggleStoreDropdown = () => setShowStoreDropdown(prev => !prev);
    const handleSwitchStoreIndex = (e) => {
      const idx = e.detail?.index;
      if (Array.isArray(stores) && stores[idx]) {
        setActiveStoreId(stores[idx].id);
        localStorage.setItem('activeStoreId', stores[idx].id);
        addToast(`Switched active store to "${stores[idx].store_name || stores[idx].shop_domain}"`, 'success');
      }
    };

    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('toggle-store-dropdown', handleToggleStoreDropdown);
    window.addEventListener('switch-store-index', handleSwitchStoreIndex);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('toggle-store-dropdown', handleToggleStoreDropdown);
      window.removeEventListener('switch-store-index', handleSwitchStoreIndex);
    }
  }, [stores, setActiveStoreId, addToast])

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

  const safeHistory = Array.isArray(syncHistory) ? syncHistory : [];
  const latestSyncId = safeHistory[0]?.id || 0;
  const unreadLogs = safeHistory.filter(l => Number(l.id) > seenSyncId);
  const unreadErrorCount = unreadLogs.filter(l => Number(l.failed) > 0).length;
  const unreadCount = unreadLogs.length;
  const totalErrorCount = safeHistory.filter(l => Number(l.failed) > 0).length;
  const thisStoreLogs = safeHistory.filter(l => !l.store_id || Number(l.store_id) === Number(activeStoreId));

  const visibleHistory = notifFilter === 'errors'
    ? safeHistory.filter(l => Number(l.failed) > 0)
    : notifFilter === 'store'
    ? thisStoreLogs
    : safeHistory;

  const toggleNotifications = () => {
    const next = !showNotifications;
    setShowNotifications(next);
    if (next) {
      fetchSyncHistory();
      if (latestSyncId > seenSyncId) {
        setSeenSyncId(latestSyncId);
        localStorage.setItem('trace_seen_sync_id', String(latestSyncId));
      }
    }
  };

  const triggerQuickSync = async (kind) => {
    if (!activeStoreId || quickSyncBusy) return;
    setQuickSyncBusy(kind);
    try {
      const token = localStorage.getItem('trace_token') || '';
      const res = await fetch('/api/sync/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ store_id: activeStoreId, type: kind === 'shopify' ? 'Shopify Sync' : 'Courier Sync' })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      addToast(data.message || '🔄 Sync started in background', 'success');
      setTimeout(() => fetchSyncHistory(), 3500);
    } catch (e) {
      addToast(`❌ ${e.message}`, 'error');
    } finally {
      setQuickSyncBusy('');
    }
  };

  const clearSyncHistory = async () => {
    if (!window.confirm('Clear all sync activity logs?')) return;
    try {
      const token = localStorage.getItem('trace_token') || '';
      const res = await fetch('/api/sync/history', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchSyncHistory();
        addToast('🧹 Sync history cleared', 'info');
      }
    } catch (_) {}
  };

  const getCategoryIcon = (cat, type) => {
    const c = String(cat || '').toLowerCase();
    const t = String(type || '').toLowerCase();
    if (c === 'booking' || t.includes('book') || t.includes('cancel')) return '📦';
    if (c === 'courier' || t.includes('postex') || t.includes('insta') || t.includes('courier')) return '🚚';
    if (c === 'catalog' || t.includes('catalog') || t.includes('cost')) return '🏷️';
    if (c === 'tags' || t.includes('ready to book')) return '📋';
    if (c === 'email' || t.includes('email') || t.includes('drip')) return '📧';
    if (c === 'finance' || t.includes('payout')) return '💰';
    if (c === 'shopify' || t.includes('shopify')) return '🛒';
    return '⚡';
  };

  const formatSyncTimestamp = (raw) => {
    if (!raw) return '';
    // SQLite sync_history timestamps are stored in PKT ('YYYY-MM-DD HH:MM:SS')
    const iso = String(raw).includes('T') ? raw : String(raw).replace(' ', 'T') + '+05:00';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(raw).slice(0, 16);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const yest = new Date(now);
    yest.setDate(now.getDate() - 1);
    const isYest = d.toDateString() === yest.toDateString();
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (sameDay) return `Today · ${timeStr}`;
    if (isYest) return `Yesterday · ${timeStr}`;
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${timeStr}`;
  };

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
            {driftCount > 0 && (
              <Link
                to="/costing?tab=drift"
                className="btn btn-xs"
                style={{
                  padding: '3px 10px',
                  fontSize: '0.72rem',
                  borderRadius: 12,
                  background: 'rgba(245,158,11,0.15)',
                  color: '#f59e0b',
                  border: '1px solid rgba(245,158,11,0.4)',
                  fontWeight: 700,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  boxShadow: '0 0 10px rgba(245,158,11,0.2)'
                }}
                title="Price Drifts: Shopify costs differ from ERP accepted costs"
              >
                ⚡ Drift ({driftCount})
              </Link>
            )}
          </div>
        </div>

        <div className="topbar-actions" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>

          {/* 🔔 SYNC & ACTIVITY NOTIFICATION HUB */}
          <div style={{ position: 'relative' }} ref={notificationRef}>
            <button 
              onClick={toggleNotifications}
              className="btn btn-secondary btn-sm"
              title="Sync & Activity Center (Last 3 Days)"
              style={{ 
                width: 38, height: 38, borderRadius: '50%', padding: 0, position: 'relative',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: showNotifications ? 'rgba(99, 102, 241, 0.14)' : 'var(--bg-elevated)',
                border: showNotifications ? '1px solid var(--brand)' : '1px solid var(--border-bright)'
              }}
            >
              <span style={{ fontSize: '1.15rem' }}>🔔</span>
              {(unreadErrorCount > 0 || unreadCount > 0) && (
                <span style={{
                  position: 'absolute', top: -4, right: -4,
                  minWidth: 18, height: 18, padding: '0 4px',
                  borderRadius: 999,
                  background: unreadErrorCount > 0 ? '#ef4444' : '#6366f1',
                  color: '#fff',
                  fontSize: '0.62rem',
                  fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '2px solid var(--bg-surface)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.25)'
                }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 10px)', right: 0, width: 400, maxWidth: '92vw',
                background: 'var(--bg-surface)', border: '1px solid var(--border-bright)',
                borderRadius: 16, boxShadow: '0 18px 42px rgba(0,0,0,0.28)', zIndex: 1000,
                display: 'flex', flexDirection: 'column', overflow: 'hidden'
              }}>
                {/* Header */}
                <div style={{
                  padding: '13px 16px',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                  background: 'var(--bg-elevated)'
                }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                      🔔 Sync &amp; Activity (3d)
                    </h4>
                    <span style={{ fontSize: '0.69rem', color: 'var(--text-muted)' }}>
                      Live Shopify, Courier, Bulk &amp; Automation feed
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={fetchSyncHistory}
                      style={{ fontSize: '0.72rem', fontWeight: 700, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 7, padding: '4px 8px', color: 'var(--brand)', cursor: 'pointer' }}
                    >
                      🔄 Refresh
                    </button>
                    {isAdmin && safeHistory.length > 0 && (
                      <button
                        type="button"
                        onClick={clearSyncHistory}
                        title="Clear Sync History"
                        style={{ fontSize: '0.7rem', fontWeight: 700, background: 'transparent', border: '1px solid var(--border)', borderRadius: 7, padding: '4px 7px', color: 'var(--text-muted)', cursor: 'pointer' }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {/* Filter Tabs + Quick Sync Strip */}
                <div style={{
                  padding: '9px 14px',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, flexWrap: 'wrap'
                }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[
                      { id: 'all', label: `All (${safeHistory.length})` },
                      { id: 'store', label: `Store (${thisStoreLogs.length})` },
                      { id: 'errors', label: `Errors (${totalErrorCount})` }
                    ].map(tab => {
                      const active = notifFilter === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setNotifFilter(tab.id)}
                          style={{
                            fontSize: '0.7rem', fontWeight: 700,
                            padding: '4px 9px', borderRadius: 999, cursor: 'pointer',
                            border: `1px solid ${active ? '#6366f1' : 'var(--border)'}`,
                            background: active ? 'rgba(99,102,241,0.14)' : 'var(--bg-elevated)',
                            color: active ? '#6366f1' : (tab.id === 'errors' && totalErrorCount > 0 ? '#dc2626' : 'var(--text-secondary)')
                          }}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 5 }}>
                    <button
                      type="button"
                      disabled={Boolean(quickSyncBusy)}
                      onClick={() => triggerQuickSync('shopify')}
                      title="Sync active store orders from Shopify now"
                      style={{ fontSize: '0.68rem', fontWeight: 700, padding: '4px 8px', borderRadius: 7, background: 'rgba(16,185,129,0.12)', color: '#059669', border: '1px solid rgba(16,185,129,0.3)', cursor: 'pointer' }}
                    >
                      {quickSyncBusy === 'shopify' ? '⏳' : '🛒 Sync'}
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(quickSyncBusy)}
                      onClick={() => triggerQuickSync('courier')}
                      title="Sync PostEx & Instaworld tracking for active store now"
                      style={{ fontSize: '0.68rem', fontWeight: 700, padding: '4px 8px', borderRadius: 7, background: 'rgba(59,130,246,0.12)', color: '#2563eb', border: '1px solid rgba(59,130,246,0.3)', cursor: 'pointer' }}
                    >
                      {quickSyncBusy === 'courier' ? '⏳' : '🚚 Track'}
                    </button>
                  </div>
                </div>

                {/* Feed Body */}
                <div style={{ maxHeight: 380, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {visibleHistory.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '26px 14px', fontSize: '0.8rem' }}>
                      <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>📭</div>
                      <div style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>
                        {notifFilter === 'errors' ? 'Zero failed syncs in the last 3 days!' : 'No sync activity yet'}
                      </div>
                      <div style={{ fontSize: '0.72rem', marginTop: 4 }}>
                        Click <strong>🛒 Sync</strong> or <strong>🚚 Track</strong> above, or wait for automated jobs.
                      </div>
                    </div>
                  ) : (
                    visibleHistory.map(log => {
                      const hasFailed = Number(log.failed) > 0;
                      const isExpanded = expandedLogId === log.id;
                      const previewList = Array.isArray(log.preview) ? log.preview : [];
                      return (
                        <div
                          key={log.id}
                          style={{
                            padding: '10px 12px',
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border)',
                            borderLeft: `3px solid ${hasFailed ? '#ef4444' : '#10b981'}`,
                            borderRadius: 10,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 5
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                              <span style={{ fontSize: '0.88rem' }}>{getCategoryIcon(log.category, log.type)}</span>
                              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {log.type}
                              </span>
                            </div>
                            <span style={{ fontSize: '0.67rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                              {formatSyncTimestamp(log.created_at)}
                            </span>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              {log.store_name && (
                                <span style={{
                                  fontSize: '0.66rem', fontWeight: 700,
                                  padding: '1px 6px', borderRadius: 999,
                                  background: 'rgba(99,102,241,0.1)', color: '#6366f1'
                                }}>
                                  {log.store_name}
                                </span>
                              )}
                              <span>✅ {log.success}</span>
                              {hasFailed ? (
                                <span style={{ color: '#dc2626', fontWeight: 700 }}>❌ {log.failed} Failed</span>
                              ) : (
                                <span style={{ color: '#059669' }}>· 0 Failed</span>
                              )}
                            </div>

                            <div style={{ display: 'flex', gap: 5 }}>
                              {previewList.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                                  style={{
                                    fontSize: '0.67rem', fontWeight: 700, padding: '2px 7px', borderRadius: 6,
                                    background: 'var(--bg-surface)', color: 'var(--text-primary)',
                                    border: '1px solid var(--border-bright)', cursor: 'pointer'
                                  }}
                                >
                                  {isExpanded ? 'Hide' : `Details (${log.details_count || previewList.length})`}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => downloadAuditReport(log.id, log.type)}
                                style={{
                                  fontSize: '0.67rem', fontWeight: 700, padding: '2px 7px', borderRadius: 6,
                                  background: 'rgba(99,102,241,0.12)', color: '#6366f1',
                                  border: '1px solid rgba(99,102,241,0.3)', cursor: 'pointer'
                                }}
                              >
                                📊 CSV
                              </button>
                            </div>
                          </div>

                          {log.summary && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
                              {log.summary}
                            </div>
                          )}

                          {isExpanded && previewList.length > 0 && (
                            <div style={{
                              marginTop: 4,
                              padding: '7px 9px',
                              borderRadius: 8,
                              background: 'var(--bg-surface)',
                              border: '1px solid var(--border)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 4,
                              fontSize: '0.7rem'
                            }}>
                              {previewList.map((item, i) => (
                                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: item.status === 'FAILED' ? '#dc2626' : 'var(--text-primary)', flexShrink: 0 }}>
                                    {item.id}
                                  </span>
                                  <span style={{ color: 'var(--text-secondary)', wordBreak: 'break-word' }}>
                                    {item.message || item.status}
                                  </span>
                                </div>
                              ))}
                              {(log.details_count || 0) > previewList.length && (
                                <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                  +{log.details_count - previewList.length} more rows — click 📊 CSV for full report.
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
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

          {/* 📝 SUPER ADMIN QUICK NOTEPAD BUTTON */}
          {isAdmin && (
            <button
              onClick={() => setShowNotepadModal(prev => !prev)}
              className="btn btn-secondary btn-sm"
              title="Super Admin Quick Notepad (Private Notes & Reminders)"
              style={{
                height: 38,
                borderRadius: 20,
                padding: '0 12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '0.78rem',
                fontWeight: 600,
                background: showNotepadModal ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255,255,255,0.05)',
                border: showNotepadModal ? '1px solid var(--brand)' : '1px solid var(--border)',
                color: showNotepadModal ? 'var(--brand)' : 'var(--text-secondary)',
                boxShadow: showNotepadModal ? '0 0 12px rgba(99, 102, 241, 0.3)' : 'none'
              }}
            >
              <span>📝</span> Notepad
            </button>
          )}

          {/* 🧩 CHROME EXTENSION DOWNLOAD SHORTCUT */}
          <Link
            to="/setup-guide?tab=extension"
            className="btn btn-secondary btn-sm"
            title="Download Updated Chrome Extension ZIP & Install Guide"
            style={{
              height: 38,
              borderRadius: 20,
              padding: '0 12px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.78rem',
              fontWeight: 600,
              textDecoration: 'none',
              background: location.pathname === '/setup-guide' && location.search.includes('extension')
                ? 'rgba(16, 185, 129, 0.16)'
                : 'rgba(255,255,255,0.05)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)'
            }}
          >
            <span>🧩</span> Extension
          </Link>

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

      {/* 📝 SUPER ADMIN QUICK NOTEPAD MODAL */}
      {showNotepadModal && isAdmin && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) setShowNotepadModal(false); }}
          style={{ 
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 99999, 
            display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)',
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          <div style={{ 
            background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 16, 
            width: '90%', maxWidth: 620, padding: 24, boxShadow: '0 25px 60px rgba(0,0,0,0.7)', 
            display: 'flex', flexDirection: 'column', gap: 16 
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ 
                  width: 36, height: 36, borderRadius: 10, background: 'rgba(99, 102, 241, 0.15)', 
                  border: '1px solid rgba(99, 102, 241, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.2rem'
                }}>📝</div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>Super Admin Quick Notepad</h3>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Private to Super Admin | Auto-syncs to cloud</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '0.72rem', color: savingNotepad ? 'var(--brand)' : '#22c55e', fontWeight: 700 }}>
                  {savingNotepad ? '💾 Saving...' : (lastSavedTime ? `✅ Saved ${lastSavedTime}` : '✅ Auto-saved')}
                </span>
                <button 
                  onClick={() => setShowNotepadModal(false)} 
                  className="btn btn-secondary btn-sm" 
                  style={{ padding: '4px 10px', borderRadius: 8, fontSize: '0.9rem' }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Textarea Input */}
            <textarea
              value={notepadContent}
              onChange={(e) => handleNotepadChange(e.target.value)}
              placeholder="Type private admin notes, reminders, task lists, or shop credentials here... Auto-saves automatically!"
              autoFocus
              style={{
                width: '100%',
                height: 300,
                background: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: 16,
                fontSize: '0.9rem',
                lineHeight: 1.6,
                fontFamily: 'inherit',
                resize: 'vertical',
                outline: 'none',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
              }}
            />

            {/* Modal Footer Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              <div>
                <span>{notepadContent.length} chars | {notepadContent.trim() ? notepadContent.trim().split(/\s+/).length : 0} words</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(notepadContent);
                    addToast('📋 Notes copied to clipboard!', 'success');
                  }}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '0.75rem', padding: '5px 12px' }}
                >
                  📋 Copy All
                </button>
                <button
                  onClick={() => handleNotepadChange('')}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '0.75rem', color: 'var(--red)', padding: '5px 12px' }}
                >
                  🧹 Clear
                </button>
                <button
                  onClick={() => saveNotepadToBackend(notepadContent)}
                  className="btn btn-primary btn-sm"
                  style={{ fontSize: '0.75rem', padding: '5px 14px' }}
                >
                  💾 Save Now
                </button>
              </div>
            </div>
          </div>
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
