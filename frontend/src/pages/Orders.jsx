import { useEffect, useState, useCallback } from 'react'
import { useApp } from '../context/AppContext'

const STATUS_CLASSES = {
  'delivered': 'badge-delivered',
  'pending': 'badge-pending',
  'cancelled': 'badge-cancelled',
  'returned': 'badge-returned',
  'return received': 'badge-returned',
  'booked': 'badge-info',
}

function getStatusBadge(status) {
  const s = (status || '').toLowerCase()
  const cls = STATUS_CLASSES[s] || 'badge-pending'
  return <span className={`badge ${cls}`}>{status || '—'}</span>
}

export default function Orders() {
  const { activeStoreId, addToast } = useApp()
  const [orders, setOrders] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [courier, setCourier] = useState('')
  const [page, setPage] = useState(1)
  const LIMIT = 100

  const load = useCallback(() => {
    if (!activeStoreId) return
    setLoading(true)
    const params = new URLSearchParams({ store_id: activeStoreId, page, limit: LIMIT })
    if (search) params.set('search', search)
    if (status) params.set('status', status)
    if (courier) params.set('courier', courier)

    fetch(`/api/orders?${params}&t=${Date.now()}`)
      .then(r => r.json())
      .then(data => { setOrders(data.orders || []); setTotal(data.total || 0); setLoading(false) })
      .catch(() => { addToast('Failed to load orders', 'error'); setLoading(false) })
  }, [activeStoreId, page, search, status, courier])

  useEffect(() => { setPage(1) }, [search, status, courier, activeStoreId])
  useEffect(() => { load() }, [load])

  const exportCSV = () => {
    fetch(`/api/orders/export?store_id=${activeStoreId}`)
      .then(r => r.json())
      .then(rows => {
        if (!rows.length) return
        const headers = Object.keys(rows[0])
        const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${(r[h] ?? '').toString().replace(/"/g, '""')}"`).join(','))].join('\n')
        const blob = new Blob([csv], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = `orders_${new Date().toISOString().split('T')[0]}.csv`; a.click()
      })
  }

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div>
          <h2>Order Repository</h2>
          <p>{total.toLocaleString()} total historical records</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={exportCSV}>⬇ Export Dataset</button>
      </div>

      <div className="card mb-8" style={{ padding: '16px 20px' }}>
        <div className="flex gap-4 items-center">
          <div style={{ position: 'relative', flex: 1 }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }}>🔍</span>
            <input
              className="form-input"
              style={{ width: '100%', paddingLeft: 40 }}
              placeholder="Search by tracking, customer name, order number..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select className="form-select" style={{ width: 180 }} value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="Pending">Pending</option>
            <option value="Booked">Booked</option>
            <option value="Delivered">Delivered</option>
            <option value="Returned">Returned</option>
            <option value="Return Received">Return Received</option>
            <option value="Cancelled">Cancelled</option>
          </select>
          <select className="form-select" style={{ width: 180 }} value={courier} onChange={e => setCourier(e.target.value)}>
            <option value="">All Couriers</option>
            <option value="PostEx">PostEx</option>
            <option value="Instaworld">Instaworld</option>
            <option value="Leopards">Leopards</option>
            <option value="TCS">TCS</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="loading-overlay"><span className="loading-spinner"></span> Retrieving order data...</div>
      ) : orders.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-icon">📭</div>
          <h3>Zero Matches Found</h3>
          <p>We couldn't find any orders matching your criteria</p>
        </div>
      ) : (
        <>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Order Ref</th>
                  <th>Customer</th>
                  <th>City</th>
                  <th>Tracking</th>
                  <th>Courier</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th style={{ textAlign: 'right' }}>Total Price</th>
                  <th style={{ textAlign: 'right' }}>Net Profit</th>
                  <th>Order Date</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(o => {
                  const profit = (o.price || 0) - (o.cost || 0) - (o.courier_fee || 0)
                  return (
                    <tr key={o.id}>
                      <td className="font-bold">
                        <a href={`https://${o.shop_domain}/admin/orders/${o.shopify_order_id}`} target="_blank" rel="noreferrer" className="text-brand">
                          {o.ref_number}
                        </a>
                      </td>
                      <td style={{ fontWeight: 500 }}>{o.customer_name}</td>
                      <td className="text-secondary">{o.city}</td>
                      <td className="font-mono text-secondary" style={{ fontSize: '0.8rem' }}>{o.tracking_number || '—'}</td>
                      <td>{o.courier || '—'}</td>
                      <td>{getStatusBadge(o.delivery_status)}</td>
                      <td>
                        <span className={`badge ${o.payment_status === 'Paid' ? 'badge-delivered' : 'badge-pending'}`}>
                          {o.payment_status}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>Rs {parseInt(o.price || 0).toLocaleString()}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: profit > 0 ? 'var(--success)' : profit < 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                        {o.cost > 0 ? `Rs ${parseInt(profit).toLocaleString()}` : '—'}
                      </td>
                      <td className="text-muted" style={{ fontSize: '0.8rem' }}>{o.order_date}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-4 mt-8" style={{ justifyContent: 'center' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Previous</button>
              <div className="text-secondary font-bold" style={{ fontSize: '0.9rem' }}>Page {page} <span style={{ opacity: 0.4 }}>of {totalPages}</span></div>
              <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
