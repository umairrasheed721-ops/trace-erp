import React from 'react';
import RtoRiskAlert from '@components/EditOrderModal/RtoRiskAlert';

const OrderHeader = React.memo(({
  editingOrder,
  setEditingOrder,
  editorLoading,
  custIntel,
  handleWaSimulate,
  waSimulating,
  children
}) => {
  const getWaBadge = (status) => {
    if (status?.toLowerCase() === 'verified') return <span style={{ background: '#10b98120', color: '#10b981', padding: '4px 12px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700 }}>🟢 WhatsApp Verified</span>;
    if (status === 'Address_Updated') return <span style={{ background: '#3b82f620', color: '#3b82f6', padding: '4px 12px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700 }}>✏️ Address Curated</span>;
    if (status === 'Cancelled') return <span style={{ background: '#ef444420', color: '#ef4444', padding: '4px 12px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700 }}>🔴 Cancelled via WA</span>;
    return <span style={{ background: '#f59e0b20', color: '#f59e0b', padding: '4px 12px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700 }}>🟡 COD Pending Verification</span>;
  };

  return (
    <>
      {/* 🚨 Automated RTO Risk Warning Banner (Pillar 1) */}
      <RtoRiskAlert 
        custIntel={custIntel} 
        handleWaSimulate={handleWaSimulate} 
        waSimulating={waSimulating} 
      />

      {/* Modal Header & Navigation Tabs */}
      <div style={{ padding: '20px 28px 0', borderBottom: '1px solid #334155', background: '#1e293b', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyItems: 'space-between', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#fff' }}>
              Order #{editingOrder.ref_number || editingOrder.shopify_order_id}
            </h2>
            <span style={{ background: '#f59e0b20', color: '#f59e0b', padding: '4px 10px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 700, border: '1px solid #f59e0b40' }}>
              {editingOrder.payment_status || 'Pending'}
            </span>
            <span style={{ background: '#3b82f620', color: '#3b82f6', padding: '4px 10px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 700, border: '1px solid #3b82f640' }}>
              {editingOrder.delivery_status || 'Unfulfilled'}
            </span>
            {getWaBadge(editingOrder.wa_verification_status)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {editorLoading && <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>⏳ Syncing...</span>}
            <button 
              onClick={() => setEditingOrder(null)} 
              style={{ background: '#334155', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 12, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
            >
              ✕ Close
            </button>
          </div>
        </div>
        {children}
      </div>
    </>
  );
});

OrderHeader.displayName = 'OrderHeader';

export default OrderHeader;
