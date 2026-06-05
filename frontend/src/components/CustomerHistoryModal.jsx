import React, { useState, useEffect } from 'react'
import { getStatusColor } from '../utils/orderUtils'

export default function CustomerHistoryModal({ phone, email, name, onClose, onOpenAllOrders }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (phone || email || name) {
      const params = new URLSearchParams()
      if (phone) params.append('phone', phone)
      if (email) params.append('email', email)
      if (name) params.append('name', name)

      fetch(`/api/orders/history-search?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('trace_token') || localStorage.getItem('token') || ''}`
        }
      })
        .then(res => res.json())
        .then(data => {
          console.log('CustomerHistoryModal API returned data:', data)
          const list = data && (Array.isArray(data) ? data : (data.orders || [])) || []
          console.log('CustomerHistoryModal total fetched orders length:', list.length)
          setOrders(list)
          setLoading(false)
        })
        .catch(err => {
          console.error('History fetch failed:', err)
          setLoading(false)
        })
    }
  }, [phone, email, name])

  if (loading) {
    return (
      <div
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(4px)' }}
      >
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div className="loading-spinner" style={{ marginBottom: 15 }}></div>
          <div style={{ color: 'var(--text-muted)' }}>Fetching deep history...</div>
        </div>
      </div>
    )
  }

  const customerName = orders[0]?.customer_name || name || 'Unknown Customer'
  const displayPhone = phone || orders.find(o => o.phone)?.phone || ''
  const displayEmail = email || orders.find(o => o.email)?.email || ''

  let totalValue = 0
  const statusBreakdown = {}
  orders.forEach(o => {
    let s = o.delivery_status || 'Pending'
    const lowerS = s.toLowerCase().trim()
    if (lowerS.includes('cancel') || lowerS.includes('void')) {
      s = 'Cancelled'
    } else if (lowerS.includes('return')) {
      s = 'Returned'
    } else if (lowerS.includes('deliver')) {
      s = 'Delivered'
    } else if (lowerS.includes('book')) {
      s = 'Booked'
    } else if (lowerS.includes('confirm')) {
      s = 'Confirmed'
    } else if (lowerS.includes('pend')) {
      s = 'Pending'
    } else {
      s = s.charAt(0).toUpperCase() + s.slice(1)
    }

    statusBreakdown[s] = (statusBreakdown[s] || 0) + 1
    totalValue += parseFloat(o.price) || 0
  })

  const delivered = orders.filter(o => (o.delivery_status || '').toLowerCase().includes('deliver')).length
  const returned = orders.filter(o => (o.delivery_status || '').toLowerCase().includes('return')).length
  const deliveryRate = orders.length > 0 ? ((delivered / orders.length) * 100).toFixed(0) : 0

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(4px)' }}
    >
      <div className="card" style={{ width: '100%', maxWidth: 740, maxHeight: '88vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', animation: 'slideUp 0.3s ease-out' }}>

        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-elevated)' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>👤 {customerName}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {displayPhone && (
                <>
                  <a href={`tel:${displayPhone}`} style={{ color: 'var(--blue)', textDecoration: 'none' }} title="Call">📞</a>
                  <a href={`https://wa.me/${displayPhone.replace(/\D/g,'').replace(/^0/,'92')}`} target="_blank" rel="noreferrer" style={{ color: 'var(--green)', textDecoration: 'none' }} title="WhatsApp">💬</a>
                  <span style={{ opacity: 0.7 }}>{displayPhone}</span>
                </>
              )}
              {displayEmail && (
                <span style={{ opacity: 0.7, marginLeft: displayPhone ? 8 : 0 }}>✉️ {displayEmail}</span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {onOpenAllOrders && (phone || email) && (
              <button 
                className="btn btn-primary btn-sm"
                onClick={() => {
                  const targetKeyword = (phone && phone !== 'null' && phone !== 'undefined') ? phone : (email && email !== 'null' && email !== 'undefined') ? email : '';
                  if (targetKeyword) {
                    onOpenAllOrders(targetKeyword);
                  }
                  onClose();
                }}
              >
                Open All Orders in Command Center
              </button>
            )}
            <button className="btn btn-secondary btn-sm" onClick={onClose}>✕ Close</button>
          </div>
        </div>

        <div style={{ padding: '14px 24px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, borderBottom: '1px solid var(--border)', background: 'var(--bg-app)' }}>
          {[
            { label: 'Total Orders', value: orders.length, icon: '📦', color: 'blue' },
            { label: 'Delivered', value: delivered, icon: '✅', color: 'green' },
            { label: 'Returned', value: returned, icon: '↩️', color: 'red' },
            { label: 'Total Value', value: `Rs ${Math.round(totalValue).toLocaleString()}`, icon: '💰', color: 'purple' },
          ].map(k => (
            <div key={k.label} className={`kpi-card ${k.color}`} style={{ padding: '10px 14px' }}>
              <div className="kpi-label">{k.label}</div>
              <div className="kpi-value" style={{ fontSize: '1.1rem' }}>{k.value}</div>
              <div className="kpi-icon" style={{ fontSize: '0.9rem' }}>{k.icon}</div>
            </div>
          ))}
        </div>

        <div style={{ padding: '8px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: 'var(--bg-elevated)' }}>
          <span style={{ fontSize: '0.68rem', fontWeight: 700, opacity: 0.4, marginRight: 4 }}>BREAKDOWN</span>
          {Object.entries(statusBreakdown).map(([status, count]) => {
            const { bg, color } = getStatusColor(status)
            return (
              <span key={status} style={{ background: bg, color, fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>
                {status}: {count}
              </span>
            )
          })}
          <span style={{ marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 700, color: Number(deliveryRate) >= 50 ? 'var(--green)' : 'var(--orange)' }}>
            🎯 {deliveryRate}% Delivery Rate
          </span>
        </div>

        <div className="bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200" style={{ flex: 1, overflowY: 'auto' }}>
          {orders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No orders found for this customer.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300" style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  {['REF #', 'DATE', 'STATUS', 'COURIER', 'TRACKING', 'PRICE'].map(h => (
                    <th key={h} className="text-gray-500 dark:text-gray-400" style={{ padding: '8px 14px', textAlign: h === 'PRICE' ? 'right' : 'left', fontWeight: 700, fontSize: '0.65rem', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const { bg, color } = getStatusColor(o.delivery_status)
                  return (
                    <tr key={o.id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50" style={{ background: 'transparent' }}>
                      <td className="text-indigo-600 dark:text-indigo-400" style={{ padding: '9px 14px', fontWeight: 700 }}>{o.ref_number || o.shopify_order_id || '—'}</td>
                      <td className="text-gray-600 dark:text-gray-300" style={{ padding: '9px 14px', fontSize: '0.72rem' }}>{o.order_date ? new Date(o.order_date).toLocaleDateString() : '—'}</td>
                      <td style={{ padding: '9px 14px' }}>
                        <span style={{ background: bg, color, fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>
                          {o.delivery_status || 'Pending'}
                        </span>
                      </td>
                      <td className="text-gray-600 dark:text-gray-300" style={{ padding: '9px 14px', fontSize: '0.72rem' }}>{o.courier || '—'}</td>
                      <td className="text-gray-600 dark:text-gray-300" style={{ padding: '9px 14px', fontSize: '0.72rem' }}>
                        {o.tracking_number
                          ? <span className="text-blue-600 dark:text-blue-400">🚚 {o.tracking_number}</span>
                          : <span style={{ opacity: 0.3 }}>—</span>
                        }
                      </td>
                      <td className="text-gray-900 dark:text-gray-100" style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700 }}>Rs {Math.round(parseFloat(o.price)||0).toLocaleString()}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
