import React, { useState, useEffect } from 'react';
import useOrderManagement from '../hooks/useOrderManagement';
import OrderHeader from './OrderHeader';
import ItemsList from './ItemsList';
import PaymentSummary from './PaymentSummary';
import CourierBooking from './CourierBooking';
import { useApp } from '../context/AppContext';

export default function EditOrderModal({
  editingOrder,
  setEditingOrder,
  editorLoading,
  fetchOrderDetails,
  updateOrderField,
  isCityValid
}) {
  const management = useOrderManagement({
    editingOrder,
    setEditingOrder,
    fetchOrderDetails,
    updateOrderField
  });

  const {
    getMediaUrlWithToken,
    activeTab,
    setActiveTab,
    localItems,
    setLocalItems,
    localDiscount,
    setLocalDiscount,
    localNotes,
    setLocalNotes,
    isSavingCS,
    custIntel,
    custIntelLoading,
    waSimulating,
    sendingImages,
    masterProducts,
    showProductSearch,
    setShowProductSearch,
    productSearchQuery,
    setProductSearchQuery,
    bookingCourier,
    trackingData,
    trackingLoading,
    chatMessages,
    chatLoading,
    botStatus,
    newWaMsg,
    setNewWaMsg,
    sendingWaMsg,
    isTyping,
    fileInputRef,
    quickReplies,
    showQuickReplyPanel,
    setShowQuickReplyPanel,
    quickReplyTitle,
    setQuickReplyTitle,
    quickReplyCaption,
    setQuickReplyCaption,
    quickReplyMedia,
    setQuickReplyMedia,
    showTemplateCreator,
    setShowTemplateCreator,
    isUploadingMedia,
    quickPills,
    showPillsManager,
    setShowPillsManager,
    newPillText,
    setNewPillText,
    isRecording,
    recordingSeconds,
    chatSearchQuery,
    setChatSearchQuery,
    sendingInvoice,
    handleCreateQuickPill,
    handleDeleteQuickPill,
    startRecording,
    stopRecording,
    handleSendInvoice,
    handleSendQuickReply,
    handleCreateQuickReply,
    handleDeleteQuickReply,
    handleSendWaMessage,
    handleFileAttach,
    handleCSUpdate,
    handleWaSimulate,
    handleSendItemImages,
    handleAddressCleanse,
    handleBookCourier,
    liveSubtotal,
    liveTotal,
    totalOrderCost,
    netProfit,
    profitMargin,
    filteredGroups,
    addrScore
  } = management;

  const { addToast } = useApp();
  const [waTemplates, setWATemplates] = useState([]);

  useEffect(() => {
    if (editingOrder) {
      fetch('/api/whatsapp/templates', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token') || localStorage.getItem('token') || ''}` }
      })
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) setWATemplates(data);
        })
        .catch(err => console.error('Failed to fetch templates:', err));
    }
  }, [editingOrder]);

  if (!editingOrder) return null;

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
        body: JSON.stringify({ order_id: editingOrder.id })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast("✅ Auto COD confirmation message triggered successfully!", "success");
      } else {
        addToast(`❌ Failed to trigger Auto COD: ${data.error || 'Unknown error'}`, "error");
      }
    } catch (err) {
      addToast(`❌ Failed to trigger Auto COD: ${err.message || err}`, "error");
    }
  };

  const handleManualAction = (e) => {
    const actionValue = e.target.value;
    if (!actionValue) return;

    const formattedPhone = editingOrder.phone || '';
    const name = editingOrder.customer_name || 'Customer';
    const orderId = editingOrder.ref_number || editingOrder.shopify_order_id;
    const price = Math.round(parseFloat(editingOrder.price) || 0);

    if (actionValue === 'manual_cod') {
      e.target.value = ""; // Reset
      const manualConfirmMsg = `Assalam o Alaikum ${name}, please confirm your order #${orderId} of Rs. ${price}. Reply 1 to Confirm, 2 to Cancel.`;
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

      const courier = editingOrder.courier || 'our courier';
      const tracking = editingOrder.tracking_number || '';
      
      let msg = template.content
         .replace(/\[Name\]/g, name)
         .replace(/\[OrderID\]/g, orderId)
         .replace(/\[Price\]/g, price)
         .replace(/\[Courier\]/g, courier)
         .replace(/\[Tracking\]/g, tracking)
         .replace(/\[Address\]/g, editingOrder.address || 'N/A')
         .replace(/\[City\]/g, editingOrder.city || 'N/A')
         .replace(/\[Phone\]/g, editingOrder.phone || 'N/A')
         .replace(/\[Products\]/g, editingOrder.product_titles || 'N/A')
         .replace(/\[RefNumber\]/g, editingOrder.ref_number || 'N/A')
         .replace(/\[ItemsCount\]/g, editingOrder.items_count || '0');

      if (editingOrder.confirmation_token) {
        const appUrl = window.location.origin;
        const link = `${appUrl}/api/public/confirm-order/${editingOrder.confirmation_token}`;
        msg = msg.replace(/\[Link\]/g, link);
      } else {
        msg = msg.replace(/\[Link\]/g, '(Confirm on call)');
      }

      let imageUrls = [];
      try {
        const items = JSON.parse(editingOrder.line_items || '[]');
        imageUrls = items.map(i => i.image_url).filter(Boolean);
      } catch (e) {}

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
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(8px)', fontFamily: 'sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 1200, maxHeight: '92vh', background: '#0f172a', border: '1px solid #334155', borderRadius: 24, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'slideUp 0.3s ease-out' }}>
        
        {/* Render OrderHeader (includes risk banner, basic info, badges) */}
        <OrderHeader
          editingOrder={editingOrder}
          setEditingOrder={setEditingOrder}
          editorLoading={editorLoading}
          custIntel={custIntel}
          handleWaSimulate={handleWaSimulate}
          waSimulating={waSimulating}
        >
          {/* Navigation Tabs */}
          <div style={{ display: 'flex', gap: 8, borderBottom: 'none' }}>
            <button 
              type="button"
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
              type="button"
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
              type="button"
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
            <button 
              type="button"
              onClick={() => setActiveTab('whatsapp_chat')}
              style={{ 
                padding: '12px 20px', 
                background: activeTab === 'whatsapp_chat' ? '#0f172a' : 'transparent', 
                color: activeTab === 'whatsapp_chat' ? '#6366f1' : '#94a3b8', 
                borderTopLeftRadius: 16, 
                borderTopRightRadius: 16, 
                border: activeTab === 'whatsapp_chat' ? '1px solid #334155' : 'none', 
                borderBottom: 'none', 
                fontWeight: 700, 
                fontSize: '0.85rem', 
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <span>💬</span>
              <span>Live WhatsApp Chat</span>
            </button>
          </div>
        </OrderHeader>

        {/* Modal Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 28, background: '#0f172a', color: '#f1f5f9', position: 'relative' }}>
          
          {/* TAB 1: Line Items & Financials */}
          {activeTab === 'financials' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 28 }}>
              {/* Left Side: Line Items List */}
              <ItemsList
                localItems={localItems}
                setLocalItems={setLocalItems}
                masterProducts={masterProducts}
                showProductSearch={showProductSearch}
                setShowProductSearch={setShowProductSearch}
                productSearchQuery={productSearchQuery}
                setProductSearchQuery={setProductSearchQuery}
                filteredGroups={filteredGroups}
              />

              {/* Right Side: Financials & Profitability Summary */}
              <PaymentSummary
                liveSubtotal={liveSubtotal}
                localDiscount={localDiscount}
                setLocalDiscount={setLocalDiscount}
                courierFee={editingOrder.courier_fee || 250}
                setCourierFee={(val) => setEditingOrder({ ...editingOrder, courier_fee: val })}
                liveTotal={liveTotal}
                totalOrderCost={totalOrderCost}
                netProfit={netProfit}
                profitMargin={profitMargin}
                localNotes={localNotes}
                setLocalNotes={setLocalNotes}
              />
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

                  {/* AI Address Quality Heuristic */}
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
                        type="button"
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
                
                {/* 1. WhatsApp Native App Actions (Manual Dispatch) */}
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff', borderBottom: '1px solid #334155', paddingBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '1.1rem' }}>💬</span> WhatsApp Native App (Manual)
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <select 
                      onChange={handleManualAction}
                      defaultValue=""
                      style={{ 
                        width: '100%', 
                        background: '#0f172a', 
                        border: '1px solid #334155', 
                        borderRadius: 12, 
                        padding: '10px 12px', 
                        color: '#fff', 
                        fontSize: '0.85rem', 
                        outline: 'none', 
                        cursor: 'pointer',
                        boxSizing: 'border-box',
                        transition: 'border-color 0.2s, box-shadow 0.2s'
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#6366f1';
                        e.target.style.boxShadow = '0 0 0 2px rgba(99, 102, 241, 0.2)';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#334155';
                        e.target.style.boxShadow = 'none';
                      }}
                    >
                      <option value="" disabled>Select template / manual action...</option>
                      <option value="manual_cod">Manual COD Confirm</option>
                      {waTemplates.length > 0 && (
                        <optgroup label="Saved WhatsApp Templates">
                          {waTemplates.map(t => (
                            <option key={t.id} value={`template_${t.id}`}>{t.name}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8', lineHeight: '1.4' }}>
                      Launches your device's native WhatsApp desktop or mobile client with custom variables pre-filled.
                    </span>
                  </div>
                </div>

                {/* 2. Baileys WebSocket API Actions (Auto Dispatch) */}
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff', borderBottom: '1px solid #334155', paddingBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '1.1rem' }}>⚡</span> WhatsApp API Actions (Auto)
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <button 
                      type="button"
                      onClick={handleAutoCODConfirm}
                      style={{ 
                        background: '#5b21b6', 
                        color: '#fff', 
                        border: 'none', 
                        padding: '12px 14px', 
                        borderRadius: 12, 
                        fontSize: '0.78rem', 
                        fontWeight: 700, 
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        transition: 'transform 0.1s, opacity 0.2s, background-color 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#6d28d9';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#5b21b6';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      <span>🚀 Auto COD Confirm</span>
                    </button>
                    
                    <button 
                      type="button"
                      onClick={handleSendItemImages} 
                      disabled={sendingImages || waSimulating}
                      style={{ 
                        background: 'linear-gradient(135deg, #a855f7, #ec4899)', 
                        color: '#fff', 
                        border: 'none', 
                        padding: '12px 14px', 
                        borderRadius: 12, 
                        fontSize: '0.78rem', 
                        fontWeight: 700, 
                        cursor: 'pointer', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        gap: 6,
                        transition: 'transform 0.1s, opacity 0.2s',
                        opacity: (sendingImages || waSimulating) ? 0.7 : 1
                      }}
                      onMouseEnter={(e) => {
                        if (!sendingImages && !waSimulating) {
                          e.currentTarget.style.transform = 'translateY(-1px)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!sendingImages && !waSimulating) {
                          e.currentTarget.style.transform = 'translateY(0)';
                        }
                      }}
                    >
                      <span>{sendingImages ? '⏳ Sending...' : '📸 Send Images'}</span>
                    </button>
                  </div>

                  {/* Simulation Sub-Panel */}
                  <div style={{ marginTop: 4, background: '#0f172a', padding: '14px', borderRadius: 12, border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>API Simulation Actions</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <button 
                        type="button"
                        onClick={() => handleWaSimulate('SEND_VERIFICATION')} 
                        disabled={waSimulating}
                        style={{ 
                          background: '#3b82f620', 
                          color: '#60a5fa', 
                          border: '1px solid #3b82f640', 
                          padding: '10px 12px', 
                          borderRadius: 8, 
                          fontSize: '0.75rem', 
                          fontWeight: 600, 
                          cursor: 'pointer', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          gap: 6,
                          transition: 'background-color 0.2s, border-color 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#3b82f630';
                          e.currentTarget.style.borderColor = '#3b82f660';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = '#3b82f620';
                          e.currentTarget.style.borderColor = '#3b82f640';
                        }}
                      >
                        📲 Send Verification WA Template
                      </button>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <button 
                          type="button"
                          onClick={() => handleWaSimulate('SIMULATE_CONFIRM')} 
                          disabled={waSimulating}
                          style={{ 
                            background: '#10b98120', 
                            color: '#34d399', 
                            border: '1px solid #10b98140', 
                            padding: '10px 12px', 
                            borderRadius: 8, 
                            fontSize: '0.75rem', 
                            fontWeight: 600, 
                            cursor: 'pointer', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            gap: 6,
                            transition: 'background-color 0.2s, border-color 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#10b98130';
                            e.currentTarget.style.borderColor = '#10b98160';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = '#10b98120';
                            e.currentTarget.style.borderColor = '#10b98140';
                          }}
                        >
                          ✅ Confirm
                        </button>
                        <button 
                          type="button"
                          onClick={() => handleWaSimulate('SIMULATE_CANCEL')} 
                          disabled={waSimulating}
                          style={{ 
                            background: '#f43f5e20', 
                            color: '#f87171', 
                            border: '1px solid #f43f5e40', 
                            padding: '10px 12px', 
                            borderRadius: 8, 
                            fontSize: '0.75rem', 
                            fontWeight: 600, 
                            cursor: 'pointer', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            gap: 6,
                            transition: 'background-color 0.2s, border-color 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#f43f5e30';
                            e.currentTarget.style.borderColor = '#f43f5e60';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = '#f43f5e20';
                            e.currentTarget.style.borderColor = '#f43f5e40';
                          }}
                        >
                          ❌ Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Shopify Customer Notes */}
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff', borderBottom: '1px solid #334155', paddingBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '1.1rem' }}>📝</span> Shopify Customer Notes
                  </div>
                  <textarea 
                    rows={4} 
                    value={editingOrder.notes || ''} 
                    onChange={e => setEditingOrder({ ...editingOrder, notes: e.target.value })}
                    style={{ 
                      width: '100%', 
                      background: '#0f172a', 
                      border: '1px solid #334155', 
                      borderRadius: 12, 
                      padding: '10px 12px', 
                      color: '#fff', 
                      fontSize: '0.85rem', 
                      outline: 'none', 
                      resize: 'none', 
                      boxSizing: 'border-box',
                      transition: 'border-color 0.2s, box-shadow 0.2s'
                    }}
                    placeholder="Enter customer notes..."
                    onFocus={(e) => {
                      e.target.style.borderColor = '#6366f1';
                      e.target.style.boxShadow = '0 0 0 2px rgba(99, 102, 241, 0.2)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#334155';
                      e.target.style.boxShadow = 'none';
                      updateOrderField && updateOrderField(editingOrder.id, 'notes', editingOrder.notes);
                    }}
                  />
                  <p style={{ fontSize: '0.7rem', color: '#64748b', margin: '4px 0 0' }}>Notes sync live with Shopify.</p>
                </div>

              </div>
            </div>
          )}

          {/* TAB 3: Courier Logistics & Timeline */}
          {activeTab === 'logistics' && (
            <CourierBooking
              courier={editingOrder.courier}
              trackingNumber={editingOrder.tracking_number}
              trackingSlug={editingOrder.tracking_slug}
              trackingLoading={trackingLoading}
              trackingData={trackingData}
              bookingCourier={bookingCourier}
              handleBookCourier={handleBookCourier}
            />
          )}

          {/* TAB 4: Live WhatsApp Chat */}
          {activeTab === 'whatsapp_chat' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 28, height: 'calc(100vh - 340px)', minHeight: 500 }}>
              {/* Left Side: Active Chat Window */}
              <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 20, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)' }}>
                {/* Chat Header */}
                <div style={{ padding: '16px 24px', borderBottom: '1px solid #334155', background: '#0f172a', display: 'flex', alignItems: 'center', justifyItems: 'space-between', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#6366f120', border: '1px solid #6366f1', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                      👤
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>{editingOrder.customer_name}</span>
                        {editingOrder.wa_verification_status && (
                          <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 10, background: editingOrder.wa_verification_status?.toLowerCase() === 'verified' ? '#10b98120' : editingOrder.wa_verification_status === 'Cancelled' ? '#ef444420' : '#f59e0b20', color: editingOrder.wa_verification_status?.toLowerCase() === 'verified' ? '#10b981' : editingOrder.wa_verification_status === 'Cancelled' ? '#ef4444' : '#f59e0b', fontWeight: 'bold' }}>
                            {editingOrder.wa_verification_status}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>+{(editingOrder.phone || '').replace(/^\+/, '')} • Baileys WebSocket: {botStatus === 'CONNECTED' ? '🟢 Active' : (botStatus === 'DISABLED' ? '🛑 Disabled locally' : '🔴 Disconnected (Refresh Required)')}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    {/* Inline Verification Status Buttons */}
                    <div style={{ display: 'flex', gap: 6, background: '#1e293b', padding: '4px 8px', borderRadius: 12, border: '1px solid #334155' }}>
                      <button 
                        type="button"
                        onClick={() => handleWaSimulate('SIMULATE_CONFIRM')}
                        disabled={waSimulating}
                        style={{ background: '#10b98120', color: '#10b981', border: 'none', borderRadius: 8, padding: '4px 8px', fontSize: '0.7rem', fontWeight: 'bold', cursor: 'pointer' }}
                        title="Confirm Verification Status"
                      >
                        Confirm ✅
                      </button>
                      <button 
                        type="button"
                        onClick={() => handleWaSimulate('SIMULATE_CANCEL')}
                        disabled={waSimulating}
                        style={{ background: '#ef444420', color: '#ef4444', border: 'none', borderRadius: 8, padding: '4px 8px', fontSize: '0.7rem', fontWeight: 'bold', cursor: 'pointer' }}
                        title="Cancel Order via WA"
                      >
                        Cancel ❌
                      </button>
                    </div>

                    {/* Chat Keyword Search Box */}
                    <input 
                      type="text" 
                      placeholder="🔍 Search messages..."
                      value={chatSearchQuery}
                      onChange={e => setChatSearchQuery(e.target.value)}
                      style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '6px 12px', color: '#fff', fontSize: '0.75rem', outline: 'none', width: 140 }}
                    />

                    <button 
                      type="button"
                      onClick={() => {
                        const apiBase = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
                        fetch(`${apiBase}/api/whatsapp-governance/chat/${editingOrder.id}/fetch-history`, { method: 'POST', headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` } })
                          .then(r => r.json())
                          .then(data => { if (data.messages) setChatMessages(data.messages); })
                          .catch(() => {});
                      }} 
                      style={{ background: '#10b98120', color: '#10b981', border: '1px solid #10b981', padding: '6px 14px', borderRadius: 10, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      📂 Fetch History
                    </button>
                    <button 
                      type="button"
                      onClick={() => {
                        const apiBase = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
                        fetch(`${apiBase}/api/whatsapp-governance/chat/${editingOrder.id}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` } })
                          .then(r => r.json())
                          .then(data => { if (data.messages) setChatMessages(data.messages); })
                          .catch(() => {});
                      }} 
                      style={{ background: '#334155', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 10, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                    >
                      🔄 Refresh
                    </button>
                  </div>
                </div>

                {/* Chat Messages Area */}
                <div style={{ flex: 1, padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {chatLoading ? (
                    <div style={{ margin: 'auto', color: '#94a3b8', fontSize: '0.9rem' }}>⏳ Loading chat history from database...</div>
                  ) : chatMessages.length > 0 ? (
                    chatMessages.map(msg => {
                      const isOutgoing = msg.direction === 'outgoing';
                      return (
                        <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isOutgoing ? 'flex-end' : 'flex-start', alignSelf: isOutgoing ? 'flex-end' : 'flex-start', maxWidth: '75%' }}>
                          <div style={{ 
                            background: isOutgoing ? '#10b981' : '#334155', 
                            color: '#fff', 
                            padding: '12px 18px', 
                            borderRadius: 20, 
                            borderBottomRightRadius: isOutgoing ? 4 : 20, 
                            borderBottomLeftRadius: isOutgoing ? 20 : 4,
                            fontSize: '0.9rem',
                            lineHeight: 1.5,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                          }}>
                            {msg.media_url && (
                              <div style={{ marginBottom: 8 }}>
                                {msg.media_type === 'image' && <img src={getMediaUrlWithToken(msg.media_url)} style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8 }} />}
                                {msg.media_type === 'video' && <video src={getMediaUrlWithToken(msg.media_url)} controls style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8 }} />}
                                {(msg.media_type === 'audio' || msg.media_type === 'voice') && <audio src={getMediaUrlWithToken(msg.media_url)} controls style={{ maxWidth: 220 }} />}
                                {msg.media_type === 'document' && <a href={getMediaUrlWithToken(msg.media_url)} target="_blank" rel="noreferrer" style={{ color: '#fff', textDecoration: 'underline', fontWeight: 'bold' }}>📎 View Document</a>}
                              </div>
                            )}
                            {(() => {
                              const rawText = msg.message?.replace(/\[(IMAGE|AUDIO|VIDEO|DOCUMENT)\]\s*/i, '') || '';
                              if (!chatSearchQuery || !chatSearchQuery.trim()) return rawText;
                              const parts = rawText.split(new RegExp(`(${chatSearchQuery.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')})`, 'gi'));
                              return parts.map((part, i) => 
                                part.toLowerCase() === chatSearchQuery.toLowerCase() 
                                  ? <mark key={i} style={{ background: '#f59e0b', color: '#000', padding: '1px 3px', borderRadius: 4, fontWeight: 'bold' }}>{part}</mark> 
                                  : part
                              );
                            })()}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 4, padding: '0 6px' }}>
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {isOutgoing ? (msg.status === 'sent' ? '✓ Sent' : '✓✓ Delivered') : 'Customer'}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ margin: 'auto', textAlign: 'center', color: '#64748b', padding: 40 }}>
                      <p style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>No messages found for +{(editingOrder.phone || '').replace(/^\+/, '')}</p>
                      <p style={{ fontSize: '0.8rem', margin: 0 }}>Start the conversation by typing a message below or clicking a quick reply pill!</p>
                    </div>
                  )}
                  {isTyping && (
                    <div style={{ alignSelf: 'flex-start', background: '#334155', color: '#fff', padding: '8px 16px', borderRadius: 20, fontSize: '0.85rem', fontStyle: 'italic', opacity: 0.8 }}>
                      Customer is typing...
                    </div>
                  )}
                  <div id="chat-end" />
                </div>

                {/* Quick Reply Pills */}
                <div style={{ padding: '10px 24px', background: '#0f172a', borderTop: '1px solid #334155', display: 'flex', alignItems: 'center', gap: 12, overflowX: 'auto' }}>
                  <div style={{ display: 'flex', gap: 8, overflowX: 'auto', flex: 1 }}>
                    {quickPills.map((pill) => (
                      <button
                        key={pill.id}
                        type="button"
                        onClick={() => handleSendWaMessage(pill.pill_text)}
                        disabled={sendingWaMsg}
                        style={{ 
                          background: '#334155', 
                          color: '#f1f5f9', 
                          border: '1px solid #475569', 
                          padding: '6px 14px', 
                          borderRadius: 16, 
                          fontSize: '0.75rem', 
                          fontWeight: 600, 
                          whiteSpace: 'nowrap',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#475569'}
                        onMouseLeave={e => e.currentTarget.style.background = '#334155'}
                      >
                        ⚡ {pill.pill_text.slice(0, 30)}...
                      </button>
                    ))}
                  </div>
                  <button 
                    type="button"
                    onClick={() => setShowPillsManager(!showPillsManager)}
                    style={{ background: showPillsManager ? '#6366f1' : '#334155', border: 'none', borderRadius: 8, padding: '6px 10px', color: '#fff', fontSize: '0.75rem', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}
                    title="Manage Quick Reply Pills"
                  >
                    ⚙️ Manage Pills
                  </button>
                </div>

                {/* Pills Manager Section */}
                {showPillsManager && (
                  <div style={{ background: '#1e293b', borderTop: '1px solid #334155', padding: '12px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ fontWeight: 800, fontSize: '0.8rem', color: '#fff' }}>⚙️ Manage Quick Reply Pills</div>
                    <form onSubmit={handleCreateQuickPill} style={{ display: 'flex', gap: 8 }}>
                      <input 
                        type="text" 
                        placeholder="Add new quick pill text..."
                        value={newPillText}
                        onChange={e => setNewPillText(e.target.value)}
                        required
                        style={{ flex: 1, background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: '0.8rem', outline: 'none' }}
                      />
                      <button type="submit" style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>Add</button>
                    </form>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                      {quickPills.map(p => (
                        <div key={p.id} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', color: '#fff' }}>
                          <span>{p.pill_text}</span>
                          <button type="button" onClick={() => handleDeleteQuickPill(p.id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}>✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick Reply Selection Overlay */}
                {showQuickReplyPanel && (
                  <div style={{ background: '#1e293b', borderTop: '1px solid #334155', borderBottom: '1px solid #334155', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 300, overflowY: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 800, fontSize: '0.85rem', color: '#fff' }}>⚡ Saved Quick Replies (Templates)</span>
                      <button 
                        type="button"
                        onClick={() => setShowTemplateCreator(!showTemplateCreator)} 
                        style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                      >
                        {showTemplateCreator ? '✕ Close Creator' : '➕ Create New'}
                      </button>
                    </div>

                    {showTemplateCreator && (
                      <form onSubmit={handleCreateQuickReply} style={{ background: '#0f172a', padding: 16, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid #334155' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#6366f1' }}>Create Quick Reply Template</div>
                        <input 
                          type="text" 
                          placeholder="Template Title (e.g. postex_video_guide)"
                          value={quickReplyTitle}
                          onChange={e => setQuickReplyTitle(e.target.value)}
                          required
                          style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: '0.8rem', outline: 'none' }}
                        />
                        <textarea 
                          placeholder="Caption / Message Text (use {{customer_name}} or {{order_id}} for dynamic fields)"
                          value={quickReplyCaption}
                          onChange={e => setQuickReplyCaption(e.target.value)}
                          rows={2}
                          style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: '0.8rem', outline: 'none', resize: 'vertical' }}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Optional Media (Image or Video):</span>
                          <input 
                            type="file" 
                            accept="image/*,video/*"
                            onChange={e => setQuickReplyMedia(e.target.files[0])}
                            style={{ fontSize: '0.75rem', color: '#94a3b8' }}
                          />
                        </div>
                        <button 
                          type="submit" 
                          disabled={sendingWaMsg}
                          style={{ background: '#10b981', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-start' }}
                        >
                          {sendingWaMsg ? 'Saving...' : 'Save Template'}
                        </button>
                      </form>
                    )}

                    {/* Search templates input */}
                    <input 
                      type="text" 
                      placeholder="🔍 Search templates by title/caption..."
                      onChange={(e) => {
                        const q = e.target.value.toLowerCase();
                        const cards = e.currentTarget.nextSibling.childNodes;
                        cards.forEach(card => {
                          const title = card.childNodes[1]?.innerText.toLowerCase() || '';
                          const caption = card.childNodes[3]?.innerText.toLowerCase() || '';
                          if (title.includes(q) || caption.includes(q)) {
                            card.style.display = 'flex';
                          } else {
                            card.style.display = 'none';
                          }
                        });
                      }}
                      style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '6px 12px', color: '#fff', fontSize: '0.75rem', outline: 'none' }}
                    />

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginTop: 4 }}>
                      {quickReplies.length > 0 ? (
                        quickReplies.map(qr => (
                          <div key={qr.id} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, position: 'relative' }}>
                            <button 
                              type="button"
                              onClick={() => handleDeleteQuickReply(qr.id)}
                              style={{ position: 'absolute', top: 8, right: 8, background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.85rem' }}
                              title="Delete"
                            >
                              🗑️
                            </button>
                            <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#fff', paddingRight: 20 }}>{qr.title}</div>
                            
                            {qr.media_url && (
                              <div style={{ width: '100%', height: 80, borderRadius: 6, background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                {qr.media_type === 'image' ? (
                                  <img src={getMediaUrlWithToken(qr.media_url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                                ) : (
                                  <video src={getMediaUrlWithToken(qr.media_url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted preload="metadata" />
                                )}
                              </div>
                            )}
                            
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', maxHeight: 40, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', whiteSpace: 'normal' }}>
                              {qr.caption || '(No caption)'}
                            </div>
                            
                            <button 
                              type="button"
                              onClick={() => handleSendQuickReply(qr.id)}
                              disabled={sendingWaMsg}
                              style={{ background: '#10b98120', color: '#10b981', border: '1px solid #10b98140', borderRadius: 8, padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 'auto' }}
                            >
                              ⚡ Send Template
                            </button>
                          </div>
                        ))
                      ) : (
                        <div style={{ color: '#64748b', fontSize: '0.75rem', padding: '12px 0' }}>No custom media quick replies saved yet. Click "Create New" above to save one.</div>
                      )}
                    </div>
                  </div>
                )}

                {/* Chat Input Bar */}
                <div style={{ padding: '16px 24px', background: '#0f172a', borderTop: '1px solid #334155', display: 'flex', gap: 12, alignItems: 'center' }}>
                  {!isRecording ? (
                    <>
                      <button 
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        style={{ background: '#334155', border: 'none', borderRadius: '50%', width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                        title="Attach File"
                      >
                        📎
                      </button>
                      <button 
                        type="button"
                        onClick={() => setShowQuickReplyPanel(!showQuickReplyPanel)}
                        style={{ background: showQuickReplyPanel ? '#6366f1' : '#334155', color: '#fff', border: 'none', borderRadius: '50%', width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                        title="Quick Reply Templates"
                      >
                        ⚡
                      </button>
                      <button 
                        type="button"
                        onClick={startRecording}
                        style={{ background: '#334155', border: 'none', borderRadius: '50%', width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                        title="Record Voice Note"
                      >
                        🎙️
                      </button>
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        style={{ display: 'none' }} 
                        accept="image/*,video/*,application/pdf,audio/*"
                        onChange={handleFileAttach}
                      />
                      <input 
                        type="text" 
                        placeholder={`Type a message to ${editingOrder.customer_name}...`}
                        value={newWaMsg}
                        onChange={e => setNewWaMsg(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSendWaMessage()}
                        onPaste={(e) => {
                          const items = e.clipboardData?.items;
                          if (!items) return;
                          for (const item of items) {
                            if (item.type.startsWith('image/')) {
                              const file = item.getAsFile();
                              if (file) {
                                const mockEvent = { target: { files: [file] } };
                                handleFileAttach(mockEvent);
                              }
                            }
                          }
                        }}
                        style={{ flex: 1, background: '#1e293b', border: '1px solid #334155', borderRadius: 16, padding: '12px 18px', color: '#fff', fontSize: '0.9rem', outline: 'none' }}
                      />
                    </>
                  ) : (
                    <div style={{ flex: 1, background: '#1e293b', border: '1px solid #334155', borderRadius: 16, padding: '10px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#fff' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1.5s infinite' }} />
                        <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#ef4444' }}>
                          Recording Audio: {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, '0')}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <button 
                          type="button"
                          onClick={() => stopRecording(false)} 
                          style={{ background: '#ef444420', color: '#ef4444', border: '1px solid #ef444440', borderRadius: 8, padding: '4px 12px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                          ✕ Cancel
                        </button>
                        <button 
                          type="button"
                          onClick={() => stopRecording(true)} 
                          style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 8, padding: '4px 12px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                          ✓ Send PTT
                        </button>
                      </div>
                    </div>
                  )}

                  {isUploadingMedia && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#10b98120', borderRadius: 12, border: '1px solid #10b98140', flexShrink: 0 }}>
                      <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 700 }}>📤 Sending...</span>
                    </div>
                  )}
                  
                  {!isRecording && (
                    <button
                      type="button"
                      onClick={() => handleSendWaMessage()}
                      disabled={sendingWaMsg || !newWaMsg.trim()}
                      style={{ 
                        background: '#10b981', 
                        color: '#fff', 
                        border: 'none', 
                        padding: '12px 24px', 
                        borderRadius: 16, 
                        fontSize: '0.9rem', 
                        fontWeight: 700, 
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(16,185,129,0.3)',
                        opacity: (!newWaMsg.trim() || sendingWaMsg) ? 0.5 : 1,
                        flexShrink: 0
                      }}
                    >
                      {sendingWaMsg ? '⏳...' : 'Send 🚀'}
                    </button>
                  )}
                </div>
              </div>

              {/* Right Side: Agent Guidelines & Shortcuts */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* PDF Invoice Button Card */}
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff', borderBottom: '1px solid #334155', paddingBottom: 8 }}>📄 Financial Invoice Actions</div>
                  <button 
                    type="button"
                    onClick={handleSendInvoice}
                    disabled={sendingInvoice}
                    style={{ 
                      background: '#6366f1', 
                      color: '#fff', 
                      border: 'none', 
                      padding: '12px 18px', 
                      borderRadius: 12, 
                      fontSize: '0.85rem', 
                      fontWeight: 700, 
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      boxShadow: '0 4px 12px rgba(99,102,241,0.3)',
                      opacity: sendingInvoice ? 0.7 : 1
                    }}
                  >
                    {sendingInvoice ? '⏳ Generating Invoice...' : '📄 Send PDF Invoice via WA'}
                  </button>
                </div>

                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff', borderBottom: '1px solid #334155', paddingBottom: 12 }}>💡 Agent Best Practices</div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.8, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <li><strong style={{ color: '#fff' }}>Keep it Conversational</strong>: Speak politely and use local vernacular (e.g. Sir/Ma'am).</li>
                    <li><strong style={{ color: '#fff' }}>Instant Quick Replies</strong>: Click any pill above the text box to instantly fire standard delivery updates.</li>
                    <li><strong style={{ color: '#fff' }}>WebSocket Speed</strong>: Messages are sent instantly via Baileys WebSocket without needing WhatsApp Web or Chrome.</li>
                    <li><strong style={{ color: '#fff' }}>Auto-Verification Check</strong>: If the customer replies with "Confirm" or "Yes", the ERP will automatically update the order status to Verified!</li>
                  </ul>
                  <div style={{ background: '#10b98120', border: '1px solid #10b98140', padding: 16, borderRadius: 14, color: '#10b981', fontSize: '0.8rem', fontWeight: 700, marginTop: 8 }}>
                    🔒 100% Safe 1-on-1 Chatting: Manual agent messages carry zero ban risk.
                  </div>
                </div>
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
              type="button"
              onClick={() => handleBookCourier(editingOrder.courier || 'PostEx')} 
              disabled={bookingCourier}
              style={{ background: '#0f172a', color: '#6366f1', border: '1px solid #6366f1', padding: '10px 20px', borderRadius: 12, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}
            >
              🚀 Book Courier
            </button>
            <button 
              type="button"
              onClick={() => window.print()} 
              style={{ background: '#0f172a', color: '#10b981', border: '1px solid #10b981', padding: '10px 20px', borderRadius: 12, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}
            >
              🖨️ Print Packing Slip
            </button>
            <button 
              type="button"
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
