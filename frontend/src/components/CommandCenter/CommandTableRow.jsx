import React, { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { AddressCell, PaidAmountCell, CourierFeeCell, CostCell, NoteCell, CityCell } from './CommandEditableCell'
import { useApp } from '../../context/AppContext'

const formatPhone = (phoneVal) => {
  if (!phoneVal) return '';
  const phoneStr = String(phoneVal).trim();
  if (phoneStr.length === 10 && phoneStr.startsWith('3')) {
    return '0' + phoneStr;
  }
  return phoneStr;
};

const CommandTableRow = React.memo(({ 
  o, cols, isSelected, currentIndex, lastSelectedIndex, setSelectedIds, setLastSelectedIndex, filteredOrdersLength,
  filteredOrdersIds, fetchOrderDetails, onViewHistory, bookingId, handleConfirmOrder, handleRevertConfirm, handleBookPostEx,
  handleCancelBooking, handleBookInstaworld, formatCustomerName, waTemplates, allOrdersCount, getCustomerOrderCount,
  setCustomerHistoryPhone, updateOrderField, canSeeFinancials, activeTooltipOrderId, setActiveTooltipOrderId,
  fetchBreakdown, user, statusUpdatingId, handleManualStatusChange, ERP_STATUSES, getStatusColor,
  activeShopDomain, setTooltipTriggerEl, onForceResync, activeRowId, setActiveRowId
}) => {
  const diff = (parseFloat(o.price)||0) - (parseFloat(o.paid_amount)||0);
  const navigate = useNavigate();
  const { addToast } = useApp();

  const handleAutoCODConfirm = async () => {
    addToast("⏳ Triggering Auto COD confirmation...", "info");
    try {
      const token = localStorage.getItem('trace_token') || localStorage.getItem('token') || '';
      const res = await fetch('/api/whatsapp-governance/cod-verify/trigger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ order_id: o.id })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast("✅ Auto COD confirmation message triggered successfully!", "success");
      } else {
        addToast(`❌ Failed to trigger Auto COD: ${data.error || 'Unknown error'}`, "error");
      }
    } catch (err) {
      addToast(`❌ Error triggering Auto COD: ${err.message || err}`, "error");
    }
  };

  const isClear = Math.abs(diff) <= 1;
  const { bg, color } = getStatusColor(o.delivery_status);
  const s = (o.delivery_status||'').toLowerCase();
  const orderDate = o.order_date ? new Date(o.order_date) : null;
  const today = new Date(); today.setHours(0,0,0,0);
  const daysOld = orderDate ? Math.floor((today-orderDate)/86400000) : 0;
  const isPending = !s.includes('delivered') && !s.includes('return') && !s.includes('cancel');
  const dateAged = isPending && daysOld >= 5;

  const rowClassName = useMemo(() => {
    let classes = [];
    if (isSelected) classes.push('row-selected');
    if (activeRowId === o.id) classes.push('row-active');
    if (o.payment_status === 'COD Cancelled') classes.push('cod-cancelled-row');
    return classes.join(' ');
  }, [isSelected, activeRowId, o.id, o.payment_status]);

  return (
    <tr key={o.id} className={rowClassName}>
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
                onClick={() => { setActiveRowId(o.id); fetchOrderDetails(o.id); }}
                className="btn btn-primary btn-sm"
                style={{ padding: '2px 6px', fontSize: '0.65rem', whiteSpace: 'nowrap', flexShrink: 0 }}
                title="Edit Full Order"
              >
                ✏️
              </button>

              <button 
                onClick={(e) => { e.stopPropagation(); setActiveRowId(o.id); onViewHistory(o); }}
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
                onClick={() => setActiveRowId(o.id)}
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
                    cursor: 'pointer',
                    opacity: 1
                  }}
                  value=""
                  onChange={(e) => {
                    e.stopPropagation();
                    const action = e.target.value;
                    if (action === 'confirm') handleConfirmOrder(o.id);
                    else if (action === 'revert') handleRevertConfirm(o.id);
                    else if (action === 'postex') handleBookPostEx(o.id);
                    else if (action === 'cancel') handleCancelBooking(o.id);
                    else if (action.startsWith('insta:')) handleBookInstaworld(o.id, action.split(':')[1]);
                    else if (action === 'resync') onForceResync(o.id);
                  }}
                >
                  <option value="" disabled>⚡ Action</option>
                  {!o.tracking_number && s !== 'confirmed' && (
                    <option value="confirm" disabled={o.cost <= 0}>✅ Confirm Order</option>
                  )}
                  {!o.tracking_number && s === 'confirmed' && (
                    <option value="revert" disabled={o.cost <= 0}>↩️ Revert to Pending</option>
                  )}
                  {!o.tracking_number && s === 'confirmed' && (
                    <>
                      <option value="postex" disabled={o.cost <= 0}>⚡ Book PostEx</option>
                      <option value="insta:TCS" disabled={o.cost <= 0}>🌐 Book TCS</option>
                      <option value="insta:LCS" disabled={o.cost <= 0}>🌐 Book LCS</option>
                      <option value="insta:Leopards" disabled={o.cost <= 0}>🌐 Book Leopards</option>
                      <option value="insta:InstaLogicstics" disabled={o.cost <= 0}>🌐 Book InstaLog</option>
                    </>
                  )}
                  {!!o.tracking_number && ['booked','pending','confirmed'].includes(s) && (
                    <option value="cancel" disabled={o.cost <= 0}>🛑 Cancel Booking</option>
                  )}
                  <option value="resync">🔄 Force Resync</option>
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
        if (col.id === 'customer_name') {
          const hasIdentifier = o.phone || o.email;
          const formattedPhone = formatPhone(o.phone);
          return (
            <td 
              key={col.id} 
              title={o.customer_name}
              style={{ verticalAlign: 'middle' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <span
                  onClick={hasIdentifier ? (e) => {
                    e.stopPropagation();
                    setActiveRowId(o.id);
                    setCustomerHistoryPhone({ phone: formattedPhone, email: o.email, name: o.customer_name });
                  } : undefined}
                  style={hasIdentifier ? { 
                    cursor: 'pointer', 
                    color: 'var(--brand)', 
                    fontWeight: 600,
                    textDecoration: 'underline',
                    textDecorationStyle: 'dotted'
                  } : {}}
                >
                  {formatCustomerName(o.customer_name)}
                </span>
              </div>
            </td>
          )
        }
        if (col.id === 'customer_history') {
          const count = o.customer_order_count !== undefined ? o.customer_order_count : getCustomerOrderCount(o.phone, o.email);
          const hasIdentifier = o.phone || o.email;
          const formattedPhone = formatPhone(o.phone);
          return (
            <td key={col.id}>
              {count > 1 ? (
                <span
                  onClick={hasIdentifier ? (e) => {
                    e.stopPropagation();
                    setActiveRowId(o.id);
                    setCustomerHistoryPhone({ phone: formattedPhone, email: o.email, name: o.customer_name });
                  } : undefined}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    background: 'var(--green-dim)',
                    color: 'var(--green)',
                    fontSize: '0.58rem',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: 10,
                    cursor: hasIdentifier ? 'pointer' : 'default',
                    border: '1px solid var(--green)',
                    userSelect: 'none'
                  }}
                  title="View customer order history"
                >
                  {count} Orders
                </span>
              ) : count === 1 ? (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>1 Order</span>
              ) : '—'}
            </td>
          );
        }
        if (col.id === 'phone') {
          const formattedPhone = formatPhone(o.phone);
          return (
            <td key={col.id} className="min-w-[160px] whitespace-nowrap shrink-0" style={{ fontSize: '0.75rem' }}>
              {formattedPhone ? (
                <div className="flex items-center gap-2" style={{ flexWrap: 'nowrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }} className="flex-shrink-0">
                    <a href={`tel:${formattedPhone}`} onClick={() => setActiveRowId(o.id)} style={{ color: 'var(--blue)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} className="flex-shrink-0" title="Call via SIM">📞</a>
                    
                    {(() => {
                      const isUnread = o.last_wa_direction === 'incoming' && o.last_wa_status !== 'read';
                      return (
                        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }} className="flex-shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveRowId(o.id);
                              navigate('/whatsapp-portal', { state: { selectPhone: formattedPhone } });
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
                            className="flex-shrink-0"
                            title="Open Chat in Portal"
                          >
                            💬
                            {isUnread && <span className="absolute -top-1 -right-1 wa-unread-badge"></span>}
                          </button>
                        </div>
                      );
                    })()}
 
                    <select 
                      className="wa-template-select flex-shrink-0"
                      onClick={() => setActiveRowId(o.id)}
                      style={{ 
                        background: 'none', 
                        border: 'none', 
                        color: 'var(--text-muted)', 
                        cursor: 'pointer', 
                        fontSize: '0.65rem',
                        padding: 0,
                        width: '12px',
                        marginLeft: '-2px'
                      }}
                      value=""
                      onChange={(e) => {
                        const actionValue = e.target.value;
                        if (!actionValue) return;
                        
                        if (actionValue === 'send_images') {
                          e.target.value = ""; // Reset
                          addToast("Sending actual images...", "info");
                          
                          fetch('/api/whatsapp/send-order-images', {
                            method: 'POST',
                            headers: { 
                              'Content-Type': 'application/json',
                              'Authorization': `Bearer ${localStorage.getItem('trace_token') || localStorage.getItem('token') || ''}`
                            },
                            body: JSON.stringify({ orderId: o.id, phone: formattedPhone })
                          })
                          .then(async (res) => {
                            const data = await res.json();
                            if (res.ok && data.success) {
                              addToast(`✅ Images sent successfully! (Sent ${data.sentCount} items)`, 'success');
                            } else {
                              addToast(`❌ Failed to send images: ${data.error || 'Unknown error'}`, 'error');
                            }
                          })
                          .catch((err) => {
                            addToast(`❌ Failed to send images: ${err.message || err}`, 'error');
                          });
                          return;
                        }

                        if (actionValue === 'auto_cod') {
                          e.target.value = ""; // Reset
                          handleAutoCODConfirm();
                          return;
                        }

                        if (actionValue === 'manual_cod') {
                          e.target.value = ""; // Reset
                          const name = formatCustomerName(o.customer_name);
                          const orderId = o.ref_number || o.shopify_order_id;
                          const amount = Math.round(parseFloat(o.price) || 0);
                          const manualConfirmMsg = `Assalam o Alaikum ${name}, please confirm your order #${orderId} of Rs. ${amount}. Reply 1 to Confirm, 2 to Cancel.`;
                          const waPhone = formattedPhone.replace(/\D/g,'').replace(/^0/,'92');
                          const waLink = `whatsapp://send?phone=${waPhone}&text=${encodeURIComponent(manualConfirmMsg)}`;
                          window.open(waLink, '_blank');
                          return;
                        }

                        if (actionValue.startsWith('template_')) {
                          e.target.value = ""; // Reset
                          const templateId = actionValue.replace('template_', '');
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

                          if (o.confirmation_token) {
                            const appUrl = window.location.origin;
                            const link = `${appUrl}/api/public/confirm-order/${o.confirmation_token}`;
                            msg = msg.replace(/\[Link\]/g, link);
                          } else {
                            msg = msg.replace(/\[Link\]/g, '(Confirm on call)');
                          }

                          const waPhone = formattedPhone.replace(/\D/g,'').replace(/^0/,'92');
                          const waLink = `whatsapp://send?phone=${waPhone}&text=${encodeURIComponent(msg)}`;
                          window.open(waLink, '_blank');
                        }
                      }}
                    >
                      <option value="" disabled>▼</option>
                      <optgroup label="Auto Dispatch (API)">
                        <option value="auto_cod">Auto COD Confirm</option>
                        <option value="send_images">🖼️ Send Product Images</option>
                      </optgroup>
                      <optgroup label="Manual Dispatch (Native App)">
                        <option value="manual_cod">Manual COD Confirm</option>
                        {waTemplates.map(t => (
                          <option key={t.id} value={`template_${t.id}`}>{t.name}</option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
 
                  <a href={`tel:${formattedPhone}`} onClick={() => setActiveRowId(o.id)} style={{ color: 'inherit', textDecoration: 'none', flexShrink: 0 }}>{formattedPhone}</a>
                  <a href={`tel:${formattedPhone}`} onClick={() => setActiveRowId(o.id)} style={{ color: 'var(--blue)', textDecoration: 'none', marginLeft: '8px', fontWeight: 600 }} className="flex-shrink-0" title="Call via SIM">Call</a>
                </div>
              ) : '—'}
            </td>
          );
        }
        if (col.id === 'city') return <td key={col.id}><CityCell order={o} onSave={updateOrderField} onInteraction={() => setActiveRowId(o.id)} /></td>
        if (col.id === 'address') return (
          <td key={col.id} className="break-words whitespace-normal">
            <AddressCell order={o} onSave={updateOrderField} onInteraction={() => setActiveRowId(o.id)} />
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
        if (col.id === 'paid_amount') return <td key={col.id}><PaidAmountCell order={o} onSave={updateOrderField} onInteraction={() => setActiveRowId(o.id)} /></td>
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
                        onChange={(e) => {
                          setActiveRowId(o.id);
                          handleManualStatusChange(o.id, e.target.value);
                        }}
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
        if (col.id === 'courier_fee') return canSeeFinancials ? <td key={col.id}><CourierFeeCell order={o} onSave={updateOrderField} onInteraction={() => setActiveRowId(o.id)} /></td> : <td key={col.id}>—</td>
        if (col.id === 'payment_status') return <td key={col.id}><span style={{ color: o.payment_status === 'Paid' ? 'var(--green)' : 'var(--orange)', fontWeight: 600 }}>{o.payment_status || 'Unpaid'}</span></td>
        if (col.id === 'cost') return canSeeFinancials ? (
          <td 
            key={col.id} 
            style={{ position: 'relative', overflow: 'visible' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CostCell order={o} onSave={updateOrderField} onInteraction={() => setActiveRowId(o.id)} />
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveRowId(o.id);
                  if (String(activeTooltipOrderId) === String(o.id)) {
                    setActiveTooltipOrderId(null);
                    setBreakdown(null);
                    setTooltipTriggerEl(null);
                  } else {
                    setTooltipTriggerEl(e.currentTarget);
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
        if (col.id === 'notes') return <td key={col.id}><NoteCell order={o} onSave={updateOrderField} onInteraction={() => setActiveRowId(o.id)} /></td>
        if (col.id === 'wa_erp_status') {
          const status = o.wa_status || o.wa_erp_status;
          let badgeBg = 'rgba(100,116,139,0.2)';
          let badgeColor = '#94a3b8';
          let badgeBorder = '1px solid rgba(100,116,139,0.3)';
          let emoji = '—';
          let displayStatus = '—';
          if (status) {
            const lower = status.toLowerCase();
            if (lower.includes('confirm')) {
              badgeBg = 'rgba(34,197,94,0.15)';
              badgeColor = '#22c55e';
              badgeBorder = '1px solid rgba(34,197,94,0.4)';
              emoji = '🟢';
              displayStatus = 'Confirmed';
            } else if (lower.includes('cancel')) {
              badgeBg = 'rgba(239,68,68,0.15)';
              badgeColor = '#ef4444';
              badgeBorder = '1px solid rgba(239,68,68,0.4)';
              emoji = '🔴';
              displayStatus = 'Cancelled';
            } else if (lower.includes('edit')) {
              badgeBg = 'rgba(234,179,8,0.15)';
              badgeColor = '#eab308';
              badgeBorder = '1px solid rgba(234,179,8,0.4)';
              emoji = '✏️';
              displayStatus = 'Edit Req';
            } else if (lower.includes('review')) {
              badgeBg = 'rgba(249,115,22,0.15)';
              badgeColor = '#f97316';
              badgeBorder = '1px solid rgba(249,115,22,0.4)';
              emoji = '🟡';
              displayStatus = 'Review';
            } else {
              displayStatus = status.replace('Trace: ', '');
            }
          }
          return (
            <td key={col.id} className="px-4 py-2">
              {status ? (
                <span
                  className={`text-xs px-2 py-1 rounded-full font-medium ${
                    status === 'Trace: Confirmed' ? 'bg-green-100 text-green-800' :
                    status === 'Trace: Cancelled' ? 'bg-red-100 text-red-800' :
                    status === 'Trace: Edit Requested' ? 'bg-yellow-100 text-yellow-800' :
                    status === 'Trace: Manual Review' ? 'bg-orange-100 text-orange-800' : ''
                  }`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    background: badgeBg,
                    color: badgeColor,
                    border: badgeBorder,
                    borderRadius: 10,
                    padding: '3px 8px',
                    fontSize: '0.62rem',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    letterSpacing: '0.02em'
                  }}
                  title={`COD Status: ${status}`}
                >
                  <span
                    style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: badgeColor,
                      display: 'inline-block',
                      boxShadow: `0 0 6px ${badgeColor}`,
                      animation: 'waPulseDot 2s infinite'
                    }}
                  />
                  {emoji} {displayStatus}
                </span>
              ) : (
                <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem', opacity: 0.4 }}>—</span>
              )}
            </td>
          );
        }
        return <td key={col.id}>—</td>
      })}
    </tr>
  );
}, (prev, next) => {
  return prev.o === next.o &&
         prev.isSelected === next.isSelected &&
         prev.statusUpdatingId === next.statusUpdatingId &&
         prev.bookingId === next.bookingId &&
         prev.activeTooltipOrderId === next.activeTooltipOrderId &&
         prev.cols === next.cols &&
         prev.onForceResync === next.onForceResync &&
         ((prev.activeRowId === prev.o.id) === (next.activeRowId === next.o.id));
});

export default CommandTableRow;
