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
  handleCancelBooking, handleBookInstaworld, formatCustomerName, waTemplates, allOrdersCount, orderCountsMap,
  setCustomerHistoryPhone, updateOrderField, canSeeFinancials, activeTooltipOrderId, setActiveTooltipOrderId,
  fetchBreakdown, user, statusUpdatingId, handleManualStatusChange, ERP_STATUSES, getStatusColor,
  activeShopDomain, setTooltipTriggerEl, onForceResync, activeRowId, setActiveRowId
}) => {
  const diff = (parseFloat(o.price)||0) - (parseFloat(o.paid_amount)||0);
  const navigate = useNavigate();
  const { addToast, activeStore } = useApp();

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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
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
              <div style={{ 
                fontSize: '0.72rem', 
                color: dateAged ? 'var(--orange)' : 'var(--text-muted)', 
                fontWeight: dateAged ? 700 : 400,
                paddingLeft: '32px'
              }}>
                {o.order_date || '—'}
                {dateAged && <span style={{ fontSize: '0.65rem', marginLeft: 4 }}>{daysOld}d</span>}
              </div>
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
                      {activeStore?.instaworld_key && (
                        <option value="insta:primary" disabled={o.cost <= 0}>
                          🌐 Book Instaworld (API 1: {activeStore.instaworld_key.substring(0, 4)}...)
                        </option>
                      )}
                      {activeStore?.instaworld_key_backup && (
                        <option value="insta:backup" disabled={o.cost <= 0}>
                          🌐 Book Instaworld (API 2: {activeStore.instaworld_key_backup.substring(0, 4)}...)
                        </option>
                      )}
                      {activeStore?.instaworld_key_3 && (
                        <option value="insta:key3" disabled={o.cost <= 0}>
                          🌐 Book Instaworld (API 3: {activeStore.instaworld_key_3.substring(0, 4)}...)
                        </option>
                      )}
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
          const count = o.customer_order_count !== undefined ? o.customer_order_count : (orderCountsMap[o.id] || 1);
          return (
            <td 
              key={col.id} 
              title={o.customer_name}
              style={{ verticalAlign: 'middle' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '3px' }}>
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
                      padding: '1px 5px',
                      borderRadius: 10,
                      cursor: hasIdentifier ? 'pointer' : 'default',
                      border: '1px solid var(--green)',
                      userSelect: 'none',
                      marginTop: '2px'
                    }}
                    title="View customer order history"
                  >
                    {count} Orders
                  </span>
                ) : count === 1 ? (
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>1 Order</span>
                ) : null}
              </div>
            </td>
          )
        }
        if (col.id === 'customer_history') {
          const count = o.customer_order_count !== undefined ? o.customer_order_count : (orderCountsMap[o.id] || 1);
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
              ) : '—'}
            </td>
          );
        }
        if (col.id === 'phone') {
          const formattedPhone = formatPhone(o.phone);
          const phone = formattedPhone;
          const waPhone = formattedPhone ? formattedPhone.replace(/\D/g,'').replace(/^0/,'92') : '';
          return (
            <td key={col.id} className="min-w-[200px] whitespace-nowrap shrink-0" style={{ fontSize: '0.75rem', width: 200, minWidth: 200, maxWidth: 200, overflow: 'visible' }}>
              {formattedPhone ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%', overflow: 'visible' }}>
                  <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', width: '28px', height: '28px', justifyContent: 'center', flexShrink: 0 }}>
                    <select 
                      className="wa-template-select"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveRowId(o.id);
                      }}
                      style={{ 
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '28px',
                        height: '28px',
                        minWidth: '28px',
                        flexShrink: 0,
                        borderRadius: '6px',
                        border: '1px solid var(--border-bright)',
                        background: 'var(--bg-elevated)',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        padding: 0,
                        textAlign: 'center',
                        textAlignLast: 'center',
                        WebkitAppearance: 'none',
                        MozAppearance: 'none',
                        appearance: 'none',
                        outline: 'none',
                        boxShadow: 'none',
                        color: 'transparent'
                      }}
                      value=""
                      onChange={async (e) => {
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
                          const useWaWeb = localStorage.getItem('trace_use_wa_web') === 'true';
                          const waBase = useWaWeb ? 'https://web.whatsapp.com/send' : 'whatsapp://send';
                          const waLink = `${waBase}?phone=${waPhone}&text=${encodeURIComponent(manualConfirmMsg)}`;
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
                             .replace(/\[Tracking\]/g, tracking)
                             .replace(/\[Address\]/g, o.address || 'N/A')
                             .replace(/\[City\]/g, o.city || 'N/A')
                             .replace(/\[Phone\]/g, o.phone || 'N/A')
                             .replace(/\[Products\]/g, o.product_titles || 'N/A')
                             .replace(/\[RefNumber\]/g, o.ref_number || 'N/A')
                             .replace(/\[ItemsCount\]/g, o.items_count || '0');

                          const trackingSlug = o.tracking_slug || 'tr_mock_slug';
                          const trackingLink = `${window.location.origin}/track/${trackingSlug}`;

                          let courierLink = 'N/A';
                          if (tracking && tracking !== 'N/A') {
                            const courierLower = (courier || '').toLowerCase();
                            if (courierLower.includes('postex')) {
                              courierLink = `https://postex.pk/tracking?cn=${tracking}`;
                            } else {
                              courierLink = `https://insta-app-be.instaworld.pk/logistics/orderTracking/?tracking_number=${tracking}`;
                            }
                          }

                          msg = msg
                            .replace(/\[Link\]/g, trackingLink)
                            .replace(/\[TraceLink\]/g, trackingLink)
                            .replace(/\[CourierLink\]/g, courierLink);

                          let imageUrls = [];
                          try {
                            const items = JSON.parse(o.line_items || '[]');
                            imageUrls = items.map(i => i.image_url).filter(Boolean);
                          } catch (e) {}

                          if (imageUrls.length === 0) {
                            addToast(`🔍 Resolving product images for ${o.ref_number || o.id}...`, 'info');
                            try {
                              const res = await fetch(`/api/orders/${o.id}/details`, {
                                headers: {
                                  'Authorization': `Bearer ${localStorage.getItem('trace_token') || localStorage.getItem('token') || ''}`
                                }
                              });
                              if (res.ok) {
                                const freshOrder = await res.json();
                                if (freshOrder.line_items) {
                                  const items = Array.isArray(freshOrder.line_items) ? freshOrder.line_items : JSON.parse(freshOrder.line_items || '[]');
                                  imageUrls = items.map(i => i.image_url).filter(Boolean);
                                }
                              }
                            } catch (err) {
                              console.warn('Failed to resolve fresh order details:', err);
                            }
                          }

                          const waPhone = formattedPhone.replace(/\D/g,'').replace(/^0/,'92');
                          const useWaWeb = localStorage.getItem('trace_use_wa_web') === 'true';
                          const waBase = useWaWeb ? 'https://web.whatsapp.com/send' : 'whatsapp://send';
                          let waLink = `${waBase}?phone=${waPhone}&text=${encodeURIComponent(msg)}`;
                          if (imageUrls.length > 0) {
                            waLink += `&autoImage=${encodeURIComponent(imageUrls.join(','))}`;
                          }
                          window.open(waLink, '_blank');

                          const useLocalHelper = localStorage.getItem('trace_use_local_helper') === 'true';
                          if (useLocalHelper && imageUrls.length > 0) {
                            setTimeout(async () => {
                              try {
                                await fetch('http://127.0.0.1:9099/paste-image', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ imageUrls })
                                });
                              } catch (err) {
                                console.warn('Local helper not running:', err.message);
                              }
                            }, 1500);
                          }
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
                    <span style={{ position: 'absolute', pointerEvents: 'none', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>▼</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '28px', minHeight: '28px', maxHeight: '28px', overflow: 'hidden' }}>
                    <a 
                      href={"tel:" + phone}
                      onClick={() => setActiveRowId(o.id)}
                      className="tabular-nums text-sm font-semibold hover:underline"
                      style={{ 
                        color: 'var(--text-primary)', 
                        textDecoration: 'none', 
                        fontSize: '0.75rem', 
                        lineHeight: '13px',
                        display: 'block',
                        cursor: 'pointer'
                      }}
                      title="Click to initiate SIM Call"
                    >
                      {phone}
                    </a>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '1px', lineHeight: '13px' }}>
                      <a 
                        href={(localStorage.getItem('trace_use_wa_web') === 'true' ? "https://web.whatsapp.com/send" : "whatsapp://send") + "?phone=" + waPhone} 
                        target="_blank" 
                        rel="noreferrer" 
                        onClick={() => setActiveRowId(o.id)} 
                        className="phone-action-btn btn-wa" 
                        style={{ 
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '14px',
                          height: '14px',
                          minWidth: '14px',
                          textDecoration: 'none',
                          flexShrink: 0,
                          padding: 0,
                          cursor: 'pointer',
                          color: '#16a34a',
                          background: 'transparent',
                          border: 'none',
                          opacity: 0.85
                        }}
                        title="Chat via WhatsApp"
                      >
                        <svg style={{ width: '11px', height: '11px' }} fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                      </a>
                      {(() => {
                        const isUnread = o.last_wa_direction === 'incoming' && o.last_wa_status !== 'read';
                        return (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveRowId(o.id);
                              navigate('/whatsapp-portal', { state: { selectPhone: formattedPhone } });
                            }} 
                            className="phone-action-btn btn-chat"
                            style={{ 
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '14px',
                              height: '14px',
                              minWidth: '14px',
                              cursor: 'pointer',
                              padding: 0,
                              flexShrink: 0,
                              color: 'var(--blue)',
                              position: 'relative',
                              background: 'transparent',
                              border: 'none',
                              opacity: 0.85
                            }}
                            title="Open ERP Chat Portal"
                          >
                            <svg style={{ width: '11px', height: '11px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                            {isUnread && <span className="absolute rounded-full" style={{ width: '4px', height: '4px', backgroundColor: '#ef4444', border: '0.8px solid var(--bg-elevated)', top: '-1px', right: '-1px', display: 'block' }}></span>}
                          </button>
                        );
                      })()}
                    </div>
                  </div>
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
              <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
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
        if (col.id === 'tracking_number') {
          const courierStr = (o.courier || '').toLowerCase();
          const isInstaPortal = courierStr.includes('insta') || courierStr.includes('lcs') || courierStr.includes('leopard') || courierStr.includes('tcs') || courierStr.includes('private rider');
          
          return (
            <td key={col.id} style={{ fontSize: '0.75rem', lineHeight: '13px', verticalAlign: 'middle' }}>
              {o.tracking_number ? (
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <a 
                    href={isInstaPortal 
                      ? `https://insta-app-be.instaworld.pk/logistics/orderTracking/?tracking_number=${o.tracking_number}` 
                      : `https://postex.pk/tracking?cn=${o.tracking_number}`} 
                    target="_blank" 
                    rel="noreferrer" 
                    style={{ color: 'var(--blue)', textDecoration: 'none', fontWeight: 600, display: 'block', marginBottom: '1px' }}
                  >
                    🚚 {o.tracking_number}
                  </a>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem', paddingLeft: '14px', display: 'block' }}>
                    {o.courier || '—'}
                  </span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <span style={{ opacity: 0.3, display: 'block' }}>—</span>
                  {o.courier && (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem', display: 'block', marginTop: '1px' }}>
                      {o.courier}
                    </span>
                  )}
                </div>
              )}
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
         prev.orderCountsMap[prev.o.id] === next.orderCountsMap[next.o.id] &&
         ((prev.activeRowId === prev.o.id) === (next.activeRowId === next.o.id));
});

export default CommandTableRow;
