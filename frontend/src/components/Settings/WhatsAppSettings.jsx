import React from 'react';

export default function WhatsAppSettings({
  templates,
  loadingTemplates,
  newTitle,
  setNewTitle,
  newText,
  setNewText,
  newCategory,
  setNewCategory,
  newShortcode,
  setNewShortcode,
  newMediaUrl,
  setNewMediaUrl,
  newMediaType,
  setNewMediaType,
  buttonsMode,
  setButtonsMode,
  buttonsList,
  setButtonsList,
  btnLabel,
  setBtnLabel,
  btnType,
  setBtnType,
  btnValue,
  setBtnValue,
  handleAddTemplate,
  handleDeleteTemplate,
  loggingOut,
  handleWhatsAppLogout
}) {
  return (
    <>
      {/* Quick Replies Section */}
      <div className="quick-replies-section" style={{ border: '1px solid #333', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
        <h3 style={{ color: '#fff', marginBottom: '10px' }}>⚡ Quick Reply Templates</h3>
        
        {/* Form to Add Template */}
        <form onSubmit={handleAddTemplate} className="template-form-card" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div className="form-group">
              <label className="premium-label" style={{ fontSize: '0.8rem', opacity: 0.8, color: '#aaa', display: 'block', marginBottom: '4px' }}>Template Title</label>
              <input
                type="text"
                className="premium-input"
                placeholder="e.g. Return Policy"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #444', background: '#222', color: '#fff' }}
                required
              />
            </div>
            <div className="form-group">
              <label className="premium-label" style={{ fontSize: '0.8rem', opacity: 0.8, color: '#aaa', display: 'block', marginBottom: '4px' }}>Category</label>
              <select
                className="premium-input"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #444', background: '#222', color: '#fff' }}
              >
                <option value="General">General</option>
                <option value="Shipping">Shipping</option>
                <option value="Billing">Billing</option>
                <option value="Support">Support</option>
                <option value="Refunds">Refunds</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div className="form-group">
              <label className="premium-label" style={{ fontSize: '0.8rem', opacity: 0.8, color: '#aaa', display: 'block', marginBottom: '4px' }}>Shortcode (e.g. return)</label>
              <input
                type="text"
                className="premium-input"
                placeholder="return"
                value={newShortcode}
                onChange={(e) => setNewShortcode(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #444', background: '#222', color: '#fff' }}
              />
            </div>
            <div className="form-group">
              <label className="premium-label" style={{ fontSize: '0.8rem', opacity: 0.8, color: '#aaa', display: 'block', marginBottom: '4px' }}>Media Type</label>
              <select
                className="premium-input"
                value={newMediaType}
                onChange={(e) => setNewMediaType(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #444', background: '#222', color: '#fff' }}
              >
                <option value="image">Image</option>
                <option value="video">Video</option>
                <option value="document">Document</option>
              </select>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label className="premium-label" style={{ fontSize: '0.8rem', opacity: 0.8, color: '#aaa', display: 'block', marginBottom: '4px' }}>Media URL (Optional attachment)</label>
            <input
              type="text"
              className="premium-input"
              placeholder="https://example.com/image.jpg"
              value={newMediaUrl}
              onChange={(e) => setNewMediaUrl(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #444', background: '#222', color: '#fff' }}
            />
          </div>

          <div className="buttons-builder-card" style={{ border: '1px solid #444', padding: '12px', borderRadius: '6px', marginBottom: '12px', background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <label className="premium-label" style={{ fontSize: '0.82rem', fontWeight: '600', color: '#a855f7' }}>🔘 Interactive Buttons ({buttonsList.length}/3)</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: '#aaa' }}>Delivery Mode:</span>
                <select
                  value={buttonsMode}
                  onChange={(e) => setButtonsMode(e.target.value)}
                  style={{ padding: '2px 6px', fontSize: '0.75rem', borderRadius: '4px', background: '#333', color: '#fff', border: '1px solid #555' }}
                >
                  <option value="native">Native WhatsApp Buttons</option>
                  <option value="text">Text Menu Fallback</option>
                </select>
              </div>
            </div>

            {buttonsList.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                {buttonsList.map((btn, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#333', border: '1px solid #555', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>
                    <span style={{ color: '#fff', fontWeight: '500' }}>
                      {btn.button_type === 'url' ? '🔗' : '🔘'} {btn.label}
                    </span>
                    <span style={{ color: '#aaa', fontSize: '0.65rem' }}>({btn.value})</span>
                    <button
                      type="button"
                      onClick={() => setButtonsList(prev => prev.filter((_, i) => i !== idx))}
                      style={{ background: 'none', border: 'none', color: '#ff4d4d', cursor: 'pointer', fontWeight: 'bold', padding: '0 2px' }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {buttonsList.length < 3 ? (
              <div style={{ display: 'grid', gridTemplateColumns: '80px 100px 1fr auto', gap: '8px', alignItems: 'end' }}>
                <div>
                  <span style={{ fontSize: '0.7rem', color: '#999', display: 'block', marginBottom: '2px' }}>Type</span>
                  <select
                    value={btnType}
                    onChange={(e) => setBtnType(e.target.value)}
                    style={{ width: '100%', padding: '5px', fontSize: '0.75rem', borderRadius: '4px', background: '#222', color: '#fff', border: '1px solid #444' }}
                  >
                    <option value="reply">Reply</option>
                    <option value="url">URL Link</option>
                  </select>
                </div>
                <div>
                  <span style={{ fontSize: '0.7rem', color: '#999', display: 'block', marginBottom: '2px' }}>Button Label</span>
                  <input
                    type="text"
                    placeholder="e.g. Yes"
                    maxLength={20}
                    value={btnLabel}
                    onChange={(e) => setBtnLabel(e.target.value)}
                    style={{ width: '100%', padding: '5px', fontSize: '0.75rem', borderRadius: '4px', background: '#222', color: '#fff', border: '1px solid #444' }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '0.7rem', color: '#999', display: 'block', marginBottom: '2px' }}>Action Payload / URL</span>
                  <input
                    type="text"
                    placeholder={btnType === 'url' ? 'https://...' : 'e.g. confirm'}
                    value={btnValue}
                    onChange={(e) => setBtnValue(e.target.value)}
                    style={{ width: '100%', padding: '5px', fontSize: '0.75rem', borderRadius: '4px', background: '#222', color: '#fff', border: '1px solid #444' }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!btnLabel.trim() || !btnValue.trim()) return;
                    setButtonsList(prev => [...prev, {
                      button_type: btnType,
                      label: btnLabel.trim(),
                      value: btnValue.trim(),
                      position: prev.length
                    }]);
                    setBtnLabel('');
                    setBtnValue('');
                  }}
                  disabled={!btnLabel.trim() || !btnValue.trim()}
                  style={{
                    padding: '6px 12px',
                    fontSize: '0.75rem',
                    borderRadius: '4px',
                    background: (btnLabel.trim() && btnValue.trim()) ? '#a855f7' : '#444',
                    color: '#fff',
                    border: 'none',
                    cursor: (btnLabel.trim() && btnValue.trim()) ? 'pointer' : 'not-allowed',
                    fontWeight: '600'
                  }}
                >
                  + Add
                </button>
              </div>
            ) : (
              <div style={{ fontSize: '0.75rem', color: '#888', fontStyle: 'italic', marginTop: '4px' }}>
                Max limit of 3 interactive buttons reached. Remove one to add another.
              </div>
            )}
          </div>

          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label className="premium-label" style={{ fontSize: '0.8rem', opacity: 0.8, color: '#aaa', display: 'block', marginBottom: '4px' }}>Message Body</label>
            <textarea
              className="premium-input"
              placeholder="Type the quick reply message text... (Use {{customer_name}}, {{order_id}} etc.)"
              rows={3}
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #444', background: '#222', color: '#fff', fontFamily: 'inherit' }}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '10px', borderRadius: '4px', cursor: 'pointer' }}>
            Save Template
          </button>
        </form>

        {/* Saved Templates List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontWeight: '600', color: '#fff', fontSize: '0.9rem' }}>📋 Saved Templates ({templates.length})</div>
          
          {loadingTemplates ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#888', fontStyle: 'italic', fontSize: '0.8rem' }}>Loading saved templates...</div>
          ) : templates.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#888', fontStyle: 'italic', fontSize: '0.8rem' }}>No templates configured yet.</div>
          ) : (
            <div className="template-list-container" style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '300px', overflowY: 'auto' }}>
              {templates.map((t) => (
                <div key={t.id} className="template-item-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px', background: '#222', border: '1px solid #444', borderRadius: '6px' }}>
                  <div className="template-item-details" style={{ flex: 1, minWidth: 0, paddingRight: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                      <span className="template-item-title" style={{ fontWeight: '600', color: '#fff', fontSize: '0.85rem' }}>{t.title}</span>
                      <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: '#a855f7', color: '#fff' }}>{t.category || 'General'}</span>
                      {t.shortcode && (
                        <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: '#10b981', color: '#fff' }}>{t.shortcode}</span>
                      )}
                      {t.media_url && (
                        <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: '#3b82f6', color: '#fff' }}>📎 {t.media_type || 'Media'}</span>
                      )}
                      {t.buttons && t.buttons.length > 0 && (
                        <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: '#4b5563', color: '#e5e7eb' }}>
                          🔘 {t.buttons.length} Btn ({t.buttons_mode === 'native' ? 'Native' : 'Text'})
                        </span>
                      )}
                      <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: '#eab308', color: '#000', marginLeft: 'auto' }}>🔥 Used {t.usage_count || 0}x</span>
                    </div>
                    <div className="template-item-text" style={{ color: '#ccc', fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{t.text}</div>
                    {t.buttons && t.buttons.length > 0 && (
                      <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                        {t.buttons.map((btn, bIdx) => (
                          <span key={bIdx} style={{ fontSize: '0.7rem', padding: '1px 5px', borderRadius: '4px', background: '#2d1e3d', border: '1px solid #4a3461', color: '#d8b4fe' }}>
                            {btn.button_type === 'url' ? '🔗' : '🔘'} {btn.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="template-item-delete-btn"
                    title="Delete Template"
                    onClick={() => handleDeleteTemplate(t.id)}
                    style={{ background: 'none', border: 'none', color: '#ff4d4d', cursor: 'pointer', fontSize: '1.1rem' }}
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* WhatsApp Logout Session */}
      <div className="settings-danger-card" style={{ marginBottom: '20px' }}>
        <div className="settings-danger-header">
          <div className="settings-danger-info">
            <span className="settings-danger-name">WhatsApp Session Logout</span>
            <span className="settings-danger-desc">
              Disconnect the WhatsApp connection, wipe authentication files from disk/DB, and stop reconnect loops.
            </span>
          </div>
          <button
            className="btn btn-danger btn-sm"
            disabled={loggingOut}
            onClick={handleWhatsAppLogout}
            style={{ alignSelf: 'center', whiteSpace: 'nowrap' }}
          >
            {loggingOut ? 'Logging out...' : 'Disconnect Bot'}
          </button>
        </div>
      </div>
    </>
  );
}
