import { useState, useEffect, useRef } from 'react'

export default function useWhatsAppSocket({
  activeChatRef,
  setMessages,
  setChats,
  setTypingStatus,
  setCustomerInfo,
  removeQuotedMessageGlobally,
  addToast,
  fetchChats,
  scrollToBottom
}) {
  const [wsStatus, setWsStatus] = useState('CONNECTING') // CONNECTING, CONNECTED, DISCONNECTED
  const [activeNumber, setActiveNumber] = useState(null) // Bot's own WA number from Baileys
  const [syncingMessages, setSyncingMessages] = useState(false)

  const wsRef = useRef(null)
  const lastWsActivityRef = useRef(Date.now())
  const reconnectTimeoutRef = useRef(null)
  const typingTimersRef = useRef({})

  const fetchBotStatus = async () => {
    try {
      const res = await fetch('/api/whatsapp-governance/status')
      const data = await res.json()
      if (data.activeNumber) setActiveNumber(data.activeNumber)
      else if (data.status !== 'CONNECTED') setActiveNumber(null)
    } catch (_) {}
  }

  // ======================================================================
  // ⚠️ @AI-CRITICAL-ZONE: HIGH FRAGILITY SYSTEM BLOCK
  // CONCURRENCY, PACING, OR SYNC LOGIC HERE.
  // DO NOT REFACTOR OR MODIFY THIS BLOCK WITHOUT EXPLICIT HUMAN APPROVAL.
  // ======================================================================
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

        if (wsEvent === 'message' && data && data.message) {
          const newMsg = data.message
          
          if (currentActive && String(currentActive.phone) === String(newMsg.phone)) {
            setMessages(prev => {
              const idx = prev.findIndex(m => {
                const uuidMatch = (newMsg.clientUuid && (m.id === newMsg.clientUuid || m.clientUuid === newMsg.clientUuid));
                const idMatch = (newMsg.id && (m.id === newMsg.id || String(m.message_id) === String(newMsg.id)));
                const msgIdMatch = (newMsg.message_id && (m.message_id === newMsg.message_id || m.id === newMsg.message_id));
                
                if (uuidMatch || idMatch || msgIdMatch) return true;
  
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
                const updated = [...prev];
                const existing = updated[idx];
                const merged = { ...existing };
                
                Object.keys(newMsg).forEach(key => {
                  const val = newMsg[key];
                  if (val !== null && val !== undefined && val !== '') {
                    merged[key] = val;
                  }
                });
                
                if (existing.media_url && !merged.media_url) merged.media_url = existing.media_url;
                if (existing.media_type && !merged.media_type) merged.media_type = existing.media_type;
                if (existing.message && !merged.message) merged.message = existing.message;
                
                merged.clientUuid = existing.clientUuid || newMsg.clientUuid;
                updated[idx] = merged;
                return updated;
              } else {
                return [...prev, newMsg];
              }
            });
            scrollToBottom();
          }

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

            const exists = updated.some(c => String(c.phone) === String(newMsg.phone))
            if (!exists) {
              fetchChats(true)
            } else {
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
          setMessages(prev => prev.map(m =>
            String(m.id) === String(data.messageId) ? { ...m, transcript: data.transcript, status: data.status, ai_processed: data.ai_processed } : m
          ))
        }

        if (wsEvent === 'ocr_result' && data) {
          setMessages(prev => prev.map(m =>
            String(m.id) === String(data.messageId) ? { ...m, transcript: data.transcript, status: data.msgStatus, ai_processed: data.ai_processed } : m
          ))

          if (data.status === 'matched') {
            addToast(`✅ Payment verified! Rs.${data.detectedAmount} matched — ${data.detectedBank || 'Bank'} TXN ${data.detectedTxnId || 'N/A'}`, 'success')
            
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

  useEffect(() => {
    fetchBotStatus()
    connectWebSocket()

    const statusInterval = setInterval(fetchBotStatus, 10000)

    const pingInterval = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: 'ping' }))
        } catch (e) {}
      }

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
      Object.values(typingTimersRef.current).forEach(clearTimeout)
    }
  }, [])

  return {
    wsStatus,
    setWsStatus,
    connectionStatus: wsStatus, // duplicate alias for compatibility
    activeNumber,
    setActiveNumber,
    syncingMessages,
    setSyncingMessages,
    connectWebSocket
  }
}
