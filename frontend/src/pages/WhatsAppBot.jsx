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

  // --- TABBED NAVIGATION STATE ---
  const [activeMainTab, setActiveMainTab] = useState('zone_c') // zone_c (Radar), zone_a (Templates), zone_b (Anti-Ban)
  const [activeSubTabA, setActiveSubTabA] = useState('rules') // rules, cod, rescue, dispatch
  const [activeSubTabB, setActiveSubTabB] = useState('pacing') // pacing, hourly, best_practices
  const [activeSubTabC, setActiveSubTabC] = useState('connection') // connection, metrics, audit

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
  const statusColor = isConnected ? 'var(--green)' : isQrReady ? 'var(--orange)' : isFailed ? 'var(--red)' : 'var(--orange)'

  return (
    <div className="fade-in">
      {/* Header Section */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2>📱 WhatsApp Governance & Anti-Ban Command Center</h2>
          <p>Next-Gen Multi-Device Automation Studio, Anti-Ban Pacing Engine, and Live Delivery Radar</p>
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
            style={{ padding: '10px 24px', fontWeight: 700, boxShadow: '0 8px 20px -4px rgba(99,102,241,0.4)' }}
          >
            {saving ? '⌛ Saving...' : '💾 Save All Settings'}
          </button>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 28, background: '#1e293b', padding: 8, borderRadius: 20, border: '1px solid #334155', overflowX: 'auto', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)' }}>
        {[
          { id: 'zone_c', label: '📡 Zone C: Live Radar & Audit', icon: '🔴' },
          { id: 'zone_a', label: '🎛️ Zone A: Authority & Templates', icon: '⚙️' },
          { id: 'zone_b', label: '🛡️ Zone B: Anti-Ban Studio', icon: '🛡️' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveMainTab(tab.id)}
            style={{
              flex: 1,
              minWidth: 240,
              padding: '14px 24px',
              borderRadius: 16,
              background: activeMainTab === tab.id ? '#6366f1' : 'transparent',
              color: activeMainTab === tab.id ? '#fff' : '#94a3b8',
              fontWeight: 800,
              fontSize: '0.95rem',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: activeMainTab === tab.id ? '0 10px 25px -5px rgba(99, 102, 241, 0.5)' : 'none'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ========================================== */}
      {/* ZONE C: LIVE RADAR & AUDIT                 */}
      {/* ========================================== */}
      {activeMainTab === 'zone_c' && (
        <div className="card glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: 24, animation: 'fadeIn 0.3s ease-in-out' }}>
          {/* Sub-Tabs Navigation */}
          <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid #334155', paddingBottom: 16, overflowX: 'auto' }}>
            {[
              { id: 'connection', label: '🔌 Connection Radar' },
              { id: 'metrics', label: '📊 Master Queue Metrics' },
              { id: 'audit', label: '📜 Live Delivery Audit' },
            ].map(sub => (
              <button
                key={sub.id}
                onClick={() => setActiveSubTabC(sub.id)}
                style={{
                  padding: '10px 20px',
                  borderRadius: 12,
                  background: activeSubTabC === sub.id ? '#334155' : 'transparent',
                  color: activeSubTabC === sub.id ? '#fff' : '#64748b',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  border: activeSubTabC === sub.id ? '1px solid #475569' : '1px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap'
                }}
              >
                {sub.label}
              </button>
            ))}
          </div>

          {/* Sub-Tab C1: Connection Radar */}
          {activeSubTabC === 'connection' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                <div>
                  <h4 style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 4 }}>🔌 Baileys WebSocket Connection Engine</h4>
                  <p className="text-muted" style={{ fontSize: '0.85rem' }}>Monitor real-time socket health, QR pairing status, and session integrity.</p>
                </div>
                <button
                  className="btn btn-danger"
                  style={{ fontSize: '0.8rem', padding: '8px 18px', fontWeight: 700, opacity: resetting ? 0.6 : 1 }}
                  disabled={resetting}
                  onClick={handleReset}
                >
                  {resetting ? '⌛ Resetting Session...' : '🔄 Reset Baileys Session'}
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: 'var(--bg-active)', padding: 20, borderRadius: 16, border: '1px solid var(--border)' }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: statusColor, boxShadow: `0 0 15px ${statusColor}` }}></div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 800, fontSize: '1.2rem' }}>{status?.status || 'DISCONNECTED'}</span>
                  <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>Current Baileys Multi-Device Status {status?.reconnectAttempts > 0 && `(Reconnect attempt ${status.reconnectAttempts}/5)`}</span>
                </div>
              </div>

              {isQrReady && status?.qrCode && (
                <div style={{ textAlign: 'center', background: '#fff', padding: 28, borderRadius: 20, border: '2px dashed #cbd5e1', maxWidth: 400, margin: '0 auto' }}>
                   <p style={{ color: '#0f172a', marginBottom: 16, fontWeight: 800, fontSize: '1.1rem' }}>📱 Scan QR Code with WhatsApp</p>
                   <img src={status.qrCode} alt="WhatsApp QR" style={{ width: 260, height: 260, margin: '0 auto', borderRadius: 12, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                   <p style={{ color: '#475569', fontSize: '0.85rem', marginTop: 16, fontWeight: 600 }}>Open WhatsApp → Settings → Linked Devices → Link a Device</p>
                </div>
              )}

              {isConnected && (
                <div className="success-banner" style={{ background: 'var(--green-dim)', border: '1px solid var(--green)', color: 'var(--green)', padding: 20, borderRadius: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 12 }}>
                   <span style={{ fontSize: '1.5rem' }}>✅</span> Bot is active, fully authenticated, and listening to live WebSockets.
                </div>
              )}

              {isFailed && (
                <div style={{ background: 'rgba(255,60,60,0.1)', border: '1px solid var(--red)', color: 'var(--red)', padding: 20, borderRadius: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 12 }}>
                   <span style={{ fontSize: '1.5rem' }}>❌</span> Bot failed to connect. Click "Reset Baileys Session" above to clear corrupt auth state and scan a fresh QR.
                </div>
              )}

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 24, marginTop: 12 }}>
                <h4 style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 16 }}>🛠️ Direct Diagnostic Test Messaging</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <input className="premium-input w-full" placeholder="Phone Number (e.g., 923...)" value={testPhone} onChange={e => setTestPhone(e.target.value)} />
                  <input className="premium-input w-full" placeholder="Test Message Content" value={testMsg} onChange={e => setTestMsg(e.target.value)} />
                </div>
                <button className="btn btn-primary" disabled={sendingTest || !isConnected} onClick={handleSendTest} style={{ padding: '10px 24px', fontWeight: 700 }}>
                  {sendingTest ? '⌛ Disptaching to Socket...' : '🚀 Dispatch Direct Test Message'}
                </button>
              </div>
            </div>
          )}

          {/* Sub-Tab C2: Master Queue Metrics */}
          {activeSubTabC === 'metrics' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                <div>
                  <h4 style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 4 }}>📊 Master Queue & Pacing Metrics</h4>
                  <p className="text-muted" style={{ fontSize: '0.85rem' }}>Real-time oversight of pending dispatches, hourly caps, and emergency controls.</p>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button 
                    className={`btn ${queueData?.isPaused ? 'btn-success' : 'btn-warning'}`}
                    onClick={handleTogglePause}
                    style={{ padding: '8px 18px', fontSize: '0.85rem', fontWeight: 700 }}
                  >
                    {queueData?.isPaused ? '▶️ Resume Master Queue' : '⏸️ Master Emergency Pause'}
                  </button>
                  <button 
                    className="btn btn-danger"
                    onClick={handleClearQueue}
                    style={{ padding: '8px 18px', fontSize: '0.85rem', fontWeight: 700 }}
                  >
                    🗑️ Clear Pending Queue
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div style={{ background: 'var(--bg-active)', padding: 24, borderRadius: 20, textAlign: 'center', border: '1px solid var(--border)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                   <div style={{ fontSize: '0.85rem', opacity: 0.6, fontWeight: 800, marginBottom: 8 }}>PENDING QUEUE BUFFER</div>
                   <div style={{ fontSize: '2.5rem', fontWeight: 800, color: queueData?.queueCount > 0 ? 'var(--orange)' : 'var(--text)' }}>
                     {queueData?.queueCount || 0}
                   </div>
                   <div style={{ fontSize: '0.75rem', opacity: 0.5, marginTop: 4 }}>Messages awaiting pacing delay</div>
                </div>
                <div style={{ background: 'var(--bg-active)', padding: 24, borderRadius: 20, textAlign: 'center', border: '1px solid var(--border)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                   <div style={{ fontSize: '0.85rem', opacity: 0.6, fontWeight: 800, marginBottom: 8 }}>SENT THIS HOUR</div>
                   <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--green)' }}>
                     {queueData?.hourlyCount || 0} <span style={{ fontSize: '1.2rem', opacity: 0.5 }}>/ {settings.max_per_hour}</span>
                   </div>
                   <div style={{ fontSize: '0.75rem', opacity: 0.5, marginTop: 4 }}>Resets automatically every 60m</div>
                </div>
                <div style={{ background: 'var(--bg-active)', padding: 24, borderRadius: 20, textAlign: 'center', border: '1px solid var(--border)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                   <div style={{ fontSize: '0.85rem', opacity: 0.6, fontWeight: 800, marginBottom: 8 }}>QUEUE GOVERNANCE STATUS</div>
                   <div style={{ fontSize: '1.8rem', fontWeight: 800, color: queueData?.isPaused ? 'var(--red)' : 'var(--green)', marginTop: 8 }}>
                     {queueData?.isPaused ? 'PAUSED ⏸️' : 'ACTIVE ▶️'}
                   </div>
                   <div style={{ fontSize: '0.75rem', opacity: 0.5, marginTop: 4 }}>{queueData?.isPaused ? 'All dispatches halted' : 'Pacing engine running smoothly'}</div>
                </div>
              </div>
            </div>
          )}

          {/* Sub-Tab C3: Live Delivery Audit */}
          {activeSubTabC === 'audit' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h4 style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 4 }}>📜 Live Delivery Audit Radar</h4>
                  <p className="text-muted" style={{ fontSize: '0.85rem' }}>Verifiable audit log of recent automated dispatches and socket delivery responses.</p>
                </div>
                <span style={{ fontSize: '0.8rem', background: '#334155', padding: '4px 12px', borderRadius: 12, color: '#94a3b8', fontWeight: 700 }}>Auto-updating (4s)</span>
              </div>

              <div style={{ maxHeight: 400, overflowY: 'auto', background: 'var(--bg-active)', borderRadius: 16, border: '1px solid var(--border)', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }}>
                {queueData?.auditLogs && queueData.auditLogs.length > 0 ? (
                  <table className="w-full" style={{ fontSize: '0.85rem' }}>
                    <thead style={{ background: 'var(--bg-header)', position: 'sticky', top: 0, zIndex: 10 }}>
                      <tr>
                        <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 800 }}>Timestamp</th>
                        <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 800 }}>Customer Phone</th>
                        <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 800 }}>Dispatch Status</th>
                        <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 800 }}>Socket Diagnostic Response</th>
                      </tr>
                    </thead>
                    <tbody>
                      {queueData.auditLogs.map((log, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-dim)' }}>
                          <td style={{ padding: '14px 20px', opacity: 0.7 }}>{log.time}</td>
                          <td style={{ padding: '14px 20px', fontWeight: 800 }}>+{log.phone}</td>
                          <td style={{ padding: '14px 20px' }}>
                            <span style={{ 
                              padding: '6px 12px', 
                              borderRadius: 20, 
                              fontSize: '0.75rem', 
                              fontWeight: 800,
                              background: log.status === 'Sent' ? 'var(--green-dim)' : 'var(--red-dim)',
                              color: log.status === 'Sent' ? 'var(--green)' : 'var(--red)'
                            }}>
                              {log.status}
                            </span>
                          </td>
                          <td style={{ padding: '14px 20px', opacity: 0.8, color: log.error ? 'var(--red)' : 'inherit', fontWeight: log.error ? 700 : 500 }}>
                            {log.error || 'OK — Delivered successfully to Baileys WebSocket buffer'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ padding: 40, textAlign: 'center', opacity: 0.5, fontSize: '0.9rem', fontWeight: 600 }}>
                    No automated messages dispatched in this session yet. Outgoing dispatches will appear here instantly.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================== */}
      {/* ZONE A: AUTHORITY & TEMPLATES              */}
      {/* ========================================== */}
      {activeMainTab === 'zone_a' && (
        <div className="card glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: 24, animation: 'fadeIn 0.3s ease-in-out' }}>
          {/* Sub-Tabs Navigation */}
          <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid #334155', paddingBottom: 16, overflowX: 'auto' }}>
            {[
              { id: 'rules', label: '⚙️ Master Authority & Rules' },
              { id: 'cod', label: '💬 COD Verification Template' },
              { id: 'rescue', label: '⚠️ Courier Rescue Template' },
              { id: 'dispatch', label: '📦 Dispatch Alert Template' },
              { id: 'ai', label: '🤖 AI Auto-Responder Studio' },
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

          {/* Sub-Tab A5: AI Auto-Responder Studio */}
          {activeSubTabA === 'ai' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, background: 'var(--bg-active)', padding: 24, borderRadius: 20, border: '1px solid var(--border)' }}>
                <div>
                  <h4 style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 4 }}>🤖 AI Intent Classification & Auto-Responder</h4>
                  <p className="text-muted" style={{ fontSize: '0.85rem' }}>Automatically detect customer intent (Tracking & Landmark Updates) and dispatch instant AI replies.</p>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 12, fontWeight: 800, cursor: 'pointer', fontSize: '1rem', background: settings.ai_responder_enabled === 1 ? 'var(--green-dim)' : 'var(--red-dim)', color: settings.ai_responder_enabled === 1 ? 'var(--green)' : 'var(--red)', padding: '10px 20px', borderRadius: 30, border: `1px solid ${settings.ai_responder_enabled === 1 ? 'var(--green)' : 'var(--red)'}` }}>
                  <input 
                    type="checkbox" 
                    checked={settings.ai_responder_enabled === 1}
                    onChange={e => setSettings({ ...settings, ai_responder_enabled: e.target.checked ? 1 : 0 })}
                    style={{ width: 22, height: 22, accentColor: settings.ai_responder_enabled === 1 ? 'var(--green)' : 'var(--red)' }}
                  />
                  <span>{settings.ai_responder_enabled === 1 ? 'AI RESPONDER ACTIVE 🟢' : 'AI RESPONDER DISABLED 🔴'}</span>
                </label>
              </div>

              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <label style={{ fontWeight: 800, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '1rem' }}>
                  <span>📦 AI Tracking Intent Template ("Mera parcel kahan hai?")</span>
                  <span style={{ fontSize: '0.8rem', background: '#334155', padding: '4px 10px', borderRadius: 10, color: '#94a3b8' }}>Variables: {'{tracking}'}, {'{courier}'}, {'{status}'}, {'{link}'}</span>
                </label>
                <textarea 
                  className="premium-input" 
                  rows={4}
                  value={settings.ai_tracking_template ?? '🤖 [AI Support] Aapka parcel ({tracking}) {courier} ke paas hai. Current status: {status}. Track link: {link}'}
                  onChange={e => setSettings({ ...settings, ai_tracking_template: e.target.value })}
                  placeholder="🤖 [AI Support] Aapka parcel ({tracking}) {courier} ke paas hai. Current status: {status}. Track link: {link}"
                  style={{ fontSize: '0.95rem', padding: 16, lineHeight: 1.6 }}
                />
                <p className="text-muted" style={{ fontSize: '0.8rem' }}>Dispatched automatically when a customer asks about tracking, delivery status, or arrival time.</p>
              </div>

              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <label style={{ fontWeight: 800, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '1rem' }}>
                  <span>📍 AI Landmark & Address Intent Template ("Near Jamia Masjid")</span>
                  <span style={{ fontSize: '0.8rem', background: '#334155', padding: '4px 10px', borderRadius: 10, color: '#94a3b8' }}>Variables: {'{landmark}'}</span>
                </label>
                <textarea 
                  className="premium-input" 
                  rows={4}
                  value={settings.ai_landmark_template ?? '🤖 [AI Support] Shukriya! Aapka nearest landmark ({landmark}) record kar liya gaya hai aur rider ko update kar diya gaya hai.'}
                  onChange={e => setSettings({ ...settings, ai_landmark_template: e.target.value })}
                  placeholder="🤖 [AI Support] Shukriya! Aapka nearest landmark ({landmark}) record kar liya gaya hai aur rider ko update kar diya gaya hai."
                  style={{ fontSize: '0.95rem', padding: 16, lineHeight: 1.6 }}
                />
                <p className="text-muted" style={{ fontSize: '0.8rem' }}>Dispatched instantly when a customer provides delivery instructions, landmarks, or street corrections.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================== */}
      {/* ZONE B: ANTI-BAN STUDIO                    */}
      {/* ========================================== */}
      {activeMainTab === 'zone_b' && (
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
      )}
    </div>
  )
}
