import { useEffect, useState } from 'react'
import { useApp } from '../App'

export default function AdviceMonitor() {
  const { activeStoreId, addToast, setBadgeCounts } = useApp()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [actionStates, setActionStates] = useState({})

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

  const sendAction = async (order, action) => {
    setActionStates(prev => ({ ...prev, [order.id]: 'loading' }))
    try {
      const res = await fetch('/api/monitors/postex-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: activeStoreId, tracking_number: order.tracking_number, action, note: '' })
      })
      const data = await res.json()
      if (data.success) {
        addToast(data.message || `✅ ${action} sent`, 'success')
        setActionStates(prev => ({ ...prev, [order.id]: 'done' }))
      } else {
        addToast(`❌ ${data.error}`, 'error')
        setActionStates(prev => ({ ...prev, [order.id]: null }))
      }
    } catch {
      addToast('Network error', 'error')
      setActionStates(prev => ({ ...prev, [order.id]: null }))
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
    const msg = `🚨 *PostEx~TRACE ERP*\n📦 Tracking: ${order.tracking_number}\n🛍️ Customer: ${order.customer_name}\n💬 Status: ${order.delivery_status}\n💰 Price: Rs ${parseInt(order.price || 0).toLocaleString()}`
    return `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`
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
                <th>Status</th>
                <th>Courier Note</th>
                <th>Price</th>
                <th>Product</th>
                <th>PostEx Action</th>
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
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem', maxWidth: 180 }} className="truncate">{o.notes || '—'}</td>
                    <td style={{ fontWeight: 600 }}>Rs {parseInt(o.price || 0).toLocaleString()}</td>
                    <td style={{ fontSize: '0.72rem', color: 'var(--text-muted)', maxWidth: 160 }} className="truncate">{o.product_titles || '—'}</td>
                    <td>
                      {isDone ? (
                        <span className="text-success" style={{ fontSize: '0.8rem', fontWeight: 600 }}>✅ Sent</span>
                      ) : (
                        <div className="flex gap-2">
                          <button className="btn btn-success btn-sm" disabled={isLoading} onClick={() => sendAction(o, 'Reattempt')}>
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
    </div>
  )
}
