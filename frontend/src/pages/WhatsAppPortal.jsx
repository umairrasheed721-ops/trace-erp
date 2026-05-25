import React, { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'

export default function WhatsAppPortal() {
  const { addToast } = useApp()
  
  // --- UI STATES ---
  const [chats, setChats] = useState([])
  const [loadingChats, setLoadingChats] = useState(true)
  const [activeChat, setActiveChat] = useState(null)
  const [messages, setMessages] = useState([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [inputText, setInputText] = useState('')
  const [uploading, setUploading] = useState(false)
  
  // --- SUBDATA STATES ---
  const [customerInfo, setCustomerInfo] = useState({
    latestOrder: null,
    orderHistory: [],
    geminiMemory: null
  })
  const [quickReplies, setQuickReplies] = useState([])
  const [quickPills, setQuickPills] = useState([])
  const [showQuickReplies, setShowQuickReplies] = useState(false)
  
  // --- REAL-TIME & STATUS STATES ---
  const [wsStatus, setWsStatus] = useState('CONNECTING') // CONNECTING, CONNECTED, DISCONNECTED
  const [typingStatus, setTypingStatus] = useState({}) // { phone: boolean }
  const [zoomedImage, setZoomedImage] = useState(null)
  const [activeNumber, setActiveNumber] = useState(null) // Bot's own WA number from Baileys
  const [activeFilter, setActiveFilter] = useState('all') // 'all' | 'unread' | 'high_risk' | 'stuck'
  const [slashCmd, setSlashCmd] = useState('')
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  
  // --- CONSTANTS ---
  const STUCK_STATUSES = ['Consignee Not Available', 'Attempted Delivery', 'Hold', 'Address Issue', 'RTO Initiated', 'Return to Sender']

  const SLASH_COMMANDS = [
    { cmd: '/invoice', label: '📄 Send Invoice', desc: 'Generate & send PDF invoice', action: () => { handleSendInvoice(); setShowSlashMenu(false); setInputText(''); } },
    { cmd: '/track', label: '📦 Send Tracking', desc: 'Send order tracking info', action: () => {
      if (activeChat) {
        const msg = `📦 Your order tracking is being retrieved...`
        setInputText(msg)
        setShowSlashMenu(false)
      }
    }},
    { cmd: '/size', label: '📏 Customer Size', desc: 'Insert stored size preference', action: () => {
      if (activeChat?.sizePreference) {
        setInputText(`Your size preference: ${activeChat.sizePreference}`)
      }
      setShowSlashMenu(false)
    }},
    { cmd: '/quick', label: '⚡ Quick Replies', desc: 'Open quick reply templates', action: () => { setShowQuickReplies(true); setShowSlashMenu(false); setInputText(''); } },
    { cmd: '/risk', label: '🚩 Risk Flag', desc: 'View/set customer risk profile', action: () => { setShowSlashMenu(false); setInputText(''); } },
  ]

  // --- REFS ---
  const timelineEndRef = useRef(null)
  const wsRef = useRef(null)
  const typingTimersRef = useRef({})
  
  // --- FETCH CHATS ---
  const fetchChats = async (silent = false) => {
    if (!silent) setLoadingChats(true)
    try {
      const res = await fetch('/api/whatsapp-governance/chats')
      const data = await res.json()
      if (data.success) {
        // Initialize unread count in state to track dynamic live incoming messages
        const mapped = data.chats.map(c => ({ ...c, unreadCount: 0 }))
        setChats(mapped)
      } else {
        addToast(data.error || 'Failed to fetch chats', 'error')
      }
    } catch (err) {
      console.error(err)
      addToast('Network error loading conversations', 'error')
    } finally {
      if (!silent) setLoadingChats(false)
    }
  }

  // --- FETCH CHAT HISTORY ---
  const selectChat = async (chat) => {
    setActiveChat(chat)
    setLoadingMessages(true)
    
    // Clear unread badge in state
    setChats(prev => prev.map(c => c.phone === chat.phone ? { ...c, unreadCount: 0 } : c))
    
    try {
      const res = await fetch(`/api/whatsapp-governance/chats/${chat.phone}`)
      const data = await res.json()
      if (data.success) {
        setMessages(data.messages || [])
        setCustomerInfo({
          latestOrder: data.latestOrder,
          orderHistory: data.orderHistory || [],
          geminiMemory: data.geminiMemory
        })
      } else {
        addToast(data.error || 'Failed to fetch chat details', 'error')
      }
    } catch (err) {
      console.error(err)
      addToast('Network error loading chat history', 'error')
    } finally {
      setLoadingMessages(false)
      scrollToBottom()
    }
  }

  // --- FETCH QUICK ACCESS ITEMS ---
  const fetchQuickReplies = async () => {
    try {
      const res = await fetch('/api/whatsapp-governance/quick-replies')
      const data = await res.json()
      if (data.success) setQuickReplies(data.quickReplies || [])
    } catch (err) {}
  }

  const fetchQuickPills = async () => {
    try {
      const res = await fetch('/api/whatsapp-governance/quick-pills')
      const data = await res.json()
      if (data.success) setQuickPills(data.quickPills || [])
    } catch (err) {}
  }

  // --- FETCH BOT STATUS (active number) ---
  const fetchBotStatus = async () => {
    try {
      const res = await fetch('/api/whatsapp-governance/status')
      const data = await res.json()
      if (data.activeNumber) setActiveNumber(data.activeNumber)
      else if (data.status !== 'CONNECTED') setActiveNumber(null)
    } catch (_) {}
  }

  // --- WEBSOCKET CLIENT CONFIGURATION ---
  const connectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close()
    }

    const token = localStorage.getItem('trace_token')
    if (!token) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/?token=${token}`
    
    setWsStatus('CONNECTING')
    const socket = new WebSocket(wsUrl)
    wsRef.current = socket

    socket.onopen = () => {
      console.log('🔌 WhatsApp Portal connected to WS')
      setWsStatus('CONNECTED')
    }

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        const { event: wsEvent, data } = payload

        if (wsEvent === 'message' && data && data.message) {
          const newMsg = data.message
          
          // 1. Update chronological messages list if active chat matched
          setActiveChat(currentActive => {
            if (currentActive && String(currentActive.phone) === String(newMsg.phone)) {
              setMessages(prev => {
                // Prevent duplicate insertions
                if (prev.some(m => m.message_id === newMsg.message_id || (m.id === newMsg.id && m.id > 1000000000000))) {
                  return prev
                }
                return [...prev, newMsg]
              })
              scrollToBottom()
            }
            return currentActive
          })

          // 2. Update list preview or unread count
          setChats(prevChats => {
            let updated = prevChats.map(c => {
              if (String(c.phone) === String(newMsg.phone)) {
                const isCurrentlyActive = activeChat && String(activeChat.phone) === String(newMsg.phone)
                return {
                  ...c,
                  lastMessage: newMsg,
                  unreadCount: isCurrentlyActive ? 0 : (c.unreadCount || 0) + 1
                }
              }
              return c
            })

            // If chat phone isn't in current list, fetch full list to get its metadata
            const exists = updated.some(c => String(c.phone) === String(newMsg.phone))
            if (!exists) {
              fetchChats(true)
            } else {
              // Move matching conversation to top of list
              const index = updated.findIndex(c => String(c.phone) === String(newMsg.phone))
              if (index > 0) {
                const target = updated[index]
                updated.splice(index, 1)
                updated.unshift(target)
              }
            }

            return updated
          })
        }

        if (wsEvent === 'typing' && data) {
          const { phone, isTyping } = data
          setTypingStatus(prev => ({ ...prev, [phone]: isTyping }))
          
          // Auto clear typing status after 3.5 seconds
          if (isTyping) {
            if (typingTimersRef.current[phone]) {
              clearTimeout(typingTimersRef.current[phone])
            }
            typingTimersRef.current[phone] = setTimeout(() => {
              setTypingStatus(prev => ({ ...prev, [phone]: false }))
            }, 3500)
          }
        }

        if (wsEvent === 'transcript' && data) {
          // Update message transcript inline without refetching
          setMessages(prev => prev.map(m =>
            m.id === data.messageId ? { ...m, transcript: data.transcript } : m
          ))
        }

        if (wsEvent === 'ocr_result' && data) {
          // Show a toast notification for OCR results
          if (data.status === 'matched') {
            addToast(`✅ Payment verified! Rs.${data.detectedAmount} matched — ${data.detectedBank || 'Bank'} TXN ${data.detectedTxnId || 'N/A'}`, 'success')
          } else if (data.status === 'mismatch') {
            addToast(`⚠️ Payment amount mismatch — Rs.${data.detectedAmount} received. Manual review needed.`, 'warning')
          } else if (data.status === 'manual_review') {
            addToast(`🔍 Payment receipt detected. Please verify manually.`, 'info')
          }
        }
      } catch (err) {
        console.error('Error handling WebSocket message:', err)
      }
    }

    socket.onclose = () => {
      console.log('🔌 WebSocket disconnected. Retrying in 3 seconds...')
      setWsStatus('DISCONNECTED')
      setTimeout(connectWebSocket, 3000)
    }

    socket.onerror = (err) => {
      console.error('WebSocket Error:', err)
      setWsStatus('DISCONNECTED')
    }
  }

  // --- ACTIONS ---
  const handleSendMessage = async (textToSend = null) => {
    const finalMsg = textToSend !== null ? textToSend : inputText
    if (!finalMsg.trim() || !activeChat) return

    // Optimistic message object
    const tempId = Date.now()
    const optimisticMessage = {
      id: tempId,
      phone: activeChat.phone,
      direction: 'outgoing',
      message: finalMsg,
      status: 'sending',
      created_at: new Date().toISOString()
    }

    // Instantly append bubble
    setMessages(prev => [...prev, optimisticMessage])
    if (textToSend === null) setInputText('')
    scrollToBottom()

    try {
      const res = await fetch(`/api/whatsapp-governance/chats/${activeChat.phone}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: finalMsg })
      })
      const data = await res.json()
      
      if (data.success && data.message) {
        // Swap out optimistic message with true database returned object
        setMessages(prev => prev.map(m => m.id === tempId ? data.message : m))
        
        // Update conversation list preview
        setChats(prev => prev.map(c => c.phone === activeChat.phone ? { ...c, lastMessage: data.message } : c))
      } else {
        addToast(data.error || 'Failed to dispatch message', 'error')
        setMessages(prev => prev.filter(m => m.id !== tempId)) // Rollback
      }
    } catch (err) {
      console.error(err)
      addToast('Network error while sending message', 'error')
      setMessages(prev => prev.filter(m => m.id !== tempId)) // Rollback
    }
  }

  const handleSendQuickReply = async (reply) => {
    if (!activeChat) return
    setShowQuickReplies(false)
    
    // Add temporary loading indicator bubble
    const tempId = Date.now()
    const optimisticMessage = {
      id: tempId,
      phone: activeChat.phone,
      direction: 'outgoing',
      message: `[Template Reply: ${reply.title}]`,
      status: 'sending',
      created_at: new Date().toISOString()
    }
    
    setMessages(prev => [...prev, optimisticMessage])
    scrollToBottom()

    try {
      const res = await fetch(`/api/whatsapp-governance/chats/${activeChat.phone}/send-quick-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replyId: reply.id })
      })
      const data = await res.json()
      
      if (data.success && data.message) {
        setMessages(prev => prev.map(m => m.id === tempId ? data.message : m))
        setChats(prev => prev.map(c => c.phone === activeChat.phone ? { ...c, lastMessage: data.message } : c))
        addToast(`✅ Quick reply "${reply.title}" dispatched!`, 'success')
      } else {
        addToast(data.error || 'Failed to send quick reply', 'error')
        setMessages(prev => prev.filter(m => m.id !== tempId))
      }
    } catch (err) {
      console.error(err)
      addToast('Network error sending quick reply', 'error')
      setMessages(prev => prev.filter(m => m.id !== tempId))
    }
  }

  const handleSendInvoice = async () => {
    if (!activeChat || !customerInfo.latestOrder) {
      return addToast('No order history matched to generate invoice', 'warning')
    }

    if (!confirm(`Are you sure you want to generate & send invoice PDF for Order #${customerInfo.latestOrder.id}?`)) {
      return
    }

    const tempId = Date.now()
    setMessages(prev => [...prev, {
      id: tempId,
      phone: activeChat.phone,
      direction: 'outgoing',
      message: '📄 Generating and sending invoice PDF...',
      status: 'sending',
      created_at: new Date().toISOString()
    }])
    scrollToBottom()

    try {
      const res = await fetch(`/api/whatsapp-governance/chats/${activeChat.phone}/send-invoice`, {
        method: 'POST'
      })
      const data = await res.json()
      if (data.success && data.message) {
        setMessages(prev => prev.map(m => m.id === tempId ? data.message : m))
        setChats(prev => prev.map(c => c.phone === activeChat.phone ? { ...c, lastMessage: data.message } : c))
        addToast('✅ Invoice generated & dispatched via WhatsApp!', 'success')
      } else {
        addToast(data.error || 'Failed to generate invoice', 'error')
        setMessages(prev => prev.filter(m => m.id !== tempId))
      }
    } catch (err) {
      console.error(err)
      addToast('Network error sending invoice', 'error')
      setMessages(prev => prev.filter(m => m.id !== tempId))
    }
  }

  const handleMediaUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !activeChat) return

    const formData = new FormData()
    formData.append('media', file)
    
    setUploading(true)
    addToast(`Uploading ${file.name}...`, 'info')

    try {
      const res = await fetch(`/api/whatsapp-governance/chats/${activeChat.phone}/upload-media`, {
        method: 'POST',
        body: formData
      })
      const data = await res.json()
      
      if (data.success && data.message) {
        setMessages(prev => [...prev, data.message])
        setChats(prev => prev.map(c => c.phone === activeChat.phone ? { ...c, lastMessage: data.message } : c))
        addToast('✅ Media attachment successfully sent!', 'success')
        scrollToBottom()
      } else {
        addToast(data.error || 'Failed to send file', 'error')
      }
    } catch (err) {
      console.error(err)
      addToast('Network error uploading file', 'error')
    } finally {
      setUploading(false)
    }
  }

  // --- HELPERS ---
  const scrollToBottom = () => {
    setTimeout(() => {
      timelineEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 100)
  }

  const formatTime = (isoString) => {
    if (!isoString) return ''
    const date = new Date(isoString)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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

  const getStatusColor = (status) => {
    if (status === 'CONNECTED') return 'var(--green)'
    if (status === 'CONNECTING') return 'var(--yellow)'
    return 'var(--red)'
  }

  // --- USE EFFECTS ---
  useEffect(() => {
    fetchChats()
    fetchQuickReplies()
    fetchQuickPills()
    fetchBotStatus()
    connectWebSocket()

    // Poll bot status every 10 seconds to keep active number fresh
    const statusInterval = setInterval(fetchBotStatus, 10000)

    // Setup heartbeat ping loop
    const pingInterval = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }))
      }
    }, 30000)

    return () => {
      clearInterval(statusInterval)
      clearInterval(pingInterval)
      if (wsRef.current) wsRef.current.close()
      // Clear typing timers
      Object.values(typingTimersRef.current).forEach(clearTimeout)
    }
  }, [])

  // Filter conversations
  const filteredChats = chats.filter(c => {
    const searchLower = searchText.toLowerCase()
    const matchPhone = c.phone.toLowerCase().includes(searchLower)
    const matchName = c.customerName && c.customerName.toLowerCase().includes(searchLower)
    const matchSearch = matchPhone || matchName
    if (!matchSearch) return false
    if (activeFilter === 'unread') return c.unreadCount > 0
    if (activeFilter === 'high_risk') return c.riskFlag === 'HIGH' || c.riskFlag === 'BLOCKED'
    if (activeFilter === 'stuck') return c.deliveryStatus && STUCK_STATUSES.includes(c.deliveryStatus)
    return true
  })

  return (
    <div className="page-container p-6">
      <div className="wa-portal-container">
        
        {/* --- LEFT PANEL: CONVERSATIONS LIST --- */}
        <div className="wa-portal-left">
          
          {/* Connection Status Indicator */}
          <div className="wa-portal-status-bar">
            <span 
              className="wa-portal-status-dot" 
              style={{ 
                backgroundColor: getStatusColor(wsStatus),
                boxShadow: `0 0 8px ${getStatusColor(wsStatus)}`
              }}
            ></span>
            <span style={{ flex: 1 }}>
              WhatsApp: <strong style={{ color: getStatusColor(wsStatus) }}>{wsStatus.toLowerCase()}</strong>
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

          {/* Reactive Filter Tabs */}
          <div className="wa-portal-filter-tabs">
            {[
              { key: 'all', label: 'All' },
              { key: 'unread', label: `Unread ${chats.filter(c => c.unreadCount > 0).length > 0 ? `(${chats.filter(c => c.unreadCount > 0).length})` : ''}`.trim() },
              { key: 'high_risk', label: '🚩 Risk' },
              { key: 'stuck', label: '📦 Stuck' },
            ].map(f => (
              <button
                key={f.key}
                className={`wa-filter-tab ${activeFilter === f.key ? 'active' : ''}`}
                onClick={() => setActiveFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Threads List */}
          <div className="wa-portal-threads-list">
            {loadingChats ? (
              <div className="text-center p-8 text-muted">
                <span className="loading-spinner"></span>
                <p style={{ marginTop: 8 }}>Loading discussions...</p>
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
                    onClick={() => selectChat(c)}
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

        {/* --- CENTER PANEL: TIMELINE & CHAT INTERACTION --- */}
        <div className="wa-portal-center">
          {activeChat ? (
            <>
              {/* Header */}
              <div className="wa-portal-chat-header">
                <div className="wa-portal-chat-header-info">
                  <div className="wa-portal-avatar">
                    {activeChat.customerName ? activeChat.customerName.substring(0, 2).toUpperCase() : 'WA'}
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>
                      {activeChat.customerName || `+${activeChat.phone}`}
                    </h3>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {typingStatus[activeChat.phone] ? 'typing...' : `+${activeChat.phone}`}
                    </span>
                  </div>
                </div>
                
                {/* Actions */}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button 
                    className="btn btn-secondary btn-sm"
                    onClick={handleSendInvoice}
                    disabled={!customerInfo.latestOrder}
                    title="Send PDF Invoice to Customer"
                  >
                    📄 Send Invoice
                  </button>
                  <button 
                    onClick={() => selectChat(activeChat)} 
                    className="btn btn-secondary btn-sm"
                    title="Reload chat timeline"
                  >
                    🔄 Sync History
                  </button>
                </div>
              </div>

              {/* Message Timeline */}
              <div className="wa-portal-chat-timeline">
                {loadingMessages ? (
                  <div className="text-center p-12 text-muted">
                    <span className="loading-spinner"></span>
                    <p style={{ marginTop: 8 }}>Retrieving history...</p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center p-12 text-muted italic">No messages logged in this discussion.</div>
                ) : (
                  messages.map((msg, index) => {
                    const isOutgoing = msg.direction === 'outgoing'
                    const showImage = msg.media_type === 'image' && msg.media_url
                    const showAudio = msg.media_type === 'audio' && msg.media_url
                    const showDoc = msg.media_type === 'document' && msg.media_url
                    
                    return (
                      <div 
                        key={msg.id || index}
                        className={`wa-bubble ${isOutgoing ? 'outgoing' : 'incoming'}`}
                      >
                        {/* Rendering Message Content */}
                        {!showDoc && <span>{msg.message}</span>}

                        {/* Rendering Attachment Media types */}
                        {showImage && (
                          <img 
                            src={msg.media_url} 
                            alt="Sent media" 
                            className="wa-media-image"
                            onClick={() => setZoomedImage(msg.media_url)}
                          />
                        )}

                        {showAudio && (
                          <div>
                            <audio controls className="wa-media-audio">
                              <source src={msg.media_url} type="audio/mp4" />
                              <source src={msg.media_url} type="audio/ogg" />
                              <source src={msg.media_url} type="audio/mpeg" />
                              Your browser does not support the audio element.
                            </audio>
                            {msg.transcript && (
                              <div className="wa-bubble-transcript">
                                <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>🎙️ Transcript:</span>
                                <span className="wa-transcript-text">{msg.transcript}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {showDoc && (
                          <a 
                            href={msg.media_url} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="wa-media-doc"
                          >
                            <span className="wa-media-doc-icon">📄</span>
                            <div className="wa-media-doc-info">
                              <div className="wa-media-doc-name">{msg.message || 'Attached Document'}</div>
                              <div className="wa-media-doc-size">Click to open/download</div>
                            </div>
                          </a>
                        )}

                        <span className="wa-bubble-time">
                          {formatTime(msg.created_at)}
                          {isOutgoing && (
                            <span style={{ marginLeft: 4 }}>
                              {msg.status === 'sending' ? '⌛' : '✓'}
                            </span>
                          )}
                        </span>
                      </div>
                    )
                  })
                )}

                {/* Typing Indicator */}
                {typingStatus[activeChat.phone] && (
                  <div className="wa-typing-indicator">
                    <span>Typing</span>
                    <div className="wa-typing-dots">
                      <span className="wa-typing-dot"></span>
                      <span className="wa-typing-dot"></span>
                      <span className="wa-typing-dot"></span>
                    </div>
                  </div>
                )}
                
                <div ref={timelineEndRef} />
              </div>

              {/* Quick Pills Row */}
              {quickPills.length > 0 && (
                <div className="wa-portal-quick-pills">
                  {quickPills.map(p => (
                    <span 
                      key={p.id} 
                      className="wa-quick-pill"
                      onClick={() => handleSendMessage(p.pill_text)}
                    >
                      {p.pill_text}
                    </span>
                  ))}
                </div>
              )}

              {/* Chat Input Bar */}
              <div className="wa-portal-chat-input-bar">
                
                {/* Slash Command Palette */}
                {showSlashMenu && (
                  <div className="slash-cmd-palette">
                    {SLASH_COMMANDS
                      .filter(c => c.cmd.startsWith(slashCmd) || slashCmd === '/')
                      .map(c => (
                        <div
                          key={c.cmd}
                          className="slash-cmd-item"
                          onMouseDown={e => { e.preventDefault(); c.action(); }}
                        >
                          <span className="slash-cmd-label">{c.label}</span>
                          <span className="slash-cmd-desc">{c.desc}</span>
                        </div>
                      ))
                    }
                    {SLASH_COMMANDS.filter(c => c.cmd.startsWith(slashCmd) || slashCmd === '/').length === 0 && (
                      <div className="slash-cmd-empty">No matching commands</div>
                    )}
                  </div>
                )}

                {/* File Attachment */}
                <label className="wa-portal-action-btn" title="Send Media (Image, Audio, Document)">
                  📎
                  <input 
                    type="file" 
                    style={{ display: 'none' }} 
                    onChange={handleMediaUpload}
                    disabled={uploading}
                  />
                </label>

                {/* Templates Selector */}
                <button 
                  className="wa-portal-action-btn" 
                  onClick={() => setShowQuickReplies(prev => !prev)}
                  title="Insert Quick Reply Template"
                >
                  ⚡
                </button>

                {/* Input Field */}
                <textarea 
                  className="wa-portal-input-textarea"
                  placeholder="Type a message..."
                  value={inputText}
                  onChange={e => {
                    const val = e.target.value
                    setInputText(val)
                    if (val.startsWith('/')) {
                      setSlashCmd(val.toLowerCase())
                      setShowSlashMenu(true)
                    } else {
                      setShowSlashMenu(false)
                      setSlashCmd('')
                    }
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSendMessage()
                    }
                  }}
                  rows={1}
                />

                {/* Send button */}
                <button 
                  className="wa-portal-send-btn"
                  onClick={() => handleSendMessage()}
                  disabled={!inputText.trim()}
                >
                  ➡️
                </button>

                {/* Quick Replies Drawer */}
                {showQuickReplies && (
                  <div className="quick-replies-drawer">
                    <div className="quick-replies-drawer-header">
                      <span>⚡ Quick Reply Templates</span>
                      <button 
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                        onClick={() => setShowQuickReplies(false)}
                      >
                        ✕
                      </button>
                    </div>
                    <div className="quick-replies-drawer-list">
                      {quickReplies.length === 0 ? (
                        <div className="p-4 text-center text-muted italic text-xs">No template replies configured.</div>
                      ) : (
                        quickReplies.map(r => (
                          <div 
                            key={r.id} 
                            className="quick-replies-drawer-item"
                            onClick={() => handleSendQuickReply(r)}
                          >
                            <span className="quick-replies-drawer-item-title">{r.title}</span>
                            <span className="quick-replies-drawer-item-caption">{r.caption}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="wa-portal-chat-empty">
              <span className="wa-portal-chat-empty-icon">💬</span>
              <h2>WhatsApp Live Chat Support</h2>
              <p style={{ marginTop: 8, color: 'var(--text-secondary)' }}>
                Select a conversation from the left sidebar panel to start chatting in real time.
              </p>
            </div>
          )}
        </div>

        {/* --- RIGHT PANEL: CUSTOMER ORDER PROFILE & GEMINI ACTIVE MEMORY --- */}
        <div className="wa-portal-right">
          {activeChat ? (
            <>
              {/* Profile Card */}
              <div className="wa-portal-profile-section" style={{ textAlign: 'center' }}>
                <div className="wa-portal-profile-avatar">
                  {activeChat.customerName ? activeChat.customerName.substring(0, 2).toUpperCase() : 'WA'}
                </div>
                <h4 className="wa-portal-profile-name">{activeChat.customerName || 'WhatsApp Customer'}</h4>
                <div className="wa-portal-profile-phone">+{activeChat.phone}</div>
              </div>

              {/* Gemini Chat Memory Section */}
              <div className="wa-portal-profile-section">
                <h5 className="wa-portal-profile-title">🧠 Gemini Active Memory</h5>
                {customerInfo.geminiMemory ? (
                  <div 
                    style={{
                      background: 'rgba(168, 85, 247, 0.08)',
                      border: '1px solid rgba(168, 85, 247, 0.2)',
                      padding: 12,
                      borderRadius: 'var(--radius)',
                      fontSize: '0.82rem',
                      lineHeight: '1.4',
                      color: 'var(--text-primary)'
                    }}
                  >
                    {customerInfo.geminiMemory}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', italic: true }}>
                    No AI-extracted user sizing/preferences memory recorded yet.
                  </div>
                )}
              </div>

              {/* Order History Section */}
              <div className="wa-portal-profile-section" style={{ flex: 1 }}>
                <h5 className="wa-portal-profile-title">🛍️ Shopify Order History</h5>
                
                {customerInfo.orderHistory.length === 0 ? (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', italic: true }}>
                    No Shopify order history matched for this phone.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {customerInfo.orderHistory.map(o => (
                      <div key={o.id} className="wa-order-history-item">
                        <div className="wa-order-history-header">
                          <span>Order #{o.id}</span>
                          <span>Rs. {o.total_price}</span>
                        </div>
                        
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginTop: 4 }}>
                          <span className={`wa-badge-status ${o.fulfillment_status === 'fulfilled' ? 'fulfilled' : 'unfulfilled'}`}>
                            {o.fulfillment_status || 'unfulfilled'}
                          </span>
                          <span className={`wa-badge-status ${o.financial_status === 'paid' ? 'fulfilled' : 'unfulfilled'}`}>
                            {o.financial_status || 'unpaid'}
                          </span>
                        </div>

                        {/* Order Date */}
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 6 }}>
                          Ordered on: {new Date(o.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-muted italic text-sm">
              Select a conversation to load customer information.
            </div>
          )}
        </div>
      </div>

      {/* --- IMAGE ZOOM MODAL OVERLAY --- */}
      {zoomedImage && (
        <div 
          className="wa-image-zoom-overlay"
          onClick={() => setZoomedImage(null)}
        >
          <img src={zoomedImage} alt="Zoomed View" className="wa-image-zoom-img" />
        </div>
      )}
    </div>
  )
}
