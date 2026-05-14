import React, { useState, useEffect } from 'react'

export default function EditOrderModal({
  editingOrder,
  setEditingOrder,
  editorLoading,
  fetchOrderDetails,
  updateOrderField,
  isCityValid
}) {
  // CS Edit State
  const [localItems, setLocalItems] = useState([]);
  const [localDiscount, setLocalDiscount] = useState(0);
  const [localNotes, setLocalNotes] = useState('');
  const [isSavingCS, setIsSavingCS] = useState(false);

  useEffect(() => {
    if (editingOrder) {
      const items = editingOrder.line_items_parsed || (typeof editingOrder.line_items === 'string' ? JSON.parse(editingOrder.line_items || '[]') : (editingOrder.line_items || []));
      setLocalItems(items);
      setLocalNotes(editingOrder.cs_notes || '');
      let d = 0;
      if (editingOrder.notes) {
        try {
          const parsedNotes = JSON.parse(editingOrder.notes);
          d = parsedNotes.cs_discount || editingOrder.discount_amount || 0;
        } catch(e) {
          d = editingOrder.discount_amount || 0;
        }
      } else {
        d = editingOrder.discount_amount || 0;
      }
      setLocalDiscount(d);
    }
  }, [editingOrder]);

  const handleCSUpdate = async () => {
    setIsSavingCS(true);
    try {
      const apiBase = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
      
      // Calc new price
      const subtotal = localItems.reduce((acc, item) => acc + (parseFloat(item.price) * parseInt(item.quantity)), 0);
      const newPrice = Math.max(0, subtotal - parseFloat(localDiscount || 0) + parseFloat(editingOrder.courier_fee || 250)); // Assumes 250 shipping if unset
      
      const res = await fetch(`${apiBase}/api/orders/${editingOrder.id}/cs-update`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          line_items: localItems,
          price: newPrice,
          discount_amount: parseFloat(localDiscount || 0),
          cs_notes: localNotes
        })
      });
      const data = await res.json();
      if (data.success) {
        setEditingOrder(data.order);
      } else {
        alert(data.error);
      }
    } catch (e) {
      alert('Failed to save CS update');
    } finally {
      setIsSavingCS(false);
    }
  };

  if (!editingOrder) return null

  // Live Math
  const liveSubtotal = localItems.reduce((acc, item) => acc + ((parseFloat(item.price)||0) * (parseInt(item.quantity)||0)), 0);
  const liveTotal = Math.max(0, liveSubtotal - parseFloat(localDiscount || 0) + parseFloat(editingOrder.courier_fee || 250));

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
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>🛒 Line Items</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => {
                    const sku = prompt('Enter SKU to add:');
                    if (sku) {
                      setLocalItems([...localItems, { id: Date.now(), sku, title: 'Custom Item', quantity: 1, price: 0 }]);
                    }
                  }}>+ Add Item</button>
                </div>
              </div>
              <div style={{ padding: 16 }}>
                {localItems.map((item, idx) => (
                  <div key={item.id || idx} style={{ display: 'flex', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                    <div style={{ width: 50, height: 50, borderRadius: 6, background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '1px solid var(--border)' }}>
                      {item.image_url ? <img src={item.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '0.6rem', fontWeight: 800 }}>{item.sku?.slice(0,3)}</span>}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{item.title}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{item.variant_title} • SKU: {item.sku || '—'}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                        <button style={{ padding: '2px 6px', fontSize: '0.7rem', cursor: 'pointer' }} onClick={() => {
                          const newItems = [...localItems];
                          newItems[idx].quantity = Math.max(1, newItems[idx].quantity - 1);
                          setLocalItems(newItems);
                        }}>-</button>
                        <span style={{ fontSize: '0.8rem' }}>{item.quantity}</span>
                        <button style={{ padding: '2px 6px', fontSize: '0.7rem', cursor: 'pointer' }} onClick={() => {
                          const newItems = [...localItems];
                          newItems[idx].quantity += 1;
                          setLocalItems(newItems);
                        }}>+</button>
                        <button style={{ marginLeft: 'auto', padding: '2px 6px', fontSize: '0.7rem', color: 'var(--red)', cursor: 'pointer', border: 'none', background: 'transparent' }} onClick={() => {
                          setLocalItems(localItems.filter((_, i) => i !== idx));
                        }}>Remove</button>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <input 
                        type="number"
                        style={{ width: 80, fontSize: '0.8rem', textAlign: 'right', padding: '2px 4px' }}
                        value={item.price}
                        onChange={(e) => {
                          const newItems = [...localItems];
                          newItems[idx].price = e.target.value;
                          setLocalItems(newItems);
                        }}
                      />
                      <div style={{ fontWeight: 700 }}>Rs {Math.round(item.price * item.quantity).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
                {!localItems.length && (
                  <div style={{ textAlign: 'center', padding: 20 }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No items.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Financials Summary */}
            <div className="card" style={{ padding: 16 }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.8rem' }}>
                 <span>Subtotal</span>
                 <span>Rs {Math.round(liveSubtotal).toLocaleString()}</span>
               </div>
               <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.8rem', alignItems: 'center' }}>
                 <span>CS Discount</span>
                 <input 
                   type="number"
                   style={{ width: 80, fontSize: '0.8rem', textAlign: 'right', padding: '2px 4px' }}
                   value={localDiscount}
                   onChange={e => setLocalDiscount(e.target.value)}
                 />
               </div>
               <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.8rem' }}>
                 <span>Shipping</span>
                 <span>Rs {editingOrder.courier_fee || 250}</span>
               </div>
               <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '1rem', borderTop: '1px solid var(--border)', paddingTop: 8, marginBottom: 16 }}>
                 <span>Total Revenue</span>
                 <span>Rs {Math.round(liveTotal).toLocaleString()}</span>
               </div>
               <div style={{ marginTop: 16 }}>
                 <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleCSUpdate} disabled={isSavingCS}>
                   {isSavingCS ? 'Saving...' : '💾 Save & Sync Shopify'}
                 </button>
               </div>

               <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                  <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 700 }}>INTERNAL CS NOTES (ERP ONLY)</label>
                  <textarea 
                    className="form-textarea"
                    rows={3}
                    value={localNotes}
                    onChange={e => setLocalNotes(e.target.value)}
                    placeholder="Why was this order edited? e.g. Customer changed size, or item was out of stock."
                    style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.02)' }}
                  />
               </div>

               <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 16, marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
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
