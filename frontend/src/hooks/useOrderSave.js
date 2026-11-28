import { useState, useCallback, useMemo, useRef } from 'react';

/**
 * Strict 3-Tier Cascade Master Product Matcher (SKU / Variant ID / Parent+Variant Title).
 * Never falls back blindly to the first random variant of a parent product.
 */
export function matchMasterProduct(item, masterProducts = []) {
  if (!item || !Array.isArray(masterProducts) || masterProducts.length === 0) return null;

  // Tier 1: Exact Shopify Variant ID
  const vId = item.variant_id != null ? String(item.variant_id).trim() : '';
  if (vId) {
    const byVariant = masterProducts.find(mp => mp.shopify_variant_id && String(mp.shopify_variant_id).trim() === vId);
    if (byVariant) return byVariant;
  }

  // Tier 2: Exact SKU (case-insensitive)
  const skuNorm = String(item.sku || '').trim().toLowerCase();
  if (skuNorm) {
    const bySku = masterProducts.find(mp => mp.sku && String(mp.sku).trim().toLowerCase() === skuNorm);
    if (bySku) return bySku;
  }

  // Tier 3: Exact Parent Title + Variant Title (safe for ghost/legacy orders without SKU)
  const titleNorm = String(item.title || '').trim().toLowerCase();
  const varNorm = String(item.variant_title || '').trim().toLowerCase();
  if (titleNorm) {
    const sameParent = masterProducts.filter(mp => {
      const mpParent = String(mp.parent_title || '').split(' - ')[0].trim().toLowerCase();
      return mpParent === titleNorm || String(mp.parent_title || '').trim().toLowerCase() === titleNorm;
    });
    if (sameParent.length === 1 && (!varNorm || varNorm === 'default title')) {
      return sameParent[0];
    }
    if (varNorm && varNorm !== 'default title') {
      const exactTitleVar = sameParent.find(mp => String(mp.variant_title || '').trim().toLowerCase() === varNorm);
      if (exactTitleVar) return exactTitleVar;
    }
  }

  return null;
}

function buildSnapshotKey(items, discount, shippingFee, notes) {
  const normItems = (items || []).map(i => ({
    id: i.id || '',
    variant_id: i.variant_id || '',
    sku: i.sku || '',
    title: i.title || '',
    variant_title: i.variant_title || '',
    quantity: Number(i.quantity) || 0,
    price: Number(i.price) || 0
  }));
  return JSON.stringify({
    items: normItems,
    discount: Number(discount || 0),
    shippingFee: Number(shippingFee || 0),
    notes: String(notes || '')
  });
}

export default function useOrderSave({
  editingOrder,
  setEditingOrder,
  fetchOrderDetails,
  updateOrderField,
  localItems,
  masterProducts,
  liveSubtotal,
  apiBase,
  onLocalOrderUpdate,
  addToast
}) {
  const notify = useCallback((msg, type = 'info') => {
    if (typeof addToast === 'function') addToast(msg, type);
  }, [addToast]);

  const getAuthHeaders = useCallback((withJson = false) => {
    const token = localStorage.getItem('trace_token') || localStorage.getItem('token') || '';
    const h = {};
    if (withJson) h['Content-Type'] = 'application/json';
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  }, []);

  // CS Edit State
  const [localDiscount, setLocalDiscount] = useState(0);
  const [localShippingFee, setLocalShippingFee] = useState(0);
  const [localNotes, setLocalNotes] = useState('');
  const [isSavingCS, setIsSavingCS] = useState(false);

  // Baseline snapshot for unsaved-changes tracking
  const baselineSnapshotRef = useRef('');
  const setBaselineSnapshot = useCallback((items, discount, shippingFee, notes) => {
    baselineSnapshotRef.current = buildSnapshotKey(items, discount, shippingFee, notes);
  }, []);

  const isDirty = useMemo(() => {
    if (!baselineSnapshotRef.current) return false;
    return buildSnapshotKey(localItems, localDiscount, localShippingFee, localNotes) !== baselineSnapshotRef.current;
  }, [localItems, localDiscount, localShippingFee, localNotes]);

  // Customer Intelligence State
  const [custIntel, setCustIntel] = useState({ total: 0, delivered: 0, returned: 0, rto_rate: 0, blacklist: false });
  const [custIntelLoading, setCustIntelLoading] = useState(false);

  // Logistics & Live Tracking State
  const [bookingCourier, setBookingCourier] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [trackingData, setTrackingData] = useState(null);
  const [liveHistory, setLiveHistory] = useState([]);
  const [trackingLoading, setTrackingLoading] = useState(false);

  // Google Maps Verification State
  const [mapsVerifyLoading, setMapsVerifyLoading] = useState(false);
  const [mapsVerifyResult, setMapsVerifyResult] = useState(null);

  // Live Math & Profit Margins
  const liveTotal = useMemo(() => {
    return Math.max(0, liveSubtotal - parseFloat(localDiscount || 0) + parseFloat(localShippingFee || 0));
  }, [liveSubtotal, localDiscount, localShippingFee]);

  const { totalOrderCost, zeroCostCount } = useMemo(() => {
    let total = 0;
    let missingCount = 0;
    localItems.forEach(item => {
      const matched = matchMasterProduct(item, masterProducts);
      const unitCost = parseFloat(matched?.unit_cost ?? matched?.landed_cost ?? 0) || 0;
      const qty = parseInt(item.quantity, 10) || 1;
      if (unitCost <= 0) missingCount += 1;
      total += unitCost * qty;
    });
    // Fallback to DB order.cost when catalog hasn't finished loading yet
    if (masterProducts.length === 0 && Number(editingOrder?.cost || 0) > 0) {
      return { totalOrderCost: Number(editingOrder.cost), zeroCostCount: 0 };
    }
    return { totalOrderCost: total, zeroCostCount: missingCount };
  }, [localItems, masterProducts, editingOrder?.cost]);

  const effectiveCourierExpense = useMemo(() => {
    const explicit = parseFloat(editingOrder?.courier_fee || 0) || 0;
    return explicit;
  }, [editingOrder?.courier_fee]);

  const netProfit = useMemo(() => {
    return liveTotal - totalOrderCost - effectiveCourierExpense;
  }, [liveTotal, totalOrderCost, effectiveCourierExpense]);

  const profitMargin = useMemo(() => {
    return liveTotal > 0 ? Math.round((netProfit / liveTotal) * 100) : 0;
  }, [liveTotal, netProfit]);

  const handleCSUpdate = useCallback(async () => {
    if (!editingOrder?.id) return;
    if (localItems.length === 0) {
      notify('⚠️ Order must contain at least one line item.', 'warning');
      return;
    }
    setIsSavingCS(true);
    try {
      const subtotal = localItems.reduce((acc, item) => acc + ((parseFloat(item.price) || 0) * (parseInt(item.quantity, 10) || 0)), 0);
      const newPrice = Math.max(0, subtotal - parseFloat(localDiscount || 0) + parseFloat(localShippingFee || 0));

      const res = await fetch(`${apiBase}/api/orders/${editingOrder.id}/cs-update`, {
        method: 'PUT',
        headers: getAuthHeaders(true),
        body: JSON.stringify({
          line_items: localItems,
          price: newPrice,
          discount_amount: parseFloat(localDiscount || 0),
          shipping_fee: parseFloat(localShippingFee || 0),
          cs_notes: localNotes
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const merged = { ...editingOrder, ...data.order, shop_domain: editingOrder.shop_domain };
        setEditingOrder(merged);
        if (onLocalOrderUpdate) onLocalOrderUpdate(merged);
        setBaselineSnapshot(localItems, localDiscount, localShippingFee, localNotes);
        if (data.warning) {
          notify(`⚠️ ${data.warning}`, 'warning');
        } else {
          notify('✅ Order changes saved & synced!', 'success');
        }
      } else {
        notify(`❌ ${data.error || 'Failed to save order'}`, 'error');
      }
    } catch (e) {
      notify('❌ Network error saving order update', 'error');
    } finally {
      setIsSavingCS(false);
    }
  }, [apiBase, localItems, localDiscount, localShippingFee, localNotes, editingOrder, setEditingOrder, onLocalOrderUpdate, getAuthHeaders, notify, setBaselineSnapshot]);

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
    setEditingOrder(prev => ({ ...prev, address: cleaned }));
    if (updateOrderField) updateOrderField(editingOrder.id, 'address', cleaned);
    notify('✨ Address formatted & saved', 'success');
  }, [editingOrder, setEditingOrder, updateOrderField, notify]);

  // REAL synchronous single-order booking (PostEx / Instaworld 1-3) — enforces Zero-Cost, City & Prepaid COD=0
  const handleBookCourier = useCallback(async (courierKey) => {
    if (!editingOrder?.id) return;
    if (editingOrder.tracking_number) {
      notify(`⚠️ Already booked with tracking ${editingOrder.tracking_number}. Cancel booking first to re-book.`, 'warning');
      return;
    }
    if (isDirty) {
      notify('⚠️ You have unsaved order changes — click Save Changes before booking!', 'warning');
      return;
    }

    const isInsta = courierKey.startsWith('insta:');
    const accountType = isInsta ? courierKey.split(':')[1] : null;
    const displayLabel = courierKey === 'PostEx'
      ? 'PostEx'
      : accountType === 'primary' ? 'Instaworld API 1'
      : accountType === 'backup' ? 'Instaworld API 2'
      : accountType === 'key3' ? 'Instaworld API 3'
      : courierKey;

    const isPrepaid = ['paid', 'partially_paid'].includes(String(editingOrder.payment_status || '').toLowerCase());
    const codLabel = isPrepaid ? 'Rs. 0 (Prepaid Order)' : `Rs. ${Math.round(liveTotal).toLocaleString()} COD`;
    if (!window.confirm(`Book Order #${editingOrder.ref_number || editingOrder.id} with ${displayLabel}?\n\nCollectible: ${codLabel}\nCity: ${editingOrder.city || 'Missing'}`)) {
      return;
    }

    setBookingCourier(true);
    try {
      const endpoint = isInsta
        ? `${apiBase}/api/orders/${editingOrder.id}/book-instaworld`
        : `${apiBase}/api/orders/${editingOrder.id}/book-postex`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify(isInsta ? { account_type: accountType } : {})
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || `Booking with ${displayLabel} failed`);
      }

      const trackingNum = data.trackingNumber || data.tracking_number || data.order?.tracking_number;
      const merged = {
        ...editingOrder,
        ...(data.order || {}),
        tracking_number: trackingNum,
        courier: isInsta ? 'Instaworld' : 'PostEx',
        delivery_status: 'Booked',
        shop_domain: editingOrder.shop_domain
      };
      setEditingOrder(merged);
      if (onLocalOrderUpdate) onLocalOrderUpdate(merged);

      if (data.shopifyFulfilled === false) {
        notify(`✅ Booked (${trackingNum}), but Shopify fulfillment failed: ${data.shopifyError || 'Check token'}`, 'warning');
      } else {
        notify(`🚀 Booked with ${displayLabel}! Tracking: ${trackingNum}`, 'success');
      }
      if (fetchOrderDetails) fetchOrderDetails(editingOrder.id);
    } catch (err) {
      notify(`❌ ${err.message || 'Courier booking failed'}`, 'error');
    } finally {
      setBookingCourier(false);
    }
  }, [apiBase, editingOrder, isDirty, liveTotal, getAuthHeaders, setEditingOrder, onLocalOrderUpdate, fetchOrderDetails, notify]);

  // Confirm Order -> adds "Ready to Book" tag on Shopify
  const handleConfirmOrder = useCallback(async () => {
    if (!editingOrder?.id) return;
    setActionBusy(true);
    try {
      const res = await fetch(`${apiBase}/api/orders/${editingOrder.id}/confirm`, {
        method: 'POST',
        headers: getAuthHeaders(true)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Confirm failed');

      const merged = {
        ...editingOrder,
        ...(data.order || {}),
        delivery_status: 'Confirmed',
        confirmed_at: data.order?.confirmed_at || new Date().toISOString(),
        shop_domain: editingOrder.shop_domain
      };
      setEditingOrder(merged);
      if (onLocalOrderUpdate) onLocalOrderUpdate(merged);

      if (data.shopifyTagSynced) {
        notify('✅ Order Confirmed & "Ready to Book" tag added on Shopify!', 'success');
      } else {
        notify(`✅ Order Confirmed locally (${data.shopifyTagError || 'Shopify tag skipped'})`, 'warning');
      }
    } catch (err) {
      notify(`❌ ${err.message}`, 'error');
    } finally {
      setActionBusy(false);
    }
  }, [apiBase, editingOrder, getAuthHeaders, setEditingOrder, onLocalOrderUpdate, notify]);

  // Revert Confirm -> removes "Ready to Book" tag on Shopify
  const handleRevertConfirm = useCallback(async () => {
    if (!editingOrder?.id) return;
    setActionBusy(true);
    try {
      const res = await fetch(`${apiBase}/api/orders/${editingOrder.id}/revert-confirm`, {
        method: 'POST',
        headers: getAuthHeaders(true)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Revert failed');

      const merged = {
        ...editingOrder,
        ...(data.order || {}),
        delivery_status: 'Pending',
        confirmed_at: null,
        shop_domain: editingOrder.shop_domain
      };
      setEditingOrder(merged);
      if (onLocalOrderUpdate) onLocalOrderUpdate(merged);
      notify('↩️ Reverted to Pending & removed "Ready to Book" tag', 'info');
    } catch (err) {
      notify(`❌ ${err.message}`, 'error');
    } finally {
      setActionBusy(false);
    }
  }, [apiBase, editingOrder, getAuthHeaders, setEditingOrder, onLocalOrderUpdate, notify]);

  // Cancel Courier Booking (PostEx / Instaworld + clears tracking + restores FIFO + removes Ready to Book tag)
  const handleCancelBooking = useCallback(async () => {
    if (!editingOrder?.id) return;
    if (!window.confirm(`Cancel courier booking (${editingOrder.tracking_number}) for Order #${editingOrder.ref_number || editingOrder.id}?\n\nThis will void the tracking on courier, cancel Shopify fulfillment, and move the order back to Pending.`)) {
      return;
    }
    setActionBusy(true);
    try {
      const res = await fetch(`${apiBase}/api/orders/${editingOrder.id}/cancel-booking`, {
        method: 'POST',
        headers: getAuthHeaders(true)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Cancel booking failed');

      const merged = {
        ...editingOrder,
        ...(data.order || {}),
        delivery_status: 'Pending',
        tracking_number: null,
        courier: null,
        courier_status: null,
        confirmed_at: null,
        shop_domain: editingOrder.shop_domain
      };
      setEditingOrder(merged);
      setLiveHistory([]);
      setTrackingData(null);
      if (onLocalOrderUpdate) onLocalOrderUpdate(merged);
      notify('🛑 Courier booking cancelled — Order moved back to Pending', 'success');
    } catch (err) {
      notify(`❌ ${err.message}`, 'error');
    } finally {
      setActionBusy(false);
    }
  }, [apiBase, editingOrder, getAuthHeaders, setEditingOrder, onLocalOrderUpdate, notify]);

  // Real Order Cancellation (for High RTO Risk Alert)
  const handleCancelOrder = useCallback(async () => {
    if (!editingOrder?.id) return;
    if (!window.confirm(`Cancel Order #${editingOrder.ref_number || editingOrder.id} due to High RTO Risk?\n\nThis will mark the ERP status as Cancelled.`)) {
      return;
    }
    setActionBusy(true);
    try {
      if (updateOrderField) {
        const updated = await updateOrderField(editingOrder.id, 'delivery_status', 'Cancelled');
        const merged = { ...editingOrder, ...(updated || {}), delivery_status: 'Cancelled', shop_domain: editingOrder.shop_domain };
        setEditingOrder(merged);
        if (onLocalOrderUpdate) onLocalOrderUpdate(merged);
      }
    } catch (err) {
      notify(`❌ ${err.message || 'Failed to cancel order'}`, 'error');
    } finally {
      setActionBusy(false);
    }
  }, [editingOrder, updateOrderField, setEditingOrder, onLocalOrderUpdate, notify]);

  const handleGoogleMapsVerify = useCallback(async () => {
    if (!editingOrder?.id) return;
    setMapsVerifyLoading(true);
    setMapsVerifyResult(null);
    try {
      const res = await fetch(`${apiBase}/api/orders/${editingOrder.id}/verify-address`, {
        method: 'POST',
        headers: getAuthHeaders(true)
      });
      const data = await res.json();
      setMapsVerifyResult(data);
    } catch (err) {
      setMapsVerifyResult({ success: false, error_message: 'Network error verifying address.' });
    } finally {
      setMapsVerifyLoading(false);
    }
  }, [apiBase, editingOrder?.id, getAuthHeaders]);

  const handleApplyStandardAddress = useCallback((stdAddress, stdCity) => {
    if (!editingOrder) return;
    const updated = { ...editingOrder, address: stdAddress, city: stdCity };
    setEditingOrder(updated);
    if (updateOrderField) {
      updateOrderField(editingOrder.id, { address: stdAddress, city: stdCity });
    }
    setMapsVerifyResult(null);
    notify('✅ Standard address applied', 'success');
  }, [editingOrder, setEditingOrder, updateOrderField, notify]);

  // AI Address Quality Heuristic Score
  const addrScore = useMemo(() => {
    const addr = editingOrder?.address;
    if (!addr || addr.trim().length < 10) return { label: '⚠️ Low Quality (Too Short)', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' };
    const hasNumber = /\d/.test(addr);
    const hasStreet = /(st|street|road|rd|lane|ln|block|blk|sector|sec|phase|house|flat|plot|gali|mohalla|chowk|colony|town)/i.test(addr);
    if (hasNumber && hasStreet && addr.trim().length > 15) return { label: '✅ Courier Ready', color: '#10b981', bg: 'rgba(16,185,129,0.12)' };
    return { label: '⚠️ Fair (Add House/Street #)', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' };
  }, [editingOrder?.address]);

  return {
    localDiscount,
    setLocalDiscount,
    localShippingFee,
    setLocalShippingFee,
    localNotes,
    setLocalNotes,
    isSavingCS,
    isDirty,
    setBaselineSnapshot,
    custIntel,
    setCustIntel,
    custIntelLoading,
    setCustIntelLoading,
    bookingCourier,
    actionBusy,
    trackingData,
    setTrackingData,
    liveHistory,
    setLiveHistory,
    trackingLoading,
    setTrackingLoading,
    handleCSUpdate,
    handleAddressCleanse,
    handleBookCourier,
    handleConfirmOrder,
    handleRevertConfirm,
    handleCancelBooking,
    handleCancelOrder,
    mapsVerifyLoading,
    mapsVerifyResult,
    setMapsVerifyResult,
    handleGoogleMapsVerify,
    handleApplyStandardAddress,
    liveTotal,
    totalOrderCost,
    zeroCostCount,
    effectiveCourierExpense,
    netProfit,
    profitMargin,
    addrScore
  };
}
