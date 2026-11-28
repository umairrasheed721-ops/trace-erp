import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  COURIER_REMARK_PRESETS,
  hasRemarkPhrase,
  toggleRemarkPhrase,
  appendRemarkPhrase,
  detectSafeNoteHints,
  formatPickupOptionLabel,
  rankRelevantCities,
} from '../utils/courierBookingPresets';

/**
 * Floating Searchable City Selector for a specific Courier (PostEx / Instaworld):
 * - Always opens cleanly above scrollable containers (position: fixed)
 * - Shows "Closest Relevant Matches" at the top (handles "Dina Distt Jhelum" -> Dina / Jhelum, "Mirwah Gorchani" -> Mirpur Khas / Mirpur)
 * - Full searchable courier operational cities list below
 */
function SmartCitySelect({
  value,
  onChange,
  validCities = [],
  validCitySet,
  courierLabel = 'PostEx',
  disabled = false,
  onRefreshCities,
  refreshingCities = false,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState({ top: 0, left: 0, width: 250 });
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const searchInputRef = useRef(null);

  const cityTrim = String(value || '').trim();
  const isExact = validCitySet.size > 0 && cityTrim !== '' && validCitySet.has(cityTrim.toLowerCase());

  const updatePos = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const dropHeight = 290;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow < dropHeight && rect.top > dropHeight
      ? Math.max(8, rect.top - dropHeight - 4)
      : Math.min(window.innerHeight - 120, rect.bottom + 4);
    const width = Math.max(250, rect.width + 55);
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
    setPos({ top, left, width });
  };

  useEffect(() => {
    if (!open) return;
    updatePos();
    const onOutside = (e) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target) &&
        triggerRef.current && !triggerRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onEsc);
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    const focusTimer = setTimeout(() => {
      try {
        searchInputRef.current?.focus({ preventScroll: true });
      } catch (_) {
        searchInputRef.current?.focus();
      }
    }, 20);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onEsc);
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [open]);

  const queryForRelevance = search.trim() || cityTrim;
  const closestMatches = useMemo(
    () => rankRelevantCities(queryForRelevance, validCities, 6),
    [queryForRelevance, validCities]
  );

  const filteredAll = useMemo(() => {
    const q = search.trim().toLowerCase();
    const closestSet = new Set(closestMatches.map(c => c.toLowerCase()));
    return validCities.filter((c) => {
      const cl = c.toLowerCase();
      if (q && !cl.includes(q)) return false;
      return !closestSet.has(cl);
    });
  }, [validCities, search, closestMatches]);

  const selectCity = (cityName) => {
    onChange(cityName);
    setSearch('');
    setOpen(false);
  };

  return (
    <div ref={triggerRef} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, position: 'relative' }}>
      <span style={{ fontSize: '0.72rem' }}>📍</span>
      <div style={{ display: 'inline-flex', alignItems: 'center', position: 'relative' }}>
        <input
          type="text"
          disabled={disabled}
          value={value}
          onFocus={() => { if (!disabled) { setSearch(''); setOpen(true); } }}
          onChange={(e) => {
            onChange(e.target.value);
            setSearch(e.target.value);
            if (!open) setOpen(true);
          }}
          placeholder="Select or type city..."
          title={
            !cityTrim
              ? 'City is required before booking'
              : isExact
                ? `Valid ${courierLabel} city`
                : `Click to pick closest valid ${courierLabel} city`
          }
          className="form-input"
          style={{
            width: 175,
            fontSize: '0.76rem',
            fontWeight: 700,
            padding: '3px 24px 3px 8px',
            borderRadius: 7,
            border: `1px solid ${
              !cityTrim
                ? '#ef4444'
                : isExact
                  ? 'rgba(16,185,129,0.55)'
                  : validCitySet.size > 0
                    ? 'rgba(245,158,11,0.65)'
                    : 'var(--border-bright)'
            }`,
            background: !cityTrim
              ? 'rgba(239,68,68,0.08)'
              : isExact
                ? 'rgba(16,185,129,0.08)'
                : 'var(--bg-elevated)',
          }}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => { if (!disabled) { setSearch(''); setOpen(prev => !prev); } }}
          title={`Browse all ${validCities.length} ${courierLabel} cities`}
          style={{
            position: 'absolute',
            right: 2,
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontSize: '0.68rem',
            padding: '2px 5px',
          }}
        >
          ▾
        </button>
      </div>

      {validCitySet.size > 0 && cityTrim !== '' && (
        <span
          title={isExact ? `Valid ${courierLabel} city` : `Not an exact ${courierLabel} city — click dropdown for closest matches`}
          style={{ fontSize: '0.72rem', fontWeight: 800, color: isExact ? '#059669' : '#d97706' }}
        >
          {isExact ? '✓' : '⚠️'}
        </span>
      )}

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={popoverRef}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: pos.width,
            maxHeight: 290,
            zIndex: 99999,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-bright)',
            borderRadius: 11,
            boxShadow: '0 14px 36px rgba(0,0,0,0.28)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Search box + 1-Click Live Active Cities Refresh */}
          <div style={{ padding: '7px 8px', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)', display: 'flex', gap: 5, alignItems: 'center' }}>
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${courierLabel} cities (${validCities.length})...`}
              className="form-input"
              style={{ flex: 1, minWidth: 0, fontSize: '0.75rem', padding: '4px 8px' }}
            />
            {onRefreshCities && (
              <button
                type="button"
                disabled={refreshingCities}
                onClick={(e) => {
                  e.stopPropagation();
                  onRefreshCities();
                }}
                title={`Sync latest active ${courierLabel} cities live from API`}
                style={{
                  padding: '4px 7px',
                  borderRadius: 6,
                  border: '1px solid var(--border-bright)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  cursor: refreshingCities ? 'wait' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {refreshingCities ? '⏳' : '🔄'}
              </button>
            )}
          </div>

          <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
            {closestMatches.length > 0 && (
              <div>
                <div style={{
                  padding: '4px 10px',
                  fontSize: '0.65rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#6366f1',
                  background: 'rgba(99,102,241,0.06)',
                }}>
                  ✨ Closest Relevant ({courierLabel})
                </div>
                {closestMatches.map((c) => {
                  const selected = c.toLowerCase() === cityTrim.toLowerCase();
                  return (
                    <button
                      key={`rel-${c}`}
                      type="button"
                      onClick={() => selectCity(c)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '6px 11px',
                        border: 'none',
                        background: selected ? 'rgba(16,185,129,0.14)' : 'transparent',
                        color: selected ? '#059669' : 'var(--text-primary)',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span>{c}</span>
                      <span style={{ fontSize: '0.66rem', color: selected ? '#059669' : '#6366f1' }}>
                        {selected ? '✓ Selected' : 'Suggested'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div style={{
              padding: '4px 10px',
              fontSize: '0.65rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--text-muted)',
              borderTop: closestMatches.length ? '1px solid var(--border)' : 'none',
              marginTop: closestMatches.length ? 2 : 0,
            }}>
              📋 All {courierLabel} Cities ({filteredAll.length})
            </div>

            {filteredAll.length === 0 && closestMatches.length === 0 ? (
              <div style={{ padding: '12px 10px', fontSize: '0.74rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                No matching {courierLabel} cities found
              </div>
            ) : (
              filteredAll.map((c) => {
                const selected = c.toLowerCase() === cityTrim.toLowerCase();
                return (
                  <button
                    key={`all-${c}`}
                    type="button"
                    onClick={() => selectCity(c)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '5px 11px',
                      border: 'none',
                      background: selected ? 'rgba(16,185,129,0.12)' : 'transparent',
                      color: selected ? '#059669' : 'var(--text-primary)',
                      fontSize: '0.76rem',
                      fontWeight: selected ? 700 : 500,
                      cursor: 'pointer',
                    }}
                  >
                    {c}
                  </button>
                );
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

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
  onOpenPickList,
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
  const [codById, setCodById] = useState({});
  const [editingCodId, setEditingCodId] = useState(null);
  const [validCities, setValidCities] = useState([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [citiesSource, setCitiesSource] = useState('');
  const [riskById, setRiskById] = useState({});
  const [riskLoading, setRiskLoading] = useState(false);
  const [highRiskCount, setHighRiskCount] = useState(0);
  const [filterText, setFilterText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const validCitySet = useMemo(() => new Set(validCities.map(c => String(c || '').trim().toLowerCase())), [validCities]);

  const getOrderCodInfo = (ord) => {
    const fullPrice = Math.round((parseFloat(ord.price) || 0) * 100) / 100;
    const isPrepaid = ['paid', 'payment posted'].includes(String(ord.payment_status || '').toLowerCase());
    const defaultCod = isPrepaid ? 0 : fullPrice;
    const raw = codById[ord.id];
    const hasOverride = raw !== undefined && raw !== null && String(raw).trim() !== '' && Number.isFinite(Number(raw)) && Number(raw) >= 0;
    const effectiveCod = hasOverride ? Math.round(Number(raw) * 100) / 100 : defaultCod;
    const isCustom = hasOverride && Math.abs(effectiveCod - defaultCod) > 0.01;
    const advanceDiff = Math.round((fullPrice - effectiveCod) * 100) / 100;
    return { fullPrice, isPrepaid, defaultCod, effectiveCod, isCustom, advanceDiff };
  };

  // Initialize per-order states whenever modal opens with a new selection
  useEffect(() => {
    if (!show) return;
    const defaultRem = activeStore?.default_courier_remarks || '';
    const nextIncluded = {};
    const nextRemarks = {};
    const nextPickup = {};
    const nextCity = {};
    const nextCod = {};

    orders.forEach((o) => {
      const blocked = getOrderBlockReason(o, o.city);
      nextIncluded[o.id] = !blocked;
      nextRemarks[o.id] = (o.courier_remarks && String(o.courier_remarks).trim() !== '')
        ? String(o.courier_remarks)
        : defaultRem;
      nextPickup[o.id] = o.pickup_address_code || '';
      nextCity[o.id] = o.city || '';
      if (o.booked_cod_amount !== null && o.booked_cod_amount !== undefined && Number.isFinite(Number(o.booked_cod_amount))) {
        nextCod[o.id] = String(o.booked_cod_amount);
      }
    });

    setIncludedIds(nextIncluded);
    setRemarksById(nextRemarks);
    setPickupById(nextPickup);
    setCityById(nextCity);
    setCodById(nextCod);
    setEditingCodId(null);
    setBatchRemark(defaultRem);
    setPickupCode(activeStore?.postex_pickup_code || '');
    setManualPickupCode('');
    setInstaPickupAddress(activeStore?.instaworld_pickup_address || '');
    setFilterText('');
    setLocError('');

    if (storeId) {
      fetchLocations(false);
    }

    // Load live active operational cities for THIS specific courier (auto-syncs every 24h)
    loadCourierCities(false);

    // Pre-Dispatch Risk Shield: Check Blacklist, High RTO & 48h Duplicate Phone Orders in 1 batched call
    setRiskById({});
    setHighRiskCount(0);
    if (orders.length > 0) {
      setRiskLoading(true);
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const token = localStorage.getItem('trace_token') || localStorage.getItem('token') || '';
      fetch(`${apiUrl}/api/orders/booking-risk-check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ids: orders.map(o => o.id), store_id: storeId }),
      })
        .then(r => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data?.success || !data.risks) return;
          setRiskById(data.risks);
          setHighRiskCount(Number(data.highRiskCount) || 0);
          // Auto-uncheck any high-risk/blacklisted/duplicate order so operator must verify before dispatch
          const autoOffIds = Object.entries(data.risks)
            .filter(([, info]) => info?.autoUncheck)
            .map(([idStr]) => idStr);
          if (autoOffIds.length > 0) {
            setIncludedIds((prev) => {
              const next = { ...prev };
              autoOffIds.forEach((idStr) => {
                const numId = Number(idStr);
                if (Object.prototype.hasOwnProperty.call(next, numId)) next[numId] = false;
                if (Object.prototype.hasOwnProperty.call(next, idStr)) next[idStr] = false;
              });
              return next;
            });
          }
        })
        .catch(() => {})
        .finally(() => setRiskLoading(false));
    }
  }, [show, courier, storeId]);

  const loadCourierCities = async (forceRefresh = false) => {
    setCitiesLoading(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const token = localStorage.getItem('trace_token');
      const targetCourier = meta.isPostEx ? 'PostEx' : 'Instaworld';
      const storeQuery = storeId ? `&store_id=${encodeURIComponent(storeId)}` : '';
      const refreshQuery = forceRefresh ? '&refresh=1' : '';
      const res = await fetch(`${apiUrl}/api/orders/logistics/cities?courier=${encodeURIComponent(targetCourier)}${storeQuery}&meta=1${refreshQuery}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json().catch(() => null);
      const list = Array.isArray(data) ? data : (Array.isArray(data?.cities) ? data.cities : []);
      if (list.length > 0) {
        setValidCities(list);
        setCitiesSource(data?.source || '');
        if (forceRefresh && addToast) {
          addToast(`🌍 Synced ${list.length} active ${targetCourier} cities!`, 'success', 2400);
        }
      } else if (forceRefresh && addToast) {
        addToast(`⚠️ Could not refresh ${targetCourier} cities`, 'warning');
      }
    } catch (_) {
      if (forceRefresh && addToast) addToast('⚠️ Network error refreshing courier cities', 'error');
    } finally {
      setCitiesLoading(false);
    }
  };

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
  const customCodCount = useMemo(() => {
    return readyOrders.filter((o) => getOrderCodInfo(o).isCustom).length;
  }, [readyOrders, codById]);

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
        const codInfo = getOrderCodInfo(ord);
        const endpoint = meta.isPostEx
          ? `${apiUrl}/api/orders/${ord.id}/book-postex`
          : `${apiUrl}/api/orders/${ord.id}/book-instaworld`;
        const payload = meta.isPostEx
          ? { pickup_address_code: ordPickup, remarks: ordRemark, city: ordCity }
          : { account_type: meta.accountType, pickup_address: ordPickup, remarks: ordRemark, city: ordCity };
        if (codInfo.isCustom) {
          payload.cod_amount = codInfo.effectiveCod;
        }

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
            bookedCod: data.booked_cod_amount !== undefined ? data.booked_cod_amount : (codInfo.isCustom ? codInfo.effectiveCod : null),
          });
        }
        onClose();
        return;
      }

      // Multi-order bulk booking with batch pickup + per-order city, custom COD, remarks & pickup overrides
      const perOrderRemarks = {};
      const perOrderPickup = {};
      const perOrderCity = {};
      const perOrderCod = {};
      readyOrders.forEach((o) => {
        perOrderRemarks[String(o.id)] = String(remarksById[o.id] || '').trim();
        const p = String(pickupById[o.id] || '').trim();
        if (p) perOrderPickup[String(o.id)] = p;
        const c = String(cityById[o.id] !== undefined ? cityById[o.id] : (o.city || '')).trim();
        if (c) perOrderCity[String(o.id)] = c;
        const codInfo = getOrderCodInfo(o);
        if (codInfo.isCustom) perOrderCod[String(o.id)] = codInfo.effectiveCod;
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
          per_order_cod: perOrderCod,
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
          perOrderCod,
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: '0.76rem', fontWeight: 800, color: 'var(--text-secondary)' }}>
                📦 Selected Orders ({orders.length}) — Edit city, COD or remarks below:
              </div>
              <button
                type="button"
                disabled={citiesLoading}
                onClick={() => loadCourierCities(true)}
                title={`Auto-syncs every 24h (Source: ${citiesSource || 'cache'}). Click to force-refresh active ${meta.isPostEx ? 'PostEx' : 'Instaworld'} cities now.`}
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 999,
                  border: '1px solid var(--border-bright)',
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-secondary)',
                  cursor: citiesLoading ? 'wait' : 'pointer',
                }}
              >
                {citiesLoading ? '⏳ Syncing cities...' : `🌍 ${validCities.length} Active Cities · 🔄 Sync`}
              </button>
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

          {/* Pre-Dispatch Risk Shield Banner */}
          {riskLoading && (
            <div style={{
              padding: '7px 11px', borderRadius: 9, fontSize: '0.73rem', fontWeight: 700,
              background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', color: '#6366f1',
            }}>
              🛡️ Scanning Blacklist, RTO history &amp; 48h duplicate orders...
            </div>
          )}
          {!riskLoading && highRiskCount > 0 && (
            <div style={{
              padding: '8px 12px', borderRadius: 9, fontSize: '0.74rem', fontWeight: 700,
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.38)', color: '#dc2626',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
            }}>
              <span>
                🛡️ Pre-Dispatch Risk Shield: <strong>{highRiskCount} high-risk order{highRiskCount === 1 ? '' : 's'}</strong> auto-unchecked (Blacklisted / High RTO / 48h Duplicate). Call &amp; verify before re-checking.
              </span>
            </div>
          )}

          {visibleOrderStates.map(({ order, blocked }) => {
            const checked = !blocked && Boolean(includedIds[order.id]);
            const codInfo = getOrderCodInfo(order);
            const { fullPrice, isPrepaid, effectiveCod, isCustom, advanceDiff } = codInfo;
            const isEditingCod = editingCodId === order.id;
            const remVal = remarksById[order.id] || '';
            const cityVal = cityById[order.id] !== undefined ? cityById[order.id] : (order.city || '');
            const isHardBlocked = blocked && blocked.code !== 'city';
            const safeHints = detectSafeNoteHints(order.notes, remVal);
            const risk = riskById[String(order.id)] || null;
            const isHighRisk = Boolean(risk && (risk.level === 'critical' || risk.level === 'high'));

            return (
              <div
                key={order.id}
                style={{
                  border: `1px solid ${blocked || isHighRisk ? 'rgba(239,68,68,0.45)' : checked ? 'var(--border-bright)' : 'var(--border)'}`,
                  background: blocked ? 'rgba(239,68,68,0.05)' : isHighRisk ? 'rgba(239,68,68,0.04)' : checked ? 'var(--bg-surface)' : 'var(--bg-elevated)',
                  opacity: checked ? 1 : 0.78,
                  borderRadius: 11,
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 7,
                }}
              >
                {/* Order Summary Row with Smart Courier City Dropdown (Exact + Closest Relevant) */}
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

                  <SmartCitySelect
                    value={cityVal}
                    validCities={validCities}
                    validCitySet={validCitySet}
                    courierLabel={meta.isPostEx ? 'PostEx' : 'Instaworld'}
                    disabled={isHardBlocked}
                    onRefreshCities={() => loadCourierCities(true)}
                    refreshingCities={citiesLoading}
                    onChange={(nextVal) => {
                      setCityById(prev => ({ ...prev, [order.id]: nextVal }));
                      if (String(nextVal || '').trim() !== '' && !getOrderBlockReason(order, nextVal)) {
                        setIncludedIds(prev => ({ ...prev, [order.id]: true }));
                      }
                    }}
                  />

                  {/* Optional Per-Order Custom COD Override (click pill only when customer paid advance / partial COD) */}
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                    {isEditingCod && !isHardBlocked ? (
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '2px 6px',
                        borderRadius: 8,
                        border: '1.5px solid #6366f1',
                        background: 'var(--bg-elevated)',
                      }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#6366f1' }}>COD Rs</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          autoFocus
                          value={codById[order.id] !== undefined ? codById[order.id] : String(Math.round(effectiveCod))}
                          onChange={(e) => setCodById(prev => ({ ...prev, [order.id]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === 'Escape') {
                              e.preventDefault();
                              setEditingCodId(null);
                            }
                          }}
                          style={{
                            width: 72,
                            fontSize: '0.75rem',
                            fontWeight: 800,
                            padding: '2px 5px',
                            borderRadius: 5,
                            border: '1px solid var(--border-bright)',
                            background: 'var(--bg-surface)',
                            color: 'var(--text-primary)',
                            outline: 'none',
                          }}
                        />
                        {Math.abs(advanceDiff) > 0.01 && (
                          <span
                            title={advanceDiff > 0 ? `Advance difference Rs ${advanceDiff.toLocaleString()} (PNL will keep full Rs ${fullPrice.toLocaleString()} for bank cross-check)` : `Extra Rs ${Math.abs(advanceDiff).toLocaleString()} above order price`}
                            style={{
                              fontSize: '0.66rem',
                              fontWeight: 800,
                              padding: '1px 5px',
                              borderRadius: 5,
                              background: advanceDiff > 0 ? 'rgba(245,158,11,0.16)' : 'rgba(99,102,241,0.14)',
                              color: advanceDiff > 0 ? '#b45309' : '#6366f1',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {advanceDiff > 0 ? `Adv: Rs ${Math.round(advanceDiff).toLocaleString()}` : `+Rs ${Math.round(Math.abs(advanceDiff)).toLocaleString()}`}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setCodById(prev => ({ ...prev, [order.id]: '0' }))}
                          title="Set COD to Rs 0 (Full advance received)"
                          style={{
                            fontSize: '0.66rem', fontWeight: 800, padding: '2px 5px', borderRadius: 5,
                            border: '1px solid var(--border)', background: 'var(--bg-surface)',
                            color: '#059669', cursor: 'pointer',
                          }}
                        >
                          Rs 0
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingCodId(null)}
                          title="Done editing COD"
                          style={{
                            fontSize: '0.7rem', fontWeight: 800, padding: '2px 6px', borderRadius: 5,
                            border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer',
                          }}
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCodById(prev => {
                              const next = { ...prev };
                              delete next[order.id];
                              return next;
                            });
                            setEditingCodId(null);
                          }}
                          title={`Reset to full price (Rs ${Math.round(fullPrice).toLocaleString()})`}
                          style={{
                            fontSize: '0.7rem', fontWeight: 800, padding: '2px 5px', borderRadius: 5,
                            border: '1px solid var(--border)', background: 'transparent',
                            color: 'var(--text-muted)', cursor: 'pointer',
                          }}
                        >
                          ↺
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={isHardBlocked}
                          onClick={() => {
                            if (codById[order.id] === undefined) {
                              setCodById(prev => ({ ...prev, [order.id]: String(Math.round(effectiveCod)) }));
                            }
                            setEditingCodId(order.id);
                          }}
                          title={isCustom
                            ? `Custom COD Rs ${Math.round(effectiveCod).toLocaleString()} (Order Full Price Rs ${Math.round(fullPrice).toLocaleString()} intact for PNL cross-check). Click to edit.`
                            : 'Click to book with a custom COD amount (e.g. customer paid partial advance)'}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            fontSize: '0.74rem',
                            fontWeight: 800,
                            padding: '3px 8px',
                            borderRadius: 7,
                            cursor: isHardBlocked ? 'default' : 'pointer',
                            border: isCustom
                              ? '1px solid rgba(245,158,11,0.55)'
                              : `1px solid ${isPrepaid ? 'rgba(16,185,129,0.35)' : 'var(--border)'}`,
                            background: isCustom
                              ? 'rgba(245,158,11,0.14)'
                              : (isPrepaid ? 'rgba(16,185,129,0.14)' : 'var(--bg-elevated)'),
                            color: isCustom
                              ? '#b45309'
                              : (isPrepaid ? '#059669' : 'var(--text-primary)'),
                          }}
                        >
                          {isCustom ? (
                            <>
                              <span>💵 COD Rs {Math.round(effectiveCod).toLocaleString()}</span>
                              <span style={{ textDecoration: 'line-through', opacity: 0.6, fontSize: '0.68rem', fontWeight: 600 }}>
                                Rs {Math.round(fullPrice).toLocaleString()}
                              </span>
                              {advanceDiff > 0.01 && (
                                <span style={{
                                  fontSize: '0.65rem', padding: '0 4px', borderRadius: 4,
                                  background: 'rgba(180,83,9,0.15)', color: '#92400e',
                                }}>
                                  Adv {Math.round(advanceDiff).toLocaleString()}
                                </span>
                              )}
                              {!isHardBlocked && <span style={{ opacity: 0.7, fontSize: '0.68rem' }}>✏️</span>}
                            </>
                          ) : (
                            <>
                              <span>{isPrepaid ? '💳 PREPAID (Rs 0)' : `💵 COD Rs ${Math.round(fullPrice).toLocaleString()}`}</span>
                              {!isHardBlocked && <span style={{ opacity: 0.55, fontSize: '0.68rem' }}>✏️</span>}
                            </>
                          )}
                        </button>
                        {isCustom && !isHardBlocked && (
                          <button
                            type="button"
                            onClick={() => setCodById(prev => {
                              const next = { ...prev };
                              delete next[order.id];
                              return next;
                            })}
                            title={`Reset COD back to full Rs ${Math.round(fullPrice).toLocaleString()}`}
                            style={{
                              fontSize: '0.68rem', fontWeight: 800, padding: '2px 5px', borderRadius: 6,
                              border: '1px solid rgba(245,158,11,0.4)', background: 'transparent',
                              color: '#b45309', cursor: 'pointer',
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  {blocked && (
                    <span style={{
                      fontSize: '0.72rem', fontWeight: 800, padding: '2px 8px', borderRadius: 6,
                      background: 'rgba(239,68,68,0.14)', color: '#dc2626',
                    }}>
                      🛑 {blocked.label}
                    </span>
                  )}
                </div>

                {/* Inline Pre-Dispatch Risk Shield Badges (Blacklist / High RTO / 48h Duplicate) */}
                {risk?.flags?.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingLeft: 25 }}>
                    {risk.flags.map((f, idx) => (
                      <span
                        key={`${f.type}-${idx}`}
                        style={{
                          fontSize: '0.69rem',
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: 6,
                          background: f.type === 'rto_warn' ? 'rgba(245,158,11,0.14)' : 'rgba(239,68,68,0.14)',
                          color: f.type === 'rto_warn' ? '#b45309' : '#dc2626',
                          border: `1px solid ${f.type === 'rto_warn' ? 'rgba(245,158,11,0.35)' : 'rgba(239,68,68,0.35)'}`,
                        }}
                      >
                        {f.label}
                      </span>
                    ))}
                    {risk.autoUncheck && !checked && !blocked && (
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                        (Auto-unchecked — tick checkbox above to override)
                      </span>
                    )}
                  </div>
                )}

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
            {customCodCount > 0 && (
              <span>
                💵 Custom COD: <strong style={{ color: '#b45309' }}>{customCodCount} order{customCodCount === 1 ? '' : 's'}</strong>
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {onOpenPickList && readyOrders.length > 0 && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => onOpenPickList(readyOrders.map(o => o.id))}
                disabled={submitting}
                title="Open SKU-wise consolidated Warehouse Pick-List for ready orders"
                style={{ padding: '9px 14px', borderRadius: 9, fontSize: '0.8rem', fontWeight: 700 }}
              >
                📋 Pick-List ({readyOrders.length})
              </button>
            )}
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
