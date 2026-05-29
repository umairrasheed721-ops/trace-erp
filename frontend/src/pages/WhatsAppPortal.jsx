import React, { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { useNavigate } from 'react-router-dom'
import { useTenant } from '../context/TenantContext'
import VoiceNoteButton from '../components/VoiceNoteButton'
import MediaUploadOverlay from '../components/MediaUploadOverlay'
import SettingsModal from '../components/SettingsModal'
import { handleApiError, ERR } from '../utils/errorHandler'
import { useQuoteDraft } from '../context/QuoteDraftContext'
import ChatSidebar from './ChatSidebar'
import ChatMessageList from './ChatMessageList'
import ChatInputArea from './ChatInputArea'

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

const CustomAudioPlayer = ({ src }) => {
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const audioRef = useRef(null)

  const togglePlay = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play().catch(err => console.warn('Audio play failed:', err))
    }
  }

  const handleTimeUpdate = () => {
    if (!audioRef.current) return
    setCurrentTime(audioRef.current.currentTime)
  }

  const handleLoadedMetadata = () => {
    if (!audioRef.current) return
    setDuration(audioRef.current.duration)
  }

  const handleSeek = (e) => {
    if (!audioRef.current) return
    const time = Number(e.target.value)
    audioRef.current.currentTime = time
    setCurrentTime(time)
  }

  const formatTime = (secs) => {
    if (isNaN(secs)) return '0:00'
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  return (
    <div className="wa-custom-audio-player">
      <audio
        ref={audioRef}
        src={src}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
      />
      <button type="button" onClick={togglePlay} className="wa-audio-play-btn">
        {isPlaying ? '⏸️' : '▶️'}
      </button>
      <div className="wa-audio-progress-container">
        <input
          type="range"
          min={0}
          max={duration || 100}
          value={currentTime}
          onChange={handleSeek}
          className="wa-audio-slider"
        />
        <div className="wa-audio-time-info">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  )
}

export default function WhatsAppPortal() {
  const { addToast } = useApp()
  const { tenantId } = useTenant()
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
  const [showCustomerInfo, setShowCustomerInfo] = useState(false)
  const [showCustomer360, setShowCustomer360] = useState(true)
  const [contextMenu, setContextMenu] = useState(null)
  
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
    { cmd: '/verify', label: '🔐 COD Verify', desc: 'Send COD verification poll to customer', action: () => { handleTriggerCODVerification(); setShowSlashMenu(false); updateInputText(''); } },
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

  const templateSlashCommands = quickReplies.map(t => {
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

    if (!confirm(`Are you sure you want to send COD Verification Poll to customer for Order #${customerInfo.latestOrder.ref_number || customerInfo.latestOrder.id}?`)) {
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
        addToast('✅ COD verification poll has been successfully queued and dispatched!', 'success');
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
      {/* Dynamic styles to inject shimmer and icon animations */}
      <style>{`
        @keyframes rightPanelShimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .right-panel-shimmer {
          background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%);
          background-size: 200% 100%;
          animation: rightPanelShimmer 1.5s infinite;
        }
        @keyframes lockPulse {
          0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.25); }
          70% { transform: scale(1.05); box-shadow: 0 0 0 12px rgba(16, 185, 129, 0); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
        .lock-pulse-icon {
          animation: lockPulse 2s infinite ease-in-out;
        }
      `}</style>

      <div className="wa-portal-container" style={{ backgroundColor: '#fcfcfc', border: '1px solid #eaeaea', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
        
        {/* --- LEFT PANEL: CONVERSATIONS LIST --- */}
        <ChatSidebar
          chats={chats}
          activeChat={activeChat}
          handleChatSelect={selectChat}
          wsStatus={wsStatus}
          activeNumber={activeNumber}
          searchText={searchText}
          setSearchText={setSearchText}
          activeFilter={activeFilter}
          setActiveFilter={setActiveFilter}
          loadingChats={loadingChats}
          typingStatus={typingStatus}
          setShowCmdPalette={setShowCmdPalette}
          setShowSettings={setShowSettings}
        />

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
            <div className="wa-portal-main" style={{ display: 'flex', flexDirection: 'row', flex: 1, minWidth: 0, height: '100%', overflow: 'hidden' }}>
              {/* Wrapped Chat Area */}
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, height: '100%', position: 'relative' }}>
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
                      onClick={handleTriggerCODVerification}
                      disabled={!customerInfo.latestOrder}
                      title="Send COD Verification Poll to Customer"
                      style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)', color: '#c084fc' }}
                    >
                      🔐 COD Verify
                    </button>
                    <button 
                      className="btn btn-secondary btn-sm"
                      onClick={handleSendInvoice}
                      disabled={!customerInfo.latestOrder}
                      title="Send PDF Invoice to Customer"
                    >
                      📄 Invoice
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setShowCustomer360(prev => !prev)}
                      title="Toggle Customer Info"
                      style={{
                        background: showCustomer360 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                        border: showCustomer360 ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255, 255, 255, 0.15)',
                        color: showCustomer360 ? 'var(--green, #10B981)' : 'var(--text-color, #ffffff)',
                        fontWeight: 600
                      }}
                    >
                      👤 Info {showCustomer360 ? '◀' : '▶'}
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
                <ChatMessageList
                  messages={messages}
                  activeChat={activeChat}
                  loadingMessages={loadingMessages}
                  activeNumber={activeNumber}
                  typingUsers={typingStatus}
                  handleQuoteClick={handleQuoteClick}
                  getMediaUrlWithToken={getMediaUrlWithToken}
                  setZoomedImage={setZoomedImage}
                  timelineEndRef={timelineEndRef}
                  contextMenu={contextMenu}
                  setContextMenu={setContextMenu}
                />

                {/* Input Area */}
                <ChatInputArea
                  activeChat={activeChat}
                  activeQuote={activeQuote}
                  clearQuote={clearQuote}
                  quickPills={quickPills}
                  sendingReply={sendingReply}
                  handleSendMessage={handleSendMessage}
                  inputText={inputText}
                  updateInputText={updateInputText}
                  isRecording={isRecording}
                  recordingTime={recordingTime}
                  handleDiscardRecording={handleDiscardRecording}
                  handleVoiceNote={handleVoiceNote}
                  handleMediaUpload={handleMediaUpload}
                  uploading={uploading}
                  showQuickReplies={showQuickReplies}
                  setShowQuickReplies={setShowQuickReplies}
                  quickReplies={quickReplies}
                  handleSendQuickReply={handleSendQuickReply}
                  showSlashMenu={showSlashMenu}
                  setShowSlashMenu={setShowSlashMenu}
                  SLASH_COMMANDS={SLASH_COMMANDS}
                  slashCmd={slashCmd}
                  setSlashCmd={setSlashCmd}
                  inputRef={inputRef}
                />
              </div>

              {/* CUSTOMER 360 RIGHT PANEL */}
              <div 
                className="wa-portal-right-panel wa-portal-right" 
                style={{
                  width: '320px', 
                  borderLeft: '1px solid #eee', 
                  background: '#fafafa', 
                  display: showCustomer360 ? 'flex' : 'none',
                  flexDirection: 'column',
                  gap: '15px',
                  padding: '15px',
                  overflowY: 'auto'
                }}
              >
                {/* Profile Card */}
                <div className="wa-portal-profile-section" style={{ textAlign: 'center', backgroundColor: '#fff', padding: '15px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #f0f0f0' }}>
                  <div className="wa-portal-profile-avatar" style={{ margin: '0 auto 10px auto' }}>
                    {activeChat.customerName ? activeChat.customerName.substring(0, 2).toUpperCase() : 'WA'}
                  </div>
                  <h4 className="wa-portal-profile-name" style={{ margin: '0 0 4px 0', fontSize: '1rem', fontWeight: 600 }}>{activeChat.customerName || 'WhatsApp Customer'}</h4>
                  <div className="wa-portal-profile-phone" style={{ fontSize: '0.8rem', color: '#6b7280' }}>+{activeChat.phone}</div>
                </div>

                {/* Order Status & COD Verification Badge Card */}
                <div className="wa-portal-profile-section" style={{ backgroundColor: '#fff', padding: '15px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #f0f0f0' }}>
                  <h5 className="wa-portal-profile-title" style={{ margin: '0 0 8px 0', fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>📦 Order Status</h5>
                  {loadingMessages ? (
                    <div className="right-panel-shimmer" style={{ height: '20px', width: '120px', borderRadius: '4px' }}></div>
                  ) : customerInfo.latestOrder ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ fontSize: '0.85rem', color: '#4b5563' }}>Order #{customerInfo.latestOrder.id}</div>
                      <div style={{ display: 'flex', alignItems: 'center', marginTop: 4 }}>
                        <span className="wa-badge-status" style={{ 
                          backgroundColor: customerInfo.latestOrder.cod_verified ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)', 
                          color: customerInfo.latestOrder.cod_verified ? '#10b981' : '#f59e0b', 
                          fontSize: '0.75rem', 
                          padding: '4px 8px', 
                          borderRadius: '6px', 
                          fontWeight: 'bold' 
                        }}>
                          {customerInfo.latestOrder.cod_verified ? '🔐 COD Verified' : '⏳ COD Pending'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.8rem', color: '#9ca3af', fontStyle: 'italic' }}>No active orders found.</div>
                  )}
                </div>

                {/* Quick Actions Card */}
                <div className="wa-portal-profile-section" style={{ backgroundColor: '#fff', padding: '15px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #f0f0f0' }}>
                  <h5 className="wa-portal-profile-title" style={{ margin: '0 0 8px 0', fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>⚡ Quick Actions</h5>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={handleSendInvoice}
                      disabled={!customerInfo.latestOrder}
                      style={{ width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      📄 Send PDF Invoice
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => selectChat(activeChat)}
                      style={{ width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      🔄 Sync Chat Timeline
                    </button>
                  </div>
                </div>

                {/* Customer 360 Insights / LTV Card */}
                <div className="wa-portal-profile-section" style={{ backgroundColor: '#fff', padding: '15px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #f0f0f0' }}>
                  <h5 className="wa-portal-profile-title" style={{ margin: '0 0 8px 0', fontSize: '0.85rem', fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: '6px' }}>💳 Customer LTV</h5>
                  {loadingMessages ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div className="right-panel-shimmer" style={{ height: '20px', width: '120px', borderRadius: '4px' }}></div>
                      <div className="right-panel-shimmer" style={{ height: '12px', width: '180px', borderRadius: '4px' }}></div>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--brand, #10B981)' }}>
                        Rs. {customerInfo.orderHistory?.reduce((sum, o) => sum + Number(o.total_price || 0), 0).toLocaleString() || '0'}
                      </div>
                      <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Total value over {customerInfo.orderHistory?.length || 0} orders</span>
                    </>
                  )}
                </div>

                {/* Gemini Chat Memory Section — Module 7: Enhanced Glass Card */}
                <div className="wa-portal-profile-section" style={{ backgroundColor: '#fff', padding: '15px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #f0f0f0' }}>
                  <h5 className="wa-portal-profile-title" style={{ margin: '0 0 8px 0', fontSize: '0.85rem', fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: '6px' }}>🧠 Gemini Active Memory</h5>
                  {loadingMessages ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div className="right-panel-shimmer" style={{ height: '12px', width: '100%', borderRadius: '4px' }}></div>
                      <div className="right-panel-shimmer" style={{ height: '12px', width: '90%', borderRadius: '4px' }}></div>
                      <div className="right-panel-shimmer" style={{ height: '12px', width: '40%', borderRadius: '4px' }}></div>
                    </div>
                  ) : customerInfo.geminiMemory ? (
                    <div className="wa-gemini-memory" style={{ background: '#f9fafb', padding: '8px', borderRadius: '6px', fontSize: '0.8rem', color: '#374151' }}>
                      {customerInfo.geminiMemory}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.8rem', color: '#9ca3af', fontStyle: 'italic', padding: '8px', background: '#f9fafb', borderRadius: '6px', border: '1px dashed #e5e7eb' }}>
                      No AI-extracted memory recorded yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div 
              className="wa-portal-chat-empty"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                background: 'radial-gradient(circle at center, #ffffff 0%, #f4f6f8 100%)',
                padding: '40px',
                textAlign: 'center'
              }}
            >
              <div 
                className="lock-pulse-icon"
                style={{ 
                  width: '72px', 
                  height: '72px', 
                  borderRadius: '50%', 
                  backgroundColor: 'rgba(16, 185, 129, 0.08)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  fontSize: '2.2rem', 
                  marginBottom: '20px',
                  boxShadow: '0 8px 24px rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.15)'
                }}
              >
                🔒
              </div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 600, color: '#1f2937', marginBottom: '8px', letterSpacing: '-0.02em' }}>
                TracePK Workspace - End-to-End Encrypted
              </h2>
              <p style={{ color: '#6b7280', fontSize: '0.92rem', maxWidth: '340px', lineHeight: '1.6', margin: '0 auto 30px auto' }}>
                Select a chat to view messages and customer history
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#10b981', fontWeight: 500, backgroundColor: 'rgba(16, 185, 129, 0.06)', padding: '6px 12px', borderRadius: '20px' }}>
                <span>🛡️ Secure Connection Active</span>
              </div>
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
                type="text"
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
