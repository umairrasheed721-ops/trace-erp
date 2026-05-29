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
    <div className="wa-portal-left">
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
      <div className="wa-portal-status-bar">
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
        <span style={{ flex: 1 }}>
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
            color: 'var(--text-muted)',
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
            color: 'var(--text-color)',
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
      <div className="wa-portal-search">
        <input 
          type="text" 
          placeholder="Search or start new chat..." 
          className="wa-portal-search-input"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
        />
      </div>

      {/* Horizontally Scrolling Pill Menu */}
      <div 
        className="wa-portal-filter-pills"
        style={{
          display: 'flex',
          gap: '8px',
          overflowX: 'auto',
          padding: '10px 15px 15px 15px',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none'
        }}
      >
        <style>{`.wa-portal-filter-pills::-webkit-scrollbar { display: none; }`}</style>
        {[
          { key: 'all', label: 'All' },
          { key: 'unread', label: '🔵 Unread' },
          { key: 'urgent', label: '🔴 Urgent' },
          { key: 'orders', label: '📦 Orders' }
        ].map(p => {
          const isActive = activeFilter === p.key
          return (
            <button
              key={p.key}
              onClick={() => setActiveFilter(p.key)}
              style={{
                padding: '6px 16px',
                borderRadius: '20px',
                border: 'none',
                backgroundColor: isActive ? 'var(--brand, #10B981)' : '#f3f4f6',
                color: isActive ? '#fff' : '#4b5563',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s ease',
                boxShadow: isActive ? '0 2px 8px rgba(16, 185, 129, 0.4)' : 'none'
              }}
            >
              {p.label}
            </button>
          )
        })}
      </div>

      {/* Threads List — Module 7: Shimmer Skeletons */}
      <div className="wa-portal-threads-list">
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
                  borderBottom: '1px solid #f3f4f6' 
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
          <div className="text-center p-8 text-muted italic">No chats found.</div>
        ) : (
          filteredChats.map(c => {
            const isActive = activeChat && activeChat.phone === c.phone
            const isContactTyping = typingStatus[c.phone]
            
            return (
              <div 
                key={c.phone} 
                className={`wa-portal-thread-item ${isActive ? 'active' : ''}`}
                onClick={() => handleChatSelect(c)}
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
                    <span className="wa-portal-thread-name">
                      {c.customerName || `+${c.phone}`}
                    </span>
                    <span className="wa-portal-thread-time">
                      {c.lastMessage ? formatRelativeTime(c.lastMessage.created_at) : ''}
                    </span>
                  </div>
                  <div className="wa-portal-thread-preview">
                    <span className="wa-portal-thread-preview-text">
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
