import React from 'react';
import RtoRiskAlert from '@components/EditOrderModal/RtoRiskAlert';
import { useApp } from '@context/AppContext';

const STATUS_BADGE_STYLES = {
  pending: { bg: 'rgba(245, 158, 11, 0.14)', color: '#d97706', border: 'rgba(245, 158, 11, 0.35)' },
  confirmed: { bg: 'rgba(139, 92, 246, 0.14)', color: '#7c3aed', border: 'rgba(139, 92, 246, 0.35)' },
  booked: { bg: 'rgba(59, 130, 246, 0.14)', color: '#2563eb', border: 'rgba(59, 130, 246, 0.35)' },
  'in transit': { bg: 'rgba(14, 165, 233, 0.14)', color: '#0284c7', border: 'rgba(14, 165, 233, 0.35)' },
  delivered: { bg: 'rgba(16, 185, 129, 0.14)', color: '#059669', border: 'rgba(16, 185, 129, 0.35)' },
  returned: { bg: 'rgba(244, 63, 94, 0.14)', color: '#e11d48', border: 'rgba(244, 63, 94, 0.35)' },
  'return received': { bg: 'rgba(168, 85, 247, 0.14)', color: '#9333ea', border: 'rgba(168, 85, 247, 0.35)' },
  cancelled: { bg: 'rgba(100, 116, 139, 0.15)', color: '#64748b', border: 'rgba(100, 116, 139, 0.35)' }
};

const OrderHeader = React.memo(({
  editingOrder,
  onClose,
  editorLoading,
  custIntel,
  handleCancelOrder,
  actionBusy,
  isDirty,
  addToast,
  children
}) => {
  const { activeStore } = useApp();
  const orderRef = editingOrder.ref_number || `#${editingOrder.shopify_order_id || editingOrder.id}`;
  const cleanRefDisplay = String(orderRef).startsWith('#') ? orderRef : `#${orderRef}`;

  const payLower = String(editingOrder.payment_status || 'pending').toLowerCase();
  const isPaid = payLower === 'paid';
  const isRefunded = payLower.includes('refund') || payLower.includes('void');
  const payBadge = isPaid
    ? { bg: 'rgba(16, 185, 129, 0.14)', color: '#059669', border: 'rgba(16, 185, 129, 0.35)', label: '💳 Paid (Prepaid)' }
    : isRefunded
    ? { bg: 'rgba(239, 68, 68, 0.14)', color: '#dc2626', border: 'rgba(239, 68, 68, 0.35)', label: `💳 ${editingOrder.payment_status}` }
    : { bg: 'rgba(245, 158, 11, 0.14)', color: '#d97706', border: 'rgba(245, 158, 11, 0.35)', label: `💳 COD · ${editingOrder.payment_status || 'Pending'}` };

  const erpStatus = editingOrder.delivery_status || 'Pending';
  const erpStyle = STATUS_BADGE_STYLES[erpStatus.toLowerCase()] || STATUS_BADGE_STYLES.pending;

  const erpLower = erpStatus.toLowerCase();
  const isAdvancedOrFinal = ['booked', 'in transit', 'delivered', 'returned', 'return received', 'cancelled'].includes(erpLower);
  const hasReadyTag = !isAdvancedOrFinal && !editingOrder.tracking_number && (
    Boolean(editingOrder.confirmed_at) ||
    erpLower === 'confirmed' ||
    String(editingOrder.tags || '').toLowerCase().includes('ready to book')
  );

  const shopDomain = editingOrder.shop_domain || activeStore?.shop_domain || '';
  const shopifyAdminUrl = shopDomain && editingOrder.shopify_order_id
    ? `https://${shopDomain}/admin/orders/${editingOrder.shopify_order_id}`
    : null;

  const formattedDate = editingOrder.order_date
    ? String(editingOrder.order_date).slice(0, 16).replace('T', ' ')
    : null;

  const copyOrderRef = () => {
    navigator.clipboard?.writeText(cleanRefDisplay).then(() => {
      if (addToast) addToast(`📋 Copied ${cleanRefDisplay}`, 'success');
    }).catch(() => {});
  };

  return (
    <>
      <RtoRiskAlert
        custIntel={custIntel}
        editingOrder={editingOrder}
        handleCancelOrder={handleCancelOrder}
        actionBusy={actionBusy}
      />

      <div className="eom-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={copyOrderRef}
              title="Click to copy order number"
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                margin: 0,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                color: 'var(--text-primary)'
              }}
            >
              <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
                Order {cleanRefDisplay}
              </h2>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>📋</span>
            </button>

            <span style={{
              background: payBadge.bg,
              color: payBadge.color,
              border: `1px solid ${payBadge.border}`,
              padding: '3px 10px',
              borderRadius: 999,
              fontSize: '0.72rem',
              fontWeight: 700
            }}>
              {payBadge.label}
            </span>

            <span style={{
              background: erpStyle.bg,
              color: erpStyle.color,
              border: `1px solid ${erpStyle.border}`,
              padding: '3px 10px',
              borderRadius: 999,
              fontSize: '0.72rem',
              fontWeight: 700
            }}>
              📦 ERP: {erpStatus}
            </span>

            {hasReadyTag && !editingOrder.tracking_number && (
              <span style={{
                background: 'rgba(16, 185, 129, 0.14)',
                color: '#059669',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                padding: '3px 10px',
                borderRadius: 999,
                fontSize: '0.72rem',
                fontWeight: 700
              }}>
                🏷️ Ready to Book
              </span>
            )}

            {editingOrder.tracking_number && (
              <span style={{
                background: 'rgba(99, 102, 241, 0.12)',
                color: '#6366f1',
                border: '1px solid rgba(99, 102, 241, 0.32)',
                padding: '3px 10px',
                borderRadius: 999,
                fontSize: '0.72rem',
                fontWeight: 700,
                fontFamily: 'monospace'
              }}>
                🚚 {editingOrder.courier || 'Courier'}: {editingOrder.tracking_number}
              </span>
            )}

            {isDirty && (
              <span style={{
                background: 'rgba(245, 158, 11, 0.16)',
                color: '#d97706',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                padding: '3px 10px',
                borderRadius: 999,
                fontSize: '0.71rem',
                fontWeight: 800
              }}>
                ● Unsaved Changes
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {formattedDate && (
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                🗓 {formattedDate}
              </span>
            )}
            {editorLoading && (
              <span style={{ fontSize: '0.76rem', color: '#6366f1', fontWeight: 600 }}>⏳ Syncing...</span>
            )}
            {shopifyAdminUrl && (
              <a
                href={shopifyAdminUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-bright)',
                  padding: '6px 12px',
                  borderRadius: 10,
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5
                }}
              >
                🛍️ Shopify ↗
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-bright)',
                padding: '6px 14px',
                borderRadius: 10,
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
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
