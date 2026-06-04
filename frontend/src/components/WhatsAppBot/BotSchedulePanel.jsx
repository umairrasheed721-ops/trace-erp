import React from 'react'

export default function BotSchedulePanel({
  activeSubTabB,
  setActiveSubTabB,
  settings,
  setSettings
}) {
  return (
    <div className="card glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: 24, animation: 'fadeIn 0.3s ease-in-out' }}>
      {/* Sub-Tabs Navigation */}
      <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid #334155', paddingBottom: 16, overflowX: 'auto' }}>
        {[
          { id: 'pacing', label: '⏱️ Pacing & Delay Engine' },
          { id: 'hourly', label: '📊 Hourly Cap & Cooling' },
          { id: 'best_practices', label: '💡 Anti-Ban Best Practices' },
        ].map(sub => (
          <button
            key={sub.id}
            onClick={() => setActiveSubTabB(sub.id)}
            style={{
              padding: '10px 20px',
              borderRadius: 12,
              background: activeSubTabB === sub.id ? '#334155' : 'transparent',
              color: activeSubTabB === sub.id ? '#fff' : '#64748b',
              fontWeight: 700,
              fontSize: '0.85rem',
              border: activeSubTabB === sub.id ? '1px solid #475569' : '1px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap'
            }}
          >
            {sub.label}
          </button>
        ))}
      </div>

      {/* Sub-Tab B1: Pacing & Delay Engine */}
      {activeSubTabB === 'pacing' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <h4 style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 4 }}>⏱️ Human-Like Pacing & Delay Engine</h4>
            <p className="text-muted" style={{ fontSize: '0.85rem' }}>Inject randomized delays between automated broadcasts to simulate natural human typing speeds.</p>
          </div>

          <div className="form-group" style={{ background: 'var(--bg-active)', padding: 24, borderRadius: 20, border: '1px solid var(--border)' }}>
            <label style={{ fontWeight: 800, display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: '0.95rem' }}>
              <span>⏱️ Minimum Pacing Delay</span>
              <span style={{ color: 'var(--primary)', fontWeight: 800, fontSize: '1.1rem' }}>{settings.min_delay_sec} seconds</span>
            </label>
            <input 
              type="range" 
              min="2" 
              max="15" 
              value={settings.min_delay_sec}
              onChange={e => setSettings({ ...settings, min_delay_sec: Number(e.target.value) })}
              style={{ width: '100%', accentColor: 'var(--primary)', height: 8, borderRadius: 4 }}
            />
            <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 8 }}>Absolute minimum wait time before the queue processor dispatches the next pending message.</p>
          </div>

          <div className="form-group" style={{ background: 'var(--bg-active)', padding: 24, borderRadius: 20, border: '1px solid var(--border)' }}>
            <label style={{ fontWeight: 800, display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: '0.95rem' }}>
              <span>⏱️ Maximum Pacing Delay</span>
              <span style={{ color: 'var(--primary)', fontWeight: 800, fontSize: '1.1rem' }}>{settings.max_delay_sec} seconds</span>
            </label>
            <input 
              type="range" 
              min="5" 
              max="30" 
              value={settings.max_delay_sec}
              onChange={e => setSettings({ ...settings, max_delay_sec: Number(e.target.value) })}
              style={{ width: '100%', accentColor: 'var(--primary)', height: 8, borderRadius: 4 }}
            />
            <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 8 }}>Maximum upper bound for the randomized delay calculation. Ensures broadcasts appear highly organic.</p>
          </div>
        </div>
      )}

      {/* Sub-Tab B2: Hourly Cap & Cooling */}
      {activeSubTabB === 'hourly' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <h4 style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 4 }}>📊 Hourly Safety Cap & Cooling Period</h4>
            <p className="text-muted" style={{ fontSize: '0.85rem' }}>Prevent automated spam detection by enforcing hard limits on outgoing message volume per hour.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="form-group" style={{ background: 'var(--bg-active)', padding: 24, borderRadius: 20, border: '1px solid var(--border)' }}>
              <label style={{ fontWeight: 800, marginBottom: 12, display: 'block', fontSize: '0.95rem' }}>📊 Hourly Safety Cap (Max Messages/Hr)</label>
              <input 
                type="number" 
                className="premium-input w-full" 
                value={settings.max_per_hour}
                onChange={e => setSettings({ ...settings, max_per_hour: Number(e.target.value) })}
                style={{ fontSize: '1.1rem', fontWeight: 800, padding: '12px 16px' }}
              />
              <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 8 }}>Bot automatically pauses outgoing broadcasts if this threshold is reached within a rolling 60-minute window.</p>
            </div>

            <div className="form-group" style={{ background: 'var(--bg-active)', padding: 24, borderRadius: 20, border: '1px solid var(--border)' }}>
              <label style={{ fontWeight: 800, marginBottom: 12, display: 'block', fontSize: '0.95rem' }}>💤 Forced Cooling Period (Minutes)</label>
              <input 
                type="number" 
                className="premium-input w-full" 
                value={settings.cooling_period_min}
                onChange={e => setSettings({ ...settings, cooling_period_min: Number(e.target.value) })}
                style={{ fontSize: '1.1rem', fontWeight: 800, padding: '12px 16px' }}
              />
              <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 8 }}>Exact duration the queue processor rests in a dormant state when the hourly safety cap is triggered.</p>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Tab B3: Best Practices */}
      {activeSubTabB === 'best_practices' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <h4 style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 4 }}>💡 Meta Anti-Ban Trust Score Architecture</h4>
            <p className="text-muted" style={{ fontSize: '0.85rem' }}>Understand how Meta classifies companion devices and how to maintain a pristine sender reputation.</p>
          </div>

          <div style={{ background: 'var(--bg-active)', padding: 28, borderRadius: 20, borderLeft: '4px solid var(--primary)', display: 'flex', flexDirection: 'column', gap: 16, border: '1px solid var(--border)' }}>
            <h5 style={{ fontWeight: 800, fontSize: '1rem', color: '#fff', margin: 0 }}>🛡️ 5 Golden Rules of Companion Device Automation</h5>
            <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 12, color: '#cbd5e1', fontSize: '0.9rem', lineHeight: 1.6 }}>
              <li><strong style={{ color: '#fff' }}>Warm Up New Numbers:</strong> Never send 100+ broadcasts on day 1. Start with 20–30 messages per day and gradually increase over 14 days.</li>
              <li><strong style={{ color: '#fff' }}>Encourage Two-Way Chat:</strong> Meta rewards accounts where customers reply. Our COD verification challenge template specifically asks for a 'YES' reply, dramatically boosting your trust score!</li>
              <li><strong style={{ color: '#fff' }}>Maintain 5–15s Pacing:</strong> Sending messages at 0ms intervals is an instant red flag for Meta's bot-detection heuristics.</li>
              <li><strong style={{ color: '#fff' }}>Avoid Unsolicited Cold Outreach:</strong> Only message customers who have actively placed an order or opted in on your store checkout.</li>
              <li><strong style={{ color: '#fff' }}>Monitor Disconnection Codes:</strong> If Baileys disconnects with a 401/LoggedOut code, do not force-reconnect immediately. Inspect your message content for potential user reports.</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  )
}
