import React from 'react';

const WhatsAppChatPanel = React.memo(({ editingOrder, management }) => {
  const {
    getMediaUrlWithToken,
    botStatus,
    waSimulating,
    chatSearchQuery,
    setChatSearchQuery,
    chatLoading,
    chatMessages,
    setChatMessages,
    isTyping,
    quickPills,
    handleSendWaMessage,
    sendingWaMsg,
    showPillsManager,
    setShowPillsManager,
    newPillText,
    setNewPillText,
    handleCreateQuickPill,
    handleDeleteQuickPill,
    showQuickReplyPanel,
    setShowQuickReplyPanel,
    showTemplateCreator,
    setShowTemplateCreator,
    quickReplyTitle,
    setQuickReplyTitle,
    quickReplyCaption,
    setQuickReplyCaption,
    quickReplyMedia,
    setQuickReplyMedia,
    handleCreateQuickReply,
    handleDeleteQuickReply,
    handleSendQuickReply,
    isRecording,
    recordingSeconds,
    startRecording,
    stopRecording,
    fileInputRef,
    handleFileAttach,
    newWaMsg,
    setNewWaMsg,
    isUploadingMedia,
    sendingInvoice,
    handleSendInvoice,
    handleWaSimulate,
    quickReplies
  } = management;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 28, height: 'calc(100vh - 340px)', minHeight: 500 }}>
      {/* Left Side: Active Chat Window */}
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 20, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)' }}>
        {/* Chat Header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #334155', background: '#0f172a', display: 'flex', alignItems: 'center', justifyItems: 'space-between', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#6366f120', border: '1px solid #6366f1', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
              👤
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>{editingOrder.customer_name}</span>
                {editingOrder.wa_verification_status && (
                  <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 10, background: editingOrder.wa_verification_status?.toLowerCase() === 'verified' ? '#10b98120' : editingOrder.wa_verification_status === 'Cancelled' ? '#ef444420' : '#f59e0b20', color: editingOrder.wa_verification_status?.toLowerCase() === 'verified' ? '#10b981' : editingOrder.wa_verification_status === 'Cancelled' ? '#ef4444' : '#f59e0b', fontWeight: 'bold' }}>
                    {editingOrder.wa_verification_status}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>+{(editingOrder.phone || '').replace(/^\+/, '')} • Baileys WebSocket: {botStatus === 'CONNECTED' ? '🟢 Active' : (botStatus === 'DISABLED' ? '🛑 Disabled locally' : '🔴 Disconnected (Refresh Required)')}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Inline Verification Status Buttons */}
            <div style={{ display: 'flex', gap: 6, background: '#1e293b', padding: '4px 8px', borderRadius: 12, border: '1px solid #334155' }}>
              <button 
                type="button"
                onClick={() => handleWaSimulate('SIMULATE_CONFIRM')}
                disabled={waSimulating}
                style={{ background: '#10b98120', color: '#10b981', border: 'none', borderRadius: 8, padding: '4px 8px', fontSize: '0.7rem', fontWeight: 'bold', cursor: 'pointer' }}
                title="Confirm Verification Status"
              >
                Confirm ✅
              </button>
              <button 
                type="button"
                onClick={() => handleWaSimulate('SIMULATE_CANCEL')}
                disabled={waSimulating}
                style={{ background: '#ef444420', color: '#ef4444', border: 'none', borderRadius: 8, padding: '4px 8px', fontSize: '0.7rem', fontWeight: 'bold', cursor: 'pointer' }}
                title="Cancel Order via WA"
              >
                Cancel ❌
              </button>
            </div>

            {/* Chat Keyword Search Box */}
            <input 
              type="text" 
              placeholder="🔍 Search messages..."
              value={chatSearchQuery}
              onChange={e => setChatSearchQuery(e.target.value)}
              style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '6px 12px', color: '#fff', fontSize: '0.75rem', outline: 'none', width: 140 }}
            />

            <button 
              type="button"
              onClick={() => {
                const apiBase = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
                fetch(`${apiBase}/api/whatsapp-governance/chat/${editingOrder.id}/fetch-history`, { method: 'POST', headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` } })
                  .then(r => r.json())
                  .then(data => { if (data.messages) setChatMessages(data.messages); })
                  .catch(() => {});
              }} 
              style={{ background: '#10b98120', color: '#10b981', border: '1px solid #10b981', padding: '6px 14px', borderRadius: 10, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              📂 Fetch History
            </button>
            <button 
              type="button"
              onClick={() => {
                const apiBase = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
                fetch(`${apiBase}/api/whatsapp-governance/chat/${editingOrder.id}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` } })
                  .then(r => r.json())
                  .then(data => { if (data.messages) setChatMessages(data.messages); })
                  .catch(() => {});
              }} 
              style={{ background: '#334155', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 10, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
            >
              🔄 Refresh
            </button>
          </div>
        </div>

        {/* Chat Messages Area */}
        <div style={{ flex: 1, padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {chatLoading ? (
            <div style={{ margin: 'auto', color: '#94a3b8', fontSize: '0.9rem' }}>⏳ Loading chat history from database...</div>
          ) : chatMessages.length > 0 ? (
            chatMessages.map(msg => {
              const isOutgoing = msg.direction === 'outgoing';
              return (
                <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isOutgoing ? 'flex-end' : 'flex-start', alignSelf: isOutgoing ? 'flex-end' : 'flex-start', maxWidth: '75%' }}>
                  <div style={{ 
                    background: isOutgoing ? '#10b981' : '#334155', 
                    color: '#fff', 
                    padding: '12px 18px', 
                    borderRadius: 20, 
                    borderBottomRightRadius: isOutgoing ? 4 : 20, 
                    borderBottomLeftRadius: isOutgoing ? 20 : 4,
                    fontSize: '0.9rem',
                    lineHeight: 1.5,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                  }}>
                    {msg.media_url && (
                      <div style={{ marginBottom: 8 }}>
                        {msg.media_type === 'image' && <img src={getMediaUrlWithToken(msg.media_url)} style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8 }} />}
                        {msg.media_type === 'video' && <video src={getMediaUrlWithToken(msg.media_url)} controls style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8 }} />}
                        {(msg.media_type === 'audio' || msg.media_type === 'voice') && <audio src={getMediaUrlWithToken(msg.media_url)} controls style={{ maxWidth: 220 }} />}
                        {msg.media_type === 'document' && <a href={getMediaUrlWithToken(msg.media_url)} target="_blank" rel="noreferrer" style={{ color: '#fff', textDecoration: 'underline', fontWeight: 'bold' }}>📎 View Document</a>}
                      </div>
                    )}
                    {(() => {
                      const rawText = msg.message?.replace(/\[(IMAGE|AUDIO|VIDEO|DOCUMENT)\]\s*/i, '') || '';
                      if (!chatSearchQuery || !chatSearchQuery.trim()) return rawText;
                      const parts = rawText.split(new RegExp(`(${chatSearchQuery.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')})`, 'gi'));
                      return parts.map((part, i) => 
                        part.toLowerCase() === chatSearchQuery.toLowerCase() 
                          ? <mark key={i} style={{ background: '#f59e0b', color: '#000', padding: '1px 3px', borderRadius: 4, fontWeight: 'bold' }}>{part}</mark> 
                          : part
                      );
                    })()}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 4, padding: '0 6px' }}>
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {isOutgoing ? (msg.status === 'sent' ? '✓ Sent' : '✓✓ Delivered') : 'Customer'}
                  </div>
                </div>
              );
            })
          ) : (
            <div style={{ margin: 'auto', textAlign: 'center', color: '#64748b', padding: 40 }}>
              <p style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>No messages found for +{(editingOrder.phone || '').replace(/^\+/, '')}</p>
              <p style={{ fontSize: '0.8rem', margin: 0 }}>Start the conversation by typing a message below or clicking a quick reply pill!</p>
            </div>
          )}
          {isTyping && (
            <div style={{ alignSelf: 'flex-start', background: '#334155', color: '#fff', padding: '8px 16px', borderRadius: 20, fontSize: '0.85rem', fontStyle: 'italic', opacity: 0.8 }}>
              Customer is typing...
            </div>
          )}
          <div id="chat-end" />
        </div>

        {/* Quick Reply Pills */}
        <div style={{ padding: '10px 24px', background: '#0f172a', borderTop: '1px solid #334155', display: 'flex', alignItems: 'center', gap: 12, overflowX: 'auto' }}>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', flex: 1 }}>
            {quickPills.map((pill) => (
              <button
                key={pill.id}
                type="button"
                onClick={() => handleSendWaMessage(pill.pill_text)}
                disabled={sendingWaMsg}
                style={{ 
                  background: '#334155', 
                  color: '#f1f5f9', 
                  border: '1px solid #475569', 
                  padding: '6px 14px', 
                  borderRadius: 16, 
                  fontSize: '0.75rem', 
                  fontWeight: 600, 
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#475569'}
                onMouseLeave={e => e.currentTarget.style.background = '#334155'}
              >
                ⚡ {pill.pill_text.slice(0, 30)}...
              </button>
            ))}
          </div>
          <button 
            type="button"
            onClick={() => setShowPillsManager(!showPillsManager)}
            style={{ background: showPillsManager ? '#6366f1' : '#334155', border: 'none', borderRadius: 8, padding: '6px 10px', color: '#fff', fontSize: '0.75rem', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}
            title="Manage Quick Reply Pills"
          >
            ⚙️ Manage Pills
          </button>
        </div>

        {/* Pills Manager Section */}
        {showPillsManager && (
          <div style={{ background: '#1e293b', borderTop: '1px solid #334155', padding: '12px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontWeight: 800, fontSize: '0.8rem', color: '#fff' }}>⚙️ Manage Quick Reply Pills</div>
            <form onSubmit={handleCreateQuickPill} style={{ display: 'flex', gap: 8 }}>
              <input 
                type="text" 
                placeholder="Add new quick pill text..."
                value={newPillText}
                onChange={e => setNewPillText(e.target.value)}
                required
                style={{ flex: 1, background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: '0.8rem', outline: 'none' }}
              />
              <button type="submit" style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>Add</button>
            </form>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
              {quickPills.map(p => (
                <div key={p.id} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', color: '#fff' }}>
                  <span>{p.pill_text}</span>
                  <button type="button" onClick={() => handleDeleteQuickPill(p.id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}>✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Reply Selection Overlay */}
        {showQuickReplyPanel && (
          <div style={{ background: '#1e293b', borderTop: '1px solid #334155', borderBottom: '1px solid #334155', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 300, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, fontSize: '0.85rem', color: '#fff' }}>⚡ Saved Quick Replies (Templates)</span>
              <button 
                type="button"
                onClick={() => setShowTemplateCreator(!showTemplateCreator)} 
                style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
              >
                {showTemplateCreator ? '✕ Close Creator' : '➕ Create New'}
              </button>
            </div>

            {showTemplateCreator && (
              <form onSubmit={handleCreateQuickReply} style={{ background: '#0f172a', padding: 16, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid #334155' }}>
                <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#6366f1' }}>Create Quick Reply Template</div>
                <input 
                  type="text" 
                  placeholder="Template Title (e.g. postex_video_guide)"
                  value={quickReplyTitle}
                  onChange={e => setQuickReplyTitle(e.target.value)}
                  required
                  style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: '0.8rem', outline: 'none' }}
                />
                <textarea 
                  placeholder="Caption / Message Text (use {{customer_name}} or {{order_id}} for dynamic fields)"
                  value={quickReplyCaption}
                  onChange={e => setQuickReplyCaption(e.target.value)}
                  rows={2}
                  style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: '0.8rem', outline: 'none', resize: 'vertical' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Optional Media (Image or Video):</span>
                  <input 
                    type="file" 
                    accept="image/*,video/*"
                    onChange={e => setQuickReplyMedia(e.target.files[0])}
                    style={{ fontSize: '0.75rem', color: '#94a3b8' }}
                  />
                </div>
                <button 
                  type="submit" 
                  disabled={sendingWaMsg}
                  style={{ background: '#10b981', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-start' }}
                >
                  {sendingWaMsg ? 'Saving...' : 'Save Template'}
                </button>
              </form>
            )}

            {/* Search templates input */}
            <input 
              type="text" 
              placeholder="🔍 Search templates by title/caption..."
              onChange={(e) => {
                const q = e.target.value.toLowerCase();
                const cards = e.currentTarget.nextSibling.childNodes;
                cards.forEach(card => {
                  const title = card.childNodes[1]?.innerText.toLowerCase() || '';
                  const caption = card.childNodes[3]?.innerText.toLowerCase() || '';
                  if (title.includes(q) || caption.includes(q)) {
                    card.style.display = 'flex';
                  } else {
                    card.style.display = 'none';
                  }
                });
              }}
              style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '6px 12px', color: '#fff', fontSize: '0.75rem', outline: 'none' }}
            />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginTop: 4 }}>
              {quickReplies.length > 0 ? (
                quickReplies.map(qr => (
                  <div key={qr.id} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, position: 'relative' }}>
                    <button 
                      type="button"
                      onClick={() => handleDeleteQuickReply(qr.id)}
                      style={{ position: 'absolute', top: 8, right: 8, background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.85rem' }}
                      title="Delete"
                    >
                      🗑️
                    </button>
                    <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#fff', paddingRight: 20 }}>{qr.title}</div>
                    
                    {qr.media_url && (
                      <div style={{ width: '100%', height: 80, borderRadius: 6, background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                        {qr.media_type === 'image' ? (
                          <img src={getMediaUrlWithToken(qr.media_url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                        ) : (
                          <video src={getMediaUrlWithToken(qr.media_url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted preload="metadata" />
                        )}
                      </div>
                    )}
                    
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', maxHeight: 40, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', whiteSpace: 'normal' }}>
                      {qr.caption || '(No caption)'}
                    </div>
                    
                    <button 
                      type="button"
                      onClick={() => handleSendQuickReply(qr.id)}
                      disabled={sendingWaMsg}
                      style={{ background: '#10b98120', color: '#10b981', border: '1px solid #10b98140', borderRadius: 8, padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 'auto' }}
                    >
                      ⚡ Send Template
                    </button>
                  </div>
                ))
              ) : (
                <div style={{ color: '#64748b', fontSize: '0.75rem', padding: '12px 0' }}>No custom media quick replies saved yet. Click "Create New" above to save one.</div>
              )}
            </div>
          </div>
        )}

        {/* Chat Input Bar */}
        <div style={{ padding: '16px 24px', background: '#0f172a', borderTop: '1px solid #334155', display: 'flex', gap: 12, alignItems: 'center' }}>
          {!isRecording ? (
            <>
              <button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{ background: '#334155', border: 'none', borderRadius: '50%', width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                title="Attach File"
              >
                📎
              </button>
              <button 
                type="button"
                onClick={() => setShowQuickReplyPanel(!showQuickReplyPanel)}
                style={{ background: showQuickReplyPanel ? '#6366f1' : '#334155', color: '#fff', border: 'none', borderRadius: '50%', width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                title="Quick Reply Templates"
              >
                ⚡
              </button>
              <button 
                type="button"
                onClick={startRecording}
                style={{ background: '#334155', border: 'none', borderRadius: '50%', width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                title="Record Voice Note"
              >
                🎙️
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                style={{ display: 'none' }} 
                accept="image/*,video/*,application/pdf,audio/*"
                onChange={handleFileAttach}
              />
              <input 
                type="text" 
                placeholder={`Type a message to ${editingOrder.customer_name}...`}
                value={newWaMsg}
                onChange={e => setNewWaMsg(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendWaMessage()}
                onPaste={(e) => {
                  const items = e.clipboardData?.items;
                  if (!items) return;
                  for (const item of items) {
                    if (item.type.startsWith('image/')) {
                      const file = item.getAsFile();
                      if (file) {
                        const mockEvent = { target: { files: [file] } };
                        handleFileAttach(mockEvent);
                      }
                    }
                  }
                }}
                style={{ flex: 1, background: '#1e293b', border: '1px solid #334155', borderRadius: 16, padding: '12px 18px', color: '#fff', fontSize: '0.9rem', outline: 'none' }}
              />
            </>
          ) : (
            <div style={{ flex: 1, background: '#1e293b', border: '1px solid #334155', borderRadius: 16, padding: '10px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1.5s infinite' }} />
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#ef4444' }}>
                  Recording Audio: {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, '0')}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button 
                  type="button"
                  onClick={() => stopRecording(false)} 
                  style={{ background: '#ef444420', color: '#ef4444', border: '1px solid #ef444440', borderRadius: 8, padding: '4px 12px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  ✕ Cancel
                </button>
                <button 
                  type="button"
                  onClick={() => stopRecording(true)} 
                  style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 8, padding: '4px 12px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  ✓ Send PTT
                </button>
              </div>
            </div>
          )}

          {isUploadingMedia && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#10b98120', borderRadius: 12, border: '1px solid #10b98140', flexShrink: 0 }}>
              <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 700 }}>📤 Sending...</span>
            </div>
          )}
          
          {!isRecording && (
            <button
              type="button"
              onClick={() => handleSendWaMessage()}
              disabled={sendingWaMsg || !newWaMsg.trim()}
              style={{ 
                background: '#10b981', 
                color: '#fff', 
                border: 'none', 
                padding: '12px 24px', 
                borderRadius: 16, 
                fontSize: '0.9rem', 
                fontWeight: 700, 
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(16,185,129,0.3)',
                opacity: (!newWaMsg.trim() || sendingWaMsg) ? 0.5 : 1,
                flexShrink: 0
              }}
            >
              {sendingWaMsg ? '⏳...' : 'Send 🚀'}
            </button>
          )}
        </div>
      </div>

      {/* Right Side: Agent Guidelines & Shortcuts */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* PDF Invoice Button Card */}
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
          <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff', borderBottom: '1px solid #334155', paddingBottom: 8 }}>📄 Financial Invoice Actions</div>
          <button 
            type="button"
            onClick={handleSendInvoice}
            disabled={sendingInvoice}
            style={{ 
              background: '#6366f1', 
              color: '#fff', 
              border: 'none', 
              padding: '12px 18px', 
              borderRadius: 12, 
              fontSize: '0.85rem', 
              fontWeight: 700, 
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 12px rgba(99,102,241,0.3)',
              opacity: sendingInvoice ? 0.7 : 1
            }}
          >
            {sendingInvoice ? '⏳ Generating Invoice...' : '📄 Send PDF Invoice via WA'}
          </button>
        </div>

        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff', borderBottom: '1px solid #334155', paddingBottom: 12 }}>💡 Agent Best Practices</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.8, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <li><strong style={{ color: '#fff' }}>Keep it Conversational</strong>: Speak politely and use local vernacular (e.g. Sir/Ma'am).</li>
            <li><strong style={{ color: '#fff' }}>Instant Quick Replies</strong>: Click any pill above the text box to instantly fire standard delivery updates.</li>
            <li><strong style={{ color: '#fff' }}>WebSocket Speed</strong>: Messages are sent instantly via Baileys WebSocket without needing WhatsApp Web or Chrome.</li>
            <li><strong style={{ color: '#fff' }}>Auto-Verification Check</strong>: If the customer replies with "Confirm" or "Yes", the ERP will automatically update the order status to Verified!</li>
          </ul>
          <div style={{ background: '#10b98120', border: '1px solid #10b98140', padding: 16, borderRadius: 14, color: '#10b981', fontSize: '0.8rem', fontWeight: 700, marginTop: 8 }}>
            🔒 100% Safe 1-on-1 Chatting: Manual agent messages carry zero ban risk.
          </div>
        </div>
      </div>
    </div>
  );
});

WhatsAppChatPanel.displayName = 'WhatsAppChatPanel';

export default WhatsAppChatPanel;
