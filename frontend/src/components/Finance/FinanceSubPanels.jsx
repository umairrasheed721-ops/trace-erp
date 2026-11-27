import { exportRowsToCsv } from '../../utils/financeParser'

export function HistoryDrilldownPanel({
  sessionDetail,
  loading,
  isProcessing,
  onResyncNotes,
  onUndo,
  onOpenOrder,
}) {
  if (loading) {
    return (
      <div style={emptyPanelStyle}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>⏳</div>
        <div>Loading session audit log...</div>
      </div>
    )
  }

  if (!sessionDetail) {
    return (
      <div style={emptyPanelStyle}>
        <div style={{ fontSize: 44, marginBottom: 10 }}>📜</div>
        <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Select a Past Session to Inspect</div>
        <div style={{ fontSize: '0.8rem' }}>Click any upload on the left to view every reconciled order, PKR totals, and Shopify notes.</div>
      </div>
    )
  }

  const { session, items = [], totals = {} } = sessionDetail
  const missingNotesCount = items.filter(it => !it.shopify_note_added && it.shopify_order_id).length

  const handleExportSession = () => {
    const headers = ['Order #', 'Tracking', 'Customer', 'Courier', 'ERP Status', 'Order Price', 'Paid COD', 'Courier Fee', 'Net Payout', 'CPR Ref', 'Payment Date', 'Shopify Note']
    const rows = items.map(it => [
      it.ref_number || it.shopify_order_id || it.order_id,
      it.tracking_number || '',
      it.customer_name || '',
      it.courier || '',
      it.delivery_status || '',
      it.price || 0,
      it.paid_amount || 0,
      it.courier_fee || 0,
      Math.round(((Number(it.paid_amount) || 0) - (Number(it.courier_fee) || 0)) * 100) / 100,
      it.cpr_reference || it.payment_ref || '',
      it.payment_date || '',
      it.shopify_note_added ? 'Synced' : 'Not Synced',
    ])
    exportRowsToCsv(headers, rows, `Recon_Session_${session.id}.csv`)
  }

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 14,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
    }}>
      {/* Session Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-elevated)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>
            {session.filename} <span style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>#{session.id}</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
            {new Date(session.created_at).toLocaleString()} · {totals.count || 0} orders ({totals.deliveredCount || 0} Del · {totals.returnedCount || 0} Ret)
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {missingNotesCount > 0 && (
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => onResyncNotes(session.id)}
              style={{
                padding: '7px 12px', borderRadius: 8, cursor: 'pointer',
                background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.32)',
                color: '#1d4ed8', fontSize: '0.75rem', fontWeight: 700,
              }}
            >🔄 Re-Sync {missingNotesCount} Shopify Notes</button>
          )}
          <button
            type="button"
            onClick={handleExportSession}
            style={{
              padding: '7px 12px', borderRadius: 8, cursor: 'pointer',
              background: 'var(--bg-surface)', border: '1px solid var(--border-bright)',
              color: 'var(--text-primary)', fontSize: '0.75rem', fontWeight: 700,
            }}
          >📥 Export CSV</button>
          <button
            type="button"
            disabled={isProcessing}
            onClick={() => onUndo(session.id, session.filename)}
            style={{
              padding: '7px 12px', borderRadius: 8, cursor: 'pointer',
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              color: '#dc2626', fontSize: '0.75rem', fontWeight: 700,
            }}
          >↩️ Undo Session</button>
        </div>
      </div>

      {/* Session PKR Totals Strip */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 10,
        padding: '12px 20px',
        borderBottom: '1px solid var(--border)',
      }}>
        <MiniStat label="Total COD Paid" value={`Rs. ${Number(totals.totalCod || 0).toLocaleString()}`} color="#059669" />
        <MiniStat label="Total Courier Fees" value={`Rs. ${Number(totals.totalFees || 0).toLocaleString()}`} color="#d97706" />
        <MiniStat label="Net Bank Deposit" value={`Rs. ${Number(totals.netPayout || 0).toLocaleString()}`} color="#2563eb" />
        <MiniStat label="Shopify Notes" value={`${items.length - missingNotesCount}/${items.length} Synced`} color={missingNotesCount === 0 ? '#059669' : '#64748b'} />
      </div>

      {/* Orders Table */}
      <div style={{ flex: 1, overflowY: 'auto', maxHeight: 540 }}>
        {items.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
            No individual order logs linked to this session.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-elevated)', zIndex: 2 }}>
              <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                <th style={thStyle}>Order # / Tracking</th>
                <th style={thStyle}>Customer &amp; Courier</th>
                <th style={thStyle}>Status</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Paid COD</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Fee</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Net</th>
                <th style={thStyle}>CPR / Note</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const paid = Number(it.paid_amount) || 0
                const fee = Number(it.courier_fee) || 0
                const net = Math.round((paid - fee) * 100) / 100
                const refDisplay = it.ref_number || it.shopify_order_id || `#${it.order_id}`
                return (
                  <tr key={it.log_id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={tdStyle}>
                      <button
                        type="button"
                        onClick={() => onOpenOrder(refDisplay)}
                        style={{
                          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                          fontWeight: 800, color: '#2563eb', fontSize: '0.82rem', textDecoration: 'underline'
                        }}
                      >{refDisplay}</button>
                      <div className="font-mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {it.tracking_number || '—'}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{it.customer_name || '—'}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{it.courier || '—'}</div>
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 99, fontSize: '0.68rem', fontWeight: 700,
                        background: (it.delivery_status || '').toLowerCase() === 'delivered' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                        color: (it.delivery_status || '').toLowerCase() === 'delivered' ? '#059669' : '#dc2626',
                      }}>{it.delivery_status || '—'}</span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>Rs. {paid.toLocaleString()}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: '#d97706' }}>Rs. {fee.toLocaleString()}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, color: net >= 0 ? '#059669' : '#dc2626' }}>
                      Rs. {net.toLocaleString()}
                    </td>
                    <td style={tdStyle}>
                      <div className="font-mono" style={{ fontSize: '0.7rem', color: 'var(--text-primary)' }}>
                        {it.cpr_reference || it.payment_ref || '—'}
                      </div>
                      <div style={{ fontSize: '0.66rem', color: it.shopify_note_added ? '#059669' : 'var(--text-muted)' }}>
                        {it.shopify_note_added ? '✓ Shopify Note' : 'ERP Only'}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export function MissingCostsPanel({
  ghostProducts,
  productCosts,
  setProductCosts,
  isScanning,
  isHealing,
  onScan,
  onApply,
}) {
  const filledCount = Object.values(productCosts).filter(v => Number(v) > 0).length

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 14,
      overflow: 'hidden',
      width: '100%',
    }}>
      <div style={{
        padding: '18px 22px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-elevated)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            👻 Missing Product Costs Recovery (Historical Order Healer)
          </h2>
          <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Scan historical orders with `Rs. 0` CGS, enter unit costs once, and heal PNL accuracy in bulk.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            disabled={isScanning}
            onClick={onScan}
            style={{
              padding: '9px 16px', borderRadius: 9, cursor: isScanning ? 'wait' : 'pointer',
              background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.32)',
              color: '#1d4ed8', fontWeight: 700, fontSize: '0.8rem',
            }}
          >{isScanning ? '⏳ Scanning Store Orders...' : '🔍 Scan Missing Costs'}</button>
          {ghostProducts.length > 0 && (
            <button
              type="button"
              disabled={isHealing || filledCount === 0}
              onClick={onApply}
              style={{
                padding: '9px 18px', borderRadius: 9, border: 'none',
                cursor: isHealing || filledCount === 0 ? 'not-allowed' : 'pointer',
                background: filledCount > 0 ? 'linear-gradient(135deg, #10b981, #059669)' : 'var(--bg-elevated)',
                color: filledCount > 0 ? '#fff' : 'var(--text-muted)',
                fontWeight: 800, fontSize: '0.8rem',
              }}
            >{isHealing ? '⏳ Healing...' : `💊 Heal ${filledCount} Product(s)`}</button>
          )}
        </div>
      </div>

      <div style={{ padding: 20 }}>
        {ghostProducts.length === 0 ? (
          <div style={{ padding: '44px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 42, marginBottom: 10 }}>🛡️</div>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
              Click &quot;Scan Missing Costs&quot; to audit historical orders
            </div>
            <div style={{ fontSize: '0.8rem' }}>
              Any historical product/variant with zero unit cost will appear here for 1-click bulk CGS healing.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                  <th style={thStyle}>Product Title / Key</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Affected Orders</th>
                  <th style={{ ...thStyle, textAlign: 'right', width: 200 }}>Unit Cost (PKR)</th>
                </tr>
              </thead>
              <tbody>
                {ghostProducts.map((gp, idx) => {
                  const key = gp.product_title || gp.title || gp.sku || `item-${idx}`
                  return (
                    <tr key={key} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ ...tdStyle, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {key}
                        {gp.sku && <div className="font-mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>SKU: {gp.sku}</div>}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <span style={{
                          padding: '2px 9px', borderRadius: 99, fontWeight: 800, fontSize: '0.72rem',
                          background: 'rgba(245,158,11,0.14)', color: '#b45309'
                        }}>{gp.order_count || gp.count || 1} orders</span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          className="form-input font-mono"
                          placeholder="e.g. 850"
                          value={productCosts[key] ?? ''}
                          onChange={e => setProductCosts(prev => ({ ...prev, [key]: e.target.value }))}
                          style={{ height: 34, textAlign: 'right', maxWidth: 160, marginLeft: 'auto' }}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export function ConfirmActionModal({ modal, onClose }) {
  if (!modal) return null
  const isDanger = modal.variant === 'danger'
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(15,23,42,0.68)', backdropFilter: 'blur(5px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
      }}
    >
      <div style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${isDanger ? 'rgba(239,68,68,0.4)' : 'var(--border-bright)'}`,
        borderRadius: 16, padding: 24, maxWidth: 440, width: '100%',
        boxShadow: '0 20px 50px rgba(0,0,0,0.4)'
      }}>
        <div style={{ fontSize: '1.05rem', fontWeight: 900, color: isDanger ? '#dc2626' : 'var(--text-primary)', marginBottom: 8 }}>
          {modal.title}
        </div>
        <p style={{ margin: '0 0 18px', fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
          {modal.message}
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 9, cursor: 'pointer',
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.82rem'
            }}
          >Cancel</button>
          <button
            type="button"
            onClick={async () => { const fn = modal.onConfirm; onClose(); await fn?.() }}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 9, border: 'none', cursor: 'pointer',
              background: isDanger ? '#dc2626' : '#2563eb',
              color: '#fff', fontWeight: 800, fontSize: '0.82rem'
            }}
          >{modal.confirmLabel || 'Confirm'}</button>
        </div>
      </div>
    </div>
  )
}

function MiniStat({ label, value, color }) {
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px' }}>
      <div style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '0.96rem', fontWeight: 900, color, marginTop: 2 }}>{value}</div>
    </div>
  )
}

const emptyPanelStyle = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  minHeight: 420,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--text-muted)',
  padding: 32,
  textAlign: 'center',
  flex: 1,
}

const thStyle = { padding: '10px 12px', fontSize: '0.69rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }
const tdStyle = { padding: '10px 12px', verticalAlign: 'middle' }
