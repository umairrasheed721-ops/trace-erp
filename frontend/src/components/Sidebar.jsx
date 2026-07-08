import React, { useState, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import { useApp } from '../context/AppContext'

export default function Sidebar() {
  const { stores, activeStoreId, setActiveStoreId, badgeCounts, sidebarCollapsed, toggleSidebar, user, logout, permissions } = useApp()
  const [isHovered, setIsHovered] = useState(false)
  const hoverTimeout = useRef(null)

  const handleMouseEnter = () => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current)
    hoverTimeout.current = setTimeout(() => {
      setIsHovered(true)
    }, 150) // 150ms hover-intent delay
  }

  const handleMouseLeave = () => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current)
    setIsHovered(false)
  }

  const isExpanded = !sidebarCollapsed || isHovered

  const navItems = [
    { to: '/', icon: '🏠', label: 'Dashboard' },
    { to: '/search', icon: '🔍', label: 'Command Center' },
    { to: '/returns', icon: '↩️', label: 'Unified Returns' },
    { to: '/whatsapp-portal', icon: '💬', label: 'WA Live Chat' },
    { to: '/whatsapp-bot', icon: '🤖', label: 'WhatsApp Bot', permission: 'admin_only' },
    { to: '/whatsapp-templates', icon: '✍️', label: 'WA Templates', permission: 'admin_only' },
    { to: '/finance', icon: '💰', label: 'Finance Engine', permission: 'admin_only' },
    { to: '/payout-reconciler', icon: '💸', label: 'Payout Reconciler', permission: 'admin_only' },
    { to: '/costing', icon: '🛡️', label: 'Costing & Watchdog', permission: 'admin_only' },
    { to: '/reports', icon: '📊', label: 'Profit & Loss', permission: 'admin_only' },
    { to: '/marketing', icon: '🧠', label: 'Marketing Intel', permission: 'admin_only' },
    { to: '/reviews', icon: '⭐', label: 'Reviews Manager', permission: 'admin_only' },
    { to: '/intelligence', icon: '🚚', label: 'Courier Intelligence', permission: 'admin_only' },
    { to: '/stuck', icon: '⏳', label: 'Stuck Monitor', badge: badgeCounts.stuck },
    { to: '/advice', icon: '🧠', label: 'Advice Monitor', badge: badgeCounts.advice },
    { to: '/watchdog', icon: '🐕', label: 'Watchdog', badge: badgeCounts.watchdog },
    { to: '/connect', icon: '🔌', label: 'Connect Store', permission: 'admin_only' },
    { to: '/users', icon: '👥', label: 'User Management', permission: 'admin_only' },
    { to: '/diagnostics', icon: '🛠️', label: 'Diagnostic Center', permission: 'admin_only' },
    { to: '/system-status', icon: '🛡️', label: 'System Status', permission: 'admin_only' },
    { to: '/status-mappings', icon: '🔀', label: 'Status Mappings', permission: 'admin_only' },
    { to: '/profile', icon: '👤', label: 'My Profile' },
  ].filter(item => {
    if (user?.role === 'admin') return true
    // Check if this specific path is granted to this role in our Dynamic Matrix
    if (!Array.isArray(permissions)) return false
    return permissions.some(p => p.role_name === user?.role && p.page_id === item.to)
  })

  return (
    <aside 
      className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${isHovered && sidebarCollapsed ? 'hover-expanded' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="sidebar-logo">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ overflow: 'hidden', display: isExpanded ? 'block' : 'none' }}>
            <h1>TRACE ERP</h1>
            <span>Multi-Store Dashboard</span>
          </div>
          <button 
            onClick={toggleSidebar} 
            className="sidebar-toggle"
            title={sidebarCollapsed ? 'Pin Sidebar' : 'Unpin Sidebar'}
          >
            {sidebarCollapsed ? '➡️' : '⬅️'}
          </button>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-label" style={{ display: isExpanded ? 'block' : 'none' }}>Navigation</div>
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            title={!isExpanded ? item.label : ''}
          >
            <span className="nav-icon">{item.icon}</span>
            <span style={{ display: isExpanded ? 'inline' : 'none' }}>{item.label}</span>
            <span className="nav-badge" style={{ display: (item.badge > 0 && isExpanded) ? 'inline' : 'none' }}>{item.badge}</span>
          </NavLink>
        ))}
      </nav>

      <div className="store-switcher">
        <span className="store-select-label" style={{ display: isExpanded ? 'inline' : 'none' }}>Active Store</span>
        <NavLink 
          to="/connect" 
          className="btn btn-primary" 
          style={{ 
            width: '100%', justifyContent: 'center', marginTop: 4,
            display: stores.length === 0 ? 'flex' : 'none'
          }}
        >
          + {isExpanded ? 'Connect Store' : ''}
        </NavLink>
        <select
          className="store-select"
          value={activeStoreId || ''}
          onChange={e => setActiveStoreId(parseInt(e.target.value))}
          style={{
            ...((!isExpanded ? { padding: '4px 2px', textAlign: 'center' } : {})),
            display: stores.length > 0 ? 'block' : 'none'
          }}
        >
          {stores.map(s => (
            <option key={s.id} value={s.id}>
              {isExpanded ? (s.store_name || s.shop_domain) : (s.store_name || s.shop_domain).substring(0,2).toUpperCase()}
            </option>
          ))}
        </select>
        <button 
          onClick={logout}
          className="btn btn-secondary btn-sm" 
          style={{ width: '100%', justifyContent: 'center', marginTop: 10, background: 'rgba(239, 68, 68, 0.1)', color: 'var(--red)', border: '1px solid rgba(239, 68, 68, 0.2)' }}
        >
          {isExpanded ? '🚪 Logout' : '🚪'}
        </button>
        <div style={{ fontSize: 10, opacity: 0.3, marginTop: 12, textAlign: 'center', display: isExpanded ? 'block' : 'none' }}>
          TRACE ERP v1.6.0
        </div>
      </div>
    </aside>
  )
}

