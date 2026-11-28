import React from 'react';
import { useApp } from '@context/AppContext';
import {
  COURIER_REMARK_PRESETS,
  hasRemarkPhrase,
  toggleRemarkPhrase,
  appendRemarkPhrase,
  detectSafeNoteHints,
  formatPickupOptionLabel,
} from '../utils/courierBookingPresets';

const FINAL_LOCKED_STATUSES = ['delivered', 'returned', 'return received', 'cancelled'];

function formatTrackingEventDate(raw) {
  if (!raw) return '';
  const str = String(raw).trim();
  // Preserve DD/MM/YYYY format accurately (Rule 14)
  const pkMatch = str.match(/^(\d{2})\/(\d{2})\/(\d{4})(.*)$/);
  if (pkMatch) {
    const [, dd, mm, yyyy, rest] = pkMatch;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mName = months[parseInt(mm, 10) - 1] || mm;
    return `${dd} ${mName} ${yyyy}${rest || ''}`;
  }
  return str;
}

const CourierBooking = React.memo(({
  courier,
  trackingNumber,
  trackingSlug,
  trackingLoading,
  trackingData,
  liveHistory = [],
  refreshLiveTracking,
  bookingCourier,
  actionBusy,
  handleBookCourier,
  handleCancelBooking,
  zeroCostCount = 0,
  activeCouriers = [],
  updateOrderField,
  editingOrder,
  setEditingOrder,
  addToast
}) => {
  const { activeStore } = useApp();
  const standardCouriers = ['PostEx', 'Instaworld', 'Self Delivery', 'Unassigned'];
  const [localCourier, setLocalCourier] = React.useState('Unassigned');
  const [localTracking, setLocalTracking] = React.useState('');
  const [showCustomInput, setShowCustomInput] = React.useState(false);
  const [customCourier, setCustomCourier] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);

  // Pickup Location & Courier Slip Remarks state
  const [pickupLocations, setPickupLocations] = React.useState([]);
  const [pickupLoading, setPickupLoading] = React.useState(false);
  const [localPickupCode, setLocalPickupCode] = React.useState('');
  const [localRemarks, setLocalRemarks] = React.useState('');
  const [savingDispatchMeta, setSavingDispatchMeta] = React.useState(false);

  React.useEffect(() => {
    setLocalRemarks(editingOrder?.courier_remarks || activeStore?.default_courier_remarks || '');
    setLocalPickupCode(editingOrder?.pickup_address_code || activeStore?.postex_pickup_code || '');
  }, [editingOrder?.id, editingOrder?.courier_remarks, editingOrder?.pickup_address_code, activeStore?.postex_pickup_code, activeStore?.default_courier_remarks]);

  const fetchPickupLocations = React.useCallback(async (forceRefresh = false) => {
    const targetStoreId = activeStore?.id || editingOrder?.store_id;
    if (!targetStoreId) return;
    setPickupLoading(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const token = localStorage.getItem('trace_token');
      const res = await fetch(`${apiUrl}/api/stores/${targetStoreId}/pickup-locations${forceRefresh ? '?refresh=1' : ''}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setPickupLocations(Array.isArray(data.locations) ? data.locations : []);
        if (!editingOrder?.pickup_address_code && data.default_pickup_code) {
          setLocalPickupCode(data.default_pickup_code);
        }
      }
    } catch (_) {}
    finally { setPickupLoading(false); }
  }, [activeStore?.id, editingOrder?.store_id, editingOrder?.pickup_address_code]);

  React.useEffect(() => {
    if (activeStore?.postex_token) {
      fetchPickupLocations(false);
    }
  }, [activeStore?.id, activeStore?.postex_token]);

  const handleSaveDispatchMeta = async () => {
    if (!editingOrder?.id || !updateOrderField) return;
    setSavingDispatchMeta(true);
    try {
      const trimmedRem = localRemarks.trim();
      const trimmedPickup = localPickupCode.trim();
      const updated = await updateOrderField(editingOrder.id, {
        courier_remarks: trimmedRem,
        pickup_address_code: trimmedPickup,
      });
      if (setEditingOrder) {
        setEditingOrder(prev => ({
          ...prev,
          ...(updated || {}),
          courier_remarks: trimmedRem,
          pickup_address_code: trimmedPickup,
          shop_domain: prev?.shop_domain,
        }));
      }
      if (addToast) addToast('📋 Pickup location & courier slip remarks saved!', 'success', 2000);
    } catch (err) {
      if (addToast) addToast(`❌ Save failed: ${err.message}`, 'error');
    } finally {
      setSavingDispatchMeta(false);
    }
  };

  const safeNoteHints = React.useMemo(
    () => detectSafeNoteHints(editingOrder?.notes, localRemarks),
    [editingOrder?.notes, localRemarks]
  );

  const courierOptions = React.useMemo(() => {
    const list = [...standardCouriers];
    if (Array.isArray(activeCouriers)) {
      activeCouriers.forEach(c => {
        if (c && !list.includes(c)) list.push(c);
      });
    }
    return list;
  }, [activeCouriers]);

  React.useEffect(() => {
    const currentCourier = courier || 'Unassigned';
    setLocalTracking(trackingNumber || '');

    if (courierOptions.includes(currentCourier)) {
      setLocalCourier(currentCourier);
      setShowCustomInput(false);
      setCustomCourier('');
    } else if (courier) {
      setLocalCourier('custom');
      setShowCustomInput(true);
      setCustomCourier(currentCourier);
    } else {
      setLocalCourier('Unassigned');
      setShowCustomInput(false);
      setCustomCourier('');
    }
  }, [courier, trackingNumber, courierOptions]);

  const handleCourierChange = (e) => {
    const val = e.target.value;
    setLocalCourier(val);
    setShowCustomInput(val === 'custom');
  };

  const handleSaveManualCourier = async () => {
    let finalCourier = localCourier;
    if (localCourier === 'custom') {
      finalCourier = customCourier.trim();
      if (!finalCourier) {
        if (addToast) addToast('⚠️ Please enter a custom courier name.', 'warning');
        return;
      }
    }

    setIsSaving(true);
    try {
      let updatedOrder = null;
      if (updateOrderField && editingOrder) {
        updatedOrder = await updateOrderField(editingOrder.id, {
          courier: finalCourier,
          tracking_number: localTracking.trim()
        });
      }
      if (setEditingOrder) {
        if (updatedOrder) {
          setEditingOrder(prev => ({ ...prev, ...updatedOrder, shop_domain: prev?.shop_domain }));
        } else {
          setEditingOrder(prev => ({
            ...prev,
            courier: finalCourier,
            tracking_number: localTracking.trim()
          }));
        }
      }
    } catch (err) {
      console.error('Failed to manually update courier details:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const statusLower = String(editingOrder?.delivery_status || '').toLowerCase();
  const canCancelBooking = Boolean(trackingNumber) && !FINAL_LOCKED_STATUSES.includes(statusLower);
  const isPrepaid = ['paid', 'partially_paid'].includes(String(editingOrder?.payment_status || '').toLowerCase());
  const hasRealSlug = Boolean(trackingSlug) && trackingSlug !== 'tr_mock_slug';

  const courierPortalUrl = React.useMemo(() => {
    if (!trackingNumber) return null;
    const cLower = String(courier || '').toLowerCase();
    if (cLower.includes('postex')) return `https://postex.pk/tracking?cn=${encodeURIComponent(trackingNumber)}`;
    if (cLower.includes('insta') || cLower.includes('leopard') || cLower.includes('tcs') || cLower.includes('lcs')) {
      return `https://insta-app-be.instaworld.pk/logistics/orderTracking/?tracking_number=${encodeURIComponent(trackingNumber)}`;
    }
    return null;
  }, [courier, trackingNumber]);

  const copyTracking = () => {
    if (!trackingNumber) return;
    navigator.clipboard?.writeText(trackingNumber).then(() => {
      if (addToast) addToast(`📋 Tracking ${trackingNumber} copied`, 'success');
    }).catch(() => {});
  };

  const hasPostex = Boolean(activeStore?.postex_token);
  const hasInsta1 = Boolean(activeStore?.instaworld_key);
  const hasInsta2 = Boolean(activeStore?.instaworld_key_backup);
  const hasInsta3 = Boolean(activeStore?.instaworld_key_3);
  const hasAnyCourierConfigured = hasPostex || hasInsta1 || hasInsta2 || hasInsta3;

  return (
    <div className="eom-grid-logistics">
      {/* Left Side: Live Multi-Courier Tracking Timeline */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div className="eom-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderBottom: '1px solid var(--border)', paddingBottom: 12, flexWrap: 'wrap', gap: 10
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 800, fontSize: '0.94rem', color: 'var(--text-primary)' }}>🚚 Live Courier Tracking Timeline</span>
              <span style={{
                fontSize: '0.72rem', color: '#6366f1', fontWeight: 700,
                background: 'rgba(99,102,241,0.12)', padding: '3px 10px', borderRadius: 999
              }}>
                {courier || 'Unassigned'}
              </span>
            </div>

            {trackingNumber && refreshLiveTracking && (
              <button
                type="button"
                disabled={trackingLoading}
                onClick={() => refreshLiveTracking()}
                style={{
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-bright)',
                  padding: '5px 11px',
                  borderRadius: 9,
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {trackingLoading ? '⏳ Refreshing...' : '🔄 Refresh Live'}
              </button>
            )}
          </div>

          {editingOrder?.courier_status && (
            <div style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '9px 12px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.78rem'
            }}>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Latest Courier Status</span>
              <span style={{ color: '#6366f1', fontWeight: 800 }}>{editingOrder.courier_status}</span>
            </div>
          )}

          {trackingLoading ? (
            <div style={{ padding: 36, textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              ⏳ Fetching live courier checkpoints...
            </div>
          ) : liveHistory.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingLeft: 6 }}>
              {liveHistory.map((ev, idx) => {
                const title = ev.transactionStatusMessage || ev.transactionStatus || ev.status || ev.activity || 'Courier Update';
                const ts = formatTrackingEventDate(ev.transactionStatusDate || ev.dateTime || ev.date || ev.timestamp || '');
                const loc = ev.location || ev.city || ev.station || '';
                const remarks = ev.remarks || ev.reason || ev.detail || '';
                const isLatest = idx === 0;
                const isIssue = /fail|return|refus|cancel|unattempt|hold/i.test(title);

                return (
                  <div key={`${ts}-${idx}`} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%', flexShrink: 0, marginTop: 2,
                      background: isIssue ? 'rgba(239,68,68,0.15)' : isLatest ? 'rgba(99,102,241,0.16)' : 'var(--bg-elevated)',
                      border: `2px solid ${isIssue ? '#ef4444' : isLatest ? '#6366f1' : 'var(--border-bright)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem',
                      color: isIssue ? '#ef4444' : isLatest ? '#6366f1' : 'var(--text-muted)'
                    }}>
                      {isIssue ? '!' : isLatest ? '●' : '✓'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: isLatest ? 800 : 700, color: isIssue ? '#e11d48' : 'var(--text-primary)' }}>
                          {title}
                        </span>
                        {ts && (
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{ts}</span>
                        )}
                      </div>
                      {(loc || remarks) && (
                        <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                          {[loc, remarks].filter(Boolean).join(' — ')}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : trackingData?.milestones ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingLeft: 6 }}>
              {trackingData.milestones.map((m, idx) => (
                <div key={m.status || idx} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                    background: m.done ? (m.isError ? 'rgba(239,68,68,0.15)' : 'rgba(99,102,241,0.15)') : 'var(--bg-elevated)',
                    border: `2px solid ${m.done ? (m.isError ? '#ef4444' : '#6366f1') : 'var(--border-bright)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem'
                  }}>
                    {m.done ? (m.isError ? '⚠️' : '✓') : ''}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <h4 style={{ margin: 0, fontSize: '0.86rem', fontWeight: 700, color: m.done ? (m.isError ? '#e11d48' : 'var(--text-primary)') : 'var(--text-muted)' }}>
                        {m.label}
                      </h4>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{m.date}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: 36, textAlign: 'center', color: 'var(--text-muted)' }}>
              <p style={{ margin: 0, fontSize: '0.86rem' }}>
                {trackingNumber
                  ? 'No checkpoints synced yet. Click "Refresh Live" to pull courier scans.'
                  : 'Order is not booked yet. Book a courier on the right to generate tracking & milestones.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Right Side: Instant Booking & Manual Assignment Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div className="eom-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
            🚀 Courier Booking & Tracking
          </div>

          {trackingNumber ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Active Tracking Number
              </div>
              <button
                type="button"
                onClick={copyTracking}
                title="Click to copy tracking number"
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-bright)',
                  padding: '10px 14px',
                  borderRadius: 10,
                  fontSize: '0.98rem',
                  fontFamily: 'monospace',
                  fontWeight: 800,
                  color: '#6366f1',
                  textAlign: 'center',
                  cursor: 'pointer'
                }}
              >
                {trackingNumber} 📋
              </button>

              {(editingOrder?.pickup_address_code || editingOrder?.courier_remarks) && (
                <div style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 9,
                  padding: '8px 10px',
                  fontSize: '0.74rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}>
                  {editingOrder?.pickup_address_code && (
                    <div>
                      <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>📍 Pickup Code: </span>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontFamily: 'monospace' }}>{editingOrder.pickup_address_code}</span>
                    </div>
                  )}
                  {editingOrder?.courier_remarks && (
                    <div>
                      <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>📋 Slip Remarks: </span>
                      <span style={{ color: '#6366f1', fontWeight: 700 }}>{editingOrder.courier_remarks}</span>
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {courierPortalUrl && (
                  <a
                    href={courierPortalUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      flex: 1,
                      background: '#6366f1',
                      color: '#fff',
                      padding: '9px 12px',
                      borderRadius: 10,
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      textDecoration: 'none',
                      textAlign: 'center'
                    }}
                  >
                    🔎 Track on {courier || 'Courier'} ↗
                  </a>
                )}
                {hasRealSlug && (
                  <a
                    href={`/track/${trackingSlug}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      flex: 1,
                      background: 'var(--bg-elevated)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-bright)',
                      padding: '9px 12px',
                      borderRadius: 10,
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      textDecoration: 'none',
                      textAlign: 'center'
                    }}
                  >
                    🌐 Public Portal ↗
                  </a>
                )}
              </div>

              {canCancelBooking && handleCancelBooking && (
                <button
                  type="button"
                  onClick={handleCancelBooking}
                  disabled={actionBusy}
                  style={{
                    marginTop: 4,
                    background: 'rgba(239, 68, 68, 0.12)',
                    color: '#dc2626',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    padding: '10px 14px',
                    borderRadius: 10,
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {actionBusy ? '⏳ Cancelling...' : '🛑 Cancel Courier Booking'}
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {isPrepaid && (
                <div style={{
                  fontSize: '0.74rem', fontWeight: 700, color: '#059669',
                  background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)',
                  borderRadius: 9, padding: '7px 10px'
                }}>
                  💳 Prepaid Order — Courier COD amount will automatically be sent as Rs. 0.
                </div>
              )}
              {zeroCostCount > 0 && (
                <div style={{
                  fontSize: '0.74rem', fontWeight: 700, color: '#dc2626',
                  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 9, padding: '7px 10px'
                }}>
                  🛑 Item cost pending — contact Admin before booking.
                </div>
              )}

              {/* Pickup Location & Courier Slip Remarks (Saved per order & sent to PostEx/Instaworld slip) */}
              <div style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-bright)',
                borderRadius: 11,
                padding: '11px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 9,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <span style={{ fontSize: '0.73rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                    📍 Pickup & Slip Remarks
                  </span>
                  {hasPostex && (
                    <button
                      type="button"
                      onClick={() => fetchPickupLocations(true)}
                      disabled={pickupLoading}
                      style={{
                        fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 6,
                        border: '1px solid var(--border)', background: 'var(--bg-surface)',
                        color: 'var(--text-secondary)', cursor: 'pointer',
                      }}
                    >
                      {pickupLoading ? '⏳...' : '🔄 Fetch Locations'}
                    </button>
                  )}
                </div>

                {hasPostex && (
                  <div>
                    <label className="eom-label" style={{ fontSize: '0.7rem' }}>PostEx Pickup Location</label>
                    <select
                      value={localPickupCode}
                      onChange={(e) => setLocalPickupCode(e.target.value)}
                      className="eom-select"
                      style={{ fontSize: '0.78rem' }}
                    >
                      <option value="">— Store / PostEx Account Default —</option>
                      {pickupLocations.map((loc) => (
                        <option key={loc.addressCode || loc.address} value={loc.addressCode}>
                          {formatPickupOptionLabel(loc)}
                        </option>
                      ))}
                      {localPickupCode && !pickupLocations.some(l => l.addressCode === localPickupCode) && (
                        <option value={localPickupCode}>Code: {localPickupCode}</option>
                      )}
                    </select>
                  </div>
                )}

                <div>
                  <label className="eom-label" style={{ fontSize: '0.7rem' }}>Courier Slip Remarks (Printed on Airway Bill)</label>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                    {COURIER_REMARK_PRESETS.slice(0, 4).map((p) => {
                      const active = hasRemarkPhrase(localRemarks, p.text);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setLocalRemarks(prev => toggleRemarkPhrase(prev, p.text))}
                          style={{
                            padding: '3px 7px',
                            borderRadius: 999,
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            border: `1px solid ${active ? '#6366f1' : 'var(--border)'}`,
                            background: active ? 'rgba(99,102,241,0.16)' : 'var(--bg-surface)',
                            color: active ? '#6366f1' : 'var(--text-secondary)',
                          }}
                        >
                          {active ? '✓ ' : '+ '}{p.shortLabel}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="text"
                      value={localRemarks}
                      onChange={(e) => setLocalRemarks(e.target.value)}
                      placeholder="e.g. Call before delivery; Open parcel allowed"
                      maxLength={250}
                      className="eom-input"
                      style={{ flex: 1, fontSize: '0.78rem' }}
                    />
                    <button
                      type="button"
                      onClick={handleSaveDispatchMeta}
                      disabled={savingDispatchMeta}
                      title="Save pickup & remarks on order (available during bulk booking too)"
                      style={{
                        padding: '0 10px',
                        borderRadius: 8,
                        border: '1px solid #6366f1',
                        background: 'rgba(99,102,241,0.12)',
                        color: '#6366f1',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {savingDispatchMeta ? '⏳' : '💾 Save'}
                    </button>
                  </div>
                  {safeNoteHints.length > 0 && (
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 5, alignItems: 'center' }}>
                      <span style={{ fontSize: '0.68rem', color: '#d97706', fontWeight: 700 }}>💡 From Note:</span>
                      {safeNoteHints.map(h => (
                        <button
                          key={h}
                          type="button"
                          onClick={() => setLocalRemarks(prev => appendRemarkPhrase(prev, h))}
                          style={{
                            padding: '2px 7px', borderRadius: 999, fontSize: '0.67rem', fontWeight: 700,
                            border: '1px solid rgba(245,158,11,0.45)', background: 'rgba(245,158,11,0.12)',
                            color: '#b45309', cursor: 'pointer',
                          }}
                        >
                          + {h}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <label className="eom-label" style={{ marginBottom: 0 }}>Assign & Generate Tracking Number</label>

              {(hasPostex || !hasAnyCourierConfigured) && (
                <button
                  type="button"
                  onClick={() => handleBookCourier('PostEx', { pickupAddressCode: localPickupCode, remarks: localRemarks })}
                  disabled={bookingCourier}
                  style={{
                    background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                    border: '1px solid #6366f1', padding: '11px 14px', borderRadius: 11,
                    fontSize: '0.83rem', fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                  }}
                >
                  <span>{bookingCourier ? '⏳ Booking...' : '🚀 Book with PostEx'}</span>
                  <span style={{ fontSize: '0.72rem', color: '#6366f1' }}>{hasPostex ? 'API Ready' : 'Not Configured'}</span>
                </button>
              )}
              {hasInsta1 && (
                <button
                  type="button"
                  onClick={() => handleBookCourier('insta:primary', { pickupAddressCode: localPickupCode, remarks: localRemarks })}
                  disabled={bookingCourier}
                  style={{
                    background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                    border: '1px solid #10b981', padding: '11px 14px', borderRadius: 11,
                    fontSize: '0.83rem', fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                  }}
                >
                  <span>🚀 Instaworld API 1 ({activeStore.instaworld_key.substring(0, 4)}...)</span>
                  <span style={{ fontSize: '0.72rem', color: '#10b981' }}>API Ready</span>
                </button>
              )}
              {hasInsta2 && (
                <button
                  type="button"
                  onClick={() => handleBookCourier('insta:backup', { pickupAddressCode: localPickupCode, remarks: localRemarks })}
                  disabled={bookingCourier}
                  style={{
                    background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                    border: '1px solid #3b82f6', padding: '11px 14px', borderRadius: 11,
                    fontSize: '0.83rem', fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                  }}
                >
                  <span>🚀 Instaworld API 2 ({activeStore.instaworld_key_backup.substring(0, 4)}...)</span>
                  <span style={{ fontSize: '0.72rem', color: '#3b82f6' }}>API Ready</span>
                </button>
              )}
              {hasInsta3 && (
                <button
                  type="button"
                  onClick={() => handleBookCourier('insta:key3', { pickupAddressCode: localPickupCode, remarks: localRemarks })}
                  disabled={bookingCourier}
                  style={{
                    background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                    border: '1px solid #eab308', padding: '11px 14px', borderRadius: 11,
                    fontSize: '0.83rem', fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                  }}
                >
                  <span>🚀 Instaworld API 3 ({activeStore.instaworld_key_3.substring(0, 4)}...)</span>
                  <span style={{ fontSize: '0.72rem', color: '#ca8a04' }}>API Ready</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Manual Courier Assignment */}
        <div className="eom-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
            ⚙️ Manual Courier Assignment
          </div>

          <div>
            <label className="eom-label">Courier Partner</label>
            <select value={localCourier} onChange={handleCourierChange} className="eom-select">
              {courierOptions.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
              <option value="custom">+ Custom Courier...</option>
            </select>
          </div>

          {showCustomInput && (
            <div>
              <label className="eom-label">Custom Courier Name</label>
              <input
                type="text"
                placeholder="e.g. Trax, M&P, TCS"
                value={customCourier}
                onChange={(e) => setCustomCourier(e.target.value)}
                className="eom-input"
              />
            </div>
          )}

          <div>
            <label className="eom-label">Tracking Number</label>
            <input
              type="text"
              placeholder="Enter tracking number"
              value={localTracking}
              onChange={(e) => setLocalTracking(e.target.value)}
              className="eom-input"
              style={{ fontFamily: 'monospace' }}
            />
          </div>

          <button
            type="button"
            onClick={handleSaveManualCourier}
            disabled={isSaving}
            style={{
              background: '#6366f1',
              color: '#fff',
              border: 'none',
              padding: '10px 14px',
              borderRadius: 10,
              fontSize: '0.83rem',
              fontWeight: 700,
              cursor: 'pointer',
              marginTop: 4
            }}
          >
            {isSaving ? '⏳ Saving details...' : '💾 Save Courier Details'}
          </button>
        </div>
      </div>
    </div>
  );
});

CourierBooking.displayName = 'CourierBooking';

export default CourierBooking;
