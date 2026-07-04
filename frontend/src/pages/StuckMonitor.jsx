import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'

export default function StuckMonitor() {
  const { activeStoreId, addToast, setBadgeCounts } = useApp()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [thresholdHours, setThresholdHours] = useState(48)
  const [activeTab, setActiveTab] = useState('ALL')
  const [showBlacklistModal, setShowBlacklistModal] = useState(false)
  const [blacklistItems, setBlacklistItems] = useState([])
  const [loadingBlacklist, setLoadingBlacklist] = useState(false)
  const navigate = useNavigate()

  const load = () => {
    if (!activeStoreId) return
    setLoading(true)
    fetch(`/api/monitors/stuck?store_id=${activeStoreId}&threshold_hours=${thresholdHours}`)
      .then(r => r.json())
      .then(data => {
        setOrders(Array.isArray(data) ? data : [])
        setBadgeCounts(prev => ({ ...prev, stuck: Array.isArray(data) ? data.length : 0 }))
        setLoading(false)
      })
      .catch(() => { addToast('Failed to load stuck orders', 'error'); setLoading(false) })
  }

  const loadBlacklist = () => {
    if (!activeStoreId) return
    setLoadingBlacklist(true)
    fetch(`/api/monitors/blacklist?store_id=${activeStoreId}`)
      .then(r => r.json())
      .then(data => {
        setBlacklistItems(Array.isArray(data) ? data : [])
        setLoadingBlacklist(false)
      })
      .catch(() => { addToast('Failed to load blacklist', 'error'); setLoadingBlacklist(false) })
  }

  useEffect(() => { load() }, [activeStoreId, thresholdHours])

  useEffect(() => {
    if (showBlacklistModal) {
      loadBlacklist()
    }
  }, [showBlacklistModal, activeStoreId])

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

  const handleRemoveFromBlacklist = async (trackingNumber) => {
    try {
      await fetch('/api/monitors/blacklist', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: activeStoreId, tracking_number: trackingNumber })
      })
      addToast(`✅ ${trackingNumber} restored to monitor`, 'success')
      loadBlacklist()
      load()
    } catch {
      addToast('Failed to restore tracking number', 'error')
    }
  }

  const getRowClass = (days) => {
    if (days >= 4) return 'stuck-critical'
    if (days >= 2) return 'stuck-warning'
    return ''
  }

  const counts = {
    ALL: orders.length,
    ADVICE_REQUIRED: orders.filter(o => o.insight_type === 'ADVICE_REQUIRED').length,
    STUCK_TRANSIT: orders.filter(o => o.insight_type === 'STUCK_TRANSIT').length,
    PICKUP_PENDING: orders.filter(o => o.insight_type === 'PICKUP_PENDING').length,
    MANUAL_ID: orders.filter(o => o.insight_type === 'MANUAL_ID').length,
  }

  const filteredOrders = orders.filter(o => {
    if (activeTab === 'ALL') return true
    return o.insight_type === activeTab
  })

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>⏳ Stuck Monitor</h2>
          <p>Orders with no status update for more than {thresholdHours} hours</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <select
            value={thresholdHours}
            onChange={(e) => {
              setThresholdHours(parseInt(e.target.value))
              setActiveTab('ALL')
            }}
            className="form-select"
            style={{ width: 180, height: 36, fontSize: '0.8rem', padding: '0 8px', borderRadius: 8 }}
          >
            <option value="24">🕒 &gt; 24 hours</option>
            <option value="48">🕒 &gt; 48 hours (Default)</option>
            <option value="120">🕒 &gt; 5 days (Critical Only)</option>
          </select>
          <button 
            className="btn btn-secondary btn-sm" 
            onClick={() => setShowBlacklistModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, height: 36, padding: '0 12px' }}
          >
            🚫 Ignored List
          </button>
          <button 
            className="btn btn-secondary btn-sm" 
            onClick={load} 
            disabled={loading}
            style={{ height: 36, padding: '0 12px' }}
          >
            {loading ? <span className="loading-spinner"></span> : '🔄'} Refresh
          </button>
        </div>
      </div>

      {/* Dynamic Segment Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { key: 'ALL', label: 'All Stuck', icon: 'All', badge: counts.ALL },
          { key: 'ADVICE_REQUIRED', label: 'Advice Needed', icon: '⚠️', badge: counts.ADVICE_REQUIRED },
          { key: 'STUCK_TRANSIT', label: 'Stuck in Transit', icon: '📦', badge: counts.STUCK_TRANSIT },
          { key: 'PICKUP_PENDING', label: 'Pick-up Pending', icon: '⏳', badge: counts.PICKUP_PENDING },
          { key: 'MANUAL_ID', label: 'Manual IDs', icon: '📝', badge: counts.MANUAL_ID }
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              padding: '12px 20px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === t.key ? '2px solid var(--brand)' : '2px solid transparent',
              color: activeTab === t.key ? 'var(--brand)' : 'var(--text-secondary)',
              fontWeight: activeTab === t.key ? 700 : 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.2s'
            }}
          >
            <span>{t.icon === 'All' ? '' : t.icon} {t.label}</span>
            <span style={{
              fontSize: '0.72rem',
              background: activeTab === t.key ? 'var(--brand)' : 'var(--bg-elevated)',
              color: activeTab === t.key ? '#fff' : 'var(--text-muted)',
              padding: '2px 8px',
              borderRadius: 20,
              fontWeight: 600
            }}>
              {t.badge}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-overlay"><span className="loading-spinner"></span> Scanning orders...</div>
      ) : filteredOrders.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">✅</div>
          <h3>No Stuck Orders</h3>
          <p>All orders have recent activity or match ignored criteria</p>
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
              {filteredOrders.map(o => (
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
                    <div style={{ display: 'flex', gap: 6 }}>
                      {o.phone && (
                        <button 
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            const name = o.customer_name ? o.customer_name.trim() : 'Customer'
                            const cleanName = name.replace(/\s+/g, ' ')
                            const waPhone = String(o.phone || '').replace(/\D/g, '').replace(/^0/, '92')
                            const useWaWeb = localStorage.getItem('trace_use_wa_web') === 'true'
                            const waBase = useWaWeb ? 'https://web.whatsapp.com/send' : 'whatsapp://send'
                            const msgText = `Assalam-o-Alaikum ${cleanName}, aapka order ${o.ref_number || ''} transit mein delay lag raha hai. Kya aapko iski delivery ke hawale se koi updates mili hain? Shukriya!`
                            window.open(`${waBase}?phone=${waPhone}&text=${encodeURIComponent(msgText)}`, '_blank')
                          }}
                          style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          💬 WhatsApp
                        </button>
                      )}
                      <button className="btn btn-danger btn-sm" onClick={() => handleIgnore(o)}>
                        🚫 Ignore
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Blacklist Manager Modal */}
      {showBlacklistModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>
          <div className="stat-card" style={{ width: 680, padding: 32, border: '1px solid var(--border-bright)', background: 'var(--bg-surface)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>🚫 Ignored Deliveries</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowBlacklistModal(false)} style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer' }}>✕</button>
            </div>
            
            {loadingBlacklist ? (
              <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                <span className="loading-spinner"></span> Loading ignored list...
              </div>
            ) : blacklistItems.length === 0 ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                <h3>No Ignored Orders</h3>
                <p>Tracking numbers ignored using "Ignore" will appear here.</p>
              </div>
            ) : (
              <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-elevated)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: 12 }}>Order #</th>
                      <th style={{ padding: 12 }}>Customer</th>
                      <th style={{ padding: 12 }}>Tracking #</th>
                      <th style={{ padding: 12 }}>Status</th>
                      <th style={{ padding: 12, textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blacklistItems.map(item => (
                      <tr key={item.tracking_number} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: 12, fontWeight: 700 }}>{item.ref_number || '—'}</td>
                        <td style={{ padding: 12 }}>{item.customer_name || '—'}</td>
                        <td style={{ padding: 12, fontFamily: 'monospace', fontSize: '0.8rem' }}>{item.tracking_number}</td>
                        <td style={{ padding: 12 }}><span className="badge badge-stuck">{item.delivery_status || '—'}</span></td>
                        <td style={{ padding: 12, textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => handleRemoveFromBlacklist(item.tracking_number)}
                            style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                          >
                            🔄 Restore
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn" onClick={() => setShowBlacklistModal(false)} style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
