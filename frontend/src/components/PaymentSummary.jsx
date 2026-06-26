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
  liveTotal,
  totalOrderCost,
  netProfit,
  profitMargin,
  localNotes,
  setLocalNotes
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff', borderBottom: '1px solid #334155', paddingBottom: 12 }}>📊 Financial Breakdown</div>
        
        <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', fontSize: '0.85rem', color: '#94a3b8' }}>
          <span>Subtotal</span>
          <span style={{ color: '#fff', fontWeight: 700 }}>{formatCurrency(liveSubtotal)}</span>
        </div>

        {/* CS Financial Inputs via CSUpdateForm */}
        <CSUpdateForm 
          mode="inputs"
          localDiscount={localDiscount}
          setLocalDiscount={setLocalDiscount}
          shippingFee={shippingFee}
          setShippingFee={setShippingFee}
          courierFee={courierFee}
          setCourierFee={setCourierFee}
        />

        <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: 800, color: '#fff', borderTop: '1px solid #334155', paddingTop: 16 }}>
          <span>Total Revenue</span>
          <span>{formatCurrency(liveTotal)}</span>
        </div>

        {/* True Net Profit Display */}
        <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', fontSize: '0.8rem', color: '#94a3b8' }}>
            <span>Master Inventory Cost</span>
            <span style={{ color: '#f43f5e', fontWeight: 700 }}>-{formatCurrency(totalOrderCost)}</span>
          </div>
          <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', fontSize: '0.8rem', color: '#94a3b8' }}>
            <span>Estimated Net Profit</span>
            <span style={{ color: netProfit > 0 ? '#10b981' : '#f43f5e', fontWeight: 800, fontSize: '0.9rem' }}>
              {formatCurrency(netProfit)} ({profitMargin}%)
            </span>
          </div>
        </div>

        {/* CS Internal Notes via CSUpdateForm */}
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
