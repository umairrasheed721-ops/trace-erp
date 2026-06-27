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
  setChatMessages,
  onLocalOrderUpdate
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

  // Google Maps Verification State
  const [mapsVerifyLoading, setMapsVerifyLoading] = useState(false);
  const [mapsVerifyResult, setMapsVerifyResult] = useState(null);

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
        if (onLocalOrderUpdate) onLocalOrderUpdate(data.order);
        if (data.warning) {
          alert(data.warning);
        } else {
          alert('Order updated successfully!');
        }
      } else {
        alert(data.error);
      }
    } catch (e) {
      alert('Failed to save CS update');
    } finally {
      setIsSavingCS(false);
    }
  }, [apiBase, localItems, localDiscount, localShippingFee, localNotes, editingOrder, setEditingOrder, onLocalOrderUpdate]);

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
        
        let updatedVer = null;
        if (action === 'SIMULATE_CONFIRM') updatedVer = { ...editingOrder, wa_verification_status: 'verified' };
        if (action === 'SIMULATE_CANCEL') updatedVer = { ...editingOrder, wa_verification_status: 'Cancelled' };
        if (action === 'SEND_VERIFICATION') updatedVer = { ...editingOrder, wa_verification_status: 'Pending' };
        
        if (updatedVer) {
          setEditingOrder(updatedVer);
          if (onLocalOrderUpdate) onLocalOrderUpdate(updatedVer);
        }
      })
      .catch(err => {
        setWaSimulating(false);
        alert(err.message || 'WhatsApp simulation failed');
      });
  }, [apiBase, editingOrder, fetchOrderDetails, setEditingOrder, onLocalOrderUpdate]);

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
      body: JSON.stringify({ ids: [editingOrder.id], courier: courierName })
    })
      .then(r => r.json())
      .then(res => {
        setBookingCourier(false);
        if (res.error) throw new Error(res.error);
        
        let displayCourier = courierName;
        if (courierName === 'insta:primary') displayCourier = 'Instaworld API 1';
        else if (courierName === 'insta:backup') displayCourier = 'Instaworld API 2';
        else if (courierName === 'insta:key3') displayCourier = 'Instaworld API 3';
        
        alert(`Successfully booked with ${displayCourier}! (Background booking started)`);
        if (fetchOrderDetails) fetchOrderDetails(editingOrder.id);
        
        setEditingOrder(prev => {
          const updated = { 
            ...prev, 
            tracking_number: prev.tracking_number || 'GENERATED',
            courier: courierName.startsWith('insta:') ? 'Instaworld' : courierName,
            delivery_status: 'Booked'
          };
          if (onLocalOrderUpdate) onLocalOrderUpdate(updated);
          return updated;
        });
      })
      .catch(err => {
        setBookingCourier(false);
        alert(err.message || 'Courier booking failed');
      });
  }, [apiBase, editingOrder, fetchOrderDetails, setEditingOrder, onLocalOrderUpdate]);

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

  const handleGoogleMapsVerify = useCallback(async () => {
    if (!editingOrder?.id) return;
    setMapsVerifyLoading(true);
    setMapsVerifyResult(null);
    try {
      const res = await fetch(`${apiBase}/api/orders/${editingOrder.id}/verify-address`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('trace_token')}`
        }
      });
      const data = await res.json();
      setMapsVerifyResult(data);
    } catch (err) {
      setMapsVerifyResult({ success: false, error_message: 'Network error verifying address.' });
    } finally {
      setMapsVerifyLoading(false);
    }
  }, [apiBase, editingOrder?.id]);

  const handleApplyStandardAddress = useCallback((stdAddress, stdCity) => {
    if (!editingOrder) return;
    const updated = { ...editingOrder, address: stdAddress, city: stdCity };
    setEditingOrder(updated);
    if (updateOrderField) {
      updateOrderField(editingOrder.id, 'address', stdAddress);
      updateOrderField(editingOrder.id, 'city', stdCity);
    }
    setMapsVerifyResult(null);
  }, [editingOrder, setEditingOrder, updateOrderField]);

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
    mapsVerifyLoading,
    mapsVerifyResult,
    setMapsVerifyResult,
    handleGoogleMapsVerify,
    handleApplyStandardAddress,
    liveTotal,
    totalOrderCost,
    netProfit,
    profitMargin,
    addrScore
  };
}
