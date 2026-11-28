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
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
          🛰️ Google Maps Verification
        </span>
        <button
          type="button"
          onClick={() => setMapsVerifyResult(null)}
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '0.85rem', cursor: 'pointer', padding: '2px 6px' }}
        >
          ✕
        </button>
      </div>

      {mapsVerifyResult.success ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            {mapsVerifyResult.location_type === 'ROOFTOP' ? (
              <span style={{ background: 'rgba(16, 185, 129, 0.14)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.35)', padding: '3px 10px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 800 }}>
                🟢 Exact Match (Rooftop Accuracy)
              </span>
            ) : mapsVerifyResult.location_type === 'RANGE_INTERPOLATED' ? (
              <span style={{ background: 'rgba(59, 130, 246, 0.14)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.35)', padding: '3px 10px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 800 }}>
                🔵 Precise Street/Range Match
              </span>
            ) : (
              <span style={{ background: 'rgba(245, 158, 11, 0.14)', color: '#d97706', border: '1px solid rgba(245, 158, 11, 0.35)', padding: '3px 10px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 800 }}>
                🟡 Approximate Match (City/Area Only)
              </span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.8rem' }}>
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem', marginBottom: 2 }}>Original Address:</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                {mapsVerifyResult.original_address}, {mapsVerifyResult.original_city}
              </span>
            </div>
            <div style={{ padding: '8px 10px', background: 'rgba(99,102,241,0.08)', borderRadius: 8, borderLeft: '3px solid #6366f1' }}>
              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem', marginBottom: 2 }}>Google Suggestion (with Landmarks):</span>
              <span style={{ color: '#6366f1', fontWeight: 700 }}>{mapsVerifyResult.merged_address || mapsVerifyResult.formatted_address}</span>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              <button
                type="button"
                onClick={() => handleApplyStandardAddress(mapsVerifyResult.merged_address || mapsVerifyResult.formatted_address, mapsVerifyResult.resolved_city || editingOrder.city)}
                style={{ flex: 1, background: '#6366f1', color: '#ffffff', border: 'none', padding: '8px 12px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
              >
                ✅ Apply Standard Address
              </button>

              {mapsVerifyResult.location && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${mapsVerifyResult.location.lat},${mapsVerifyResult.location.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-bright)', textDecoration: 'none', padding: '8px 12px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  🗺️ View Map
                </a>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ background: 'rgba(239, 68, 68, 0.14)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.35)', padding: '3px 10px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 800, alignSelf: 'flex-start' }}>
            🔴 No Match Found
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            {mapsVerifyResult.error_message || 'Verify your address/city and try again.'}
          </span>
        </div>
      )}
    </div>
  );
});

AddressVerificationPanel.displayName = 'AddressVerificationPanel';

export default AddressVerificationPanel;
