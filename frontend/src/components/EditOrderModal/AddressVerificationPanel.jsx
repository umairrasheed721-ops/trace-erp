import React from 'react';

const AddressVerificationPanel = React.memo(({
  mapsVerifyResult,
  setMapsVerifyResult,
  editingOrder,
  handleApplyStandardAddress
}) => {
  if (!mapsVerifyResult) return null;

  return (
    <div className="address-verification-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f3f4f6', display: 'flex', alignItems: 'center', gap: 6 }}>
          🛰️ Google Maps Verification
        </span>
        <button 
          type="button" 
          onClick={() => setMapsVerifyResult(null)} 
          style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '0.9rem', cursor: 'pointer' }}
        >
          ✖
        </button>
      </div>

      {mapsVerifyResult.success ? (
        <div>
          {/* Rating Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            {mapsVerifyResult.location_type === 'ROOFTOP' ? (
              <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '4px 10px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 800 }}>
                🟢 Exact Match (Rooftop Accuracy)
              </span>
            ) : mapsVerifyResult.location_type === 'RANGE_INTERPOLATED' ? (
              <span style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '4px 10px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 800 }}>
                🔵 Precise Street/Range Match
              </span>
            ) : (
              <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '4px 10px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 800 }}>
                🟡 Approximate Match (City/Area Only)
              </span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.8rem' }}>
            <div>
              <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.7rem', marginBottom: 2 }}>Original Address:</span>
              <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{mapsVerifyResult.original_address}, {mapsVerifyResult.original_city}</span>
            </div>
            <div style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, borderLeft: '3px solid #6366f1' }}>
              <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.7rem', marginBottom: 2 }}>Google Suggestion (with Landmarks):</span>
              <span style={{ color: '#a5b4fc', fontWeight: 700 }}>{mapsVerifyResult.merged_address || mapsVerifyResult.formatted_address}</span>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => handleApplyStandardAddress(mapsVerifyResult.merged_address || mapsVerifyResult.formatted_address, mapsVerifyResult.resolved_city || editingOrder.city)}
                style={{ flex: 1, background: '#6366f1', color: '#ffffff', border: 'none', padding: '8px 12px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', transition: 'background 0.2s' }}
              >
                ✅ Apply Standard Address
              </button>
              
              {mapsVerifyResult.location && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${mapsVerifyResult.location.lat},${mapsVerifyResult.location.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ background: '#334155', color: '#f8fafc', border: '1px solid #475569', textDecoration: 'none', padding: '8px 12px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 700, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  🗺️ View Map
                </a>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '4px 10px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 800, alignSelf: 'flex-start' }}>
            🔴 No Match Found
          </span>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
            {mapsVerifyResult.error_message || 'Verify your address/city and try again.'}
          </span>
        </div>
      )}
    </div>
  );
});

AddressVerificationPanel.displayName = 'AddressVerificationPanel';

export default AddressVerificationPanel;
