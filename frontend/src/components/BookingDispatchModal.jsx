import React, { useEffect, useMemo, useState } from 'react';
import {
  COURIER_REMARK_PRESETS,
  hasRemarkPhrase,
  toggleRemarkPhrase,
  appendRemarkPhrase,
  detectSafeNoteHints,
  formatPickupOptionLabel,
} from '../utils/courierBookingPresets';

function getCourierMeta(courier) {
  if (courier === 'PostEx') {
    return { isPostEx: true, icon: '🚀', label: 'PostEx Courier', accent: '#f97316', accountType: null };
  }
  if (courier === 'insta:backup') {
    return { isPostEx: false, icon: '🌐', label: 'Instaworld API 2 (Backup)', accent: '#3b82f6', accountType: 'backup' };
  }
  if (courier === 'insta:key3') {
    return { isPostEx: false, icon: '🌐', label: 'Instaworld API 3', accent: '#eab308', accountType: 'key3' };
  }
  return { isPostEx: false, icon: '🌐', label: 'Instaworld API 1 (Primary)', accent: '#10b981', accountType: 'primary' };
}

function getOrderBlockReason(order, editedCity) {
  if (order.tracking_number && String(order.tracking_number).trim() !== '' && String(order.tracking_number).trim() !== '—') {
    return { code: 'tracked', label: `Already Booked (${order.tracking_number})` };
  }
  if (!order.cost || parseFloat(order.cost) <= 0) {
    return { code: 'cost', label: 'Zero Cost (Rs 0)' };
  }
  const cityVal = editedCity !== undefined ? editedCity : order.city;
  if (!cityVal || String(cityVal).trim() === '') {
    return { code: 'city', label: 'Missing City' };
  }
  return null;
}

export default function BookingDispatchModal({
  show,
  onClose,
  courier = 'PostEx',
  orders = [],
  activeStore,
  onStoreDefaultsSaved,
  onBookingSubmitted,
  addToast,
}) {
  const meta = getCourierMeta(courier);
  const storeId = activeStore?.id || orders[0]?.store_id;

  const [locations, setLocations] = useState([]);
  const [locLoading, setLocLoading] = useState(false);
  const [locError, setLocError] = useState('');
  const [pickupCode, setPickupCode] = useState('');
  const [manualPickupCode, setManualPickupCode] = useState('');
  const [instaPickupAddress, setInstaPickupAddress] = useState('');
  const [savingDefault, setSavingDefault] = useState(false);

  const [batchRemark, setBatchRemark] = useState('');
  const [includedIds, setIncludedIds] = useState({});
  const [remarksById, setRemarksById] = useState({});
  const [pickupById, setPickupById] = useState({});
  const [cityById, setCityById] = useState({});
  const [validCities, setValidCities] = useState([]);
  const [filterText, setFilterText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const validCitySet = useMemo(() => new Set(validCities.map(c => String(c || '').trim().toLowerCase())), [validCities]);

  // Initialize per-order states whenever modal opens with a new selection
  useEffect(() => {
    if (!show) return;
    const defaultRem = activeStore?.default_courier_remarks || '';
    const nextIncluded = {};
    const nextRemarks = {};
    const nextPickup = {};
    const nextCity = {};

    orders.forEach((o) => {
      const blocked = getOrderBlockReason(o, o.city);
      nextIncluded[o.id] = !blocked;
      nextRemarks[o.id] = (o.courier_remarks && String(o.courier_remarks).trim() !== '')
        ? String(o.courier_remarks)
        : defaultRem;
      nextPickup[o.id] = o.pickup_address_code || '';
      nextCity[o.id] = o.city || '';
    });

    setIncludedIds(nextIncluded);
    setRemarksById(nextRemarks);
    setPickupById(nextPickup);
    setCityById(nextCity);
    setBatchRemark(defaultRem);
    setPickupCode(activeStore?.postex_pickup_code || '');
    setManualPickupCode('');
    setInstaPickupAddress(activeStore?.instaworld_pickup_address || '');
    setFilterText('');
    setLocError('');

    if (storeId) {
      fetchLocations(false);
    }

    // Load valid courier cities for inline autocomplete & validation
    const apiUrl = import.meta.env.VITE_API_URL || '';
    const token = localStorage.getItem('trace_token');
    const targetCourier = meta.isPostEx ? 'PostEx' : 'Instaworld';
    fetch(`${apiUrl}/api/orders/logistics/cities?courier=${encodeURIComponent(targetCourier)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => (r.ok ? r.json() : []))
      .then(list => { if (Array.isArray(list)) setValidCities(list); })
      .catch(() => {});
  }, [show, courier, storeId]);

  const fetchLocations = async (forceRefresh = false) => {
    if (!storeId) return;
    setLocLoading(true);
    setLocError('');
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const token = localStorage.getItem('trace_token');
      const res = await fetch(`${apiUrl}/api/stores/${storeId}/pickup-locations${forceRefresh ? '?refresh=1' : ''}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        const list = Array.isArray(data.locations) ? data.locations : [];
        setLocations(list);
        if (data.error && list.length === 0) setLocError(data.error);

        const defCode = data.default_pickup_code || activeStore?.postex_pickup_code || '';
        if (defCode) {
          setPickupCode(defCode);
        } else if (list.length === 1 && list[0].addressCode) {
          setPickupCode(list[0].addressCode);
        }
        if (data.instaworld_pickup_address && !instaPickupAddress) {
          setInstaPickupAddress(data.instaworld_pickup_address);
        }
        if (forceRefresh && list.length > 0 && addToast) {
          addToast(`📍 Loaded ${list.length} PostEx pickup location(s)`, 'success', 2200);
        }
      } else if (forceRefresh) {
        setLocError(data.error || 'Could not fetch pickup locations');
      }
    } catch (err) {
      if (forceRefresh) setLocError(err.message || 'Network error');
    } finally {
      setLocLoading(false);
    }
  };

  const resolvedBatchPickup = useMemo(() => {
    if (meta.isPostEx) {
      return (pickupCode === '__manual__' ? manualPickupCode : pickupCode).trim();
    }
    return instaPickupAddress.trim();
  }, [meta.isPostEx, pickupCode, manualPickupCode, instaPickupAddress]);

  const handleSaveAsDefault = async () => {
    if (!storeId) return;
    setSavingDefault(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const token = localStorage.getItem('trace_token');
      const selectedLoc = locations.find(l => l.addressCode === resolvedBatchPickup);
      const body = meta.isPostEx
        ? {
            postex_pickup_code: resolvedBatchPickup,
            postex_pickup_label: selectedLoc ? formatPickupOptionLabel(selectedLoc) : resolvedBatchPickup,
          }
        : { instaworld_pickup_address: resolvedBatchPickup };

      const res = await fetch(`${apiUrl}/api/stores/${storeId}/pickup-defaults`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        if (addToast) addToast('⭐ Default pickup location saved for this store!', 'success', 2400);
        if (onStoreDefaultsSaved) onStoreDefaultsSaved(data);
      } else {
        throw new Error(data.error || 'Failed to save default');
      }
    } catch (err) {
      if (addToast) addToast(`❌ ${err.message}`, 'error');
    } finally {
      setSavingDefault(false);
    }
  };

  const orderStates = useMemo(() => {
    return orders.map((o) => ({
      order: o,
      blocked: getOrderBlockReason(o, cityById[o.id]),
    }));
  }, [orders, cityById]);

  const readyOrders = useMemo(() => {
    return orderStates.filter(({ order, blocked }) => !blocked && includedIds[order.id]).map(x => x.order);
  }, [orderStates, includedIds]);

  const blockedCount = useMemo(() => orderStates.filter(x => Boolean(x.blocked)).length, [orderStates]);

  const visibleOrderStates = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return orderStates;
    return orderStates.filter(({ order }) =>
      String(order.ref_number || '').toLowerCase().includes(q) ||
      String(order.customer_name || '').toLowerCase().includes(q) ||
      String(cityById[order.id] || order.city || '').toLowerCase().includes(q) ||
      String(order.phone || '').toLowerCase().includes(q)
    );
  }, [orderStates, filterText, cityById]);

  const applyBatchRemarkToAll = () => {
    const text = batchRemark.trim();
    setRemarksById((prev) => {
      const next = { ...prev };
      readyOrders.forEach((o) => { next[o.id] = text; });
      return next;
    });
    if (addToast) {
      addToast(
        text
          ? `📋 Applied "${text}" to ${readyOrders.length} ready order(s)`
          : `🧹 Cleared remarks on ${readyOrders.length} ready order(s)`,
        'info',
        2000
      );
    }
  };

  const appendChipToAll = (phrase) => {
    const nextBatch = toggleRemarkPhrase(batchRemark, phrase);
    setBatchRemark(nextBatch);
    const adding = hasRemarkPhrase(nextBatch, phrase);
    setRemarksById((prev) => {
      const next = { ...prev };
      readyOrders.forEach((o) => {
        next[o.id] = adding
          ? appendRemarkPhrase(prev[o.id] || '', phrase)
          : toggleRemarkPhrase(prev[o.id] || '', phrase);
      });
      return next;
    });
  };

  const handleConfirmDispatch = async () => {
    if (readyOrders.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const token = localStorage.getItem('trace_token');
      const authHeaders = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      // Single-order direct booking (instant tracking toast & immediate row update!)
      if (readyOrders.length === 1) {
        const ord = readyOrders[0];
        const ordRemark = String(remarksById[ord.id] || '').trim();
        const ordPickup = String(pickupById[ord.id] || resolvedBatchPickup || '').trim();
        const ordCity = String(cityById[ord.id] !== undefined ? cityById[ord.id] : (ord.city || '')).trim();
        const endpoint = meta.isPostEx
          ? `${apiUrl}/api/orders/${ord.id}/book-postex`
          : `${apiUrl}/api/orders/${ord.id}/book-instaworld`;
        const payload = meta.isPostEx
          ? { pickup_address_code: ordPickup, remarks: ordRemark, city: ordCity }
          : { account_type: meta.accountType, pickup_address: ordPickup, remarks: ordRemark, city: ordCity };

        const res = await fetch(endpoint, { method: 'POST', headers: authHeaders, body: JSON.stringify(payload) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Booking rejected by courier');
        }

        if (onBookingSubmitted) {
          onBookingSubmitted({
            mode: 'single',
            orderId: ord.id,
            courier: meta.isPostEx ? 'PostEx' : 'Instaworld',
            data,
            remarks: ordRemark,
            pickupCode: ordPickup,
            city: ordCity,
          });
        }
        onClose();
        return;
      }

      // Multi-order bulk booking with batch pickup + per-order city, remarks & pickup overrides
      const perOrderRemarks = {};
      const perOrderPickup = {};
      const perOrderCity = {};
      readyOrders.forEach((o) => {
        perOrderRemarks[String(o.id)] = String(remarksById[o.id] || '').trim();
        const p = String(pickupById[o.id] || '').trim();
        if (p) perOrderPickup[String(o.id)] = p;
        const c = String(cityById[o.id] !== undefined ? cityById[o.id] : (o.city || '')).trim();
        if (c) perOrderCity[String(o.id)] = c;
      });

      const res = await fetch(`${apiUrl}/api/bulk/book`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          ids: readyOrders.map(o => o.id),
          courier,
          pickup_address_code: meta.isPostEx ? resolvedBatchPickup : '',
          pickup_address: !meta.isPostEx ? resolvedBatchPickup : '',
          default_remarks: batchRemark.trim(),
          per_order_remarks: perOrderRemarks,
          per_order_pickup: perOrderPickup,
          per_order_city: perOrderCity,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to start bulk booking');
      }

      if (onBookingSubmitted) {
        onBookingSubmitted({
          mode: 'bulk',
          ids: readyOrders.map(o => o.id),
          courier,
          pickupCode: resolvedBatchPickup,
          perOrderCity,
        });
      }
      onClose();
    } catch (err) {
      if (addToast) addToast(`❌ Booking Failed: ${err.message}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!show) return null;

  return (
    <div
      className="modal-overlay"
      style={{ zIndex: 10050, padding: 14 }}
      onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}
    >
      <div
        className="modal-content glass-panel"
        style={{
          width: '820px',
          maxWidth: '96vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          borderRadius: 16,
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          background: 'var(--bg-elevated)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.35rem' }}>{meta.icon}</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>
                {meta.label} — Dispatch & Slip Remarks
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                Pickup location select karein aur kisi bhi specific order (ya sab) par courier slip remarks add karein.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              width: 32,
              height: 32,
              borderRadius: 8,
              fontSize: '0.95rem',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            ✕
          </button>
        </div>

        {/* Controls Panel (Pickup Location + Batch Quick Remarks) */}
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          background: 'var(--bg-surface)',
        }}>
          {/* Row 1: Pickup Location */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <label style={{ fontSize: '0.74rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                📍 {meta.isPostEx ? 'PostEx Pickup Location (pickupAddressCode)' : 'Pickup / Warehouse Address (Optional)'}
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {meta.isPostEx && (
                  <button
                    type="button"
                    onClick={() => fetchLocations(true)}
                    disabled={locLoading}
                    style={{
                      fontSize: '0.72rem', fontWeight: 700, padding: '4px 9px', borderRadius: 7,
                      border: '1px solid var(--border-bright)', background: 'var(--bg-elevated)',
                      color: 'var(--text-primary)', cursor: 'pointer',
                    }}
                  >
                    {locLoading ? '⏳ Loading...' : '🔄 Fetch PostEx Locations'}
                  </button>
                )}
                {resolvedBatchPickup && (
                  <button
                    type="button"
                    onClick={handleSaveAsDefault}
                    disabled={savingDefault}
                    title="Save this pickup location as Store Default"
                    style={{
                      fontSize: '0.72rem', fontWeight: 700, padding: '4px 9px', borderRadius: 7,
                      border: '1px solid rgba(16,185,129,0.4)', background: 'rgba(16,185,129,0.1)',
                      color: '#059669', cursor: 'pointer',
                    }}
                  >
                    {savingDefault ? '⏳...' : '⭐ Set as Default'}
                  </button>
                )}
              </div>
            </div>

            {meta.isPostEx ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <select
                  value={pickupCode}
                  onChange={(e) => setPickupCode(e.target.value)}
                  className="form-input"
                  style={{ flex: 1, minWidth: 260, fontSize: '0.82rem', padding: '8px 10px' }}
                >
                  <option value="">— Use PostEx Account Default (No Override) —</option>
                  {locations.map((loc) => (
                    <option key={loc.addressCode || loc.address} value={loc.addressCode}>
                      {formatPickupOptionLabel(loc)}
                    </option>
                  ))}
                  {pickupCode && pickupCode !== '__manual__' && !locations.some(l => l.addressCode === pickupCode) && (
                    <option value={pickupCode}>Saved Code: {pickupCode}</option>
                  )}
                  <option value="__manual__">✏️ Enter Pickup Code Manually...</option>
                </select>
                {pickupCode === '__manual__' && (
                  <input
                    type="text"
                    value={manualPickupCode}
                    onChange={(e) => setManualPickupCode(e.target.value)}
                    placeholder="e.g. 001 or WH-LHR-01"
                    className="form-input font-mono"
                    style={{ width: 190, fontSize: '0.82rem', padding: '8px 10px' }}
                  />
                )}
              </div>
            ) : (
              <input
                type="text"
                value={instaPickupAddress}
                onChange={(e) => setInstaPickupAddress(e.target.value)}
                placeholder="Optional pickup warehouse address / label (leave blank for courier portal default)"
                className="form-input"
                style={{ fontSize: '0.82rem', padding: '8px 10px' }}
              />
            )}
            {locError && (
              <div style={{ fontSize: '0.72rem', color: '#d97706' }}>
                ⚠️ PostEx pickup fetch note: {locError} (you can still pick manual code or use account default)
              </div>
            )}
          </div>

          {/* Row 2: Batch Courier Slip Remarks */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <label style={{ fontSize: '0.74rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                📋 Courier Slip Remarks — Quick Presets (Click to toggle on all {readyOrders.length} orders)
              </label>
              <button
                type="button"
                onClick={() => {
                  setBatchRemark('');
                  setRemarksById((prev) => {
                    const next = { ...prev };
                    readyOrders.forEach(o => { next[o.id] = ''; });
                    return next;
                  });
                }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 600 }}
              >
                🧹 Clear All Remarks
              </button>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {COURIER_REMARK_PRESETS.map((p) => {
                const active = hasRemarkPhrase(batchRemark, p.text);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => appendChipToAll(p.text)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 999,
                      fontSize: '0.73rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: `1px solid ${active ? '#6366f1' : 'var(--border-bright)'}`,
                      background: active ? 'rgba(99,102,241,0.16)' : 'var(--bg-elevated)',
                      color: active ? '#6366f1' : 'var(--text-primary)',
                    }}
                  >
                    {active ? '✓ ' : '+ '}{p.label}
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={batchRemark}
                onChange={(e) => setBatchRemark(e.target.value)}
                placeholder="Type custom slip remark for all orders (e.g. Call before delivery; Open parcel allowed)..."
                maxLength={250}
                className="form-input"
                style={{ flex: 1, fontSize: '0.82rem', padding: '7px 10px' }}
              />
              {readyOrders.length > 1 && (
                <button
                  type="button"
                  onClick={applyBatchRemarkToAll}
                  style={{
                    padding: '7px 12px',
                    borderRadius: 8,
                    border: '1px solid #6366f1',
                    background: 'rgba(99,102,241,0.12)',
                    color: '#6366f1',
                    fontWeight: 700,
                    fontSize: '0.76rem',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Apply to All ({readyOrders.length})
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Per-Order Review & Individual Remarks List */}
        <div style={{
          flex: 1,
          minHeight: 160,
          overflowY: 'auto',
          padding: '12px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          background: 'var(--bg-primary)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: '0.76rem', fontWeight: 800, color: 'var(--text-secondary)' }}>
              📦 Selected Orders ({orders.length}) — Edit remarks on any specific order below:
            </div>
            {orders.length > 5 && (
              <input
                type="text"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Filter by #Ref, name, city..."
                className="form-input"
                style={{ width: 200, fontSize: '0.76rem', padding: '4px 9px' }}
              />
            )}
          </div>

          <datalist id="booking-dispatch-cities">
            {validCities.map((c) => <option key={c} value={c} />)}
          </datalist>

          {visibleOrderStates.map(({ order, blocked }) => {
            const checked = !blocked && Boolean(includedIds[order.id]);
            const isPrepaid = ['paid', 'payment posted'].includes(String(order.payment_status || '').toLowerCase());
            const remVal = remarksById[order.id] || '';
            const cityVal = cityById[order.id] !== undefined ? cityById[order.id] : (order.city || '');
            const cityTrim = String(cityVal || '').trim();
            const isCityExact = validCitySet.size > 0 && cityTrim !== '' && validCitySet.has(cityTrim.toLowerCase());
            const isHardBlocked = blocked && blocked.code !== 'city';
            const safeHints = detectSafeNoteHints(order.notes, remVal);

            return (
              <div
                key={order.id}
                style={{
                  border: `1px solid ${blocked ? 'rgba(239,68,68,0.35)' : checked ? 'var(--border-bright)' : 'var(--border)'}`,
                  background: blocked ? 'rgba(239,68,68,0.05)' : checked ? 'var(--bg-surface)' : 'var(--bg-elevated)',
                  opacity: checked ? 1 : 0.72,
                  borderRadius: 11,
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 7,
                }}
              >
                {/* Order Summary Row with Inline Editable City */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <input
                    type="checkbox"
                    disabled={Boolean(blocked)}
                    checked={checked}
                    onChange={(e) => setIncludedIds(prev => ({ ...prev, [order.id]: e.target.checked }))}
                    style={{ width: 15, height: 15, cursor: blocked ? 'not-allowed' : 'pointer' }}
                  />
                  <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '0.84rem', color: '#6366f1' }}>
                    {order.ref_number || `#${order.id}`}
                  </span>
                  <span style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                    {order.customer_name || 'Customer'}
                  </span>

                  {/* Inline Editable City with Courier Autocomplete + Live Validity Indicator */}
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: '0.72rem' }}>📍</span>
                    <input
                      type="text"
                      list="booking-dispatch-cities"
                      disabled={isHardBlocked}
                      value={cityVal}
                      onChange={(e) => {
                        const nextVal = e.target.value;
                        setCityById(prev => ({ ...prev, [order.id]: nextVal }));
                        if (nextVal.trim() !== '' && !getOrderBlockReason(order, nextVal)) {
                          setIncludedIds(prev => ({ ...prev, [order.id]: true }));
                        }
                      }}
                      placeholder="Enter delivery city..."
                      title={
                        !cityTrim
                          ? 'City is required before booking'
                          : isCityExact
                            ? `Valid ${meta.isPostEx ? 'PostEx' : 'Courier'} city`
                            : `Type or select an official ${meta.isPostEx ? 'PostEx' : 'Courier'} city`
                      }
                      className="form-input"
                      style={{
                        width: 170,
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: 7,
                        border: `1px solid ${
                          !cityTrim
                            ? '#ef4444'
                            : isCityExact
                              ? 'rgba(16,185,129,0.55)'
                              : validCitySet.size > 0
                                ? 'rgba(245,158,11,0.6)'
                                : 'var(--border-bright)'
                        }`,
                        background: !cityTrim
                          ? 'rgba(239,68,68,0.08)'
                          : isCityExact
                            ? 'rgba(16,185,129,0.08)'
                            : 'var(--bg-elevated)',
                      }}
                    />
                    {validCitySet.size > 0 && cityTrim !== '' && (
                      <span
                        title={isCityExact ? 'Valid courier city' : 'Non-standard city name — pick from dropdown suggestions'}
                        style={{ fontSize: '0.72rem', fontWeight: 800, color: isCityExact ? '#059669' : '#d97706' }}
                      >
                        {isCityExact ? '✓' : '⚠️'}
                      </span>
                    )}
                  </div>

                  <span style={{
                    marginLeft: 'auto',
                    fontSize: '0.74rem',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: 6,
                    background: isPrepaid ? 'rgba(16,185,129,0.14)' : 'var(--bg-elevated)',
                    color: isPrepaid ? '#059669' : 'var(--text-primary)',
                  }}>
                    {isPrepaid ? '💳 PREPAID (Rs 0)' : `💵 COD Rs ${Math.round(parseFloat(order.price) || 0).toLocaleString()}`}
                  </span>
                  {blocked && (
                    <span style={{
                      fontSize: '0.72rem', fontWeight: 800, padding: '2px 8px', borderRadius: 6,
                      background: 'rgba(239,68,68,0.14)', color: '#dc2626',
                    }}>
                      🛑 {blocked.label}
                    </span>
                  )}
                </div>

                {/* Per-Order Slip Remarks + Quick Toggle Chips */}
                {!isHardBlocked && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingLeft: 25 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        value={remVal}
                        onChange={(e) => setRemarksById(prev => ({ ...prev, [order.id]: e.target.value }))}
                        placeholder="Slip remarks for this order only (optional)..."
                        maxLength={250}
                        className="form-input"
                        style={{ flex: 1, minWidth: 210, fontSize: '0.78rem', padding: '5px 9px' }}
                      />
                      {COURIER_REMARK_PRESETS.slice(0, 3).map((p) => {
                        const isOn = hasRemarkPhrase(remVal, p.text);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setRemarksById(prev => ({ ...prev, [order.id]: toggleRemarkPhrase(prev[order.id] || '', p.text) }))}
                            title={`Toggle "${p.text}" on ${order.ref_number || `#${order.id}`}`}
                            style={{
                              padding: '4px 8px',
                              borderRadius: 7,
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              border: `1px solid ${isOn ? '#6366f1' : 'var(--border)'}`,
                              background: isOn ? 'rgba(99,102,241,0.16)' : 'var(--bg-elevated)',
                              color: isOn ? '#6366f1' : 'var(--text-secondary)',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {isOn ? '✓ ' : '+ '}{p.shortLabel}
                          </button>
                        );
                      })}
                      {meta.isPostEx && locations.length > 1 && (
                        <select
                          value={pickupById[order.id] || ''}
                          onChange={(e) => setPickupById(prev => ({ ...prev, [order.id]: e.target.value }))}
                          title="Override pickup warehouse for this order"
                          className="form-input"
                          style={{ width: 155, fontSize: '0.72rem', padding: '4px 6px' }}
                        >
                          <option value="">📍 Batch Pickup</option>
                          {locations.map((loc) => (
                            <option key={loc.addressCode} value={loc.addressCode}>
                              [{loc.addressCode}] {loc.cityName || loc.address}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {safeHints.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.7rem', color: '#d97706', fontWeight: 700 }}>
                          💡 Shopify Note detected:
                        </span>
                        {safeHints.map((hint) => (
                          <button
                            key={hint}
                            type="button"
                            onClick={() => setRemarksById(prev => ({ ...prev, [order.id]: appendRemarkPhrase(prev[order.id] || '', hint) }))}
                            style={{
                              padding: '2px 8px',
                              borderRadius: 999,
                              fontSize: '0.69rem',
                              fontWeight: 700,
                              border: '1px solid rgba(245,158,11,0.45)',
                              background: 'rgba(245,158,11,0.12)',
                              color: '#b45309',
                              cursor: 'pointer',
                            }}
                          >
                            + Add &quot;{hint}&quot;
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Sticky Footer */}
        <div style={{
          padding: '14px 20px',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-elevated)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span>
              ✅ Ready: <strong style={{ color: '#059669' }}>{readyOrders.length}</strong>
            </span>
            {blockedCount > 0 && (
              <span>
                🛑 Blocked/Skipped: <strong style={{ color: '#dc2626' }}>{blockedCount}</strong>
              </span>
            )}
            {resolvedBatchPickup && (
              <span>
                📍 Pickup: <strong style={{ color: 'var(--text-primary)' }}>{resolvedBatchPickup}</strong>
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={submitting}
              style={{ padding: '9px 16px', borderRadius: 9, fontSize: '0.82rem', fontWeight: 700 }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleConfirmDispatch}
              disabled={submitting || readyOrders.length === 0}
              style={{
                padding: '9px 20px',
                borderRadius: 9,
                fontSize: '0.84rem',
                fontWeight: 800,
                background: readyOrders.length === 0 ? 'var(--bg-surface)' : undefined,
              }}
            >
              {submitting
                ? '⏳ Booking...'
                : `${meta.icon} Confirm & Book ${readyOrders.length} Order${readyOrders.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
