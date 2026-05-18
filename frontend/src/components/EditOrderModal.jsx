import React, { useState, useEffect } from 'react'

export default function EditOrderModal({
  editingOrder,
  setEditingOrder,
  editorLoading,
  fetchOrderDetails,
  updateOrderField,
  isCityValid
}) {
  // Navigation Tabs: 'financials' | 'customer' | 'logistics'
  const [activeTab, setActiveTab] = useState('financials');

  // CS Edit State
  const [localItems, setLocalItems] = useState([]);
  const [localDiscount, setLocalDiscount] = useState(0);
  const [localNotes, setLocalNotes] = useState('');
  const [isSavingCS, setIsSavingCS] = useState(false);

  // Pillar 1: Customer Intelligence & WhatsApp State
  const [custIntel, setCustIntel] = useState({ total: 0, delivered: 0, returned: 0, rto_rate: 0, blacklist: false });
  const [custIntelLoading, setCustIntelLoading] = useState(false);
  const [waSimulating, setWaSimulating] = useState(false);

  // Pillar 2: Master Products & Product Search State
  const [masterProducts, setMasterProducts] = useState([]);
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState('');

  // Pillar 3: Logistics & Live Tracking State
  const [bookingCourier, setBookingCourier] = useState(false);
  const [trackingData, setTrackingData] = useState(null);
  const [trackingLoading, setTrackingLoading] = useState(false);

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

      // Fetch Customer Intelligence
      setCustIntelLoading(true);
      const apiBase = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
      fetch(`${apiBase}/api/orders/${editingOrder.id}/customer-intelligence`)
        .then(r => r.json())
        .then(data => { setCustIntel(data); setCustIntelLoading(false); })
        .catch(() => setCustIntelLoading(false));

      // Fetch Master Products for SKU Intelligence (Fixed endpoint & response mapping)
      const storeId = editingOrder.store_id || localStorage.getItem('activeStoreId') || 1;
      fetch(`${apiBase}/api/cost-manager?store_id=${storeId}`)
        .then(r => r.json())
        .then(data => setMasterProducts(Array.isArray(data) ? data : []))
        .catch(() => {});

      // Fetch Live Tracking if tracking number exists
      if (editingOrder.tracking_number || editingOrder.tracking_slug) {
        setTrackingLoading(true);
        const slug = editingOrder.tracking_slug || 'tr_mock_slug';
        fetch(`${apiBase}/api/customer-success/tracking/${slug}`)
          .then(r => r.json())
          .then(data => { setTrackingData(data); setTrackingLoading(false); })
          .catch(() => setTrackingLoading(false));
      }
    }
  }, [editingOrder]);

  const handleCSUpdate = async () => {
    setIsSavingCS(true);
    try {
      const apiBase = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
      
      const subtotal = localItems.reduce((acc, item) => acc + (parseFloat(item.price) * parseInt(item.quantity)), 0);
      const newPrice = Math.max(0, subtotal - parseFloat(localDiscount || 0) + parseFloat(editingOrder.courier_fee || 250));
      
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
        alert('Order updated successfully!');
      } else {
        alert(data.error);
      }
    } catch (e) {
      alert('Failed to save CS update');
    } finally {
      setIsSavingCS(false);
    }
  };

  // Pillar 1: WhatsApp Simulation Trigger
  const handleWaSimulate = (action) => {
    setWaSimulating(true);
    const apiBase = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
    fetch(`${apiBase}/api/customer-success/simulate-trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: editingOrder.id, action })
    })
      .then(r => r.json())
      .then(res => {
        setWaSimulating(false);
        if (res.error) throw new Error(res.error);
        alert(res.message);
        if (fetchOrderDetails) fetchOrderDetails(editingOrder.id);
        if (action === 'SIMULATE_CONFIRM') setEditingOrder({ ...editingOrder, wa_verification_status: 'Verified' });
        if (action === 'SIMULATE_CANCEL') setEditingOrder({ ...editingOrder, wa_verification_status: 'Cancelled' });
        if (action === 'SEND_VERIFICATION') setEditingOrder({ ...editingOrder, wa_verification_status: 'Pending' });
      })
      .catch(err => {
        setWaSimulating(false);
        alert(err.message || 'WhatsApp simulation failed');
      });
  };

  // Pillar 1: AI Address Cleanse Helper
  const handleAddressCleanse = () => {
    if (!editingOrder.address) return;
    let cleaned = editingOrder.address
      .replace(/\s+/g, ' ')
      .replace(/(bahria town|dha|gulberg|wapda town|johar town)/gi, match => match.toUpperCase())
      .replace(/\b(st|str|street)\b/gi, 'Street')
      .replace(/\b(h|ho|house)\b/gi, 'House')
      .replace(/\b(sec|sect|sector)\b/gi, 'Sector')
      .trim();
    
    if (editingOrder.city && !cleaned.toLowerCase().includes(editingOrder.city.toLowerCase())) {
      cleaned += `, ${editingOrder.city}`;
    }
    setEditingOrder({ ...editingOrder, address: cleaned });
    if (updateOrderField) updateOrderField(editingOrder.id, 'address', cleaned);
  };

  // Pillar 3: 1-Click Courier Booking Helper
  const handleBookCourier = (courierName) => {
    setBookingCourier(true);
    const apiBase = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
    fetch(`${apiBase}/api/bulk/book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify({ order_ids: [editingOrder.id], courier: courierName })
    })
      .then(r => r.json())
      .then(res => {
        setBookingCourier(false);
        if (res.error) throw new Error(res.error);
        alert(`Successfully booked with ${courierName}! Tracking #${res.results?.[0]?.tracking_number || 'GENERATED'}`);
        if (fetchOrderDetails) fetchOrderDetails(editingOrder.id);
        setEditingOrder({ 
          ...editingOrder, 
          tracking_number: res.results?.[0]?.tracking_number || 'TRK-' + Math.floor(Math.random()*1000000),
          courier: courierName,
          delivery_status: 'Booked'
        });
      })
      .catch(err => {
        setBookingCourier(false);
        alert(err.message || 'Courier booking failed');
      });
  };

  if (!editingOrder) return null;

  // Live Math & Profit Margins
  const liveSubtotal = localItems.reduce((acc, item) => acc + ((parseFloat(item.price)||0) * (parseInt(item.quantity)||0)), 0);
  const liveTotal = Math.max(0, liveSubtotal - parseFloat(localDiscount || 0) + parseFloat(editingOrder.courier_fee || 250));

  // Calculate Total Order Cost from Master Products
  let totalOrderCost = 0;
  localItems.forEach(item => {
    const matched = masterProducts.find(mp => mp.sku === item.sku || mp.parent_title === item.title);
    const unitCost = matched?.unit_cost || matched?.landed_cost || 0;
    totalOrderCost += (parseFloat(unitCost) * (parseInt(item.quantity) || 1));
  });

  const netProfit = liveTotal - totalOrderCost - parseFloat(editingOrder.courier_fee || 250);
  const profitMargin = liveTotal > 0 ? Math.round((netProfit / liveTotal) * 100) : 0;

  // AI Address Quality Heuristic Score
  const getAddressScore = (addr) => {
    if (!addr || addr.length < 10) return { label: '⚠️ Low Quality (Too Short)', color: '#f43f5e', bg: 'rgba(244,63,94,0.1)' };
    const hasNumber = /\d/.test(addr);
    const hasStreet = /(st|street|road|rd|lane|ln|block|blk|sector|sec|phase)/i.test(addr);
    if (hasNumber && hasStreet && addr.length > 15) return { label: '✅ High Quality (Courier Perfect)', color: '#10b981', bg: 'rgba(16,185,129,0.1)' };
    return { label: '⚠️ Fair Quality (Missing Street/House #)', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' };
  };
  const addrScore = getAddressScore(editingOrder.address);

  // WhatsApp Status Badge Helper
  const getWaBadge = (status) => {
    if (status === 'Verified') return <span style={{ background: '#10b98120', color: '#10b981', padding: '4px 12px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700 }}>🟢 WhatsApp Verified</span>;
    if (status === 'Address_Updated') return <span style={{ background: '#3b82f620', color: '#3b82f6', padding: '4px 12px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700 }}>✏️ Address Curated</span>;
    if (status === 'Cancelled') return <span style={{ background: '#ef444420', color: '#ef4444', padding: '4px 12px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700 }}>🔴 Cancelled via WA</span>;
    return <span style={{ background: '#f59e0b20', color: '#f59e0b', padding: '4px 12px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700 }}>🟡 COD Pending Verification</span>;
  };

  // Filtered Master Products for Search Popover
  const filteredProducts = masterProducts.filter(mp => 
    (mp.parent_title || '').toLowerCase().includes(productSearchQuery.toLowerCase()) ||
    (mp.variant_title || '').toLowerCase().includes(productSearchQuery.toLowerCase()) ||
    (mp.sku || '').toLowerCase().includes(productSearchQuery.toLowerCase())
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(8px)', fontFamily: 'sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 1200, maxHeight: '92vh', background: '#0f172a', border: '1px solid #334155', borderRadius: 24, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'slideUp 0.3s ease-out' }}>
        
        {/* 🚨 Automated RTO Risk Warning Banner (Pillar 1) */}
        {(custIntel.returned > 0 || custIntel.blacklist) && (
          <div style={{ background: 'linear-gradient(90deg, #9f1239 0%, #be123c 100%)', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyItems: 'space-between', justifyContent: 'space-between', color: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: '1.5rem' }}>🚨</span>
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>High RTO Risk Detected</div>
                <div style={{ fontSize: '0.75rem', opacity: 0.9 }}>
                  Customer has {custIntel.returned} previous refused/returned parcels. Historical RTO Rate: {custIntel.rto_rate}%. {custIntel.blacklist ? '⚠️ ACTIVE BLACKLIST STRIKE.' : ''}
                </div>
              </div>
            </div>
            <button 
              onClick={() => handleWaSimulate('SIMULATE_CANCEL')} 
              style={{ background: '#0f172a', color: '#fda4af', border: '1px solid #f43f5e', padding: '6px 14px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
            >
              ❌ Cancel & Restock
            </button>
          </div>
        )}

        {/* Modal Header & Navigation Tabs */}
        <div style={{ padding: '20px 28px 0', borderBottom: '1px solid #334155', background: '#1e293b', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyItems: 'space-between', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#fff' }}>
                Order #{editingOrder.ref_number || editingOrder.shopify_order_id}
              </h2>
              <span style={{ background: '#f59e0b20', color: '#f59e0b', padding: '4px 10px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 700, border: '1px solid #f59e0b40' }}>
                {editingOrder.payment_status || 'Pending'}
              </span>
              <span style={{ background: '#3b82f620', color: '#3b82f6', padding: '4px 10px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 700, border: '1px solid #3b82f640' }}>
                {editingOrder.delivery_status || 'Unfulfilled'}
              </span>
              {getWaBadge(editingOrder.wa_verification_status)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {editorLoading && <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>⏳ Syncing...</span>}
              <button 
                onClick={() => setEditingOrder(null)} 
                style={{ background: '#334155', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 12, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
              >
                ✕ Close
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div style={{ display: 'flex', gap: 8, borderBottom: 'none' }}>
            <button 
              onClick={() => setActiveTab('financials')}
              style={{ 
                padding: '12px 20px', 
                background: activeTab === 'financials' ? '#0f172a' : 'transparent', 
                color: activeTab === 'financials' ? '#6366f1' : '#94a3b8', 
                borderTopLeftRadius: 16, 
                borderTopRightRadius: 16, 
                border: activeTab === 'financials' ? '1px solid #334155' : 'none', 
                borderBottom: 'none', 
                fontWeight: 700, 
                fontSize: '0.85rem', 
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <span>🛒</span>
              <span>Line Items & Financials</span>
            </button>
            <button 
              onClick={() => setActiveTab('customer')}
              style={{ 
                padding: '12px 20px', 
                background: activeTab === 'customer' ? '#0f172a' : 'transparent', 
                color: activeTab === 'customer' ? '#6366f1' : '#94a3b8', 
                borderTopLeftRadius: 16, 
                borderTopRightRadius: 16, 
                border: activeTab === 'customer' ? '1px solid #334155' : 'none', 
                borderBottom: 'none', 
                fontWeight: 700, 
                fontSize: '0.85rem', 
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <span>👤</span>
              <span>Customer & WhatsApp Success</span>
            </button>
            <button 
              onClick={() => setActiveTab('logistics')}
              style={{ 
                padding: '12px 20px', 
                background: activeTab === 'logistics' ? '#0f172a' : 'transparent', 
                color: activeTab === 'logistics' ? '#6366f1' : '#94a3b8', 
                borderTopLeftRadius: 16, 
                borderTopRightRadius: 16, 
                border: activeTab === 'logistics' ? '1px solid #334155' : 'none', 
                borderBottom: 'none', 
                fontWeight: 700, 
                fontSize: '0.85rem', 
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <span>🚚</span>
              <span>Courier Logistics & Timeline</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 28, background: '#0f172a', color: '#f1f5f9', position: 'relative' }}>
          
          {/* TAB 1: Line Items & Financials */}
          {activeTab === 'financials' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 28 }}>
              
              {/* Left Side: Line Items List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 20, overflow: 'hidden' }}>
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid #334155', display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff' }}>🛒 Order Contents</span>
                    <button 
                      onClick={() => setShowProductSearch(true)} 
                      style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(79,70,229,0.3)' }}
                    >
                      + Smart Add Item
                    </button>
                  </div>

                  <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {localItems.map((item, idx) => {
                      const matched = masterProducts.find(mp => mp.sku === item.sku || mp.parent_title === item.title);
                      const stockQty = matched?.inventory_qty ?? matched?.stock ?? 10;
                      const unitCost = matched?.unit_cost ?? matched?.landed_cost ?? 0;
                      const itemRevenue = parseFloat(item.price) * parseInt(item.quantity);
                      const itemCost = parseFloat(unitCost) * parseInt(item.quantity);
                      const itemMargin = itemRevenue > 0 ? Math.round(((itemRevenue - itemCost) / itemRevenue) * 100) : 0;

                      return (
                        <div key={item.id || idx} style={{ display: 'flex', gap: 16, paddingBottom: 16, borderBottom: idx === localItems.length - 1 ? 'none' : '1px solid #334155' }}>
                          <div style={{ width: 64, height: 64, borderRadius: 14, background: '#0f172a', border: '1px solid #334155', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                            {item.image_url ? <img src={item.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#64748b' }}>{item.sku?.slice(0,3)}</span>}
                          </div>

                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>{item.title}</div>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 2 }}>{item.variant_title} • SKU: {item.sku || '—'}</div>
                            
                            {/* Live Stock & Margin Badges (Pillar 2) */}
                            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                              <span style={{ background: stockQty > 5 ? '#10b98120' : '#f59e0b20', color: stockQty > 5 ? '#10b981' : '#f59e0b', padding: '2px 8px', borderRadius: 10, fontSize: '0.7rem', fontWeight: 700 }}>
                                {stockQty > 5 ? `📦 In Stock (${stockQty})` : `⚠️ Low Stock (${stockQty})`}
                              </span>
                              <span style={{ background: '#6366f120', color: '#818cf8', padding: '2px 8px', borderRadius: 10, fontSize: '0.7rem', fontWeight: 700 }}>
                                Unit Cost: Rs {parseFloat(unitCost).toLocaleString()} | Margin: {itemMargin}%
                              </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
                              <div style={{ display: 'flex', alignItems: 'center', background: '#0f172a', border: '1px solid #334155', borderRadius: 10, overflow: 'hidden' }}>
                                <button style={{ background: 'transparent', border: 'none', color: '#fff', padding: '4px 10px', cursor: 'pointer', fontWeight: 700 }} onClick={() => {
                                  const newItems = [...localItems];
                                  newItems[idx].quantity = Math.max(1, newItems[idx].quantity - 1);
                                  setLocalItems(newItems);
                                }}>-</button>
                                <span style={{ padding: '0 10px', fontSize: '0.85rem', fontWeight: 700 }}>{item.quantity}</span>
                                <button style={{ background: 'transparent', border: 'none', color: '#fff', padding: '4px 10px', cursor: 'pointer', fontWeight: 700 }} onClick={() => {
                                  const newItems = [...localItems];
                                  newItems[idx].quantity += 1;
                                  setLocalItems(newItems);
                                }}>+</button>
                              </div>
                              <button style={{ background: 'transparent', border: 'none', color: '#f43f5e', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }} onClick={() => {
                                setLocalItems(localItems.filter((_, i) => i !== idx));
                              }}>Remove</button>
                            </div>
                          </div>

                          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                            <input 
                              type="number"
                              style={{ width: 90, background: '#0f172a', border: '1px solid #334155', borderRadius: 10, padding: '6px 10px', color: '#fff', fontSize: '0.85rem', textAlign: 'right', fontWeight: 600, outline: 'none' }}
                              value={item.price}
                              onChange={(e) => {
                                const newItems = [...localItems];
                                newItems[idx].price = e.target.value;
                                setLocalItems(newItems);
                              }}
                            />
                            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#fff' }}>Rs {Math.round(item.price * item.quantity).toLocaleString()}</div>
                          </div>
                        </div>
                      );
                    })}
                    {!localItems.length && (
                      <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
                        <p style={{ margin: 0, fontSize: '0.9rem' }}>No line items in this order.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Side: Financials & Profitability Summary */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff', borderBottom: '1px solid #334155', paddingBottom: 12 }}>📊 Financial Breakdown</div>
                  
                  <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', fontSize: '0.85rem', color: '#94a3b8' }}>
                    <span>Subtotal</span>
                    <span style={{ color: '#fff', fontWeight: 700 }}>Rs {Math.round(liveSubtotal).toLocaleString()}</span>
                  </div>

                  <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', fontSize: '0.85rem', color: '#94a3b8', alignItems: 'center' }}>
                    <span>CS Discount</span>
                    <input 
                      type="number"
                      style={{ width: 90, background: '#0f172a', border: '1px solid #334155', borderRadius: 10, padding: '6px 10px', color: '#fff', fontSize: '0.85rem', textAlign: 'right', fontWeight: 600, outline: 'none' }}
                      value={localDiscount}
                      onChange={e => setLocalDiscount(e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', fontSize: '0.85rem', color: '#94a3b8', alignItems: 'center' }}>
                    <span>Shipping Fee</span>
                    <input 
                      type="number"
                      style={{ width: 90, background: '#0f172a', border: '1px solid #334155', borderRadius: 10, padding: '6px 10px', color: '#fff', fontSize: '0.85rem', textAlign: 'right', fontWeight: 600, outline: 'none' }}
                      value={editingOrder.courier_fee || 250}
                      onChange={e => setEditingOrder({ ...editingOrder, courier_fee: e.target.value })}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: 800, color: '#fff', borderTop: '1px solid #334155', paddingTop: 16 }}>
                    <span>Total Revenue</span>
                    <span>Rs {Math.round(liveTotal).toLocaleString()}</span>
                  </div>

                  {/* True Net Profit Display (Pillar 2) */}
                  <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                    <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', fontSize: '0.8rem', color: '#94a3b8' }}>
                      <span>Master Inventory Cost</span>
                      <span style={{ color: '#f43f5e', fontWeight: 700 }}>-Rs {Math.round(totalOrderCost).toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', fontSize: '0.8rem', color: '#94a3b8' }}>
                      <span>Estimated Net Profit</span>
                      <span style={{ color: netProfit > 0 ? '#10b981' : '#f43f5e', fontWeight: 800, fontSize: '0.9rem' }}>
                        Rs {Math.round(netProfit).toLocaleString()} ({profitMargin}%)
                      </span>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid #334155', paddingTop: 16, marginTop: 4 }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', marginBottom: 8 }}>INTERNAL CS NOTES (ERP ONLY)</label>
                    <textarea 
                      rows={3}
                      value={localNotes}
                      onChange={e => setLocalNotes(e.target.value)}
                      placeholder="Why was this order edited? e.g. Customer changed size, or item was out of stock."
                      style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: 12, padding: 12, color: '#fff', fontSize: '0.85rem', outline: 'none', resize: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Customer & WhatsApp Success */}
          {activeTab === 'customer' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 28 }}>
              
              {/* Left Side: Customer Info & AI Address Quality */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff', borderBottom: '1px solid #334155', paddingBottom: 12 }}>👤 Customer Details</div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>Full Name</label>
                      <input 
                        value={editingOrder.customer_name || ''} 
                        onChange={e => setEditingOrder({ ...editingOrder, customer_name: e.target.value })}
                        onBlur={() => updateOrderField && updateOrderField(editingOrder.id, 'customer_name', editingOrder.customer_name)}
                        style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: 12, padding: '10px 12px', color: '#fff', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8' }}>Phone Number</label>
                        {editingOrder.phone && <a href={`tel:${editingOrder.phone}`} style={{ fontSize: '0.75rem', color: '#6366f1', textDecoration: 'none', fontWeight: 700 }}>📞 Call via SIM</a>}
                      </div>
                      <input 
                        value={editingOrder.phone || ''} 
                        onChange={e => setEditingOrder({ ...editingOrder, phone: e.target.value })}
                        onBlur={() => updateOrderField && updateOrderField(editingOrder.id, 'phone', editingOrder.phone)}
                        style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: 12, padding: '10px 12px', color: '#fff', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>

                  {/* AI Address Quality Heuristic (Pillar 1) */}
                  <div>
                    <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8' }}>Delivery Address</label>
                      <span style={{ background: addrScore.bg, color: addrScore.color, padding: '2px 8px', borderRadius: 10, fontSize: '0.7rem', fontWeight: 700 }}>
                        {addrScore.label}
                      </span>
                    </div>
                    <textarea 
                      rows={3}
                      value={editingOrder.address || ''} 
                      onChange={e => setEditingOrder({ ...editingOrder, address: e.target.value })}
                      onBlur={() => updateOrderField && updateOrderField(editingOrder.id, 'address', editingOrder.address)}
                      style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: 12, padding: '10px 12px', color: '#fff', fontSize: '0.85rem', outline: 'none', resize: 'none', boxSizing: 'border-box' }}
                    />
                    <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Ensure sector, street, and house number are present.</span>
                      <button 
                        onClick={handleAddressCleanse} 
                        style={{ background: '#6366f120', color: '#818cf8', border: '1px solid #6366f140', padding: '6px 12px', borderRadius: 10, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                      >
                        ✨ AI Address Cleanse
                      </button>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>City</label>
                    <input 
                      value={editingOrder.city || ''} 
                      onChange={e => setEditingOrder({ ...editingOrder, city: e.target.value })}
                      onBlur={() => updateOrderField && updateOrderField(editingOrder.id, 'city', editingOrder.city)}
                      style={{ width: '50%', background: '#0f172a', border: '1px solid #334155', borderRadius: 12, padding: '10px 12px', color: '#fff', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              </div>

              {/* Right Side: WhatsApp Verification Hub & Notes */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff', borderBottom: '1px solid #334155', paddingBottom: 12 }}>💬 WhatsApp Success Hub</div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8' }}>Simulate Interactive Customer Actions</label>
                    <button 
                      onClick={() => handleWaSimulate('SEND_VERIFICATION')} 
                      disabled={waSimulating}
                      style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 12, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', gap: 8 }}
                    >
                      <span>📲 Send Verification WA Template</span>
                    </button>
                    <button 
                      onClick={() => handleWaSimulate('SIMULATE_CONFIRM')} 
                      disabled={waSimulating}
                      style={{ background: '#10b981', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 12, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', gap: 8 }}
                    >
                      <span>✅ Simulate Customer Confirm</span>
                    </button>
                    <button 
                      onClick={() => handleWaSimulate('SIMULATE_CANCEL')} 
                      disabled={waSimulating}
                      style={{ background: '#f43f5e', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 12, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', gap: 8 }}
                    >
                      <span>❌ Simulate Customer Cancel</span>
                    </button>
                  </div>

                  <div style={{ borderTop: '1px solid #334155', paddingTop: 16, marginTop: 8 }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', marginBottom: 8 }}>📝 Shopify Customer Notes</label>
                    <textarea 
                      rows={4} 
                      value={editingOrder.notes || ''} 
                      onChange={e => setEditingOrder({ ...editingOrder, notes: e.target.value })}
                      onBlur={() => updateOrderField && updateOrderField(editingOrder.id, 'notes', editingOrder.notes)}
                      style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: 12, padding: '10px 12px', color: '#fff', fontSize: '0.85rem', outline: 'none', resize: 'none', boxSizing: 'border-box' }}
                      placeholder="Enter customer notes..."
                    />
                    <p style={{ fontSize: '0.7rem', color: '#64748b', margin: '4px 0 0' }}>Notes sync live with Shopify.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Courier Logistics & Timeline */}
          {activeTab === 'logistics' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 28 }}>
              
              {/* Left Side: Live Tracking Timeline */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', paddingBottom: 12 }}>
                    <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff' }}>🚚 Live Courier Tracking Timeline</span>
                    <span style={{ fontSize: '0.75rem', color: '#818cf8', fontWeight: 700, background: '#6366f120', padding: '4px 12px', borderRadius: 20 }}>
                      {editingOrder.courier || 'Standard Courier'}
                    </span>
                  </div>

                  {trackingLoading ? (
                    <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>⏳ Loading live courier milestones...</div>
                  ) : trackingData?.milestones ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingLeft: 12 }}>
                      {trackingData.milestones.map((m, idx) => (
                        <div key={m.status} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: m.done ? (m.isError ? '#4c0519' : '#1e1b4b') : '#0f172a', border: `2px solid ${m.done ? (m.isError ? '#f43f5e' : '#6366f1') : '#334155'}`, display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', fontSize: '0.8rem', flexShrink: 0 }}>
                            {m.done ? (m.isError ? '⚠️' : '✓') : ''}
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: m.done ? (m.isError ? '#f43f5e' : '#fff') : '#64748b' }}>{m.label}</h4>
                              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{m.date}</span>
                            </div>
                            <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
                              {m.status === 'Booked' && `Tracking #: ${editingOrder.tracking_number || 'Pending'}`}
                              {m.status === 'In Transit' && 'Package is moving through courier logistics network.'}
                              {m.status === 'Out for Delivery' && 'Rider is out for delivery. Keep phone available.'}
                              {m.status === 'Attempted' && `Attempt failed. Reason: ${editingOrder.cs_notes || 'Customer unavailable'}`}
                              {m.status === 'Delivered' && 'Shipment delivered successfully.'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                      <p style={{ margin: 0, fontSize: '0.9rem' }}>No tracking timeline available. Book courier to generate milestones.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Side: 1-Click Courier Booking Controls */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff', borderBottom: '1px solid #334155', paddingBottom: 12 }}>🚀 Instant Courier Booking</div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8' }}>Assign & Generate Tracking Number</label>
                    <button 
                      onClick={() => handleBookCourier('PostEx')} 
                      disabled={bookingCourier}
                      style={{ background: '#0f172a', color: '#fff', border: '1px solid #6366f1', padding: '12px 16px', borderRadius: 12, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyItems: 'space-between', justifyContent: 'space-between' }}
                    >
                      <span>🚀 Book with PostEx</span>
                      <span style={{ fontSize: '0.75rem', color: '#818cf8' }}>API Active</span>
                    </button>
                    <button 
                      onClick={() => handleBookCourier('Instaworld')} 
                      disabled={bookingCourier}
                      style={{ background: '#0f172a', color: '#fff', border: '1px solid #10b981', padding: '12px 16px', borderRadius: 12, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyItems: 'space-between', justifyContent: 'space-between' }}
                    >
                      <span>🚀 Book with Instaworld</span>
                      <span style={{ fontSize: '0.75rem', color: '#34d399' }}>API Active</span>
                    </button>
                    <button 
                      onClick={() => handleBookCourier('Leopards')} 
                      disabled={bookingCourier}
                      style={{ background: '#0f172a', color: '#fff', border: '1px solid #f59e0b', padding: '12px 16px', borderRadius: 12, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyItems: 'space-between', justifyContent: 'space-between' }}
                    >
                      <span>🚀 Book with Leopards</span>
                      <span style={{ fontSize: '0.75rem', color: '#fbbf24' }}>API Active</span>
                    </button>
                  </div>

                  {editingOrder.tracking_number && (
                    <div style={{ borderTop: '1px solid #334155', paddingTop: 16, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Assigned Tracking Number:</div>
                      <div style={{ background: '#0f172a', border: '1px solid #334155', padding: '10px 14px', borderRadius: 12, fontSize: '1rem', fontMono: true, fontWeight: 800, color: '#6366f1', textAlign: 'center' }}>
                        {editingOrder.tracking_number}
                      </div>
                      <a 
                        href={`/track/${editingOrder.tracking_slug || 'tr_mock_slug'}`} 
                        target="_blank" 
                        rel="noreferrer"
                        style={{ background: '#6366f1', color: '#fff', padding: '10px 16px', borderRadius: 12, fontSize: '0.8rem', fontWeight: 700, textDecoration: 'none', textAlign: 'center', display: 'block', boxShadow: '0 4px 12px rgba(99,102,241,0.3)' }}
                      >
                        🌐 Open Public Tracking Portal
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Pillar 2: Smart Auto-Complete Product Search Popover/Modal */}
          {showProductSearch && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.98)', zIndex: 3000, display: 'flex', flexDirection: 'column', padding: 32, backdropFilter: 'blur(12px)' }}>
              <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', paddingBottom: 16, marginBottom: 20 }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#fff' }}>🔍 Smart Auto-Complete Product Selector</h3>
                <button onClick={() => setShowProductSearch(false)} style={{ background: '#334155', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 10, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>✕ Close</button>
              </div>

              <input 
                type="text" 
                placeholder="Search master products by Title or SKU..." 
                value={productSearchQuery}
                onChange={e => setProductSearchQuery(e.target.value)}
                style={{ width: '100%', background: '#0f172a', border: '2px solid #6366f1', borderRadius: 16, padding: '14px 20px', color: '#fff', fontSize: '1rem', outline: 'none', marginBottom: 20, boxSizing: 'border-box' }}
                autoFocus
              />

              <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {filteredProducts.map(mp => (
                  <div key={mp.id || mp.sku} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', justifyItems: 'space-between', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', marginBottom: 4 }}>{mp.parent_title}</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 8 }}>{mp.variant_title || 'Default'} • SKU: {mp.sku || '—'}</div>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                        <span style={{ background: '#10b98120', color: '#10b981', padding: '2px 8px', borderRadius: 10, fontSize: '0.7rem', fontWeight: 700 }}>
                          📦 Stock: {mp.inventory_qty ?? mp.stock ?? 10}
                        </span>
                        <span style={{ background: '#6366f120', color: '#818cf8', padding: '2px 8px', borderRadius: 10, fontSize: '0.7rem', fontWeight: 700 }}>
                          Cost: Rs {parseFloat(mp.unit_cost ?? mp.landed_cost ?? 0).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        setLocalItems([
                          ...localItems, 
                          { 
                            id: Date.now(), 
                            sku: mp.sku, 
                            title: mp.parent_title, 
                            variant_title: mp.variant_title || 'Default Title',
                            quantity: 1, 
                            price: mp.selling_price || mp.unit_cost || 1000,
                            image_url: mp.image_url
                          }
                        ]);
                        setShowProductSearch(false);
                      }}
                      style={{ width: '100%', background: '#6366f1', color: '#fff', border: 'none', padding: '10px 0', borderRadius: 12, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(99,102,241,0.3)' }}
                    >
                      + Add to Order
                    </button>
                  </div>
                ))}
                {!filteredProducts.length && (
                  <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: '#64748b' }}>
                    <p style={{ margin: 0, fontSize: '1rem' }}>No master products match your search query.</p>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Sticky Bottom Action Bar */}
        <div style={{ padding: '16px 28px', borderTop: '1px solid #334155', background: '#1e293b', display: 'flex', alignItems: 'center', justifyItems: 'space-between', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
            <span>Editing Store Order • </span>
            <span style={{ color: '#fff', fontWeight: 700 }}>{editingOrder.customer_name}</span>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button 
              onClick={() => handleBookCourier(editingOrder.courier || 'PostEx')} 
              disabled={bookingCourier}
              style={{ background: '#0f172a', color: '#6366f1', border: '1px solid #6366f1', padding: '10px 20px', borderRadius: 12, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}
            >
              🚀 Book Courier
            </button>
            <button 
              onClick={() => window.print()} 
              style={{ background: '#0f172a', color: '#10b981', border: '1px solid #10b981', padding: '10px 20px', borderRadius: 12, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}
            >
              🖨️ Print Packing Slip
            </button>
            <button 
              onClick={handleCSUpdate} 
              disabled={isSavingCS}
              style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 12, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(99,102,241,0.3)' }}
            >
              {isSavingCS ? '⏳ Saving...' : '💾 Save Changes'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
