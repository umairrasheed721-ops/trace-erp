import React from 'react'

export default function BotRulesPanel({
  activeSubTabA,
  setActiveSubTabA,
  settings,
  setSettings
}) {
  const [pollOptions, setPollOptions] = React.useState(['✅ Confirm Order', '❌ Cancel Order']);

  React.useEffect(() => {
    if (settings.poll_options) {
      setPollOptions(settings.poll_options);
    }
  }, [settings.poll_options]);

  const updatePollOptions = (newOptions) => {
    setPollOptions(newOptions);
    setSettings(prev => ({ ...prev, poll_options: newOptions }));
  };
  return (
    <div className="card glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: 24, animation: 'fadeIn 0.3s ease-in-out' }}>
      {/* Sub-Tabs Navigation */}
      <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid #334155', paddingBottom: 16, overflowX: 'auto' }}>
        {[
          { id: 'rules', label: '⚙️ Master Authority & Rules' },
          { id: 'cod', label: '💬 COD Verification Template' },
          { id: 'rescue', label: '⚠️ Courier Rescue Template' },
          { id: 'dispatch', label: '📦 Dispatch Alert Template' },
        ].map(sub => (
          <button
            key={sub.id}
            onClick={() => setActiveSubTabA(sub.id)}
            style={{
              padding: '10px 20px',
              borderRadius: 12,
              background: activeSubTabA === sub.id ? '#334155' : 'transparent',
              color: activeSubTabA === sub.id ? '#fff' : '#64748b',
              fontWeight: 700,
              fontSize: '0.85rem',
              border: activeSubTabA === sub.id ? '1px solid #475569' : '1px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap'
            }}
          >
            {sub.label}
          </button>
        ))}
      </div>

      {/* Sub-Tab A1: Master Authority & Rules */}
      {activeSubTabA === 'rules' && (
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
                onChange={e => setSettings({ ...settings, mode: e.target.value })}
                style={{ fontWeight: 800, color: settings.mode === 'live' ? 'var(--green)' : 'var(--orange)', fontSize: '0.95rem', padding: '12px 16px' }}
              >
                <option value="live">🟢 LIVE MODE (Instant Dispatch via Baileys Bot)</option>
                <option value="simulation">🟡 SIMULATION MODE (Mock Database Logs Only)</option>
              </select>
              <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: 8 }}>Simulation mode is excellent for testing workflows without messaging actual customers.</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 12, fontWeight: 700, cursor: 'pointer', fontSize: '0.95rem' }}>
                <input 
                  type="checkbox" 
                  checked={settings.cod_verification_enabled === 1}
                  onChange={e => setSettings({ ...settings, cod_verification_enabled: e.target.checked ? 1 : 0 })}
                  style={{ width: 20, height: 20, accentColor: 'var(--primary)' }}
                />
                <span>Enable COD Order Verification Challenge</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 12, fontWeight: 700, cursor: 'pointer', fontSize: '0.95rem' }}>
                <input 
                  type="checkbox" 
                  checked={settings.attempted_delivery_enabled === 1}
                  onChange={e => setSettings({ ...settings, attempted_delivery_enabled: e.target.checked ? 1 : 0 })}
                  style={{ width: 20, height: 20, accentColor: 'var(--primary)' }}
                />
                <span>Enable Courier Attempted Delivery Rescue Alerts</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 12, fontWeight: 700, cursor: 'pointer', fontSize: '0.95rem' }}>
                <input 
                  type="checkbox" 
                  checked={settings.dispatch_alerts_enabled === 1}
                  onChange={e => setSettings({ ...settings, dispatch_alerts_enabled: e.target.checked ? 1 : 0 })}
                  style={{ width: 20, height: 20, accentColor: 'var(--primary)' }}
                />
                <span>Enable Order Dispatch & Tracking Alerts</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Tab A2: COD Template */}
      {activeSubTabA === 'cod' && (
        <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ fontWeight: 800, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '1rem' }}>
            <span>💬 COD Order Verification Challenge Template</span>
            <span style={{ fontSize: '0.8rem', background: '#334155', padding: '4px 10px', borderRadius: 10, color: '#94a3b8' }}>Variables: {'{ref}'}, {'{amount}'}</span>
          </label>
          <textarea 
            className="premium-input" 
            rows={5}
            value={settings.cod_template}
            onChange={e => setSettings({ ...settings, cod_template: e.target.value })}
            placeholder="👋 Hello from Trace ERP! We have received your COD order #{ref} for Rs. {amount}. Please reply with 'YES' to confirm your order."
            style={{ fontSize: '0.95rem', padding: 16, lineHeight: 1.6 }}
          />
          <p className="text-muted" style={{ fontSize: '0.8rem' }}>This message is dispatched automatically when a new Cash on Delivery order is ingested into the Command Center.</p>

          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ fontWeight: 800, fontSize: '0.95rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>📊 Interactive Poll Options (Optional)</span>
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pollOptions.map((opt, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input
                    type="text"
                    className="premium-input"
                    value={opt}
                    onChange={e => {
                      const copy = [...pollOptions];
                      copy[idx] = e.target.value;
                      updatePollOptions(copy);
                    }}
                    placeholder={`Option ${idx + 1}`}
                    style={{ flex: 1, fontSize: '0.9rem', padding: '10px 14px' }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (pollOptions.length <= 1) return;
                      const copy = pollOptions.filter((_, i) => i !== idx);
                      updatePollOptions(copy);
                    }}
                    disabled={pollOptions.length <= 1}
                    title="Remove Option"
                    style={{
                      background: 'none', border: 'none', color: '#ef4444', 
                      fontSize: '1.2rem', cursor: 'pointer', padding: '4px 8px',
                      opacity: pollOptions.length <= 1 ? 0.3 : 1
                    }}
                  >
                    ✖
                  </button>
                </div>
              ))}
            </div>
            <div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  updatePollOptions([...pollOptions, '']);
                }}
                style={{
                  fontSize: '0.8rem', padding: '6px 12px', display: 'inline-flex',
                  alignItems: 'center', gap: 6, fontWeight: 700
                }}
              >
                ➕ Add Option
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Tab A3: Rescue Template */}
      {activeSubTabA === 'rescue' && (
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

      {/* Sub-Tab A4: Dispatch Template */}
      {activeSubTabA === 'dispatch' && (
        <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ fontWeight: 800, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '1rem' }}>
            <span>📦 Order Dispatch & Tracking Alert Template</span>
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
    </div>
  )
}
