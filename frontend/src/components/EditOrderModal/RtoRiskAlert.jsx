import React from 'react';

const RtoRiskAlert = React.memo(({ custIntel, editingOrder, handleCancelOrder, actionBusy }) => {
  const returnedCount = Number(custIntel?.returned || 0);
  const isBlacklisted = Boolean(custIntel?.blacklist);
  if (!custIntel || (returnedCount <= 0 && !isBlacklisted)) return null;

  const statusLower = String(editingOrder?.delivery_status || '').toLowerCase();
  const canCancel = !['cancelled', 'delivered', 'returned', 'return received'].includes(statusLower);

  return (
    <div className="rto-risk-alert-banner">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: '1.35rem' }}>🚨</span>
        <div>
          <div style={{ fontSize: '0.84rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            High RTO Risk Detected
          </div>
          <div style={{ fontSize: '0.74rem', opacity: 0.92 }}>
            Customer has {returnedCount} previous returned/refused parcel{returnedCount === 1 ? '' : 's'}
            {Number(custIntel.total || 0) > 0 ? ` out of ${custIntel.total} orders` : ''}. Historical RTO Rate: {custIntel.rto_rate || 0}%.
            {isBlacklisted ? ' ⚠️ ACTIVE BLACKLIST STRIKE.' : ''}
          </div>
        </div>
      </div>
      {canCancel && handleCancelOrder && (
        <button
          type="button"
          onClick={handleCancelOrder}
          disabled={actionBusy}
          className="rto-risk-alert-btn"
        >
          {actionBusy ? '⏳ Updating...' : '❌ Cancel Order'}
        </button>
      )}
    </div>
  );
});

RtoRiskAlert.displayName = 'RtoRiskAlert';

export default RtoRiskAlert;
