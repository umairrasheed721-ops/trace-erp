import React from 'react'

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

export default function ChatListPanel({
  loadingChats,
  filteredChats,
  activeChat,
  handleChatSelect,
  typingStatus = {}
}) {
  return (
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
                borderBottom: '1px solid var(--wa-border)',
                cursor: 'pointer'
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
  )
}
