import React from 'react'

const STUCK_STATUSES = [
  'Consignee Not Available', 'Attempted Delivery', 'Hold',
  'Address Issue', 'RTO Initiated', 'Return to Sender'
]

const getStatusColor = (status) => {
  if (status === 'CONNECTED') return '#25d366'
  if (status === 'CONNECTING') return '#f59e0b'
  if (status === 'SLEEPING') return '#8b5cf6'
  return '#ef4444'
}

const getStatusLabel = (status) => {
  if (!status) return ''
  return status.charAt(0) + status.slice(1).toLowerCase()
}

const formatRelativeTime = (isoString) => {
  if (!isoString) return ''
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now - date
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'short' })
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export default function ChatSidebar({
  chats = [], activeChat, handleChatSelect, wsStatus, activeNumber,
  searchText, setSearchText, activeFilter, setActiveFilter,
  loadingChats, typingStatus = {}, setShowCmdPalette, setShowSettings
}) {
  const filteredChats = chats.filter(c => {
    const searchLower = searchText.toLowerCase()
    const matchPhone = c.phone.toLowerCase().includes(searchLower)
    const matchName = c.customerName && c.customerName.toLowerCase().includes(searchLower)
    if (!matchPhone && !matchName) return false
    if (activeFilter === 'unread') return c.unreadCount > 0
    if (activeFilter === 'urgent') return c.riskFlag === 'HIGH' || c.riskFlag === 'BLOCKED' || (c.lastMessage && (c.lastMessage.intent === 'Urgent' || c.lastMessage.intent_tag === 'Urgent'))
    if (activeFilter === 'orders') return !!c.order
    return true
  })

  const statusColor = getStatusColor(wsStatus)

  return (
    <div className="wa-portal-left" style={{
      backgroundColor: 'rgba(255,255,255,0.02)',
      borderRight: '1px solid rgba(255,255,255,0.07)'
    }}>
      <style>{`
        @keyframes shimmer {
          0% { background-position: -450px 0; }
          100% { background-position: 450px 0; }
        }
        .shimmer-placeholder {
          background: linear-gradient(to right, rgba(255,255,255,0.04) 8%, rgba(255,255,255,0.08) 18%, rgba(255,255,255,0.04) 33%);
          background-size: 900px 104px;
          animation: shimmer 1.5s infinite linear;
        }
        @keyframes pulse-ring {
          0% { transform: scale(0.95); opacity: 1; }
          100% { transform: scale(1.7); opacity: 0; }
        }
        .wa-chat-thread:hover { background: rgba(255,255,255,0.04) !important; }
        .wa-chat-thread.active-thread { background: rgba(37,211,102,0.07) !important; border-left: 2px solid #25d366 !important; }
        .wa-filter-pill {
          padding: 5px 13px;
          border-radius: 20px;
          font-size: 0.72rem;
          font-weight: 600;
          cursor: pointer;
          border: 1px solid rgba(255,255,255,0.1);
          background: transparent;
          color: rgba(255,255,255,0.4);
          transition: all 0.18s ease;
          white-space: nowrap;
          letter-spacing: 0.02em;
        }
        .wa-filter-pill:hover { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.7); border-color: rgba(255,255,255,0.2); }
        .wa-filter-pill.active-pill { background: rgba(37,211,102,0.12); border-color: rgba(37,211,102,0.35); color: #25d366; }
        .wa-search-input {
          width: 100%;
          padding: 9px 14px 9px 36px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          color: rgba(255,255,255,0.85);
          font-size: 0.84rem;
          outline: none;
          transition: all 0.2s ease;
        }
        .wa-search-input::placeholder { color: rgba(255,255,255,0.25); }
        .wa-search-input:focus { background: rgba(255,255,255,0.08); border-color: rgba(37,211,102,0.3); }
      `}</style>

      {/* ── STATUS BAR ── */}
      <div style={{
        padding: '12px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'rgba(255,255,255,0.02)'
      }}>
        {/* Pulse dot */}
        <div style={{ position: 'relative', width: 10, height: 10, flexShrink: 0 }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: statusColor,
            position: 'absolute',
            zIndex: 1,
            boxShadow: `0 0 0 0 ${statusColor}`
          }} />
          {wsStatus === 'CONNECTED' && (
            <div style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              background: statusColor,
              opacity: 0.4,
              animation: 'pulse-ring 2s cubic-bezier(0.455, 0.03, 0.515, 0.955) infinite'
            }} />
          )}
        </div>

        <span style={{ flex: 1, fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>
          WA: <span style={{ color: statusColor, fontWeight: 700 }}>{getStatusLabel(wsStatus)}</span>
        </span>

        {activeNumber && wsStatus === 'CONNECTED' && (
          <span style={{
            fontSize: '0.66rem', fontWeight: 700,
            color: '#25d366',
            background: 'rgba(37,211,102,0.1)',
            border: '1px solid rgba(37,211,102,0.25)',
            borderRadius: 10,
            padding: '2px 8px',
            letterSpacing: '0.02em',
            flexShrink: 0,
          }}>
            📱 {activeNumber}
          </span>
        )}

        {/* Cmd+K button */}
        <button
          onClick={() => setShowCmdPalette(true)}
          title="Open Command Palette (⌘K)"
          style={{
            background: 'rgba(168,85,247,0.08)',
            border: '1px solid rgba(168,85,247,0.2)',
            borderRadius: 7,
            color: 'rgba(168,85,247,0.7)',
            fontSize: '0.65rem',
            padding: '3px 7px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            display: 'flex', alignItems: 'center', gap: 3,
            flexShrink: 0,
            fontWeight: 700,
            letterSpacing: '0.04em',
          }}
        >
          ⌘K
        </button>

        {/* Settings */}
        <button
          onClick={() => setShowSettings(true)}
          title="Settings"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 7,
            color: 'rgba(255,255,255,0.5)',
            fontSize: '0.82rem',
            padding: '4px 8px',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'rgba(255,255,255,0.9)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}
        >
          ⚙️
        </button>
      </div>

      {/* ── SEARCH ── */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ position: 'relative' }}>
          <span style={{
            position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
            fontSize: '0.9rem', opacity: 0.3, pointerEvents: 'none'
          }}>🔍</span>
          <input
            type="text"
            placeholder="Search conversations..."
            className="wa-search-input"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
          />
        </div>
      </div>

      {/* ── FILTER PILLS ── */}
      <div style={{
        display: 'flex', gap: 6, padding: '10px 14px',
        overflowX: 'auto', scrollbarWidth: 'none',
        borderBottom: '1px solid rgba(255,255,255,0.06)'
      }}>
        <style>{`.wa-filter-pills-bar::-webkit-scrollbar { display: none; }`}</style>
        {[
          { key: 'all', label: '💬 All' },
          { key: 'unread', label: '🔵 Unread' },
          { key: 'urgent', label: '🚨 Urgent' },
          { key: 'orders', label: '📦 Orders' },
        ].map(p => (
          <button
            key={p.key}
            onClick={() => setActiveFilter(p.key)}
            className={`wa-filter-pill ${activeFilter === p.key ? 'active-pill' : ''}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* ── THREADS LIST ── */}
      <div className="wa-portal-threads-list" style={{ backgroundColor: 'transparent' }}>
        {loadingChats ? (
          <div style={{ padding: '0 14px' }}>
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="shimmer-placeholder" style={{ width: 42, height: 42, borderRadius: '50%', flexShrink: 0 }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="shimmer-placeholder" style={{ height: 13, width: `${60 + (i % 3) * 10}%`, borderRadius: 4 }} />
                  <div className="shimmer-placeholder" style={{ height: 10, width: `${40 + (i % 4) * 8}%`, borderRadius: 3 }} />
                </div>
              </div>
            ))}
          </div>
        ) : filteredChats.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: '0.85rem' }}>
            <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.5 }}>🔍</div>
            No conversations found
          </div>
        ) : (
          filteredChats.map(c => {
            const isActive = activeChat && activeChat.phone === c.phone
            const isTyping = typingStatus[c.phone]
            const initials = c.customerName ? c.customerName.substring(0, 2).toUpperCase() : 'WA'

            return (
              <div
                key={c.phone}
                className={`wa-chat-thread ${isActive ? 'active-thread' : ''}`}
                onClick={() => handleChatSelect(c)}
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: '11px 14px',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                  borderLeft: isActive ? undefined : '2px solid transparent',
                }}
              >
                {/* Avatar */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: '50%',
                    background: isActive
                      ? 'linear-gradient(135deg, #25d366 0%, #128c7e 100%)'
                      : 'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.06) 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: '0.9rem', color: isActive ? '#fff' : 'rgba(255,255,255,0.6)',
                    overflow: 'hidden',
                    border: isActive ? '2px solid rgba(37,211,102,0.4)' : '1px solid rgba(255,255,255,0.08)',
                    transition: 'all 0.2s ease'
                  }}>
                    {c.dpUrl
                      ? <img src={c.dpUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} onError={e => { e.target.style.display = 'none'; }} />
                      : initials
                    }
                  </div>
                  {c.unreadCount > 0 && (
                    <div style={{
                      position: 'absolute', bottom: -1, right: -1,
                      width: 8, height: 8, borderRadius: '50%',
                      background: '#25d366',
                      border: '2px solid var(--bg-base)',
                    }} />
                  )}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                    <span style={{
                      fontWeight: c.unreadCount > 0 ? 700 : 500,
                      fontSize: '0.87rem',
                      color: isActive ? '#e9edef' : 'rgba(255,255,255,0.75)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      maxWidth: 140
                    }}>
                      {c.customerName || `+${c.phone}`}
                    </span>
                    <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.25)', flexShrink: 0, marginLeft: 6 }}>
                      {c.lastMessage ? formatRelativeTime(c.lastMessage.created_at) : ''}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                    <span style={{
                      fontSize: '0.76rem',
                      color: isTyping ? '#25d366' : 'rgba(255,255,255,0.3)',
                      fontWeight: isTyping ? 600 : 400,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1
                    }}>
                      {isTyping ? '✦ typing...' : (c.lastMessage?.message || 'No messages yet')}
                    </span>

                    {/* Unread badge */}
                    {c.unreadCount > 0 && (
                      <span style={{
                        background: '#25d366', color: '#fff',
                        fontSize: '0.62rem', fontWeight: 800,
                        padding: '1px 5px', borderRadius: 10,
                        minWidth: 18, textAlign: 'center', flexShrink: 0
                      }}>
                        {c.unreadCount}
                      </span>
                    )}

                    {/* COD badge */}
                    {c.order && (
                      <span style={{
                        fontSize: '0.6rem', fontWeight: 700,
                        padding: '1px 5px', borderRadius: 6, flexShrink: 0,
                        background: c.order.wa_verification_status === 'verified' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.12)',
                        color: c.order.wa_verification_status === 'verified' ? '#10b981' : '#f59e0b',
                        border: `1px solid ${c.order.wa_verification_status === 'verified' ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.2)'}`,
                      }}>
                        {c.order.wa_verification_status === 'verified' ? '✓ COD' : '⏳ COD'}
                      </span>
                    )}

                    {/* Risk flag */}
                    {(c.riskFlag === 'HIGH' || c.riskFlag === 'BLOCKED') && (
                      <span style={{ fontSize: '0.65rem', color: '#ef4444', flexShrink: 0 }}>🚩</span>
                    )}

                    {/* Ad source */}
                    {c.adPlatform && (
                      <span style={{
                        fontSize: '0.58rem', fontWeight: 700, flexShrink: 0,
                        background: c.adPlatform === 'meta' ? 'rgba(59,130,246,0.12)' : 'rgba(236,72,153,0.12)',
                        color: c.adPlatform === 'meta' ? '#60a5fa' : '#f472b6',
                        border: `1px solid ${c.adPlatform === 'meta' ? 'rgba(59,130,246,0.25)' : 'rgba(236,72,153,0.25)'}`,
                        borderRadius: 6, padding: '1px 4px',
                      }}>
                        {c.adPlatform === 'meta' ? 'Meta' : c.adPlatform === 'tiktok' ? 'TikTok' : c.adPlatform}
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
