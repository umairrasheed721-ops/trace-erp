import React, { useState, useEffect } from 'react'
import { AppContext } from './AppContext'

export default function AppProvider({ children }) {
  const [stores, setStores] = useState([])
  const [activeStoreId, setActiveStoreId] = useState(null)
  const [toasts, setToasts] = useState([])
  const [badgeCounts, setBadgeCounts] = useState({ stuck: 0, advice: 0, watchdog: 0 })
  const [showAgingBar, setShowAgingBar] = useState(() => localStorage.getItem('trace_show_aging') !== 'false')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('sidebar_collapsed') === 'true')
  const [theme, setTheme] = useState(() => localStorage.getItem('trace_theme') || 'dark')
  const [token, setToken] = useState(() => localStorage.getItem('trace_token'))
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('trace_user')) } catch(e) { return null }
  })
  const [permissions, setPermissions] = useState([])
  const [syncState, setSyncState] = useState(null)
  const [syncHistory, setSyncHistory] = useState([])

  const addToast = (message, type = 'info', duration = 3500) => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration)
  }

  const logout = () => {
    localStorage.removeItem('trace_token')
    localStorage.removeItem('trace_user')
    setToken(null)
    setUser(null)
    addToast('Logged out successfully', 'info')
  }

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev
      localStorage.setItem('sidebar_collapsed', next)
      return next
    })
  }

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark')
  
  const toggleAgingBar = () => {
    setShowAgingBar(prev => {
      localStorage.setItem('trace_show_aging', !prev)
      return !prev
    })
  }
  
  const fetchPermissions = () => {
    if (!token) return
    fetch('/api/users/permissions', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setPermissions(data)
        else setPermissions([])
      })
      .catch(() => setPermissions([]))
  }

  const fetchSyncHistory = () => {
    if (!token) return
    fetch('/api/sync/history')
      .then(r => r.json())
      .then(setSyncHistory)
      .catch(() => {})
  }

  useEffect(() => {
    if (token) {
      fetchPermissions()
      fetchSyncHistory()
    }
  }, [token])

  useEffect(() => {
    if (!token) return
    
    // Connect to global SSE stream
    const eventSource = new EventSource('/api/public/sse')
    
    eventSource.addEventListener('sync_progress', (e) => {
      const data = JSON.parse(e.data)
      // Only show progress if it's for the current store
      if (data.storeId === activeStoreId) {
        setSyncState(data)
        if (data.status === 'Sync Complete') {
          setTimeout(() => setSyncState(null), 5000)
        }
      }
    })

    eventSource.addEventListener('sync_history_updated', () => {
      fetchSyncHistory()
    })

    return () => eventSource.close()
  }, [token, activeStoreId])

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
      .catch(() => {})
  }, [token])

  useEffect(() => {
    if (!activeStoreId || !token) return
    localStorage.setItem('activeStoreId', activeStoreId)
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
  }, [activeStoreId, token])

  const activeStore = stores.find(s => s.id === activeStoreId)

  const value = {
    stores, setStores, activeStoreId, setActiveStoreId, activeStore,
    toasts, addToast, badgeCounts, setBadgeCounts,
    sidebarCollapsed, toggleSidebar,
    theme, toggleTheme, showAgingBar, toggleAgingBar,
    token, setToken, user, setUser, logout,
    permissions, setPermissions, fetchPermissions,
    syncState, syncHistory, fetchSyncHistory
  }

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  )
}
