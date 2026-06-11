import { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTenant } from '../context/TenantContext'
import { useQuoteDraft } from '../context/QuoteDraftContext'
import { handleApiError } from '../utils/errorHandler'

export default function useWhatsAppPortal() {
  const { addToast } = useApp()
  const { tenantId } = useTenant()
  const location = useLocation()
  const navigate = useNavigate()
  const hasAutoSelected = useRef(false)
  const { 
    getDraft, 
    setDraftText, 
    setQuotedMessage, 
    clearQuote, 
    clearDraft, 
    removeQuotedMessageGlobally 
  } = useQuoteDraft()

  const getMediaUrlWithToken = (mediaUrl) => {
    if (!mediaUrl) return ''
    if (mediaUrl.startsWith('http') || mediaUrl.startsWith('blob:')) return mediaUrl
    const traceToken = localStorage.getItem('trace_token') || localStorage.getItem('token') || ''
    const separator = mediaUrl.includes('?') ? '&' : '?'
    return `${mediaUrl}${separator}token=${encodeURIComponent(traceToken)}`
  }
  
  // --- UI STATES ---
  const [chats, setChats] = useState([])
  const [loadingChats, setLoadingChats] = useState(true)
  const [activeChat, setActiveChat] = useState(null)
  const activeChatRef = useRef(activeChat)
  useEffect(() => {
    activeChatRef.current = activeChat
  }, [activeChat])
  const [messages, setMessages] = useState([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [inputText, setInputText] = useState('')
  const [uploading, setUploading] = useState(false)

  const activeJid = activeChat?.phone || ''
  const activeQuote = activeJid ? getDraft(activeJid).quotedMessage : null

  // When activeChat changes, load draftText from context
  useEffect(() => {
    if (activeJid) {
      const { draftText } = getDraft(activeJid)
      updateInputText(draftText || '')
    } else {
      updateInputText('')
    }
  }, [activeJid])

  // Auto-focus chat input when quote reply is activated
  useEffect(() => {
    if (activeQuote && inputRef.current) {
      inputRef.current.focus()
    }
  }, [activeQuote])

  // Helper to update both local state and context state
  const updateInputText = (val) => {
    setInputText(val)
    if (activeJid) {
      setDraftText(activeJid, val)
    }
  }

  // Module 8: Rich Media states
  const [isDragging, setIsDragging] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const shouldDiscardRef = useRef(false)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const dragCounterRef = useRef(0)

  useEffect(() => {
    let interval
    if (isRecording) {
      setRecordingTime(0)
      interval = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
    } else {
      setRecordingTime(0)
    }
    return () => clearInterval(interval)
  }, [isRecording])

  const formatRecordingTime = (secs) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  const handleDiscardRecording = () => {
    shouldDiscardRef.current = true
    mediaRecorderRef.current?.stop()
  }
  
  // --- SUBDATA STATES ---
  const [customerInfo, setCustomerInfo] = useState({
    latestOrder: null,
    orderHistory: [],
    geminiMemory: null
  })
  const [quickReplies, setQuickReplies] = useState([])
  const [quickPills, setQuickPills] = useState([])
  const [showQuickReplies, setShowQuickReplies] = useState(false)
  const [sendingReply, setSendingReply] = useState(null)
  
  // --- REAL-TIME & STATUS STATES ---
  const [wsStatus, setWsStatus] = useState('CONNECTING') // CONNECTING, CONNECTED, DISCONNECTED
  const [typingStatus, setTypingStatus] = useState({}) // { phone: boolean }
  const [zoomedImage, setZoomedImage] = useState(null)
  const [activeNumber, setActiveNumber] = useState(null) // Bot's own WA number from Baileys
  const [activeFilter, setActiveFilter] = useState('all') // 'all' | 'unread' | 'high_risk' | 'stuck'
  const [slashCmd, setSlashCmd] = useState('')
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  const [syncingMessages, setSyncingMessages] = useState(false)
  
  // --- MODULE 7: COMMAND PALETTE STATE ---
  const [showCmdPalette, setShowCmdPalette] = useState(false)
  const [cmdQuery, setCmdQuery] = useState('')
  const [cmdActiveIdx, setCmdActiveIdx] = useState(0)
  
  // --- MODULE 7: HUMAN HANDOFF STATE ---
  const [humanHandoffActive, setHumanHandoffActive] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showCustomerInfo, setShowCustomerInfo] = useState(false)
  const [showCustomer360, setShowCustomer360] = useState(true)
  const [contextMenu, setContextMenu] = useState(null)
  
  // --- CONSTANTS ---
  const STUCK_STATUSES = ['Consignee Not Available', 'Attempted Delivery', 'Hold', 'Address Issue', 'RTO Initiated', 'Return to Sender']

  const resolvePlaceholders = (text, info) => {
    if (!text) return '';
    const customerName = info?.latestOrder?.customer_name || 'Customer';
    const orderId = info?.latestOrder?.id || '';
    const trackingNumber = info?.latestOrder?.tracking_number || '';
    const courier = info?.latestOrder?.courier || '';
    
    return text
      .replace(/\{\{customer_name\}\}/g, customerName)
      .replace(/\{\{order_id\}\}/g, orderId)
      .replace(/\{\{tracking_number\}\}/g, trackingNumber)
      .replace(/\{\{courier\}\}/g, courier);
  };

  const incrementTemplateUsage = async (id) => {
    try {
      const token = localStorage.getItem('trace_token') || '';
      await fetch(`/api/templates/${id}/usage`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-tenant-id': tenantId
        }
      });
      fetchQuickReplies();
    } catch (e) {}
  };

  const baseSlashCommands = [
    { cmd: '/verify', label: '🔐 COD Verify', desc: 'Send COD verification message to customer', action: () => { handleTriggerCODVerification(); setShowSlashMenu(false); updateInputText(''); } },
    { cmd: '/invoice', label: '📄 Send Invoice', desc: 'Generate & send PDF invoice', action: () => { handleSendInvoice(); setShowSlashMenu(false); updateInputText(''); } },
    { cmd: '/track', label: '📦 Send Tracking', desc: 'Send order tracking info', action: () => {
      if (activeChat) {
        const msg = `📦 Your order tracking is being retrieved...`
        updateInputText(msg)
        setShowSlashMenu(false)
      }
    }},
    { cmd: '/size', label: '📏 Customer Size', desc: 'Insert stored size preference', action: () => {
      if (activeChat?.sizePreference) {
        updateInputText(`Your size preference: ${activeChat.sizePreference}`)
      }
      setShowSlashMenu(false)
    }},
    { cmd: '/quick', label: '⚡ Quick Replies', desc: 'Open quick reply templates', action: () => { setShowQuickReplies(true); setShowSlashMenu(false); updateInputText(''); } },
    { cmd: '/risk', label: '🚩 Risk Flag', desc: 'View/set customer risk profile', action: () => { setShowSlashMenu(false); updateInputText(''); } },
  ];

  const templateSlashCommands = (quickReplies || []).map(t => {
    const code = '/' + t.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^\/|\/$)/g, '');
    return {
      cmd: code,
      label: `⚡ ${t.title}`,
      desc: t.text,
      action: () => {
        const resolved = resolvePlaceholders(t.text, customerInfo);
        updateInputText(resolved);
        setShowSlashMenu(false);
        incrementTemplateUsage(t.id);
        if (inputRef.current) {
          setTimeout(() => inputRef.current.focus(), 50);
        }
      }
    };
  });

  const SLASH_COMMANDS = [...baseSlashCommands, ...templateSlashCommands];

  // Global command palette items
  const CMD_PALETTE_COMMANDS = [
    { icon: '💬', label: 'WhatsApp Portal', desc: 'Live Chat Dashboard', section: 'Navigation', shortcut: 'Current', action: () => {} },
    { icon: '🤖', label: 'WhatsApp Bot', desc: 'Bot configuration & status', section: 'Navigation', shortcut: null, action: () => navigate('/whatsapp-bot') },
    { icon: '📊', label: 'Dashboard', desc: 'Main ERP overview', section: 'Navigation', shortcut: null, action: () => navigate('/') },
    { icon: '📦', label: 'Search Orders', desc: 'Find any order fast', section: 'Navigation', shortcut: null, action: () => navigate('/search') },
    { icon: '📄', label: 'Send Invoice', desc: 'Generate & send PDF invoice to active chat', section: 'Actions', shortcut: '/invoice', action: () => { handleSendInvoice(); setShowCmdPalette(false); } },
    { icon: '🔄', label: 'Sync Chat History', desc: 'Reload messages from server', section: 'Actions', shortcut: null, action: () => { if (activeChat) { selectChat(activeChat); setShowCmdPalette(false); } } },
    { icon: '⚡', label: 'Quick Replies', desc: 'Open template library', section: 'Actions', shortcut: '/quick', action: () => { setShowQuickReplies(true); setShowCmdPalette(false); } },
    { icon: '📦', label: 'Send Tracking', desc: 'Send order tracking status', section: 'Actions', shortcut: '/track', action: () => { updateInputText('📦 Your order tracking is being retrieved...'); setShowCmdPalette(false); } },
    { icon: '🔍', label: 'Filter: Unread', desc: 'Show unread conversations', section: 'Filters', shortcut: null, action: () => { setActiveFilter('unread'); setShowCmdPalette(false); } },
    { icon: '🚩', label: 'Filter: High Risk', desc: 'Show flagged contacts', section: 'Filters', shortcut: null, action: () => { setActiveFilter('high_risk'); setShowCmdPalette(false); } },
    { icon: '📦', label: 'Filter: Stuck', desc: 'Show stuck deliveries', section: 'Filters', shortcut: null, action: () => { setActiveFilter('stuck'); setShowCmdPalette(false); } },
    { icon: '📋', label: 'Filter: All', desc: 'Show all conversations', section: 'Filters', shortcut: null, action: () => { setActiveFilter('all'); setShowCmdPalette(false); } },
  ]

  // --- REFS ---
  const timelineEndRef = useRef(null)
  const wsRef = useRef(null)
  const typingTimersRef = useRef({})
  const cmdPaletteInputRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const inputRef = useRef(null)
  const lastWsActivityRef = useRef(Date.now())
  
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
      handleApiError(err, addToast, 'CHAT_FETCH')
    } finally {
      if (!silent) setLoadingChats(false)
    }
  }

  // --- CMD PALETTE FILTERED RESULTS ---
  const filteredCmdItems = CMD_PALETTE_COMMANDS.filter(c =>
    !cmdQuery || c.label.toLowerCase().includes(cmdQuery.toLowerCase()) || c.desc.toLowerCase().includes(cmdQuery.toLowerCase())
  )

  const cmdSections = [...new Set(filteredCmdItems.map(c => c.section))]

  // --- KEYBOARD SHORTCUT: CMD+K ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setShowCmdPalette(prev => !prev)
        setCmdQuery('')
        setCmdActiveIdx(0)
      }
      if (e.key === 'Escape') {
        setShowCmdPalette(false)
      }
      if (showCmdPalette) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setCmdActiveIdx(prev => Math.min(prev + 1, filteredCmdItems.length - 1))
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setCmdActiveIdx(prev => Math.max(prev - 1, 0))
        }
        if (e.key === 'Enter' && filteredCmdItems[cmdActiveIdx]) {
          filteredCmdItems[cmdActiveIdx].action()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showCmdPalette, filteredCmdItems, cmdActiveIdx])

  // Auto-focus cmd palette input when opened
  useEffect(() => {
    if (showCmdPalette && cmdPaletteInputRef.current) {
      setTimeout(() => cmdPaletteInputRef.current?.focus(), 50)
    }
  }, [showCmdPalette])

  const [syncTrigger, setSyncTrigger] = useState(0)

  // --- FETCH CHAT HISTORY EFFECT ---
  useEffect(() => {
    if (!activeChat?.phone) {
      setMessages([])
      return
    }

    // Reset the messages state array when switching chats
    setMessages([])
    setLoadingMessages(true)
    setSyncingMessages(true)

    let isMounted = true

    const loadChatHistory = async () => {
      try {
        const res = await fetch(`/api/whatsapp-governance/chats/${activeChat.phone}`)
        const data = await res.json()
        if (!isMounted) return
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
        if (isMounted) handleApiError(err, addToast, 'CHAT_FETCH')
      } finally {
        if (isMounted) {
          setLoadingMessages(false)
          setSyncingMessages(false)
          scrollToBottom()
        }
      }
    }

    loadChatHistory()

    return () => {
      isMounted = false
    }
  }, [activeChat?.phone, syncTrigger])

  const selectChat = (chat) => {
    setActiveChat(chat)
    // Clear unread badge in state
    setChats(prev => prev.map(c => c.phone === chat.phone ? { ...c, unreadCount: 0 } : c))
    
    // Call backend API to mark latest incoming message as read
    const token = localStorage.getItem('trace_token') || '';
    fetch(`/api/whatsapp-governance/chats/${chat.phone}/read`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }).catch(err => console.error('Failed to mark chat as read:', err));

    // Trigger sync
    setSyncTrigger(prev => prev + 1)
  }

  // --- FETCH QUICK ACCESS ITEMS ---
  const fetchQuickReplies = async () => {
    try {
      const token = localStorage.getItem('trace_token') || '';
      const res = await fetch(`/api/templates?quick=true&tenant_id=${encodeURIComponent(tenantId)}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-tenant-id': tenantId
        }
      });
      const data = await res.json();
      if (data.success) setQuickReplies(data.templates || []);
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
      wsRef.current.onclose = null
      wsRef.current.onerror = null
      wsRef.current.onmessage = null
      wsRef.current.onopen = null
      try {
        wsRef.current.close()
      } catch (e) {}
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
      if (lastWsActivityRef.current !== undefined) {
        lastWsActivityRef.current = Date.now()
      }
    }

    socket.onmessage = (event) => {
      if (lastWsActivityRef.current !== undefined) {
        lastWsActivityRef.current = Date.now()
      }
      try {
        const payload = JSON.parse(event.data)
        const { event: wsEvent, data } = payload
        const currentActive = activeChatRef.current

        if (wsEvent === 'message_deleted' && data) {
          const { message_id, phone } = data
          if (currentActive && String(currentActive.phone) === String(phone)) {
            setMessages(prev => prev.map(m => {
              if (m.id === message_id || String(m.message_id) === String(message_id)) {
                return {
                  ...m,
                  message: "🚫 This message was deleted",
                  media_url: null,
                  media_type: null
                }
              }
              return m
            }))
          }
          setChats(prevChats => prevChats.map(c => {
            if (String(c.phone) === String(phone) && c.lastMessage && (c.lastMessage.id === message_id || String(c.lastMessage.message_id) === String(message_id))) {
              return {
                ...c,
                lastMessage: {
                  ...c.lastMessage,
                  message: "🚫 This message was deleted",
                  media_url: null,
                  media_type: null
                }
              }
            }
            return c
          }))
          removeQuotedMessageGlobally(message_id)
        }

        if (wsEvent === 'messages.update' && data) {
          const { id, status } = data;
          setMessages(prev => prev.map(msg => 
            (msg.message_id === id || msg.id === id || String(msg.id) === String(id) || String(msg.message_id) === String(id)) 
              ? { ...msg, status: status } 
              : msg
          ));
          setChats(prevChats => prevChats.map(c => {
            if (c.lastMessage && (c.lastMessage.id === id || String(c.lastMessage.message_id) === String(id))) {
              return {
                ...c,
                lastMessage: { ...c.lastMessage, status: status }
              };
            }
            return c;
          }));
        }

        let newMsg = null;
        if (wsEvent === 'message' && data && data.message) {
          newMsg = data.message;
        } else if (wsEvent === 'NEW_MESSAGE' && data) {
          newMsg = {
            id: data.id || `msg-${Date.now()}`,
            message_id: data.id,
            phone: data.phone,
            message: data.text || '',
            direction: data.direction === 'outbound' ? 'outgoing' : 'incoming',
            status: 'sent',
            created_at: new Date().toISOString()
          };
        }

        if (newMsg) {
          // 1. Update chronological messages list if active chat matched
          if (currentActive && String(currentActive.phone) === String(newMsg.phone)) {
            setMessages(prev => {
              // Deduplicate strictly
              const idx = prev.findIndex(m => {
                const uuidMatch = (newMsg.clientUuid && (m.id === newMsg.clientUuid || m.clientUuid === newMsg.clientUuid));
                const idMatch = (newMsg.id && (m.id === newMsg.id || String(m.message_id) === String(newMsg.id)));
                const msgIdMatch = (newMsg.message_id && (m.message_id === newMsg.message_id || m.id === newMsg.message_id));
                
                if (uuidMatch || idMatch || msgIdMatch) return true;
  
                // Fallback Match (Aggressive Content + Time check)
                if (m.direction === 'outgoing' && newMsg.direction === 'outgoing') {
                  const contentMatch = (m.message && newMsg.message && m.message.trim() === newMsg.message.trim());
                  
                  const t1 = m.created_at ? new Date(m.created_at).getTime() : Date.now();
                  const t2 = newMsg.created_at ? new Date(newMsg.created_at).getTime() : Date.now();
                  const timeMatch = Math.abs(t1 - t2) < 5000;

                  if (contentMatch && timeMatch) return true;
                }

                return false;
              });

              if (idx !== -1) {
                // Update in-place safely preserving media properties
                const updated = [...prev];
                const existing = updated[idx];
                const merged = { ...existing };
                
                // Copy non-empty/non-null properties
                Object.keys(newMsg).forEach(key => {
                  const val = newMsg[key];
                  if (val !== null && val !== undefined && val !== '') {
                    merged[key] = val;
                  }
                });
                
                // Keep existing truthy media properties if the incoming is falsy
                if (existing.media_url && !merged.media_url) merged.media_url = existing.media_url;
                if (existing.media_type && !merged.media_type) merged.media_type = existing.media_type;
                if (existing.message && !merged.message) merged.message = existing.message;
                
                merged.clientUuid = existing.clientUuid || newMsg.clientUuid;
                
                updated[idx] = merged;
                return updated;
              } else {
                // Append if new
                return [...prev, newMsg];
              }
            });
            scrollToBottom();
          }

          // 2. Update list preview or unread count
          setChats(prevChats => {
            let updated = prevChats.map(c => {
              if (String(c.phone) === String(newMsg.phone)) {
                const isCurrentlyActive = currentActive && String(currentActive.phone) === String(newMsg.phone)
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
            String(m.id) === String(data.messageId) ? { ...m, transcript: data.transcript, status: data.status, ai_processed: data.ai_processed } : m
          ))
        }

        if (wsEvent === 'ocr_result' && data) {
          // Update message OCR transcript inline
          setMessages(prev => prev.map(m =>
            String(m.id) === String(data.messageId) ? { ...m, transcript: data.transcript, status: data.msgStatus, ai_processed: data.ai_processed } : m
          ))

          // Show a toast notification for OCR results
          if (data.status === 'matched') {
            addToast(`✅ Payment verified! Rs.${data.detectedAmount} matched — ${data.detectedBank || 'Bank'} TXN ${data.detectedTxnId || 'N/A'}`, 'success')
            
            // Dynamically refresh order history and latest order status
            if (data.orderId) {
              setCustomerInfo(prev => {
                const updatedHistory = prev.orderHistory.map(o => {
                  if (Number(o.id) === Number(data.orderId)) {
                    return { ...o, payment_status: 'OCR Verified', paid_amount: data.detectedAmount }
                  }
                  return o
                })
                const updatedLatest = prev.latestOrder && Number(prev.latestOrder.id) === Number(data.orderId)
                  ? { ...prev.latestOrder, payment_status: 'OCR Verified', paid_amount: data.detectedAmount }
                  : prev.latestOrder
                return {
                  ...prev,
                  orderHistory: updatedHistory,
                  latestOrder: updatedLatest
                }
              })
            }
          } else if (data.status === 'mismatch') {
            addToast(`⚠️ Payment amount mismatch — Rs.${data.detectedAmount} received. Manual review needed.`, 'warning')
          } else if (data.status === 'manual_review') {
            addToast(`🔍 Payment receipt detected. Please verify manually.`, 'info')
          }
        }

        if (wsEvent === 'memory_update' && data) {
          if (currentActive && String(currentActive.phone) === String(data.phone)) {
            setCustomerInfo(prev => ({
              ...prev,
              geminiMemory: data.memoryText
            }))
          }
        }
      } catch (err) {
        console.error('Error handling WebSocket message:', err)
      }
    }

    socket.onclose = () => {
      console.log('🔌 WebSocket disconnected. Retrying in 3 seconds...')
      setWsStatus('DISCONNECTED')
      reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000)
    }

    socket.onerror = (err) => {
      console.error('WebSocket Error:', err)
      setWsStatus('DISCONNECTED')
    }
  }

  // --- ACTIONS ---
  const handleQuoteClick = (msg) => {
    if (!activeChat) return
    setQuotedMessage(activeChat.phone, {
      id: msg.message_id || msg.id,
      text: msg.message || (msg.media_type ? `[${msg.media_type.toUpperCase()}]` : ''),
      type: msg.media_type || 'text',
      participant_jid: msg.direction === 'outgoing' ? 'Me' : (activeChat.customerName || activeChat.phone),
      participant: msg.direction === 'outgoing'
        ? (activeNumber ? activeNumber.split(':')[0] + '@s.whatsapp.net' : 'me@s.whatsapp.net')
        : (activeChat.phone + '@s.whatsapp.net')
    })
  }

  const handleSendMessage = async (textToSend = null) => {
    const finalMsg = textToSend !== null ? textToSend : inputText
    if (!finalMsg.trim() || !activeChat) return

    const activeQuote = getDraft(activeChat.phone).quotedMessage

    // Debounce guard — block re-entry while this action is in-flight
    const debounceKey = textToSend !== null ? `pill:${textToSend.substring(0, 20)}` : 'send'
    if (sendingReply === debounceKey) return
    setSendingReply(debounceKey)
    // Auto-release after 2s as safety fallback
    const releaseTimer = setTimeout(() => setSendingReply(null), 2000)

    // Optimistic message object with client-side UUID
    const clientUuid = 'client-opt-' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    const optimisticMessage = {
      id: clientUuid,
      phone: activeChat.phone,
      direction: 'outgoing',
      message: finalMsg,
      status: 'pending',
      created_at: new Date().toISOString()
    }

    // Instantly append bubble
    setMessages(prev => [...prev, optimisticMessage])
    if (textToSend === null) updateInputText('')
    scrollToBottom()

    try {
      const token = localStorage.getItem('trace_token') || localStorage.getItem('token') || '';
      const activeStoreId = activeChat?.order?.store_id || customerInfo.latestOrder?.store_id || 1;
      const res = await fetch(`/api/whatsapp/send`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          phone: activeChat.phone,
          text: finalMsg, 
          store_id: activeStoreId,
          clientUuid,
          quoteContext: activeQuote ? { 
            id: activeQuote.id, 
            participant: activeQuote.participant, 
            text: activeQuote.text 
          } : null
        })
      })
      const data = await res.json()
      
      if (data.success && data.message) {
        // Swap out optimistic message with true database returned object
        setMessages(prev => prev.map(m => m.id === clientUuid ? { ...m, ...data.message, status: 'sent' } : m))
        
        // Update conversation list preview
        setChats(prev => prev.map(c => c.phone === activeChat.phone ? { ...c, lastMessage: data.message } : c))
        clearQuote(activeChat.phone)
      } else {
        addToast(data.error || 'Failed to dispatch message', 'error')
        setMessages(prev => prev.filter(m => m.id !== clientUuid)) // Rollback
      }
    } catch (err) {
      handleApiError(err, addToast, 'MESSAGE_SEND')
      setMessages(prev => prev.filter(m => m.id !== clientUuid)) // Rollback
    } finally {
      clearTimeout(releaseTimer)
      setSendingReply(null)
    }
  }

  const handleSendQuickReply = async (reply) => {
    if (!activeChat) return

    const activeQuote = getDraft(activeChat.phone).quotedMessage

    const debounceKey = `qr:${reply.id}`
    if (sendingReply === debounceKey) return
    setSendingReply(debounceKey)
    const releaseTimer = setTimeout(() => setSendingReply(null), 2000)

    setShowQuickReplies(false)
    
    // Add temporary loading indicator bubble
    const clientUuid = 'client-opt-' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    
    const templateText = reply.text || reply.caption || '';
    const resolvedText = resolvePlaceholders(templateText, customerInfo);

    const dbMsgContent = reply.media_url 
      ? `[${reply.media_type ? reply.media_type.toUpperCase() : 'MEDIA'}] ${resolvedText}`.trim()
      : resolvedText;

    const optimisticMessage = {
      id: clientUuid,
      phone: activeChat.phone,
      direction: 'outgoing',
      message: dbMsgContent,
      media_url: reply.media_url || null,
      media_type: reply.media_type || null,
      status: 'pending',
      created_at: new Date().toISOString()
    }
    
    setMessages(prev => [...prev, optimisticMessage])
    scrollToBottom()

    try {
      const res = await fetch(`/api/whatsapp-governance/chats/${activeChat.phone}/send-quick-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          replyId: reply.id, 
          clientUuid,
          quoteContext: activeQuote ? { 
            id: activeQuote.id, 
            participant: activeQuote.participant, 
            text: activeQuote.text 
          } : null
        })
      })
      const data = await res.json()
      
      if (data.success && data.message) {
        setMessages(prev => prev.map(m => m.id === clientUuid ? { ...m, ...data.message, status: 'sent' } : m))
        setChats(prev => prev.map(c => c.phone === activeChat.phone ? { ...c, lastMessage: data.message } : c))
        addToast(`✅ Quick reply "${reply.title}" dispatched!`, 'success')
        clearQuote(activeChat.phone)
        
        // Fire-and-forget: Increment usage count on backend
        incrementTemplateUsage(reply.id);
      } else {
        addToast(data.error || 'Failed to send quick reply', 'error')
        setMessages(prev => prev.filter(m => m.id !== clientUuid))
      }
    } catch (err) {
      handleApiError(err, addToast, 'QUICK_REPLY')
      setMessages(prev => prev.filter(m => m.id !== clientUuid))
    } finally {
      clearTimeout(releaseTimer)
      setSendingReply(null)
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
      handleApiError(err, addToast, 'INVOICE')
      setMessages(prev => prev.filter(m => m.id !== tempId))
    }
  }

  const handleTriggerCODVerification = async () => {
    if (!activeChat || !customerInfo.latestOrder) {
      return addToast('No order history matched to trigger verification', 'warning')
    }

    if (!confirm(`Are you sure you want to send COD Verification Message to customer for Order #${customerInfo.latestOrder.ref_number || customerInfo.latestOrder.id}?`)) {
      return
    }

    try {
      const res = await fetch('/api/whatsapp-governance/cod-verify/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: customerInfo.latestOrder.id })
      });
      const data = await res.json();
      if (data.success) {
        addToast('✅ COD verification message has been successfully queued and dispatched!', 'success');
      } else {
        addToast(data.error || 'Failed to trigger verification', 'error');
      }
    } catch (err) {
      addToast(err.message || 'Error triggering verification', 'error');
    }
  }

  // --- MODULE 8: DRAG & DROP UPLOAD ---
  const handleDragEnter = (e) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current += 1
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) setIsDragging(true)
  }
  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current -= 1
    if (dragCounterRef.current === 0) setIsDragging(false)
  }
  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation() }
  const handleDrop = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    dragCounterRef.current = 0
    if (!activeChat) return addToast('Select a chat first', 'warning')
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    await handleMediaUpload(file)
  }

  // --- MODULE 8: PUSH-TO-TALK VOICE NOTE ---
  const handleVoiceNote = async () => {
    if (isRecording) {
      // Stop recording
      mediaRecorderRef.current?.stop()
      return
    }
    if (!activeChat) return addToast('Select a chat to send a voice note', 'warning')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      audioChunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        setIsRecording(false)
        if (shouldDiscardRef.current) {
          shouldDiscardRef.current = false
          addToast('Recording discarded', 'info')
          return
        }
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        if (blob.size < 1000) return addToast('Recording too short', 'warning')
        
        const activeQuote = getDraft(activeChat.phone).quotedMessage

        const clientUuid = 'client-opt-' + Math.random().toString(36).substring(2) + Date.now().toString(36);
        const tempUrl = URL.createObjectURL(blob);
        const tempMsg = {
          id: clientUuid,
          phone: activeChat.phone,
          direction: 'outgoing',
          message: '[Voice Note]',
          media_url: tempUrl,
          media_type: 'audio',
          status: 'pending',
          created_at: new Date().toISOString()
        };
        setMessages(prev => [...prev, tempMsg]);
        scrollToBottom();

        const formData = new FormData()
        formData.append('audio', blob, `voice_${Date.now()}.webm`)
        formData.append('clientUuid', clientUuid)
        if (activeQuote) {
          formData.append('quoteContext', JSON.stringify({ 
            id: activeQuote.id, 
            participant: activeQuote.participant, 
            text: activeQuote.text 
          }))
        }
        addToast('⏳ Sending voice note...', 'info')
        try {
          const res = await fetch(`/api/whatsapp-governance/chats/${activeChat.phone}/upload-voice`, {
            method: 'POST', body: formData
          })
          const data = await res.json()
          if (data.success && data.message) {
            setMessages(prev => {
              const idx = prev.findIndex(m => m.id === clientUuid);
              if (idx !== -1) {
                const next = [...prev];
                next[idx] = { ...next[idx], ...data.message, status: 'sent' };
                return next;
              }
              if (!prev.some(m => m.id === data.message.id)) {
                return [...prev, data.message];
              }
              return prev;
            });
            setChats(prev => prev.map(c => c.phone === activeChat.phone ? { ...c, lastMessage: data.message } : c))
            addToast('✅ Voice note sent!', 'success')
            clearQuote(activeChat.phone)
            scrollToBottom()
          } else { 
            setMessages(prev => prev.filter(m => m.id !== clientUuid));
            addToast(data.error || 'Failed to send voice note', 'error') 
          }
        } catch (err) { 
          setMessages(prev => prev.filter(m => m.id !== clientUuid));
          handleApiError(err, addToast, 'VOICE_NOTE') 
        }
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setIsRecording(true)
    } catch (err) {
      console.error('Mic access error:', err)
      addToast('Microphone access denied. Check browser permissions.', 'error')
    }
  }

  // --- MODULE 8: SMART CALL HANDOFF ---
  const handleCallHandoff = async () => {
    if (!activeChat) return
    try {
      const res = await fetch(`/api/whatsapp-governance/chats/${activeChat.phone}/log-call-handoff`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }
      })
      const data = await res.json()
      if (data.success && data.message) {
        setMessages(prev => [...prev, data.message])
      }
    } catch (err) { console.warn('Call handoff log failed:', err.message) }
  }

  const handleMediaUpload = async (fileOrEvent, caption = '') => {
    let file
    if (fileOrEvent && fileOrEvent.target && fileOrEvent.target.files) {
      file = fileOrEvent.target.files[0]
    } else {
      file = fileOrEvent
    }
    if (!file || !activeChat) return

    const activeQuote = getDraft(activeChat.phone).quotedMessage

    const clientUuid = 'client-opt-' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    const tempUrl = URL.createObjectURL(file);
    const mediaType = file.type.startsWith('image/') ? 'image' : 
                      file.type.startsWith('audio/') ? 'audio' :
                      file.type.startsWith('video/') ? 'video' : 'document';
    
    const dbMsgContent = mediaType === 'image' ? `[Image] ${caption}` : 
                         mediaType === 'audio' ? `[Audio] ${caption}` : 
                         mediaType === 'video' ? `[Video] ${caption}` : `[Document] ${file.name} ${caption}`;

    const tempMsg = {
      id: clientUuid,
      phone: activeChat.phone,
      direction: 'outgoing',
      message: dbMsgContent.trim(),
      media_url: tempUrl,
      media_type: mediaType,
      status: 'pending',
      created_at: new Date().toISOString()
    }

    setMessages(prev => [...prev, tempMsg])
    scrollToBottom()

    const formData = new FormData()
    formData.append('media', file)
    formData.append('clientUuid', clientUuid)
    if (caption) {
      formData.append('caption', caption)
    }
    if (activeQuote) {
      formData.append('quoteContext', JSON.stringify({ 
        id: activeQuote.id, 
        participant: activeQuote.participant, 
        text: activeQuote.text 
      }))
    }
    
    setUploading(true)
    addToast(`Uploading ${file.name}...`, 'info')

    try {
      const res = await fetch(`/api/whatsapp-governance/chats/${activeChat.phone}/upload-media`, {
        method: 'POST',
        body: formData
      })
      const data = await res.json()
      
      if (data.success && data.message) {
        setMessages(prev => prev.map(m => m.id === clientUuid ? { ...m, ...data.message, status: 'sent' } : m))
        setChats(prev => prev.map(c => c.phone === activeChat.phone ? { ...c, lastMessage: data.message } : c))
        addToast('✅ Media attachment successfully sent!', 'success')
        clearQuote(activeChat.phone)
        scrollToBottom()
      } else {
        addToast(data.error || 'Failed to send file', 'error')
        setMessages(prev => prev.filter(m => m.id !== clientUuid))
      }
    } catch (err) {
      handleApiError(err, addToast, 'MEDIA_UPLOAD')
      setMessages(prev => prev.filter(m => m.id !== clientUuid))
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
    if (status === 'SLEEPING') return '#8b5cf6'
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
        try {
          wsRef.current.send(JSON.stringify({ type: 'ping' }))
        } catch (e) {}
      }

      // Check for half-open connection (no server response/activity for 60 seconds)
      const lastActivity = lastWsActivityRef.current || 0
      if (Date.now() - lastActivity > 60000) {
        console.warn('⚠️ No WebSocket activity for 60s (half-open connection). Reconnecting...')
        connectWebSocket()
      }
    }, 30000)

    return () => {
      clearInterval(statusInterval)
      clearInterval(pingInterval)
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
      }
      // Clear typing timers
      Object.values(typingTimersRef.current).forEach(clearTimeout)
    }
  }, [])

  // Handle auto-selection of chat passed in routing state
  useEffect(() => {
    if (chats.length > 0 && location.state?.selectPhone && !hasAutoSelected.current) {
      const targetPhone = location.state.selectPhone;
      const matchedChat = chats.find(c => c.phone === targetPhone || c.phone.replace(/\D/g,'') === targetPhone.replace(/\D/g,''));
      if (matchedChat) {
        hasAutoSelected.current = true;
        selectChat(matchedChat);
      } else {
        // Construct temp chat if it doesn't exist in active chats yet
        const tempChat = {
          phone: targetPhone,
          customerName: 'Customer',
          unreadCount: 0
        };
        hasAutoSelected.current = true;
        selectChat(tempChat);
      }
    }
  }, [chats, location.state])

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

  return {
    addToast,
    tenantId,
    location,
    chats,
    setChats,
    loadingChats,
    setLoadingChats,
    activeChat,
    setActiveChat,
    messages,
    setMessages,
    loadingMessages,
    setLoadingMessages,
    searchText,
    setSearchText,
    inputText,
    setInputText,
    uploading,
    setUploading,
    isDragging,
    setIsDragging,
    isRecording,
    setIsRecording,
    recordingTime,
    setRecordingTime,
    customerInfo,
    setCustomerInfo,
    quickReplies,
    setQuickReplies,
    quickPills,
    setQuickPills,
    showQuickReplies,
    setShowQuickReplies,
    sendingReply,
    setSendingReply,
    wsStatus,
    setWsStatus,
    typingStatus,
    setTypingStatus,
    zoomedImage,
    setZoomedImage,
    activeNumber,
    setActiveNumber,
    activeFilter,
    setActiveFilter,
    slashCmd,
    setSlashCmd,
    showSlashMenu,
    setShowSlashMenu,
    syncingMessages,
    setSyncingMessages,
    showCmdPalette,
    setShowCmdPalette,
    cmdQuery,
    setCmdQuery,
    cmdActiveIdx,
    setCmdActiveIdx,
    humanHandoffActive,
    setHumanHandoffActive,
    showSettings,
    setShowSettings,
    showCustomerInfo,
    setShowCustomerInfo,
    showCustomer360,
    setShowCustomer360,
    contextMenu,
    setContextMenu,
    syncTrigger,
    setSyncTrigger,
    timelineEndRef,
    inputRef,
    cmdPaletteInputRef,
    connectWebSocket,
    fetchChats,
    selectChat,
    handleQuoteClick,
    handleSendMessage,
    handleSendQuickReply,
    handleSendInvoice,
    handleTriggerCODVerification,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleVoiceNote,
    handleDiscardRecording,
    handleCallHandoff,
    handleMediaUpload,
    scrollToBottom,
    formatTime,
    formatRelativeTime,
    getMediaUrlWithToken,
    activeJid,
    activeQuote,
    updateInputText,
    SLASH_COMMANDS,
    filteredCmdItems,
    cmdSections,
    resolvePlaceholders,
    filteredChats
  }
}
