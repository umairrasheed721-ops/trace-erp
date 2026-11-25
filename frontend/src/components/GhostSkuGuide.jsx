import React, { useState } from 'react'

const Icon = {
  Book: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
    </svg>
  ),
  Chevron: ({ open }) => (
    <svg
      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.16s ease' }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  Shield: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  ),
  Link: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
  Alert: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" />
    </svg>
  ),
}

function GuideBody({ context = 'costing' }) {
  const cardStyle = {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '12px 14px',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Rule Banner */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '10px 13px', borderRadius: 9,
        background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.26)',
        fontSize: 12.5, color: 'var(--text-primary)', lineHeight: 1.5,
      }}>
        <span style={{ color: '#2563eb', marginTop: 2, flexShrink: 0 }}><Icon.Shield size={15} /></span>
        <div>
          <strong>Strict SKU &amp; Variant ID Rule (Zero Estimations):</strong> ERP matches costs strictly by{' '}
          <strong>1) Master SKU</strong> → <strong>2) Shopify Variant ID</strong> → <strong>3) Explicit Alias (linked to SKU/Variant ID)</strong>.
          Title guessing and unverified Shopify cost estimations are disabled — unmapped items stay <strong>Rs. 0</strong> until linked so P&amp;L stays 100% accurate.
        </div>
      </div>

      {/* 3-Step Ghost Resolution Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
            Case 1 · Re-Listed / Active Product
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 5 }}>
            Link Ghost via Alias (10 Seconds)
          </div>
          <ol style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            <li>Open <strong>Costing &amp; Watchdog → Ghosts</strong> tab.</li>
            <li>Click <strong>Link to SKU</strong> on the ghost item.</li>
            <li>Pick the real active <strong>Master SKU</strong> — all past &amp; future orders heal automatically.</li>
          </ol>
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
            Case 2 · Deleted Listing on Shopify
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 5 }}>
            Create Archived SKU &amp; Link Alias
          </div>
          <ol style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            <li>In Shopify Admin, create a <strong>Draft / Archived</strong> product and assign a clean SKU (e.g. <code>TR-DISC-01</code>).</li>
            <li>Click <strong>Sync Shopify</strong> in Costing and save its verified unit cost (or receive via PO).</li>
            <li>Link the deleted ghost title to that SKU via <strong>Link to SKU</strong> — P&amp;L heals permanently.</li>
          </ol>
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
            Prevention · Zero Future Ghosts
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 5 }}>
            2 Golden Shopify SOPs
          </div>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            <li><strong>Never Delete</strong> old Shopify products — always set status to <strong>Archived</strong> so Variant IDs &amp; SKUs remain intact.</li>
            <li>Always enter a unique <strong>SKU</strong> on every variant before turning ads ON.</li>
            <li>Never create 1-pc POs for old returns — scan them in <strong>Unified Returns</strong> (already tracked under In-Transit Stock).</li>
          </ul>
        </div>
      </div>

      {/* PO & Ledger Quick Workflow Strip */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
        padding: '9px 13px', borderRadius: 9,
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        fontSize: 12, color: 'var(--text-muted)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ color: '#7c3aed', display: 'flex' }}><Icon.Alert size={14} /></span>
          <span>
            <strong style={{ color: 'var(--text-primary)' }}>Continue Selling Tip:</strong> When receiving a PO for negative-stock SKUs (e.g. <code>-18</code>), keep <strong>Push +Qty Delta to Shopify</strong> checked — <code>-18 + 50</code> becomes <code>+32</code> automatically.
          </span>
        </div>
        <a
          href={context === 'po' ? '/costing' : '/po-ledger'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 12, fontWeight: 700, color: '#2563eb', textDecoration: 'none', whiteSpace: 'nowrap',
          }}
        >
          <Icon.Link size={12.5} />
          <span>{context === 'po' ? 'Open Costing & Ghosts →' : 'Open PO & Ledger →'}</span>
        </a>
      </div>
    </div>
  )
}

/**
 * Reusable Ghost & Strict SKU Guide.
 * - mode="inline": Collapsible guide card for CostManager (Ghosts & Aliases tabs).
 * - mode="modal": Modal dialog for PoLedgerManager header "Ghost & SKU Guide" button.
 */
export default function GhostSkuGuide({ mode = 'inline', context = 'costing', defaultOpen = false, onClose }) {
  const [open, setOpen] = useState(defaultOpen)

  if (mode === 'modal') {
    return (
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(15,23,42,0.58)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: 820, maxHeight: '90vh', overflowY: 'auto',
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 14, padding: 20, boxShadow: '0 24px 60px rgba(0,0,0,0.32)',
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#2563eb', display: 'flex' }}><Icon.Book size={17} /></span>
              <div>
                <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, color: 'var(--text-primary)' }}>
                  Ghost Orders, Strict SKU &amp; PO Quick Guide
                </h3>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
                  Step-by-step SOP for handling deleted Shopify listings, Aliases, Continue Selling &amp; Returns
                </div>
              </div>
            </div>
            <button
              type="button"
              data-close-modal="true"
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, padding: 4 }}
            >
              ✕
            </button>
          </div>
          <GuideBody context={context} />
        </div>
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 12, marginBottom: 16, overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', padding: '11px 15px', border: 'none', background: 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{
            width: 26, height: 26, borderRadius: 7, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(37,99,235,0.10)', color: '#2563eb', flexShrink: 0,
          }}>
            <Icon.Book size={13.5} />
          </span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
              How to Resolve Deleted Listings &amp; Ghost Orders (Strict SKU / Variant ID Guide)
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
              Click to {open ? 'hide' : 'view'} step-by-step instructions for Aliases, deleted Shopify products, and zero-estimation costing
            </div>
          </div>
        </div>
        <span style={{ color: 'var(--text-muted)', display: 'flex' }}><Icon.Chevron open={open} /></span>
      </button>

      {open && (
        <div style={{ padding: '0 15px 15px', borderTop: '1px solid var(--border)', paddingTop: 13 }}>
          <GuideBody context={context} />
        </div>
      )}
    </div>
  )
}
