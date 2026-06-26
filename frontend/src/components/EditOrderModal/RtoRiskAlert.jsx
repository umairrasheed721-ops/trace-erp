import React from 'react';

const RtoRiskAlert = React.memo(({ custIntel, handleWaSimulate, waSimulating }) => {
  if (!custIntel || (!custIntel.returned && !custIntel.blacklist)) return null;

  return (
    <div className="rto-risk-alert-banner">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: '1.5rem' }}>🚨</span>
        <div>
          <div style={{ fontSize: '0.9rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>High RTO Risk Detected</div>
          <div style={{ fontSize: '0.75rem', opacity: 0.9 }}>
            Customer has {custIntel.returned} previous refused/returned parcels. Historical RTO Rate: {custIntel.rto_rate}%. {custIntel.blacklist ? '⚠️ ACTIVE BLACKLIST STRIKE.' : ''}
          </div>
        </div>
      </div>
      <button 
        onClick={() => handleWaSimulate('SIMULATE_CANCEL')} 
        disabled={waSimulating}
        className="rto-risk-alert-btn"
      >
        ❌ Cancel & Restock
      </button>
    </div>
  );
});

RtoRiskAlert.displayName = 'RtoRiskAlert';

export default RtoRiskAlert;
