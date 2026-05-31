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
  const [activeMainTab, setActiveMainTab] = useState('zone_c') // zone_c (Radar), zone_a (Templates), zone_b (Anti-Ban), zone_g (Gemini)
  const [activeSubTabA, setActiveSubTabA] = useState('rules') // rules, cod, rescue, dispatch, ai
  const [activeSubTabB, setActiveSubTabB] = useState('pacing') // pacing, hourly, best_practices
  const [activeSubTabC, setActiveSubTabC] = useState('connection') // connection, metrics, audit

  // --- GEMINI AI STATE ---
  const [activeSubTabG, setActiveSubTabG] = useState('studio') // studio, profiles, tools, audit
  const [geminiSettings, setGeminiSettings] = useState({
    api_key: '',
    ai_active: 1,
    model_name: 'gemini-2.5-flash',
    system_prompt: '',
    strictness: 'balanced',
    auto_learning_enabled: 1
  })
  const [geminiProfiles, setGeminiProfiles] = useState([])
  const [geminiAuditLogs, setGeminiAuditLogs] = useState([])
  const [geminiUsage, setGeminiUsage] = useState(null)
  const [selectedCustomerPhone, setSelectedCustomerPhone] = useState('')
  const [customerMemory, setCustomerMemory] = useState([])
  const [loadingMemory, setLoadingMemory] = useState(false)
  const [showMemoryModal, setShowMemoryModal] = useState(false)
  const [triggeringAudit, setTriggeringAudit] = useState(false)
  const [resetLocks, setResetLocks] = useState(false)

  // --- SIMULATION SANDBOX STATE ---
  const [simPhone, setSimPhone] = useState('923001234567')
  const [simMsg, setSimMsg] = useState('Mera parcel kahan hai?')
  const [simReply, setSimReply] = useState('')
  const [simLoading, setSimLoading] = useState(false)

  const handleSimulateIncoming = async () => {
    if (!simPhone || !simMsg) return addToast('Enter phone and message', 'error')
    setSimLoading(true)
    setSimReply('')
    try {
      const res = await fetch('/api/whatsapp-governance/gemini/simulate-incoming', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('trace_token')}`
        },
        body: JSON.stringify({ phone: simPhone, message: simMsg })
      })
      const data = await res.json()
      if (data.success) {
        setSimReply(data.reply)
        addToast('✅ Simulation complete! Check AI reply below.', 'success')
      } else {
        setSimReply(`❌ Error: ${data.error}`)
        addToast(data.error || 'Simulation failed', 'error')
      }
    } catch (err) {
      setSimReply('❌ Network error during simulation')
      addToast('Network error', 'error')
    } finally {
      setSimLoading(false)
    }
  }

  const fetchData = async () => {
    try {
      const [statusRes, queueRes, settingsRes, gemSetRes, gemProfRes, gemAudRes, gemUsageRes] = await Promise.all([
        fetch('/api/whatsapp/status', { headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` } }),
        fetch('/api/whatsapp-governance/queue', { headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` } }),
        fetch('/api/whatsapp-governance/settings', { headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` } }),
        fetch('/api/whatsapp-governance/gemini/settings', { headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` } }),
        fetch('/api/whatsapp-governance/gemini/profiles', { headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` } }),
        fetch('/api/whatsapp-governance/gemini/audit-logs', { headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` } }),
        fetch('/api/whatsapp-governance/gemini/usage-stats', { headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` } })
      ])
      
      if (statusRes.ok) setStatus(await statusRes.json())
      if (queueRes.ok) setQueueData(await queueRes.json())
      if (settingsRes.ok) {
        const s = await settingsRes.json()
        if (s && Object.keys(s).length > 0) setSettings(prev => ({ ...prev, ...s }))
      }
      if (gemSetRes.ok) {
        const gs = await gemSetRes.json()
        if (gs && Object.keys(gs).length > 0) setGeminiSettings(prev => ({ ...prev, ...gs }))
      }
      if (gemProfRes.ok) {
        const gp = await gemProfRes.json()
        if (gp?.profiles) setGeminiProfiles(gp.profiles)
      }
      if (gemAudRes.ok) {
        const ga = await gemAudRes.json()
        if (ga?.logs) setGeminiAuditLogs(ga.logs)
      }
      if (gemUsageRes.ok) {
        const gu = await gemUsageRes.json()
        if (gu?.success) setGeminiUsage(gu)
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

  const handleSaveGeminiSettings = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/whatsapp-governance/gemini/settings', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('trace_token')}`
        },
        body: JSON.stringify(geminiSettings)
      })
      const data = await res.json()
      if (data.success) {
        addToast('✅ Gemini AI configuration saved successfully!', 'success')
      } else {
        addToast(data.error || 'Failed to save Gemini settings', 'error')
      }
    } catch (err) {
      addToast('Network error saving Gemini settings', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleFetchMemory = async (phone) => {
    setSelectedCustomerPhone(phone)
    setLoadingMemory(true)
    setCustomerMemory([])
    setShowMemoryModal(true)
    try {
      const res = await fetch(`/api/whatsapp-governance/gemini/memory/${phone}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
      })
      const data = await res.json()
      if (data.success) {
        setCustomerMemory(data.memory || [])
      } else if (res.status === 404) {
        setCustomerMemory([])
      } else {
        addToast(data.error || 'Failed to load customer chat memory', 'error')
      }
    } catch (err) {
      addToast('Failed to load customer chat memory', 'error')
    } finally {
      setLoadingMemory(false)
    }
  }


  const handleResetLocks = async () => {
    setResetLocks(true)
    try {
      const res = await fetch('/api/whatsapp-governance/gemini/reset-locks', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
      })
      const data = await res.json()
      if (data.success) addToast(data.message, 'success')
      else addToast('Failed to reset locks', 'error')
    } catch (e) {
      addToast('Error resetting locks', 'error')
    } finally {
      setResetLocks(false)
    }
  }

  const handleTriggerAudit = async () => {
    setTriggeringAudit(true)
    try {
      const res = await fetch('/api/whatsapp-governance/gemini/trigger-audit', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
      })
      const data = await res.json()
      if (data.success) {
        addToast('✅ Nightly AI Audit triggered! System prompt auto-enriched.', 'success')
        fetchData()
      } else {
        addToast(data.error || data.message || 'Audit failed', 'error')
      }
    } catch (err) {
      addToast('Failed to trigger audit', 'error')
    } finally {
      setTriggeringAudit(false)
    }
  }

  if (loading) return <div className="loading-overlay">⌛ Loading WhatsApp Governance Portal...</div>

  const isConnected = status?.status === 'CONNECTED'
  const isQrReady = status?.status === 'QR_READY'
  const isFailed = status?.status === 'FAILURE'
  const isSleeping = status?.status === 'SLEEPING'
  const statusColor = isConnected ? 'var(--green)' : isSleeping ? '#8b5cf6' : isQrReady ? 'var(--orange)' : isFailed ? 'var(--red)' : 'var(--orange)'

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
          { id: 'zone_g', label: '🧠 Zone G: Gemini Autonomous AI', icon: '🧠' },
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
                  <span style={{ fontWeight: 800, fontSize: '1.2rem' }}>{status?.status === 'SLEEPING' ? 'SLEEPING 💤 (Simulating Human Rest)' : (status?.status || 'DISCONNECTED')}</span>
                  <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>Current Baileys Multi-Device Status {status?.reconnectAttempts > 0 && `(Reconnect attempt ${status.reconnectAttempts}/5)`}</span>
                </div>
              </div>

              {isSleeping && (
                <div className="info-banner" style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid #8b5cf6', color: '#a78bfa', padding: 20, borderRadius: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                   <span style={{ fontSize: '1.5rem' }}>💤</span> Bot is simulating human rest. Automated replies are temporarily paused to preserve Meta trust score.
                </div>
              )}

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

      {/* ========================================== */}
      {/* ZONE G: GEMINI AUTONOMOUS AI               */}
      {/* ========================================== */}
      {activeMainTab === 'zone_g' && (
        <div className="card glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: 24, animation: 'fadeIn 0.3s ease-in-out' }}>
          {/* Sub-Tabs Navigation */}
          <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid #334155', paddingBottom: 16, overflowX: 'auto' }}>
            {[
              { id: 'studio', label: '🤖 Gemini AI Studio & Prompts' },
              { id: 'profiles', label: '🗂️ Customer Profiles & Memory' },
              { id: 'tools', label: '🛠️ Tool Calling & Capabilities' },
              { id: 'audit', label: '🌙 Nightly Self-Learning Audit' },
              { id: 'usage', label: '📊 Usage & Quota' },
            ].map(sub => (
              <button
                key={sub.id}
                onClick={() => setActiveSubTabG(sub.id)}
                style={{
                  padding: '10px 20px',
                  borderRadius: 12,
                  background: activeSubTabG === sub.id ? '#6366f1' : 'transparent',
                  color: activeSubTabG === sub.id ? '#fff' : '#64748b',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  border: activeSubTabG === sub.id ? '1px solid #4f46e5' : '1px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap'
                }}
              >
                {sub.label}
              </button>
            ))}
          </div>

          {/* Sub-Tab G1: Gemini AI Studio & Prompts */}
          {activeSubTabG === 'studio' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, background: 'var(--bg-active)', padding: 24, borderRadius: 20, border: '1px solid var(--border)' }}>
                <div>
                  <h4 style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 4 }}>🤖 Gemini 1.5 Autonomous Orchestration Studio</h4>
                  <p className="text-muted" style={{ fontSize: '0.85rem' }}>Empower your WhatsApp bot with advanced RAG memory, multi-turn dialogue, and dynamic tool execution.</p>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 12, fontWeight: 800, cursor: 'pointer', fontSize: '1rem', background: geminiSettings.ai_active === 1 ? 'var(--green-dim)' : 'var(--red-dim)', color: geminiSettings.ai_active === 1 ? 'var(--green)' : 'var(--red)', padding: '10px 20px', borderRadius: 30, border: `1px solid ${geminiSettings.ai_active === 1 ? 'var(--green)' : 'var(--red)'}` }}>
                    <input 
                      type="checkbox" 
                      checked={geminiSettings.ai_active === 1}
                      onChange={e => setGeminiSettings({ ...geminiSettings, ai_active: e.target.checked ? 1 : 0 })}
                      style={{ width: 22, height: 22, accentColor: geminiSettings.ai_active === 1 ? 'var(--green)' : 'var(--red)' }}
                    />
                    <span>{geminiSettings.ai_active === 1 ? '🟢 GEMINI AUTONOMOUS AI ACTIVE' : '🔴 GEMINI AI DISABLED'}</span>
                  </label>
                  <button 
                    className="btn btn-primary"
                    disabled={saving}
                    onClick={handleSaveGeminiSettings}
                    style={{ padding: '10px 24px', fontWeight: 700, borderRadius: 30 }}
                  >
                    {saving ? '⌛ Saving...' : '💾 Save Gemini Settings'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="form-group" style={{ background: 'var(--bg-active)', padding: 24, borderRadius: 20, border: '1px solid var(--border)' }}>
                  <label style={{ fontWeight: 800, marginBottom: 12, display: 'block', fontSize: '0.95rem' }}>🔑 Google Gemini API Key</label>
                  <input 
                    type="password" 
                    className="premium-input w-full" 
                    value={geminiSettings.api_key}
                    onChange={e => setGeminiSettings({ ...geminiSettings, api_key: e.target.value })}
                    placeholder="AIzaSy..."
                    style={{ fontSize: '0.95rem', padding: '12px 16px' }}
                  />
                  <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 8 }}>Required to enable Gemini 2.5 Flash/Pro orchestration and Function Calling.</p>
                </div>

                <div className="form-group" style={{ background: 'var(--bg-active)', padding: 24, borderRadius: 20, border: '1px solid var(--border)' }}>
                  <label style={{ fontWeight: 800, marginBottom: 12, display: 'block', fontSize: '0.95rem' }}>🧠 Gemini Model Architecture</label>
                  <select 
                    className="premium-input w-full"
                    value={geminiSettings.model_name}
                    onChange={e => setGeminiSettings({ ...geminiSettings, model_name: e.target.value })}
                    style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '0.95rem', padding: '12px 16px' }}
                  >
                    <option value="gemini-2.5-flash">⚡ Gemini 2.5 Flash (Ultra-Fast Chat & Tool Use)</option>
                    <option value="gemini-2.5-pro">🧠 Gemini 2.5 Pro (Advanced Reasoning & Deep RAG)</option>
                  </select>
                  <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 8 }}>Flash is recommended for real-time WhatsApp speed. Pro is ideal for complex enterprise analysis.</p>
                </div>
              </div>

              <div className="form-group" style={{ background: 'var(--bg-active)', padding: 24, borderRadius: 20, border: '1px solid var(--border)' }}>
                <label style={{ fontWeight: 800, marginBottom: 12, display: 'block', fontSize: '0.95rem' }}>📝 Master System Prompt & AI Persona</label>
                <textarea 
                  className="premium-input" 
                  rows={8} 
                  value={geminiSettings.system_prompt}
                  onChange={e => setGeminiSettings({ ...geminiSettings, system_prompt: e.target.value })}
                  placeholder="You are TRACE AI, the elite customer success concierge..."
                  style={{ fontSize: '0.95rem', padding: 16, lineHeight: 1.6 }}
                />
                <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 8 }}>Defines the bot's tone, language capabilities (Urdu/English), and operational boundaries.</p>
              </div>

              {/* --- 🧪 DIRECT AI SIMULATION & DIAGNOSTIC SANDBOX --- */}
              <div style={{ background: 'var(--bg-active)', padding: 28, borderRadius: 20, border: '1px solid #6366f1', display: 'flex', flexDirection: 'column', gap: 20, boxShadow: '0 10px 25px -5px rgba(99, 102, 241, 0.15)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ fontSize: '1.8rem' }}>🧪</div>
                  <div>
                    <h5 style={{ fontWeight: 800, fontSize: '1.1rem', margin: 0, color: '#fff' }}>Direct AI Simulation & Diagnostic Sandbox</h5>
                    <p className="text-muted" style={{ fontSize: '0.85rem', margin: 0 }}>Simulate incoming customer messages to instantly test Gemini's Tool Calling (`getOrderStatus`, `checkProductStock`) and RAG memory without a real phone.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="form-group">
                    <label style={{ fontWeight: 800, marginBottom: 8, display: 'block', fontSize: '0.85rem' }}>📱 Simulated Customer Phone</label>
                    <input 
                      type="text" 
                      className="premium-input w-full" 
                      value={simPhone}
                      onChange={e => setSimPhone(e.target.value)}
                      placeholder="923001234567"
                      style={{ fontSize: '0.9rem', padding: '10px 14px' }}
                    />
                  </div>
                  <div className="form-group md:col-span-2">
                    <label style={{ fontWeight: 800, marginBottom: 8, display: 'block', fontSize: '0.85rem' }}>💬 Simulated Incoming Message</label>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <input 
                        type="text" 
                        className="premium-input w-full" 
                        value={simMsg}
                        onChange={e => setSimMsg(e.target.value)}
                        placeholder="Mera parcel kahan hai?"
                        style={{ fontSize: '0.9rem', padding: '10px 14px' }}
                      />
                      <button 
                        className="btn btn-primary"
                        disabled={simLoading}
                        onClick={handleSimulateIncoming}
                        style={{ padding: '10px 24px', fontWeight: 800, whiteSpace: 'nowrap', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 8 }}
                      >
                        {simLoading ? '⌛ Simulating...' : '🚀 Simulate AI Reply'}
                      </button>
                    </div>
                  </div>
                </div>

                {simReply && (
                  <div style={{ background: '#0f172a', padding: 20, borderRadius: 16, borderLeft: '4px solid var(--green)', display: 'flex', flexDirection: 'column', gap: 8, animation: 'fadeIn 0.3s' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: 1 }}>
                      🤖 Gemini AI Simulated Response:
                    </div>
                    <div style={{ fontSize: '0.95rem', color: '#f8fafc', whiteSpace: 'pre-wrap', lineHeight: 1.6, fontWeight: 500 }}>
                      {simReply}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Sub-Tab G2: Customer Profiles & Memory */}
          {activeSubTabG === 'profiles' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div>
                <h4 style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 4 }}>🗂️ Enriched Customer Profiles & Conversational Memory</h4>
                <p className="text-muted" style={{ fontSize: '0.85rem' }}>Inspect long-term preferences, sizing traits, and multi-turn chat history extracted autonomously by Gemini. Click <strong>View Memory</strong> on any customer to open their conversation history.</p>
              </div>

              {/* Full-width Customer Profiles Table */}
              <div style={{ overflowX: 'auto', background: 'var(--bg-active)', borderRadius: 20, border: '1px solid var(--border)' }}>
                <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                  <thead style={{ background: 'var(--bg-header)', position: 'sticky', top: 0, zIndex: 10 }}>
                    <tr>
                      <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 800, whiteSpace: 'nowrap' }}>Phone</th>
                      <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 800, whiteSpace: 'nowrap' }}>Customer Name</th>
                      <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 800 }}>Extracted Preferences</th>
                      <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 800, whiteSpace: 'nowrap' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {geminiProfiles.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ padding: 40, textAlign: 'center', opacity: 0.5 }}>No customer profiles found yet. Profiles are built as customers chat with the bot.</td>
                      </tr>
                    ) : geminiProfiles.map((p, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-dim)', transition: 'background 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-header)'}
                        onMouseLeave={e => e.currentTarget.style.background = ''}
                      >
                        <td style={{ padding: '14px 20px', fontWeight: 800, whiteSpace: 'nowrap' }}>+{p.phone}</td>
                        <td style={{ padding: '14px 20px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {p.customer_name || 'Customer'}
                          {p.vip_status === 1 && <span style={{ marginLeft: 8, background: 'var(--orange-dim)', color: 'var(--orange)', padding: '2px 8px', borderRadius: 10, fontSize: '0.7rem', fontWeight: 800 }}>👑 VIP</span>}
                        </td>
                        <td style={{ padding: '14px 20px', opacity: 0.8, fontFamily: 'monospace', fontSize: '0.8rem', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.preferences}</td>
                        <td style={{ padding: '14px 20px' }}>
                          <button
                            className="btn btn-secondary"
                            onClick={() => handleFetchMemory(p.phone)}
                            style={{ padding: '6px 16px', fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}
                          >
                            🔍 View Memory
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Memory Modal Overlay */}
          {showMemoryModal && (
            <div
              onClick={() => setShowMemoryModal(false)}
              style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 24
              }}
            >
              <div
                onClick={e => e.stopPropagation()}
                style={{
                  background: 'var(--bg-card)', borderRadius: 24, border: '1px solid var(--border)',
                  width: '100%', maxWidth: 680, maxHeight: '85vh',
                  display: 'flex', flexDirection: 'column', overflow: 'hidden',
                  boxShadow: '0 32px 80px rgba(0,0,0,0.6)'
                }}
              >
                {/* Modal Header */}
                <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-header)', flexShrink: 0 }}>
                  <div>
                    <h3 style={{ fontWeight: 800, fontSize: '1.1rem', margin: 0 }}>🧠 Gemini Chat Memory</h3>
                    <p style={{ margin: '4px 0 0', fontSize: '0.8rem', opacity: 0.6 }}>+{selectedCustomerPhone} • Last 50 messages</p>
                  </div>
                  <button
                    onClick={() => setShowMemoryModal(false)}
                    style={{ background: 'var(--bg-active)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 10, padding: '6px 14px', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}
                  >
                    ✕ Close
                  </button>
                </div>

                {/* Modal Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {loadingMemory ? (
                    <div style={{ textAlign: 'center', padding: 60, opacity: 0.5 }}>
                      <div style={{ fontSize: '2rem', marginBottom: 12 }}>⌛</div>
                      <div>Loading conversation memory...</div>
                    </div>
                  ) : customerMemory.length > 0 ? (
                    customerMemory.map((m, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: m.role === 'model' ? 'var(--bg-active)' : 'var(--primary-dim, #1e293b)',
                          padding: '12px 16px', borderRadius: 14,
                          borderLeft: `4px solid ${m.role === 'model' ? 'var(--primary)' : 'var(--green)'}`,
                          marginLeft: m.role === 'model' ? 0 : 32
                        }}
                      >
                        <div style={{ fontSize: '0.72rem', fontWeight: 800, opacity: 0.55, marginBottom: 6 }}>
                          {m.role === 'model' ? '🤖 Gemini AI' : '👤 Customer'} &nbsp;•&nbsp; {m.created_at}
                        </div>
                        <div style={{ fontSize: '0.88rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{m.content}</div>
                      </div>
                    ))
                  ) : (
                    <div style={{ textAlign: 'center', padding: 60, opacity: 0.5 }}>
                      <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>💬</div>
                      <div style={{ fontWeight: 700, marginBottom: 8 }}>No Memory Found</div>
                      <div style={{ fontSize: '0.85rem' }}>This customer hasn't chatted with the bot yet, or memory hasn't been recorded.</div>
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', background: 'var(--bg-header)', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', opacity: 0.5 }}>{customerMemory.length} message{customerMemory.length !== 1 ? 's' : ''} in memory</span>
                  <button
                    onClick={() => setShowMemoryModal(false)}
                    className="btn btn-secondary"
                    style={{ padding: '8px 20px', fontSize: '0.85rem', fontWeight: 700 }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Sub-Tab G3: Tool Calling & Capabilities */}
          {activeSubTabG === 'tools' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div>
                <h4 style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 4 }}>🛠️ Gemini Function Calling & Tool Capabilities</h4>
                <p className="text-muted" style={{ fontSize: '0.85rem' }}>Explore the live database tools Gemini can autonomously execute during WhatsApp conversations.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div style={{ background: 'var(--bg-active)', padding: 24, borderRadius: 20, border: '1px solid var(--border)', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  <div style={{ fontSize: '2.5rem' }}>📦</div>
                  <div>
                    <h5 style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 6 }}>Live Stock & Price Checker (`checkProductStock`)</h5>
                    <p className="text-muted" style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>Gemini queries `product_master_costs` in real-time to answer inventory questions, confirm pricing, and recommend available variants.</p>
                    <span style={{ marginTop: 10, display: 'inline-block', background: 'var(--green-dim)', color: 'var(--green)', padding: '4px 12px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 800 }}>STATUS: ACTIVE 🟢</span>
                  </div>
                </div>

                <div style={{ background: 'var(--bg-active)', padding: 24, borderRadius: 20, border: '1px solid var(--border)', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  <div style={{ fontSize: '2.5rem' }}>📡</div>
                  <div>
                    <h5 style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 6 }}>Order Tracking Radar (`getOrderStatus`)</h5>
                    <p className="text-muted" style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>Gemini pulls live airway bill numbers, courier names (PostEx/Instaworld), and delivery statuses directly from the `orders` table.</p>
                    <span style={{ marginTop: 10, display: 'inline-block', background: 'var(--green-dim)', color: 'var(--green)', padding: '4px 12px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 800 }}>STATUS: ACTIVE 🟢</span>
                  </div>
                </div>

                <div style={{ background: 'var(--bg-active)', padding: 24, borderRadius: 20, border: '1px solid var(--border)', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  <div style={{ fontSize: '2.5rem' }}>📝</div>
                  <div>
                    <h5 style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 6 }}>Autonomous Draft Order Creator (`createDraftOrder`)</h5>
                    <p className="text-muted" style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>When a customer requests to buy via WhatsApp, Gemini conducts an interview, collects complete shipping details, and auto-inserts a Draft order.</p>
                    <span style={{ marginTop: 10, display: 'inline-block', background: 'var(--green-dim)', color: 'var(--green)', padding: '4px 12px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 800 }}>STATUS: ACTIVE 🟢</span>
                  </div>
                </div>

                <div style={{ background: 'var(--bg-active)', padding: 24, borderRadius: 20, border: '1px solid var(--border)', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  <div style={{ fontSize: '2.5rem' }}>🗂️</div>
                  <div>
                    <h5 style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 6 }}>Customer Profile Enricher (`updateCustomerProfile`)</h5>
                    <p className="text-muted" style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>Gemini extracts persistent traits (sizing, delivery timing preferences, special landmarks) and saves them into the customer's long-term profile.</p>
                    <span style={{ marginTop: 10, display: 'inline-block', background: 'var(--green-dim)', color: 'var(--green)', padding: '4px 12px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 800 }}>STATUS: ACTIVE 🟢</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Sub-Tab G4: Nightly Self-Learning Audit */}
          {activeSubTabG === 'audit' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                <div>
                  <h4 style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 4 }}>🌙 Nightly AI Self-Learning & Friction Audit</h4>
                  <p className="text-muted" style={{ fontSize: '0.85rem' }}>Review how Gemini analyzes daily chat logs to identify customer friction points and autonomously refine its own system prompt.</p>
                </div>
                <button 
                  className="btn btn-primary"
                  disabled={triggeringAudit}
                  onClick={handleTriggerAudit}
                  style={{ padding: '10px 24px', fontWeight: 800, borderRadius: 30, display: 'flex', alignItems: 'center', gap: 10 }}
                >
                  {triggeringAudit ? '⌛ Analyzing Chat Logs...' : '🚀 Trigger On-Demand AI Audit'}
                </button>
              </div>

              <div style={{ maxHeight: 500, overflowY: 'auto', background: 'var(--bg-active)', borderRadius: 20, border: '1px solid var(--border)' }}>
                <table className="w-full" style={{ fontSize: '0.85rem' }}>
                  <thead style={{ background: 'var(--bg-header)', position: 'sticky', top: 0, zIndex: 10 }}>
                    <tr>
                      <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 800 }}>Audit Date</th>
                      <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 800 }}>Messages Analyzed</th>
                      <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 800 }}>Identified Friction Points</th>
                      <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 800 }}>Applied Prompt Refinements</th>
                    </tr>
                  </thead>
                  <tbody>
                    {geminiAuditLogs.map((log, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-dim)' }}>
                        <td style={{ padding: '14px 20px', fontWeight: 800, whiteSpace: 'nowrap' }}>{log.audit_date}</td>
                        <td style={{ padding: '14px 20px', fontWeight: 700, color: 'var(--primary)' }}>{log.messages_analyzed} msgs</td>
                        <td style={{ padding: '14px 20px', opacity: 0.9 }}>
                          <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {JSON.parse(log.friction_points || '[]').map((f, i) => <li key={i}>{f}</li>)}
                          </ul>
                        </td>
                        <td style={{ padding: '14px 20px', opacity: 0.9, color: 'var(--green)' }}>
                          <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {JSON.parse(log.prompt_refinements || '[]').map((r, i) => <li key={i}>{r}</li>)}
                          </ul>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Sub-Tab: Usage & Quota ── */}
          {activeSubTabG === 'usage' && (() => {
            const u = geminiUsage;
            const today = u?.today || { total: 0, success: 0, errors: 0, avg_response_ms: 0, daily_limit: 1500, percent_used: 0 };
            const hourly = u?.hourly || Array.from({ length: 24 }, (_, i) => ({ hour: i, calls: 0 }));
            const recentLogs = u?.recentLogs || [];
            const toolBreakdown = u?.toolBreakdown || [];
            const maxHourlyCalls = Math.max(...hourly.map(h => h.calls), 1);
            const isWarning = today.percent_used >= 70;
            const isCritical = today.percent_used >= 90;
            const barColor = isCritical ? 'var(--red, #ef4444)' : isWarning ? 'var(--orange, #f97316)' : 'var(--primary)';

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <h4 style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 4 }}>📊 Gemini API Usage & Quota</h4>
                    <p className="text-muted" style={{ fontSize: '0.85rem' }}>Live tracking of your Gemini API calls. Free tier: <strong>1,500 requests/day</strong> · <strong>15 requests/minute</strong>.</p>
                  </div>
                  <button
                    onClick={handleResetLocks}
                    disabled={resetLocks}
                    style={{ padding: '10px 20px', borderRadius: 12, background: resetLocks ? '#334155' : 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', color: '#ef4444', fontWeight: 800, fontSize: '0.85rem', cursor: resetLocks ? 'not-allowed' : 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap' }}
                  >
                    {resetLocks ? '⌛ Clearing...' : '🔓 Reset Bot Locks'}
                  </button>
                  {isCritical && (
                    <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', borderRadius: 12, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', fontWeight: 700, color: '#ef4444' }}>
                      ⚠️ CRITICAL — {today.percent_used}% of daily quota used!
                    </div>
                  )}
                  {isWarning && !isCritical && (
                    <div style={{ background: 'rgba(249,115,22,0.15)', border: '1px solid #f97316', borderRadius: 12, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', fontWeight: 700, color: '#f97316' }}>
                      ⚠️ WARNING — {today.percent_used}% of daily quota used
                    </div>
                  )}
                </div>

                {/* Quota Progress Bar */}
                <div style={{ background: 'var(--bg-active)', borderRadius: 20, border: '1px solid var(--border)', padding: 24 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>Daily Quota Used</span>
                    <span style={{ fontWeight: 800, fontSize: '0.95rem', color: barColor }}>{today.total} / {today.daily_limit} calls ({today.percent_used}%)</span>
                  </div>
                  <div style={{ background: 'var(--bg-header)', borderRadius: 999, height: 18, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 999,
                      width: `${Math.min(today.percent_used, 100)}%`,
                      background: `linear-gradient(90deg, ${barColor}, ${isCritical ? '#dc2626' : isWarning ? '#ea580c' : '#4f46e5'})`,
                      transition: 'width 0.6s ease',
                      boxShadow: `0 0 12px ${barColor}55`
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: '0.75rem', opacity: 0.5 }}>
                    <span>Resets at midnight UTC</span>
                    <span>{today.daily_limit - today.total} calls remaining today</span>
                  </div>
                </div>

                {/* Stats Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
                  {[
                    { label: 'Total Today', value: today.total, icon: '🔢', color: 'var(--primary)' },
                    { label: 'Successful', value: today.success, icon: '✅', color: 'var(--green)' },
                    { label: 'Errors', value: today.errors, icon: '❌', color: 'var(--red, #ef4444)' },
                    { label: 'Avg Response', value: `${today.avg_response_ms}ms`, icon: '⚡', color: 'var(--orange, #f97316)' },
                  ].map((stat, i) => (
                    <div key={i} style={{ background: 'var(--bg-active)', borderRadius: 16, border: '1px solid var(--border)', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontSize: '1.5rem' }}>{stat.icon}</span>
                      <span style={{ fontSize: '1.6rem', fontWeight: 900, color: stat.color }}>{stat.value}</span>
                      <span style={{ fontSize: '0.75rem', opacity: 0.6, fontWeight: 600 }}>{stat.label}</span>
                    </div>
                  ))}
                </div>

                {/* Hourly Call Chart */}
                <div style={{ background: 'var(--bg-active)', borderRadius: 20, border: '1px solid var(--border)', padding: 24 }}>
                  <h5 style={{ fontWeight: 800, fontSize: '0.95rem', marginBottom: 20 }}>📈 Calls Per Hour — Today</h5>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 100, overflowX: 'auto' }}>
                    {hourly.map((h, i) => {
                      const heightPct = maxHourlyCalls > 0 ? (h.calls / maxHourlyCalls) * 100 : 0;
                      const now = new Date().getHours();
                      const isNow = h.hour === now;
                      return (
                        <div key={i} title={`${h.hour}:00 — ${h.calls} calls`} style={{ flex: 1, minWidth: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                          <div style={{
                            width: '100%', borderRadius: '4px 4px 0 0',
                            height: `${Math.max(heightPct, h.calls > 0 ? 8 : 2)}%`,
                            background: isNow ? 'var(--primary)' : h.calls > 0 ? '#4f46e580' : 'var(--bg-header)',
                            transition: 'height 0.4s ease',
                            boxShadow: isNow ? '0 0 8px var(--primary)' : 'none'
                          }} />
                          {i % 4 === 0 && <span style={{ fontSize: '0.6rem', opacity: 0.4 }}>{h.hour}h</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Tool Breakdown + Recent Logs side by side */}
                <div style={{ display: 'grid', gridTemplateColumns: toolBreakdown.length > 0 ? '1fr 2fr' : '1fr', gap: 16 }}>
                  {toolBreakdown.length > 0 && (
                    <div style={{ background: 'var(--bg-active)', borderRadius: 20, border: '1px solid var(--border)', padding: 24 }}>
                      <h5 style={{ fontWeight: 800, fontSize: '0.9rem', marginBottom: 16 }}>🛠️ Tool Calls Today</h5>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {toolBreakdown.map((t, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-header)', borderRadius: 10 }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>{t.tool_called}</span>
                            <span style={{ fontSize: '0.82rem', fontWeight: 900, color: 'var(--primary)' }}>{t.count}x</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recent Logs */}
                  <div style={{ background: 'var(--bg-active)', borderRadius: 20, border: '1px solid var(--border)', overflowX: 'auto' }}>
                    <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
                      <h5 style={{ fontWeight: 800, fontSize: '0.9rem', margin: 0 }}>📋 Last 50 API Calls</h5>
                    </div>
                    <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                      <thead style={{ background: 'var(--bg-header)' }}>
                        <tr>
                          <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 800 }}>Time</th>
                          <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 800 }}>Phone</th>
                          <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 800 }}>Status</th>
                          <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 800 }}>Tool</th>
                          <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 800 }}>Speed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentLogs.length === 0 ? (
                          <tr><td colSpan={5} style={{ padding: 30, textAlign: 'center', opacity: 0.4 }}>No API calls logged yet. Calls appear here as customers message the bot.</td></tr>
                        ) : recentLogs.map((log, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border-dim)' }}>
                            <td style={{ padding: '10px 14px', opacity: 0.6, whiteSpace: 'nowrap' }}>{log.created_at?.slice(11, 19)}</td>
                            <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: '0.78rem' }}>+{log.phone || '—'}</td>
                            <td style={{ padding: '10px 14px' }}>
                              <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 800, background: log.status === 'success' ? 'var(--green-dim)' : 'rgba(239,68,68,0.15)', color: log.status === 'success' ? 'var(--green)' : '#ef4444' }}>
                                {log.status === 'success' ? '✅ OK' : '❌ ERR'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px', opacity: 0.7, fontSize: '0.75rem' }}>{log.tool_called || '—'}</td>
                            <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: '0.75rem', color: log.response_ms > 3000 ? 'var(--orange)' : 'var(--green)' }}>{log.response_ms > 0 ? `${log.response_ms}ms` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

      )}
    </div>
  )
}
