import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'

export default function StuckMonitor() {
  const { activeStoreId, addToast, setBadgeCounts } = useApp()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const load = () => {
    if (!activeStoreId) return
    setLoading(true)
    fetch(`/api/monitors/stuck?store_id=${activeStoreId}`)
      .then(r => r.json())
      .then(data => {
        setOrders(Array.isArray(data) ? data : [])
        setBadgeCounts(prev => ({ ...prev, stuck: Array.isArray(data) ? data.length : 0 }))
        setLoading(false)
      })
      .catch(() => { addToast('Failed to load stuck orders', 'error'); setLoading(false) })
  }

  useEffect(() => { load() }, [activeStoreId])

  const handleIgnore = async (order) => {
    try {
      await fetch('/api/monitors/blacklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: activeStoreId, tracking_number: order.tracking_number })
      })
      addToast(`🗑️ ${order.tracking_number} blacklisted`, 'success')
      load()
    } catch {
      addToast('Failed to blacklist', 'error')
    }
  }

  const getRowClass = (days) => {
    if (days >= 4) return 'stuck-critical'
    if (days >= 2) return 'stuck-warning'
    return ''
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>⏳ Stuck Monitor</h2>
          <p>Orders with no status update for more than 48 hours</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
          {loading ? <span className="loading-spinner"></span> : '🔄'} Refresh
        </button>
      </div>

      {loading ? (
        <div className="loading-overlay"><span className="loading-spinner"></span> Scanning orders...</div>
      ) : orders.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">✅</div>
          <h3>No Stuck Orders</h3>
          <p>All orders have recent activity</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Order #</th>
                <th>Tracking #</th>
                <th>Customer</th>
                <th>Status Insight</th>
                <th>Current Status</th>
                <th>⏳ Days Stuck</th>
                <th>Last Update</th>
                <th>Price</th>
                <th>Product</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id} className={getRowClass(o.days_stuck)}>
                  <td>
                    <button 
                      className="btn-link" 
                      onClick={() => navigate('/search', { state: { keyword: o.ref_number, status: 'All Statuses', preset: 'All Time' } })}
                      style={{ fontWeight: 800, color: 'var(--brand)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                    >
                      {o.ref_number || '—'}
                    </button>
                  </td>
                  <td className="font-mono" style={{ color: 'var(--brand)', fontSize: '0.75rem' }}>{o.tracking_number}</td>
                  <td>{o.customer_name}</td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {o.insight_type === 'MANUAL_ID' && (
                        <span className="badge" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#a78bfa', alignSelf: 'flex-start' }}>
                          📝 Manual ID (No Sync)
                        </span>
                      )}
                      {o.insight_type === 'PICKUP_PENDING' && (
                        <span className="badge" style={{ background: 'rgba(156, 163, 175, 0.15)', color: 'var(--text-muted)', alignSelf: 'flex-start' }}>
                          ⏳ Pick-up Pending
                        </span>
                      )}
                      {o.insight_type === 'STUCK_TRANSIT' && (
                        <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: 'var(--yellow)', alignSelf: 'flex-start' }}>
                          📦 Stuck in Transit
                        </span>
                      )}
                      {o.insight_type === 'ADVICE_REQUIRED' && (
                        <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.15)', color: 'var(--red)', alignSelf: 'flex-start' }}>
                          ⚠️ Advice Action Needed
                        </span>
                      )}

                      {o.tracking_update && (
                        <div 
                          style={{ fontSize: '0.7rem', color: 'var(--brand)', cursor: 'help', display: 'flex', alignItems: 'center', gap: 4 }}
                          title={`Changed from "${o.tracking_update.old_tracking}" to "${o.tracking_update.new_tracking}" by ${o.tracking_update.changed_by} on ${new Date(o.tracking_update.changed_at).toLocaleString()}`}
                        >
                          <span>🔄 Tracking Updated</span>
                          <span style={{ opacity: 0.6, fontSize: '0.65rem' }}>
                            (was: {o.tracking_update.old_tracking.substring(0, 10)}...)
                          </span>
                        </div>
                      )}
                    </div>
                  </td>
                  <td><span className="badge badge-stuck">{o.delivery_status}</span></td>
                  <td style={{ fontWeight: 700, color: o.days_stuck >= 4 ? 'var(--red)' : o.days_stuck >= 2 ? 'var(--yellow)' : 'var(--text-primary)' }}>
                    {o.days_stuck}d {o.hours_stuck % 24}h
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{o.status_date ? new Date(o.status_date).toLocaleDateString() : '—'}</td>
                  <td style={{ fontWeight: 600 }}>Rs {parseInt(o.price || 0).toLocaleString()}</td>
                  <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {o.product_titles || '—'}
                  </td>
                  <td>
                    <button className="btn btn-danger btn-sm" onClick={() => handleIgnore(o)}>
                      🚫 Ignore
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
