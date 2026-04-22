import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { lazy, Suspense } from 'react'
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Orders = lazy(() => import('./pages/Orders'))
const SearchTool = lazy(() => import('./pages/SearchTool'))
const StuckMonitor = lazy(() => import('./pages/StuckMonitor'))
const AdviceMonitor = lazy(() => import('./pages/AdviceMonitor'))
const Watchdog = lazy(() => import('./pages/Watchdog'))
const ReturnsManager = lazy(() => import('./pages/ReturnsManager'))
const FinanceManager = lazy(() => import('./pages/FinanceManager'))
const Reports = lazy(() => import('./pages/Reports'))
const Connect = lazy(() => import('./pages/Connect'))
const Login = lazy(() => import('./pages/Login'))
const Users = lazy(() => import('./pages/Users'))

import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import ToastContainer from './components/ToastContainer'

import { AppContext, useApp } from './context/AppContext'

// ─── App Root ─────────────────────────────
export default function App() {
  const [stores, setStores] = useState([])
  const [activeStoreId, setActiveStoreId] = useState(null)
  const [toasts, setToasts] = useState([])
  const [badgeCounts, setBadgeCounts] = useState({ stuck: 0, advice: 0, watchdog: 0 })
  const [showAgingBar, setShowAgingBar] = useState(() => localStorage.getItem('trace_show_aging') !== 'false')

  const toggleAgingBar = () => {
    setShowAgingBar(prev => {
      localStorage.setItem('trace_show_aging', !prev)
      return !prev
    })
  }

  const addToast = (message, type = 'info', duration = 3500) => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration)
  }

  useEffect(() => {
    if (!token) return
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
    if (!activeStoreId || !token) return
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

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true'
  })

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev
      localStorage.setItem('sidebar_collapsed', next)
      return next
    })
  }

  const activeStore = stores.find(s => s.id === activeStoreId)

  const [theme, setTheme] = useState(() => localStorage.getItem('trace_theme') || 'dark')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('trace_theme', theme)
  }, [theme])

  useEffect(() => {
    if (!token) return
    const originalFetch = window.fetch
    window.fetch = async (...args) => {
      let [resource, config] = args
      if (typeof resource === 'string' && resource.startsWith('/api/') && !resource.includes('/api/auth/login') && !resource.includes('/api/auth/callback')) {
        config = config || {}
        config.headers = config.headers || {}
        config.headers['Authorization'] = `Bearer ${token}`
      }
      const response = await originalFetch(resource, config)
      if (response.status === 401 && !resource.includes('/api/auth/login')) {
        logout()
      }
      return response
    }
    return () => { window.fetch = originalFetch }
  }, [token])

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark')

  const [token, setToken] = useState(() => localStorage.getItem('trace_token'))
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('trace_user')) } catch(e) { return null }
  })

  const logout = () => {
    localStorage.removeItem('trace_token')
    localStorage.removeItem('trace_user')
    setToken(null)
    setUser(null)
    addToast('Logged out successfully', 'info')
  }

  const ctx = { 
    stores, setStores, activeStoreId, setActiveStoreId, activeStore, 
    addToast, badgeCounts, setBadgeCounts, 
    sidebarCollapsed, toggleSidebar,
    theme, toggleTheme, showAgingBar, toggleAgingBar,
    token, setToken, user, setUser, logout
  }

  if (!token) {
    return (
      <AppContext.Provider value={ctx}>
        <Suspense fallback={<div className="loading-screen"><span className="loading-spinner"></span></div>}>
          <Login />
        </Suspense>
        <ToastContainer toasts={toasts} />
      </AppContext.Provider>
    )
  }

  return (
    <AppContext.Provider value={ctx}>
      <BrowserRouter>
        <div className={`app-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${localStorage.getItem('search_compact') === 'true' ? 'ultra-compact-mode' : ''}`}>
          <Sidebar />
          <div className="main-content">
            <Topbar />
            <div className="page-content">
              <Suspense fallback={<div className="loading-screen"><span className="loading-spinner"></span></div>}>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/orders" element={<Orders />} />
                  <Route path="/search" element={<SearchTool />} />
                  <Route path="/returns" element={<ReturnsManager />} />
                  <Route path="/finance" element={<FinanceManager />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/stuck" element={<StuckMonitor />} />
                  <Route path="/advice" element={<AdviceMonitor />} />
                  <Route path="/watchdog" element={<Watchdog />} />
                  <Route path="/connect" element={<Connect />} />
                  <Route path="/users" element={<Users />} />
                </Routes>
              </Suspense>
            </div>
          </div>
        </div>
        <ToastContainer toasts={toasts} />
      </BrowserRouter>
    </AppContext.Provider>
  )
}
