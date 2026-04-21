import { useEffect, useState, useCallback } from 'react'
import { useApp } from '../App'

const STATUS_COLORS = {
  'delivered': 'badge-delivered',
  'pending': 'badge-pending',
  'cancelled': 'badge-cancelled',
  'returned': 'badge-returned',
  'return received': 'badge-returned',
  'booked': 'badge-advice',
}

function getStatusBadge(status) {
  const s = (status || '').toLowerCase()
  const cls = STATUS_COLORS[s] || 'badge-pending'
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
        const a = document.createElement('a'); a.href = url; a.download = 'orders.csv'; a.click()
      })
  }

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Orders</h2>
          <p>{total.toLocaleString()} total orders</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={exportCSV}>⬇ Export CSV</button>
      </div>

      <div className="filter-bar">
        <div className="search-input-wrap">
          <span className="search-icon">🔍</span>
          <input
            className="form-input"
            placeholder="Search by tracking, customer, ref number..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="form-select" style={{ width: 160 }} value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="Pending">Pending</option>
          <option value="Booked">Booked</option>
          <option value="Delivered">Delivered</option>
          <option value="Returned">Returned</option>
          <option value="Return Received">Return Received</option>
          <option value="Cancelled">Cancelled</option>
        </select>
        <select className="form-select" style={{ width: 140 }} value={courier} onChange={e => setCourier(e.target.value)}>
          <option value="">All Couriers</option>
          <option value="PostEx">PostEx</option>
          <option value="Instaworld">Instaworld</option>
          <option value="Leopards">Leopards</option>
          <option value="TCS">TCS</option>
          <option value="Private Rider">Private Rider</option>
        </select>
      </div>

      {loading ? (
        <div className="loading-overlay"><span className="loading-spinner"></span> Loading orders...</div>
      ) : orders.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📭</div>
          <h3>No orders found</h3>
          <p>Try adjusting your filters or sync your store</p>
        </div>
      ) : (
        <>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Ref #</th>
                  <th>Customer</th>
                  <th>City</th>
                  <th>Tracking #</th>
                  <th>Courier</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th>Price</th>
                  <th>Cost</th>
                  <th>Profit</th>
                  <th>Source</th>
                  <th>Date</th>
                  <th>Last Update</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o.id}>
                    <td className="font-mono" style={{ fontSize: '0.75rem' }}>
                      <a 
                        href={`https://${o.shop_domain}/admin/orders/${o.shopify_order_id}`} 
                        target="_blank" 
                        rel="noreferrer" 
                        style={{ color: 'var(--brand)', textDecoration: 'none', fontWeight: 600 }}
                      >
                        {o.ref_number}
                      </a>
                    </td>
                    <td>{o.customer_name}</td>
                    <td>{o.city}</td>
                    <td className="font-mono" style={{ fontSize: '0.75rem' }}>{o.tracking_number || '—'}</td>
                    <td>{o.courier || '—'}</td>
                    <td>{getStatusBadge(o.delivery_status)}</td>
                    <td>
                      <span className={`badge ${o.payment_status === 'Paid' ? 'badge-delivered' : 'badge-pending'}`}>
                        {o.payment_status}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>Rs {parseInt(o.price || 0).toLocaleString()}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                      {o.cost > 0 ? `Rs ${parseInt(o.cost).toLocaleString()}` : '—'}
                    </td>
                    <td style={{ fontWeight: 600, color: (() => { const p = (o.price || 0) - (o.cost || 0) - (o.courier_fee || 0); return p > 0 ? '#34d399' : p < 0 ? '#f87171' : 'var(--text-muted)'; })() }}>
                      {o.cost > 0 ? `Rs ${parseInt((o.price || 0) - (o.cost || 0) - (o.courier_fee || 0)).toLocaleString()}` : '—'}
                    </td>
                    <td style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{o.order_source}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{o.order_date}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      {o.status_date ? new Date(o.status_date).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-2 mt-4" style={{ justifyContent: 'center' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Prev</button>
              <span className="text-muted" style={{ fontSize: '0.8rem' }}>Page {page} of {totalPages}</span>
              <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
