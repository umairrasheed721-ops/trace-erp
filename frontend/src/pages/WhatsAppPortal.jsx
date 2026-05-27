import React, { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { useNavigate } from 'react-router-dom'
import VoiceNoteButton from '../components/VoiceNoteButton'
import QuickReplyPanel from '../components/QuickReplyPanel'
import MediaUploadOverlay from '../components/MediaUploadOverlay'
import SettingsModal from '../components/SettingsModal'
import { handleApiError, ERR } from '../utils/errorHandler'
import { useQuoteDraft } from '../context/QuoteDraftContext'

const getQuotedInfo = (msg) => {
  if (!msg) return null
  if (msg.quote_context) {
    try {
      const parsed = typeof msg.quote_context === 'string' ? JSON.parse(msg.quote_context) : msg.quote_context
      if (parsed && (parsed.id || parsed.message_id)) {
        return {
          id: parsed.id || parsed.message_id,
          participant: parsed.participant || parsed.participant_jid,
          text: parsed.text || parsed.conversation || 'Media'
        }
      }
    } catch (e) {
      console.warn('Failed to parse quote_context:', e)
    }
  }
  if (msg.contextInfo) {
    const info = msg.contextInfo
    if (info.stanzaId) {
      const qMsg = info.quotedMessage
      const text = qMsg?.conversation || qMsg?.extendedTextMessage?.text || (qMsg ? 'Media' : '')
      return {
        id: info.stanzaId,
        participant: info.participant,
        text: text || 'Media'
      }
    }
  }
  if (msg.quotedMessage) {
    return {
      id: msg.quotedMessage.id,
      participant: msg.quotedMessage.participant || msg.quotedMessage.participant_jid,
      text: msg.quotedMessage.text || 'Media'
    }
  }
  return null
}

const getQuoteSenderDisplayName = (participant, activeNumber) => {
  if (!participant) return 'System'
  if (participant === 'Me' || participant === 'you' || participant.startsWith('me@') || (activeNumber && participant.split('@')[0] === activeNumber.split(':')[0])) {
    return 'You'
  }
  return `@${participant.split('@')[0]}`
}

export default function WhatsAppPortal() {
  const { addToast } = useApp()
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
      setInputText(draftText || '')
    } else {
      setInputText('')
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
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const dragCounterRef = useRef(0)
  
  // --- SUBDATA STATES ---
  const [customerInfo, setCustomerInfo] = useState({
    latestOrder: null,
    orderHistory: [],
    geminiMemory: null
  })
  const [quickReplies, setQuickReplies] = useState([])
  const [quickPills, setQuickPills] = useState([])
  const [showQuickReplies, setShowQuickReplies] = useState(false)
  // FIX 3: sendingReply debounce — tracks which action is in-flight to prevent multi-click spam
  // Value: null (idle) | 'send' | 'pill:<text>' | 'qr:<id>'
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
  
  // --- CONSTANTS ---
  const STUCK_STATUSES = ['Consignee Not Available', 'Attempted Delivery', 'Hold', 'Address Issue', 'RTO Initiated', 'Return to Sender']

  // Navigation for command palette
  const navigate = useNavigate()

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

  const SLASH_COMMANDS = [
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
  ]

  // --- REFS ---
  const timelineEndRef = useRef(null)
  const wsRef = useRef(null)
  const typingTimersRef = useRef({})
  const cmdPaletteInputRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const inputRef = useRef(null)
  
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
    // Trigger sync
    setSyncTrigger(prev => prev + 1)
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

        if (wsEvent === 'message' && data && data.message) {
          const newMsg = data.message
          
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
                // Update in-place
                const updated = [...prev];
                updated[idx] = {
                  ...updated[idx],
                  ...newMsg,
                  clientUuid: updated[idx].clientUuid || newMsg.clientUuid
                };
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

    // FIX 3: Debounce guard — block re-entry while this action is in-flight
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
      const res = await fetch(`/api/whatsapp-governance/chats/${activeChat.phone}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: finalMsg, 
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

    // FIX 3: Debounce guard — block re-entry for same quick reply while in-flight
    const debounceKey = `qr:${reply.id}`
    if (sendingReply === debounceKey) return
    setSendingReply(debounceKey)
    const releaseTimer = setTimeout(() => setSendingReply(null), 2000)

    setShowQuickReplies(false)
    
    // Add temporary loading indicator bubble
    const clientUuid = 'client-opt-' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    const dbMsgContent = reply.media_url 
      ? `[${reply.media_type.toUpperCase()}] ${reply.caption || ''}`.trim()
      : (reply.caption || `[Template Reply: ${reply.title}]`);

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
    // Silent tracking — log to DB without alerting the customer
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

  const handleMediaUpload = async (fileOrEvent) => {
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
    
    const dbMsgContent = mediaType === 'image' ? `[Image]` : 
                         mediaType === 'audio' ? `[Audio]` : 
                         mediaType === 'video' ? `[Video]` : `[Document] ${file.name}`;

    const tempMsg = {
      id: clientUuid,
      phone: activeChat.phone,
      direction: 'outgoing',
      message: dbMsgContent,
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
        wsRef.current.send(JSON.stringify({ type: 'ping' }))
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

          {/* Threads List — Module 7: Skeleton Loaders */}
          <div className="wa-portal-threads-list">
            {loadingChats ? (
              <div>
                {[...Array(7)].map((_, i) => (
                  <div key={i} className="skeleton-thread">
                    <div className="skeleton skeleton-avatar" />
                    <div className="skeleton-lines">
                      <div className="skeleton skeleton-line" style={{ width: `${60 + (i % 3) * 15}%` }} />
                      <div className="skeleton skeleton-line" style={{ width: `${40 + (i % 4) * 12}%` }} />
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
        <div 
          className="wa-portal-center"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          style={{ position: 'relative' }}
        >
          {activeChat ? (
            <>
              {/* Drag & Drop + Upload Overlay — decoupled Module 8 component */}
              <MediaUploadOverlay
                isDragging={isDragging}
                uploading={uploading}
                onUpload={(file) => {
                  handleMediaUpload(file)
                }}
              />
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
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {/* Module 8: Smart Call Handoff */}
                    <a
                      href={`whatsapp://send?phone=${activeChat.phone}`}
                      onClick={handleCallHandoff}
                      className="btn btn-secondary btn-sm"
                      title="Open native WhatsApp app to call this customer"
                      style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.3)', color: '#25d366', transition: 'all 0.2s ease' }}
                    >
                      📞 Call
                    </a>
                    <button 
                      className="btn btn-secondary btn-sm"
                      onClick={handleSendInvoice}
                      disabled={!customerInfo.latestOrder}
                      title="Send PDF Invoice to Customer"
                    >
                      📄 Invoice
                    </button>
                    <button 
                      onClick={() => selectChat(activeChat)} 
                      className="btn btn-secondary btn-sm"
                      title="Reload chat timeline"
                    >
                      🔄 Sync
                    </button>
                  </div>
                </div>

              {/* Sync Progress Bar — Module 7 */}
              {syncingMessages && (
                <div className="wa-sync-progress">
                  <div className="wa-sync-progress-bar" />
                </div>
              )}

              {/* Human Handoff Banner — Module 5/7 */}
              {humanHandoffActive && (
                <div className="wa-handoff-banner">
                  <span>🧑</span>
                  <span>Human Agent Mode — Bot is silent for this chat</span>
                  <button onClick={() => setHumanHandoffActive(false)}>Resume Bot</button>
                </div>
              )}

              {/* Message Timeline */}
              <div
                className="wa-portal-chat-timeline"
                style={{ position: 'relative' }}
              >

                {loadingMessages ? (
                  <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className={`skeleton skeleton-bubble ${i % 2 === 0 ? '' : 'outgoing'}`} style={{ width: `${40 + (i % 3) * 15}%` }} />
                    ))}
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center p-12 text-muted italic">No messages logged in this discussion.</div>
                ) : (
                  messages.map((msg, index) => {
                    const isOutgoing = msg.direction === 'outgoing'
                    const showImage = msg.media_type === 'image' && msg.media_url
                    const showAudio = msg.media_type === 'audio' && msg.media_url
                    const showDoc = msg.media_type === 'document' && msg.media_url
                    const quoteInfo = getQuotedInfo(msg)
                    
                    // Parse AI payment card data from transcript
                    let paymentCardData = null
                    if (msg.ai_processed && msg.media_type === 'image' && msg.transcript) {
                      const amountMatch = msg.transcript.match(/Rs\.?\s*([\d,]+(?:\.\d{1,2})?)/i)
                      const txnMatch = msg.transcript.match(/TXN[:\s]?([A-Z0-9]+)/i)
                      const bankMatch = msg.transcript.match(/Bank[:\s]?([\w\s]+?)(?:\s|,|\.|$)/i)
                      const statusMatch = msg.transcript.match(/status[:\s]?(matched|mismatch|manual_review|verified)/i)
                      if (amountMatch) {
                        paymentCardData = {
                          amount: amountMatch[1],
                          txnId: txnMatch?.[1] || null,
                          bank: bankMatch?.[1]?.trim() || null,
                          status: statusMatch?.[1]?.toLowerCase() || 'reviewing',
                        }
                      }
                    }

                    return (
                      <div 
                        key={msg.id || index}
                        className={`wa-bubble ${isOutgoing ? 'outgoing' : 'incoming'}`}
                        onDoubleClick={() => handleQuoteClick(msg)}
                      >
                        {/* Subtle Reply button on hover */}
                        <button
                          type="button"
                          className="wa-bubble-reply-btn"
                          title="Reply to this message"
                          onClick={() => handleQuoteClick(msg)}
                        >
                          ↩️
                        </button>

                        {/* Rendering Quoted block inside bubble */}
                        {quoteInfo && (
                          <div className="wa-bubble-quote-block">
                            <span className="wa-bubble-quote-sender">
                              {getQuoteSenderDisplayName(quoteInfo.participant, activeNumber)}
                            </span>
                            <span className="wa-bubble-quote-text">
                              {quoteInfo.text}
                            </span>
                          </div>
                        )}

                        {/* Rendering Message Content */}
                        {!showDoc && <span>{msg.message}</span>}

                        {/* Rendering Attachment Media types */}
                        {showImage && (
                          <div>
                            <img 
                              src={getMediaUrlWithToken(msg.media_url)} 
                              alt="Sent media" 
                              className="wa-media-image"
                              onClick={() => setZoomedImage(getMediaUrlWithToken(msg.media_url))}
                            />
                            {/* Module 7: AI Payment Card rendering */}
                            {paymentCardData ? (
                              <div className="wa-ai-payment-card">
                                <div className="wa-ai-payment-card-header">
                                  <span>💳</span>
                                  <span>AI Payment Receipt</span>
                                  <span className={`wa-ai-payment-card-badge ${paymentCardData.status === 'matched' ? 'matched' : paymentCardData.status === 'mismatch' ? 'mismatch' : 'reviewing'}`}>
                                    {paymentCardData.status === 'matched' ? '✓ Verified' : paymentCardData.status === 'mismatch' ? '⚠ Mismatch' : '🔍 Reviewing'}
                                  </span>
                                </div>
                                <div className="wa-ai-payment-card-amount">Rs. {paymentCardData.amount}</div>
                                <div className="wa-ai-payment-card-meta">
                                  {paymentCardData.bank && <span>🏦 {paymentCardData.bank}</span>}
                                  {paymentCardData.txnId && <span>TXN: {paymentCardData.txnId}</span>}
                                </div>
                              </div>
                            ) : msg.transcript ? (
                              <div className="wa-bubble-transcript" style={{ marginTop: 8 }}>
                                <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>🔍 OCR Result:</span>
                                <span className="wa-transcript-text">{msg.transcript}</span>
                              </div>
                            ) : null}
                          </div>
                        )}

                        {showAudio && (
                          <div>
                            <audio controls className="wa-media-audio">
                              <source src={getMediaUrlWithToken(msg.media_url)} type="audio/mp4" />
                              <source src={getMediaUrlWithToken(msg.media_url)} type="audio/ogg" />
                              <source src={getMediaUrlWithToken(msg.media_url)} type="audio/mpeg" />
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
                            href={getMediaUrlWithToken(msg.media_url)} 
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
                              {msg.status === 'pending' || msg.status === 'sending' ? '⏳' : '✓'}
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
                  {quickPills.map(p => {
                    const pillKey = `pill:${p.pill_text?.substring(0, 20)}`
                    const isPillBusy = sendingReply === pillKey
                    return (
                      <span 
                        key={p.id} 
                        className="wa-quick-pill"
                        onClick={() => !isPillBusy && handleSendMessage(p.pill_text)}
                        style={{ 
                          opacity: isPillBusy ? 0.5 : 1, 
                          cursor: isPillBusy ? 'not-allowed' : 'pointer',
                          pointerEvents: isPillBusy ? 'none' : 'auto'
                        }}
                      >
                        {isPillBusy ? '⏳' : p.pill_text}
                      </span>
                    )
                  })}
                </div>
              )}

              {/* Quote Preview Frame */}
              {activeQuote && (
                <div className="wa-quote-preview-frame">
                  <div className="wa-quote-preview-content">
                    <span className="wa-quote-preview-sender">
                      @{activeQuote.participant_jid}
                    </span>
                    <span className="wa-quote-preview-text">
                      {activeQuote.text}
                    </span>
                  </div>
                  <button 
                    className="wa-quote-preview-cancel" 
                    onClick={() => clearQuote(activeChat.phone)}
                    title="Cancel quote"
                  >
                    ✕
                  </button>
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

                {/* Module 8: Push-to-Talk Mic Button */}
                <VoiceNoteButton 
                  isRecording={isRecording} 
                  handleVoiceNote={handleVoiceNote} 
                />

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
                  ref={inputRef}
                  className="wa-portal-input-textarea"
                  placeholder="Type a message..."
                  value={inputText}
                  onChange={e => {
                    const val = e.target.value
                    updateInputText(val)
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

                {/* Quick Replies Drawer — decoupled Module 8 component */}
                {showQuickReplies && (
                  <QuickReplyPanel
                    quickReplies={quickReplies}
                    sendingReply={sendingReply}
                    onSend={handleSendQuickReply}
                    onClose={() => setShowQuickReplies(false)}
                  />
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

              {/* Gemini Chat Memory Section — Module 7: Enhanced Glass Card */}
              <div className="wa-portal-profile-section">
                <h5 className="wa-portal-profile-title">🧠 Gemini Active Memory</h5>
                {customerInfo.geminiMemory ? (
                  <div className="wa-gemini-memory">
                    <span style={{ fontSize: '0.82rem', lineHeight: '1.5', color: 'var(--text-primary)' }}>
                      {customerInfo.geminiMemory}
                    </span>
                  </div>
                ) : (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 0' }}>
                    No AI-extracted memory recorded yet.
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

      {/* --- MODULE 7: GLOBAL COMMAND PALETTE (Cmd+K) --- */}
      {showCmdPalette && (
        <div
          className="cmd-palette-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) setShowCmdPalette(false) }}
        >
          <div className="cmd-palette-modal" role="dialog" aria-label="Command Palette">
            <div className="cmd-palette-input-wrap">
              <span className="cmd-palette-icon">⚡</span>
              <input
                ref={cmdPaletteInputRef}
                className="cmd-palette-input"
                placeholder="Search commands, navigate, or filter chats..."
                value={cmdQuery}
                onChange={e => { setCmdQuery(e.target.value); setCmdActiveIdx(0); }}
                autoComplete="off"
                spellCheck={false}
              />
              <span className="cmd-palette-kbd">ESC</span>
            </div>
            <div className="cmd-palette-results">
              {filteredCmdItems.length === 0 ? (
                <div className="cmd-palette-empty">No commands found for "{cmdQuery}"</div>
              ) : (
                cmdSections.map(section => (
                  <div key={section}>
                    <div className="cmd-palette-section-title">{section}</div>
                    {filteredCmdItems.filter(c => c.section === section).map((item, idx) => {
                      const globalIdx = filteredCmdItems.indexOf(item)
                      return (
                        <div
                          key={item.label}
                          id={`cmd-item-${globalIdx}`}
                          className={`cmd-palette-item ${globalIdx === cmdActiveIdx ? 'active' : ''}`}
                          onClick={() => { item.action(); setShowCmdPalette(false); }}
                          onMouseEnter={() => setCmdActiveIdx(globalIdx)}
                        >
                          <div className="cmd-palette-item-icon">{item.icon}</div>
                          <div className="cmd-palette-item-info">
                            <div className="cmd-palette-item-label">{item.label}</div>
                            <div className="cmd-palette-item-desc">{item.desc}</div>
                          </div>
                          {item.shortcut && (
                            <span className="cmd-palette-item-shortcut">{item.shortcut}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}
    </div>
  )
}
