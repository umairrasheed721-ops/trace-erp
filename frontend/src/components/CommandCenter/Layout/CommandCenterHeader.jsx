import React from 'react'
import SyncDashboard from '../SyncDashboard'

/**
 * CommandCenterHeader
 *
 * Renders the sticky top-bar for the Command Center page:
 * - Page title + version badge
 * - Sub-title caption (hidden in compact mode)
 * - The embedded SyncDashboard reconciliation panel
 *
 * Props:
 *   compactMode {boolean} — toggles compact typography sizes
 */
export default function CommandCenterHeader({ compactMode }) {
  return (
    <>
      {/* Title row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: compactMode ? 10 : 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: compactMode ? '1.1rem' : '1.4rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
            🔍 Command Center
            <span style={{ fontSize: '0.65rem', padding: '3px 8px', background: 'var(--brand-glow)', color: 'var(--brand)', borderRadius: '12px', border: '1px solid var(--brand)', letterSpacing: '0.05em' }}>
              v1.8.0: SKU &amp; TOOLTIP LIVE
            </span>
          </h2>
          {!compactMode && (
            <p style={{ margin: '4px 0 0', opacity: 0.6 }}>
              Advanced search, filter, and logistics management
            </p>
          )}
        </div>
      </div>

      {/* Logistics Reconciliation Dashboard */}
      <SyncDashboard />
    </>
  )
}
