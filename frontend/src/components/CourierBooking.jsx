import React from 'react';

const CourierBooking = React.memo(({
  courier,
  trackingNumber,
  trackingSlug,
  trackingLoading,
  trackingData,
  bookingCourier,
  handleBookCourier
}) => {
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

      {/* Right Side: 1-Click Courier Booking Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
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
            <button 
              type="button"
              onClick={() => handleBookCourier('Instaworld')} 
              disabled={bookingCourier}
              style={{ background: '#0f172a', color: '#fff', border: '1px solid #10b981', padding: '12px 16px', borderRadius: 12, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyItems: 'space-between', justifyContent: 'space-between' }}
            >
              <span>🚀 Book with Instaworld</span>
              <span style={{ fontSize: '0.75rem', color: '#34d399' }}>API Active</span>
            </button>
            <button 
              type="button"
              onClick={() => handleBookCourier('Leopards')} 
              disabled={bookingCourier}
              style={{ background: '#0f172a', color: '#fff', border: '1px solid #f59e0b', padding: '12px 16px', borderRadius: 12, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyItems: 'space-between', justifyContent: 'space-between' }}
            >
              <span>🚀 Book with Leopards</span>
              <span style={{ fontSize: '0.75rem', color: '#fbbf24' }}>API Active</span>
            </button>
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
      </div>
    </div>
  );
});

CourierBooking.displayName = 'CourierBooking';

export default CourierBooking;
