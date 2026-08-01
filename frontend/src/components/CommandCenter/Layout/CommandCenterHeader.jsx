import React from 'react'

/**
 * CommandCenterHeader
 *
 * Renders the sticky top-bar for the Command Center page:
 * - Page title + version badge
 * - Sub-title caption (hidden in compact mode)
 *
 * Props:
 *   compactMode {boolean} — toggles compact typography sizes
 */
export default function CommandCenterHeader({ compactMode, preset, setPreset, status, setStatus }) {
  return (
    <>
      {/* Title row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: compactMode ? 10 : 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: compactMode ? '1.1rem' : '1.4rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
            🔍 Command Center
          </h2>

          {/* ⚡ Quick Preset Chips */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', marginLeft: 4 }}>⚡ Quick Presets:</span>
            <button
              type="button"
              onClick={() => { setPreset && setPreset('Today'); setStatus && setStatus('All Statuses'); }}
              className="btn btn-xs"
              style={{
                padding: '3px 10px',
                fontSize: '0.7rem',
                borderRadius: 12,
                background: preset === 'Today' && (status === 'All Statuses' || !status) ? 'var(--brand)' : 'var(--bg-elevated)',
                color: preset === 'Today' && (status === 'All Statuses' || !status) ? '#ffffff' : 'var(--text-primary)',
                border: preset === 'Today' && (status === 'All Statuses' || !status) ? '1px solid var(--brand)' : '1px solid var(--border)',
                cursor: 'pointer',
                fontWeight: 600,
                transition: 'all 0.15s ease'
              }}
            >
              🔥 Today
            </button>
            <button
              type="button"
              onClick={() => { setPreset && setPreset('This Week'); setStatus && setStatus('All Statuses'); }}
              className="btn btn-xs"
              style={{
                padding: '3px 10px',
                fontSize: '0.7rem',
                borderRadius: 12,
                background: preset === 'This Week' && (status === 'All Statuses' || !status) ? 'var(--brand)' : 'var(--bg-elevated)',
                color: preset === 'This Week' && (status === 'All Statuses' || !status) ? '#ffffff' : 'var(--text-primary)',
                border: preset === 'This Week' && (status === 'All Statuses' || !status) ? '1px solid var(--brand)' : '1px solid var(--border)',
                cursor: 'pointer',
                fontWeight: 600,
                transition: 'all 0.15s ease'
              }}
            >
              📅 This Week
            </button>
            <button
              type="button"
              onClick={() => { setPreset && setPreset('This Month'); setStatus && setStatus('All Statuses'); }}
              className="btn btn-xs"
              style={{
                padding: '3px 10px',
                fontSize: '0.7rem',
                borderRadius: 12,
                background: preset === 'This Month' && (status === 'All Statuses' || !status) ? 'var(--brand)' : 'var(--bg-elevated)',
                color: preset === 'This Month' && (status === 'All Statuses' || !status) ? '#ffffff' : 'var(--text-primary)',
                border: preset === 'This Month' && (status === 'All Statuses' || !status) ? '1px solid var(--brand)' : '1px solid var(--border)',
                cursor: 'pointer',
                fontWeight: 600,
                transition: 'all 0.15s ease'
              }}
            >
              🗓️ This Month
            </button>
            <button
              type="button"
              onClick={() => { setPreset && setPreset('All Time'); setStatus && setStatus('Shipper Advice'); }}
              className="btn btn-xs"
              style={{
                padding: '3px 10px',
                fontSize: '0.7rem',
                borderRadius: 12,
                background: status === 'Shipper Advice' ? 'var(--brand)' : 'var(--bg-elevated)',
                color: status === 'Shipper Advice' ? '#ffffff' : 'var(--text-primary)',
                border: status === 'Shipper Advice' ? '1px solid var(--brand)' : '1px solid var(--border)',
                cursor: 'pointer',
                fontWeight: 600,
                transition: 'all 0.15s ease'
              }}
            >
              ⚠️ Advice Required
            </button>
            <button
              type="button"
              onClick={() => { setPreset && setPreset('All Time'); setStatus && setStatus('In Transit'); }}
              className="btn btn-xs"
              style={{
                padding: '3px 10px',
                fontSize: '0.7rem',
                borderRadius: 12,
                background: status === 'In Transit' ? 'var(--brand)' : 'var(--bg-elevated)',
                color: status === 'In Transit' ? '#ffffff' : 'var(--text-primary)',
                border: status === 'In Transit' ? '1px solid var(--brand)' : '1px solid var(--border)',
                cursor: 'pointer',
                fontWeight: 600,
                transition: 'all 0.15s ease'
              }}
            >
              🚚 In Transit
            </button>
            <button
              type="button"
              onClick={() => { setPreset && setPreset('All Time'); setStatus && setStatus('Return In Transit'); }}
              className="btn btn-xs"
              style={{
                padding: '3px 10px',
                fontSize: '0.7rem',
                borderRadius: 12,
                background: status === 'Return In Transit' ? 'var(--brand)' : 'var(--bg-elevated)',
                color: status === 'Return In Transit' ? '#ffffff' : 'var(--text-primary)',
                border: status === 'Return In Transit' ? '1px solid var(--brand)' : '1px solid var(--border)',
                cursor: 'pointer',
                fontWeight: 600,
                transition: 'all 0.15s ease'
              }}
            >
              ↩️ Returns
            </button>
            <button
              type="button"
              onClick={() => { setPreset && setPreset('All Time'); setStatus && setStatus('Pending'); }}
              className="btn btn-xs"
              style={{
                padding: '3px 10px',
                fontSize: '0.7rem',
                borderRadius: 12,
                background: status === 'Pending' ? 'var(--brand)' : 'var(--bg-elevated)',
                color: status === 'Pending' ? '#ffffff' : 'var(--text-primary)',
                border: status === 'Pending' ? '1px solid var(--brand)' : '1px solid var(--border)',
                cursor: 'pointer',
                fontWeight: 600,
                transition: 'all 0.15s ease'
              }}
            >
              📦 Pending
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
