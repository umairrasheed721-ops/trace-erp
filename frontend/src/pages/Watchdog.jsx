import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'

export default function Watchdog() {
  const { activeStoreId, addToast, setBadgeCounts, token } = useApp()
  const navigate = useNavigate()
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [sendingWAs, setSendingWAs] = useState({}) // track warning sending state per id
  const [filter, setFilter] = useState('all')
  const [selectedAudit, setSelectedAudit] = useState(null) // for detailed timeline modal

  const load = () => {
    if (!activeStoreId) return
    setLoading(true)
    fetch(`/api/watchdog?store_id=${activeStoreId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        const rows = Array.isArray(data) ? data : []
        setResults(rows)
        const fakeCount = rows.filter(w => w.verdict?.includes('FAKE')).length
        setBadgeCounts(prev => ({ ...prev, watchdog: fakeCount }))
        setLoading(false)
      })
      .catch(() => { 
        addToast('Failed to load watchdog data', 'error')
        setLoading(false) 
      })
  }

  useEffect(() => { load() }, [activeStoreId])

  const runWatchdog = async () => {
    if (running) return
    setRunning(true)
    addToast('🐕 Watchdog bulk verification started synchronously...', 'info')
    try {
      const res = await fetch('/api/watchdog/run', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ store_id: activeStoreId })
      })
      const data = await res.json()
      if (data.success) {
        addToast(`✅ Watchdog run complete. Audited: ${data.result?.audited || 0} orders.`, 'success')
      } else {
        addToast(`⚠️ Watchdog finished with note: ${data.result?.reason || 'Done'}`, 'warning')
      }
      load()
    } catch {
      addToast('Failed to run watchdog audit', 'error')
    } finally {
      setRunning(false)
    }
  }

  const deleteResult = async (id) => {
    try {
      const res = await fetch(`/api/watchdog/${id}`, { 
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        setResults(prev => prev.filter(r => r.id !== id))
        addToast('Audit result cleared. Order will be scanned on next run.', 'info')
      }
    } catch {
      addToast('Failed to delete result', 'error')
    }
  }

  const sendWhatsAppWarning = async (r) => {
    setSendingWAs(prev => ({ ...prev, [r.id]: true }))
    try {
      const res = await fetch('/api/watchdog/send-warning', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ tracking_number: r.tracking_number })
      })
      const data = await res.json()
      
      if (data.success) {
        addToast('🎉 WhatsApp Warning Message dispatched directly!', 'success')
      } else if (data.fallbackUrl) {
        addToast('⚠️ WhatsApp Bot offline. Opening direct browser message link...', 'warning')
        window.open(data.fallbackUrl, '_blank')
      } else {
        addToast(data.error || 'Failed to dispatch warning', 'error')
      }
    } catch (err) {
      addToast('Error sending WhatsApp alert', 'error')
    } finally {
      setSendingWAs(prev => ({ ...prev, [r.id]: false }))
    }
  }

  const filtered = results.filter(r => {
    if (filter === 'all') return true
    if (filter === 'fake') return r.verdict?.includes('FAKE')
    if (filter === 'suspicious') return r.verdict?.includes('SUSPICIOUS')
    if (filter === 'verified') return r.verdict?.includes('VERIFIED')
    if (filter === 'moving') return r.verdict?.includes('Moving')
    return true
  })

  // KPI Calculations
  const totalCount = results.length
  const fakesCount = results.filter(r => r.verdict?.includes('FAKE')).length
  const suspCount = results.filter(r => r.verdict?.includes('SUSPICIOUS')).length
  const verifiedCount = results.filter(r => r.verdict?.includes('VERIFIED')).length
  const movingCount = results.filter(r => r.verdict?.includes('Moving')).length

  const getVerdictBadge = (verdict) => {
    if (!verdict) return <span className="wd-badge wd-badge-moving">Unknown</span>
    if (verdict.includes('FAKE')) {
      return <span className="wd-badge wd-badge-fake">🔴 {verdict}</span>
    }
    if (verdict.includes('SUSPICIOUS')) {
      return <span className="wd-badge wd-badge-suspicious">🟠 {verdict}</span>
    }
    if (verdict.includes('VERIFIED')) {
      return <span className="wd-badge wd-badge-verified">🟢 {verdict}</span>
    }
    return <span className="wd-badge wd-badge-moving">⚪ In-Transit / Moving</span>
  }

  return (
    <div className="watchdog-panel">
      <style>{`
        .watchdog-panel {
          animation: fadeIn 0.3s ease;
        }
        .wd-stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }
        .wd-card {
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 16px;
          position: relative;
          overflow: hidden;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .wd-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 16px rgba(0,0,0,0.25);
        }
        .wd-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0; height: 3px;
        }
        .wd-card-all::before { background: var(--brand); }
        .wd-card-fake::before { background: var(--red); }
        .wd-card-suspicious::before { background: var(--orange); }
        .wd-card-verified::before { background: var(--green); }
        .wd-card-moving::before { background: var(--blue); }

        .wd-card-fake:hover {
          box-shadow: 0 0 20px rgba(239, 68, 68, 0.15);
        }
        .wd-card-suspicious:hover {
          box-shadow: 0 0 20px rgba(249, 115, 22, 0.15);
        }
        .wd-card-verified:hover {
          box-shadow: 0 0 20px rgba(34, 197, 94, 0.15);
        }

        .wd-card-title {
          font-size: 0.8rem;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .wd-card-value {
          font-size: 2rem;
          font-weight: 700;
          margin-top: 8px;
          color: var(--text-primary);
        }
        .wd-filter-bar {
          display: flex;
          gap: 8px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }
        .wd-filter-btn {
          background: var(--bg-surface);
          border: 1px solid var(--border);
          color: var(--text-secondary);
          padding: 8px 14px;
          border-radius: var(--radius-sm);
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.2s;
        }
        .wd-filter-btn:hover {
          color: var(--text-primary);
          background: var(--bg-hover);
        }
        .wd-filter-btn.active {
          background: var(--brand-glow);
          border-color: var(--brand);
          color: var(--brand);
          font-weight: 600;
        }
        .wd-badge {
          display: inline-flex;
          align-items: center;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
        }
        .wd-badge-fake { background: rgba(239, 68, 68, 0.15); color: #f87171; }
        .wd-badge-suspicious { background: rgba(249, 115, 22, 0.15); color: #fb923c; }
        .wd-badge-verified { background: rgba(34, 197, 94, 0.15); color: #4ade80; }
        .wd-badge-moving { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
        
        .wd-timeline-stepper {
          display: flex;
          flex-direction: column;
          gap: 20px;
          margin: 20px 0;
          position: relative;
        }
        .wd-timeline-stepper::before {
          content: '';
          position: absolute;
          left: 17px; top: 10px; bottom: 10px;
          width: 2px;
          background: var(--border-bright);
        }
        .wd-timeline-step {
          display: flex;
          gap: 16px;
          position: relative;
          z-index: 1;
        }
        .wd-timeline-circle {
          width: 36px; height: 36px;
          border-radius: 50%;
          background: var(--bg-elevated);
          border: 2px solid var(--border-bright);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.1rem;
          color: var(--text-secondary);
        }
        .wd-timeline-step.active .wd-timeline-circle {
          border-color: var(--brand);
          color: var(--brand);
          background: var(--bg-surface);
        }
        .wd-timeline-content {
          flex: 1;
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 12px 16px;
        }
        .wd-timeline-title {
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 4px;
        }
        .wd-timeline-time {
          font-size: 0.78rem;
          color: var(--text-muted);
        }
        .wd-timeline-delta {
          margin: -10px 0 10px 52px;
          background: var(--bg-surface);
          border-left: 3px solid var(--brand);
          padding: 8px 12px;
          font-size: 0.8rem;
          color: var(--text-secondary);
          border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
        }
      `}</style>

      {/* Header */}
      <div className="page-header">
        <div>
          <h2>🐕 Watchdog</h2>
          <p>PostEx Rider Fraud Detection — Real-time Tri-Layer Verification Engine</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>🔄 Refresh</button>
          <button className="btn btn-primary btn-sm" onClick={runWatchdog} disabled={running || !activeStoreId}>
            {running ? <><span className="loading-spinner"></span> Auditing...</> : '🚀 Run Audit Engine'}
          </button>
        </div>
      </div>

      {/* Summary KPI Badges */}
      <div className="wd-stats-grid">
        <div className="wd-card wd-card-all">
          <div className="wd-card-title">Total Audited</div>
          <div className="wd-card-value">{totalCount}</div>
        </div>
        <div className="wd-card wd-card-fake">
          <div className="wd-card-title">🔴 Fake Attempts</div>
          <div className="wd-card-value" style={{ color: 'var(--red)' }}>{fakesCount}</div>
        </div>
        <div className="wd-card wd-card-suspicious">
          <div className="wd-card-title">🟠 Suspicious Close</div>
          <div className="wd-card-value" style={{ color: 'var(--orange)' }}>{suspCount}</div>
        </div>
        <div className="wd-card wd-card-verified">
          <div className="wd-card-title">🟢 Verified Attempts</div>
          <div className="wd-card-value" style={{ color: 'var(--green)' }}>{verifiedCount}</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="wd-filter-bar">
        <button className={`wd-filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All ({totalCount})</button>
        <button className={`wd-filter-btn ${filter === 'fake' ? 'active' : ''}`} onClick={() => setFilter('fake')}>🔴 Fake ({fakesCount})</button>
        <button className={`wd-filter-btn ${filter === 'suspicious' ? 'active' : ''}`} onClick={() => setFilter('suspicious')}>🟠 Suspicious ({suspCount})</button>
        <button className={`wd-filter-btn ${filter === 'verified' ? 'active' : ''}`} onClick={() => setFilter('verified')}>🟢 Verified ({verifiedCount})</button>
        <button className={`wd-filter-btn ${filter === 'moving' ? 'active' : ''}`} onClick={() => setFilter('moving')}>⚪ Moving ({movingCount})</button>
      </div>

      {/* Results Table */}
      {loading ? (
        <div className="loading-overlay"><span className="loading-spinner"></span> Loading audit database...</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🐕</div>
          <h3>{results.length === 0 ? 'No Audit History' : 'No matches found'}</h3>
          <p>{results.length === 0 ? 'Start an audit to scan PostEx delivery failures' : 'Try updating your filters'}</p>
          {results.length === 0 && (
            <button className="btn btn-primary mt-4" onClick={runWatchdog} disabled={running}>
              🚀 Start First Audit Scan
            </button>
          )}
        </div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Tracking #</th>
                <th>Order Ref</th>
                <th>Customer</th>
                <th>Request Time</th>
                <th>Latest Courier Status</th>
                <th>Verdict</th>
                <th>Duration</th>
                <th>Evidence</th>
                <th>Audited At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}>
                  {/* Clickable Tracking to open stepper modal */}
                  <td>
                    <button 
                      className="btn-link" 
                      onClick={() => setSelectedAudit(r)}
                      style={{ fontWeight: 700, color: 'var(--brand)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '0.75rem' }}
                    >
                      🔍 {r.tracking_number}
                    </button>
                  </td>
                  
                  {/* Clickable Order Reference to search */}
                  <td>
                    {r.ref_number ? (
                      <button 
                        className="btn-link"
                        onClick={() => navigate('/search', { state: { keyword: r.ref_number, status: 'All Statuses', preset: 'All Time' } })}
                        style={{ fontWeight: 800, color: 'var(--brand)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                      >
                        {r.ref_number}
                      </button>
                    ) : '—'}
                  </td>
                  
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 500 }}>{r.customer_name || 'Unknown'}</span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{r.phone || '—'}</span>
                    </div>
                  </td>
                  
                  <td style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    {r.request_time ? new Date(r.request_time).toLocaleString() : '—'}
                  </td>
                  
                  <td>
                    <span className="badge" style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>
                      {r.latest_status || '—'}
                    </span>
                  </td>
                  
                  <td>{getVerdictBadge(r.verdict)}</td>
                  
                  <td style={{ fontWeight: 600, fontSize: '0.78rem' }}>{r.duration}</td>
                  
                  <td className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{r.evidence}</td>
                  
                  <td style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                  </td>
                  
                  <td>
                    <div className="flex gap-2">
                      <button 
                        className="btn btn-sm btn-secondary" 
                        onClick={() => sendWhatsAppWarning(r)}
                        disabled={sendingWAs[r.id]}
                        title="Send rider alert warning text to customer"
                      >
                        {sendingWAs[r.id] ? <span className="loading-spinner"></span> : '💬 WhatsApp Warning'}
                      </button>
                      <button 
                        className="btn btn-secondary btn-sm" 
                        onClick={() => deleteResult(r.id)} 
                        title="Clear audit log (allow re-audit on next run)"
                      >
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Visual Timeline Stepper Modal */}
      {selectedAudit && (
        <div className="modal-overlay" onClick={() => setSelectedAudit(null)}>
          <div className="modal-content glass-panel" style={{ width: '90%', maxWidth: '540px', padding: '24px' }} onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="premium-title" style={{ margin: 0 }}>Rider Audit Details</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setSelectedAudit(null)}>✕</button>
            </div>
            
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                <strong>Tracking Number:</strong> <span className="font-mono" style={{ color: 'var(--brand)' }}>{selectedAudit.tracking_number}</span>
              </div>
              {selectedAudit.ref_number && (
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  <strong>Order Reference:</strong> #{selectedAudit.ref_number}
                </div>
              )}
              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                <strong>Customer:</strong> {selectedAudit.customer_name} ({selectedAudit.phone})
              </div>
            </div>

            <div className="wd-timeline-stepper">
              <div className="wd-timeline-step active">
                <div className="wd-timeline-circle">📦</div>
                <div className="wd-timeline-content">
                  <div className="wd-timeline-title">Audit Start / Failure Flagged</div>
                  <div className="wd-timeline-time">
                    {selectedAudit.request_time ? new Date(selectedAudit.request_time).toLocaleString() : 'N/A'}
                  </div>
                </div>
              </div>

              {selectedAudit.evidence && selectedAudit.evidence.includes('➡️') && (
                <>
                  <div className="wd-timeline-step active">
                    <div className="wd-timeline-circle">🚚</div>
                    <div className="wd-timeline-content">
                      <div className="wd-timeline-title">Rider Enroute / Out For Delivery</div>
                      <div className="wd-timeline-time">
                        {selectedAudit.evidence.split('➡️')[0].trim()}
                      </div>
                    </div>
                  </div>

                  <div className="wd-timeline-delta">
                    ⚡ Duration Delta: <strong>{selectedAudit.duration}</strong>
                  </div>

                  <div className="wd-timeline-step active">
                    <div className="wd-timeline-circle">⚠️</div>
                    <div className="wd-timeline-content">
                      <div className="wd-timeline-title">Delivery Attempt Closed</div>
                      <div className="wd-timeline-time">
                        {selectedAudit.evidence.split('➡️')[1].trim()}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px', marginTop: '16px' }}>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>Audit Engine Verdict</div>
              <div>{getVerdictBadge(selectedAudit.verdict)}</div>
              
              <p style={{ marginTop: '10px', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                {selectedAudit.verdict?.includes('IMPOSSIBLE SPEED') && (
                  'Rider ne parcel ko "Out for delivery" mark karne ke 30 minute ke andar hi return/failed mark kar diya, jo ke physically impossible hai.'
                )}
                {selectedAudit.verdict?.includes('LATE BULK CLOSE') && (
                  'Rider ne raat 9:00 baje ke baad parcel fail mark kiya, jo aam tor par bulk mein fake return reports upload karne par hota hai.'
                )}
                {selectedAudit.verdict?.includes('INSTANT CLOSE') && (
                  'Out for delivery aur failed status entries ka time same tha ya aapas mein reverse tha, jo digital status manipulaton ko zahir karta hai.'
                )}
                {selectedAudit.verdict?.includes('VERIFIED ATTEMPT') && (
                  'Rider tracking timeline standard limits ke mutabiq hai. Lagta hai rider ne genuine try ki thi.'
                )}
                {!selectedAudit.verdict?.includes('IMPOSSIBLE SPEED') && !selectedAudit.verdict?.includes('LATE BULK CLOSE') && !selectedAudit.verdict?.includes('INSTANT CLOSE') && !selectedAudit.verdict?.includes('VERIFIED') && (
                  'Parcel abhi bhi movement mein hai ya check failed status abhi record nahi hui.'
                )}
              </p>
            </div>

            <div className="flex gap-2 justify-end mt-4">
              <button className="btn btn-secondary" onClick={() => setSelectedAudit(null)}>Close</button>
              <button 
                className="btn btn-primary" 
                onClick={() => { sendWhatsAppWarning(selectedAudit); setSelectedAudit(null); }}
                disabled={sendingWAs[selectedAudit.id]}
              >
                {sendingWAs[selectedAudit.id] ? 'Sending...' : '💬 Send WhatsApp Warning'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
