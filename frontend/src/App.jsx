import { useState, useEffect, createContext, useContext } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Orders from './pages/Orders'
import SearchTool from './pages/SearchTool'
import StuckMonitor from './pages/StuckMonitor'
import AdviceMonitor from './pages/AdviceMonitor'
import Watchdog from './pages/Watchdog'
import ReturnsManager from './pages/ReturnsManager'
import FinanceManager from './pages/FinanceManager'
import Connect from './pages/Connect'

// ─── Global Context ───────────────────────
export const AppContext = createContext(null)
export const useApp = () => useContext(AppContext)

// ─── Toast System ─────────────────────────
export function useToast() {
  const { addToast } = useApp()
  return addToast
}

function ToastContainer({ toasts }) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`}>
          {t.message}
        </div>
      ))}
    </div>
  )
}

// ─── App Root ─────────────────────────────
export default function App() {
  const [stores, setStores] = useState([])
  const [activeStoreId, setActiveStoreId] = useState(null)
  const [toasts, setToasts] = useState([])
  const [badgeCounts, setBadgeCounts] = useState({ stuck: 0, advice: 0, watchdog: 0 })

  const addToast = (message, type = 'info', duration = 3500) => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration)
  }

  useEffect(() => {
    fetch('/api/stores')
      .then(r => r.json())
      .then(data => {
        const connected = data.filter(s => s.is_connected)
        setStores(connected)
        if (connected.length > 0) {
          const saved = localStorage.getItem('activeStoreId')
          const validSaved = connected.find(s => s.id === parseInt(saved))
          setActiveStoreId(validSaved ? parseInt(saved) : connected[0].id)
        }
      })
      .catch(() => addToast('Failed to load stores', 'error'))
  }, [])

  useEffect(() => {
    if (!activeStoreId) return
    localStorage.setItem('activeStoreId', activeStoreId)

    // Fetch badge counts
    Promise.all([
      fetch(`/api/monitors/stuck?store_id=${activeStoreId}`).then(r => r.json()),
      fetch(`/api/monitors/advice?store_id=${activeStoreId}`).then(r => r.json()),
      fetch(`/api/watchdog?store_id=${activeStoreId}`).then(r => r.json()),
    ]).then(([stuck, advice, watchdog]) => {
      const fakeCount = Array.isArray(watchdog) ? watchdog.filter(w => w.verdict?.includes('FAKE')).length : 0
      setBadgeCounts({
        stuck: Array.isArray(stuck) ? stuck.length : 0,
        advice: Array.isArray(advice) ? advice.length : 0,
        watchdog: fakeCount,
      })
    }).catch(() => {})
  }, [activeStoreId])

  const activeStore = stores.find(s => s.id === activeStoreId)

  const ctx = { stores, setStores, activeStoreId, setActiveStoreId, activeStore, addToast, badgeCounts, setBadgeCounts }

  return (
    <AppContext.Provider value={ctx}>
      <BrowserRouter>
        <div className="app-layout">
          <Sidebar />
          <div className="main-content">
            <Topbar />
            <div className="page-content">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/orders" element={<Orders />} />
                <Route path="/search" element={<SearchTool />} />
                <Route path="/returns" element={<ReturnsManager />} />
                <Route path="/finance" element={<FinanceManager />} />
                <Route path="/stuck" element={<StuckMonitor />} />
                <Route path="/advice" element={<AdviceMonitor />} />
                <Route path="/watchdog" element={<Watchdog />} />
                <Route path="/connect" element={<Connect />} />
              </Routes>
            </div>
          </div>
        </div>
        <ToastContainer toasts={toasts} />
      </BrowserRouter>
    </AppContext.Provider>
  )
}

// ─── Sidebar ──────────────────────────────
function Sidebar() {
  const { stores, activeStoreId, setActiveStoreId, badgeCounts } = useApp()

  const navItems = [
    { to: '/', icon: '🏠', label: 'Dashboard' },
    { to: '/orders', icon: '📦', label: 'Orders' },
    { to: '/search', icon: '🔍', label: 'Command Center' },
    { to: '/returns', icon: '↩️', label: 'Unified Returns' },
    { to: '/finance', icon: '💰', label: 'Finance Engine' },
    { to: '/stuck', icon: '⏳', label: 'Stuck Monitor', badge: badgeCounts.stuck },
    { to: '/advice', icon: '🧠', label: 'Advice Monitor', badge: badgeCounts.advice },
    { to: '/watchdog', icon: '🐕', label: 'Watchdog', badge: badgeCounts.watchdog },
    { to: '/connect', icon: '🔌', label: 'Connect Store' },
  ]

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <h1>TRACE ERP</h1>
        <span>Multi-Store Dashboard</span>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-label">Navigation</div>
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
            {item.badge > 0 && <span className="nav-badge">{item.badge}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="store-switcher">
        <span className="store-select-label">Active Store</span>
        {stores.length === 0 ? (
          <NavLink to="/connect" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
            + Connect Store
          </NavLink>
        ) : (
          <select
            className="store-select"
            value={activeStoreId || ''}
            onChange={e => setActiveStoreId(parseInt(e.target.value))}
          >
            {stores.map(s => (
              <option key={s.id} value={s.id}>{s.store_name || s.shop_domain}</option>
            ))}
          </select>
        )}
      </div>
    </aside>
  )
}

// ─── Topbar ───────────────────────────────
function Topbar() {
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
        <div className="topbar-actions" style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleShopifySync}
            disabled={syncing || !activeStoreId}
            title="Fetch new orders + update prices & costs from Shopify"
          >
            {syncingShopify ? <><span className="loading-spinner"></span> Syncing...</> : '🛒 Shopify Sync'}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleCourierSync}
            disabled={syncing || !activeStoreId}
            title="Update delivery statuses from PostEx & Instaworld"
          >
            {syncingCouriers ? <><span className="loading-spinner"></span> Syncing...</> : '🚚 Courier Sync'}
          </button>
        </div>
      </div>
      {syncing && progress && (
        <div style={{ marginTop: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 6 }}>
            <span style={{ fontWeight: 500, color: 'var(--primary)' }}>{progress.status}</span>
            <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
              {progress.total > 0 ? `${progress.processed} / ${progress.total} (${percent}%)` : `${progress.processed} processed`}
            </span>
          </div>
          <div style={{ height: 6, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: 'var(--primary)', width: `${percent}%`, transition: 'width 0.3s ease' }}></div>
          </div>
        </div>
      )}
    </header>
  )
}
