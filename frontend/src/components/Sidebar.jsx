import React from 'react'
import { NavLink } from 'react-router-dom'
import { useApp } from '../context/AppContext'

export default function Sidebar() {
  const { stores, activeStoreId, setActiveStoreId, badgeCounts, sidebarCollapsed, toggleSidebar, user, logout } = useApp()

  const navItems = [
    { to: '/', icon: '🏠', label: 'Dashboard' },
    { to: '/orders', icon: '📦', label: 'Orders' },
    { to: '/search', icon: '🔍', label: 'Command Center' },
    { to: '/returns', icon: '↩️', label: 'Unified Returns' },
    { to: '/finance', icon: '💰', label: 'Finance Engine', permission: 'view_finance' },
    { to: '/reports', icon: '📊', label: 'Profit & Loss', permission: 'view_reports' },
    { to: '/stuck', icon: '⏳', label: 'Stuck Monitor', badge: badgeCounts.stuck },
    { to: '/advice', icon: '🧠', label: 'Advice Monitor', badge: badgeCounts.advice },
    { to: '/watchdog', icon: '🐕', label: 'Watchdog', badge: badgeCounts.watchdog },
    { to: '/connect', icon: '🔌', label: 'Connect Store', permission: 'manage_stores' },
    { to: '/users', icon: '👥', label: 'User Management', permission: 'super_admin' },
    { to: '/profile', icon: '👤', label: 'My Profile' },
  ].filter(item => {
    if (!item.permission) return true
    if (user?.role === 'admin') return true
    if (item.permission === 'super_admin') return user?.role === 'admin'
    return user?.permissions?.includes(item.permission)
  })

  const toggleTheme = () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark'
    const next = current === 'dark' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('trace_theme', next)
  }

  return (
    <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-logo">
        {!sidebarCollapsed && <h1>TRACE ERP</h1>}
        <button onClick={toggleSidebar} className="btn-toggle" style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>
          {sidebarCollapsed ? '➡️' : '⬅️'}
        </button>
      </div>

      <nav className="sidebar-nav">
        {!sidebarCollapsed && <div className="nav-section-label">Main Menu</div>}
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            {!sidebarCollapsed && <span className="nav-label">{item.label}</span>}
            {item.badge > 0 && <span className="nav-badge">{item.badge}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer" style={{ padding: 16, borderTop: '1px solid var(--border)' }}>
        {!sidebarCollapsed && (
          <div className="form-group">
            <label className="form-label" style={{ fontSize: '0.65rem' }}>Switch Store</label>
            <select
              className="form-select"
              style={{ width: '100%', fontSize: '0.8rem', padding: '6px' }}
              value={activeStoreId || ''}
              onChange={e => setActiveStoreId(parseInt(e.target.value))}
            >
              {stores.map(s => (
                <option key={s.id} value={s.id}>{s.store_name || s.shop_domain}</option>
              ))}
            </select>
          </div>
        )}
        
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
           <button onClick={toggleTheme} className="btn btn-secondary btn-sm" style={{ flex: 1, justifyContent: 'center' }} title="Toggle Light/Dark">
             🌓
           </button>
           <button onClick={logout} className="btn btn-secondary btn-sm" style={{ flex: 1, justifyContent: 'center', color: 'var(--danger)' }} title="Logout">
             🚪
           </button>
        </div>

        {!sidebarCollapsed && (
          <div style={{ textAlign: 'center', marginTop: 16, fontSize: '0.65rem', color: 'var(--text-muted)', opacity: 0.5 }}>
            v1.6.0 Premium
          </div>
        )}
      </div>
    </aside>
  )
}
