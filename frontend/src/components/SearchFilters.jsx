import React from 'react'

export default function SearchFilters({
  preset, setPreset,
  customStart, setCustomStart,
  customEnd, setCustomEnd,
  status, setStatus,
  keyword, setKeyword,
  sort, setSort,
  selectedView, loadView,
  deleteView,
  savedViews,
  runSearch,
  setColFilters,
  setActiveAgingBucket,
  addToast,
  compactMode,
  toggleCompact,
  toggleAgingBar,
  showAgingBar,
  setShowAgingConfig,
  syncProgress,
  kpi,
  deliveryRate,
  missingCostCount,
  activeAgingBucket,
  agingBuckets,
  agingCounts,
  DATE_PRESETS,
  STATUS_OPTIONS,
  SORT_OPTIONS,
  setShowSaveDialog,
  setShowColPicker,
  setShowNameDialog,
  sortMode,
  setSortMode
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      {/* Primary Filters Row */}
      <div className="card" style={{ padding: compactMode ? '8px 12px' : '14px 16px', marginBottom: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 130px 1fr 1fr 1fr 1fr', gap: 10, alignItems: 'end' }}>
          <div>
            <label className="form-label">📅 Date Preset</label>
            <select className="form-select" value={preset} onChange={e => setPreset(e.target.value)}>
              {DATE_PRESETS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          
          {preset === 'Custom Range' ? (
            <>
              <div>
                <label className="form-label">📆 Start</label>
                <input type="date" className="form-input" value={customStart} onChange={e => setCustomStart(e.target.value)} />
              </div>
              <div>
                <label className="form-label">🏁 End</label>
                <input type="date" className="form-input" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
              </div>
            </>
          ) : (
            <><div /><div /></>
          )}

          <div>
            <label className="form-label">🏷️ Status / Mode</label>
            <select className="form-select" value={status} onChange={e => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="form-label">🔑 Keyword</label>
            <input 
              className="form-input" 
              placeholder="name, city, tracking..." 
              value={keyword} 
              onChange={e => setKeyword(e.target.value)} 
              onKeyDown={e => e.key === 'Enter' && runSearch()} 
            />
          </div>

          <div>
            <label className="form-label">🗂️ Sort</label>
            <select className="form-select" value={sort} onChange={e => setSort(e.target.value)}>
              {SORT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
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

          <div style={{ display: 'flex', gap: 6 }}>
            <button 
              className="btn btn-secondary" 
              onClick={() => {
                setPreset('All Time')
                setStatus('All Statuses')
                setKeyword('')
                setColFilters({ ref_number: '', customer_name: '', city: '', phone: '', status: '', courier: '', tracking_number: '', notes: '' })
                setActiveAgingBucket(null)
                addToast('Filters cleared', 'info')
              }}
              style={{ flex: 1, padding: '8px', fontSize: '0.75rem', fontWeight: 600 }}
            >
              🧹 Clear
            </button>
            <button 
              className="btn btn-primary" 
              onClick={() => runSearch()}
              style={{ flex: 1, padding: '8px', fontSize: '0.75rem', fontWeight: 600 }}
            >
              🔄 Refresh
            </button>
          </div>
        </div>
      </div>

      {/* KPI & Aging Row */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
        {/* KPI Cards */}
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
          <div className="kpi-card green" style={{ flex: 1 }}>
            <div className="kpi-label">Delivery Rate</div>
            <div className="kpi-value">{deliveryRate}%</div>
            <div className="kpi-icon">🎯</div>
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

        {/* Aging / Backlog Bar */}
        {showAgingBar && (
          <div className="card" style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <div style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)', fontSize: '0.6rem', fontWeight: 900, opacity: 0.3, letterSpacing: '0.1em' }}>BACKLOG</div>
            <div style={{ display: 'flex', gap: 6, flex: 1 }}>
              {agingBuckets.map((bucket, idx) => {
                const count = agingCounts[bucket.label] || 0
                const isActive = activeAgingBucket === bucket.label
                const pct = Math.min(1, idx / (agingBuckets.length - 1))
                const color = `interpolate-color(var(--green), var(--red), ${pct})` // Conceptually
                
                // Color mapping logic
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
                      position: 'relative'
                    }}
                  >
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: isActive ? '#000' : 'var(--text-muted)' }}>{bucket.label}</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 900, color: isActive ? '#000' : bColor }}>{count}</div>
                  </div>
                )
              })}
            </div>
            <button className="btn btn-secondary btn-sm" style={{ padding: '4px 6px' }} onClick={() => setShowAgingConfig(true)}>⚙️</button>
          </div>
        )}
      </div>

      {/* Sub-Header Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
         <div style={{ display: 'flex', gap: 8 }}>
            <button className={`btn btn-sm ${compactMode ? 'btn-primary' : 'btn-secondary'}`} onClick={toggleCompact}>
              {compactMode ? '📱 Ultra Compact' : '🖥️ Standard View'}
            </button>
            <button 
              className={`btn btn-sm ${sortMode === 'instant' ? 'btn-primary' : 'btn-secondary'}`} 
              onClick={() => setSortMode(sortMode === 'instant' ? 'deep' : 'instant')}
              title={sortMode === 'instant' ? "Sorting only the current page (blazing fast)" : "Sorting entire database (slower but deep)"}
            >
              {sortMode === 'instant' ? '⚡ Instant Mode' : '🌐 Deep Mode'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={toggleAgingBar}>
              {showAgingBar ? '📊 Hide Aging' : '📊 Show Aging'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowNameDialog(true)}>
              👤 Name Rules
            </button>
         </div>

         <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowColPicker(true)}>
              ⚙️ Columns
            </button>
            <button className="btn btn-brand btn-sm" onClick={() => setShowSaveDialog(true)} style={{ fontWeight: 800 }}>
              💾 Save Current View
            </button>
         </div>
      </div>
    </div>
  )
}
