import React from 'react'

/**
 * CommandCenterStats
 *
 * Renders the KPI metric cards (Orders Found, Revenue Sum, Delivery Rate,
 * Missing Cost) and the Aging / Backlog bar.
 *
 * Entirely stateless — all data flows in as props from SearchTool.
 * Visible only when showKPIs is true (controlled by parent).
 */
export default function CommandCenterStats({
  // ── Visibility ────────────────────────────────────────────────────────
  showKPIs,
  showAgingBar,
  // ── KPI values ────────────────────────────────────────────────────────
  kpi,
  deliveryRate,
  missingCostCount,
  // ── Aging data ────────────────────────────────────────────────────────
  activeAgingBucket,
  setActiveAgingBucket,
  agingBuckets,
  agingCounts,
  // ── Actions ───────────────────────────────────────────────────────────
  setStatus,
  setShowAgingConfig,
}) {
  if (!showKPIs) return null

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
      {/* ── KPI Cards ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, flex: 1 }}>
        <div className="kpi-card blue" style={{ flex: 1 }}>
          <div className="kpi-label">Orders Found</div>
          <div className="kpi-value">{kpi.total}</div>
          <div className="kpi-icon">📦</div>
        </div>
        <div className="kpi-card purple" style={{ flex: 1 }}>
          <div className="kpi-label">Revenue Sum</div>
          <div className="kpi-value">Rs {Math.round(kpi.sum).toLocaleString()}</div>
          <div className="kpi-icon">💰</div>
        </div>
        {missingCostCount > 0 && (
          <div
            className="kpi-card red"
            style={{ flex: 1, cursor: 'pointer', border: '2px solid var(--red)' }}
            onClick={() => setStatus('[MISSING COST]')}
          >
            <div className="kpi-label">Missing Cost</div>
            <div className="kpi-value">{missingCostCount}</div>
            <div className="kpi-icon">⚠️</div>
          </div>
        )}
      </div>

      {/* ── Aging / Backlog Bar ───────────────────────────────────────── */}
      {showAgingBar && (
        <div className="card" style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
          <div style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)', fontSize: '0.6rem', fontWeight: 900, opacity: 0.3, letterSpacing: '0.1em' }}>
            BACKLOG
          </div>
          <div style={{ display: 'flex', gap: 6, flex: 1 }}>
            {agingBuckets.map((bucket, idx) => {
              const count = agingCounts[bucket.label] || 0
              const isActive = activeAgingBucket === bucket.label
              let bColor = 'var(--green)'
              if (idx > agingBuckets.length / 2) bColor = 'var(--orange)'
              if (idx === agingBuckets.length - 1) bColor = 'var(--red)'
              return (
                <div
                  key={bucket.label}
                  onClick={() => setActiveAgingBucket(isActive ? null : bucket.label)}
                  style={{
                    flex: 1,
                    padding: '4px 8px',
                    background: isActive ? bColor : 'var(--bg-elevated)',
                    border: `1px solid ${isActive ? bColor : 'var(--border)'}`,
                    borderRadius: 6,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '0.65rem', fontWeight: 700, color: isActive ? '#000' : 'var(--text-muted)' }}>{bucket.label}</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 900, color: isActive ? '#000' : bColor }}>{count}</div>
                </div>
              )
            })}
          </div>
          <button
            className="btn btn-secondary btn-sm"
            style={{ padding: '4px 6px' }}
            onClick={() => setShowAgingConfig(true)}
          >
            ⚙️
          </button>
        </div>
      )}
    </div>
  )
}
