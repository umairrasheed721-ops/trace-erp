import React from 'react'
import ChatListPanel from './ChatListPanel'

const getStatusColor = (status) => {
  if (status === 'CONNECTED') return 'var(--green)'
  if (status === 'CONNECTING') return 'var(--yellow)'
  if (status === 'SLEEPING') return '#8b5cf6'
  return 'var(--red)'
}

export default function ChatContactSidebar({
  chats = [],
  activeChat,
  handleChatSelect,
  wsStatus,
  activeNumber,
  searchText,
  setSearchText,
  activeFilter,
  setActiveFilter,
  loadingChats,
  typingStatus = {},
  setShowCmdPalette,
  setShowSettings
}) {
  // Filter conversations
  const filteredChats = chats.filter(c => {
    const searchLower = searchText.toLowerCase()
    const matchPhone = c.phone.toLowerCase().includes(searchLower)
    const matchName = c.customerName && c.customerName.toLowerCase().includes(searchLower)
    const matchSearch = matchPhone || matchName
    if (!matchSearch) return false
    if (activeFilter === 'unread') return c.unreadCount > 0
    if (activeFilter === 'urgent') return c.riskFlag === 'HIGH' || c.riskFlag === 'BLOCKED' || (c.lastMessage && (c.lastMessage.intent === 'Urgent' || c.lastMessage.intent_tag === 'Urgent'))
    if (activeFilter === 'orders') return !!c.order
    return true
  })

  return (
    <div className="wa-portal-left" style={{ backgroundColor: 'var(--wa-panel-bg)', borderRight: '1px solid var(--wa-border)' }}>
      <style>{`
        @keyframes shimmer {
          0% {
            background-position: -450px 0;
          }
          100% {
            background-position: 450px 0;
          }
        }
        .shimmer-placeholder {
          background: linear-gradient(to right, #eceff1 8%, #f5f7f8 18%, #eceff1 33%);
          background-size: 900px 104px;
          animation: shimmer 1.5s infinite linear;
        }
      `}</style>

      {/* Connection Status Indicator — Module 7: Pulse Dot */}
      <div className="wa-portal-status-bar" style={{ borderBottom: '1px solid var(--wa-border)' }}>
        <div className="wa-pulse-dot" style={{ width: 16, height: 16 }}>
          <div
            className="wa-pulse-dot-inner"
            style={{
              backgroundColor: getStatusColor(wsStatus),
              boxShadow: `0 0 8px ${getStatusColor(wsStatus)}`,
            }}
          />
          <style>{`.wa-pulse-dot::before { background: ${getStatusColor(wsStatus)} !important; animation: ${wsStatus === 'CONNECTED' ? 'pulse-ring 2s cubic-bezier(0.455, 0.03, 0.515, 0.955) infinite' : 'none'} }`}</style>
        </div>
        <span style={{ flex: 1, color: 'var(--wa-text-primary)' }}>
          WhatsApp: <strong style={{ color: getStatusColor(wsStatus) }}>{wsStatus ? wsStatus.toLowerCase() : ''}</strong>
        </span>
        {activeNumber && wsStatus === 'CONNECTED' && (
          <span style={{
            fontSize: '0.72rem',
            fontWeight: 600,
            color: 'var(--green)',
            background: 'rgba(34, 197, 94, 0.1)',
            border: '1px solid rgba(34, 197, 94, 0.25)',
            borderRadius: '10px',
            padding: '2px 8px',
            letterSpacing: '0.02em',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }} title="Active WhatsApp account number">
            📱 {activeNumber}
          </span>
        )}
        {/* Cmd+K hint */}
        <button
          onClick={() => setShowCmdPalette(true)}
          title="Open Command Palette (⌘K)"
          style={{
            background: 'rgba(168,85,247,0.08)',
            border: '1px solid rgba(168,85,247,0.2)',
            borderRadius: '8px',
            color: 'var(--wa-text-muted)',
            fontSize: '0.65rem',
            padding: '3px 8px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            flexShrink: 0,
          }}
        >
          <span>⌘</span><span>K</span>
        </button>
        {/* Settings Trigger */}
        <button
          onClick={() => setShowSettings(true)}
          title="System Settings"
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '8px',
            color: 'var(--wa-text-primary)',
            fontSize: '0.85rem',
            padding: '3px 8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
          }}
        >
          ⚙️
        </button>
      </div>

      {/* Search Contacts */}
      <div className="wa-portal-search" style={{ borderBottom: '1px solid var(--wa-border)' }}>
        <input 
          type="text" 
          placeholder="Search or start new chat..." 
          className="wa-portal-search-input"
          style={{ backgroundColor: 'var(--wa-header-bg)', border: '1px solid var(--wa-border)', color: 'var(--wa-text-primary)' }}
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
        />
      </div>

      {/* Horizontally Scrolling Pill Menu */}
      <div 
        className="wa-portal-filter-pills"
        style={{
          display: 'flex',
          gap: '6px',
          overflowX: 'auto',
          padding: '12px 16px',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          borderBottom: '1px solid var(--wa-border)'
        }}
      >
        <style>{`.wa-portal-filter-pills::-webkit-scrollbar { display: none; }`}</style>
        {[
          { key: 'all', label: 'All' },
          { key: 'unread', label: 'Unread' },
          { key: 'urgent', label: 'Urgent' },
          { key: 'orders', label: 'Orders' }
        ].map(p => {
          const isActive = activeFilter === p.key
          return (
            <button
              key={p.key}
              onClick={() => setActiveFilter(p.key)}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: isActive ? '1px solid var(--brand, #a855f7)' : '1px solid var(--wa-border)',
                backgroundColor: isActive ? 'var(--brand-glow, rgba(168, 85, 247, 0.12))' : 'transparent',
                color: isActive ? 'var(--brand, #a855f7)' : 'var(--wa-text-muted)',
                fontSize: '0.78rem',
                fontWeight: 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s ease',
                boxShadow: isActive ? '0 1px 4px rgba(168, 85, 247, 0.05)' : 'none'
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = 'var(--wa-header-bg)';
                  e.currentTarget.style.color = 'var(--wa-text-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'var(--wa-text-muted)';
                }
              }}
            >
              {p.label}
            </button>
          )
        })}
      </div>

      {/* Threads List component */}
      <ChatListPanel
        loadingChats={loadingChats}
        filteredChats={filteredChats}
        activeChat={activeChat}
        handleChatSelect={handleChatSelect}
        typingStatus={typingStatus}
      />
    </div>
  )
}
