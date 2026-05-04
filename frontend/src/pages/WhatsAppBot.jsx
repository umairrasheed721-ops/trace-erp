import React, { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'

export default function WhatsAppBot() {
  const { addToast } = useApp()
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [testPhone, setTestPhone] = useState('')
  const [testMsg, setTestMsg] = useState('Hello from TRACE ERP!')
  const [sendingTest, setSendingTest] = useState(false)
  const [resetting, setResetting] = useState(false)

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/whatsapp/status', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
      })
      const data = await res.json()
      setStatus(data)
      setLoading(false)
    } catch (err) {
      console.error('Failed to fetch WA status', err)
    }
  }

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 4000)
    return () => clearInterval(interval)
  }, [])

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

  if (loading) return <div className="loading-overlay">⌛ Loading WhatsApp Bot Status...</div>

  const isConnected = status?.status === 'CONNECTED'
  const isQrReady = status?.status === 'QR_READY'
  const isFailed = status?.status === 'FAILURE'
  const isConnecting = status?.status === 'CONNECTING'

  const statusColor = isConnected ? 'var(--green)' : isQrReady ? 'var(--orange)' : isFailed ? 'var(--red)' : 'var(--orange)'

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h2>📱 WhatsApp Automation Bot</h2>
          <p>Path B: Server-side Background Worker</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card glass-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Connection Status</div>
            <button
              className="btn btn-danger"
              style={{ fontSize: '0.75rem', padding: '6px 14px', opacity: resetting ? 0.6 : 1 }}
              disabled={resetting}
              onClick={handleReset}
            >
              {resetting ? '⌛ Resetting...' : '🔄 Reset Session'}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{ 
              width: 15, height: 15, borderRadius: '50%', 
              background: statusColor,
              boxShadow: `0 0 10px ${statusColor}`
            }}></div>
            <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>{status?.status || 'DISCONNECTED'}</span>
            {status?.reconnectAttempts > 0 && (
              <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                (attempt {status.reconnectAttempts}/5)
              </span>
            )}
          </div>

          {isQrReady && status?.qrCode && (
            <div style={{ textAlign: 'center', background: '#fff', padding: 20, borderRadius: 12 }}>
              <p style={{ color: '#000', marginBottom: 10, fontWeight: 700 }}>📱 Scan this QR with your WhatsApp</p>
              <img src={status.qrCode} alt="WhatsApp QR" style={{ width: 250, height: 250 }} />
              <p style={{ color: '#666', fontSize: '0.8rem', marginTop: 10 }}>
                Open WhatsApp → Settings → Linked Devices → Link a Device
              </p>
            </div>
          )}

          {isConnected && (
            <div className="success-banner" style={{ background: 'var(--green-dim)', border: '1px solid var(--green)', color: 'var(--green)', padding: 15, borderRadius: 12 }}>
              ✅ Bot is active and logged in. It will automatically send confirmation links to new orders.
            </div>
          )}

          {(status?.status === 'DISCONNECTED' || isConnecting) && (
            <p className="text-muted">⏳ Initializing engine... QR code will appear shortly.</p>
          )}

          {isFailed && (
            <div style={{ background: 'rgba(255,60,60,0.1)', border: '1px solid var(--red)', color: 'var(--red)', padding: 15, borderRadius: 12 }}>
              ❌ Bot failed to connect. Click <strong>"Reset Session"</strong> to clear and try again, or check Railway deployment logs.
            </div>
          )}

          <p style={{ marginTop: 16, fontSize: '0.78rem', opacity: 0.5 }}>
            💡 If you unlinked this device from WhatsApp on your phone, click "Reset Session" to reconnect.
          </p>
        </div>

        <div className="card">
          <div className="card-title">Test Messaging</div>
          <p className="text-muted mb-4">Send a direct message to verify the bot is working.</p>
          <div className="form-group">
            <label>Phone Number (e.g. 923001234567)</label>
            <input 
              className="premium-input" 
              placeholder="923..." 
              value={testPhone} 
              onChange={e => setTestPhone(e.target.value)} 
            />
          </div>
          <div className="form-group">
            <label>Message Content</label>
            <textarea 
              className="premium-input" 
              rows={3} 
              value={testMsg} 
              onChange={e => setTestMsg(e.target.value)}
            />
          </div>
          <button 
            className="btn btn-primary w-full" 
            disabled={sendingTest || !isConnected}
            onClick={handleSendTest}
          >
            {sendingTest ? '⌛ Sending...' : '🚀 Send Test Message'}
          </button>
          {!isConnected && (
            <p style={{ marginTop: 10, fontSize: '0.8rem', opacity: 0.6, textAlign: 'center' }}>
              Bot must be CONNECTED to send messages
            </p>
          )}
        </div>
      </div>

      <div className="card mt-6" style={{ background: 'var(--bg-active)' }}>
        <div className="card-title">Automation Logic</div>
        <ul style={{ fontSize: '0.85rem', opacity: 0.8, lineHeight: 1.8 }}>
          <li>✨ <b>Trigger</b>: When a new order lands from Shopify.</li>
          <li>📱 <b>Action</b>: Bot sends a unique confirmation link via WhatsApp.</li>
          <li>🔗 <b>Link</b>: Customer clicks to visit your public confirmation portal.</li>
          <li>✅ <b>Result</b>: ERP status updates to <b>"Confirmed on WhatsApp"</b> automatically.</li>
        </ul>
      </div>
    </div>
  )
}
