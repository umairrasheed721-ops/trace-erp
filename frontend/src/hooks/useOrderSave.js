import { useState, useEffect, useCallback, useMemo } from 'react';

export default function useOrderSave({
  editingOrder,
  setEditingOrder,
  fetchOrderDetails,
  updateOrderField,
  localItems,
  masterProducts,
  liveSubtotal,
  apiBase,
  activeTab,
  setChatMessages
}) {
  // CS Edit State
  const [localDiscount, setLocalDiscount] = useState(0);
  const [localShippingFee, setLocalShippingFee] = useState(0);
  const [localNotes, setLocalNotes] = useState('');
  const [isSavingCS, setIsSavingCS] = useState(false);

  // Customer Intelligence & WhatsApp Simulation State
  const [custIntel, setCustIntel] = useState({ total: 0, delivered: 0, returned: 0, rto_rate: 0, blacklist: false });
  const [custIntelLoading, setCustIntelLoading] = useState(false);
  const [waSimulating, setWaSimulating] = useState(false);
  const [sendingImages, setSendingImages] = useState(false);

  // Logistics & Live Tracking State
  const [bookingCourier, setBookingCourier] = useState(false);
  const [trackingData, setTrackingData] = useState(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [sendingInvoice, setSendingInvoice] = useState(false);

  // Live Math & Profit Margins
  const liveTotal = useMemo(() => {
    return Math.max(0, liveSubtotal - parseFloat(localDiscount || 0) + parseFloat(localShippingFee || 0));
  }, [liveSubtotal, localDiscount, localShippingFee]);

  const totalOrderCost = useMemo(() => {
    let total = 0;
    localItems.forEach(item => {
      const matched = masterProducts.find(mp => mp.sku === item.sku || mp.parent_title === item.title);
      const unitCost = matched?.unit_cost || matched?.landed_cost || 0;
      total += (parseFloat(unitCost) * (parseInt(item.quantity) || 1));
    });
    return total;
  }, [localItems, masterProducts]);

  const netProfit = useMemo(() => {
    return liveTotal - totalOrderCost - parseFloat(editingOrder?.courier_fee || 0);
  }, [liveTotal, totalOrderCost, editingOrder?.courier_fee]);

  const profitMargin = useMemo(() => {
    return liveTotal > 0 ? Math.round((netProfit / liveTotal) * 100) : 0;
  }, [liveTotal, netProfit]);

  const handleCSUpdate = useCallback(async () => {
    setIsSavingCS(true);
    try {
      const subtotal = localItems.reduce((acc, item) => acc + (parseFloat(item.price) * parseInt(item.quantity)), 0);
      const newPrice = Math.max(0, subtotal - parseFloat(localDiscount || 0) + parseFloat(localShippingFee || 0));
      
      const res = await fetch(`${apiBase}/api/orders/${editingOrder.id}/cs-update`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('trace_token')}`
        },
        body: JSON.stringify({
          line_items: localItems,
          price: newPrice,
          discount_amount: parseFloat(localDiscount || 0),
          shipping_fee: parseFloat(localShippingFee || 0),
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
  }, [apiBase, localItems, localDiscount, localShippingFee, localNotes, editingOrder, setEditingOrder]);

  const handleWaSimulate = useCallback((action) => {
    setWaSimulating(true);
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
        if (action === 'SIMULATE_CONFIRM') setEditingOrder({ ...editingOrder, wa_verification_status: 'verified' });
        if (action === 'SIMULATE_CANCEL') setEditingOrder({ ...editingOrder, wa_verification_status: 'Cancelled' });
        if (action === 'SEND_VERIFICATION') setEditingOrder({ ...editingOrder, wa_verification_status: 'Pending' });
      })
      .catch(err => {
        setWaSimulating(false);
        alert(err.message || 'WhatsApp simulation failed');
      });
  }, [apiBase, editingOrder, fetchOrderDetails, setEditingOrder]);

  const handleSendItemImages = useCallback(async () => {
    setSendingImages(true);
    try {
      const res = await fetch(`${apiBase}/api/whatsapp-governance/chat/${editingOrder.id}/send-images`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('trace_token')}`
        }
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        if (activeTab === 'whatsapp_chat') {
          const chatRes = await fetch(`${apiBase}/api/whatsapp-governance/chat/${editingOrder.id}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
          });
          const chatData = await chatRes.json();
          if (chatData.messages) setChatMessages(chatData.messages);
        }
      } else {
        alert(data.error || 'Failed to send item images.');
      }
    } catch (err) {
      alert('Network error sending item images.');
    } finally {
      setSendingImages(false);
    }
  }, [apiBase, editingOrder, activeTab, setChatMessages]);

  const handleAddressCleanse = useCallback(() => {
    if (!editingOrder?.address) return;
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
  }, [editingOrder, setEditingOrder, updateOrderField]);

  const handleBookCourier = useCallback((courierName) => {
    setBookingCourier(true);
    fetch(`${apiBase}/api/bulk/book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` },
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
  }, [apiBase, editingOrder, fetchOrderDetails, setEditingOrder]);

  const handleSendInvoice = useCallback(async () => {
    setSendingInvoice(true);
    try {
      const res = await fetch(`${apiBase}/api/whatsapp-governance/chat/${editingOrder.id}/send-invoice`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('trace_token')}`
        }
      });
      const data = await res.json();
      if (data.success) {
        alert('✅ PDF Invoice generated and sent to WhatsApp!');
        const chatRes = await fetch(`${apiBase}/api/whatsapp-governance/chat/${editingOrder.id}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
        });
        const chatData = await chatRes.json();
        if (chatData.messages) setChatMessages(chatData.messages);
      } else {
        alert(data.error || 'Failed to send invoice');
      }
    } catch (err) {
      alert('Network error sending invoice');
    } finally {
      setSendingInvoice(false);
    }
  }, [apiBase, editingOrder, setChatMessages]);

  // AI Address Quality Heuristic Score
  const addrScore = useMemo(() => {
    const addr = editingOrder?.address;
    if (!addr || addr.length < 10) return { label: '⚠️ Low Quality (Too Short)', color: '#f43f5e', bg: 'rgba(244,63,94,0.1)' };
    const hasNumber = /\d/.test(addr);
    const hasStreet = /(st|street|road|rd|lane|ln|block|blk|sector|sec|phase)/i.test(addr);
    if (hasNumber && hasStreet && addr.length > 15) return { label: '✅ High Quality (Courier Perfect)', color: '#10b981', bg: 'rgba(16,185,129,0.1)' };
    return { label: '⚠️ Fair Quality (Missing Street/House #)', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' };
  }, [editingOrder?.address]);

  return {
    localDiscount,
    setLocalDiscount,
    localShippingFee,
    setLocalShippingFee,
    localNotes,
    setLocalNotes,
    isSavingCS,
    custIntel,
    setCustIntel,
    custIntelLoading,
    setCustIntelLoading,
    waSimulating,
    sendingImages,
    bookingCourier,
    trackingData,
    setTrackingData,
    trackingLoading,
    setTrackingLoading,
    sendingInvoice,
    handleCSUpdate,
    handleWaSimulate,
    handleSendItemImages,
    handleAddressCleanse,
    handleBookCourier,
    handleSendInvoice,
    liveTotal,
    totalOrderCost,
    netProfit,
    profitMargin,
    addrScore
  };
}
