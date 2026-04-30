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
    { to: '/costing', icon: '💎', label: 'Master Costing', permission: 'view_finance' },
    { to: '/reports', icon: '📊', label: 'Profit & Loss', permission: 'view_reports' },
    { to: '/intelligence', icon: '🧠', label: 'Courier Intelligence', permission: 'view_reports' },
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

  return (
    <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-logo">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          {!sidebarCollapsed && (
            <div style={{ overflow: 'hidden' }}>
              <h1>TRACE ERP</h1>
              <span>Multi-Store Dashboard</span>
            </div>
          )}
          <button 
            onClick={toggleSidebar} 
            className="sidebar-toggle"
            title={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {sidebarCollapsed ? '➡️' : '⬅️'}
          </button>
        </div>
      </div>

      <nav className="sidebar-nav">
        {!sidebarCollapsed && <div className="nav-section-label">Navigation</div>}
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            title={sidebarCollapsed ? item.label : ''}
          >
            <span className="nav-icon">{item.icon}</span>
            {!sidebarCollapsed && item.label}
            {item.badge > 0 && <span className="nav-badge">{item.badge}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="store-switcher">
        {!sidebarCollapsed && <span className="store-select-label">Active Store</span>}
        {stores.length === 0 ? (
          <NavLink to="/connect" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
            + {sidebarCollapsed ? '' : 'Connect Store'}
          </NavLink>
        ) : (
          <select
            className="store-select"
            value={activeStoreId || ''}
            onChange={e => setActiveStoreId(parseInt(e.target.value))}
            style={sidebarCollapsed ? { padding: '4px 2px', textAlign: 'center' } : {}}
          >
            {stores.map(s => (
              <option key={s.id} value={s.id}>{sidebarCollapsed ? (s.store_name || s.shop_domain).substring(0,2).toUpperCase() : (s.store_name || s.shop_domain)}</option>
            ))}
          </select>
        )}
        <button 
          onClick={logout}
          className="btn btn-secondary btn-sm" 
          style={{ width: '100%', justifyContent: 'center', marginTop: 10, background: 'rgba(239, 68, 68, 0.1)', color: 'var(--red)', border: '1px solid rgba(239, 68, 68, 0.2)' }}
        >
          {sidebarCollapsed ? '🚪' : '🚪 Logout'}
        </button>
        {!sidebarCollapsed && (
          <div style={{ fontSize: 10, opacity: 0.3, marginTop: 12, textAlign: 'center' }}>
            TRACE ERP v1.5.2
          </div>
        )}
      </div>
    </aside>
  )
}
