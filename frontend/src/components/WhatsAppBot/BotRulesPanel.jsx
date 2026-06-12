import React, { useState } from 'react'

export default function BotRulesPanel({
  activeSubTabA,
  setActiveSubTabA,
  settings,
  setSettings
}) {
  const [activeTab, setActiveTab] = useState('master');

  const handleSettingChange = async (settingKey, newValue) => {
    const valueToStore = typeof newValue === 'boolean' ? (newValue ? 1 : 0) : newValue;
    const previousValue = settings[settingKey];

    // 1. Optimistic UI Update: Instantly update local state so the UI feels fast
    setSettings(prev => ({ ...prev, [settingKey]: valueToStore }));

    try {
      // 2. Make the API call to save to the backend database
      // Merge with the local state to send the full updated settings object
      const updatedSettings = { ...settings, [settingKey]: valueToStore };
      const response = await fetch('/api/whatsapp-governance/settings', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('trace_token')}`
        },
        body: JSON.stringify(updatedSettings)
      });

      if (!response.ok) throw new Error('Failed to save to database');
    } catch (error) {
      console.error('Settings update failed:', error);
      // 3. Rollback: If API fails, revert the state to its previous value
      setSettings(prev => ({ ...prev, [settingKey]: previousValue }));
    }
  };

  return (
    <div className="card glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: 24, animation: 'fadeIn 0.3s ease-in-out' }}>
      {/* Sub-Tabs Navigation */}
      <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid #334155', paddingBottom: 16, overflowX: 'auto' }}>
        {[
          { id: 'master',         label: '⚙️ Master Authority & Rules' },
          { id: 'cod_template',   label: '💬 COD Verification Template' },
          { id: 'courier_rescue', label: '⚠️ Courier Rescue Template' },
          { id: 'dispatch_alert', label: '📦 Dispatch Alert Template' },
          { id: 'auto_responder', label: '🔀 Auto-Responder Rules' },
          { id: 'feedback',       label: '⭐ Feedback & Cross-Sell Template' }
        ].map(sub => (
          <button
            key={sub.id}
            onClick={() => setActiveTab(sub.id)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
              activeTab === sub.id 
                ? 'bg-gray-800 text-white border border-gray-700 shadow-sm' 
                : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
            }`}
            style={{
              padding: '10px 20px',
              borderRadius: 12,
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            {sub.label}
          </button>
        ))}
      </div>

      {/* Content Area with Conditional Rendering */}
      <div className="mt-6">
        {/* Tab A1: Master Authority & Rules */}
        {activeTab === 'master' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h4 style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 4 }}>⚙️ Master Execution Authority</h4>
              <p className="text-muted" style={{ fontSize: '0.85rem' }}>Define exactly which automated event triggers are permitted to broadcast messages.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6" style={{ background: 'var(--bg-active)', padding: 24, borderRadius: 20, border: '1px solid var(--border)' }}>
              <div>
                <label style={{ fontWeight: 800, marginBottom: 10, display: 'block', fontSize: '0.95rem' }}>🚀 Master Execution Mode</label>
                <select 
                  className="premium-input w-full"
                  value={settings.mode}
                  onChange={e => handleSettingChange('mode', e.target.value)}
                  style={{ fontWeight: 800, color: settings.mode === 'live' ? 'var(--green)' : 'var(--orange)', fontSize: '0.95rem', padding: '12px 16px' }}
                >
                  <option value="live">🟢 LIVE MODE (Instant Dispatch via Baileys Bot)</option>
                  <option value="simulation">🟡 SIMULATION MODE (Mock Database Logs Only)</option>
                </select>
                <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: 8 }}>Simulation mode is excellent for testing workflows without messaging actual customers.</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Automated Controls */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, borderBottom: '1px solid var(--border)', paddingBottom: 16 }}>
                  <h5 style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 4px 0' }}>🤖 Automated Bot Controls</h5>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 12, fontWeight: 700, cursor: 'pointer', fontSize: '0.95rem' }}>
                    <input 
                      type="checkbox" 
                      checked={settings.enable_automated_broadcasts !== 0} 
                      onChange={e => handleSettingChange('enable_automated_broadcasts', e.target.checked)} 
                      style={{ width: 20, height: 20, accentColor: 'var(--primary)' }}
                    />
                    <span>Enable Automated Broadcasts (Follows Pacing Rules)</span>
                  </label>
                  <div style={{ paddingLeft: 24, display: 'flex', flexDirection: 'column', gap: 12, opacity: settings.enable_automated_broadcasts !== 0 ? 1 : 0.5, pointerEvents: settings.enable_automated_broadcasts !== 0 ? 'auto' : 'none', transition: 'all 0.2s ease-in-out' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 12, fontWeight: 700, cursor: 'pointer', fontSize: '0.95rem' }}>
                      <input 
                        type="checkbox" 
                        checked={settings.cod_verification_enabled === 1}
                        onChange={e => handleSettingChange('cod_verification_enabled', e.target.checked)}
                        style={{ width: 20, height: 20, accentColor: 'var(--primary)' }}
                      />
                      <span>Enable COD Order Verification Challenge</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 12, fontWeight: 700, cursor: 'pointer', fontSize: '0.95rem' }}>
                      <input 
                        type="checkbox" 
                        checked={settings.attempted_delivery_enabled === 1}
                        onChange={e => handleSettingChange('attempted_delivery_enabled', e.target.checked)}
                        style={{ width: 20, height: 20, accentColor: 'var(--primary)' }}
                      />
                      <span>Enable Courier Attempted Delivery Rescue Alerts</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 12, fontWeight: 700, cursor: 'pointer', fontSize: '0.95rem' }}>
                      <input 
                        type="checkbox" 
                        checked={settings.dispatch_alerts_enabled === 1}
                        onChange={e => handleSettingChange('dispatch_alerts_enabled', e.target.checked)}
                        style={{ width: 20, height: 20, accentColor: 'var(--primary)' }}
                      />
                      <span>Enable Order Dispatch &amp; Tracking Alerts</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 12, fontWeight: 700, cursor: 'pointer', fontSize: '0.95rem' }}>
                      <input 
                        type="checkbox" 
                        checked={settings.enable_cod_reminders !== 0}
                        onChange={e => handleSettingChange('enable_cod_reminders', e.target.checked)}
                        style={{ width: 20, height: 20, accentColor: 'var(--primary)' }}
                      />
                      <span>Enable 24-Hour COD Follow-up Reminders</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 12, fontWeight: 700, cursor: 'pointer', fontSize: '0.95rem' }}>
                      <input 
                        type="checkbox" 
                        checked={settings.enable_post_delivery_feedback === 1} 
                        onChange={e => handleSettingChange('enable_post_delivery_feedback', e.target.checked)} 
                        style={{ width: 20, height: 20, accentColor: 'var(--primary)' }}
                      />
                      <span>Enable Post-Delivery Review Requests</span>
                    </label>
                  </div>
                </div>

                {/* Manual Controls */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <h5 style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--green)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 4px 0' }}>👤 Manual Human Chat Controls</h5>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 12, fontWeight: 700, cursor: 'pointer', fontSize: '0.95rem' }}>
                    <input 
                      type="checkbox" 
                      checked={settings.enable_manual_chat_dispatch !== 0} 
                      onChange={e => handleSettingChange('enable_manual_chat_dispatch', e.target.checked)} 
                      style={{ width: 20, height: 20, accentColor: 'var(--primary)' }}
                    />
                    <span>Enable Manual ERP Chat Dispatch</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 12, fontWeight: 700, cursor: 'pointer', fontSize: '0.95rem' }}>
                    <input 
                      type="checkbox" 
                      checked={settings.vip_bypass_manual !== 0} 
                      onChange={e => handleSettingChange('vip_bypass_manual', e.target.checked)} 
                      style={{ width: 20, height: 20, accentColor: 'var(--primary)' }}
                    />
                    <span>VIP Bypass for Manual ERP Chat (Instant Dispatch, Ignores Pacing)</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab A2: COD Template */}
        {activeTab === 'cod_template' && (
          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ fontWeight: 800, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '1rem' }}>
              <span>💬 COD Order Verification Challenge Template</span>
              <span style={{ fontSize: '0.8rem', background: '#334155', padding: '4px 10px', borderRadius: 10, color: '#94a3b8' }}>Variables: {'{ref}'}, {'{amount}'}, {'{first_name}'}, {'{store_name}'}</span>
            </label>
            <textarea 
              className="premium-input" 
              rows={8}
              value={settings.cod_template}
              onChange={e => setSettings({ ...settings, cod_template: e.target.value })}
              placeholder={`👋 Hello from {store_name}!\nWe have received your COD order #{ref} for Rs. {amount}.\n\nPlease reply with:\n*1* - ✅ Confirm Order\n*2* - ❌ Cancel Order\n*3* - ✏️ Edit Address/Size`}
              style={{ fontSize: '0.95rem', padding: 16, lineHeight: 1.6 }}
            />
            <p className="text-muted" style={{ fontSize: '0.8rem' }}>
              Write your numeric reply options <strong>directly in the message body</strong> above. This message is dispatched automatically when a new COD order is ingested into the Command Center. Customers reply with <code>1</code>, <code>2</code>, or <code>3</code>.
            </p>
          </div>
        )}

        {/* Tab A3: Rescue Template */}
        {activeTab === 'courier_rescue' && (
          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ fontWeight: 800, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '1rem' }}>
              <span>⚠️ Courier Attempted Delivery Rescue Template</span>
              <span style={{ fontSize: '0.8rem', background: '#334155', padding: '4px 10px', borderRadius: 10, color: '#94a3b8' }}>Variables: {'{tracking}'}, {'{link}'}</span>
            </label>
            <textarea 
              className="premium-input" 
              rows={5}
              value={settings.attempted_template}
              onChange={e => setSettings({ ...settings, attempted_template: e.target.value })}
              placeholder="⚠️ Urgent: Our courier partner attempted to deliver your parcel ({tracking}) today but couldn't reach you. Track here: {link}"
              style={{ fontSize: '0.95rem', padding: 16, lineHeight: 1.6 }}
            />
            <p className="text-muted" style={{ fontSize: '0.8rem' }}>Dispatched instantly when courier webhooks report an 'Attempted Delivery' status to prevent RTO (Return to Origin).</p>
          </div>
        )}

        {/* Tab A4: Dispatch Template */}
        {activeTab === 'dispatch_alert' && (
          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ fontWeight: 800, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '1rem' }}>
              <span>📦 Order Dispatch &amp; Tracking Alert Template</span>
              <span style={{ fontSize: '0.8rem', background: '#334155', padding: '4px 10px', borderRadius: 10, color: '#94a3b8' }}>Variables: {'{ref}'}, {'{courier}'}, {'{tracking}'}, {'{link}'}</span>
            </label>
            <textarea 
              className="premium-input" 
              rows={5}
              value={settings.dispatch_template}
              onChange={e => setSettings({ ...settings, dispatch_template: e.target.value })}
              placeholder="📦 Great news! Your order #{ref} has been dispatched via {courier}. Tracking Number: {tracking}. Live tracking: {link}"
              style={{ fontSize: '0.95rem', padding: 16, lineHeight: 1.6 }}
            />
            <p className="text-muted" style={{ fontSize: '0.8rem' }}>Broadcasted automatically when an order is successfully booked and assigned a tracking airway bill.</p>
          </div>
        )}

        {/* Tab A5: Auto-Responder Rules */}
        {activeTab === 'auto_responder' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h4 style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 4 }}>🔀 Dynamic Auto-Responder Rules</h4>
              <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                Map customer reply keywords to automated response messages. Trigger keywords can be specific replies like <code>1</code>, <code>2</code>, <code>3</code>, custom words, or use <code>fallback</code> for unmatched messages.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {(settings.auto_responders || []).map((rule, index) => (
                <div 
                  key={index}
                  style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: 12, 
                    background: 'var(--bg-active)', 
                    padding: 20, 
                    borderRadius: 16, 
                    border: '1px solid var(--border)',
                    position: 'relative'
                  }}
                >
                  <button
                    onClick={() => {
                      const updated = (settings.auto_responders || []).filter((_, i) => i !== index);
                      setSettings({ ...settings, auto_responders: updated });
                    }}
                    style={{
                      position: 'absolute',
                      top: 16,
                      right: 16,
                      background: 'none',
                      border: 'none',
                      color: 'var(--red)',
                      fontSize: '1.1rem',
                      cursor: 'pointer',
                      padding: 4
                    }}
                    title="Delete Rule"
                  >
                    🗑️
                  </button>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4" style={{ paddingRight: 32 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label style={{ fontWeight: 700, fontSize: '0.85rem' }}>Trigger Keyword / Reply Key</label>
                      <input 
                        type="text"
                        className="premium-input"
                        value={rule.trigger || ''}
                        onChange={e => {
                          const updated = [...(settings.auto_responders || [])];
                          updated[index] = { ...updated[index], trigger: e.target.value };
                          setSettings({ ...settings, auto_responders: updated });
                        }}
                        placeholder="e.g. 1, 2, confirm, fallback"
                        style={{ fontSize: '0.9rem', padding: '10px 14px' }}
                      />
                    </div>
                    <div className="md:col-span-2" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label style={{ fontWeight: 700, fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Response Message Text</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Variables: {'{ref}'}, {'{amount}'}, {'{name}'}, {'{store_name}'}</span>
                      </label>
                      <textarea 
                        className="premium-input"
                        rows={3}
                        value={rule.response || ''}
                        onChange={e => {
                          const updated = [...(settings.auto_responders || [])];
                          updated[index] = { ...updated[index], response: e.target.value };
                          setSettings({ ...settings, auto_responders: updated });
                        }}
                        placeholder="Write response message here..."
                        style={{ fontSize: '0.9rem', padding: '12px 14px', lineHeight: 1.5 }}
                      />
                    </div>
                  </div>
                </div>
              ))}

              <button
                onClick={() => {
                  const updated = [...(settings.auto_responders || []), { trigger: '', response: '' }];
                  setSettings({ ...settings, auto_responders: updated });
                }}
                className="btn btn-secondary"
                style={{
                  alignSelf: 'flex-start',
                  padding: '10px 20px',
                  borderRadius: 12,
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  border: '1px dashed var(--border)',
                  background: 'transparent',
                  color: 'var(--text-muted)'
                }}
              >
                ➕ Add New Rule
              </button>
            </div>
          </div>
        )}

        {/* Tab A7: Post-Delivery Feedback & Cross-Sell Template */}
        {activeTab === 'feedback' && (
          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ fontWeight: 800, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '1rem' }}>
              <span>⭐ Feedback &amp; Cross-Sell Template</span>
              <span style={{ fontSize: '0.8rem', background: '#334155', padding: '4px 10px', borderRadius: 10, color: '#94a3b8' }}>Variables: {'{ref}'}, {'{amount}'}, {'{first_name}'}, {'{store_name}'}</span>
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 10, background: settings.enable_post_delivery_feedback === 1 ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${settings.enable_post_delivery_feedback === 1 ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}` }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: settings.enable_post_delivery_feedback === 1 ? 'var(--green)' : '#ef4444' }}>
                {settings.enable_post_delivery_feedback === 1 ? '🟢 ENABLED' : '🔴 DISABLED'}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>— Toggle in Master Authority tab</span>
            </div>
            <textarea 
              className="premium-input" 
              rows={5}
              value={settings.post_delivery_template}
              onChange={e => setSettings({ ...settings, post_delivery_template: e.target.value })}
              placeholder="👋 Hi {first_name}! Kaisa laga aapko TracePK se received aapka parcel? 😍 Apne parcel ki picture ya video hamare sath share karein aur apne next order par payen FLAT 10% OFF! Discount Code: TRACE10 🎁✨"
              style={{ fontSize: '0.95rem', padding: 16, lineHeight: 1.6 }}
            />
            <p className="text-muted" style={{ fontSize: '0.8rem' }}>Sent automatically 24 hours after courier APIs (PostEx/InstaWorld) update order status to 'Delivered' to gather feedback and offer coupon incentives.</p>
          </div>
        )}
      </div>
    </div>
  )
}
