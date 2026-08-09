import React, { useState, useEffect, useCallback } from 'react'
import { useApp } from '../context/AppContext'

export default function ShipperAdvice() {
  const { activeStoreId, addToast } = useApp()
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('advice_required')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCourier, setSelectedCourier] = useState('all')

  const [adviceRequired, setAdviceRequired] = useState([])
  const [stuckParcels, setStuckParcels] = useState([])
  const [reattemptsSent, setReattemptsSent] = useState([])
  const [returnsRequested, setReturnsRequested] = useState([])
  const [counts, setCounts] = useState({ advice_required: 0, stuck_parcels: 0, reattempts_sent: 0, returns_requested: 0, total: 0 })

  // Modal States
  const [reattemptModalOrder, setReattemptModalOrder] = useState(null)
  const [reattemptRemark, setReattemptRemark] = useState('')
  const [allowOpenParcel, setAllowOpenParcel] = useState(true)
  const [modalLoading, setModalLoading] = useState(false)

  const [imageModalOrder, setImageModalOrder] = useState(null)
  const [historyModalOrder, setHistoryModalOrder] = useState(null)
  const [liveHistory, setLiveHistory] = useState([])
  const [liveHistoryLoading, setLiveHistoryLoading] = useState(false)

  const openHistoryModal = async (order) => {
    setHistoryModalOrder(order)
    setLiveHistory([])
    setLiveHistoryLoading(true)
    try {
      const res = await fetch(`/api/shipper-advice/live-tracking-history?tracking_number=${encodeURIComponent(order.tracking_number)}&store_id=${activeStoreId}`)
      if (res.ok) {
        const data = await res.json()
        setLiveHistory(Array.isArray(data.tracking_history) ? data.tracking_history : [])
        if (data.courier_status) {
          setHistoryModalOrder(prev => ({ ...prev, courier_status: data.courier_status }))
        }
      }
    } catch (err) {
      console.error('Failed to fetch live tracking history:', err)
    } finally {
      setLiveHistoryLoading(false)
    }
  }

  // Fetch Shipper Advice Feed
  const fetchAdviceFeed = useCallback(async () => {
    if (!activeStoreId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/shipper-advice?store_id=${activeStoreId}`)
      if (!res.ok) throw new Error('Failed to load Shipper Advice data')
      const data = await res.json()

      setAdviceRequired(data.advice_required || [])
      setStuckParcels(data.stuck_parcels || [])
      setReattemptsSent(data.reattempts_sent || [])
      setReturnsRequested(data.returns_requested || [])
      setCounts(data.counts || { advice_required: 0, stuck_parcels: 0, reattempts_sent: 0, returns_requested: 0, total: 0 })
    } catch (err) {
      addToast(`❌ ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [activeStoreId, addToast])

  useEffect(() => {
    fetchAdviceFeed()
  }, [fetchAdviceFeed])

  // Handle Reattempt Submit
  const handleReattemptSubmit = async () => {
    if (!reattemptModalOrder) return
    setModalLoading(true)
    try {
      const res = await fetch('/api/shipper-advice/reattempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: reattemptModalOrder.id,
          remarks: reattemptRemark,
          allow_open: allowOpenParcel
        })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        addToast(`⚡ Reattempt logged for ${reattemptModalOrder.ref_number || reattemptModalOrder.tracking_number}!`, 'success')
        setReattemptModalOrder(null)
        setReattemptRemark('')
        fetchAdviceFeed()
      } else {
        addToast(`❌ ${data.error || 'Failed to submit reattempt'}`, 'error')
      }
    } catch {
      addToast('Network error while logging reattempt', 'error')
    } finally {
      setModalLoading(false)
    }
  }

  // Handle Return Submit
  const handleReturnSubmit = async (order) => {
    if (!window.confirm(`Mark Return Requested for ${order.ref_number || order.tracking_number}?`)) return
    try {
      const res = await fetch('/api/shipper-advice/return', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: order.id, reason: 'Return Requested by Merchant' })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        addToast(`↩️ Return requested for ${order.ref_number || order.tracking_number}!`, 'info')
        fetchAdviceFeed()
      }
    } catch {
      addToast('Failed to log return request', 'error')
    }
  }

  // Handle Ignore/Blacklist
  const handleIgnore = async (order) => {
    if (!window.confirm(`Ignore tracking ${order.tracking_number} from Shipper Advice feed?`)) return
    try {
      const res = await fetch('/api/shipper-advice/ignore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracking_number: order.tracking_number, store_id: activeStoreId })
      })
      if (res.ok) {
        addToast(`🙈 ${order.tracking_number} ignored`, 'info')
        fetchAdviceFeed()
      }
    } catch {
      addToast('Failed to ignore tracking', 'error')
    }
  }

  // WhatsApp Alert Builder
  const triggerWhatsAppAlert = (order) => {
    const rawStatus = order.courier_status || 'Shipper Advice Required'
    const msg = `📢 *SHIPPER ADVICE ALERT ~ TRACE ERP*\n📦 *Order:* ${order.ref_number || 'N/A'}\n🚚 *Tracking:* ${order.tracking_number}\n🛍️ *Customer:* ${order.customer_name || 'N/A'} (${order.phone || 'N/A'})\n📍 *City:* ${order.city || 'N/A'}\n⚠️ *Courier Status:* ${rawStatus}\n💰 *Amount:* Rs ${parseInt(order.price || 0).toLocaleString()}`
    
    const useWeb = localStorage.getItem('trace_use_wa_web') === 'true'
    const baseUrl = useWeb ? 'https://web.whatsapp.com/send' : 'whatsapp://send'
    const phoneClean = (order.phone || '').replace(/[^0-9]/g, '')
    const targetPhone = phoneClean.length === 11 && phoneClean.startsWith('0') ? `92${phoneClean.slice(1)}` : phoneClean
    window.open(`${baseUrl}?phone=${targetPhone}&text=${encodeURIComponent(msg)}`, '_blank')
  }

  // Filter Logic: Global Cross-Stage Search across all tabs
  const allCategorizedOrders = [
    ...adviceRequired.map(o => ({ ...o, stage_badge: '🚨 Advice Required' })),
    ...stuckParcels.map(o => ({ ...o, stage_badge: '📦 Stuck Parcel' })),
    ...reattemptsSent.map(o => ({ ...o, stage_badge: '🔄 Reattempt Sent' })),
    ...returnsRequested.map(o => ({ ...o, stage_badge: '📦 Return Requested' }))
  ]

  let baseOrders = []
  if (searchQuery.trim().length > 0) {
    baseOrders = allCategorizedOrders
  } else if (activeTab === 'advice_required') {
    baseOrders = adviceRequired
  } else if (activeTab === 'stuck_parcels') {
    baseOrders = stuckParcels
  } else if (activeTab === 'reattempts') {
    baseOrders = reattemptsSent
  } else if (activeTab === 'returns') {
    baseOrders = returnsRequested
  }

  const displayOrders = baseOrders.filter(o => {
    if (selectedCourier !== 'all') {
      const c = (o.courier || 'postex').toLowerCase()
      if (!c.includes(selectedCourier.toLowerCase())) return false
    }
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase().trim()
    return (
      (o.tracking_number || '').toLowerCase().includes(q) ||
      (o.ref_number || '').toLowerCase().includes(q) ||
      `#${o.ref_number || ''}`.toLowerCase().includes(q) ||
      (o.customer_name || '').toLowerCase().includes(q) ||
      (o.phone || '').toLowerCase().includes(q) ||
      (o.city || '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="shipper-advice-page" style={{ padding: '24px', maxWidth: '1440px', margin: '0 auto' }}>
      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
            🧠 Shipper Advice Engine
            <span style={{ fontSize: '0.75rem', padding: '3px 9px', borderRadius: 12, background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
              ⚡ 100% ERP-Status Independent
            </span>
          </h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            Real-time courier problem feed directly from PostEx & courier APIs
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={fetchAdviceFeed} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            🔄 Refresh Feed
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={{ padding: 18, borderRadius: 16, background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.15), rgba(251, 146, 60, 0.05))', border: '1px solid rgba(249, 115, 22, 0.3)' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fb923c', textTransform: 'uppercase', marginBottom: 6 }}>🚨 Advice Required</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--text-primary)' }}>{counts.advice_required} <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>parcels</span></div>
        </div>

        <div style={{ padding: 18, borderRadius: 16, background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.15), rgba(192, 132, 252, 0.05))', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#c084fc', textTransform: 'uppercase', marginBottom: 6 }}>📦 Stuck Parcels (≥ 2 Days)</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--text-primary)' }}>{counts.stuck_parcels || 0} <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>parcels</span></div>
        </div>

        <div style={{ padding: 18, borderRadius: 16, background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.05))', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', marginBottom: 6 }}>🔄 Reattempts Sent</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--text-primary)' }}>{counts.reattempts_sent} <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>tracked</span></div>
        </div>

        <div style={{ padding: 18, borderRadius: 16, background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(248, 113, 113, 0.05))', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f87171', textTransform: 'uppercase', marginBottom: 6 }}>📦 Returns Requested</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--text-primary)' }}>{counts.returns_requested} <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>parcels</span></div>
        </div>
      </div>

      {/* Controls Bar: Search & Courier Filter */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 280, position: 'relative' }}>
          <input
            type="text"
            placeholder="🔍 Global Search by Tracking Number, Order #, Name, Phone, City..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              fontSize: '0.92rem'
            }}
          />
        </div>
        <select
          value={selectedCourier}
          onChange={e => setSelectedCourier(e.target.value)}
          style={{
            padding: '12px 16px',
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            fontSize: '0.9rem',
            fontWeight: 600
          }}
        >
          <option value="all">🚚 All Couriers</option>
          <option value="postex">PostEx</option>
          <option value="trax">Trax</option>
          <option value="leopard">Leopards</option>
        </select>
      </div>

      {/* Category Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 12, flexWrap: 'wrap' }}>
        <button
          onClick={() => setActiveTab('advice_required')}
          className={`btn ${activeTab === 'advice_required' && !searchQuery.trim() ? 'btn-primary' : 'btn-secondary'}`}
          style={{ borderRadius: 20, padding: '8px 18px', fontWeight: 700 }}
        >
          🚨 Shipper Advice Required ({counts.advice_required})
        </button>
        <button
          onClick={() => setActiveTab('stuck_parcels')}
          className={`btn ${activeTab === 'stuck_parcels' && !searchQuery.trim() ? 'btn-primary' : 'btn-secondary'}`}
          style={{ borderRadius: 20, padding: '8px 18px', fontWeight: 700, color: activeTab === 'stuck_parcels' ? '#fff' : '#c084fc' }}
        >
          📦 Stuck Parcels ({counts.stuck_parcels || 0})
        </button>
        <button
          onClick={() => setActiveTab('reattempts')}
          className={`btn ${activeTab === 'reattempts' && !searchQuery.trim() ? 'btn-primary' : 'btn-secondary'}`}
          style={{ borderRadius: 20, padding: '8px 18px', fontWeight: 700 }}
        >
          🔄 Reattempts Sent ({counts.reattempts_sent})
        </button>
        <button
          onClick={() => setActiveTab('returns')}
          className={`btn ${activeTab === 'returns' && !searchQuery.trim() ? 'btn-primary' : 'btn-secondary'}`}
          style={{ borderRadius: 20, padding: '8px 18px', fontWeight: 700 }}
        >
          📦 Returns Requested ({counts.returns_requested})
        </button>
      </div>

      {/* Main Data Table */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>⚡ Loading Shipper Advice Feed...</div>
      ) : displayOrders.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', background: 'var(--bg-surface)', borderRadius: 16, border: '1px dashed var(--border)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>✅</div>
          <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>No Parcels in This Stage</h3>
          <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: '0.88rem' }}>All parcels have been actioned or no courier problem feed is active.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', background: 'var(--bg-surface)', borderRadius: 16, border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '14px 16px' }}>ORDER / PARCEL</th>
                <th style={{ padding: '14px 16px' }}>CUSTOMER</th>
                <th style={{ padding: '14px 16px' }}>PRODUCT DETAILS</th>
                <th style={{ padding: '14px 16px' }}>RAW COURIER REMARK</th>
                <th style={{ padding: '14px 16px' }}>PRICE</th>
                <th style={{ padding: '14px 16px', textAlign: 'right' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {displayOrders.map(order => (
                <tr key={order.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  {/* Order / Parcel Column */}
                  <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                    <div style={{ fontWeight: 800, color: 'var(--brand)', fontSize: '0.95rem' }}>
                      #{order.ref_number || order.id}
                    </div>
                    <div style={{ fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--text-primary)', marginTop: 2 }}>
                      {order.tracking_number}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                      {order.courier || 'PostEx'}
                    </div>
                    {order.line_items_parsed && order.line_items_parsed.length > 0 && (
                      <button
                        onClick={() => setImageModalOrder(order)}
                        className="btn btn-xs btn-secondary"
                        style={{ marginTop: 8, padding: '3px 8px', borderRadius: 8, fontSize: '0.72rem' }}
                      >
                        🖼️ View Images ({order.line_items_parsed.length})
                      </button>
                    )}
                  </td>

                  {/* Customer Column */}
                  <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{order.customer_name || 'N/A'}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--brand)', marginTop: 2 }}>{order.phone || 'N/A'}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>📍 {order.city || 'N/A'}</div>
                  </td>

                  {/* Product Details Column */}
                  <td style={{ padding: '14px 16px', verticalAlign: 'top', maxWidth: 260 }}>
                    <div style={{ fontSize: '0.84rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>
                      {order.product_titles || 'N/A'}
                    </div>
                  </td>

                  {/* Raw Courier Remark Column */}
                  <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: 8,
                        background: 'rgba(249, 115, 22, 0.15)',
                        color: '#fb923c',
                        border: '1px solid rgba(249, 115, 22, 0.3)',
                        fontSize: '0.78rem',
                        fontWeight: 700
                      }}>
                        ⚠️ {order.courier_status || 'Delivery Under Review'}
                      </span>
                      {order.days_stuck >= 2 && (
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: 8,
                          background: 'rgba(239, 68, 68, 0.15)',
                          color: '#f87171',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          fontSize: '0.72rem',
                          fontWeight: 700
                        }} title="No status update movement from courier for >= 2 days">
                          ⏳ Stuck {order.days_stuck} Days
                        </span>
                      )}
                    </div>
                    {order.notes && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)', padding: '6px 8px', borderRadius: 6 }}>
                        📝 {order.notes}
                      </div>
                    )}
                  </td>

                  {/* Price Column */}
                  <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                    <div style={{ fontWeight: 800, color: '#10b981' }}>
                      Rs {parseInt(order.price || 0).toLocaleString()}
                    </div>
                  </td>

                  {/* Actions Column */}
                  <td style={{ padding: '14px 16px', verticalAlign: 'top', textAlign: 'right' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                      <button
                        onClick={() => {
                          setReattemptModalOrder(order)
                          setReattemptRemark('Customer requested reattempt')
                        }}
                        className="btn btn-sm btn-primary"
                        style={{ padding: '6px 14px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700 }}
                      >
                        ⚡ Reattempt
                      </button>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => handleReturnSubmit(order)}
                          className="btn btn-sm btn-secondary"
                          style={{ padding: '4px 10px', borderRadius: 8, fontSize: '0.75rem', color: '#f87171' }}
                        >
                          ↩️ Return
                        </button>
                        <button
                          onClick={() => openHistoryModal(order)}
                          className="btn btn-sm btn-secondary"
                          style={{ padding: '4px 10px', borderRadius: 8, fontSize: '0.75rem', color: 'var(--brand)', fontWeight: 600 }}
                          title="Live fetch real-time courier status history log"
                        >
                          📜 History
                        </button>
                        <button
                          onClick={() => triggerWhatsAppAlert(order)}
                          className="btn btn-sm btn-secondary"
                          style={{ padding: '4px 10px', borderRadius: 8, fontSize: '0.75rem', color: '#25D366' }}
                        >
                          💬 WA Alert
                        </button>
                        <button
                          onClick={() => handleIgnore(order)}
                          className="btn btn-sm btn-secondary"
                          style={{ padding: '4px 8px', borderRadius: 8, fontSize: '0.75rem' }}
                          title="Hide parcel"
                        >
                          👁️
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Reattempt Action Modal */}
      {reattemptModalOrder && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 500, padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '1.2rem', color: 'var(--text-primary)' }}>
              ⚡ Log Reattempt Instruction for #{reattemptModalOrder.ref_number || reattemptModalOrder.id}
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Tracking: {reattemptModalOrder.tracking_number} | Customer: {reattemptModalOrder.customer_name} ({reattemptModalOrder.phone})
            </p>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>
                REATTEMPT REMARK FOR COURIER RIDER:
              </label>
              <textarea
                rows={3}
                value={reattemptRemark}
                onChange={e => setReattemptRemark(e.target.value)}
                placeholder="e.g. Customer was out of city, reattempt on Thursday. Call before delivery."
                style={{ width: '100%', padding: '10px', borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '0.88rem' }}
              />
            </div>

            <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="checkbox"
                id="allowOpenParcel"
                checked={allowOpenParcel}
                onChange={e => setAllowOpenParcel(e.target.checked)}
                style={{ width: 18, height: 18, cursor: 'pointer' }}
              />
              <label htmlFor="allowOpenParcel" style={{ fontSize: '0.88rem', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 600 }}>
                📦 Allow Open Parcel Inspection (Recommended)
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setReattemptModalOrder(null)} className="btn btn-secondary">
                Cancel
              </button>
              <button onClick={handleReattemptSubmit} disabled={modalLoading} className="btn btn-primary" style={{ fontWeight: 700 }}>
                {modalLoading ? '⌛ Sending...' : 'Submit Reattempt Instruction →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Images Lightbox Modal */}
      {imageModalOrder && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 700, padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>
                🖼️ Product Images: Order #{imageModalOrder.ref_number || imageModalOrder.id}
              </h3>
              <button onClick={() => setImageModalOrder(null)} className="btn btn-secondary btn-sm">✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, maxHeight: '70vh', overflowY: 'auto' }}>
              {imageModalOrder.line_items_parsed.map((item, idx) => (
                <div key={idx} style={{ background: 'var(--bg-surface)', padding: 12, borderRadius: 12, border: '1px solid var(--border)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  {item.image ? (
                    <a href={item.image} target="_blank" rel="noopener noreferrer" title="Click to view full image in new tab" style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 6, marginBottom: 8 }}>
                      <img src={item.image} alt={item.title} style={{ maxWidth: '100%', maxHeight: 260, objectFit: 'contain', borderRadius: 6 }} />
                    </a>
                  ) : (
                    <div style={{ width: '100%', height: 160, background: 'rgba(255,255,255,0.05)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', marginBottom: 8 }}>🛍️</div>
                  )}
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{item.title || item.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Qty: {item.quantity || 1}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Order Journey & Live Status History Log Modal */}
      {historyModalOrder && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 650, padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
              <div>
                <h3 style={{ margin: '0 0 4px', color: 'var(--text-primary)', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  📜 Order Journey: #{historyModalOrder.ref_number || historyModalOrder.id}
                </h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Tracking: <code style={{ color: 'var(--brand)', fontWeight: 700 }}>{historyModalOrder.tracking_number}</code> ({historyModalOrder.courier || 'Courier'}) | Customer: <b>{historyModalOrder.customer_name}</b> ({historyModalOrder.phone})
                </div>
              </div>
              <button onClick={() => setHistoryModalOrder(null)} className="btn btn-secondary btn-sm">✕</button>
            </div>

            {/* Status Timeline Feed */}
            <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 6 }}>
              {/* Current Status Header Card */}
              <div style={{ background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.25)', borderRadius: 12, padding: 14, marginBottom: 16 }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
                  CURRENT LIVE COURIER REMARK (API)
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {historyModalOrder.courier_status || historyModalOrder.delivery_status || 'In Transit'}
                </div>
                {historyModalOrder.notes && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 8, background: 'var(--bg-surface)', padding: 8, borderRadius: 6, border: '1px solid var(--border)' }}>
                    <b>System Notes:</b> {historyModalOrder.notes}
                  </div>
                )}
              </div>

              {/* Real-time Live Tracking Timeline */}
              {liveHistoryLoading ? (
                <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  <span className="loading-spinner" style={{ marginRight: 8 }} /> Live fetching tracking logs directly from courier API...
                </div>
              ) : liveHistory.length === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center', opacity: 0.7, fontSize: '0.88rem' }}>
                  ℹ️ No granular tracking logs returned by courier API for parcel <b>{historyModalOrder.tracking_number}</b>.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'relative', paddingLeft: 14 }}>
                  <div style={{ position: 'absolute', top: 10, bottom: 10, left: 4, width: 2, background: 'var(--border)' }} />
                  {liveHistory.map((ev, i) => {
                    const titleText = ev.transactionStatusMessage || ev.statusMessage || ev.message || ev.transactionStatus || ev.status || ev.activity || 'Courier Remark';
                    const rawTime = ev.transactionStatusDate || ev.statusDate || ev.entryDate || ev.createdDate || ev.transactionDate || ev.dateTime || ev.date || ev.timestamp || ev.time || ev.createdAt || ev.updatedAt || '';
                    
                    let timeText = '';
                    if (rawTime) {
                      try {
                        const d = new Date(rawTime);
                        if (!isNaN(d.getTime())) {
                          timeText = d.toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true
                          });
                        } else {
                          timeText = String(rawTime);
                        }
                      } catch (_) {
                        timeText = String(rawTime);
                      }
                    }

                    const descText = [ev.remarks, ev.comment, ev.city, ev.location].filter(Boolean).join(' • ');

                    return (
                      <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', position: 'relative' }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: i === 0 ? 'var(--brand)' : 'var(--text-muted)', marginTop: 4, flexShrink: 0, zIndex: 1 }} />
                        <div style={{ flex: 1, background: 'var(--bg-surface)', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 12 }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                              {titleText}
                            </span>
                            <span style={{ fontSize: '0.72rem', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 6, color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap', border: '1px solid rgba(255,255,255,0.08)' }}>
                              {timeText || 'Date N/A'}
                            </span>
                          </div>
                          {descText && (
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                              {descText}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
