import React from 'react'
import useWhatsAppPortal from '../hooks/useWhatsAppPortal'
import ChatContactSidebar from '../components/WhatsAppPortal/ChatContactSidebar'
import ChatMessageList from './ChatMessageList'
import ChatInputArea from './ChatInputArea'
import MediaUploadOverlay from '../components/MediaUploadOverlay'
import SettingsModal from '../components/SettingsModal'

export default function WhatsAppPortal() {
  const {
    chats,
    activeChat,
    selectChat,
    wsStatus,
    activeNumber,
    searchText,
    setSearchText,
    activeFilter,
    setActiveFilter,
    loadingChats,
    typingStatus,
    setShowCmdPalette,
    setShowSettings,
    isDragging,
    uploading,
    handleMediaUpload,
    syncingMessages,
    humanHandoffActive,
    setHumanHandoffActive,
    messages,
    loadingMessages,
    handleQuoteClick,
    getMediaUrlWithToken,
    setZoomedImage,
    timelineEndRef,
    contextMenu,
    setContextMenu,
    activeQuote,
    clearQuote,
    quickPills,
    sendingReply,
    handleSendMessage,
    inputText,
    updateInputText,
    isRecording,
    recordingTime,
    handleDiscardRecording,
    handleVoiceNote,
    showQuickReplies,
    setShowQuickReplies,
    quickReplies,
    handleSendQuickReply,
    showSlashMenu,
    setShowSlashMenu,
    SLASH_COMMANDS,
    slashCmd,
    setSlashCmd,
    inputRef,
    customerInfo,
    handleTriggerCODVerification,
    showCustomer360,
    setShowCustomer360,
    handleSendInvoice,
    zoomedImage,
    showCmdPalette,
    cmdPaletteInputRef,
    cmdQuery,
    setCmdQuery,
    setCmdActiveIdx,
    filteredCmdItems,
    cmdActiveIdx,
    cmdSections,
    showSettings,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleCallHandoff
  } = useWhatsAppPortal()

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

      <div className="wa-portal-container" style={{ backgroundColor: 'var(--wa-panel-bg)', border: '1px solid var(--wa-border)', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
        
        {/* --- LEFT PANEL: CONVERSATIONS LIST --- */}
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

        {/* --- CENTER PANEL: TIMELINE & CHAT INTERACTION --- */}
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
                <div className="wa-portal-chat-header" style={{ backgroundColor: 'var(--wa-header-bg)', borderBottom: '1px solid var(--wa-border)' }}>
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
                  customerInfo={customerInfo}
                  handleTriggerCODVerification={handleTriggerCODVerification}
                />
              </div>

              {/* CUSTOMER 360 RIGHT PANEL */}
              <div 
                className="wa-portal-right-panel wa-portal-right" 
                style={{
                  width: '320px', 
                  borderLeft: '1px solid var(--wa-border)', 
                  background: 'var(--wa-panel-bg)', 
                  display: showCustomer360 ? 'flex' : 'none',
                  flexDirection: 'column',
                  gap: '15px',
                  padding: '15px',
                  overflowY: 'auto'
                }}
              >
                {/* Profile Card */}
                <div className="wa-portal-profile-section" style={{ textAlign: 'center', backgroundColor: 'var(--wa-panel-bg)', padding: '15px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid var(--wa-border)' }}>
                  <div className="wa-portal-profile-avatar" style={{ margin: '0 auto 10px auto' }}>
                    {activeChat.customerName ? activeChat.customerName.substring(0, 2).toUpperCase() : 'WA'}
                  </div>
                  <h4 className="wa-portal-profile-name" style={{ margin: '0 0 4px 0', fontSize: '1rem', fontWeight: 600, color: 'var(--wa-text-primary)' }}>{activeChat.customerName || 'WhatsApp Customer'}</h4>
                  <div className="wa-portal-profile-phone" style={{ fontSize: '0.8rem', color: 'var(--wa-text-muted)' }}>+{activeChat.phone}</div>
                </div>

                {/* Order Status & COD Verification Badge Card */}
                <div className="wa-portal-profile-section" style={{ backgroundColor: 'var(--wa-panel-bg)', padding: '15px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid var(--wa-border)' }}>
                  <h5 className="wa-portal-profile-title" style={{ margin: '0 0 8px 0', fontSize: '0.85rem', fontWeight: 600, color: 'var(--wa-text-primary)' }}>📦 Order Status</h5>
                  {loadingMessages ? (
                    <div className="right-panel-shimmer" style={{ height: '20px', width: '120px', borderRadius: '4px' }}></div>
                  ) : customerInfo.latestOrder ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ fontSize: '0.85rem', color: 'var(--wa-text-primary)' }}>Order #{customerInfo.latestOrder.id}</div>
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
                    <div style={{ fontSize: '0.8rem', color: 'var(--wa-text-muted)', fontStyle: 'italic' }}>No active orders found.</div>
                  )}
                </div>

                {/* Quick Actions Card */}
                <div className="wa-portal-profile-section" style={{ backgroundColor: 'var(--wa-panel-bg)', padding: '15px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid var(--wa-border)' }}>
                  <h5 className="wa-portal-profile-title" style={{ margin: '0 0 8px 0', fontSize: '0.85rem', fontWeight: 600, color: 'var(--wa-text-primary)' }}>⚡ Quick Actions</h5>
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
                <div className="wa-portal-profile-section" style={{ backgroundColor: 'var(--wa-panel-bg)', padding: '15px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid var(--wa-border)' }}>
                  <h5 className="wa-portal-profile-title" style={{ margin: '0 0 8px 0', fontSize: '0.85rem', fontWeight: 600, color: 'var(--wa-text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>💳 Customer LTV</h5>
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
                      <span style={{ fontSize: '0.75rem', color: 'var(--wa-text-muted)' }}>Total value over {customerInfo.orderHistory?.length || 0} orders</span>
                    </>
                  )}
                </div>

                {/* Gemini Chat Memory Section */}
                <div className="wa-portal-profile-section" style={{ backgroundColor: 'var(--wa-panel-bg)', padding: '15px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid var(--wa-border)' }}>
                  <h5 className="wa-portal-profile-title" style={{ margin: '0 0 8px 0', fontSize: '0.85rem', fontWeight: 600, color: 'var(--wa-text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>🧠 Gemini Active Memory</h5>
                  {loadingMessages ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div className="right-panel-shimmer" style={{ height: '12px', width: '100%', borderRadius: '4px' }}></div>
                      <div className="right-panel-shimmer" style={{ height: '12px', width: '90%', borderRadius: '4px' }}></div>
                      <div className="right-panel-shimmer" style={{ height: '12px', width: '40%', borderRadius: '4px' }}></div>
                    </div>
                  ) : customerInfo.geminiMemory ? (
                    <div className="wa-gemini-memory" style={{ background: 'var(--wa-header-bg)', padding: '8px', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--wa-text-primary)' }}>
                      {customerInfo.geminiMemory}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.8rem', color: 'var(--wa-text-muted)', fontStyle: 'italic', padding: '8px', background: 'var(--wa-header-bg)', borderRadius: '6px', border: '1px dashed var(--wa-border)' }}>
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
