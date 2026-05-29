import React from 'react'

const STUCK_STATUSES = [
  'Consignee Not Available',
  'Attempted Delivery',
  'Hold',
  'Address Issue',
  'RTO Initiated',
  'Return to Sender'
]

const getStatusColor = (status) => {
  if (status === 'CONNECTED') return 'var(--green)'
  if (status === 'CONNECTING') return 'var(--yellow)'
  if (status === 'SLEEPING') return '#8b5cf6'
  return 'var(--red)'
}

const formatRelativeTime = (isoString) => {
  if (!isoString) return ''
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now - date
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } else if (diffDays === 1) {
    return 'Yesterday'
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' })
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }
}

export default function ChatSidebar({
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

      {/* Threads List — Module 7: Shimmer Skeletons */}
      <div className="wa-portal-threads-list" style={{ backgroundColor: 'var(--wa-panel-bg)' }}>
        {loadingChats ? (
          <div style={{ padding: '0 15px' }}>
            {[...Array(6)].map((_, i) => (
              <div 
                key={i} 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '12px', 
                  padding: '12px 0', 
                  borderBottom: '1px solid var(--wa-border)' 
                }}
              >
                <div 
                  className="shimmer-placeholder" 
                  style={{ 
                    width: '40px', 
                    height: '40px', 
                    borderRadius: '50%', 
                    flexShrink: 0 
                  }} 
                />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div 
                    className="shimmer-placeholder" 
                    style={{ 
                      height: '14px', 
                      width: `${60 + (i % 3) * 10}%`, 
                      borderRadius: '4px' 
                    }} 
                  />
                  <div 
                    className="shimmer-placeholder" 
                    style={{ 
                      height: '10px', 
                      width: `${40 + (i % 4) * 8}%`, 
                      borderRadius: '3px' 
                    }} 
                  />
                </div>
              </div>
            ))}
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="text-center p-8 text-muted italic" style={{ color: 'var(--wa-text-muted)' }}>No chats found.</div>
        ) : (
          filteredChats.map(c => {
            const isActive = activeChat && activeChat.phone === c.phone
            const isContactTyping = typingStatus[c.phone]
            
            return (
              <div 
                key={c.phone} 
                className={`wa-portal-thread-item ${isActive ? 'active' : ''}`}
                onClick={() => handleChatSelect(c)}
                style={{
                  margin: '4px 8px',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  backgroundColor: isActive ? 'var(--wa-header-bg)' : 'transparent',
                  boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
                  transition: 'all 0.2s ease',
                  borderBottom: '1px solid var(--wa-border)'
                }}
              >
                <div className="wa-portal-avatar" style={{ overflow: 'hidden', padding: c.dpUrl ? 0 : undefined }}>
                  {c.dpUrl
                    ? <img src={c.dpUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} onError={e => { e.target.style.display = 'none'; }}
                      />
                    : (c.customerName ? c.customerName.substring(0, 2).toUpperCase() : 'WA')
                  }
                </div>
                <div className="wa-portal-thread-info">
                  <div className="wa-portal-thread-header">
                    <span className="wa-portal-thread-name" style={{ color: 'var(--wa-text-primary)', fontWeight: 500 }}>
                      {c.customerName || `+${c.phone}`}
                    </span>
                    <span className="wa-portal-thread-time" style={{ color: 'var(--wa-text-muted)' }}>
                      {c.lastMessage ? formatRelativeTime(c.lastMessage.created_at) : ''}
                    </span>
                  </div>
                  <div className="wa-portal-thread-preview">
                    <span className="wa-portal-thread-preview-text" style={{ color: 'var(--wa-text-muted)' }}>
                      {isContactTyping ? (
                        <span style={{ color: 'var(--green)', fontWeight: 'bold' }}>typing...</span>
                      ) : c.lastMessage ? (
                        c.lastMessage.message
                      ) : (
                        'No messages yet'
                      )}
                    </span>
                    
                    {/* Shopify Mini Badges */}
                    {c.order && (
                      <span 
                        className="wa-badge-shopify-status"
                        style={{
                          backgroundColor: c.order.wa_verification_status === 'verified' ? 'var(--green-dim)' : 'var(--border-bright)',
                          color: c.order.wa_verification_status === 'verified' ? 'var(--green)' : 'var(--text-secondary)'
                        }}
                      >
                        {c.order.wa_verification_status === 'verified' ? 'COD OK' : 'COD Pending'}
                      </span>
                    )}

                    {/* Unread badge count */}
                    {c.unreadCount > 0 && (
                      <span className="wa-portal-unread-badge">{c.unreadCount}</span>
                    )}
                    {/* Risk flag badge */}
                    {(c.riskFlag === 'HIGH' || c.riskFlag === 'BLOCKED') && (
                      <span style={{
                        fontSize: '0.65rem',
                        background: 'rgba(239, 68, 68, 0.15)',
                        color: 'var(--red, #ef4444)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '8px',
                        padding: '1px 5px',
                        fontWeight: 700,
                        marginLeft: 2,
                        flexShrink: 0,
                      }}>🚩</span>
                    )}
                    {/* Ad source badge */}
                    {c.adPlatform && (
                      <span style={{
                        fontSize: '0.6rem',
                        background: c.adPlatform === 'meta' ? 'rgba(59, 130, 246, 0.12)' : 'rgba(236, 72, 153, 0.12)',
                        color: c.adPlatform === 'meta' ? '#3b82f6' : '#ec4899',
                        border: `1px solid ${c.adPlatform === 'meta' ? 'rgba(59,130,246,0.3)' : 'rgba(236,72,153,0.3)'}`,
                        borderRadius: '8px',
                        padding: '1px 5px',
                        fontWeight: 600,
                        marginLeft: 2,
                        flexShrink: 0,
                      }}>
                        {c.adPlatform === 'meta' ? '🎯 Meta' : c.adPlatform === 'tiktok' ? '🎵 TikTok' : `📢 ${c.adPlatform}`}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
