import { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTenant } from '../context/TenantContext'
import { useQuoteDraft } from '../context/QuoteDraftContext'
import { handleApiError } from '../utils/errorHandler'

import useWhatsAppSocket from './useWhatsAppSocket'
import useWhatsAppAudio from './useWhatsAppAudio'

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

  // Auto-focus chat input when a new chat is selected
  useEffect(() => {
    if (activeChat && inputRef.current) {
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus()
        }
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [activeChat])

  // Helper to update both local state and context state
  const updateInputText = (val) => {
    setInputText(val)
    if (activeJid) {
      setDraftText(activeJid, val)
    }
  }

  // Module 8: Rich Media states
  const [isDragging, setIsDragging] = useState(false)
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
  const [sendingReply, setSendingReply] = useState(null)
  
  // --- REAL-TIME & STATUS STATES ---
  const [typingStatus, setTypingStatus] = useState({}) // { phone: boolean }
  const [zoomedImage, setZoomedImage] = useState(null)
  const [activeFilter, setActiveFilter] = useState('all') // 'all' | 'unread' | 'high_risk' | 'stuck'
  const [slashCmd, setSlashCmd] = useState('')
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  
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
  const cmdPaletteInputRef = useRef(null)
  const inputRef = useRef(null)
  
  // --- SUB-HOOKS INITIALIZATION ---
  const socketHook = useWhatsAppSocket({
    activeChatRef,
    setMessages,
    setChats,
    setTypingStatus,
    setCustomerInfo,
    removeQuotedMessageGlobally,
    addToast,
    fetchChats: (silent) => fetchChats(silent),
    scrollToBottom
  })

  const audioHook = useWhatsAppAudio({
    activeChat,
    getDraft,
    clearQuote,
    setMessages,
    setChats,
    addToast,
    scrollToBottom
  })
  
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
    socketHook.setSyncingMessages(true)

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
          socketHook.setSyncingMessages(false)
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

  // --- ACTIONS ---
  const handleQuoteClick = (msg) => {
    if (!activeChat) return
    setQuotedMessage(activeChat.phone, {
      id: msg.message_id || msg.id,
      text: msg.message || (msg.media_type ? `[${msg.media_type.toUpperCase()}]` : ''),
      type: msg.media_type || 'text',
      participant_jid: msg.direction === 'outgoing' ? 'Me' : (activeChat.customerName || activeChat.phone),
      participant: msg.direction === 'outgoing'
        ? (socketHook.activeNumber ? socketHook.activeNumber.split(':')[0] + '@s.whatsapp.net' : 'me@s.whatsapp.net')
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
    isRecording: audioHook.isRecording,
    setIsRecording: audioHook.setIsRecording,
    recordingTime: audioHook.recordingTime,
    setRecordingTime: audioHook.setRecordingTime,
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
    wsStatus: socketHook.wsStatus,
    setWsStatus: socketHook.setWsStatus,
    typingStatus,
    setTypingStatus,
    zoomedImage,
    setZoomedImage,
    activeNumber: socketHook.activeNumber,
    setActiveNumber: socketHook.setActiveNumber,
    activeFilter,
    setActiveFilter,
    slashCmd,
    setSlashCmd,
    showSlashMenu,
    setShowSlashMenu,
    syncingMessages: socketHook.syncingMessages,
    setSyncingMessages: socketHook.setSyncingMessages,
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
    connectWebSocket: socketHook.connectWebSocket,
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
    handleVoiceNote: audioHook.handleVoiceNote,
    handleDiscardRecording: audioHook.handleDiscardRecording,
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
