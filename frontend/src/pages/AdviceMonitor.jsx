import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'

export default function AdviceMonitor() {
  const { activeStoreId, addToast, setBadgeCounts } = useApp()
  const [activeTab, setActiveTab] = useState('advice_required') // 'advice_required' | 'first_attempt' | 'immediate_return' | 'reattempts'
  const [orders, setOrders] = useState([])
  const [reattemptOrders, setReattemptOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [actionStates, setActionStates] = useState({})
  
  // Retry Note Modal State
  const [retryModalOrder, setRetryModalOrder] = useState(null)
  const [retryNote, setRetryNote] = useState('')

  // History Timeline Modal State
  const [historyModalOrder, setHistoryModalOrder] = useState(null)
  const [historyData, setHistoryData] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const load = () => {
    if (!activeStoreId) return
    setLoading(true)
    Promise.all([
      fetch(`/api/monitors/advice?store_id=${activeStoreId}`).then(r => r.json()),
      fetch(`/api/monitors/reattempts?store_id=${activeStoreId}`).then(r => r.json())
    ]).then(([adviceData, reattemptData]) => {
      setOrders(Array.isArray(adviceData) ? adviceData : [])
      setReattemptOrders(Array.isArray(reattemptData) ? reattemptData : [])
      setBadgeCounts(prev => ({ ...prev, advice: Array.isArray(adviceData) ? adviceData.length : 0 }))
      setLoading(false)
    }).catch(() => { addToast('Failed to load advice orders', 'error'); setLoading(false) })
  }

  useEffect(() => { load() }, [activeStoreId])

  const sendAction = async (order, action, customNote = '') => {
    setActionStates(prev => ({ ...prev, [order.id]: 'loading' }))
    try {
      const res = await fetch('/api/monitors/courier-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: activeStoreId,
          tracking_number: order.tracking_number,
          action,
          note: customNote || ''
        })
      })
      const data = await res.json()
      if (data.success) {
        addToast(data.message || `✅ ${action} sent to ${order.courier || 'Courier'}`, 'success')
        setActionStates(prev => ({ ...prev, [order.id]: 'done' }))
        load()
      } else {
        addToast(`❌ ${data.error}`, 'error')
        setActionStates(prev => ({ ...prev, [order.id]: null }))
      }
    } catch {
      addToast('Network error', 'error')
      setActionStates(prev => ({ ...prev, [order.id]: null }))
    } finally {
      setRetryModalOrder(null)
      setRetryNote('')
    }
  }

  const handleOpenRetryModal = (order) => {
    setRetryModalOrder(order)
    setRetryNote('')
  }

  const handleOpenHistory = async (order) => {
    setHistoryModalOrder(order)
    setHistoryData([])
    setHistoryLoading(true)
    try {
      const res = await fetch(`/api/monitors/tracking-history?store_id=${activeStoreId}&tracking_number=${order.tracking_number}`)
      const data = await res.json()
      if (data.success && Array.isArray(data.history)) {
        setHistoryData(data.history)
      } else {
        addToast('No tracking history available', 'info')
      }
    } catch {
      addToast('Failed to fetch tracking history', 'error')
    } finally {
      setHistoryLoading(false)
    }
  }

  const handleIgnore = async (order) => {
    await fetch('/api/monitors/blacklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_id: activeStoreId, tracking_number: order.tracking_number })
    })
    addToast(`🚫 ${order.tracking_number} ignored`, 'info')
    load()
  }

  const getWhatsAppLink = (order) => {
    const msg = `🚨 *${order.courier || 'PostEx'}~TRACE ERP*\n📦 Tracking: ${order.tracking_number}\n🛍️ Customer: ${order.customer_name}\n💬 Status: ${order.delivery_status}\n💰 Price: Rs ${parseInt(order.price || 0).toLocaleString()}`
    
    let phone = (order.phone || '').trim().replace(/[^0-9]/g, '');
    if (phone.startsWith('0')) {
      phone = '92' + phone.substring(1);
    } else if (phone.length === 10 && !phone.startsWith('92')) {
      phone = '92' + phone;
    }
    
    return `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}`
  }

  // Categorize advice orders by failed attempts & immediate return status
  const adviceRequiredOrders = orders.filter(o => o.advice_category === 'advice_required')
  const firstAttemptOrders = orders.filter(o => o.advice_category === 'first_attempt' || (!o.advice_category && parseInt(o.failed_attempts || 0, 10) <= 1))
  const immediateReturnOrders = orders.filter(o => o.advice_category === 'immediate_return')

  let displayOrders = []
  if (activeTab === 'advice_required') displayOrders = adviceRequiredOrders
  else if (activeTab === 'first_attempt') displayOrders = firstAttemptOrders
  else if (activeTab === 'immediate_return') displayOrders = immediateReturnOrders
  else if (activeTab === 'reattempts') displayOrders = reattemptOrders

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>🧠 Advice Monitor</h2>
          <p>Real-time Shipper Advice tracking & 1st attempt failure alerts</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
          {loading ? <span className="loading-spinner"></span> : '🔄'} Refresh
        </button>
      </div>

      {/* Tabs Switcher */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 12, flexWrap: 'wrap' }}>
        <button
          className={`btn ${activeTab === 'advice_required' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('advice_required')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8, padding: '8px 14px', fontWeight: 600, fontSize: '0.88rem' }}
        >
          🚨 Shipper Advice Required ({adviceRequiredOrders.length})
        </button>

        <button
          className={`btn ${activeTab === 'first_attempt' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('first_attempt')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8, padding: '8px 14px', fontWeight: 600, fontSize: '0.88rem' }}
        >
          🔴 1st Attempt Failed ({firstAttemptOrders.length})
        </button>

        <button
          className={`btn ${activeTab === 'immediate_return' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('immediate_return')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            borderRadius: 8,
            padding: '8px 14px',
            fontWeight: 700,
            fontSize: '0.88rem',
            background: activeTab === 'immediate_return' ? '#ef4444' : 'rgba(239,68,68,0.12)',
            color: activeTab === 'immediate_return' ? '#fff' : '#ef4444',
            border: '1px solid rgba(239,68,68,0.3)'
          }}
        >
          ⚡ 1st Attempt Immediate Return ({immediateReturnOrders.length})
        </button>

        <button
          className={`btn ${activeTab === 'reattempts' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('reattempts')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8, padding: '8px 14px', fontWeight: 600, fontSize: '0.88rem' }}
        >
          🔁 Reattempts Sent (Last 60 Days) ({reattemptOrders.length})
        </button>
      </div>

      {loading ? (
        <div className="loading-overlay"><span className="loading-spinner"></span> Scanning...</div>
      ) : displayOrders.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">✅</div>
          <h3>{activeTab === 'advice' ? 'No Orders Need Action' : 'No Reattempts Sent Yet'}</h3>
          <p>{activeTab === 'advice' ? 'No shipper advice statuses detected' : 'Parcels with reattempt requests will appear here'}</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Tracking #</th>
                <th>Customer</th>
                <th>ERP Status</th>
                <th>Courier Raw Status</th>
                <th>Order Notes</th>
                <th>Price</th>
                <th>Product</th>
                <th>Courier Action</th>
                <th>Share</th>
                <th>Ignore</th>
              </tr>
            </thead>
            <tbody>
              {displayOrders.map(o => {
                const state = actionStates[o.id]
                const isDone = state === 'done'
                const isLoading = state === 'loading'

                return (
                  <tr key={o.id}>
                    <td className="font-mono" style={{ fontSize: '0.75rem' }}>
                      <div style={{ color: 'var(--brand)', fontWeight: 600, fontSize: '0.78rem' }}>{o.tracking_number}</div>
                      <Link
                        to={`/search?q=${encodeURIComponent(o.tracking_number)}`}
                        className="btn btn-secondary btn-xs"
                        title="Open this order in Command Center"
                        style={{
                          marginTop: 4,
                          padding: '2px 7px',
                          fontSize: '0.65rem',
                          background: 'rgba(99,102,241,0.12)',
                          color: '#818cf8',
                          border: '1px solid rgba(99,102,241,0.3)',
                          borderRadius: 4,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          textDecoration: 'none'
                        }}
                      >
                        ⚡ Command Center ↗
                      </Link>
                    </td>
                    <td>{o.customer_name}</td>
                    <td><span className="badge badge-advice">{o.delivery_status}</span></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="badge" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)', border: '1px solid var(--border)', fontSize: '0.72rem' }}>
                          {o.courier_status || '—'}
                        </span>
                        <button
                          className="btn btn-secondary btn-xs"
                          title="View Full Courier Milestone History"
                          onClick={() => handleOpenHistory(o)}
                          style={{ padding: '2px 7px', fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          📜 History
                        </button>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-primary)', fontSize: '0.78rem', maxWidth: 200, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                      {o.notes ? <span style={{ background: 'rgba(99,102,241,0.1)', padding: '2px 6px', borderRadius: 4, border: '1px solid rgba(99,102,241,0.2)' }}>{o.notes}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={{ fontWeight: 600 }}>Rs {parseInt(o.price || 0).toLocaleString()}</td>
                    <td style={{ fontSize: '0.72rem', color: 'var(--text-muted)', maxWidth: 160 }} className="truncate">{o.product_titles || '—'}</td>
                    <td>
                      {isDone ? (
                        <span className="text-success" style={{ fontSize: '0.8rem', fontWeight: 600 }}>✅ Sent</span>
                      ) : (
                        <div className="flex gap-2">
                          <button className="btn btn-success btn-sm" disabled={isLoading} onClick={() => handleOpenRetryModal(o)}>
                            {isLoading ? <span className="loading-spinner"></span> : '🔁 Retry'}
                          </button>
                          <button className="btn btn-danger btn-sm" disabled={isLoading} onClick={() => sendAction(o, 'Return')}>
                            ↩ Return
                          </button>
                        </div>
                      )}
                    </td>
                    <td>
                      <a href={getWhatsAppLink(o)} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                        📱 WA
                      </a>
                    </td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => handleIgnore(o)}>🚫</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Retry Action Note Modal */}
      {retryModalOrder && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="modal-content" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 440, boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem', color: 'var(--text-primary)' }}>🔁 Reattempt Delivery</h3>
            <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Add an optional remark for <strong>{retryModalOrder.tracking_number}</strong> ({retryModalOrder.customer_name}) before sending to {retryModalOrder.courier || 'Courier'}.
            </p>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Instructions / Remarks for Courier:
              </label>
              <textarea
                className="input"
                rows={3}
                placeholder="e.g., Customer confirmed available tomorrow after 2 PM / Call before delivery"
                value={retryNote}
                onChange={e => setRetryNote(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', fontSize: '0.85rem', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', resize: 'vertical' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-secondary" onClick={() => setRetryModalOrder(null)}>
                Cancel
              </button>
              <button
                className="btn btn-success"
                onClick={() => sendAction(retryModalOrder, 'Reattempt', retryNote)}
              >
                🚀 Confirm & Send Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Courier Tracking Milestone Timeline Modal */}
      {historyModalOrder && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="modal-content" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 540, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>📜 Courier Milestone Timeline</h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Tracking: <strong style={{ color: 'var(--brand)' }}>{historyModalOrder.tracking_number}</strong> ({historyModalOrder.customer_name})
                </p>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setHistoryModalOrder(null)}>✕</button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, paddingRight: 6 }}>
              {historyLoading ? (
                <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
                  <span className="loading-spinner"></span> Fetching courier tracking history...
                </div>
              ) : historyData.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
                  No detailed tracking events found for this parcel.
                </div>
              ) : (
                <div style={{ position: 'relative', paddingLeft: 24 }}>
                  {/* Vertical Timeline Bar */}
                  <div style={{ position: 'absolute', left: 8, top: 10, bottom: 10, width: 2, background: 'var(--border)' }} />

                  {historyData.map((item, idx) => {
                    const msgLower = (item.message || '').toLowerCase();
                    const isAttempt = msgLower.includes('attempt') || msgLower.includes('hcr') || msgLower.includes('cna') || msgLower.includes('ica');
                    const isReview = msgLower.includes('review') || msgLower.includes('advice');
                    const isLatest = idx === historyData.length - 1;

                    let dotBg = isLatest ? '#6366f1' : isReview ? '#f59e0b' : isAttempt ? '#ef4444' : '#10b981';

                    return (
                      <div key={idx} style={{ position: 'relative', marginBottom: 18 }}>
                        {/* Timeline Circle Node */}
                        <div style={{
                          position: 'absolute',
                          left: -20,
                          top: 4,
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: dotBg,
                          boxShadow: isLatest ? `0 0 10px ${dotBg}` : 'none'
                        }} />

                        <div style={{ background: isLatest ? 'rgba(99,102,241,0.08)' : 'var(--bg-card)', border: isLatest ? '1px solid rgba(99,102,241,0.3)' : '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: isLatest ? 700 : 500, color: isAttempt ? '#f87171' : isReview ? '#fbbf24' : 'var(--text-primary)' }}>
                              {item.message}
                            </span>
                            {item.dateTime && (
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                {new Date(item.dateTime).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div style={{ marginTop: 16, pt: 12, borderTop: '1px solid var(--border)', textAlign: 'right' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setHistoryModalOrder(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


