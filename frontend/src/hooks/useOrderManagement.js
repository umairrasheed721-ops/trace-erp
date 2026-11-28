import { useState, useEffect, useCallback, useRef } from 'react';
import useOrderItems from './useOrderItems';
import useOrderSave from './useOrderSave';

function parseLineItemsSafe(order) {
  if (!order) return [];
  if (Array.isArray(order.line_items_parsed) && order.line_items_parsed.length > 0) return order.line_items_parsed;
  if (Array.isArray(order.line_items)) return order.line_items;
  if (typeof order.line_items === 'string') {
    try {
      const parsed = JSON.parse(order.line_items);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

function extractDiscountSafe(order) {
  if (!order) return 0;
  if (order.notes) {
    try {
      const parsedNotes = JSON.parse(order.notes);
      if (parsedNotes && parsedNotes.cs_discount !== undefined) {
        return Number(parsedNotes.cs_discount) || 0;
      }
    } catch (_) {}
  }
  return Number(order.discount_amount) || 0;
}

/**
 * Lean Composer Hook for Order Editor Modal.
 * Zero keystroke API spam: fetches dependencies strictly per order ID.
 */
export default function useOrderManagement({
  editingOrder,
  setEditingOrder,
  fetchOrderDetails,
  updateOrderField,
  onLocalOrderUpdate,
  addToast
}) {
  const apiBase = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';

  // Navigation Tabs: 'financials' | 'customer' | 'logistics'
  const [activeTab, setActiveTab] = useState('financials');

  // Sub-Hooks
  const itemsHook = useOrderItems({ editingOrder, apiBase });

  const saveHook = useOrderSave({
    editingOrder,
    setEditingOrder,
    fetchOrderDetails,
    updateOrderField,
    localItems: itemsHook.localItems,
    masterProducts: itemsHook.masterProducts,
    liveSubtotal: itemsHook.liveSubtotal,
    apiBase,
    onLocalOrderUpdate,
    addToast
  });

  const orderId = editingOrder?.id || null;
  const storeId = editingOrder?.store_id || localStorage.getItem('activeStoreId') || 1;
  const trackingNumber = editingOrder?.tracking_number || '';
  const trackingSlug = editingOrder?.tracking_slug || '';
  const lastHydratedItemsSigRef = useRef('');

  // Multi-courier live tracking history fetcher (PostEx / Instaworld / Leopards / TCS / LCS)
  const refreshLiveTracking = useCallback(async (tnOverride, stOverride) => {
    const tn = tnOverride ?? trackingNumber;
    const st = stOverride ?? storeId;
    if (!tn) {
      saveHook.setLiveHistory([]);
      return;
    }
    saveHook.setTrackingLoading(true);
    try {
      const token = localStorage.getItem('trace_token') || localStorage.getItem('token') || '';
      const res = await fetch(
        `${apiBase}/api/shipper-advice/live-tracking-history?tracking_number=${encodeURIComponent(tn)}&store_id=${encodeURIComponent(st)}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      const data = await res.json();
      if (res.ok && data.success) {
        saveHook.setLiveHistory(Array.isArray(data.tracking_history) ? data.tracking_history : []);
        if (data.courier_status) {
          setEditingOrder(prev => prev && prev.tracking_number === tn ? { ...prev, courier_status: data.courier_status } : prev);
        }
      }
    } catch (_) {
      // Fall back to DB tracking_history already parsed below
    } finally {
      saveHook.setTrackingLoading(false);
    }
  }, [apiBase, trackingNumber, storeId, setEditingOrder]);

  // 1. Hydrate local form state & fetch remote intelligence STRICTLY when orderId changes (zero keystroke spam!)
  useEffect(() => {
    if (!orderId) {
      lastHydratedItemsSigRef.current = '';
      return;
    }

    const items = parseLineItemsSafe(editingOrder);
    const discount = extractDiscountSafe(editingOrder);
    const shipping = Number(editingOrder.shipping_fee) || 0;
    const notes = editingOrder.cs_notes || '';

    itemsHook.setLocalItems(items);
    saveHook.setLocalNotes(notes);
    saveHook.setLocalDiscount(discount);
    saveHook.setLocalShippingFee(shipping);
    saveHook.setBaselineSnapshot(items, discount, shipping, notes);
    saveHook.setMapsVerifyResult(null);
    lastHydratedItemsSigRef.current = JSON.stringify(items);

    const token = localStorage.getItem('trace_token') || localStorage.getItem('token') || '';
    const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};
    let cancelled = false;

    // Customer Intelligence
    saveHook.setCustIntelLoading(true);
    fetch(`${apiBase}/api/orders/${orderId}/customer-intelligence`, { headers: authHeaders })
      .then(r => r.json())
      .then(data => {
        if (!cancelled) {
          saveHook.setCustIntel(data || { total: 0, delivered: 0, returned: 0, rto_rate: 0, blacklist: false });
          saveHook.setCustIntelLoading(false);
        }
      })
      .catch(() => { if (!cancelled) saveHook.setCustIntelLoading(false); });

    // Master Product Costs & Inventory
    fetch(`${apiBase}/api/cost-manager?store_id=${storeId}`, { headers: authHeaders })
      .then(r => r.json())
      .then(data => {
        if (!cancelled) itemsHook.setMasterProducts(Array.isArray(data) ? data : []);
      })
      .catch(() => {});

    // Parse any cached DB tracking_history immediately
    let dbHist = [];
    if (editingOrder.tracking_history) {
      try {
        let parsed = typeof editingOrder.tracking_history === 'string'
          ? JSON.parse(editingOrder.tracking_history)
          : editingOrder.tracking_history;
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        if (Array.isArray(parsed)) dbHist = parsed;
      } catch (_) {}
    }
    saveHook.setLiveHistory(dbHist);
    saveHook.setTrackingData(null);

    // Fetch real public tracking milestones ONLY if a real tracking_slug exists (never mock slug!)
    if (trackingSlug && trackingSlug !== 'tr_mock_slug') {
      fetch(`${apiBase}/api/customer-success/tracking/${encodeURIComponent(trackingSlug)}`, { headers: authHeaders })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!cancelled && data && !data.error) saveHook.setTrackingData(data);
        })
        .catch(() => {});
    }

    // Fetch live multi-courier tracking timeline when tracking_number exists
    if (trackingNumber) {
      refreshLiveTracking(trackingNumber, storeId);
    }

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, storeId, apiBase]);

  // 2. When fetchOrderDetails completes async Shopify hydration (adds images/fresh line items), sync ONLY if user hasn't edited yet
  useEffect(() => {
    if (!orderId || saveHook.isDirty) return;
    const freshItems = parseLineItemsSafe(editingOrder);
    const sig = JSON.stringify(freshItems);
    if (freshItems.length > 0 && sig !== lastHydratedItemsSigRef.current) {
      lastHydratedItemsSigRef.current = sig;
      itemsHook.setLocalItems(freshItems);
      saveHook.setBaselineSnapshot(freshItems, saveHook.localDiscount, saveHook.localShippingFee, saveHook.localNotes);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingOrder?.line_items, orderId]);

  return {
    activeTab,
    setActiveTab,
    localItems: itemsHook.localItems,
    setLocalItems: itemsHook.setLocalItems,
    localDiscount: saveHook.localDiscount,
    setLocalDiscount: saveHook.setLocalDiscount,
    localShippingFee: saveHook.localShippingFee,
    setLocalShippingFee: saveHook.setLocalShippingFee,
    localNotes: saveHook.localNotes,
    setLocalNotes: saveHook.setLocalNotes,
    isSavingCS: saveHook.isSavingCS,
    isDirty: saveHook.isDirty,
    custIntel: saveHook.custIntel,
    custIntelLoading: saveHook.custIntelLoading,
    masterProducts: itemsHook.masterProducts,
    showProductSearch: itemsHook.showProductSearch,
    setShowProductSearch: itemsHook.setShowProductSearch,
    productSearchQuery: itemsHook.productSearchQuery,
    setProductSearchQuery: itemsHook.setProductSearchQuery,
    bookingCourier: saveHook.bookingCourier,
    actionBusy: saveHook.actionBusy,
    trackingData: saveHook.trackingData,
    liveHistory: saveHook.liveHistory,
    trackingLoading: saveHook.trackingLoading,
    refreshLiveTracking,
    handleCSUpdate: saveHook.handleCSUpdate,
    handleAddressCleanse: saveHook.handleAddressCleanse,
    handleBookCourier: saveHook.handleBookCourier,
    handleConfirmOrder: saveHook.handleConfirmOrder,
    handleRevertConfirm: saveHook.handleRevertConfirm,
    handleCancelBooking: saveHook.handleCancelBooking,
    handleCancelOrder: saveHook.handleCancelOrder,
    mapsVerifyLoading: saveHook.mapsVerifyLoading,
    mapsVerifyResult: saveHook.mapsVerifyResult,
    setMapsVerifyResult: saveHook.setMapsVerifyResult,
    handleGoogleMapsVerify: saveHook.handleGoogleMapsVerify,
    handleApplyStandardAddress: saveHook.handleApplyStandardAddress,
    liveSubtotal: itemsHook.liveSubtotal,
    liveTotal: saveHook.liveTotal,
    totalOrderCost: saveHook.totalOrderCost,
    zeroCostCount: saveHook.zeroCostCount,
    effectiveCourierExpense: saveHook.effectiveCourierExpense,
    netProfit: saveHook.netProfit,
    profitMargin: saveHook.profitMargin,
    filteredGroups: itemsHook.filteredGroups,
    addrScore: saveHook.addrScore
  };
}
