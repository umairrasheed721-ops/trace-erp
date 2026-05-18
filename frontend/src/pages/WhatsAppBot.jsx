import React, { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'

export default function WhatsAppBot() {
  const { addToast } = useApp()
  const [status, setStatus] = useState(null)
  const [queueData, setQueueData] = useState(null)
  const [settings, setSettings] = useState({
    mode: 'live',
    cod_verification_enabled: 1,
    attempted_delivery_enabled: 1,
    dispatch_alerts_enabled: 1,
    min_delay_sec: 5,
    max_delay_sec: 15,
    max_per_hour: 60,
    cooling_period_min: 15,
    cod_template: '',
    attempted_template: '',
    dispatch_template: ''
  })

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testPhone, setTestPhone] = useState('')
  const [testMsg, setTestMsg] = useState('Hello from TRACE ERP!')
  const [sendingTest, setSendingTest] = useState(false)
  const [resetting, setResetting] = useState(false)

  const fetchData = async () => {
    try {
      const [statusRes, queueRes, settingsRes] = await Promise.all([
        fetch('/api/whatsapp/status', { headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` } }),
        fetch('/api/whatsapp-governance/queue', { headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` } }),
        fetch('/api/whatsapp-governance/settings', { headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` } })
      ])
      
      if (statusRes.ok) setStatus(await statusRes.json())
      if (queueRes.ok) setQueueData(await queueRes.json())
      if (settingsRes.ok) {
        const s = await settingsRes.json()
        if (s && Object.keys(s).length > 0) {
          setSettings(prev => ({ ...prev, ...s }))
        }
      }
      setLoading(false)
    } catch (err) {
      console.error('Failed to fetch WA governance data', err)
    }
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 4000)
    return () => clearInterval(interval)
  }, [])

  const handleSaveSettings = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/whatsapp-governance/settings', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('trace_token')}`
        },
        body: JSON.stringify(settings)
      })
      const data = await res.json()
      if (data.success) {
        addToast('✅ Governance settings & templates saved!', 'success')
      } else {
        addToast(data.error || 'Failed to save settings', 'error')
      }
    } catch (err) {
      addToast('Network error saving settings', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleTogglePause = async () => {
    try {
      const res = await fetch('/api/whatsapp-governance/queue/pause', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
      })
      const data = await res.json()
      if (data.success) {
        addToast(data.isPaused ? '⏸️ Master Queue Paused!' : '▶️ Master Queue Resumed!', 'success')
        setQueueData(prev => ({ ...prev, isPaused: data.isPaused }))
      }
    } catch (err) {
      addToast('Failed to toggle pause', 'error')
    }
  }

  const handleClearQueue = async () => {
    if (!window.confirm('Are you sure you want to clear all pending outgoing messages?')) return
    try {
      const res = await fetch('/api/whatsapp-governance/queue/clear', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
      })
      const data = await res.json()
      if (data.success) {
        addToast(`🗑️ Cleared ${data.count} queued messages!`, 'success')
        setQueueData(prev => ({ ...prev, queueCount: 0 }))
      }
    } catch (err) {
      addToast('Failed to clear queue', 'error')
    }
  }

  const handleSendTest = async () => {
    if (!testPhone) return addToast('Enter a phone number', 'error')
    setSendingTest(true)
    try {
      const res = await fetch('/api/whatsapp/send-test', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('trace_token')}`
        },
        body: JSON.stringify({ phone: testPhone, message: testMsg })
      })
      const data = await res.json()
      if (data.success) {
        addToast('✅ Test message sent!', 'success')
      } else {
        addToast(data.error || 'Failed to send', 'error')
      }
    } catch (err) {
      addToast('Network error', 'error')
    } finally {
      setSendingTest(false)
    }
  }

  const handleReset = async () => {
    if (!window.confirm('This will disconnect the bot and clear the saved session. You will need to scan a new QR code. Continue?')) return
    setResetting(true)
    try {
      const res = await fetch('/api/whatsapp/reset', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
      })
      const data = await res.json()
      if (data.success) {
        addToast('✅ Session reset! Scan the new QR code below.', 'success')
        setStatus(prev => ({ ...prev, status: 'CONNECTING', qrCode: null }))
      } else {
        addToast(data.error || 'Reset failed', 'error')
      }
    } catch (err) {
      addToast('Network error during reset', 'error')
    } finally {
      setResetting(false)
    }
  }

  if (loading) return <div className="loading-overlay">⌛ Loading WhatsApp Governance Portal...</div>

  const isConnected = status?.status === 'CONNECTED'
  const isQrReady = status?.status === 'QR_READY'
  const isFailed = status?.status === 'FAILURE'
  const isConnecting = status?.status === 'CONNECTING'
  const statusColor = isConnected ? 'var(--green)' : isQrReady ? 'var(--orange)' : isFailed ? 'var(--red)' : 'var(--orange)'

  return (
    <div className="fade-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>📱 WhatsApp Governance & Anti-Ban Portal</h2>
          <p>Centralized Command Center for Baileys Live Automation, Anti-Ban Pacing, and Simulation Rules</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ 
            padding: '8px 16px', 
            borderRadius: 30, 
            background: settings.mode === 'live' ? 'var(--green-dim)' : 'var(--orange-dim)',
            border: `1px solid ${settings.mode === 'live' ? 'var(--green)' : 'var(--orange)'}`,
            color: settings.mode === 'live' ? 'var(--green)' : 'var(--orange)',
            fontWeight: 800,
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: settings.mode === 'live' ? 'var(--green)' : 'var(--orange)' }}></span>
            MODE: {settings.mode.toUpperCase()} {settings.mode === 'live' ? '(Baileys Active)' : '(Simulated Logs)'}
          </div>
          <button 
            className="btn btn-primary" 
            disabled={saving} 
            onClick={handleSaveSettings}
            style={{ padding: '10px 24px', fontWeight: 700 }}
          >
            {saving ? '⌛ Saving...' : '💾 Save All Settings'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* ZONE A: Message Authority & Template Control */}
        <div className="card lg:col-span-2 glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
            <h3 className="card-title" style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              🎛️ Zone A: Message Authority & Template Control
            </h3>
            <p className="text-muted" style={{ fontSize: '0.8rem' }}>
              Define exactly which automated workflows are permitted to fire and customize their exact message templates.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4" style={{ background: 'var(--bg-active)', padding: 16, borderRadius: 12 }}>
            <div>
              <label style={{ fontWeight: 700, marginBottom: 8, display: 'block' }}>🚀 Master Execution Mode</label>
              <select 
                className="premium-input w-full"
                value={settings.mode}
                onChange={e => setSettings({ ...settings, mode: e.target.value })}
                style={{ fontWeight: 700, color: settings.mode === 'live' ? 'var(--green)' : 'var(--orange)' }}
              >
                <option value="live">🟢 LIVE MODE (Dispatch via Baileys Bot)</option>
                <option value="simulation">🟡 SIMULATION MODE (Mock DB Updates Only)</option>
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={settings.cod_verification_enabled === 1}
                  onChange={e => setSettings({ ...settings, cod_verification_enabled: e.target.checked ? 1 : 0 })}
                  style={{ width: 18, height: 18 }}
                />
                <span>Enable COD Order Verification Challenge</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={settings.attempted_delivery_enabled === 1}
                  onChange={e => setSettings({ ...settings, attempted_delivery_enabled: e.target.checked ? 1 : 0 })}
                  style={{ width: 18, height: 18 }}
                />
                <span>Enable Courier Attempted Delivery Rescue Alerts</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={settings.dispatch_alerts_enabled === 1}
                  onChange={e => setSettings({ ...settings, dispatch_alerts_enabled: e.target.checked ? 1 : 0 })}
                  style={{ width: 18, height: 18 }}
                />
                <span>Enable Order Dispatch & Tracking Alerts</span>
              </label>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-group">
              <label style={{ fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                <span>💬 COD Order Verification Template</span>
                <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>Variables: {'{ref}'}, {'{amount}'}</span>
              </label>
              <textarea 
                className="premium-input" 
                rows={3}
                value={settings.cod_template}
                onChange={e => setSettings({ ...settings, cod_template: e.target.value })}
                placeholder="👋 Hello from Trace ERP! We have received your COD order #{ref} for Rs. {amount}..."
              />
            </div>

            <div className="form-group">
              <label style={{ fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                <span>⚠️ Courier Attempted Delivery Rescue Template</span>
                <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>Variables: {'{tracking}'}, {'{link}'}</span>
              </label>
              <textarea 
                className="premium-input" 
                rows={3}
                value={settings.attempted_template}
                onChange={e => setSettings({ ...settings, attempted_template: e.target.value })}
                placeholder="⚠️ Urgent: Our rider tried to deliver your parcel ({tracking}) today but couldn't reach you..."
              />
            </div>

            <div className="form-group">
              <label style={{ fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                <span>📦 Order Dispatch Alert Template</span>
                <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>Variables: {'{ref}'}, {'{courier}'}, {'{tracking}'}, {'{link}'}</span>
              </label>
              <textarea 
                className="premium-input" 
                rows={3}
                value={settings.dispatch_template}
                onChange={e => setSettings({ ...settings, dispatch_template: e.target.value })}
                placeholder="📦 Your order #{ref} has been dispatched via {courier}..."
              />
            </div>
          </div>
        </div>

        {/* ZONE B: Anti-Ban & Security Studio */}
        <div className="card glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
            <h3 className="card-title" style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              🛡️ Zone B: Anti-Ban Studio
            </h3>
            <p className="text-muted" style={{ fontSize: '0.8rem' }}>
              Protect your WhatsApp number from Meta's ban algorithms by enforcing human-like pacing and hourly limits.
            </p>
          </div>

          <div className="form-group">
            <label style={{ fontWeight: 700, display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span>⏱️ Minimum Pacing Delay</span>
              <span style={{ color: 'var(--primary)' }}>{settings.min_delay_sec} seconds</span>
            </label>
            <input 
              type="range" 
              min="2" 
              max="15" 
              value={settings.min_delay_sec}
              onChange={e => setSettings({ ...settings, min_delay_sec: Number(e.target.value) })}
              style={{ width: '100%', accentColor: 'var(--primary)' }}
            />
            <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: 4 }}>Minimum wait time before sending the next queued message.</p>
          </div>

          <div className="form-group">
            <label style={{ fontWeight: 700, display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span>⏱️ Maximum Pacing Delay</span>
              <span style={{ color: 'var(--primary)' }}>{settings.max_delay_sec} seconds</span>
            </label>
            <input 
              type="range" 
              min="5" 
              max="30" 
              value={settings.max_delay_sec}
              onChange={e => setSettings({ ...settings, max_delay_sec: Number(e.target.value) })}
              style={{ width: '100%', accentColor: 'var(--primary)' }}
            />
            <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: 4 }}>Maximum random wait time to mimic natural human typing.</p>
          </div>

          <div className="form-group">
            <label style={{ fontWeight: 700, marginBottom: 8, display: 'block' }}>📊 Hourly Safety Cap (Max Messages/Hr)</label>
            <input 
              type="number" 
              className="premium-input w-full" 
              value={settings.max_per_hour}
              onChange={e => setSettings({ ...settings, max_per_hour: Number(e.target.value) })}
            />
            <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: 4 }}>Bot automatically pauses if this limit is reached within 60 minutes.</p>
          </div>

          <div className="form-group">
            <label style={{ fontWeight: 700, marginBottom: 8, display: 'block' }}>💤 Forced Cooling Period (Minutes)</label>
            <input 
              type="number" 
              className="premium-input w-full" 
              value={settings.cooling_period_min}
              onChange={e => setSettings({ ...settings, cooling_period_min: Number(e.target.value) })}
            />
            <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: 4 }}>Duration the bot rests when the hourly safety cap is triggered.</p>
          </div>

          <div style={{ background: 'var(--bg-active)', padding: 16, borderRadius: 12, borderLeft: '4px solid var(--primary)' }}>
            <h4 style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 4 }}>💡 Anti-Ban Best Practice</h4>
            <p style={{ fontSize: '0.78rem', opacity: 0.8, lineHeight: 1.6 }}>
              Keep pacing delay between 5–15 seconds and hourly cap under 80 messages for new WhatsApp numbers to build trust score.
            </p>
          </div>
        </div>
      </div>

      {/* ZONE C: Live Queue & Operational Radar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="card-title" style={{ marginBottom: 0 }}>🔌 Baileys Connection Radar</div>
            <button
              className="btn btn-danger"
              style={{ fontSize: '0.75rem', padding: '6px 14px', opacity: resetting ? 0.6 : 1 }}
              disabled={resetting}
              onClick={handleReset}
            >
              {resetting ? '⌛ Resetting...' : '🔄 Reset Session'}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 15, height: 15, borderRadius: '50%', background: statusColor, boxShadow: `0 0 10px ${statusColor}` }}></div>
            <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>{status?.status || 'DISCONNECTED'}</span>
            {status?.reconnectAttempts > 0 && <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>(attempt {status.reconnectAttempts}/5)</span>}
          </div>

          {isQrReady && status?.qrCode && (
            <div style={{ textAlign: 'center', background: '#fff', padding: 20, borderRadius: 12 }}>
               <p style={{ color: '#000', marginBottom: 10, fontWeight: 700 }}>📱 Scan this QR with your WhatsApp</p>
               <img src={status.qrCode} alt="WhatsApp QR" style={{ width: 250, height: 250, margin: '0 auto' }} />
               <p style={{ color: '#666', fontSize: '0.8rem', marginTop: 10 }}>Open WhatsApp → Settings → Linked Devices → Link a Device</p>
            </div>
          )}

          {isConnected && (
            <div className="success-banner" style={{ background: 'var(--green-dim)', border: '1px solid var(--green)', color: 'var(--green)', padding: 15, borderRadius: 12 }}>
               ✅ Bot is active and logged in via WebSockets.
            </div>
          )}

          {isFailed && (
            <div style={{ background: 'rgba(255,60,60,0.1)', border: '1px solid var(--red)', color: 'var(--red)', padding: 15, borderRadius: 12 }}>
               ❌ Bot failed to connect. Click "Reset Session" to clear and scan a fresh QR.
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 8 }}>
            <h4 style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 12 }}>🛠️ Direct Test Messaging</h4>
            <div className="form-group mb-3">
              <input className="premium-input w-full" placeholder="Phone (923...)" value={testPhone} onChange={e => setTestPhone(e.target.value)} />
            </div>
            <div className="form-group mb-3">
              <textarea className="premium-input w-full" rows={2} value={testMsg} onChange={e => setTestMsg(e.target.value)} />
            </div>
            <button className="btn btn-primary w-full" disabled={sendingTest || !isConnected} onClick={handleSendTest}>
              {sendingTest ? '⌛ Sending...' : '🚀 Send Direct Test Message'}
            </button>
          </div>
        </div>

        <div className="card lg:col-span-2 glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
            <h3 className="card-title" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              📡 Zone C: Live Queue & Operational Radar
            </h3>
            <div style={{ display: 'flex', gap: 10 }}>
              <button 
                className={`btn ${queueData?.isPaused ? 'btn-success' : 'btn-warning'}`}
                onClick={handleTogglePause}
                style={{ padding: '6px 14px', fontSize: '0.8rem', fontWeight: 700 }}
              >
                {queueData?.isPaused ? '▶️ Resume Master Queue' : '⏸️ Master Emergency Pause'}
              </button>
              <button 
                className="btn btn-danger"
                onClick={handleClearQueue}
                style={{ padding: '6px 14px', fontSize: '0.8rem', fontWeight: 700 }}
              >
                🗑️ Clear Queue
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div style={{ background: 'var(--bg-active)', padding: 16, borderRadius: 12, textAlign: 'center' }}>
               <div style={{ fontSize: '0.8rem', opacity: 0.6, fontWeight: 700, marginBottom: 4 }}>PENDING QUEUE</div>
               <div style={{ fontSize: '1.8rem', fontWeight: 800, color: queueData?.queueCount > 0 ? 'var(--orange)' : 'var(--text)' }}>
                 {queueData?.queueCount || 0}
               </div>
            </div>
            <div style={{ background: 'var(--bg-active)', padding: 16, borderRadius: 12, textAlign: 'center' }}>
               <div style={{ fontSize: '0.8rem', opacity: 0.6, fontWeight: 700, marginBottom: 4 }}>SENT THIS HOUR</div>
               <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--green)' }}>
                 {queueData?.hourlyCount || 0} <span style={{ fontSize: '1rem', opacity: 0.5 }}>/ {settings.max_per_hour}</span>
               </div>
            </div>
            <div style={{ background: 'var(--bg-active)', padding: 16, borderRadius: 12, textAlign: 'center' }}>
               <div style={{ fontSize: '0.8rem', opacity: 0.6, fontWeight: 700, marginBottom: 4 }}>QUEUE STATUS</div>
               <div style={{ fontSize: '1.4rem', fontWeight: 800, color: queueData?.isPaused ? 'var(--red)' : 'var(--green)', marginTop: 4 }}>
                 {queueData?.isPaused ? 'PAUSED ⏸️' : 'ACTIVE ▶️'}
               </div>
            </div>
          </div>

          <div>
            <h4 style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
              <span>📜 Live Delivery Audit Radar (Recent Dispatches)</span>
              <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>Auto-updates every 4s</span>
            </h4>
            <div style={{ maxHeight: 300, overflowY: 'auto', background: 'var(--bg-active)', borderRadius: 12, border: '1px solid var(--border)' }}>
              {queueData?.auditLogs && queueData.auditLogs.length > 0 ? (
                <table className="w-full" style={{ fontSize: '0.85rem' }}>
                  <thead style={{ background: 'var(--bg-header)', position: 'sticky', top: 0 }}>
                    <tr>
                      <th style={{ padding: '10px 16px', textAlign: 'left' }}>Time</th>
                      <th style={{ padding: '10px 16px', textAlign: 'left' }}>Phone</th>
                      <th style={{ padding: '10px 16px', textAlign: 'left' }}>Status</th>
                      <th style={{ padding: '10px 16px', textAlign: 'left' }}>Diagnostic / Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queueData.auditLogs.map((log, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-dim)' }}>
                        <td style={{ padding: '10px 16px', opacity: 0.7 }}>{log.time}</td>
                        <td style={{ padding: '10px 16px', fontWeight: 700 }}>+{log.phone}</td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{ 
                            padding: '4px 8px', 
                            borderRadius: 20, 
                            fontSize: '0.75rem', 
                            fontWeight: 700,
                            background: log.status === 'Sent' ? 'var(--green-dim)' : 'var(--red-dim)',
                            color: log.status === 'Sent' ? 'var(--green)' : 'var(--red)'
                          }}>
                            {log.status}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px', opacity: 0.8, color: log.error ? 'var(--red)' : 'inherit' }}>
                          {log.error || 'OK — Delivered to Baileys Socket'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: 30, textAlign: 'center', opacity: 0.5, fontSize: '0.85rem' }}>
                  No messages dispatched in this session yet. Active audit logs will appear here.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
