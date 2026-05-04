import React, { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'

export default function WhatsAppBot() {
  const { addToast } = useApp()
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [testPhone, setTestPhone] = useState('')
  const [testMsg, setTestMsg] = useState('Hello from TRACE ERP!')
  const [sendingTest, setSendingTest] = useState(false)

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
    const interval = setInterval(fetchStatus, 5000)
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

  if (loading) return <div className="loading-overlay">⌛ Loading WhatsApp Bot Status...</div>

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
          <div className="card-title">Connection Status</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{ 
              width: 15, height: 15, borderRadius: '50%', 
              background: status?.status === 'CONNECTED' ? 'var(--green)' : status?.status === 'QR_READY' ? 'var(--orange)' : 'var(--red)',
              boxShadow: `0 0 10px ${status?.status === 'CONNECTED' ? 'var(--green)' : 'var(--orange)'}`
            }}></div>
            <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>{status?.status || 'DISCONNECTED'}</span>
          </div>

          {status?.status === 'QR_READY' && status?.qrCode && (
            <div style={{ textAlign: 'center', background: '#fff', padding: 20, borderRadius: 12 }}>
              <p style={{ color: '#000', marginBottom: 10, fontWeight: 700 }}>Scan this QR with your WhatsApp</p>
              <img src={status.qrCode} alt="WhatsApp QR" style={{ width: 250, height: 250 }} />
              <p style={{ color: '#666', fontSize: '0.8rem', marginTop: 10 }}>Open WhatsApp &gt; Settings &gt; Linked Devices</p>
            </div>
          )}

          {status?.status === 'CONNECTED' && (
            <div className="success-banner" style={{ background: 'var(--green-dim)', border: '1px solid var(--green)', color: 'var(--green)', padding: 15, borderRadius: 12 }}>
              ✅ Bot is active and logged in. It will automatically send confirmation links to new orders.
            </div>
          )}

          {status?.status === 'DISCONNECTED' && (
            <p className="text-muted">Initializing engine... please wait a moment for the QR code.</p>
          )}
        </div>

        <div className="card">
          <div className="card-title">Test Messaging</div>
          <p className="text-muted mb-4">Send a direct message to verify the bot is working.</p>
          <div className="form-group">
            <label>Phone Number (e.g. 923001234567)</label>
            <input 
              className="premium-input" 
              placeholder="92..." 
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
            disabled={sendingTest || status?.status !== 'CONNECTED'}
            onClick={handleSendTest}
          >
            {sendingTest ? '⌛ Sending...' : '🚀 Send Test Message'}
          </button>
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
