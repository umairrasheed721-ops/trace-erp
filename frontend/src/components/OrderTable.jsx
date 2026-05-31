import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getStatusColor, ERP_STATUSES } from '../utils/orderUtils'
import { AddressCell, PaidAmountCell, CourierFeeCell, CostCell, NoteCell, CityCell } from './OrderCells'
import { useApp } from '../context/AppContext'


// Cost breakdown helper component moved to file level
const CostBreakdownTooltip = ({ loadingBreakdown, breakdown, onClose }) => {
  if (loadingBreakdown) return <div className="cost-tooltip">⌛ Loading items...</div>
  if (!breakdown || breakdown.length === 0) return <div className="cost-tooltip">⚠️ No item data found</div>

  const totalLanded = breakdown.reduce((acc, item) => acc + (item.landed_cost * item.quantity), 0)
  const totalPkg = breakdown.reduce((acc, item) => acc + (item.packaging_cost * item.quantity), 0)

  return (
    <div className="cost-tooltip shadow-xl">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', borderRadius: '8px 8px 0 0' }}>
        <h4 style={{ margin: 0, fontSize: '0.8rem', color: 'var(--brand)' }}>📦 Itemized Costing</h4>
        <button 
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '0.9rem', padding: '0 4px', opacity: 0.6 }}
        >
          ✖
        </button>
      </div>
      <div style={{ maxHeight: 250, overflowY: 'auto', padding: '8px 0' }}>
        {breakdown.map((item, i) => (
          <div key={i} style={{ padding: '6px 12px', borderBottom: i === breakdown.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#fff', marginBottom: 2 }}>{item.title}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', opacity: 0.7 }}>
              <span>{item.quantity} x Rs {item.landed_cost.toLocaleString()}</span>
              <span style={{ fontWeight: 'bold', color: 'var(--green)' }}>Rs {(item.landed_cost * item.quantity).toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: '10px 12px', background: 'rgba(0,0,0,0.3)', borderRadius: '0 0 8px 8px', fontSize: '0.7rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
          <span>Landed Total:</span>
          <span style={{ color: 'var(--green)' }}>Rs {totalLanded.toLocaleString()}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', opacity: 0.7 }}>
          <span>Pkg Total:</span>
          <span>Rs {totalPkg.toLocaleString()}</span>
        </div>
      </div>
    </div>
  )
}

const OrderRow = React.memo(({ 
  o, cols, isSelected, currentIndex, lastSelectedIndex, setSelectedIds, setLastSelectedIndex, filteredOrdersLength,
  filteredOrdersIds, fetchOrderDetails, onViewHistory, bookingId, handleConfirmOrder, handleRevertConfirm, handleBookPostEx,
  handleCancelBooking, handleBookInstaworld, formatCustomerName, waTemplates, allOrdersCount, getPhoneOrderCount,
  setCustomerHistoryPhone, updateOrderField, canSeeFinancials, activeTooltipOrderId, setActiveTooltipOrderId,
  fetchBreakdown, user, statusUpdatingId, handleManualStatusChange, ERP_STATUSES, getStatusColor,
  activeShopDomain, breakdown, loadingBreakdown, setBreakdown
}) => {
  const diff = (parseFloat(o.price)||0) - (parseFloat(o.paid_amount)||0);
  const navigate = useNavigate();
  const isClear = Math.abs(diff) <= 1;
  const { bg, color } = getStatusColor(o.delivery_status);
  const s = (o.delivery_status||'').toLowerCase();
  const orderDate = o.order_date ? new Date(o.order_date) : null;
  const today = new Date(); today.setHours(0,0,0,0);
  const daysOld = orderDate ? Math.floor((today-orderDate)/86400000) : 0;
  const isPending = !s.includes('delivered') && !s.includes('return') && !s.includes('cancel');
  const dateAged = isPending && daysOld >= 5;

  return (
    <tr key={o.id} className={isSelected ? 'row-selected' : ''}>
                  <td style={{ textAlign: 'center' }}>
                    <input 
                      type="checkbox" 
                      checked={isSelected}
                      onChange={(e) => {
                        const checked = e.target.checked
                        
                        if (e.nativeEvent.shiftKey && lastSelectedIndex !== null) {
                          const start = Math.min(currentIndex, lastSelectedIndex)
                          const end = Math.max(currentIndex, lastSelectedIndex)
                          const idsInRange = filteredOrdersIds.slice(start, end + 1)
                          
                          if (checked) {
                            setSelectedIds(prev => Array.from(new Set([...prev, ...idsInRange])))
                          } else {
                            setSelectedIds(prev => prev.filter(id => !idsInRange.includes(id)))
                          }
                        } else {
                          if (checked) setSelectedIds(prev => [...prev, o.id])
                          else setSelectedIds(prev => prev.filter(id => id !== o.id))
                        }
                        
                        setLastSelectedIndex(currentIndex)
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
                            href={`https://${o.shop_domain || activeShopDomain}/admin/orders/${o.shopify_order_id}`} 
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
                            
                            {/* Main Chat Bubble button - redirects to portal */}
                            {(() => {
                              const isUnread = o.last_wa_direction === 'incoming' && o.last_wa_status !== 'read';
                              return (
                                <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigate('/whatsapp-portal', { state: { selectPhone: o.phone } });
                                    }}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      padding: 0,
                                      cursor: 'pointer',
                                      fontSize: '0.95rem',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      position: 'relative'
                                    }}
                                    title="Open Chat in Portal"
                                  >
                                    💬
                                    {isUnread && <span className="wa-unread-badge"></span>}
                                  </button>
                                </div>
                              );
                            })()}

                            {/* Template dropdown arrow selection */}
                            <select 
                              className="wa-template-select"
                              style={{ 
                                background: 'none', 
                                border: 'none', 
                                color: 'var(--text-muted)', 
                                cursor: 'pointer', 
                                fontSize: '0.65rem',
                                padding: 0,
                                width: '12px',
                                marginLeft: '-4px'
                              }}
                              value=""
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
                              <option value="" disabled>▼</option>
                              {waTemplates.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>

                            <a href={`tel:${o.phone}`} style={{ color: 'inherit', textDecoration: 'none' }}>{o.phone}</a>
                            {(() => {
                              const count = getPhoneOrderCount(o.phone)
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
                    if (col.id === 'city') return <td key={col.id}><CityCell order={o} onSave={updateOrderField} /></td>
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
                                    {ERP_STATUSES.filter(st => {
                                      const isFinal = ['Delivered', 'Return Received'].includes(st);
                                      if (!isFinal) return true;
                                      return user?.role === 'admin' || user?.can_set_final_status === 1;
                                    }).map(st => <option key={st} value={st}>{st}</option>)}
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
                    if (col.id === 'cost') return canSeeFinancials ? (
                      <td 
                        key={col.id} 
                        style={{ position: 'relative', overflow: 'visible' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <CostCell order={o} onSave={updateOrderField} />
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              if (String(activeTooltipOrderId) === String(o.id)) {
                                setActiveTooltipOrderId(null);
                                setBreakdown(null);
                              } else {
                                setActiveTooltipOrderId(o.id);
                                fetchBreakdown(o.id);
                              }
                            }}
                            style={{ 
                              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', 
                              borderRadius: '50%', width: 20, height: 20, display: 'flex', 
                              alignItems: 'center', justifyContent: 'center', cursor: 'pointer', 
                              fontSize: '0.7rem', color: 'var(--brand)', transition: 'all 0.2s'
                            }}
                            aria-label="View itemized cost breakdown"
                          >
                            ℹ️
                          </button>
                        </div>
                        {String(activeTooltipOrderId) === String(o.id) && (
                          <CostBreakdownTooltip 
                            loadingBreakdown={loadingBreakdown}
                            breakdown={breakdown}
                            onClose={() => { setActiveTooltipOrderId(null); setBreakdown(null); }}
                          />
                        )}
                      </td>
                    ) : null
                    if (col.id === 'profit') {
                      if (!canSeeFinancials) return null
                      const fee = parseFloat(o.courier_fee) || 0
                      const cost = parseFloat(o.cost) || 0
                      const price = parseFloat(o.price) || 0
                      const profit = price - cost - fee
                      return (
                        <td 
                          key={col.id} 
                          style={{ fontWeight: 800, color: profit > 0 ? 'var(--green)' : 'var(--red)', position: 'relative', overflow: 'visible' }}
                        >
                          Rs {Math.round(profit).toLocaleString()}
                        </td>
                      )
                    }
                    if (col.id === 'order_source') return <td key={col.id} style={{ fontSize: '0.7rem', opacity: 0.7 }}>{o.order_source || 'Shopify'}</td>
                    if (col.id === 'status_date') return <td key={col.id} style={{ fontSize: '0.7rem', opacity: 0.7 }}>{o.status_date ? new Date(o.status_date).toLocaleDateString() : '—'}</td>
                    if (col.id === 'payment_ref') return <td key={col.id} style={{ fontSize: '0.7rem' }}>{o.payment_ref || '—'}</td>
                    if (col.id === 'payment_date') return <td key={col.id} style={{ fontSize: '0.7rem', color: 'var(--green)' }}>{o.payment_date || '—'}</td>
                    if (col.id === 'notes') return <td key={col.id}><NoteCell order={o} onSave={updateOrderField} /></td>
                    return <td key={col.id}>—</td>
                  })}
                </tr>
  );
}, (prev, next) => {
  // Custom equality check for fast rendering
  return prev.o === next.o &&
         prev.isSelected === next.isSelected &&
         prev.statusUpdatingId === next.statusUpdatingId &&
         prev.bookingId === next.bookingId &&
         prev.activeTooltipOrderId === next.activeTooltipOrderId &&
         prev.breakdown === next.breakdown &&
         prev.loadingBreakdown === next.loadingBreakdown &&
         prev.cols === next.cols;
});
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
  statusUpdatingId,
  handleConfirmOrder,
  handleRevertConfirm,
  handleBookPostEx,
  handleCancelBooking,
  handleBookInstaworld,
  handleManualStatusChange,
  updateOrderField,
  setCustomerHistoryPhone,
  setShowNameDialog,
  setKeyword,
  setStatus,
  page,
  setPage,
  limit,
  setLimit,
  keyword,
  status,
  onViewHistory
}) {
  const { addToast, user } = useApp()
  const canSeeFinancials = user?.role === 'admin'

  const tableRef = useRef(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight)

  const handleScroll = useCallback(() => {
    if (tableRef.current) {
      const rect = tableRef.current.getBoundingClientRect()
      const offset = rect.top < 0 ? -rect.top : 0
      setScrollTop(offset)
    }
  }, [])

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll)
    handleScroll()
    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [handleScroll, filteredOrders])

  const rowHeight = 44
  const buffer = 10

  const { startIndex, endIndex, topPadding, bottomPadding, visibleOrders } = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - buffer)
    const end = Math.min(filteredOrders.length, Math.ceil((scrollTop + viewportHeight) / rowHeight) + buffer)
    const topPad = start * rowHeight
    const bottomPad = (filteredOrders.length - end) * rowHeight
    const visible = filteredOrders.slice(start, end)
    return {
      startIndex: start,
      endIndex: end,
      topPadding: topPad,
      bottomPadding: bottomPad,
      visibleOrders: visible
    }
  }, [scrollTop, viewportHeight, filteredOrders])
  const [lastSelectedIndex, setLastSelectedIndex] = useState(null)
  const [activeTooltipOrderId, setActiveTooltipOrderId] = useState(null)
  const [hoveredOrderId, setHoveredOrderId] = useState(null)
  const [breakdown, setBreakdown] = useState(null)
  const [loadingBreakdown, setLoadingBreakdown] = useState(false)

  // Memoize derived arrays/functions to avoid new refs on every render
  const filteredOrdersIds = useMemo(() => filteredOrders.map(x => x.id), [filteredOrders])
  const getPhoneOrderCount = useCallback((phone) => allOrders.filter(o => o.phone === phone).length, [allOrders])

  const fetchBreakdown = async (orderId) => {
    setLoadingBreakdown(true)
    try {
      const res = await fetch(`/api/cost-manager/breakdown/${orderId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
      })
      const data = await res.json()
      setBreakdown(data)
    } catch (e) { console.error(e) }
    finally { setLoadingBreakdown(false) }
  }

  // CostBreakdownTooltip moved to file level

  // Relocated to SearchTool.jsx for Optimistic UI updates

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
        
        <table ref={tableRef} className="draggable-table">
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
                    {col.id === 'cost' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {col.label}
                      <span style={{ fontSize: '0.6rem', opacity: 0.5 }}>ℹ️</span>
                    </div>
                  ) : col.label}
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
            {topPadding > 0 && (
              <tr style={{ height: topPadding }}>
                <td colSpan={cols.length + 1} style={{ padding: 0, height: topPadding, border: 'none' }} />
              </tr>
            )}
            {visibleOrders.map((o, index) => {
              const actualIndex = startIndex + index;
              return (
                <OrderRow 
                  key={o.id} o={o} cols={cols}
                  isSelected={selectedIds.includes(o.id)}
                  currentIndex={actualIndex}
                  lastSelectedIndex={lastSelectedIndex} setSelectedIds={setSelectedIds} setLastSelectedIndex={setLastSelectedIndex}
                  filteredOrdersLength={filteredOrders.length}
                  filteredOrdersIds={filteredOrdersIds}
                  fetchOrderDetails={fetchOrderDetails} onViewHistory={onViewHistory} bookingId={bookingId}
                  handleConfirmOrder={handleConfirmOrder} handleRevertConfirm={handleRevertConfirm}
                  handleBookPostEx={handleBookPostEx} handleCancelBooking={handleCancelBooking} handleBookInstaworld={handleBookInstaworld}
                  formatCustomerName={formatCustomerName} waTemplates={waTemplates} allOrdersCount={allOrders.length}
                  getPhoneOrderCount={getPhoneOrderCount}
                  setCustomerHistoryPhone={setCustomerHistoryPhone} updateOrderField={updateOrderField}
                  canSeeFinancials={canSeeFinancials} activeTooltipOrderId={activeTooltipOrderId}
                  setActiveTooltipOrderId={setActiveTooltipOrderId} fetchBreakdown={fetchBreakdown}
                  user={user} statusUpdatingId={statusUpdatingId} handleManualStatusChange={handleManualStatusChange}
                  ERP_STATUSES={ERP_STATUSES} getStatusColor={getStatusColor}
                  activeShopDomain={localStorage.getItem('trace_active_shop')}
                  breakdown={breakdown}
                  loadingBreakdown={loadingBreakdown}
                  setBreakdown={setBreakdown}
                />
              )
            })}
            {bottomPadding > 0 && (
              <tr style={{ height: bottomPadding }}>
                <td colSpan={cols.length + 1} style={{ padding: 0, height: bottomPadding, border: 'none' }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalCount > 50 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32, padding: '16px', background: 'var(--bg-elevated)', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
          {totalCount > limit && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <button 
                className={`btn btn-secondary btn-sm`} 
                disabled={page === 1 || loading}
                onClick={() => { setPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              >
                ◀ Previous
              </button>
              <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                Page {page} of {Math.ceil(totalCount / limit)}
              </div>
              <button 
                className={`btn btn-secondary btn-sm`} 
                disabled={page >= Math.ceil(totalCount / limit) || loading}
                onClick={() => { setPage(p => p + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              >
                Next ▶
              </button>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Orders per page:</span>
            <select 
              value={limit} 
              onChange={e => {
                const val = parseInt(e.target.value)
                setLimit(val)
                localStorage.setItem('trace_search_limit', val)
                setPage(1)
              }}
              className="btn btn-secondary btn-sm"
              style={{ padding: '2px 8px', fontSize: '0.75rem', height: 28, background: 'var(--bg-base)', border: '1px solid var(--border)' }}
            >
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="250">250</option>
            </select>
          </div>
        </div>
      )}
      <style>{`
        .cost-tooltip {
          position: absolute;
          bottom: 100%;
          right: 0;
          background: #1a1a1a;
          border: 1px solid rgba(255,255,255,0.15);
          width: 260px;
          border-radius: 10px;
          z-index: 1000;
          margin-bottom: 8px;
          box-shadow: 0 12px 30px rgba(0,0,0,0.5);
          animation: tooltipFade 0.2s ease;
          overflow: hidden;
        }
        @keyframes tooltipFade {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  )
}
