import React, { useState, useEffect, useCallback } from 'react';
import useOrderManagement from '@hooks/useOrderManagement';
import OrderHeader from '@components/OrderHeader';
import ItemsList from '@components/ItemsList';
import PaymentSummary from '@components/PaymentSummary';
import CourierBooking from '@components/CourierBooking';
import { useApp } from '@context/AppContext';
import AddressVerificationPanel from '@components/EditOrderModal/AddressVerificationPanel';

const FINAL_LOCKED_STATUSES = ['delivered', 'returned', 'return received', 'cancelled'];

function normalizeSize(str) {
  if (!str) return null;
  const norm = String(str).trim().toUpperCase();
  const sizes = ['6XL', '5XL', '4XL', '3XL', '2XL', 'XXL', 'XL', 'L', 'M', 'S', 'XS'];
  for (const size of sizes) {
    const regex = new RegExp(`(?:\\b|[-/_()\\s])${size}(?:\\b|[-/_()\\s])`, 'i');
    if (regex.test(norm)) {
      return size === 'XXL' ? '2XL' : size;
    }
  }
  const numMatch = norm.match(/\b(30|32|34|36|38|40|42|44|46)\b/);
  if (numMatch) return numMatch[1];
  return null;
}

function extractSizeFromOrder(order) {
  if (!order) return 'M';
  if (order.size_preference) return order.size_preference;

  let lineItems = [];
  try {
    lineItems = typeof order.line_items === 'string' ? JSON.parse(order.line_items) : (order.line_items || []);
  } catch (_) {}

  for (const item of lineItems) {
    const vt = String(item.variant_title || '').trim().toUpperCase();
    if (vt && vt !== 'DEFAULT TITLE') {
      const sizeMatch = normalizeSize(vt);
      if (sizeMatch) return sizeMatch;
    }
    const sizeMatch = normalizeSize(item.title) || normalizeSize(item.sku);
    if (sizeMatch) return sizeMatch;
  }
  return 'M';
}

function escapeHtml(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function openPackingSlipPrint({ order, items, subtotal, discount, shippingFee, total, storeName }) {
  const win = window.open('', '_blank', 'width=720,height=880');
  if (!win) return false;
  const ref = order.ref_number || `#${order.shopify_order_id || order.id}`;
  const isPrepaid = ['paid', 'partially_paid'].includes(String(order.payment_status || '').toLowerCase());
  const codAmount = isPrepaid ? 0 : total;
  const totalQty = items.reduce((s, i) => s + (parseInt(i.quantity, 10) || 1), 0);

  const rowsHtml = items.map((it, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>
        <strong>${escapeHtml(it.title)}</strong>
        ${it.variant_title ? `<div class="muted">${escapeHtml(it.variant_title)}</div>` : ''}
      </td>
      <td class="mono">${escapeHtml(it.sku || '—')}</td>
      <td class="num">${parseInt(it.quantity, 10) || 1}</td>
      <td class="num">Rs ${Math.round((parseFloat(it.price) || 0) * (parseInt(it.quantity, 10) || 1)).toLocaleString()}</td>
    </tr>
  `).join('');

  win.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Packing Slip - ${escapeHtml(ref)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 24px; color: #0f172a; }
    .slip { max-width: 640px; margin: 0 auto; border: 2px solid #0f172a; border-radius: 10px; padding: 20px; }
    .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 14px; }
    .brand { font-size: 18px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; }
    .order-id { font-size: 20px; font-weight: 800; font-family: monospace; }
    .meta { font-size: 12px; color: #475569; margin-top: 3px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px; }
    .box { border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 12px; font-size: 13px; line-height: 1.45; }
    .box-label { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; margin-bottom: 4px; }
    .cod-box { background: #f8fafc; border: 2px solid #0f172a; text-align: center; }
    .cod-val { font-size: 22px; font-weight: 900; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 13px; }
    th, td { border-bottom: 1px solid #cbd5e1; padding: 8px 6px; text-align: left; }
    th { font-size: 11px; text-transform: uppercase; color: #475569; background: #f1f5f9; }
    .num { text-align: right; font-weight: 700; }
    .mono { font-family: monospace; font-size: 12px; }
    .muted { font-size: 11px; color: #64748b; }
    .totals { display: flex; justify-content: flex-end; }
    .totals table { width: 260px; margin-bottom: 0; }
    .totals td { border: none; padding: 4px 6px; }
    .totals .grand td { border-top: 2px solid #0f172a; padding-top: 8px; font-weight: 900; font-size: 15px; }
    .note { margin-top: 12px; padding: 8px 10px; background: #fffbeb; border: 1px solid #fcd34d; border-radius: 6px; font-size: 12px; }
    @media print { body { padding: 0; } .slip { border-width: 1px; } }
  </style>
</head>
<body>
  <div class="slip">
    <div class="top">
      <div>
        <div class="brand">${escapeHtml(storeName || 'TRACE ERP')}</div>
        <div class="meta">Packing Slip · Printed ${new Date().toLocaleString()}</div>
      </div>
      <div style="text-align:right">
        <div class="order-id">${escapeHtml(ref)}</div>
        ${order.tracking_number ? `<div class="meta mono">${escapeHtml(order.courier || 'Courier')}: ${escapeHtml(order.tracking_number)}</div>` : ''}
      </div>
    </div>

    <div class="grid">
      <div class="box">
        <div class="box-label">Ship To</div>
        <div><strong>${escapeHtml(order.customer_name || 'Customer')}</strong></div>
        <div>📞 ${escapeHtml(order.phone || '—')}</div>
        <div>${escapeHtml(order.address || '—')}</div>
        <div><strong>${escapeHtml(order.city || '—')}</strong></div>
      </div>
      <div class="box cod-box">
        <div class="box-label">${isPrepaid ? 'Payment Status' : 'COD Amount to Collect'}</div>
        <div class="cod-val">${isPrepaid ? 'PREPAID (Rs 0)' : `Rs ${Math.round(codAmount).toLocaleString()}`}</div>
        <div class="meta" style="margin-top:6px;">Items: ${totalQty} unit${totalQty === 1 ? '' : 's'}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:28px">#</th>
          <th>Product / Variant</th>
          <th>SKU</th>
          <th class="num">Qty</th>
          <th class="num">Amount</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>

    <div class="totals">
      <table>
        <tr><td>Subtotal</td><td class="num">Rs ${Math.round(subtotal).toLocaleString()}</td></tr>
        ${Number(discount) > 0 ? `<tr><td>Discount</td><td class="num">-Rs ${Math.round(discount).toLocaleString()}</td></tr>` : ''}
        ${Number(shippingFee) > 0 ? `<tr><td>Shipping</td><td class="num">Rs ${Math.round(shippingFee).toLocaleString()}</td></tr>` : ''}
        <tr class="grand"><td>Total</td><td class="num">Rs ${Math.round(total).toLocaleString()}</td></tr>
      </table>
    </div>

    ${order.notes ? `<div class="note"><strong>Customer Note:</strong> ${escapeHtml(order.notes)}</div>` : ''}
  </div>
  <script>window.onload = function () { window.focus(); window.print(); };</script>
</body>
</html>`);
  win.document.close();
  return true;
}

export default function EditOrderModal({
  editingOrder,
  setEditingOrder,
  editorLoading,
  fetchOrderDetails,
  updateOrderField,
  isCityValid,
  onLocalOrderUpdate
}) {
  const { addToast, activeStore } = useApp();

  const management = useOrderManagement({
    editingOrder,
    setEditingOrder,
    fetchOrderDetails,
    updateOrderField,
    onLocalOrderUpdate,
    addToast
  });

  const {
    activeTab,
    setActiveTab,
    localItems,
    setLocalItems,
    localDiscount,
    setLocalDiscount,
    localShippingFee,
    setLocalShippingFee,
    localNotes,
    setLocalNotes,
    isSavingCS,
    isDirty,
    custIntel,
    custIntelLoading,
    masterProducts,
    showProductSearch,
    setShowProductSearch,
    productSearchQuery,
    setProductSearchQuery,
    bookingCourier,
    actionBusy,
    trackingData,
    liveHistory,
    trackingLoading,
    refreshLiveTracking,
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
    liveSubtotal,
    liveTotal,
    totalOrderCost,
    zeroCostCount,
    netProfit,
    profitMargin,
    filteredGroups,
    addrScore
  } = management;

  const [waTemplates, setWATemplates] = useState([]);
  const [activeCouriers, setActiveCouriers] = useState([]);
  const [selectedSize, setSelectedSize] = useState('M');
  const [showBookMenu, setShowBookMenu] = useState(false);

  const [sendingCatalog, setSendingCatalog] = useState(false);
  const [catalogVariants, setCatalogVariants] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [selectedCatalogVariants, setSelectedCatalogVariants] = useState(new Set());
  const [includeContinueSelling, setIncludeContinueSelling] = useState(true);
  const [batchIndex, setBatchIndex] = useState(0);

  const orderId = editingOrder?.id || null;
  const orderStoreId = editingOrder?.store_id || 1;

  // Extract default catalog size ONLY when opening a different order
  useEffect(() => {
    if (orderId) {
      setSelectedSize(extractSizeFromOrder(editingOrder));
      setShowBookMenu(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  // Auto-select active batch when catalog or page changes
  useEffect(() => {
    if (catalogVariants.length === 0) {
      setSelectedCatalogVariants(new Set());
      return;
    }
    const startIndex = batchIndex * 30;
    const currentBatch = catalogVariants.slice(startIndex, startIndex + 30);
    setSelectedCatalogVariants(new Set(currentBatch.map(v => v.shopify_variant_id)));
  }, [batchIndex, catalogVariants]);

  // Fetch catalog variants ONLY when Customer tab is open OR size/filter/orderId changes (Rule 9: zero idle/keystroke spam!)
  useEffect(() => {
    if (!orderId || activeTab !== 'customer' || !selectedSize) return;
    let cancelled = false;
    setLoadingCatalog(true);
    setCatalogError('');
    setBatchIndex(0);

    const token = localStorage.getItem('trace_token') || localStorage.getItem('token') || '';
    fetch(`/api/whatsapp/in-stock-images?size=${encodeURIComponent(selectedSize)}&include_continue_selling=${includeContinueSelling ? 'true' : 'false'}&store_id=${orderStoreId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
      .then(async res => ({ ok: res.ok, status: res.status, data: await res.json() }))
      .then(({ ok, status, data }) => {
        if (cancelled) return;
        if (ok && data.success) {
          const list = data.variants || [];
          setCatalogVariants(list);
          if (list.length > 0 && localStorage.getItem('trace_use_local_helper') === 'true') {
            const imageUrls = list.map(v => v.image_url).filter(Boolean);
            if (imageUrls.length > 0) {
              fetch('http://127.0.0.1:9099/pre-fetch-images', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageUrls })
              }).catch(() => {});
            }
          }
        } else {
          setCatalogVariants([]);
          setCatalogError(data.error || `Catalog request failed (HTTP ${status})`);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setCatalogVariants([]);
          setCatalogError(err.message || 'Catalog request failed');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCatalog(false);
      });

    return () => { cancelled = true; };
  }, [orderId, orderStoreId, activeTab, selectedSize, includeContinueSelling]);

  // Fetch WA templates & active couriers ONCE when opening modal (strictly keyed on orderId, NOT editingOrder!)
  useEffect(() => {
    if (!orderId) return;
    const token = localStorage.getItem('trace_token') || localStorage.getItem('token') || '';
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    fetch('/api/whatsapp/templates', { headers })
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setWATemplates(data); })
      .catch(() => {});

    fetch('/api/logistics/couriers', { headers })
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setActiveCouriers(data); })
      .catch(() => {});
  }, [orderId]);

  const requestClose = useCallback(() => {
    if (isDirty) {
      if (!window.confirm('You have unsaved line item / financial changes. Discard and close?')) {
        return;
      }
    }
    setShowBookMenu(false);
    setEditingOrder(null);
  }, [isDirty, setEditingOrder]);

  useEffect(() => {
    if (!orderId) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showProductSearch) return;
        if (showBookMenu) {
          setShowBookMenu(false);
          return;
        }
        requestClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [orderId, showProductSearch, showBookMenu, requestClose]);

  if (!editingOrder) return null;

  const toggleVariantSelection = (variantId) => {
    const next = new Set(selectedCatalogVariants);
    if (next.has(variantId)) {
      next.delete(variantId);
    } else {
      if (next.size >= 30) {
        addToast('⚠️ Max 30 images per WhatsApp dispatch.', 'warning');
        return;
      }
      next.add(variantId);
    }
    setSelectedCatalogVariants(next);
  };

  const handleSelectAllToggle = () => {
    if (catalogVariants.length === 0) return;
    const startIndex = batchIndex * 30;
    const currentBatch = catalogVariants.slice(startIndex, startIndex + 30);
    const allSelected = currentBatch.every(v => selectedCatalogVariants.has(v.shopify_variant_id));
    const next = new Set(selectedCatalogVariants);
    if (allSelected) currentBatch.forEach(v => next.delete(v.shopify_variant_id));
    else currentBatch.forEach(v => next.add(v.shopify_variant_id));
    setSelectedCatalogVariants(next);
  };

  const handleSendCatalogImages = async () => {
    if (selectedCatalogVariants.size === 0) {
      addToast('⚠️ Select at least one item to send.', 'warning');
      return;
    }
    setSendingCatalog(true);
    try {
      const selectedObjects = catalogVariants.filter(v => selectedCatalogVariants.has(v.shopify_variant_id));
      const imageUrls = selectedObjects.map(v => v.image_url).filter(Boolean);
      const cleanName = (editingOrder.customer_name || 'Customer').trim().replace(/\s+/g, ' ');
      const itemsListText = selectedObjects.map((v, idx) => `*${idx + 1}.* ${v.title} - Rs. ${Number(v.price || 0).toLocaleString()}`).join('\n');
      const message = `Assalam o Alaikum ${cleanName}, here are the available in-stock items in your size (${selectedSize}):\n\n${itemsListText}`;

      const waPhone = String(editingOrder.phone || '').replace(/\D/g, '').replace(/^0/, '92');
      const waBase = localStorage.getItem('trace_use_wa_web') === 'true' ? 'https://web.whatsapp.com/send' : 'whatsapp://send';
      let waLink = `${waBase}?phone=${waPhone}&text=${encodeURIComponent(message)}`;
      if (imageUrls.length > 0) waLink += `&autoImage=${encodeURIComponent(imageUrls.join(','))}`;
      window.open(waLink, '_blank');
      addToast(`📦 Opened WhatsApp with ${imageUrls.length} catalog items`, 'success');

      if (localStorage.getItem('trace_use_local_helper') === 'true' && imageUrls.length > 0) {
        setTimeout(() => {
          fetch('http://127.0.0.1:9099/paste-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrls })
          }).catch(() => {});
        }, 1500);
      }
    } catch (err) {
      addToast(`❌ Error: ${err.message}`, 'error');
    } finally {
      setSendingCatalog(false);
    }
  };

  const handleManualAction = (e) => {
    const actionValue = e.target.value;
    if (!actionValue) return;
    e.target.value = '';

    const formattedPhone = editingOrder.phone || '';
    const name = editingOrder.customer_name || 'Customer';
    const orderRef = editingOrder.ref_number || editingOrder.shopify_order_id;
    const price = Math.round(liveTotal || parseFloat(editingOrder.price) || 0);
    const waPhone = formattedPhone.replace(/\D/g, '').replace(/^0/, '92');
    const waBase = localStorage.getItem('trace_use_wa_web') === 'true' ? 'https://web.whatsapp.com/send' : 'whatsapp://send';

    if (actionValue === 'manual_cod') {
      const manualConfirmMsg = `Assalam o Alaikum ${name}, please confirm your order #${orderRef} of Rs. ${price}. Reply 1 to Confirm, 2 to Cancel.`;
      window.open(`${waBase}?phone=${waPhone}&text=${encodeURIComponent(manualConfirmMsg)}`, '_blank');
      return;
    }

    if (actionValue.startsWith('template_')) {
      const templateId = parseInt(actionValue.replace('template_', ''), 10);
      const template = waTemplates.find(t => t.id === templateId);
      if (!template) return;

      const courier = editingOrder.courier || 'our courier';
      const tracking = editingOrder.tracking_number || '';
      const trackingLink = editingOrder.tracking_slug
        ? `${window.location.origin}/track/${editingOrder.tracking_slug}`
        : 'N/A';

      let courierLink = 'N/A';
      if (tracking && tracking !== 'N/A') {
        courierLink = courier.toLowerCase().includes('postex')
          ? `https://postex.pk/tracking?cn=${tracking}`
          : `https://insta-app-be.instaworld.pk/logistics/orderTracking/?tracking_number=${tracking}`;
      }

      const msg = String(template.content || '')
        .replace(/\[Name\]/g, name)
        .replace(/\[OrderID\]/g, orderRef)
        .replace(/\[Price\]/g, price)
        .replace(/\[Courier\]/g, courier)
        .replace(/\[Tracking\]/g, tracking)
        .replace(/\[Address\]/g, editingOrder.address || 'N/A')
        .replace(/\[City\]/g, editingOrder.city || 'N/A')
        .replace(/\[Phone\]/g, editingOrder.phone || 'N/A')
        .replace(/\[Products\]/g, editingOrder.product_titles || localItems.map(i => `${i.title} x${i.quantity}`).join(', ') || 'N/A')
        .replace(/\[RefNumber\]/g, editingOrder.ref_number || 'N/A')
        .replace(/\[ItemsCount\]/g, String(localItems.reduce((s, i) => s + (parseInt(i.quantity, 10) || 1), 0)))
        .replace(/\[Link\]/g, trackingLink)
        .replace(/\[TraceLink\]/g, trackingLink)
        .replace(/\[CourierLink\]/g, courierLink);

      const imageUrls = localItems.map(i => i.image_url).filter(Boolean);
      let waLink = `${waBase}?phone=${waPhone}&text=${encodeURIComponent(msg)}`;
      if (imageUrls.length > 0) waLink += `&autoImage=${encodeURIComponent(imageUrls.join(','))}`;
      window.open(waLink, '_blank');

      if (localStorage.getItem('trace_use_local_helper') === 'true' && imageUrls.length > 0) {
        setTimeout(() => {
          fetch('http://127.0.0.1:9099/paste-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrls })
          }).catch(() => {});
        }, 1500);
      }
    }
  };

  // Lifecycle state flags for smart contextual bottom bar
  const statusLower = String(editingOrder.delivery_status || 'pending').toLowerCase();
  const isBooked = Boolean(editingOrder.tracking_number);
  const isFinal = FINAL_LOCKED_STATUSES.includes(statusLower);
  const isConfirmed = !isBooked && (statusLower === 'confirmed' || Boolean(editingOrder.confirmed_at));
  const canConfirm = !isBooked && !isFinal && !isConfirmed;
  const canCancelBooking = isBooked && !isFinal;

  // Configured couriers for quick Book dropdown
  const bookChoices = [];
  if (activeStore?.postex_token || (!activeStore?.instaworld_key && !activeStore?.instaworld_key_backup && !activeStore?.instaworld_key_3)) {
    bookChoices.push({ key: 'PostEx', label: '🚀 PostEx' });
  }
  if (activeStore?.instaworld_key) {
    bookChoices.push({ key: 'insta:primary', label: `🌐 Instaworld 1 (${activeStore.instaworld_key.substring(0, 4)}...)` });
  }
  if (activeStore?.instaworld_key_backup) {
    bookChoices.push({ key: 'insta:backup', label: `🌐 Instaworld 2 (${activeStore.instaworld_key_backup.substring(0, 4)}...)` });
  }
  if (activeStore?.instaworld_key_3) {
    bookChoices.push({ key: 'insta:key3', label: `🌐 Instaworld 3 (${activeStore.instaworld_key_3.substring(0, 4)}...)` });
  }

  return (
    <div
      className="eom-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div className="eom-shell">
        <OrderHeader
          editingOrder={editingOrder}
          onClose={requestClose}
          editorLoading={editorLoading}
          custIntel={custIntel}
          handleCancelOrder={handleCancelOrder}
          actionBusy={actionBusy}
          isDirty={isDirty}
          addToast={addToast}
        >
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setActiveTab('financials')}
              className={`eom-tab ${activeTab === 'financials' ? 'active' : ''}`}
            >
              <span>🛒</span>
              <span>Line Items &amp; Financials</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('customer')}
              className={`eom-tab ${activeTab === 'customer' ? 'active' : ''}`}
            >
              <span>👤</span>
              <span>Customer &amp; WhatsApp</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('logistics')}
              className={`eom-tab ${activeTab === 'logistics' ? 'active' : ''}`}
            >
              <span>🚚</span>
              <span>Courier &amp; Tracking</span>
              {Boolean(editingOrder.tracking_number) && (
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
              )}
            </button>
          </div>
        </OrderHeader>

        {/* Modal Body */}
        <div className="eom-body">
          {/* TAB 1: Line Items & Financials */}
          {activeTab === 'financials' && (
            <div className="eom-grid-main">
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

              <PaymentSummary
                liveSubtotal={liveSubtotal}
                localDiscount={localDiscount}
                setLocalDiscount={setLocalDiscount}
                shippingFee={localShippingFee}
                setShippingFee={setLocalShippingFee}
                courierFee={editingOrder.courier_fee ?? 0}
                setCourierFee={(val) => setEditingOrder(prev => ({ ...prev, courier_fee: val }))}
                onCourierFeeBlur={() => {
                  if (updateOrderField) {
                    updateOrderField(editingOrder.id, 'courier_fee', parseFloat(editingOrder.courier_fee || 0) || 0);
                  }
                }}
                liveTotal={liveTotal}
                totalOrderCost={totalOrderCost}
                zeroCostCount={zeroCostCount}
                netProfit={netProfit}
                profitMargin={profitMargin}
                paymentStatus={editingOrder.payment_status}
                localNotes={localNotes}
                setLocalNotes={setLocalNotes}
              />
            </div>
          )}

          {/* TAB 2: Customer & WhatsApp */}
          {activeTab === 'customer' && (
            <div className="eom-grid-customer">
              {/* Left Column: Customer Intelligence + Details */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {/* Customer Track Record KPI Strip */}
                <div className="eom-card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '1.1rem' }}>
                      {Number(custIntel?.returned || 0) > 0 ? '⚠️' : Number(custIntel?.delivered || 0) >= 2 ? '⭐' : '📊'}
                    </span>
                    <div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                        Customer Delivery History
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                        {custIntelLoading
                          ? 'Checking past orders...'
                          : Number(custIntel?.total || 0) <= 1
                          ? 'First-time customer'
                          : Number(custIntel?.returned || 0) === 0
                          ? 'Trusted repeat buyer — 0% historical RTO'
                          : `${custIntel.rto_rate || 0}% historical RTO rate`}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: 8, fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Orders: {custIntel?.total || 0}
                    </span>
                    <span style={{ background: 'rgba(16,185,129,0.12)', color: '#059669', border: '1px solid rgba(16,185,129,0.28)', padding: '4px 10px', borderRadius: 8, fontSize: '0.74rem', fontWeight: 700 }}>
                      Delivered: {custIntel?.delivered || 0}
                    </span>
                    <span style={{
                      background: Number(custIntel?.returned || 0) > 0 ? 'rgba(239,68,68,0.12)' : 'var(--bg-elevated)',
                      color: Number(custIntel?.returned || 0) > 0 ? '#dc2626' : 'var(--text-secondary)',
                      border: `1px solid ${Number(custIntel?.returned || 0) > 0 ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
                      padding: '4px 10px', borderRadius: 8, fontSize: '0.74rem', fontWeight: 700
                    }}>
                      Returned: {custIntel?.returned || 0}
                    </span>
                  </div>
                </div>

                {/* Customer Details Card */}
                <div className="eom-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                    👤 Customer &amp; Shipping Details
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
                    <div>
                      <label className="eom-label">Full Name</label>
                      <input
                        className="eom-input"
                        value={editingOrder.customer_name || ''}
                        onChange={e => setEditingOrder(prev => ({ ...prev, customer_name: e.target.value }))}
                        onBlur={() => updateOrderField && updateOrderField(editingOrder.id, 'customer_name', editingOrder.customer_name)}
                      />
                    </div>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <label className="eom-label" style={{ marginBottom: 0 }}>Phone Number</label>
                        {editingOrder.phone && (
                          <a href={`tel:${editingOrder.phone}`} style={{ fontSize: '0.73rem', color: '#6366f1', textDecoration: 'none', fontWeight: 700 }}>
                            📞 Call SIM
                          </a>
                        )}
                      </div>
                      <input
                        className="eom-input"
                        value={editingOrder.phone || ''}
                        onChange={e => setEditingOrder(prev => ({ ...prev, phone: e.target.value }))}
                        onBlur={() => updateOrderField && updateOrderField(editingOrder.id, 'phone', editingOrder.phone)}
                      />
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8, flexWrap: 'wrap' }}>
                      <label className="eom-label" style={{ marginBottom: 0 }}>Delivery Address</label>
                      <span style={{ background: addrScore.bg, color: addrScore.color, padding: '2px 9px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 700 }}>
                        {addrScore.label}
                      </span>
                    </div>
                    <textarea
                      rows={3}
                      className="eom-textarea"
                      value={editingOrder.address || ''}
                      onChange={e => setEditingOrder(prev => ({ ...prev, address: e.target.value }))}
                      onBlur={() => updateOrderField && updateOrderField(editingOrder.id, 'address', editingOrder.address)}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Include house/flat #, street/block &amp; landmark.</span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          onClick={handleAddressCleanse}
                          style={{
                            background: 'rgba(99,102,241,0.12)', color: '#6366f1',
                            border: '1px solid rgba(99,102,241,0.32)', padding: '6px 11px',
                            borderRadius: 9, fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer'
                          }}
                        >
                          ✨ Format Address
                        </button>
                        <button
                          type="button"
                          disabled={mapsVerifyLoading}
                          onClick={handleGoogleMapsVerify}
                          style={{
                            background: 'rgba(16,185,129,0.12)', color: '#059669',
                            border: '1px solid rgba(16,185,129,0.32)', padding: '6px 11px',
                            borderRadius: 9, fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer'
                          }}
                        >
                          {mapsVerifyLoading ? '⏳ Verifying...' : '🗺️ Maps Verify'}
                        </button>
                      </div>
                    </div>

                    <AddressVerificationPanel
                      mapsVerifyResult={mapsVerifyResult}
                      setMapsVerifyResult={setMapsVerifyResult}
                      editingOrder={editingOrder}
                      handleApplyStandardAddress={handleApplyStandardAddress}
                    />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8, flexWrap: 'wrap' }}>
                      <label className="eom-label" style={{ marginBottom: 0 }}>City</label>
                      {editingOrder.city ? (
                        isCityValid ? (
                          <span style={{ background: 'rgba(16,185,129,0.12)', color: '#059669', padding: '2px 9px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 700 }}>
                            ✓ Valid PostEx City
                          </span>
                        ) : (
                          <span style={{ background: 'rgba(245,158,11,0.14)', color: '#d97706', padding: '2px 9px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 700 }}>
                            ⚠️ Unrecognized PostEx City
                          </span>
                        )
                      ) : (
                        <span style={{ background: 'rgba(239,68,68,0.12)', color: '#dc2626', padding: '2px 9px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 700 }}>
                          🔴 City Missing
                        </span>
                      )}
                    </div>
                    <input
                      className="eom-input"
                      style={{
                        maxWidth: 320,
                        borderColor: editingOrder.city && !isCityValid ? '#f59e0b' : undefined
                      }}
                      value={editingOrder.city || ''}
                      onChange={e => setEditingOrder(prev => ({ ...prev, city: e.target.value }))}
                      onBlur={() => updateOrderField && updateOrderField(editingOrder.id, 'city', editingOrder.city)}
                    />
                  </div>
                </div>
              </div>

              {/* Right Column: Manual WhatsApp Tools + Shopify Customer Notes */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {/* 1. Manual WhatsApp Templates */}
                <div className="eom-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                    💬 WhatsApp Message Templates
                  </div>
                  <select onChange={handleManualAction} defaultValue="" className="eom-select">
                    <option value="" disabled>Select template / quick action...</option>
                    <option value="manual_cod">Manual COD Confirm</option>
                    {waTemplates.length > 0 && (
                      <optgroup label="Saved WhatsApp Templates">
                        {waTemplates.map(t => (
                          <option key={t.id} value={`template_${t.id}`}>{t.name}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    Opens WhatsApp Desktop / Web with order variables and product images pre-filled.
                  </span>
                </div>

                {/* 2. Send Catalog by Size */}
                <div className="eom-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                    📏 Send In-Stock Catalog by Size
                  </div>

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <select
                      value={selectedSize}
                      onChange={(e) => setSelectedSize(e.target.value)}
                      className="eom-select"
                      style={{ flex: 1 }}
                    >
                      <optgroup label="Standard Sizes">
                        {['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL'].map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Waist / Numeric Sizes">
                        {['30', '32', '34', '36', '38', '40', '42', '44', '46'].map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </optgroup>
                    </select>

                    <button
                      type="button"
                      onClick={handleSendCatalogImages}
                      disabled={sendingCatalog || selectedCatalogVariants.size === 0}
                      style={{
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        color: '#fff',
                        border: 'none',
                        padding: '9px 14px',
                        borderRadius: 10,
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        opacity: (sendingCatalog || selectedCatalogVariants.size === 0) ? 0.55 : 1
                      }}
                    >
                      {sendingCatalog ? '⏳ Sending...' : `📸 Send (${selectedCatalogVariants.size})`}
                    </button>
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.74rem', color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={includeContinueSelling}
                      onChange={(e) => setIncludeContinueSelling(e.target.checked)}
                    />
                    Include "Continue Selling" OOS variants
                  </label>

                  {loadingCatalog ? (
                    <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                      ⏳ Loading size {selectedSize} catalog...
                    </div>
                  ) : catalogVariants.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 700, color: 'var(--text-primary)' }}>
                          <input
                            type="checkbox"
                            checked={catalogVariants.slice(batchIndex * 30, (batchIndex + 1) * 30).every(v => selectedCatalogVariants.has(v.shopify_variant_id))}
                            onChange={handleSelectAllToggle}
                          />
                          Select Batch ({selectedCatalogVariants.size})
                        </label>
                        {catalogVariants.length > 30 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span>
                              {batchIndex * 30 + 1}-{Math.min((batchIndex + 1) * 30, catalogVariants.length)} / {catalogVariants.length}
                            </span>
                            <button
                              type="button"
                              disabled={batchIndex === 0}
                              onClick={() => setBatchIndex(p => p - 1)}
                              style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', opacity: batchIndex === 0 ? 0.4 : 1 }}
                            >&lt;</button>
                            <button
                              type="button"
                              disabled={(batchIndex + 1) * 30 >= catalogVariants.length}
                              onClick={() => setBatchIndex(p => p + 1)}
                              style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', opacity: (batchIndex + 1) * 30 >= catalogVariants.length ? 0.4 : 1 }}
                            >&gt;</button>
                          </div>
                        )}
                      </div>

                      <div style={{
                        maxHeight: 190, overflowY: 'auto',
                        border: '1px solid var(--border)', borderRadius: 10,
                        background: 'var(--bg-elevated)', padding: 6,
                        display: 'flex', flexDirection: 'column', gap: 5
                      }}>
                        {catalogVariants.slice(batchIndex * 30, (batchIndex + 1) * 30).map((v) => {
                          const isSelected = selectedCatalogVariants.has(v.shopify_variant_id);
                          return (
                            <div
                              key={v.shopify_variant_id}
                              onClick={() => toggleVariantSelection(v.shopify_variant_id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '5px 7px', borderRadius: 8, cursor: 'pointer',
                                background: isSelected ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                                border: `1px solid ${isSelected ? 'rgba(16, 185, 129, 0.3)' : 'transparent'}`
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => { e.stopPropagation(); toggleVariantSelection(v.shopify_variant_id); }}
                              />
                              <img
                                src={v.image_url}
                                alt={v.title}
                                style={{ width: 30, height: 30, borderRadius: 6, objectFit: 'cover', border: '1px solid var(--border)' }}
                              />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {v.title}
                                </div>
                                {v.sku && <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{v.sku}</div>}
                              </div>
                              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#059669', flexShrink: 0 }}>
                                Rs {Number(v.price || 0).toLocaleString()}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: 14, border: '1px dashed var(--border-bright)', borderRadius: 10, textAlign: 'center', color: catalogError ? '#dc2626' : '#d97706', fontSize: '0.78rem' }}>
                      {catalogError ? `❌ ${catalogError}` : `⚠️ No in-stock items matching size ${selectedSize}`}
                    </div>
                  )}
                </div>

                {/* 3. Shopify Customer Notes */}
                <div className="eom-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                    📝 Shopify Customer Notes
                  </div>
                  <textarea
                    rows={3}
                    className="eom-textarea"
                    value={editingOrder.notes || ''}
                    onChange={e => setEditingOrder(prev => ({ ...prev, notes: e.target.value }))}
                    onBlur={() => updateOrderField && updateOrderField(editingOrder.id, 'notes', editingOrder.notes)}
                    placeholder="Customer delivery instructions or notes..."
                  />
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Syncs live with Shopify order notes on blur.</span>
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
              liveHistory={liveHistory}
              refreshLiveTracking={refreshLiveTracking}
              bookingCourier={bookingCourier}
              actionBusy={actionBusy}
              handleBookCourier={handleBookCourier}
              handleCancelBooking={handleCancelBooking}
              zeroCostCount={zeroCostCount}
              activeCouriers={activeCouriers}
              updateOrderField={updateOrderField}
              editingOrder={editingOrder}
              setEditingOrder={setEditingOrder}
              addToast={addToast}
            />
          )}
        </div>

        {/* Sticky Bottom Action Bar */}
        <div className="eom-footer">
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span>Customer: <strong style={{ color: 'var(--text-primary)' }}>{editingOrder.customer_name || '—'}</strong></span>
            <span>•</span>
            <span>{editingOrder.city || 'No City'}</span>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', position: 'relative' }}>
            {/* Contextual Order Lifecycle Controls */}
            {canConfirm && (
              <button
                type="button"
                onClick={handleConfirmOrder}
                disabled={actionBusy}
                title="Confirm order and add 'Ready to Book' tag on Shopify"
                style={{
                  background: 'rgba(16, 185, 129, 0.14)',
                  color: '#059669',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  padding: '9px 14px',
                  borderRadius: 10,
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {actionBusy ? '⏳...' : '✅ Confirm (+Tag)'}
              </button>
            )}

            {isConfirmed && (
              <button
                type="button"
                onClick={handleRevertConfirm}
                disabled={actionBusy}
                title="Revert back to Pending and remove 'Ready to Book' tag on Shopify"
                style={{
                  background: 'rgba(245, 158, 11, 0.14)',
                  color: '#d97706',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  padding: '9px 13px',
                  borderRadius: 10,
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {actionBusy ? '⏳...' : '↩️ Revert'}
              </button>
            )}

            {!isBooked && !isFinal && (
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setShowBookMenu(prev => !prev)}
                  disabled={bookingCourier}
                  style={{
                    background: 'var(--bg-elevated)',
                    color: '#6366f1',
                    border: '1px solid #6366f1',
                    padding: '9px 14px',
                    borderRadius: 10,
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {bookingCourier ? '⏳ Booking...' : '🚀 Book Courier ▾'}
                </button>
                {showBookMenu && (
                  <div style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 8px)',
                    right: 0,
                    minWidth: 220,
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-bright)',
                    borderRadius: 12,
                    boxShadow: '0 14px 32px rgba(0,0,0,0.28)',
                    padding: 6,
                    zIndex: 40,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4
                  }}>
                    {bookChoices.map(ch => (
                      <button
                        key={ch.key}
                        type="button"
                        onClick={() => {
                          setShowBookMenu(false);
                          handleBookCourier(ch.key);
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-primary)',
                          padding: '8px 12px',
                          borderRadius: 8,
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          textAlign: 'left',
                          cursor: 'pointer'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        {ch.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {canCancelBooking && (
              <button
                type="button"
                onClick={handleCancelBooking}
                disabled={actionBusy}
                style={{
                  background: 'rgba(239, 68, 68, 0.12)',
                  color: '#dc2626',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  padding: '9px 14px',
                  borderRadius: 10,
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {actionBusy ? '⏳...' : '🛑 Cancel Booking'}
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                const opened = openPackingSlipPrint({
                  order: editingOrder,
                  items: localItems,
                  subtotal: liveSubtotal,
                  discount: localDiscount,
                  shippingFee: localShippingFee,
                  total: liveTotal,
                  storeName: activeStore?.store_name || activeStore?.shop_domain || 'TRACE ERP'
                });
                if (!opened) addToast('⚠️ Popup blocked — allow popups to print Packing Slip.', 'warning');
              }}
              style={{
                background: 'var(--bg-elevated)',
                color: '#059669',
                border: '1px solid rgba(16, 185, 129, 0.45)',
                padding: '9px 14px',
                borderRadius: 10,
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              🖨️ Packing Slip
            </button>

            <button
              type="button"
              onClick={handleCSUpdate}
              disabled={isSavingCS}
              style={{
                background: isDirty ? '#4f46e5' : '#6366f1',
                color: '#fff',
                border: 'none',
                padding: '9px 20px',
                borderRadius: 10,
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: isDirty ? '0 0 0 3px rgba(99,102,241,0.32)' : '0 4px 12px rgba(99,102,241,0.25)'
              }}
            >
              {isSavingCS ? '⏳ Saving...' : isDirty ? '💾 Save Changes ●' : '💾 Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
