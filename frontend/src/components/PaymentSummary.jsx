import React from 'react';
import CSUpdateForm from '@components/EditOrderModal/CSUpdateForm';
import { formatCurrency } from '@utils/math';

const PaymentSummary = React.memo(({
  liveSubtotal,
  localDiscount,
  setLocalDiscount,
  shippingFee,
  setShippingFee,
  courierFee,
  setCourierFee,
  onCourierFeeBlur,
  liveTotal,
  zeroCostCount = 0,
  paymentStatus,
  localNotes,
  setLocalNotes
}) => {
  const isPrepaid = ['paid', 'partially_paid'].includes(String(paymentStatus || '').toLowerCase());
  const codCollectible = isPrepaid ? 0 : liveTotal;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="eom-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{
          fontWeight: 800,
          fontSize: '0.92rem',
          color: 'var(--text-primary)',
          borderBottom: '1px solid var(--border)',
          paddingBottom: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span>📊 Financial Breakdown</span>
          <span style={{
            fontSize: '0.7rem',
            fontWeight: 800,
            padding: '2px 8px',
            borderRadius: 999,
            background: isPrepaid ? 'rgba(16,185,129,0.14)' : 'rgba(245,158,11,0.14)',
            color: isPrepaid ? '#059669' : '#d97706',
            border: `1px solid ${isPrepaid ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`
          }}>
            {isPrepaid ? 'Prepaid · COD Rs 0' : `COD: ${formatCurrency(codCollectible)}`}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
          <span>Subtotal</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{formatCurrency(liveSubtotal)}</span>
        </div>

        <CSUpdateForm
          mode="inputs"
          localDiscount={localDiscount}
          setLocalDiscount={setLocalDiscount}
          shippingFee={shippingFee}
          setShippingFee={setShippingFee}
          courierFee={courierFee}
          setCourierFee={setCourierFee}
          onCourierFeeBlur={onCourierFeeBlur}
        />

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '1.06rem',
          fontWeight: 800,
          color: 'var(--text-primary)',
          borderTop: '1px solid var(--border)',
          paddingTop: 12
        }}>
          <span>Total Revenue</span>
          <span>{formatCurrency(liveTotal)}</span>
        </div>

        {zeroCostCount > 0 && (
          <div style={{
            fontSize: '0.72rem',
            fontWeight: 700,
            color: '#dc2626',
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.28)',
            borderRadius: 9,
            padding: '7px 10px'
          }}>
            🛑 {zeroCostCount} item{zeroCostCount > 1 ? 's' : ''} pending cost setup — contact Admin before Confirm / Book.
          </div>
        )}

        <CSUpdateForm
          mode="notes"
          localNotes={localNotes}
          setLocalNotes={setLocalNotes}
        />
      </div>
    </div>
  );
});

PaymentSummary.displayName = 'PaymentSummary';

export default PaymentSummary;
