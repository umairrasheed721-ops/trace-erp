import React from 'react'
import { useNavigate } from 'react-router-dom'

const fmtRs = (v) => `Rs. ${Math.round(Number(v) || 0).toLocaleString()}`

const STATUS_STYLE = {
  pending:   { bg: 'rgba(245,158,11,0.12)', color: '#b45309', border: 'rgba(245,158,11,0.32)' },
  booked:    { bg: 'rgba(37,99,235,0.11)',  color: '#1d4ed8', border: 'rgba(37,99,235,0.30)' },
  'in transit': { bg: 'rgba(99,102,241,0.12)', color: '#4f46e5', border: 'rgba(99,102,241,0.32)' },
}

export default function CommittedOrdersModal({ open, loading, data, onClose }) {
  const navigate = useNavigate()
  if (!open) return null

  const orders = data?.orders || []
  const expectedCommitted = Number(data?.expectedCommitted) || 0
  const matchedUnits = Number(data?.matchedUnits) || 0
  const bulkRefs = orders
    .map(o => o.ref_number || o.shopify_order_id)
    .filter(Boolean)
    .join(', ')

  const openSingleInCommandCenter = (order) => {
    const kw = order.ref_number || order.shopify_order_id || ''
    if (!kw) return
    onClose()
    navigate('/search', {
      state: {
        preset: 'All Time',
        status: 'All Statuses',
        keyword: kw,
      },
    })
  }

  const openAllInCommandCenter = () => {
    if (!bulkRefs) return
    onClose()
    navigate('/search', {
      state: {
        preset: 'All Time',
        status: 'All Statuses',
        keyword: bulkRefs,
      },
    })
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 10050,
        background: 'rgba(15,23,42,0.56)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 740, maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 15, boxShadow: '0 24px 64px rgba(0,0,0,0.36)', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
          padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)',
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, color: 'var(--text-primary)' }}>
                📦 Committed Orders
              </h3>
              {!loading && (
                <span style={{
                  fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 99,
                  background: 'rgba(245,158,11,0.14)', color: '#b45309', border: '1px solid rgba(245,158,11,0.34)',
                }}>
                  {matchedUnits} unit{matchedUnits !== 1 ? 's' : ''} across {orders.length} order{orders.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
              {data?.title || 'Loading committed orders...'} · Click any order to open in Command Center
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 18, color: 'var(--text-muted)', cursor: 'pointer', padding: '2px 6px', lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '14px 18px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading ? (
            <div style={{ padding: '36px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
              ⏳ Fetching committed orders...
            </div>
          ) : (
            <>
              {expectedCommitted > matchedUnits && (
                <div style={{
                  padding: '8px 12px', borderRadius: 9, fontSize: 11.5, lineHeight: 1.45,
                  background: 'rgba(245,158,11,0.09)', border: '1px solid rgba(245,158,11,0.30)', color: '#92400e',
                }}>
                  <strong>Notice:</strong> Shopify reports <strong>{expectedCommitted}</strong> committed unit(s), while <strong>{matchedUnits}</strong> matched in synced ERP open orders. If a brand-new Shopify order was just placed, run Order Sync in Command Center.
                </div>
              )}

              {orders.length === 0 ? (
                <div style={{ padding: '30px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
                  No matching unfulfilled orders found in local ERP database.
                  <div style={{ fontSize: 11.5, marginTop: 4 }}>
                    Check Shopify Admin or run Sync Orders in Command Center to pull recent orders.
                  </div>
                </div>
              ) : (
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                        <th style={{ padding: '8px 12px', fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Order #</th>
                        <th style={{ padding: '8px 10px', fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Customer</th>
                        <th style={{ padding: '8px 10px', fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Variant &amp; Qty</th>
                        <th style={{ padding: '8px 10px', fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Status</th>
                        <th style={{ padding: '8px 10px', fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'right' }}>Total</th>
                        <th style={{ padding: '8px 12px', fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'right' }}>Open</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map(ord => {
                        const stKey = String(ord.delivery_status || 'pending').toLowerCase()
                        const st = STATUS_STYLE[stKey] || { bg: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: 'var(--border)' }
                        const singleHref = `/search?order=${encodeURIComponent(ord.ref_number || ord.shopify_order_id || '')}`
                        return (
                          <tr
                            key={ord.id}
                            onClick={() => openSingleInCommandCenter(ord)}
                            style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.12s' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.045)' }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                          >
                            <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                              <div style={{ fontWeight: 800, color: '#2563eb' }}>{ord.ref_number}</div>
                              <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{String(ord.order_date || '').slice(0, 10)}</div>
                            </td>
                            <td style={{ padding: '9px 10px' }}>
                              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{ord.customer_name}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                {[ord.phone, ord.city].filter(Boolean).join(' · ')}
                              </div>
                            </td>
                            <td style={{ padding: '9px 10px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                {(ord.matched_variants || []).map((mv, idx) => (
                                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                                    <span style={{
                                      fontSize: 10.5, fontWeight: 800, padding: '1px 6px', borderRadius: 99,
                                      background: 'rgba(245,158,11,0.14)', color: '#b45309',
                                    }}>
                                      ×{mv.qty}
                                    </span>
                                    <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-primary)' }}>{mv.variant_title}</span>
                                    {mv.sku && (
                                      <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{mv.sku}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </td>
                            <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>
                              <span style={{
                                fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                                background: st.bg, color: st.color, border: `1px solid ${st.border}`,
                              }}>
                                {ord.delivery_status}
                              </span>
                              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, textTransform: 'capitalize' }}>
                                {ord.fulfillment_status || 'unfulfilled'}
                              </div>
                            </td>
                            <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
                              {fmtRs(ord.price)}
                            </td>
                            <td style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                              <div style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => openSingleInCommandCenter(ord)}
                                  style={{
                                    padding: '4px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                    background: 'rgba(37,99,235,0.10)', color: '#1d4ed8', border: '1px solid rgba(37,99,235,0.30)',
                                  }}
                                >
                                  Open
                                </button>
                                <a
                                  href={singleHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Open in new tab"
                                  style={{
                                    padding: '4px 6px', borderRadius: 6, fontSize: 11, fontWeight: 700, textDecoration: 'none',
                                    background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)',
                                  }}
                                >
                                  ↗
                                </a>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
          padding: '11px 18px', borderTop: '1px solid var(--border)', background: 'var(--bg-elevated)',
        }}>
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
            Tip: Click any row to open that single order, or click <strong>View All</strong> to open all together.
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '7px 13px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)',
              }}
            >
              Close
            </button>
            {orders.length > 0 && (
              <>
                <a
                  href={`/search?order=${encodeURIComponent(bulkRefs)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open all these committed orders in a new tab"
                  style={{
                    padding: '7px 11px', borderRadius: 8, fontSize: 12, fontWeight: 700, textDecoration: 'none',
                    background: 'var(--bg-surface)', color: '#1d4ed8', border: '1px solid rgba(37,99,235,0.32)',
                  }}
                >
                  ↗ New Tab
                </a>
                <button
                  type="button"
                  onClick={openAllInCommandCenter}
                  style={{
                    padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    background: '#2563eb', color: '#fff', border: 'none',
                  }}
                >
                  View All in Command Center ({orders.length})
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
