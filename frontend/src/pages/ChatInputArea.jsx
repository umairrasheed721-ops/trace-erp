import React from 'react'
import QuickReplyPanel from '../components/QuickReplyPanel'

const formatRecordingTime = (secs) => {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

export default function ChatInputArea({
  activeChat,
  activeQuote,
  clearQuote,
  quickPills = [],
  sendingReply,
  handleSendMessage,
  inputText,
  updateInputText,
  isRecording,
  recordingTime,
  handleDiscardRecording,
  handleVoiceNote,
  handleMediaUpload,
  uploading,
  showQuickReplies,
  setShowQuickReplies,
  quickReplies: quickRepliesProp = [],
  handleSendQuickReply,
  showSlashMenu,
  setShowSlashMenu,
  SLASH_COMMANDS = [],
  slashCmd,
  setSlashCmd,
  inputRef,
  customerInfo,
  handleTriggerCODVerification
}) {
  const [quickReplies, setQuickReplies] = React.useState(() => {
    const saved = localStorage.getItem('trace_quick_replies');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved quick replies", e);
      }
    }
    return [
      { id: 1, text: '👋 Sir, kindly confirm your nearest landmark for delivery.' },
      { id: 2, text: '📦 Aapka parcel PostEx ko hand over kar diya hai.' },
      { id: 3, text: '⚠️ Rider aapki location par hai, kindly phone attend karein.' },
      { id: 4, text: '✅ Order confirm karne ka shukriya!' }
    ];
  });

  const [showManager, setShowManager] = React.useState(false);
  const [newReplyText, setNewReplyText] = React.useState('');

  const handleAddReply = () => {
    if (!newReplyText.trim()) return;
    const newReply = {
      id: Date.now(),
      text: newReplyText.trim()
    };
    setQuickReplies(prev => [...prev, newReply]);
    setNewReplyText('');
  };

  const handleDeleteReply = (id) => {
    setQuickReplies(prev => prev.filter(r => r.id !== id));
  };

  const handleSaveAndClose = () => {
    localStorage.setItem('trace_quick_replies', JSON.stringify(quickReplies));
    setShowManager(false);
  };

  return (
    <>
      <style>{`
        @keyframes pulse-dot {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.9); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes bounce-wave {
          0% { transform: scaleY(0.3); }
          100% { transform: scaleY(1.2); }
        }
        @keyframes glow-mic {
          0% { box-shadow: 0 0 12px rgba(16, 185, 129, 0.5); }
          50% { box-shadow: 0 0 20px rgba(16, 185, 129, 0.85); }
          100% { box-shadow: 0 0 12px rgba(16, 185, 129, 0.5); }
        }
        .wa-quick-pill {
          padding: 6px 14px;
          border-radius: 20px;
          border: 1px solid var(--wa-border);
          background-color: var(--wa-panel-bg);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: var(--wa-text-primary);
          transition: all 0.2s ease;
          white-space: nowrap;
        }
        .wa-quick-pill:hover {
          background-color: var(--wa-header-bg);
          transform: scale(1.02);
        }
      `}</style>

      {/* Quick Pills Row */}
      <div className="wa-portal-quick-pills" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 15px', overflowX: 'auto', scrollbarWidth: 'none' }}>
        {customerInfo?.latestOrder && (
          <span 
            className="wa-quick-pill"
            style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', borderColor: '#10b981', color: '#10b981', fontWeight: 'bold' }}
            onClick={() => handleTriggerCODVerification && handleTriggerCODVerification()}
          >
            🔐 COD Verify
          </span>
        )}
        {customerInfo?.latestOrder?.tracking_number && (
          <span 
            className="wa-quick-pill"
            style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', borderColor: '#3b82f6', color: '#3b82f6', fontWeight: 'bold' }}
            onClick={() => updateInputText('📦 Tracking Number: ' + customerInfo.latestOrder.tracking_number)}
          >
            📍 Track Parcel
          </span>
        )}
        {customerInfo?.latestOrder && (
          <span style={{ color: 'var(--wa-border)', margin: '0 4px' }}>|</span>
        )}
        {quickReplies.map(p => (
          <span 
            key={p.id} 
            className="wa-quick-pill"
            onClick={() => updateInputText(p.text)}
          >
            <span>{p.text}</span>
          </span>
        ))}
        <button 
          type="button"
          onClick={() => setShowManager(true)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '15px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '6px',
            borderRadius: '50%',
            backgroundColor: 'var(--wa-header-bg)',
            minWidth: '32px',
            minHeight: '32px',
            flexShrink: 0
          }}
          title="Manage Quick Replies"
        >
          ⚙️
        </button>
      </div>

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
      <div 
        className="wa-portal-chat-input-bar-pill" 
        style={{
          borderRadius: '30px', 
          margin: '15px', 
          padding: '10px 20px', 
          backgroundColor: 'var(--wa-panel-bg)', 
          boxShadow: '0 5px 20px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          position: 'relative',
          border: '1px solid var(--wa-border)',
          gap: '10px',
          transform: 'translateY(-2px)'
        }}
      >
        
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

        {isRecording ? (
          <div style={{ display: 'flex', alignItems: 'center', width: '100%', justifySelf: 'stretch', gap: '10px' }}>
            {/* Left: pulsing dot + timer */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444', fontWeight: 600, fontSize: '0.9rem' }}>
              <span className="wa-portal-recording-dot" style={{ display: 'inline-block', animation: 'pulse-dot 1s infinite' }}>🔴</span>
              <span>Recording...</span>
              <span className="wa-portal-recording-timer" style={{ fontFamily: 'monospace', color: '#4b5563', marginLeft: '4px' }}>{formatRecordingTime(recordingTime)}</span>
            </div>

            {/* Center: wave visualizer */}
            <div className="wa-recording-wave-visualizer" style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, justifyContent: 'center' }}>
              <div className="wave-bar" style={{ width: '3px', height: '12px', backgroundColor: '#10B981', borderRadius: '2px', display: 'inline-block', transformOrigin: 'center', animation: 'bounce-wave 0.6s infinite alternate' }} />
              <div className="wave-bar" style={{ width: '3px', height: '22px', backgroundColor: '#10B981', borderRadius: '2px', display: 'inline-block', transformOrigin: 'center', animation: 'bounce-wave 0.6s infinite alternate 0.1s' }} />
              <div className="wave-bar" style={{ width: '3px', height: '8px', backgroundColor: '#10B981', borderRadius: '2px', display: 'inline-block', transformOrigin: 'center', animation: 'bounce-wave 0.6s infinite alternate 0.2s' }} />
              <div className="wave-bar" style={{ width: '3px', height: '26px', backgroundColor: '#10B981', borderRadius: '2px', display: 'inline-block', transformOrigin: 'center', animation: 'bounce-wave 0.6s infinite alternate 0.3s' }} />
              <div className="wave-bar" style={{ width: '3px', height: '16px', backgroundColor: '#10B981', borderRadius: '2px', display: 'inline-block', transformOrigin: 'center', animation: 'bounce-wave 0.6s infinite alternate 0.15s' }} />
              <div className="wave-bar" style={{ width: '3px', height: '10px', backgroundColor: '#10B981', borderRadius: '2px', display: 'inline-block', transformOrigin: 'center', animation: 'bounce-wave 0.6s infinite alternate 0.25s' }} />
              <div className="wave-bar" style={{ width: '3px', height: '20px', backgroundColor: '#10B981', borderRadius: '2px', display: 'inline-block', transformOrigin: 'center', animation: 'bounce-wave 0.6s infinite alternate 0.05s' }} />
            </div>

            {/* Right: Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button 
                type="button"
                className="wa-portal-recording-btn discard" 
                onClick={handleDiscardRecording}
                title="Discard recording"
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: '4px' }}
              >
                🗑️
              </button>
              <button 
                type="button"
                onClick={handleVoiceNote}
                style={{
                  background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '50%',
                  width: '36px',
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  boxShadow: '0 0 10px rgba(16, 185, 129, 0.4)',
                  animation: 'glow-mic 2s infinite',
                  transition: 'all 0.2s ease',
                  flexShrink: 0
                }}
                title="Stop & Send"
              >
                ✈️
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* File Attachment */}
            <label className="wa-portal-action-btn" title="Send Media (Image, Audio, Document)" style={{ color: '#6b7280', fontSize: '1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '40px', minHeight: '40px' }}>
              📎
              <input 
                type="file" 
                style={{ display: 'none' }} 
                onChange={handleMediaUpload}
                disabled={uploading}
              />
            </label>

            {/* Templates Selector */}
            <button 
              className="wa-portal-action-btn" 
              onClick={() => setShowQuickReplies(prev => !prev)}
              title="Insert Quick Reply Template"
              style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '40px', minHeight: '40px' }}
            >
              ⚡
            </button>

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
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(e); } }}
              rows={1}
              style={{ 
                flex: 1, 
                border: 'none', 
                outline: 'none', 
                resize: 'none', 
                color: 'var(--wa-text-primary)', 
                backgroundColor: 'transparent',
                fontSize: '0.9rem',
                fontFamily: 'inherit',
                padding: '12px 16px',
                maxHeight: '100px'
              }}
            />

            {/* Dynamic Action Button on the Far Right */}
            {inputText.trim() ? (
              <button 
                className="wa-portal-send-btn"
                onClick={() => handleSendMessage()}
                style={{
                  background: 'var(--brand)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '50%',
                  width: '40px',
                  height: '40px',
                  minWidth: '40px',
                  minHeight: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  flexShrink: 0
                }}
              >
                ➡️
              </button>
            ) : (
              <button
                type="button"
                onClick={handleVoiceNote}
                style={{
                  background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '50%',
                  width: '40px',
                  height: '40px',
                  minWidth: '40px',
                  minHeight: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '1.2rem',
                  boxShadow: '0 0 12px rgba(16, 185, 129, 0.5)',
                  animation: 'glow-mic 2s infinite',
                  transition: 'all 0.2s ease',
                  flexShrink: 0
                }}
                title="Record voice note"
              >
                🎤
              </button>
            )}
          </>
        )}

        {/* Quick Replies Drawer — decoupled Module 8 component */}
        {showQuickReplies && (
          <QuickReplyPanel
            quickReplies={quickRepliesProp}
            sendingReply={sendingReply}
            onSend={handleSendQuickReply}
            onClose={() => setShowQuickReplies(false)}
          />
        )}
      </div>

      {showManager && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(11, 20, 26, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            backdropFilter: 'blur(4px)'
          }}
        >
          <div 
            style={{
              backgroundColor: 'var(--wa-panel-bg)',
              border: '1px solid var(--wa-border)',
              borderRadius: '12px',
              width: '90%',
              maxWidth: '450px',
              padding: '24px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--wa-border)', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--wa-text-primary)' }}>⚙️ Quick Replies Settings</h3>
              <button 
                onClick={handleSaveAndClose} 
                style={{ background: 'none', border: 'none', color: 'var(--wa-text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}
              >
                ✕
              </button>
            </div>

            {/* List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
              {quickReplies.length === 0 ? (
                <div style={{ fontSize: '0.85rem', color: 'var(--wa-text-muted)', fontStyle: 'italic', textAlign: 'center', padding: '12px 0' }}>No quick replies. Add one below!</div>
              ) : (
                quickReplies.map(r => (
                  <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--wa-header-bg)', padding: '8px 12px', borderRadius: '8px', gap: '8px' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--wa-text-primary)', wordBreak: 'break-word', flex: 1 }}>{r.text}</span>
                    <button 
                      onClick={() => handleDeleteReply(r.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '0.9rem', padding: '4px' }}
                      title="Delete reply"
                    >
                      🗑️
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Add New Reply */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <input 
                type="text" 
                placeholder="Type a new quick reply..." 
                value={newReplyText}
                onChange={e => setNewReplyText(e.target.value)}
                style={{
                  backgroundColor: 'var(--wa-header-bg)',
                  border: '1px solid var(--wa-border)',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  color: 'var(--wa-text-primary)',
                  fontSize: '0.85rem',
                  outline: 'none'
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddReply();
                  }
                }}
              />
              <button 
                onClick={handleAddReply}
                style={{
                  backgroundColor: '#005c4b',
                  color: '#e9edef',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                ➕ Add Reply
              </button>
            </div>

            {/* Save & Close */}
            <button 
              onClick={handleSaveAndClose}
              style={{
                backgroundColor: 'var(--brand)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '10px',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: 'pointer',
                marginTop: '8px'
              }}
            >
              Save & Close
            </button>
          </div>
        </div>
      )}
    </>
  )
}
