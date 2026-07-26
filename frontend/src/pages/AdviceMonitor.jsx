import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'

export default function AdviceMonitor() {
  const { activeStoreId, addToast, setBadgeCounts } = useApp()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [actionStates, setActionStates] = useState({})
  
  // Retry Note Modal State
  const [retryModalOrder, setRetryModalOrder] = useState(null)
  const [retryNote, setRetryNote] = useState('')

  const load = () => {
    if (!activeStoreId) return
    setLoading(true)
    fetch(`/api/monitors/advice?store_id=${activeStoreId}`)
      .then(r => r.json())
      .then(data => {
        setOrders(Array.isArray(data) ? data : [])
        setBadgeCounts(prev => ({ ...prev, advice: Array.isArray(data) ? data.length : 0 }))
        setLoading(false)
      })
      .catch(() => { addToast('Failed to load advice orders', 'error'); setLoading(false) })
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

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>🧠 Advice Monitor</h2>
          <p>Orders requiring shipper action (Refused, Incomplete Address, etc.)</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
          {loading ? <span className="loading-spinner"></span> : '🔄'} Refresh
        </button>
      </div>

      {loading ? (
        <div className="loading-overlay"><span className="loading-spinner"></span> Scanning...</div>
      ) : orders.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">✅</div>
          <h3>No Orders Need Action</h3>
          <p>No shipper advice statuses detected</p>
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
              {orders.map(o => {
                const state = actionStates[o.id]
                const isDone = state === 'done'
                const isLoading = state === 'loading'

                return (
                  <tr key={o.id}>
                    <td className="font-mono" style={{ color: 'var(--brand)', fontSize: '0.75rem' }}>{o.tracking_number}</td>
                    <td>{o.customer_name}</td>
                    <td><span className="badge badge-advice">{o.delivery_status}</span></td>
                    <td>
                      <span className="badge" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)', border: '1px solid var(--border)', fontSize: '0.72rem' }}>
                        {o.courier_status || '—'}
                      </span>
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
    </div>
  )
}

