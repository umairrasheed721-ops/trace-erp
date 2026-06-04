import React from 'react';

export default function ReportsFilterBar({
  datePreset,
  setDatePreset,
  customStart,
  setCustomStart,
  customEnd,
  setCustomEnd,
  showCustom,
  setShowCustom,
  activeDateRange,
  showColPicker,
  setShowColPicker,
  columns,
  hiddenColumns,
  toggleColumn,
  view,
  setView,
  filteredDaily,
  monthlyData,
  setShowBulkModal
}) {
  return (
    <>
      {/* ─── Date Range Filter Bar ─── */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.06em' }}>DATE RANGE</span>
        {['This Month', 'Last Month', 'This Quarter', 'This Year', 'Last Year', 'All Time', 'Custom'].map(p => (
          <button
            key={p}
            onClick={() => { setDatePreset(p); if (p === 'Custom') setShowCustom(true); else setShowCustom(false); }}
            style={{
              padding: '5px 12px',
              borderRadius: 20,
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
              border: '1px solid',
              transition: 'all 0.15s',
              borderColor: datePreset === p ? 'var(--brand)' : 'var(--border)',
              background: datePreset === p ? 'var(--brand-glow)' : 'var(--bg-surface)',
              color: datePreset === p ? 'var(--brand)' : 'var(--text-secondary)',
            }}
          >
            {p}
          </button>
        ))}
        {(datePreset === 'Custom' || showCustom) && (
          <>
            <input
              type="date"
              value={customStart}
              onChange={e => setCustomStart(e.target.value)}
              className="editable-input"
              style={{ width: 140, fontSize: '0.75rem' }}
            />
            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>→</span>
            <input
              type="date"
              value={customEnd}
              onChange={e => setCustomEnd(e.target.value)}
              className="editable-input"
              style={{ width: 140, fontSize: '0.75rem' }}
            />
          </>
        )}
        {activeDateRange.start && (
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginLeft: 4 }}>
            {activeDateRange.start} → {activeDateRange.end}
          </span>
        )}
      </div>

      <div className="view-controls">
        <div style={{ position: 'relative' }}>
          <button className="btn" onClick={() => setShowColPicker(!showColPicker)} style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>⚙️ Columns</button>
          {showColPicker && (
            <div className="column-picker">
              {columns.map(col => (
                <label key={col.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 12, color: 'var(--text-primary)' }}>
                  <input type="checkbox" checked={!hiddenColumns.includes(col.id)} onChange={() => toggleColumn(col.id)} disabled={col.group === 'key'} />
                  <span>{col.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {view === 'daily' && filteredDaily.length > 0 && (
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {filteredDaily.length} days
          </span>
        )}
        {view === 'monthly' && monthlyData.length > 0 && (
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {monthlyData.length} months
          </span>
        )}

        <div style={{ display: 'flex', gap: 8, background: 'var(--bg-active)', padding: 6, borderRadius: 10 }}>
          <button className={`btn ${view === 'daily' ? 'btn-primary' : ''}`} onClick={() => setView('daily')}>📅 Daily PNL</button>
          <button className={`btn ${view === 'monthly' ? 'btn-primary' : ''}`} onClick={() => setView('monthly')}>📊 Month Vise</button>
        </div>

        <button className="btn" onClick={() => setShowBulkModal(true)} style={{ background: 'var(--blue-dim)', color: 'var(--blue)', border: '1px solid var(--blue)' }}>🚀 Bulk Sync Spend</button>
      </div>
    </>
  );
}
