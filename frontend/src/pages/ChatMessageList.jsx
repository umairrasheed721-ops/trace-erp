import React, { useState, useRef, useEffect, useMemo } from 'react'
import ChatAudioPlayer from '../components/ChatAudioPlayer'
import ChatOCRReceipt, { parseOCRReceipt } from '../components/ChatOCRReceipt'
import ChatImageCollage from '../components/ChatImageCollage'

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
      return { backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' }
    case 'Size Issue':
      return { backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.2)' }
    case 'Pricing':
      return { backgroundColor: 'rgba(234, 179, 8, 0.1)', color: '#eab308', border: '1px solid rgba(234, 179, 8, 0.2)' }
    case 'Address Update':
      return { backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)' }
    default:
      return { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }
  }
}



const getMsgTime = (m) => {
  if (!m) return 0
  if (m.timestamp) return m.timestamp * 1000
  if (!m.created_at) return 0
  const parsed = Date.parse(m.created_at)
  if (!isNaN(parsed)) return parsed
  const formatted = String(m.created_at).trim().replace(' ', 'T')
  const parsedFormatted = Date.parse(formatted)
  return isNaN(parsedFormatted) ? 0 : parsedFormatted
}

const copyImageToClipboard = async (imageUrl) => {
  const response = await fetch(imageUrl);
  const blob = await response.blob();
  const objUrl = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      canvas.toBlob((pngBlob) => {
        URL.revokeObjectURL(objUrl);
        if (!pngBlob) return reject(new Error('Blob failed'));
        navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })])
          .then(() => resolve(true)).catch(reject);
      }, 'image/png');
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = objUrl;
  });
};

const copyMultipleImagesToClipboard = async (imageUrls) => {
  try {
    const items = await Promise.all(
      imageUrls.map(async (url) => {
        const response = await fetch(url);
        const blob = await response.blob();
        const objUrl = URL.createObjectURL(blob);
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            canvas.getContext('2d').drawImage(img, 0, 0);
            canvas.toBlob((pngBlob) => {
              URL.revokeObjectURL(objUrl);
              if (pngBlob) resolve(new ClipboardItem({ 'image/png': pngBlob }));
              else reject(new Error('Blob failed'));
            }, 'image/png');
          };
          img.onerror = () => reject(new Error('Image load failed'));
          img.src = objUrl;
        });
      })
    );
    await navigator.clipboard.write(items);
    return { type: 'images', count: items.length };
  } catch (err) {
    const textLinks = imageUrls.join('\n');
    await navigator.clipboard.writeText(textLinks);
    return { type: 'links', count: imageUrls.length };
  }
};

export default function ChatMessageList({
  messages = [],
  activeChat,
  loadingMessages,
  activeNumber,
  typingUsers = {},
  handleQuoteClick,
  getMediaUrlWithToken,
  setZoomedImage,
  timelineEndRef,
  contextMenu: parentContextMenu,
  setContextMenu: parentSetContextMenu
}) {
  const [localContextMenu, setLocalContextMenu] = useState(null)
  const contextMenu = parentContextMenu !== undefined ? parentContextMenu : localContextMenu
  const setContextMenu = parentSetContextMenu !== undefined ? parentSetContextMenu : setLocalContextMenu

  const [reactedMessageId, setReactedMessageId] = useState(null)
  const [showJumpBadge, setShowJumpBadge] = useState(false)
  const timelineRef = useRef(null)

  const [copyStatus, setCopyStatus] = useState({ id: null, text: '' })
  const [lightbox, setLightbox] = useState(null)

  useEffect(() => {
    if (!lightbox) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setLightbox(null)
      } else if (e.key === 'ArrowRight') {
        if (lightbox.currentIndex < lightbox.images.length - 1) {
          setLightbox(prev => ({ ...prev, currentIndex: prev.currentIndex + 1 }))
        }
      } else if (e.key === 'ArrowLeft') {
        if (lightbox.currentIndex > 0) {
          setLightbox(prev => ({ ...prev, currentIndex: prev.currentIndex - 1 }))
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [lightbox])

  const handleCopySingleImage = (url, uniqueId) => {
    setCopyStatus({ id: uniqueId, text: 'Copying...' })
    copyImageToClipboard(url)
      .then(() => {
        setCopyStatus({ id: uniqueId, text: 'Copied!' })
        setTimeout(() => setCopyStatus({ id: null, text: '' }), 2000)
      })
      .catch((err) => {
        console.error('Failed to copy image:', err)
        navigator.clipboard.writeText(url)
          .then(() => {
            setCopyStatus({ id: uniqueId, text: 'Link Copied!' })
            setTimeout(() => setCopyStatus({ id: null, text: '' }), 2000)
          })
          .catch(() => {
            setCopyStatus({ id: uniqueId, text: 'Failed!' })
            setTimeout(() => setCopyStatus({ id: null, text: '' }), 2000)
          })
      })
  }

  const handleCopyMultipleImages = (urls, uniqueId, mode = 'images') => {
    setCopyStatus({ id: uniqueId, text: 'Copying...' })
    if (mode === 'links') {
      const textLinks = urls.join('\n')
      navigator.clipboard.writeText(textLinks)
        .then(() => {
          setCopyStatus({ id: uniqueId, text: 'Links Copied!' })
          setTimeout(() => setCopyStatus({ id: null, text: '' }), 2000)
        })
        .catch(() => {
          setCopyStatus({ id: uniqueId, text: 'Failed!' })
          setTimeout(() => setCopyStatus({ id: null, text: '' }), 2000)
        })
    } else {
      copyMultipleImagesToClipboard(urls)
        .then((result) => {
          if (result.type === 'images') {
            setCopyStatus({ id: uniqueId, text: 'Copied!' })
          } else {
            setCopyStatus({ id: uniqueId, text: 'Links Copied!' })
          }
          setTimeout(() => setCopyStatus({ id: null, text: '' }), 2000)
        })
        .catch(() => {
          setCopyStatus({ id: uniqueId, text: 'Failed!' })
          setTimeout(() => setCopyStatus({ id: null, text: '' }), 2000)
        })
    }
  }

  useEffect(() => {
    const handleClose = () => setContextMenu(null)
    window.addEventListener('click', handleClose)
    window.addEventListener('scroll', handleClose, true)
    return () => {
      window.removeEventListener('click', handleClose)
      window.removeEventListener('scroll', handleClose, true)
    }
  }, [setContextMenu])

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

  const groupedMessages = useMemo(() => {
    const result = []
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      const isPureImage = msg.media_type === 'image' && msg.media_url && (!msg.message || /^\[image\]$/i.test(msg.message.trim()) || msg.message.trim() === '')
      const msgTime = getMsgTime(msg)
      const last = result[result.length - 1]
      if (isPureImage && last) {
        const lastTime = getMsgTime(last.mediaGroup ? last.mediaGroup[last.mediaGroup.length - 1] : last)
        const sameSender = last.direction === msg.direction
        const withinWindow = Math.abs(msgTime - lastTime) <= 60000
        if (sameSender && withinWindow) {
          if (last.mediaGroup) {
            last.mediaGroup.push(msg)
            last.messages = last.mediaGroup
            last.created_at = msg.created_at
            last.timestamp = msg.timestamp
            continue
          } else {
            const lastIsPure = last.media_type === 'image' && last.media_url && (!last.message || /^\[image\]$/i.test(last.message.trim()) || last.message.trim() === '')
            if (lastIsPure) {
              last.mediaGroup = [{ ...last }, msg]
              last.messages = last.mediaGroup
              last.isImageGrid = true
              last.created_at = msg.created_at
              last.timestamp = msg.timestamp
              continue
            }
          }
        }
      }
      result.push({ ...msg })
    }
    return result
  }, [messages])

  const formatTime = (isoString) => {
    if (!isoString) return ''
    const date = new Date(isoString)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const renderMessageContent = (message) => {
    if (message.messageType === 'poll' || (message.message && message.message.includes('Poll:'))) {
      return (
        <div className="tpk-poll-bubble" style={{ background: '#f0f9ff', border: '1px solid #bae6fd', padding: '10px', borderRadius: '8px', color: '#1e293b' }}>
          <strong>📊 Order Verification Poll</strong>
          <p style={{ margin: '5px 0' }}>{message.message.replace('🗳️ Poll: ', '').replace('Poll: ', '')}</p>
          <span style={{ fontSize: '0.8em', color: '#0369a1' }}>Status: Live in WhatsApp</span>
        </div>
      );
    }
    return <span>{message.message || message.text || message.conversation || ''}</span>;
  };

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
      ) : (
        groupedMessages.length === 0 ? (
          <div className="text-center p-12 text-muted italic">No messages logged in this discussion.</div>
        ) : (
          (() => {
            let lastDateString = null
            return groupedMessages.map((msg, index) => {
            const isOutgoing = msg.direction === 'outgoing'
            const showImage = msg.media_type === 'image' && (msg.media_url || (msg.mediaUrls && msg.mediaUrls.length > 0))
            const imageUrls = msg.mediaUrls && Array.isArray(msg.mediaUrls) && msg.mediaUrls.length > 0
              ? msg.mediaUrls
              : (msg.media_url ? [msg.media_url] : [])
            const showAudio = msg.media_type === 'audio' && msg.media_url
            const showDoc = msg.media_type === 'document' && msg.media_url
            const quoteInfo = getQuotedInfo(msg.isImageGrid ? msg.messages[0] : msg)
            
            // Smart bubble grouping calculations
            const prevMsg = index > 0 ? groupedMessages[index - 1] : null
            const nextMsg = index < groupedMessages.length - 1 ? groupedMessages[index + 1] : null

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
            const paymentCardData = (!msg.isImageGrid && msg.ai_processed && msg.media_type === 'image' && msg.transcript)
              ? parseOCRReceipt(msg.transcript)
              : null

            return (
              <React.Fragment key={msg.id || index}>
                {showDateDivider && (
                  <div className="date-divider" style={{ position: 'sticky', top: '10px', zIndex: 10, textAlign: 'center', margin: '16px 0' }}>
                    <span style={{ 
                      background: 'var(--wa-system-pill)', 
                      border: '1px solid var(--wa-border)',
                      color: 'var(--wa-text-muted)', 
                      padding: '4px 12px', 
                      borderRadius: '6px', 
                      fontSize: '0.72rem', 
                      fontWeight: '500',
                      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)',
                      transition: 'all 0.2s ease'
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
                    style={{
                      position: 'relative',
                      maxWidth: '70%',
                      width: 'fit-content',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: isOutgoing ? 'flex-end' : 'flex-start',
                      alignSelf: isOutgoing ? 'flex-end' : 'flex-start'
                    }}
                  >
                    <div 
                      className="wa-bubble"
                      onDoubleClick={() => {
                        setReactedMessageId(msg.id || index)
                        handleQuoteClick(msg.isImageGrid ? msg.messages[0] : msg)
                        setTimeout(() => setReactedMessageId(null), 500)
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        setContextMenu({ x: e.pageX, y: e.pageY, msg })
                      }}
                      style={{ 
                        boxShadow: '0 1px 0.5px rgba(11,20,26,.13)',
                        borderRadius: '12px',
                        backgroundColor: isOutgoing ? '#005c4b' : '#202c33',
                        color: '#e9edef',
                        border: 'none',
                        lineHeight: '19px',
                        fontSize: '14.2px',
                        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                        transform: (reactedMessageId === (msg.id || index)) ? 'scale(1.02)' : 'scale(1)',
                        transition: 'all 0.2s ease',
                        marginTop: 0,
                        marginBottom: 0,
                        width: 'fit-content',
                        maxWidth: '100%',
                        minWidth: 0,
                        wordBreak: 'break-word',
                        overflowWrap: 'break-word',
                        whiteSpace: 'pre-wrap',
                        padding: '6px 7px 8px 9px'
                      }}
                    >
                    {/* Rendering Quoted block inside bubble */}
                    {quoteInfo && (
                      <div 
                        className="wa-bubble-quote-block"
                        style={{
                          maxWidth: '100%',
                          minWidth: 0,
                          overflow: 'hidden',
                          display: 'flex',
                          flexDirection: 'column',
                          backgroundColor: 'rgba(0, 0, 0, 0.15)',
                          borderLeft: isOutgoing ? '4px solid #10b981' : '4px solid #3b82f6',
                          borderRadius: '4px',
                          padding: '6px 8px',
                          marginBottom: '6px'
                        }}
                      >
                        <span className="wa-bubble-quote-sender">
                          {getQuoteSenderDisplayName(quoteInfo.participant, activeNumber)}
                        </span>
                        <span 
                          className="wa-bubble-quote-text"
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                        >
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
                    {!showDoc && !msg.isImageGrid && renderMessageContent(msg)}

                    {/* Rendering attachment media grid / mediaGroup collage */}
                    {msg.mediaGroup && msg.mediaGroup.length > 1 && (
                      <ChatImageCollage
                        msg={msg}
                        items={msg.mediaGroup.map((m, idx) => ({
                          id: m.id || `${msg.id}-${idx}`,
                          url: m.media_url || (m.mediaUrls && m.mediaUrls[0]),
                          rawItem: m
                        }))}
                        copyId="group-"
                        getMediaUrlWithToken={getMediaUrlWithToken}
                        setLightbox={setLightbox}
                        handleCopySingleImage={handleCopySingleImage}
                        handleCopyMultipleImages={handleCopyMultipleImages}
                        copyStatus={copyStatus}
                      />
                    )}

                    {/* Rendering Attachment Media types */}
                    {showImage && !msg.isImageGrid && (
                      <div>
                        {imageUrls.length > 1 ? (
                          <ChatImageCollage
                            msg={msg}
                            items={imageUrls.map((url, idx) => ({
                              id: `${msg.id}-url-${idx}`,
                              url: url,
                              rawItem: { media_url: url }
                            }))}
                            copyId="group-url-"
                            getMediaUrlWithToken={getMediaUrlWithToken}
                            setLightbox={setLightbox}
                            handleCopySingleImage={handleCopySingleImage}
                            handleCopyMultipleImages={handleCopyMultipleImages}
                            copyStatus={copyStatus}
                          />
                        ) : (
                          <div className="wa-collage-cell" style={{ position: 'relative', width: 'fit-content', overflow: 'hidden', borderRadius: '8px' }}>
                            <img 
                              src={getMediaUrlWithToken(msg.media_url || imageUrls[0])} 
                              alt="Sent media" 
                              className="wa-media-image"
                              style={{ maxWidth: '300px', display: 'block', objectFit: 'cover', transition: 'transform 0.2s ease', cursor: 'zoom-in' }}
                              onClick={() => {
                                const url = getMediaUrlWithToken(msg.media_url || imageUrls[0]);
                                setLightbox({ images: [url], currentIndex: 0 });
                              }}
                            />
                            <button 
                              type="button"
                              className="wa-collage-copy-btn" 
                              title="Copy Image"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopySingleImage(getMediaUrlWithToken(msg.media_url || imageUrls[0]), `${msg.id}-single`);
                              }}
                            >
                              📋
                            </button>
                            {copyStatus.id === `${msg.id}-single` && (
                              <div className="wa-copy-feedback-overlay">
                                {copyStatus.text}
                              </div>
                            )}
                          </div>
                        )}
                        {/* Module 7: AI Payment Card rendering */}
                        <ChatOCRReceipt msg={msg} isOverlay={false} />
                      </div>
                    )}

                    {showAudio && (
                      <div>
                        <ChatAudioPlayer src={getMediaUrlWithToken(msg.media_url)} />
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

                    {!isGroupedWithNext && (
                      <span 
                        className="wa-bubble-time"
                        style={{
                          color: 'rgba(255,255,255,0.6)',
                          fontSize: '11px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          float: 'right',
                          marginTop: '4px',
                          marginLeft: '8px'
                        }}
                      >
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
                </div>
              </React.Fragment>
            )
          })
          })()
        )
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
            position: 'absolute',
            bottom: '20px',
            right: '20px',
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

      {/* Lightbox Carousel Overlay */}
      {lightbox && (
        <div className="wa-lightbox-overlay" onClick={() => setLightbox(null)}>
          <button type="button" className="wa-lightbox-close-btn" onClick={() => setLightbox(null)}>
            ✕
          </button>
          
          {lightbox.images.length > 1 && (
            <button 
              type="button"
              className="wa-lightbox-arrow-btn prev" 
              onClick={(e) => {
                e.stopPropagation();
                setLightbox(prev => ({ ...prev, currentIndex: Math.max(0, prev.currentIndex - 1) }));
              }}
              disabled={lightbox.currentIndex === 0}
            >
              ‹
            </button>
          )}

          <div className="wa-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img 
              src={lightbox.images[lightbox.currentIndex]} 
              alt={`Zoomed view ${lightbox.currentIndex + 1}`} 
              className="wa-lightbox-img" 
            />
            {lightbox.images.length > 1 && (
              <div className="wa-lightbox-info-overlay">
                Image {lightbox.currentIndex + 1} of {lightbox.images.length}
              </div>
            )}
          </div>

          {lightbox.images.length > 1 && (
            <button 
              type="button"
              className="wa-lightbox-arrow-btn next" 
              onClick={(e) => {
                e.stopPropagation();
                setLightbox(prev => ({ ...prev, currentIndex: Math.min(prev.images.length - 1, prev.currentIndex + 1) }));
              }}
              disabled={lightbox.currentIndex === lightbox.images.length - 1}
            >
              ›
            </button>
          )}
        </div>
      )}
    </div>
  )
}
