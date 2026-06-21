import React from 'react';

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
          <span style={{ color: '#fff', fontWeight: 700 }}>Rs {Math.round(liveSubtotal).toLocaleString()}</span>
        </div>

        <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', fontSize: '0.85rem', color: '#94a3b8', alignItems: 'center' }}>
          <span>CS Discount</span>
          <input 
            type="number"
            style={{ width: 90, background: '#0f172a', border: '1px solid #334155', borderRadius: 10, padding: '6px 10px', color: '#fff', fontSize: '0.85rem', textAlign: 'right', fontWeight: 600, outline: 'none' }}
            value={localDiscount}
            onChange={e => setLocalDiscount(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', fontSize: '0.85rem', color: '#94a3b8', alignItems: 'center' }}>
          <span title="Shipping fee charged to the customer (adds to Revenue)">Shipping Fee (Customer)</span>
          <input 
            type="number"
            style={{ width: 90, background: '#0f172a', border: '1px solid #334155', borderRadius: 10, padding: '6px 10px', color: '#fff', fontSize: '0.85rem', textAlign: 'right', fontWeight: 600, outline: 'none' }}
            value={shippingFee}
            onChange={e => setShippingFee(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', fontSize: '0.85rem', color: '#94a3b8', alignItems: 'center' }}>
          <span title="Actual cost billed by the courier service (subtracts from Profit)">
            Courier Expense 📦
          </span>
          <input 
            type="number"
            style={{ width: 90, background: '#0f172a', border: '1px solid #334155', borderRadius: 10, padding: '6px 10px', color: '#38bdf8', fontSize: '0.85rem', textAlign: 'right', fontWeight: 700, outline: 'none' }}
            value={courierFee}
            onChange={e => setCourierFee(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: 800, color: '#fff', borderTop: '1px solid #334155', paddingTop: 16 }}>
          <span>Total Revenue</span>
          <span>Rs {Math.round(liveTotal).toLocaleString()}</span>
        </div>

        {/* True Net Profit Display */}
        <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', fontSize: '0.8rem', color: '#94a3b8' }}>
            <span>Master Inventory Cost</span>
            <span style={{ color: '#f43f5e', fontWeight: 700 }}>-Rs {Math.round(totalOrderCost).toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', fontSize: '0.8rem', color: '#94a3b8' }}>
            <span>Estimated Net Profit</span>
            <span style={{ color: netProfit > 0 ? '#10b981' : '#f43f5e', fontWeight: 800, fontSize: '0.9rem' }}>
              Rs {Math.round(netProfit).toLocaleString()} ({profitMargin}%)
            </span>
          </div>
        </div>

        <div style={{ borderTop: '1px solid #334155', paddingTop: 16, marginTop: 4 }}>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', marginBottom: 8 }}>INTERNAL CS NOTES (ERP ONLY)</label>
          <textarea 
            rows={3}
            value={localNotes}
            onChange={e => setLocalNotes(e.target.value)}
            placeholder="Why was this order edited? e.g. Customer changed size, or item was out of stock."
            style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: 12, padding: 12, color: '#fff', fontSize: '0.85rem', outline: 'none', resize: 'none', boxSizing: 'border-box' }}
          />
        </div>
      </div>
    </div>
  );
});

PaymentSummary.displayName = 'PaymentSummary';

export default PaymentSummary;
