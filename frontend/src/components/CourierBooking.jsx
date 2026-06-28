import React from 'react';
import { useApp } from '@context/AppContext';

const CourierBooking = React.memo(({
  courier,
  trackingNumber,
  trackingSlug,
  trackingLoading,
  trackingData,
  bookingCourier,
  handleBookCourier,
  activeCouriers = [],
  updateOrderField,
  editingOrder,
  setEditingOrder
}) => {
  const { activeStore } = useApp();
  const standardCouriers = ['PostEx', 'Self Delivery', 'Unassigned'];
  const [localCourier, setLocalCourier] = React.useState('Unassigned');
  const [localTracking, setLocalTracking] = React.useState('');
  const [showCustomInput, setShowCustomInput] = React.useState(false);
  const [customCourier, setCustomCourier] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);

  // Merge standard options with dynamic options from activeCouriers
  const courierOptions = React.useMemo(() => {
    const list = [...standardCouriers];
    if (Array.isArray(activeCouriers)) {
      activeCouriers.forEach(c => {
        if (c && !list.includes(c)) {
          list.push(c);
        }
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
    if (val === 'custom') {
      setShowCustomInput(true);
    } else {
      setShowCustomInput(false);
    }
  };

  const handleSaveManualCourier = async () => {
    let finalCourier = localCourier;
    if (localCourier === 'custom') {
      finalCourier = customCourier.trim();
      if (!finalCourier) {
        alert('Please enter a custom courier name.');
        return;
      }
    }
    
    setIsSaving(true);
    try {
      let updatedOrder = null;
      if (updateOrderField && editingOrder) {
        updatedOrder = await updateOrderField(editingOrder.id, {
          courier: finalCourier,
          tracking_number: localTracking
        });
      }
      
      if (setEditingOrder) {
        if (updatedOrder) {
          setEditingOrder(updatedOrder);
        } else {
          setEditingOrder(prev => ({
            ...prev,
            courier: finalCourier,
            tracking_number: localTracking
          }));
        }
      }
    } catch (err) {
      console.error('Failed to manually update courier details:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 28 }}>
      
      {/* Left Side: Live Tracking Timeline */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', paddingBottom: 12 }}>
            <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff' }}>🚚 Live Courier Tracking Timeline</span>
            <span style={{ fontSize: '0.75rem', color: '#818cf8', fontWeight: 700, background: '#6366f120', padding: '4px 12px', borderRadius: 20 }}>
              {courier || 'Standard Courier'}
            </span>
          </div>

          {trackingLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>⏳ Loading live courier milestones...</div>
          ) : trackingData?.milestones ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingLeft: 12 }}>
              {trackingData.milestones.map((m, idx) => (
                <div key={m.status || idx} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: m.done ? (m.isError ? '#4c0519' : '#1e1b4b') : '#0f172a', border: `2px solid ${m.done ? (m.isError ? '#f43f5e' : '#6366f1') : '#334155'}`, display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', fontSize: '0.8rem', flexShrink: 0 }}>
                    {m.done ? (m.isError ? '⚠️' : '✓') : ''}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: m.done ? (m.isError ? '#f43f5e' : '#fff') : '#64748b' }}>{m.label}</h4>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{m.date}</span>
                    </div>
                    <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
                      {m.status === 'Booked' && `Tracking #: ${trackingNumber || 'Pending'}`}
                      {m.status === 'In Transit' && 'Package is moving through courier logistics network.'}
                      {m.status === 'Out for Delivery' && 'Rider is out for delivery. Keep phone available.'}
                      {m.status === 'Attempted' && 'Attempt failed.'}
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

      {/* Right Side: Booking & Assignment Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Instant Booking Panel */}
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff', borderBottom: '1px solid #334155', paddingBottom: 12 }}>🚀 Instant Courier Booking</div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8' }}>Assign & Generate Tracking Number</label>
            <button 
              type="button"
              onClick={() => handleBookCourier('PostEx')} 
              disabled={bookingCourier}
              style={{ background: '#0f172a', color: '#fff', border: '1px solid #6366f1', padding: '12px 16px', borderRadius: 12, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyItems: 'space-between', justifyContent: 'space-between' }}
            >
              <span>🚀 Book with PostEx</span>
              <span style={{ fontSize: '0.75rem', color: '#818cf8' }}>API Active</span>
            </button>
            {activeStore?.instaworld_key && (
              <button 
                type="button"
                onClick={() => handleBookCourier('insta:primary')} 
                disabled={bookingCourier}
                style={{ background: '#0f172a', color: '#fff', border: '1px solid #10b981', padding: '12px 16px', borderRadius: 12, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyItems: 'space-between', justifyContent: 'space-between' }}
              >
                <span>🚀 Book Instaworld (API 1: {activeStore.instaworld_key.substring(0, 4)}...)</span>
                <span style={{ fontSize: '0.75rem', color: '#34d399' }}>API Active</span>
              </button>
            )}
            {activeStore?.instaworld_key_backup && (
              <button 
                type="button"
                onClick={() => handleBookCourier('insta:backup')} 
                disabled={bookingCourier}
                style={{ background: '#0f172a', color: '#fff', border: '1px solid #3b82f6', padding: '12px 16px', borderRadius: 12, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyItems: 'space-between', justifyContent: 'space-between' }}
              >
                <span>🚀 Book Instaworld (API 2: {activeStore.instaworld_key_backup.substring(0, 4)}...)</span>
                <span style={{ fontSize: '0.75rem', color: '#60a5fa' }}>API Active</span>
              </button>
            )}
            {activeStore?.instaworld_key_3 && (
              <button 
                type="button"
                onClick={() => handleBookCourier('insta:key3')} 
                disabled={bookingCourier}
                style={{ background: '#0f172a', color: '#fff', border: '1px solid #eab308', padding: '12px 16px', borderRadius: 12, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyItems: 'space-between', justifyContent: 'space-between' }}
              >
                <span>🚀 Book Instaworld (API 3: {activeStore.instaworld_key_3.substring(0, 4)}...)</span>
                <span style={{ fontSize: '0.75rem', color: '#facc15' }}>API Active</span>
              </button>
            )}
          </div>

          {trackingNumber && (
            <div style={{ borderTop: '1px solid #334155', paddingTop: 16, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Assigned Tracking Number:</div>
              <div style={{ background: '#0f172a', border: '1px solid #334155', padding: '10px 14px', borderRadius: 12, fontSize: '1rem', fontMono: 'true', fontWeight: 800, color: '#6366f1', textAlign: 'center' }}>
                {trackingNumber}
              </div>
              <a 
                href={`/track/${trackingSlug || 'tr_mock_slug'}`} 
                target="_blank" 
                rel="noreferrer"
                style={{ background: '#6366f1', color: '#fff', padding: '10px 16px', borderRadius: 12, fontSize: '0.8rem', fontWeight: 700, textDecoration: 'none', textAlign: 'center', display: 'block', boxShadow: '0 4px 12px rgba(99,102,241,0.3)' }}
              >
                🌐 Open Public Tracking Portal
              </a>
            </div>
          )}
        </div>

        {/* Manual Assignment Panel */}
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff', borderBottom: '1px solid #334155', paddingBottom: 12 }}>⚙️ Manual Courier Assignment</div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8' }}>Courier Partner</label>
            <select
              value={localCourier}
              onChange={handleCourierChange}
              style={{
                width: '100%',
                background: '#0f172a',
                color: '#fff',
                border: '1px solid #334155',
                padding: '12px 16px',
                borderRadius: 12,
                fontSize: '0.85rem',
                outline: 'none',
                cursor: 'pointer',
                boxSizing: 'border-box'
              }}
            >
              {courierOptions.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
              <option value="custom">+ Custom Courier...</option>
            </select>
          </div>

          {showCustomInput && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8' }}>Custom Courier Name</label>
              <input
                type="text"
                placeholder="e.g. Trax, M&P, Barq Raftar"
                value={customCourier}
                onChange={(e) => setCustomCourier(e.target.value)}
                style={{
                  width: '100%',
                  background: '#0f172a',
                  color: '#fff',
                  border: '1px solid #334155',
                  padding: '12px 16px',
                  borderRadius: 12,
                  fontSize: '0.85rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8' }}>Tracking Number</label>
            <input
              type="text"
              placeholder="Enter tracking number"
              value={localTracking}
              onChange={(e) => setLocalTracking(e.target.value)}
              style={{
                width: '100%',
                background: '#0f172a',
                color: '#fff',
                border: '1px solid #334155',
                padding: '12px 16px',
                borderRadius: 12,
                fontSize: '0.85rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
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
              padding: '12px 16px',
              borderRadius: 12,
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              textAlign: 'center',
              marginTop: 8,
              boxShadow: '0 4px 12px rgba(99,102,241,0.3)',
              transition: 'all 0.2s ease'
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
