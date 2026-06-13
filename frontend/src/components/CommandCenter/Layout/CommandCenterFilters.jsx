import React from 'react'
import CommandCenterStats from './CommandCenterStats'

/**
 * CommandCenterFilters
 *
 * Renders the primary filter row (Date, Status, Keyword, Sort, Saved Views,
 * Clear/Refresh), the KPI/aging stats row (via CommandCenterStats), and the
 * sub-header action buttons.
 *
 * All state values and setters are received as props from SearchTool.
 * This component is intentionally stateless — it owns no local state.
 */
export default function CommandCenterFilters({
  // ── Primary filter values ─────────────────────────────────────────────
  preset, setPreset,
  customStart, setCustomStart,
  customEnd, setCustomEnd,
  status, setStatus,
  keyword, setKeyword,
  searchInputRef,
  sort, setSort,
  // ── Saved views ───────────────────────────────────────────────────────
  selectedView, loadView, deleteView, savedViews,
  // ── Actions ───────────────────────────────────────────────────────────
  runSearch, onClear,
  setColFilters,
  setActiveAgingBucket,
  addToast,
  // ── Display toggles ───────────────────────────────────────────────────
  compactMode, toggleCompact,
  toggleAgingBar, showAgingBar,
  setShowAgingConfig,
  showKPIs, toggleKPIs,
  sortMode, setSortMode,
  // ── Dialog triggers ───────────────────────────────────────────────────
  setShowSaveDialog, setShowColPicker, setShowNameDialog,
  // ── KPI / Aging data (forwarded to CommandCenterStats) ────────────────
  syncProgress,
  kpi, deliveryRate, missingCostCount,
  activeAgingBucket, agingBuckets, agingCounts,
  // ── Constants ─────────────────────────────────────────────────────────
  DATE_PRESETS, STATUS_OPTIONS, SORT_OPTIONS,
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      {/* ── Primary Filters Row ─────────────────────────────────────────── */}
      <div className="card" style={{ padding: compactMode ? '8px 12px' : '14px 16px', marginBottom: 10 }}>
        <div className="flex flex-wrap items-end gap-3" style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'end',
          gap: 12
        }}>
          {/* Keyword Search */}
          <div className="w-80" style={{ width: '320px', minWidth: '320px' }}>
            <label className="form-label">🔑 Keyword</label>
            <input
              ref={searchInputRef}
              className="form-input"
              placeholder="Search Order, Name, Phone..."
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runSearch()}
            />
          </div>

          {/* Date Preset */}
          <div style={{ width: '180px', minWidth: '180px' }}>
            <label className="form-label">📅 Date Preset</label>
            <select className="form-select" value={preset} onChange={e => setPreset(e.target.value)}>
              {DATE_PRESETS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {/* Custom date pickers */}
          {preset === 'Custom Range' && (
            <>
              <div style={{ width: '130px', minWidth: '130px' }}>
                <label className="form-label">📆 Start</label>
                <input type="date" className="form-input" value={customStart} onChange={e => setCustomStart(e.target.value)} />
              </div>
              <div style={{ width: '130px', minWidth: '130px' }}>
                <label className="form-label">🏁 End</label>
                <input type="date" className="form-input" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
              </div>
            </>
          )}

          {/* Status / Mode */}
          <div style={{ width: '180px', minWidth: '180px' }}>
            <label className="form-label">🏷️ Status / Mode</label>
            <select className="form-select" value={status} onChange={e => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Aging Filter Dropdown */}
          <div style={{ width: '180px', minWidth: '180px' }}>
            <label className="form-label">⏳ Aging Filter</label>
            <select 
              className="form-select" 
              value={activeAgingBucket || ''} 
              onChange={e => setActiveAgingBucket(e.target.value || null)}
            >
              <option value="">— All Aging —</option>
              {agingBuckets.map(b => (
                <option key={b.label} value={b.label}>{b.label}</option>
              ))}
            </select>
          </div>

          {/* Sort */}
          <div style={{ width: '140px', minWidth: '140px' }}>
            <label className="form-label">🗂️ Sort</label>
            <select className="form-select" value={sort} onChange={e => setSort(e.target.value)}>
              {SORT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Saved Views */}
          <div style={{ width: '180px', minWidth: '180px' }}>
            <label className="form-label">⭐ Saved Views</label>
            <div style={{ display: 'flex', gap: 4 }}>
              <select className="form-select" style={{ flex: 1 }} value={selectedView} onChange={e => loadView(e.target.value)}>
                <option value="">— Default Layout —</option>
                {savedViews.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.is_locked ? '🔒' : '👤'} {v.view_name}
                  </option>
                ))}
              </select>
              {selectedView && (
                <button className="btn btn-secondary btn-sm" onClick={deleteView} title="Delete View">🗑️</button>
              )}
            </div>
          </div>

          {/* Clear / Refresh */}
          <button
            className="btn btn-secondary"
            onClick={onClear}
            style={{ padding: '8px 12px', fontSize: '0.75rem', fontWeight: 600, height: '36px' }}
          >
            🧹 Clear
          </button>
          <button
            className="btn btn-primary"
            onClick={() => runSearch()}
            style={{ padding: '8px 12px', fontSize: '0.75rem', fontWeight: 600, height: '36px' }}
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* ── KPI & Aging Row (delegated to CommandCenterStats) ────────────── */}
      <CommandCenterStats
        showKPIs={showKPIs}
        showAgingBar={showAgingBar}
        kpi={kpi}
        deliveryRate={deliveryRate}
        missingCostCount={missingCostCount}
        activeAgingBucket={activeAgingBucket}
        setActiveAgingBucket={setActiveAgingBucket}
        agingBuckets={agingBuckets}
        agingCounts={agingCounts}
        setStatus={setStatus}
        setShowAgingConfig={setShowAgingConfig}
      />

      {/* ── Action Buttons Group ────────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 12 }}>
        <button className={`btn btn-sm ${compactMode ? 'btn-primary' : 'btn-secondary'}`} onClick={toggleCompact}>
          {compactMode ? '📱 Ultra Compact' : '🖥️ Standard View'}
        </button>
        <button
          className={`btn btn-sm ${sortMode === 'instant' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setSortMode(sortMode === 'instant' ? 'deep' : 'instant')}
          title={sortMode === 'instant' ? 'Sorting only the current page (blazing fast)' : 'Sorting entire database (slower but deep)'}
        >
          {sortMode === 'instant' ? '⚡ Instant Mode' : '🌐 Deep Mode'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={toggleAgingBar}>
          {showAgingBar ? '📊 Hide Aging' : '📊 Show Aging'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={toggleKPIs}>
          {showKPIs ? '📉 Hide Stats' : '📈 Show Stats'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => setShowNameDialog(true)}>
          👤 Name Rules
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => setShowColPicker(true)}>
          ⚙️ Columns
        </button>
        <button className="btn btn-brand btn-sm" onClick={() => setShowSaveDialog(true)} style={{ fontWeight: 800 }}>
          💾 Save Current View
        </button>
      </div>
    </div>
  )
}
