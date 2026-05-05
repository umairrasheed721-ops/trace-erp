import { getStatusColor, ERP_STATUSES } from '../utils/orderUtils'
import { AddressCell, PaidAmountCell, CourierFeeCell, CostCell, NoteCell } from './OrderCells'
import { useApp } from '../context/AppContext'
import { useState, useEffect } from 'react'

export default function OrderTable({
  loading,
  filteredOrders,
  allOrders,
  totalCount,
  debugWhere,
  cols,
  selectedIds,
  setSelectedIds,
  onDragStart,
  onDragOver,
  onDrop,
  handleHeaderSort,
  sortKey,
  sortDir,
  colFilters,
  setColFilters,
  formatCustomerName,
  fetchOrderDetails,
  bookingId,
  handleConfirmOrder,
  handleRevertConfirm,
  handleBookPostEx,
  handleCancelBooking,
  handleBookInstaworld,
  updateOrderField,
  setCustomerHistoryPhone,
  setShowNameDialog,
  setKeyword,
  setStatus,
  page,
  setPage,
  keyword,
  status,
  onViewHistory
}) {
  const { addToast, user } = useApp()
  const [statusUpdatingId, setStatusUpdatingId] = useState(null)

  const handleManualStatusChange = async (orderId, newStatus) => {
    if (!newStatus) return
    setStatusUpdatingId(orderId)
    try {
      const res = await fetch(`/api/orders/${orderId}/erp-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ erp_status: newStatus })
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 409 && data.protected) {
          if (confirm(`${data.error}\n\nDo you want to FORCE this change? (Admin Only)`)) {
            const forceRes = await fetch(`/api/orders/${orderId}/erp-status`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ erp_status: newStatus, force: true })
            })
            if (!forceRes.ok) throw new Error((await forceRes.json()).error)
            addToast('Status updated successfully (Forced)', 'success')
          }
        } else {
          throw new Error(data.error || 'Failed to update status')
        }
      } else {
        addToast(`ERP Status updated to ${newStatus}`, 'success')
      }
    } catch (err) {
      addToast(err.message, 'error')
    } finally {
      setStatusUpdatingId(null)
    }
  }

  const [waTemplates, setWATemplates] = useState([])

  useEffect(() => {
    fetch('/api/templates', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
    })
    .then(res => res.json())
    .then(setWATemplates)
    .catch(err => console.error('Failed to fetch WA templates', err))
  }, [])

  if (loading) {
    return <div className="loading-overlay"><span className="loading-spinner"></span> Searching...</div>
  }

  if (filteredOrders.length === 0) {
    return <div className="empty-state"><div className="empty-icon">🔍</div><h3>No Results</h3><p>Adjust your filters and try again</p></div>
  }

  return (
    <>
      <div className="table-wrapper">
        <div style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', padding: '8px 24px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>
            💡 <b>Showing {allOrders.length.toLocaleString()} of {totalCount.toLocaleString()} matching orders.</b>
            {debugWhere && <span style={{ marginLeft: 10, color: 'var(--text-muted)', fontSize: '0.65rem', fontStyle: 'italic' }}>SQL: {debugWhere}</span>}
          </span>
          {(keyword || status !== 'All Statuses') && (
            <button 
              onClick={() => { setKeyword(''); setColFilters({}); setStatus('All Statuses'); }}
              className="btn btn-primary btn-sm"
              style={{ padding: '2px 8px', borderRadius: 4, fontWeight: 'bold', fontSize: '0.7rem' }}
            >
              CLEAR ALL FILTERS
            </button>
          )}
        </div>
        
        <table className="draggable-table">
          <thead>
            <tr>
              <th style={{ width: 40, textAlign: 'center' }}>
                <input 
                  type="checkbox" 
                  checked={filteredOrders.length > 0 && selectedIds.length === filteredOrders.length}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedIds(filteredOrders.map(o => o.id))
                    else setSelectedIds([])
                  }}
                />
              </th>
              {cols.map((col, idx) => (
                <th 
                  key={col.id}
                  draggable
                  onDragStart={() => onDragStart(idx)}
                  onDragOver={onDragOver}
                  onDrop={() => onDrop(idx)}
                  onClick={() => handleHeaderSort(col.id)}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {sortKey === col.id && (
                      <span style={{ fontSize: '0.65rem', color: 'var(--brand)' }}>
                        {sortDir === 'asc' ? '▲' : '▼'}
                      </span>
                    )}
                    {col.id === 'customer_name' && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); setShowNameDialog(true); }} 
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.7rem', marginLeft: 4, opacity: 0.5 }}
                        title="Edit Name Rules"
                      >
                        🖊️
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
            <tr className="header-search-row">
              <th style={{ padding: '4px 8px' }}></th>
              {cols.map(col => {
                const isFiltered = ['ref_number','customer_name','phone','city','courier','tracking_number','notes'].includes(col.id);
                return (
                  <th key={col.id} style={{ padding: '4px 8px' }}>
                    {isFiltered && (
                      <input 
                        className="header-search-input"
                        placeholder="Search..."
                        value={colFilters[col.id] || ''}
                        onChange={e => setColFilters(prev => ({ ...prev, [col.id]: e.target.value }))}
                      />
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {filteredOrders.map(o => {
              const diff = (parseFloat(o.price)||0) - (parseFloat(o.paid_amount)||0)
              const isClear = Math.abs(diff) <= 1
              const { bg, color } = getStatusColor(o.delivery_status)
              const s = (o.delivery_status||'').toLowerCase()
              const orderDate = o.order_date ? new Date(o.order_date) : null
              const today = new Date(); today.setHours(0,0,0,0)
              const daysOld = orderDate ? Math.floor((today-orderDate)/86400000) : 0
              const isPending = !s.includes('delivered') && !s.includes('return') && !s.includes('cancel')
              const dateAged = isPending && daysOld >= 5

              return (
                <tr key={o.id} className={selectedIds.includes(o.id) ? 'row-selected' : ''}>
                  <td style={{ textAlign: 'center' }}>
                    <input 
                      type="checkbox" 
                      checked={selectedIds.includes(o.id)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedIds(prev => [...prev, o.id])
                        else setSelectedIds(prev => prev.filter(id => id !== o.id))
                      }}
                    />
                  </td>
                  {cols.map(col => {
                    if (col.id === 'ref_number') return (
                      <td key={col.id}>
                        <div className="flex items-center gap-2" style={{ flexWrap: 'nowrap' }}>
                          <button 
                            onClick={() => fetchOrderDetails(o.id)}
                            className="btn btn-primary btn-sm"
                            style={{ padding: '2px 6px', fontSize: '0.65rem', whiteSpace: 'nowrap', flexShrink: 0 }}
                            title="Edit Full Order"
                          >
                            ✏️
                          </button>

                          <button 
                            onClick={(e) => { e.stopPropagation(); onViewHistory(o); }}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '2px 6px', fontSize: '0.65rem', whiteSpace: 'nowrap', flexShrink: 0 }}
                            title="View History Timeline"
                          >
                            📜
                          </button>

                          <a 
                            href={`https://${o.shop_domain || localStorage.getItem('trace_active_shop')}/admin/orders/${o.shopify_order_id}`} 
                            target="_blank" 
                            rel="noreferrer" 
                            style={{ color: 'var(--brand)', fontSize: '0.75rem', textDecoration: 'none', fontWeight: 600, flexShrink: 0 }}
                          >
                            {o.ref_number || o.shopify_order_id}
                          </a>
                        </div>
                      </td>
                    )
                    if (col.id === 'edit') return (
                      <td key={col.id}>
                        <div className="flex items-center gap-2" style={{ flexWrap: 'nowrap' }}>
                          {(o.cost <= 0) && (
                            <div 
                              style={{ 
                                background: 'var(--red)', 
                                color: '#fff', 
                                padding: '2px 5px', 
                                borderRadius: 4, 
                                fontSize: '0.6rem', 
                                fontWeight: 800,
                              }}
                              title="ZERO COST BLOCK: Processing Disabled"
                            >
                              🛑
                            </div>
                          )}
                          {bookingId === o.id ? (
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>⌛ Working...</span>
                          ) : (
                            <select
                              className="btn btn-sm"
                              style={{ 
                                padding: '2px 4px', 
                                fontSize: '0.65rem', 
                                flexShrink: 0,
                                width: '115px',
                                background: s === 'confirmed' ? 'var(--brand)' : 'var(--bg-elevated)',
                                color: s === 'confirmed' ? '#fff' : 'var(--text-muted)',
                                border: '1px solid var(--border)',
                                borderRadius: 4,
                                cursor: (o.cost <= 0) ? 'not-allowed' : 'pointer',
                                opacity: (o.cost <= 0) ? 0.5 : 1
                              }}
                              disabled={o.cost <= 0}
                              value=""
                              onChange={(e) => {
                                e.stopPropagation();
                                const action = e.target.value;
                                if (action === 'confirm') handleConfirmOrder(o.id);
                                else if (action === 'revert') handleRevertConfirm(o.id);
                                else if (action === 'postex') handleBookPostEx(o.id);
                                else if (action === 'cancel') handleCancelBooking(o.id);
                                else if (action.startsWith('insta:')) handleBookInstaworld(o.id, action.split(':')[1]);
                              }}
                            >
                              <option value="" disabled>⚡ Action</option>
                              {!o.tracking_number && s !== 'confirmed' && (
                                <option value="confirm">✅ Confirm Order</option>
                              )}
                              {!o.tracking_number && s === 'confirmed' && (
                                <option value="revert">↩️ Revert to Pending</option>
                              )}
                              {!o.tracking_number && s === 'confirmed' && (
                                <>
                                  <option value="postex">⚡ Book PostEx</option>
                                  <option value="insta:TCS">🌐 Book TCS</option>
                                  <option value="insta:LCS">🌐 Book LCS</option>
                                  <option value="insta:Leopards">🌐 Book Leopards</option>
                                  <option value="insta:InstaLogicstics">🌐 Book InstaLog</option>
                                </>
                              )}
                              {!!o.tracking_number && ['booked','pending','confirmed'].includes(s) && (
                                <option value="cancel">🛑 Cancel Booking</option>
                              )}
                            </select>
                          )}
                        </div>
                      </td>
                    )
                    if (col.id === 'order_date') return (
                      <td key={col.id} style={{ fontSize: '0.75rem', color: dateAged ? 'var(--orange)' : 'var(--text-muted)', fontWeight: dateAged ? 700 : 400 }}>
                        {o.order_date || '—'}
                        {dateAged && <span style={{ fontSize: '0.65rem', marginLeft: 4 }}>{daysOld}d</span>}
                      </td>
                    )
                    if (col.id === 'customer_name') return (
                      <td key={col.id} title={o.customer_name}>
                        {formatCustomerName(o.customer_name)}
                      </td>
                    )
                    if (col.id === 'phone') return (
                      <td key={col.id} style={{ fontSize: '0.75rem' }}>
                        {o.phone ? (
                          <div className="flex items-center gap-2" style={{ flexWrap: 'nowrap' }}>
                            <a href={`tel:${o.phone}`} style={{ color: 'var(--blue)', textDecoration: 'none', flexShrink: 0 }} title="Call via SIM">📞</a>
                            
                            <select 
                              className="wa-template-select"
                              style={{ 
                                background: 'none', 
                                border: 'none', 
                                color: 'var(--green)', 
                                cursor: 'pointer', 
                                fontSize: '0.9rem',
                                padding: 0,
                                width: '20px'
                              }}
                              onChange={(e) => {
                                const templateId = e.target.value;
                                if (!templateId) return;
                                
                                const template = waTemplates.find(t => t.id === parseInt(templateId));
                                if (!template) return;

                                const name = formatCustomerName(o.customer_name);
                                const orderId = o.ref_number || o.shopify_order_id;
                                const price = Math.round(parseFloat(o.price)||0);
                                const courier = o.courier || 'our courier';
                                const tracking = o.tracking_number || '';
                                
                                let msg = template.content
                                  .replace(/\[Name\]/g, name)
                                  .replace(/\[OrderID\]/g, orderId)
                                  .replace(/\[Price\]/g, price)
                                  .replace(/\[Courier\]/g, courier)
                                  .replace(/\[Tracking\]/g, tracking);

                                // Auto-Link if confirmation token exists
                                if (o.confirmation_token) {
                                  const appUrl = window.location.origin;
                                  const link = `${appUrl}/api/public/confirm-order/${o.confirmation_token}`;
                                  msg = msg.replace(/\[Link\]/g, link);
                                } else {
                                  msg = msg.replace(/\[Link\]/g, '(Confirm on call)');
                                }

                                const waLink = `https://wa.me/${o.phone.replace(/\D/g,'').replace(/^0/,'92')}?text=${encodeURIComponent(msg)}`;
                                window.open(waLink, '_blank');
                                e.target.value = ""; // Reset
                              }}
                            >
                              <option value="">💬</option>
                              {waTemplates.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>

                            <a href={`tel:${o.phone}`} style={{ color: 'inherit', textDecoration: 'none' }}>{o.phone}</a>
                            {(() => {
                              const count = allOrders.filter(order => order.phone === o.phone).length
                              return count > 0 ? (
                                <span
                                  onClick={(e) => { e.stopPropagation(); setCustomerHistoryPhone(o.phone) }}
                                  style={{
                                    background: 'var(--green-dim)',
                                    color: 'var(--green)',
                                    fontSize: '0.58rem',
                                    fontWeight: 700,
                                    padding: '2px 6px',
                                    borderRadius: 10,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                    flexShrink: 0,
                                    border: '1px solid var(--green)',
                                    userSelect: 'none'
                                  }}
                                  title="View customer order history"
                                >
                                  {count} {count === 1 ? 'Order' : 'Orders'}
                                </span>
                              ) : null
                            })()}
                          </div>
                        ) : '—'}
                      </td>
                    )
                    if (col.id === 'city') return <td key={col.id}>{o.city || '—'}</td>
                    if (col.id === 'address') return (
                      <td key={col.id}>
                        <AddressCell order={o} onSave={updateOrderField} />
                      </td>
                    )
                    if (col.id === 'items') return (
                      <td key={col.id} title={o.product_titles}>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {o.product_titles || '—'}
                        </div>
                      </td>
                    )
                    if (col.id === 'price') return <td key={col.id} style={{ fontWeight: 700 }}>Rs {Math.round(parseFloat(o.price)||0).toLocaleString()}</td>
                    if (col.id === 'paid_amount') return <td key={col.id}><PaidAmountCell order={o} onSave={updateOrderField} /></td>
                    if (col.id === 'diff') return (
                      <td key={col.id} style={{ color: diff > 1 && s.includes('delivered') ? 'var(--red)' : 'var(--text-muted)', fontWeight: diff > 1 && s.includes('delivered') ? 700 : 400 }}>
                        {!isClear ? `Rs ${Math.round(diff).toLocaleString()}` : <span style={{color:'var(--green)'}}>✅ Clear</span>}
                      </td>
                    )
                    if (col.id === 'delivery_status') {
                      const isExchange = (s.includes('delivered') || s.includes('transit')) && parseInt(o.items_count) === 0;
                      const hasAuthority = user?.role === 'admin' || user?.can_override_erp_status;
                      
                      return (
                        <td key={col.id}>
                          <div className="flex items-center gap-2" style={{ flexWrap: 'nowrap' }}>
                            {hasAuthority ? (
                              <div className="relative-container">
                                {statusUpdatingId === o.id ? (
                                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>⌛ Saving...</span>
                                ) : (
                                  <select
                                    value={o.delivery_status || 'Pending'}
                                    onChange={(e) => handleManualStatusChange(o.id, e.target.value)}
                                    className="badge-select"
                                    style={{ 
                                      background: bg, 
                                      color: color,
                                      border: 'none',
                                      padding: '2px 8px',
                                      borderRadius: 12,
                                      fontSize: '0.65rem',
                                      fontWeight: 800,
                                      cursor: 'pointer',
                                      appearance: 'none',
                                      textAlign: 'center'
                                    }}
                                  >
                                    {ERP_STATUSES.map(st => <option key={st} value={st}>{st}</option>)}
                                  </select>
                                )}
                              </div>
                            ) : (
                              <span className="badge" style={{ background: bg, color }}>{o.delivery_status || 'Pending'}</span>
                            )}

                            {isExchange && (
                              <span 
                                className="badge" 
                                style={{ background: 'var(--blue-dim)', color: 'var(--blue)', fontSize: '0.55rem', border: '1px solid var(--blue)' }}
                                title="Inventory was restocked/removed after delivery (likely an Exchange)"
                              >
                                🔄 EXCHANGE
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    }
                    if (col.id === 'courier_status') {
                      return (
                        <td key={col.id}>
                          {o.courier_status ? (
                            <span 
                              style={{ 
                                fontSize: '0.65rem', 
                                color: 'var(--text-muted)', 
                                fontStyle: 'italic',
                                padding: '1px 5px',
                                borderRadius: 4,
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)'
                              }}
                              title="Raw status from courier API"
                            >
                              {o.courier_status}
                            </span>
                          ) : <span style={{ opacity: 0.3 }}>—</span>}
                        </td>
                      )
                    }
                    if (col.id === 'courier') return <td key={col.id} style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{o.courier || '—'}</td>
                    if (col.id === 'tracking_number') {
                      const courierStr = (o.courier || '').toLowerCase();
                      const isInstaPortal = courierStr.includes('insta') || courierStr.includes('lcs') || courierStr.includes('leopard') || courierStr.includes('tcs') || courierStr.includes('private rider');
                      
                      return (
                        <td key={col.id} style={{ fontSize: '0.75rem' }}>
                          {o.tracking_number ? (
                            <a 
                              href={isInstaPortal 
                                ? `https://insta-app-be.instaworld.pk/logistics/orderTracking/?tracking_number=${o.tracking_number}` 
                                : `https://postex.pk/tracking?cn=${o.tracking_number}`} 
                              target="_blank" 
                              rel="noreferrer" 
                              style={{ color: 'var(--blue)', textDecoration: 'none' }}
                            >
                              🚚 {o.tracking_number}
                            </a>
                          ) : '—'}
                        </td>
                      )
                    }
                    if (col.id === 'courier_fee') return canSeeFinancials ? <td key={col.id}><CourierFeeCell order={o} onSave={updateOrderField} /></td> : <td key={col.id}>—</td>
                    if (col.id === 'payment_status') return <td key={col.id}><span style={{ color: o.payment_status === 'Paid' ? 'var(--green)' : 'var(--orange)', fontWeight: 600 }}>{o.payment_status || 'Unpaid'}</span></td>
                    if (col.id === 'cost') return canSeeFinancials ? <td key={col.id}><CostCell order={o} onSave={updateOrderField} /></td> : null
                    if (col.id === 'profit') {
                      if (!canSeeFinancials) return null
                      const fee = parseFloat(o.courier_fee) || 0
                      const cost = parseFloat(o.cost) || 0
                      const price = parseFloat(o.price) || 0
                      const profit = price - cost - fee
                      return <td key={col.id} style={{ fontWeight: 800, color: profit > 0 ? 'var(--green)' : 'var(--red)' }}>Rs {Math.round(profit).toLocaleString()}</td>
                    }
                    if (col.id === 'order_source') return <td key={col.id} style={{ fontSize: '0.7rem', opacity: 0.7 }}>{o.order_source || 'Shopify'}</td>
                    if (col.id === 'status_date') return <td key={col.id} style={{ fontSize: '0.7rem', opacity: 0.7 }}>{o.status_date ? new Date(o.status_date).toLocaleDateString() : '—'}</td>
                    if (col.id === 'payment_ref') return <td key={col.id} style={{ fontSize: '0.7rem' }}>{o.payment_ref || '—'}</td>
                    if (col.id === 'payment_date') return <td key={col.id} style={{ fontSize: '0.7rem', color: 'var(--green)' }}>{o.payment_date || '—'}</td>
                    if (col.id === 'notes') return <td key={col.id}><NoteCell order={o} onSave={updateOrderField} /></td>
                    return <td key={col.id}>—</td>
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {totalCount > 250 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '16px', background: 'var(--bg-elevated)', borderTop: '1px solid var(--border)' }}>
          <button 
            className={`btn btn-secondary btn-sm`} 
            disabled={page === 1 || loading}
            onClick={() => { setPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          >
            ◀ Previous
          </button>
          <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
            Page {page} of {Math.ceil(totalCount / 250)}
          </div>
          <button 
            className={`btn btn-secondary btn-sm`} 
            disabled={page >= Math.ceil(totalCount / 250) || loading}
            onClick={() => { setPage(p => p + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          >
            Next ▶
          </button>
        </div>
      )}
    </>
  )
}
