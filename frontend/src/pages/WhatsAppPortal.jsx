import React, { useEffect, useState } from 'react'
import useWhatsAppPortal from '../hooks/useWhatsAppPortal'
import ChatContactSidebar from '../components/WhatsAppPortal/ChatContactSidebar'
import ChatMessageList from './ChatMessageList'
import ChatInputArea from './ChatInputArea'
import MediaUploadOverlay from '../components/MediaUploadOverlay'
import SettingsModal from '../components/SettingsModal'
import { useApp } from '../context/AppContext'

export default function WhatsAppPortal() {
  const { setSidebarCollapsed } = useApp()
  const [settings, setSettings] = useState(null)

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const token = localStorage.getItem('trace_token') || '';
        const res = await fetch('/api/whatsapp-governance/settings', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        setSettings(data);
      } catch (err) {
        console.error('Error fetching settings on portal:', err);
      }
    };
    fetchSettings();
    const handleSettingsUpdate = () => fetchSettings();
    window.addEventListener('whatsapp_settings_updated', handleSettingsUpdate);
    return () => window.removeEventListener('whatsapp_settings_updated', handleSettingsUpdate);
  }, []);

  useEffect(() => {
    const originalCollapsed = localStorage.getItem('sidebar_collapsed') === 'true'
    setSidebarCollapsed(true)
    return () => setSidebarCollapsed(originalCollapsed)
  }, [setSidebarCollapsed])

  const {
    chats, activeChat, selectChat, wsStatus, activeNumber,
    searchText, setSearchText, activeFilter, setActiveFilter,
    loadingChats, typingStatus, setShowCmdPalette, setShowSettings,
    isDragging, uploading, handleMediaUpload, syncingMessages,
    humanHandoffActive, setHumanHandoffActive, messages, loadingMessages,
    handleQuoteClick, getMediaUrlWithToken, setZoomedImage,
    timelineEndRef, contextMenu, setContextMenu, activeQuote, clearQuote,
    quickPills, sendingReply, handleSendMessage, inputText, updateInputText,
    isRecording, recordingTime, handleDiscardRecording, handleVoiceNote,
    showQuickReplies, setShowQuickReplies, quickReplies, handleSendQuickReply,
    showSlashMenu, setShowSlashMenu, SLASH_COMMANDS, slashCmd, setSlashCmd,
    inputRef, customerInfo, handleTriggerCODVerification,
    showCustomer360, setShowCustomer360, handleSendInvoice,
    zoomedImage, showCmdPalette, cmdPaletteInputRef, cmdQuery, setCmdQuery,
    setCmdActiveIdx, filteredCmdItems, cmdActiveIdx, cmdSections,
    showSettings, handleDragEnter, handleDragLeave, handleDragOver, handleDrop,
    handleCallHandoff
  } = useWhatsAppPortal()

  const ltvTotal = customerInfo.orderHistory?.reduce((sum, o) => sum + Number(o.total_price || 0), 0) || 0

  return (
    <div className="page-container p-6">
      <style>{`
        @keyframes rightPanelShimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .right-panel-shimmer {
          background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.09) 50%, rgba(255,255,255,0.04) 75%);
          background-size: 200% 100%;
          animation: rightPanelShimmer 1.5s infinite;
        }
        @keyframes lockPulse {
          0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.3); }
          70% { transform: scale(1.04); box-shadow: 0 0 0 14px rgba(16, 185, 129, 0); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
        .lock-pulse-icon { animation: lockPulse 2.5s infinite ease-in-out; }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .wa-header-action-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 13px;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          border: 1px solid transparent;
          text-decoration: none;
          white-space: nowrap;
          letter-spacing: 0.01em;
        }
        .wa-header-action-btn:hover { transform: translateY(-1px); filter: brightness(1.1); }
        .wa-header-action-btn:active { transform: translateY(0); }
        .wa-c360-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px;
          padding: 14px 16px;
          transition: all 0.2s ease;
        }
        .wa-c360-card:hover { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.12); }
        .wa-c360-label {
          font-size: 0.68rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: rgba(255,255,255,0.35);
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .wa-c360-action-btn {
          width: 100%;
          padding: 9px 12px;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.8);
          font-size: 0.8rem;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          transition: all 0.2s ease;
        }
        .wa-c360-action-btn:hover {
          background: rgba(255,255,255,0.1);
          border-color: rgba(255,255,255,0.2);
          color: #fff;
          transform: translateY(-1px);
        }
        .wa-c360-action-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
          transform: none;
        }
        .wa-handoff-banner-v2 {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 18px;
          font-size: 0.82rem;
          font-weight: 600;
          border-bottom: 1px solid;
          animation: fadeInUp 0.3s ease;
        }
        .wa-handoff-banner-v2.agent {
          background: rgba(16, 185, 129, 0.08);
          border-color: rgba(16, 185, 129, 0.25);
          color: #10b981;
        }
        .wa-handoff-banner-v2.ephemeral {
          background: rgba(249, 115, 22, 0.08);
          border-color: rgba(249, 115, 22, 0.25);
          color: #f97316;
        }
        .wa-handoff-banner-v2 .resume-btn {
          margin-left: auto;
          padding: 4px 12px;
          border-radius: 6px;
          border: 1px solid currentColor;
          background: transparent;
          color: currentColor;
          font-size: 0.72rem;
          font-weight: 700;
          cursor: pointer;
          opacity: 0.8;
          transition: opacity 0.2s;
        }
        .wa-handoff-banner-v2 .resume-btn:hover { opacity: 1; }
        @keyframes ping {
          75%, 100% { transform: scale(2); opacity: 0; }
        }
      `}</style>

      <div className="wa-portal-container" style={{
        backgroundColor: 'var(--wa-panel-bg)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '14px',
        overflow: 'hidden',
        boxShadow: '0 24px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04) inset'
      }}>

        {/* LEFT: CONVERSATIONS */}
        <ChatContactSidebar
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

        {/* CENTER: CHAT AREA */}
        <div
          className="wa-portal-center"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          style={{ position: 'relative', backgroundColor: 'var(--wa-chat-bg)' }}
        >
          {activeChat ? (
            <div className="wa-portal-main" style={{ display: 'flex', flexDirection: 'row', flex: 1, minWidth: 0, height: '100%', overflow: 'hidden' }}>
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, height: '100%', position: 'relative' }}>

                <MediaUploadOverlay
                  isDragging={isDragging}
                  uploading={uploading}
                  onUpload={(file) => handleMediaUpload(file)}
                />

                {/* ── PREMIUM CHAT HEADER ── */}
                <div className="wa-portal-chat-header" style={{
                  backgroundColor: 'rgba(255,255,255,0.03)',
                  backdropFilter: 'blur(12px)',
                  borderBottom: '1px solid rgba(255,255,255,0.07)',
                  padding: '12px 18px'
                }}>
                  <div className="wa-portal-chat-header-info">
                    {/* Avatar */}
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%',
                      background: 'linear-gradient(135deg, #25d366 0%, #128c7e 100%)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 800, fontSize: '0.95rem', color: '#fff', flexShrink: 0,
                      boxShadow: '0 0 0 2px rgba(37,211,102,0.25)'
                    }}>
                      {activeChat.customerName ? activeChat.customerName.substring(0, 2).toUpperCase() : 'WA'}
                    </div>
                    <div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--wa-text-primary)', lineHeight: 1.2 }}>
                        {activeChat.customerName || `+${activeChat.phone}`}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: typingStatus[activeChat.phone] ? '#25d366' : 'rgba(255,255,255,0.4)', fontWeight: typingStatus[activeChat.phone] ? 600 : 400, marginTop: 2 }}>
                        {typingStatus[activeChat.phone] ? '✦ typing...' : `+${activeChat.phone}`}
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <a
                      href={`whatsapp://send?phone=${activeChat.phone}`}
                      onClick={handleCallHandoff}
                      className="wa-header-action-btn"
                      title="Open native WhatsApp to call"
                      style={{ background: 'rgba(37,211,102,0.12)', borderColor: 'rgba(37,211,102,0.3)', color: '#25d366' }}
                    >
                      📞 Call
                    </a>
                    <button
                      className="wa-header-action-btn"
                      onClick={handleTriggerCODVerification}
                      disabled={!customerInfo.latestOrder}
                      title="Send COD Verification"
                      style={{ background: 'rgba(168,85,247,0.1)', borderColor: 'rgba(168,85,247,0.3)', color: '#c084fc' }}
                    >
                      🔐 COD Verify
                    </button>
                    <button
                      className="wa-header-action-btn"
                      onClick={handleSendInvoice}
                      disabled={!customerInfo.latestOrder}
                      title="Send PDF Invoice"
                      style={{ background: 'rgba(59,130,246,0.1)', borderColor: 'rgba(59,130,246,0.3)', color: '#60a5fa' }}
                    >
                      📄 Invoice
                    </button>
                    <button
                      className="wa-header-action-btn"
                      onClick={() => setShowCustomer360(prev => !prev)}
                      title="Toggle Customer 360"
                      style={{
                        background: showCustomer360 ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.06)',
                        borderColor: showCustomer360 ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.12)',
                        color: showCustomer360 ? '#34d399' : 'rgba(255,255,255,0.6)',
                      }}
                    >
                      👤 {showCustomer360 ? 'Hide Info' : 'Customer'}
                    </button>
                    <button
                      onClick={() => selectChat(activeChat)}
                      className="wa-header-action-btn"
                      title="Reload chat timeline"
                      style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.5)' }}
                    >
                      🔄
                    </button>
                  </div>
                </div>

                {/* Sync Progress Bar */}
                {syncingMessages && (
                  <div className="wa-sync-progress">
                    <div className="wa-sync-progress-bar" />
                  </div>
                )}

                {/* Human Handoff Banner */}
                {humanHandoffActive && (
                  <div className="wa-handoff-banner-v2 agent">
                    <span>🧑‍💼</span>
                    <span>Human Agent Mode — Bot is paused for this conversation</span>
                    <button className="resume-btn" onClick={() => setHumanHandoffActive(false)}>Resume Bot</button>
                  </div>
                )}

                {/* Ephemeral Mode Banner */}
                {settings && settings.ephemeral_mode === 1 && (
                  <div className="wa-handoff-banner-v2 ephemeral">
                    <span>🛡️</span>
                    <span>Stateless Ephemeral Mode — Logs, voice notes & media are not persisted</span>
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
                  customerInfo={customerInfo}
                  handleTriggerCODVerification={handleTriggerCODVerification}
                />
              </div>

              {/* ── CUSTOMER 360 RIGHT PANEL ── */}
              {showCustomer360 && (
                <div style={{
                  width: 300,
                  borderLeft: '1px solid rgba(255,255,255,0.07)',
                  background: 'rgba(255,255,255,0.015)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  padding: '16px 12px',
                  overflowY: 'auto',
                  backdropFilter: 'blur(8px)'
                }}>
                  {/* Profile Card */}
                  <div style={{ textAlign: 'center', paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                    <div style={{
                      width: 64, height: 64, borderRadius: '50%',
                      background: 'linear-gradient(135deg, #25d366 0%, #128c7e 100%)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 800, fontSize: '1.5rem', color: '#fff',
                      margin: '0 auto 10px auto',
                      boxShadow: '0 0 0 3px rgba(37,211,102,0.2), 0 8px 24px rgba(37,211,102,0.15)'
                    }}>
                      {activeChat.customerName ? activeChat.customerName.substring(0, 2).toUpperCase() : 'WA'}
                    </div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--wa-text-primary)', marginBottom: 3 }}>
                      {activeChat.customerName || 'WhatsApp Customer'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>
                      +{activeChat.phone}
                    </div>
                  </div>

                  {/* LTV Card */}
                  <div className="wa-c360-card">
                    <div className="wa-c360-label">💳 Customer LTV</div>
                    {loadingMessages ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div className="right-panel-shimmer" style={{ height: 24, borderRadius: 6 }} />
                        <div className="right-panel-shimmer" style={{ height: 12, width: '60%', borderRadius: 4 }} />
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#34d399', letterSpacing: '-0.02em', lineHeight: 1 }}>
                          Rs. {ltvTotal.toLocaleString()}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
                          across {customerInfo.orderHistory?.length || 0} orders
                        </div>
                      </>
                    )}
                  </div>

                  {/* Order Status Card */}
                  <div className="wa-c360-card">
                    <div className="wa-c360-label">📦 Latest Order</div>
                    {loadingMessages ? (
                      <div className="right-panel-shimmer" style={{ height: 20, borderRadius: 4 }} />
                    ) : customerInfo.latestOrder ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
                          Order #{customerInfo.latestOrder.id}
                        </div>
                        <div>
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: 20,
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            background: customerInfo.latestOrder.cod_verified ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                            color: customerInfo.latestOrder.cod_verified ? '#10b981' : '#f59e0b',
                            border: `1px solid ${customerInfo.latestOrder.cod_verified ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`
                          }}>
                            {customerInfo.latestOrder.cod_verified ? '🔐 COD Verified' : '⏳ COD Pending'}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>No active orders found.</div>
                    )}
                  </div>

                  {/* Quick Actions */}
                  <div className="wa-c360-card">
                    <div className="wa-c360-label">⚡ Quick Actions</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <button
                        className="wa-c360-action-btn"
                        onClick={handleSendInvoice}
                        disabled={!customerInfo.latestOrder}
                      >
                        📄 Send PDF Invoice
                      </button>
                      <button
                        className="wa-c360-action-btn"
                        onClick={handleTriggerCODVerification}
                        disabled={!customerInfo.latestOrder}
                        style={{ borderColor: 'rgba(168,85,247,0.2)', color: '#c084fc' }}
                      >
                        🔐 COD Verification
                      </button>
                      <button
                        className="wa-c360-action-btn"
                        onClick={() => selectChat(activeChat)}
                      >
                        🔄 Sync Timeline
                      </button>
                    </div>
                  </div>

                  {/* AI Memory */}
                  <div className="wa-c360-card">
                    <div className="wa-c360-label">🧠 Gemini Memory</div>
                    {loadingMessages ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {[100, 85, 50].map((w, i) => (
                          <div key={i} className="right-panel-shimmer" style={{ height: 11, width: `${w}%`, borderRadius: 3 }} />
                        ))}
                      </div>
                    ) : customerInfo.geminiMemory ? (
                      <div style={{
                        background: 'rgba(168,85,247,0.07)',
                        border: '1px solid rgba(168,85,247,0.15)',
                        padding: '10px 12px',
                        borderRadius: 8,
                        fontSize: '0.78rem',
                        color: 'rgba(255,255,255,0.7)',
                        lineHeight: 1.6
                      }}>
                        {customerInfo.geminiMemory}
                      </div>
                    ) : (
                      <div style={{
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: '1px dashed rgba(255,255,255,0.1)',
                        fontSize: '0.75rem',
                        color: 'rgba(255,255,255,0.25)',
                        fontStyle: 'italic'
                      }}>
                        No AI memory recorded yet.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ── PREMIUM EMPTY STATE ── */
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', height: '100%',
              background: 'radial-gradient(ellipse at 50% 40%, rgba(37,211,102,0.06) 0%, transparent 65%), var(--wa-chat-bg)',
              padding: 40, textAlign: 'center', gap: 0
            }}>
              <div
                className="lock-pulse-icon"
                style={{
                  width: 80, height: 80, borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(37,211,102,0.15) 0%, rgba(37,211,102,0.04) 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '2.2rem', marginBottom: 22,
                  boxShadow: '0 0 0 1px rgba(37,211,102,0.2), 0 12px 32px rgba(37,211,102,0.12)',
                  border: '1px solid rgba(37,211,102,0.15)'
                }}
              >
                💬
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'rgba(255,255,255,0.85)', marginBottom: 8, letterSpacing: '-0.02em' }}>
                TracePK Live Chat
              </div>
              <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.88rem', maxWidth: 320, lineHeight: 1.65, margin: '0 auto 24px auto' }}>
                Select a conversation from the left panel to start chatting with your customers in real-time.
              </div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: '0.72rem', color: '#25d366', fontWeight: 600,
                background: 'rgba(37,211,102,0.08)',
                border: '1px solid rgba(37,211,102,0.2)',
                padding: '6px 14px', borderRadius: 20
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#25d366', display: 'inline-block', animation: 'ping 2s ease infinite' }} />
                End-to-End Encrypted · Secure Connection Active
              </div>
            </div>
          )}
        </div>
      </div>

      {/* IMAGE ZOOM MODAL */}
      {zoomedImage && (
        <div className="wa-image-zoom-overlay" onClick={() => setZoomedImage(null)}>
          <img src={zoomedImage} alt="Zoomed View" className="wa-image-zoom-img" />
        </div>
      )}

      {/* GLOBAL COMMAND PALETTE */}
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
                    {filteredCmdItems.filter(c => c.section === section).map((item) => {
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
