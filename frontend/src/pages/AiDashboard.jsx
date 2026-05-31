import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useApp } from '../context/AppContext'

export default function AiDashboard() {
  const { token, addToast } = useApp()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [liveEvents, setLiveEvents] = useState([])
  
  // Simulation Playground State
  const [simAmount, setSimAmount] = useState('5000')
  const [simTarget, setSimTarget] = useState('4980')
  const [simResult, setSimResult] = useState(null)

  const loadData = useCallback(() => {
    setLoading(true)
    fetch('/api/ai/stats', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(res => {
        setData(res)
        setLoading(false)
      })
      .catch(err => {
        console.error(err)
        addToast('Failed to load AI statistics', 'error')
        setLoading(false)
      })
  }, [token, addToast])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Connect WebSocket for Live Ticker Feed
  useEffect(() => {
    if (!token) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.hostname === 'localhost' ? 'localhost:3001' : window.location.host
    const wsUrl = `${protocol}//${host}?token=${encodeURIComponent(token)}`
    
    let socket
    let reconnectTimeout

    const connect = () => {
      socket = new WebSocket(wsUrl)

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data)
          if (payload.type === 'transcript') {
            const newEvent = {
              id: Date.now() + Math.random(),
              type: '🎙️ STT Voice note',
              phone: payload.data.phone,
              text: `Transcribed audio: "${payload.data.transcript}"`,
              time: new Date().toLocaleTimeString(),
              color: 'var(--blue)'
            }
            setLiveEvents(prev => [newEvent, ...prev.slice(0, 19)])
            loadData() // Refresh stats
          } else if (payload.type === 'ocr_result') {
            const statusLabel = payload.data.status === 'matched' ? '🟢 Matched' : (payload.data.status === 'mismatch' ? '🔴 Mismatch' : '🟡 Review Required')
            const newEvent = {
              id: Date.now() + Math.random(),
              type: '🔍 OCR Receipt',
              phone: payload.data.phone,
              text: `Scanned receipt. Status: ${statusLabel}. Amount detected: Rs. ${payload.data.detectedAmount || 'N/A'}. (Bank: ${payload.data.detectedBank || 'Unknown'})`,
              time: new Date().toLocaleTimeString(),
              color: payload.data.status === 'matched' ? 'var(--green)' : 'var(--orange)'
            }
            setLiveEvents(prev => [newEvent, ...prev.slice(0, 19)])
            loadData() // Refresh stats
          }
        } catch (e) {
          console.error('Error handling live AI ws event:', e)
        }
      }

      socket.onclose = () => {
        reconnectTimeout = setTimeout(connect, 3000)
      }
    }

    connect()

    return () => {
      if (socket) socket.close()
      clearTimeout(reconnectTimeout)
    }
  }, [token, loadData])

  // Run matching simulation playground
  const handleSimulateMatching = () => {
    const amt = parseFloat(simAmount) || 0
    const target = parseFloat(simTarget) || 0
    const diff = Math.abs(amt - target)
    const success = diff <= 50 // Rs 50 tolerance rule

    if (success) {
      setSimResult({
        success: true,
        message: `✅ MATCHED! Difference is Rs. ${diff} (within Rs. 50 tolerance). The order would automatically transition to "OCR Verified", mark paid, and auto-reply to the customer on WhatsApp.`
      })
    } else {
      setSimResult({
        success: false,
        message: `❌ MISMATCH! Difference is Rs. ${diff} (exceeds Rs. 50 tolerance). The system will tag it as "Mismatch" and flag it for manual client success review.`
      })
    }
  }

  const getOcrBadge = (status) => {
    if (status === 'matched') return <span style={{ background: '#10b98120', color: '#10b981', padding: '2px 8px', borderRadius: 12, fontSize: '0.7rem', fontWeight: 600 }}>🟢 Matched</span>
    if (status === 'mismatch') return <span style={{ background: '#ef444420', color: '#ef4444', padding: '2px 8px', borderRadius: 12, fontSize: '0.7rem', fontWeight: 600 }}>🔴 Mismatch</span>
    if (status === 'manual_review') return <span style={{ background: '#f59e0b20', color: '#f59e0b', padding: '2px 8px', borderRadius: 12, fontSize: '0.7rem', fontWeight: 600 }}>🟡 Review</span>
    if (status === 'not_a_receipt') return <span style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)', padding: '2px 8px', borderRadius: 12, fontSize: '0.7rem', fontWeight: 600 }}>⚪ Not Receipt</span>
    return <span style={{ background: 'var(--bg-active)', color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: 12, fontSize: '0.7rem' }}>{status}</span>
  }

  return (
    <div>
      <div className="page-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 20 }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            🤖 AI Command Center
            <span style={{ fontSize: '0.65rem', padding: '3px 8px', background: '#10b98120', color: '#10b981', borderRadius: '12px', border: '1px solid #10b98140', letterSpacing: '0.05em' }}>🟢 ACTIVE & LISTENING</span>
          </h2>
          <p style={{ opacity: 0.6 }}>Manage cognitive features: Groq Speech-to-Text transcribing and GPT-4o Receipt OCR payment matching engines</p>
        </div>
        <div>
          <button className="btn btn-secondary btn-sm" onClick={loadData} disabled={loading}>🔄 Refresh Stats</button>
        </div>
      </div>

      {loading && !data ? (
        <div className="loading-overlay"><span className="loading-spinner"></span> Loading AI Dashboard data...</div>
      ) : (
        <>
          {/* AI Settings Header Cards */}
          <div className="kpi-grid" style={{ marginBottom: 20 }}>
            <div className="kpi-card purple" style={{ minHeight: 90 }}>
              <div className="kpi-label">Speech-To-Text Provider</div>
              <div className="kpi-value" style={{ fontSize: '1.25rem', marginTop: 4 }}>🎙️ {data?.config.sttProvider.toUpperCase() || 'GROQ'}</div>
              <div className="kpi-sub">Target Language: Urdu/Roman Urdu ({data?.config.sttLanguage})</div>
              <div className="kpi-icon">🗣️</div>
            </div>
            <div className="kpi-card blue" style={{ minHeight: 90 }}>
              <div className="kpi-label">Vision OCR Provider</div>
              <div className="kpi-value" style={{ fontSize: '1.25rem', marginTop: 4 }}>👁️ {data?.config.ocrProvider.toUpperCase() || 'OPENAI'}</div>
              <div className="kpi-sub">Model: {data?.config.ocrModel}</div>
              <div className="kpi-icon">📸</div>
            </div>
            <div className="kpi-card green" style={{ minHeight: 90 }}>
              <div className="kpi-label">OCR Match Success Rate</div>
              <div className="kpi-value" style={{ fontSize: '1.25rem', marginTop: 4 }}>📈 {data?.stats.matchRate}%</div>
              <div className="kpi-sub">{data?.stats.matchedScans} matched of {data?.stats.totalScans} total scans</div>
              <div className="kpi-icon">💵</div>
            </div>
            <div className="kpi-card orange" style={{ minHeight: 90 }}>
              <div className="kpi-label">Total Audio Transcriptions</div>
              <div className="kpi-value" style={{ fontSize: '1.25rem', marginTop: 4 }}>💬 {data?.stats.totalAudioTranscripts}</div>
              <div className="kpi-sub">Voice notes Roman Urdu transcripts</div>
              <div className="kpi-icon">🎙️</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 20 }}>
            {/* Simulation Playground Card */}
            <div className="card">
              <div className="card-title">🔬 OCR Tolerance Matcher Playground</div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: -6, marginBottom: 16 }}>Test the Rs. 50 tolerance logic of the receipt matching automation pipeline.</p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Detected Receipt Amount (Rs.)</span>
                  <input 
                    type="number" 
                    value={simAmount} 
                    onChange={e => setSimAmount(e.target.value)}
                    className="form-input" 
                    style={{ width: 140, padding: '4px 8px', fontSize: '0.8rem' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Target Order Total (Rs.)</span>
                  <input 
                    type="number" 
                    value={simTarget} 
                    onChange={e => setSimTarget(e.target.value)}
                    className="form-input" 
                    style={{ width: 140, padding: '4px 8px', fontSize: '0.8rem' }}
                  />
                </div>
                <button className="btn btn-primary" onClick={handleSimulateMatching} style={{ padding: '6px 16px', fontSize: '0.75rem', height: 28 }}>
                  Analyze Match
                </button>
              </div>

              {simResult && (
                <div 
                  style={{ 
                    marginTop: 16, 
                    padding: '10px 14px', 
                    borderRadius: 6, 
                    fontSize: '0.75rem', 
                    background: simResult.success ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                    border: simResult.success ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)',
                    color: simResult.success ? 'var(--green)' : 'var(--red)'
                  }}
                >
                  {simResult.message}
                </div>
              )}
            </div>

            {/* Live Ticker Feed */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', maxHeight: 220 }}>
              <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>🔌 Live AI Event Feed</span>
                <span className="loading-spinner" style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.1)', borderTop: '2px solid var(--brand)', display: 'inline-block' }}></span>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4 }}>
                {liveEvents.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem', padding: '20px 0' }}>
                    ⌛ Waiting for live WhatsApp AI events...
                  </div>
                ) : (
                  liveEvents.map(evt => (
                    <div 
                      key={evt.id} 
                      style={{ 
                        padding: '6px 10px', 
                        background: 'rgba(255,255,255,0.03)', 
                        borderRadius: 4, 
                        borderLeft: `3px solid ${evt.color}`, 
                        fontSize: '0.7rem' 
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: evt.color, marginBottom: 2 }}>
                        <span>{evt.type}</span>
                        <span style={{ fontSize: '0.6rem', opacity: 0.5 }}>{evt.time}</span>
                      </div>
                      <div style={{ color: 'var(--text-secondary)' }}>{evt.text}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Two-Column Tables */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16 }}>
            {/* Left Column: Recent OCR Receipts */}
            <div className="card" style={{ minHeight: 300 }}>
              <div className="card-title">🔍 Recent Payment OCR Scans</div>
              {data?.recentScans.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>No payment receipt scans recorded yet</div>
              ) : (
                <div className="table-wrapper" style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: '0.75rem', tableLayout: 'fixed' }}>
                    <thead>
                      <tr>
                        <th style={{ width: 85 }}>Order ID</th>
                        <th style={{ width: 110 }}>Customer</th>
                        <th style={{ width: 75 }}>Amt (Rs.)</th>
                        <th style={{ width: 90 }}>Txn ID</th>
                        <th style={{ width: 90 }}>Confidence</th>
                        <th style={{ width: 90 }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.recentScans.map(scan => (
                        <tr key={scan.id}>
                          <td style={{ fontWeight: 600, color: 'var(--brand)' }}>{scan.ref_number || scan.order_id ? `#${scan.ref_number || scan.order_id}` : '—'}</td>
                          <td>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={scan.customer_name || scan.phone}>
                              {scan.customer_name || scan.phone}
                            </div>
                          </td>
                          <td style={{ fontWeight: 600 }}>{scan.detected_amount ? `Rs. ${scan.detected_amount}` : '—'}</td>
                          <td className="font-mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{scan.detected_txn_id || '—'}</td>
                          <td>{(scan.confidence * 100).toFixed(0)}%</td>
                          <td>{getOcrBadge(scan.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Right Column: STT Transcripts */}
            <div className="card" style={{ minHeight: 300 }}>
              <div className="card-title">🎙️ Recent Speech-To-Text Transcripts</div>
              {data?.recentTranscripts.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>No audio transcribings recorded yet</div>
              ) : (
                <div className="table-wrapper" style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: '0.75rem', tableLayout: 'fixed' }}>
                    <thead>
                      <tr>
                        <th style={{ width: 80 }}>Order ID</th>
                        <th style={{ width: 100 }}>Customer</th>
                        <th style={{ width: 220 }}>Urdu Transcript</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.recentTranscripts.map(msg => (
                        <tr key={msg.id}>
                          <td style={{ fontWeight: 600, color: 'var(--brand)' }}>{msg.ref_number || msg.order_id ? `#${msg.ref_number || msg.order_id}` : '—'}</td>
                          <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg.customer_name || msg.phone}</td>
                          <td 
                            style={{ 
                              color: 'var(--text-primary)', 
                              fontStyle: 'italic', 
                              whiteSpace: 'normal', 
                              wordBreak: 'break-word',
                              fontSize: '0.72rem' 
                            }}
                          >
                            {msg.transcript}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
