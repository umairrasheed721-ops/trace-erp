import React from 'react'

export default function BotRulesPanel({
  activeSubTabA,
  setActiveSubTabA,
  settings,
  setSettings
}) {
  return (
    <div className="card glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: 24, animation: 'fadeIn 0.3s ease-in-out' }}>
      {/* Sub-Tabs Navigation */}
      <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid #334155', paddingBottom: 16, overflowX: 'auto' }}>
        {[
          { id: 'rules',    label: '⚙️ Master Authority & Rules' },
          { id: 'cod',      label: '💬 COD Verification Template' },
          { id: 'rescue',   label: '⚠️ Courier Rescue Template' },
          { id: 'dispatch', label: '📦 Dispatch Alert Template' },
          { id: 'thankyou', label: '🎉 Thank You Template' },
          { id: 'autoreply',label: '🤖 Auto-Reply Template' },
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
                <span>Enable Order Dispatch &amp; Tracking Alerts</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 12, fontWeight: 700, cursor: 'pointer', fontSize: '0.95rem' }}>
                <input 
                  type="checkbox" 
                  checked={settings.enable_cod_reminders !== 0}
                  onChange={e => setSettings({ ...settings, enable_cod_reminders: e.target.checked ? 1 : 0 })}
                  style={{ width: 20, height: 20, accentColor: 'var(--primary)' }}
                />
                <span>Enable 24-Hour COD Follow-up Reminders</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 12, fontWeight: 700, cursor: 'pointer', fontSize: '0.95rem' }}>
                <input 
                  type="checkbox" 
                  checked={settings.enable_thank_you_msg !== 0}
                  onChange={e => setSettings({ ...settings, enable_thank_you_msg: e.target.checked ? 1 : 0 })}
                  style={{ width: 20, height: 20, accentColor: 'var(--primary)' }}
                />
                <span>Enable 'Thank You' Confirmation Messages</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 12, fontWeight: 700, cursor: 'pointer', fontSize: '0.95rem' }}>
                <input 
                  type="checkbox" 
                  checked={settings.enable_fallback_autoreply === 1}
                  onChange={e => setSettings({ ...settings, enable_fallback_autoreply: e.target.checked ? 1 : 0 })}
                  style={{ width: 20, height: 20, accentColor: 'var(--primary)' }}
                />
                <span>Enable Fallback Auto-Replies (Unrecognized Text)</span>
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

      {/* Sub-Tab A5: Thank You Template */}
      {activeSubTabA === 'thankyou' && (
        <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ fontWeight: 800, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '1rem' }}>
            <span>🎉 Thank You Confirmation Template</span>
            <span style={{ fontSize: '0.8rem', background: '#334155', padding: '4px 10px', borderRadius: 10, color: '#94a3b8' }}>Variables: {'{ref}'}, {'{amount}'}, {'{first_name}'}, {'{store_name}'}</span>
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 10, background: settings.enable_thank_you_msg !== 0 ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${settings.enable_thank_you_msg !== 0 ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}` }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: settings.enable_thank_you_msg !== 0 ? 'var(--green)' : '#ef4444' }}>
              {settings.enable_thank_you_msg !== 0 ? '🟢 ENABLED' : '🔴 DISABLED'}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>— Toggle in Master Authority tab</span>
          </div>
          <textarea 
            className="premium-input" 
            rows={5}
            value={settings.thank_you_template}
            onChange={e => setSettings({ ...settings, thank_you_template: e.target.value })}
            placeholder="🎉 Thank You! Your order #{ref} is confirmed and will be dispatched via PostEx shortly. 📦👍"
            style={{ fontSize: '0.95rem', padding: 16, lineHeight: 1.6 }}
          />
          <p className="text-muted" style={{ fontSize: '0.8rem' }}>Sent automatically after a customer successfully confirms their COD order via the numeric text-reply system.</p>
        </div>
      )}

      {/* Sub-Tab A6: Fallback Auto-Reply Template */}
      {activeSubTabA === 'autoreply' && (
        <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ fontWeight: 800, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '1rem' }}>
            <span>🤖 Fallback Auto-Reply Template</span>
            <span style={{ fontSize: '0.8rem', background: '#334155', padding: '4px 10px', borderRadius: 10, color: '#94a3b8' }}>No variables — plain text only</span>
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 10, background: settings.enable_fallback_autoreply === 1 ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${settings.enable_fallback_autoreply === 1 ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}` }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: settings.enable_fallback_autoreply === 1 ? 'var(--green)' : '#ef4444' }}>
              {settings.enable_fallback_autoreply === 1 ? '🟢 ENABLED' : '🔴 DISABLED'}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>— Toggle in Master Authority tab</span>
          </div>
          <textarea 
            className="premium-input" 
            rows={5}
            value={settings.fallback_autoreply_template}
            onChange={e => setSettings({ ...settings, fallback_autoreply_template: e.target.value })}
            placeholder="👋 Hello! We have received your message. A human agent will reply shortly. For urgent inquiries, please call us."
            style={{ fontSize: '0.95rem', padding: 16, lineHeight: 1.6 }}
          />
          <p className="text-muted" style={{ fontSize: '0.8rem' }}>Sent when an incoming message does not match any known keyword, reply number, or active conversation session.</p>
        </div>
      )}
    </div>
  )
}
