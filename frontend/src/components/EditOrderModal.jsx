import React from 'react'

export default function EditOrderModal({
  editingOrder,
  setEditingOrder,
  editorLoading,
  fetchOrderDetails,
  updateOrderField,
  isCityValid
}) {
  if (!editingOrder) return null

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(4px)' }}>
      <div className="card" style={{ width: '100%', maxWidth: 1100, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', animation: 'slideUp 0.3s ease-out' }}>
        
        {/* Modal Header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-elevated)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Order {editingOrder.ref_number || editingOrder.shopify_order_id}</h2>
              <span className="badge" style={{ background: 'var(--yellow-dim)', color: 'var(--yellow)' }}>{editingOrder.payment_status || 'Pending'}</span>
              <span className="badge" style={{ background: 'var(--blue-dim)', color: 'var(--blue)' }}>{editingOrder.delivery_status || 'Unfulfilled'}</span>
              { ((editingOrder.delivery_status || '').toLowerCase().includes('delivered') || (editingOrder.delivery_status || '').toLowerCase().includes('transit')) && parseInt(editingOrder.items_count) === 0 && (
                <span className="badge" style={{ background: 'var(--blue-dim)', color: 'var(--blue)', fontSize: '0.7rem', border: '1px solid var(--blue)' }}>🔄 EXCHANGE / RESTOCKED</span>
              )}
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {(() => {
                if (!editingOrder.order_date) return '—';
                const d = new Date(editingOrder.order_date);
                if (!isNaN(d.getTime())) return d.toLocaleString();
                const parts = editingOrder.order_date.split(/[\/\- ]/);
                if (parts.length >= 3) {
                  if (parts[0].length === 4) return new Date(editingOrder.order_date).toLocaleString();
                  const d2 = new Date(`${parts[1]}/${parts[0]}/${parts[2]}`);
                  if (!isNaN(d2.getTime())) return d2.toLocaleString();
                }
                return editingOrder.order_date;
              })()}
            </p>
          </div>
          <div className="flex gap-2">
            {editorLoading && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>⏳ Syncing...</span>}
            <button className="btn btn-secondary" onClick={() => setEditingOrder(null)}>Close</button>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, background: 'var(--bg-app)' }}>
          
          {/* Left Column: Products & Financials */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            
            {/* Products Card */}
            <div className="card" style={{ padding: 0 }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: '0.85rem' }}>🛒 Line Items</div>
              <div style={{ padding: 16 }}>
                {(editingOrder.line_items || []).map(item => (
                  <div key={item.id} style={{ display: 'flex', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                    <div style={{ width: 50, height: 50, borderRadius: 6, background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '1px solid var(--border)' }}>
                      {item.image_url ? <img src={item.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '0.6rem', fontWeight: 800 }}>{item.sku?.slice(0,3)}</span>}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{item.title}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{item.variant_title} • SKU: {item.sku || '—'}</div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '0.85rem' }}>
                      <div>Rs {Math.round(item.price).toLocaleString()} × {item.quantity}</div>
                      <div style={{ fontWeight: 700 }}>Rs {Math.round(item.price * item.quantity).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
                {!editingOrder.line_items?.length && (
                  <div style={{ textAlign: 'center', padding: 20 }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No items found locally.</p>
                    <button className="btn btn-primary btn-sm" onClick={() => fetchOrderDetails(editingOrder.id)}>🔄 Fetch from Shopify</button>
                  </div>
                )}
              </div>
            </div>

            {/* Financials Summary */}
            <div className="card" style={{ padding: 16 }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.8rem' }}>
                 <span>Subtotal</span>
                 <span>Rs {Math.round(Math.max(0, (parseFloat(editingOrder.price) || 0) - 250)).toLocaleString()}</span>
               </div>
               <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.8rem' }}>
                 <span>Shipping</span>
                 <span>Rs 250</span>
               </div>
               <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '1rem', borderTop: '1px solid var(--border)', paddingTop: 8, marginBottom: 16 }}>
                 <span>Total Revenue</span>
                 <span>Rs {Math.round(parseFloat(editingOrder.price) || 0).toLocaleString()}</span>
               </div>

               <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                   <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>🚚 Courier Fee</span>
                   <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                     <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>Rs</span>
                     <input 
                       type="number" 
                       className="form-input" 
                       style={{ width: 100, height: 32, fontSize: '0.9rem', textAlign: 'right', fontWeight: 700 }}
                       value={editingOrder.courier_fee || ''} 
                       onChange={e => setEditingOrder({ ...editingOrder, courier_fee: e.target.value })}
                       onBlur={() => updateOrderField(editingOrder.id, 'courier_fee', editingOrder.courier_fee)}
                       placeholder="0"
                     />
                   </div>
                 </div>
               </div>
            </div>
          </div>

          {/* Right Column: Customer & Notes */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            
            {/* Notes Card */}
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 12 }}>📝 Order Notes</div>
              <textarea 
                className="form-textarea" 
                rows={4} 
                value={editingOrder.notes || ''} 
                onChange={e => setEditingOrder({ ...editingOrder, notes: e.target.value })}
                onBlur={() => updateOrderField(editingOrder.id, 'notes', editingOrder.notes)}
                style={{ fontSize: '0.8rem' }}
                placeholder="Enter customer notes..."
              />
              <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 8 }}>Notes sync live with Shopify.</p>
            </div>

            {/* Customer Details Card */}
            <div className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>👤 Customer</div>
              </div>
              
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Full Name</label>
                <input 
                  className="form-input" 
                  value={editingOrder.customer_name || ''} 
                  onChange={e => setEditingOrder({ ...editingOrder, customer_name: e.target.value })}
                  onBlur={() => updateOrderField(editingOrder.id, 'customer_name', editingOrder.customer_name)}
                  style={{ height: 32, fontSize: '0.8rem' }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Phone</label>
                  {editingOrder.phone && (
                    <a href={`tel:${editingOrder.phone}`} style={{ fontSize: '0.75rem', textDecoration: 'none' }} title="Call via SIM">📞 Call</a>
                  )}
                </div>
                <input 
                  className="form-input" 
                  value={editingOrder.phone || ''} 
                  onChange={e => setEditingOrder({ ...editingOrder, phone: e.target.value })}
                  onBlur={() => updateOrderField(editingOrder.id, 'phone', editingOrder.phone)}
                  style={{ height: 32, fontSize: '0.8rem' }}
                />
              </div>

              <div className="form-group">
                <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Address</label>
                <textarea 
                  className="form-textarea" 
                  rows={3}
                  value={editingOrder.address || ''} 
                  onChange={e => setEditingOrder({ ...editingOrder, address: e.target.value })}
                  onBlur={() => updateOrderField(editingOrder.id, 'address', editingOrder.address)}
                  style={{ fontSize: '0.8rem' }}
                />
              </div>

              <div className="form-group" style={{ marginTop: 12 }}>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>City</label>
                <div style={{ position: 'relative' }}>
                  <input 
                    className="form-input" 
                    value={editingOrder.city || ''} 
                    onChange={e => setEditingOrder({ ...editingOrder, city: e.target.value })}
                    onBlur={() => updateOrderField(editingOrder.id, 'city', editingOrder.city)}
                    style={{ 
                      height: 32, 
                      fontSize: '0.8rem',
                      borderColor: !isCityValid ? 'var(--red)' : 'var(--border)'
                    }}
                  />
                  {!isCityValid && (
                    <div style={{ color: 'var(--red)', fontSize: '0.65rem', marginTop: 4 }}>
                      ⚠️ Unmapped City. Might fail booking.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
