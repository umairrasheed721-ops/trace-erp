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
  totalOrderCost,
  zeroCostCount = 0,
  netProfit,
  profitMargin,
  paymentStatus,
  localNotes,
  setLocalNotes
}) => {
  const isPrepaid = ['paid', 'partially_paid'].includes(String(paymentStatus || '').toLowerCase());
  const codCollectible = isPrepaid ? 0 : liveTotal;
  const isProfitPositive = netProfit >= 0;

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

        {/* Unit Economics & Net Profit Card */}
        <div style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 7
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            <span>Product Cost (CGS)</span>
            <span style={{ fontWeight: 700, color: zeroCostCount > 0 ? '#dc2626' : 'var(--text-primary)' }}>
              {formatCurrency(totalOrderCost)}
              {zeroCostCount > 0 ? ' 🛑' : ''}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            <span>Courier Expense</span>
            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
              {Number(courierFee || 0) > 0 ? formatCurrency(courierFee) : 'Rs. 0 (Unbilled)'}
            </span>
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: '1px dashed var(--border-bright)',
            paddingTop: 8,
            marginTop: 2
          }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-primary)' }}>Est. Net Profit</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{
                fontSize: '0.92rem',
                fontWeight: 800,
                color: isProfitPositive ? '#10b981' : '#ef4444'
              }}>
                {formatCurrency(netProfit)}
              </span>
              <span style={{
                fontSize: '0.7rem',
                fontWeight: 800,
                padding: '2px 7px',
                borderRadius: 999,
                background: isProfitPositive ? 'rgba(16,185,129,0.14)' : 'rgba(239,68,68,0.14)',
                color: isProfitPositive ? '#059669' : '#dc2626'
              }}>
                {profitMargin}%
              </span>
            </div>
          </div>

          {zeroCostCount > 0 && (
            <div style={{
              marginTop: 4,
              fontSize: '0.71rem',
              fontWeight: 700,
              color: '#dc2626',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.28)',
              borderRadius: 8,
              padding: '6px 8px'
            }}>
              🛑 {zeroCostCount} item{zeroCostCount > 1 ? 's' : ''} missing unit cost — heal cost before Confirm / Book.
            </div>
          )}
        </div>

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
