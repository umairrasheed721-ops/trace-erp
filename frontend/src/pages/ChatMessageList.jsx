import React, { useState, useRef, useEffect } from 'react'

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

const getIntentBadgeColors = (tag) => {
  switch (tag) {
    case 'Urgent':
      return { backgroundColor: '#FEE2E2', color: '#991B1B' }
    case 'Size Issue':
      return { backgroundColor: '#E0E7FF', color: '#3730A3' }
    case 'Pricing':
      return { backgroundColor: '#FEF3C7', color: '#92400E' }
    case 'Address Update':
      return { backgroundColor: '#D1FAE5', color: '#065F46' }
    default:
      return { backgroundColor: '#F3F4F6', color: '#374151' }
  }
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

export default function ChatMessageList({
  messages = [],
  activeChat,
  loadingMessages,
  activeNumber,
  typingUsers = {},
  handleQuoteClick,
  getMediaUrlWithToken,
  setZoomedImage,
  timelineEndRef
}) {
  const [contextMenu, setContextMenu] = useState(null)
  const [reactedMessageId, setReactedMessageId] = useState(null)
  const [showJumpBadge, setShowJumpBadge] = useState(false)
  const timelineRef = useRef(null)

  useEffect(() => {
    const handleClose = () => setContextMenu(null)
    window.addEventListener('click', handleClose)
    window.addEventListener('scroll', handleClose, true)
    return () => {
      window.removeEventListener('click', handleClose)
      window.removeEventListener('scroll', handleClose, true)
    }
  }, [])

  useEffect(() => {
    const el = timelineRef.current
    if (!el) return
    const handleScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      setShowJumpBadge(distanceFromBottom > 150)
    }
    el.addEventListener('scroll', handleScroll)
    // Initial check
    handleScroll()
    return () => el.removeEventListener('scroll', handleScroll)
  }, [messages])

  const formatTime = (isoString) => {
    if (!isoString) return ''
    const date = new Date(isoString)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const jumpToBottom = () => {
    timelineEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div
      ref={timelineRef}
      className="wa-portal-chat-timeline"
      style={{ position: 'relative' }}
    >
      <style>{`
        .wa-bubble-wrapper:hover .hover-actions {
          opacity: 1 !important;
        }
        @keyframes jumpBounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        .jump-present-badge {
          animation: jumpBounce 2s infinite ease-in-out;
        }
        .media-grid-wrapper {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 4px;
          margin-top: 4px;
        }
        .media-grid-image {
          width: 100%;
          height: 120px;
          object-fit: cover;
          border-radius: 8px;
          cursor: pointer;
          transition: transform 0.2s ease;
        }
        .media-grid-image:hover {
          transform: scale(1.02);
        }
      `}</style>

      {loadingMessages ? (
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className={`skeleton skeleton-bubble ${i % 2 === 0 ? '' : 'outgoing'}`} style={{ width: `${40 + (i % 3) * 15}%` }} />
          ))}
        </div>
      ) : messages.length === 0 ? (
        <div className="text-center p-12 text-muted italic">No messages logged in this discussion.</div>
      ) : (
        (() => {
          // Preprocess messages to group consecutive pure image messages from the same sender within 1 minute
          const processedMessages = []
          for (let i = 0; i < messages.length; i++) {
            const msg = messages[i]
            const isPureImage = msg.media_type === 'image' && msg.media_url && (!msg.message || msg.message === '[Image]' || msg.message.trim() === '')
            
            const getMsgTime = (m) => {
              if (!m) return 0
              return m.timestamp ? m.timestamp * 1000 : (m.created_at ? new Date(m.created_at).getTime() : 0)
            }
            
            const msgTime = getMsgTime(msg)
            const lastProcessed = processedMessages[processedMessages.length - 1]
            
            if (isPureImage && lastProcessed) {
              const lastTime = getMsgTime(lastProcessed.isImageGrid ? lastProcessed.messages[lastProcessed.messages.length - 1] : lastProcessed)
              const sameSender = lastProcessed.direction === msg.direction
              const withinOneMinute = Math.abs(msgTime - lastTime) <= 60000
              
              if (sameSender && withinOneMinute) {
                if (lastProcessed.isImageGrid) {
                  lastProcessed.messages.push(msg)
                  // Update grid block timing metadata
                  lastProcessed.created_at = msg.created_at
                  lastProcessed.timestamp = msg.timestamp
                  continue
                } else {
                  const lastIsPureImage = lastProcessed.media_type === 'image' && lastProcessed.media_url && (!lastProcessed.message || lastProcessed.message === '[Image]' || lastProcessed.message.trim() === '')
                  if (lastIsPureImage) {
                    // Convert last message to a grid
                    processedMessages[processedMessages.length - 1] = {
                      isImageGrid: true,
                      id: lastProcessed.id + '-grid',
                      direction: lastProcessed.direction,
                      created_at: msg.created_at,
                      timestamp: msg.timestamp,
                      messages: [lastProcessed, msg],
                      status: msg.status
                    }
                    continue
                  }
                }
              }
            }
            processedMessages.push(msg)
          }

          let lastDateString = null
          return processedMessages.map((msg, index) => {
            const isOutgoing = msg.direction === 'outgoing'
            const showImage = msg.media_type === 'image' && msg.media_url
            const showAudio = msg.media_type === 'audio' && msg.media_url
            const showDoc = msg.media_type === 'document' && msg.media_url
            const quoteInfo = getQuotedInfo(msg.isImageGrid ? msg.messages[0] : msg)
            
            // Smart bubble grouping calculations
            const prevMsg = index > 0 ? processedMessages[index - 1] : null
            const nextMsg = index < processedMessages.length - 1 ? processedMessages[index + 1] : null

            const getMsgTime = (m) => {
              if (!m) return 0
              return m.timestamp ? m.timestamp * 1000 : (m.created_at ? new Date(m.created_at).getTime() : 0)
            }

            const msgTime = getMsgTime(msg)
            const prevMsgTime = getMsgTime(prevMsg)
            const nextMsgTime = getMsgTime(nextMsg)

            const isGroupedWithPrev = prevMsg && prevMsg.direction === msg.direction && Math.abs(msgTime - prevMsgTime) <= 60000
            const isGroupedWithNext = nextMsg && nextMsg.direction === msg.direction && Math.abs(nextMsgTime - msgTime) <= 60000

            let borderRadius = '16px'
            if (isOutgoing) {
              if (isGroupedWithPrev && isGroupedWithNext) {
                borderRadius = '16px 4px 4px 16px'
              } else if (isGroupedWithPrev) {
                borderRadius = '16px 4px 16px 16px'
              } else if (isGroupedWithNext) {
                borderRadius = '16px 16px 4px 16px'
              } else {
                borderRadius = '16px 16px 2px 16px'
              }
            } else {
              if (isGroupedWithPrev && isGroupedWithNext) {
                borderRadius = '4px 16px 16px 4px'
              } else if (isGroupedWithPrev) {
                borderRadius = '4px 16px 16px 16px'
              } else if (isGroupedWithNext) {
                borderRadius = '16px 16px 16px 4px'
              } else {
                borderRadius = '2px 16px 16px 16px'
              }
            }

            // Convert UNIX timestamps safely to the local browser timezone
            const calculatedDate = msg.timestamp 
              ? new Date(msg.timestamp * 1000).toLocaleDateString()
              : (msg.created_at ? new Date(msg.created_at).toLocaleDateString() : new Date().toLocaleDateString())

            let showDateDivider = false
            if (calculatedDate !== lastDateString) {
              showDateDivider = true
              lastDateString = calculatedDate
            }

            // Parse AI payment card data from transcript (for single images)
            let paymentCardData = null
            if (!msg.isImageGrid && msg.ai_processed && msg.media_type === 'image' && msg.transcript) {
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
              <React.Fragment key={msg.id || index}>
                {showDateDivider && (
                  <div className="date-divider" style={{ position: 'sticky', top: '10px', zIndex: 10, textAlign: 'center', margin: '15px 0' }}>
                    <span style={{ 
                      background: 'rgba(30, 30, 36, 0.75)', 
                      backdropFilter: 'blur(8px)', 
                      WebkitBackdropFilter: 'blur(8px)',
                      color: '#fff', 
                      padding: '6px 16px', 
                      borderRadius: '16px', 
                      fontSize: '12px', 
                      fontWeight: '500',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.12)',
                      border: '1px solid rgba(255, 255, 255, 0.08)'
                    }}>
                      {calculatedDate}
                    </span>
                  </div>
                )}
                
                <div 
                  className="wa-bubble-wrapper"
                  style={{
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isOutgoing ? 'flex-end' : 'flex-start',
                    width: '100%',
                    margin: isGroupedWithPrev ? '2px 0' : '8px 0'
                  }}
                >
                  <div 
                    className={`wa-bubble ${isOutgoing ? 'outgoing' : 'incoming'}`}
                    onDoubleClick={() => {
                      setReactedMessageId(msg.id || index)
                      console.log('Double tap to react prep:', msg.id || index)
                      setTimeout(() => setReactedMessageId(null), 500)
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      const representativeMsg = msg.isImageGrid ? msg.messages[0] : msg
                      if (timelineRef.current) {
                        const rect = timelineRef.current.getBoundingClientRect()
                        const x = e.pageX - rect.left - window.scrollX
                        const y = e.pageY - rect.top - window.scrollY
                        setContextMenu({ x, y, msg: representativeMsg })
                      } else {
                        setContextMenu({ x: e.pageX, y: e.pageY, msg: representativeMsg })
                      }
                    }}
                    style={{ 
                      boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
                      borderRadius: borderRadius,
                      transform: (reactedMessageId === (msg.id || index)) ? 'scale(1.06)' : 'scale(1)',
                      transition: 'transform 0.15s ease',
                      marginTop: 0,
                      marginBottom: 0
                    }}
                  >
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

                    {/* Rendering AI Intent Badge */}
                    {(!isOutgoing && (msg.intent_tag || msg.intent) && (msg.intent_tag || msg.intent) !== 'General') && (
                      <div style={{ display: 'block', marginBottom: '4px' }}>
                        <span 
                          className="ai-intent-badge" 
                          style={{ 
                            fontSize: '0.65rem', 
                            padding: '2px 6px', 
                            borderRadius: '4px', 
                            display: 'inline-block', 
                            fontWeight: 'bold',
                            ...getIntentBadgeColors(msg.intent_tag || msg.intent)
                          }}
                        >
                          {msg.intent_tag || msg.intent}
                        </span>
                      </div>
                    )}

                    {/* Rendering Message Content */}
                    {!showDoc && !msg.isImageGrid && <span>{msg.message}</span>}

                    {/* Rendering attachment media grid */}
                    {msg.isImageGrid && (
                      <div className="media-grid-wrapper">
                        {msg.messages.map((imgMsg, idx) => (
                          <div key={imgMsg.id || idx} style={{ position: 'relative' }}>
                            <img 
                              src={getMediaUrlWithToken(imgMsg.media_url)} 
                              alt="Sent media grid" 
                              className="media-grid-image"
                              onClick={() => setZoomedImage(getMediaUrlWithToken(imgMsg.media_url))}
                            />
                            {/* Parse OCR transcript for payment receipt inside grid items */}
                            {(() => {
                              let cardData = null
                              if (imgMsg.ai_processed && imgMsg.transcript) {
                                const amountMatch = imgMsg.transcript.match(/Rs\.?\s*([\d,]+(?:\.\d{1,2})?)/i)
                                const txnMatch = imgMsg.transcript.match(/TXN[:\s]?([A-Z0-9]+)/i)
                                const bankMatch = imgMsg.transcript.match(/Bank[:\s]?([\w\s]+?)(?:\s|,|\.|$)/i)
                                const statusMatch = imgMsg.transcript.match(/status[:\s]?(matched|mismatch|manual_review|verified)/i)
                                if (amountMatch) {
                                  cardData = {
                                    amount: amountMatch[1],
                                    txnId: txnMatch?.[1] || null,
                                    bank: bankMatch?.[1]?.trim() || null,
                                    status: statusMatch?.[1]?.toLowerCase() || 'reviewing',
                                  }
                                }
                              }
                              if (cardData) {
                                return (
                                  <div className="wa-ai-payment-card" style={{ marginTop: 4, padding: 6 }}>
                                    <div className="wa-ai-payment-card-header" style={{ fontSize: '0.68rem' }}>
                                      <span>💳 Receipt</span>
                                    </div>
                                    <div className="wa-ai-payment-card-amount" style={{ fontSize: '0.9rem' }}>Rs. {cardData.amount}</div>
                                  </div>
                                )
                              } else if (imgMsg.transcript) {
                                return (
                                  <div className="wa-bubble-transcript" style={{ marginTop: 4, padding: '4px', background: 'rgba(0,0,0,0.03)', borderRadius: '4px' }}>
                                    <span style={{ fontSize: '0.65rem', opacity: 0.7, display: 'block' }}>🔍 OCR:</span>
                                    <span className="wa-transcript-text" style={{ fontSize: '0.7rem', display: 'block', maxHeight: '40px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{imgMsg.transcript}</span>
                                  </div>
                                )
                              }
                              return null
                            })()}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Rendering Attachment Media types */}
                    {showImage && !msg.isImageGrid && (
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
                        <CustomAudioPlayer src={getMediaUrlWithToken(msg.media_url)} />
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

                    {/* Show time ONLY on the last message of that specific block */}
                    {!isGroupedWithNext && (
                      <span className="wa-bubble-time">
                        {formatTime(msg.created_at)}
                        {isOutgoing && (
                          <span style={{ marginLeft: 4 }}>
                            {msg.status === 'pending' || msg.status === 'sending' ? '⏳' : '✓'}
                          </span>
                        )}
                      </span>
                    )}
                  </div>

                  {/* Hover Action Bar */}
                  <div 
                    className="hover-actions"
                    style={{
                      position: 'absolute',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      [isOutgoing ? 'left' : 'right']: '-62px',
                      display: 'flex',
                      gap: '4px',
                      opacity: 0,
                      transition: 'opacity 0.2s ease',
                      zIndex: 10
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleQuoteClick(msg.isImageGrid ? msg.messages[0] : msg)}
                      style={{
                        background: '#fff',
                        border: '1px solid rgba(0,0,0,0.1)',
                        borderRadius: '50%',
                        width: '26px',
                        height: '26px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
                        fontSize: '11px'
                      }}
                      title="Reply"
                    >
                      ↩️
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const repMsg = msg.isImageGrid ? msg.messages[0] : msg
                        const textToCopy = repMsg.message || repMsg.text || ''
                        navigator.clipboard.writeText(textToCopy).catch(err => console.error('Failed to copy text:', err))
                      }}
                      style={{
                        background: '#fff',
                        border: '1px solid rgba(0,0,0,0.1)',
                        borderRadius: '50%',
                        width: '26px',
                        height: '26px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
                        fontSize: '11px'
                      }}
                      title="Copy Text"
                    >
                      📋
                    </button>
                  </div>
                </div>
              </React.Fragment>
            )
          })
        })()
      )}

      {/* Typing Indicator */}
      {activeChat && typingUsers && typingUsers[activeChat.phone] && (
        <div className="typing-indicator" style={{ padding: '10px', color: '#888', fontStyle: 'italic', fontSize: '13px' }}>
          💬 typing...
        </div>
      )}
      
      <div ref={timelineEndRef} />

      {/* JUMP TO PRESENT BADGE */}
      {showJumpBadge && (
        <button
          type="button"
          onClick={jumpToBottom}
          className="jump-present-badge"
          style={{
            position: 'sticky',
            bottom: '15px',
            left: '100%',
            transform: 'translateX(-60px)',
            zIndex: 99,
            width: '42px',
            height: '42px',
            borderRadius: '50%',
            backgroundColor: '#ffffff',
            border: '1px solid rgba(0,0,0,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
            fontSize: '18px',
            lineHeight: 1,
            outline: 'none',
          }}
        >
          ⬇️
        </button>
      )}

      {contextMenu && (
        <div
          style={{
            position: 'absolute',
            top: `${contextMenu.y}px`,
            left: `${contextMenu.x}px`,
            zIndex: 50,
            backgroundColor: '#fff',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            borderRadius: '8px',
            padding: '6px 0',
            minWidth: '140px',
            border: '1px solid rgba(0,0,0,0.08)',
            display: 'flex',
            flexDirection: 'column'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              handleQuoteClick(contextMenu.msg)
              setContextMenu(null)
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              border: 'none',
              background: 'none',
              width: '100%',
              textAlign: 'left',
              cursor: 'pointer',
              fontSize: '13px',
              color: '#374151',
              transition: 'background 0.15s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <span>↩️</span>
            <strong>Reply</strong>
          </button>
          <button
            type="button"
            onClick={() => {
              const textToCopy = contextMenu.msg.message || contextMenu.msg.text || ''
              navigator.clipboard.writeText(textToCopy).catch(err => console.error('Failed to copy text:', err))
              setContextMenu(null)
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              border: 'none',
              background: 'none',
              width: '100%',
              textAlign: 'left',
              cursor: 'pointer',
              fontSize: '13px',
              color: '#374151',
              transition: 'background 0.15s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <span>📋</span>
            <strong>Copy Text</strong>
          </button>
        </div>
      )}
    </div>
  )
}
