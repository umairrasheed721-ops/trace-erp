import React from 'react'

export function SaveViewModal({ show, onClose, viewName, setViewName, isViewLocked, setIsViewLocked, onSave }) {
  if (!show) return null
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ width: 340, padding: 24 }}>
        <div style={{ fontWeight: 700, marginBottom: 16 }}>💾 Save Layout as View</div>
        <input 
          className="form-input mb-4" 
          placeholder="e.g. Fulfillment View" 
          value={viewName} 
          onChange={e => setViewName(e.target.value)} 
          autoFocus
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, cursor: 'pointer', fontSize: '0.85rem' }}>
          <input type="checkbox" checked={isViewLocked} onChange={e => setIsViewLocked(e.target.checked)} />
          Lock Column Order
        </label>
        <div className="flex gap-2">
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={onSave}>Save View</button>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// Columns that can NEVER be removed — they power profit reports and core operations
const LOCKED_COLS = ['delivery_status', 'edit'];

export function ColumnPickerModal({ show, onClose, cols, setCols, DEFAULT_COLS }) {
  if (!show) return null

  const handleReset = () => {
    if (window.confirm('Reset all columns to default layout?')) {
      localStorage.removeItem('trace_search_cols');
      setCols(DEFAULT_COLS);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ width: 600, padding: 24, maxHeight: '80vh', overflow: 'auto' }}>
        <div style={{ fontWeight: 700, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>🎥 Configure Columns</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button 
              className="btn btn-secondary btn-sm" 
              onClick={handleReset}
              style={{ fontSize: '0.7rem', color: 'var(--orange)' }}
              title="Restore all default columns"
            >
              🔄 Reset Default
            </button>
            <button className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
          </div>
        </div>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 12 }}>
          🔒 Locked columns (Status, Action) cannot be removed — they power profit reports.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {DEFAULT_COLS.map(c => {
            const isVisible = cols.find(col => col.id === c.id)
            const isLocked = LOCKED_COLS.includes(c.id)
            return (
              <label key={c.id} style={{ 
                display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', 
                cursor: isLocked ? 'not-allowed' : 'pointer', 
                padding: '6px 10px', 
                background: isLocked ? 'rgba(99,102,241,0.1)' : 'var(--bg-elevated)', 
                borderRadius: 6,
                border: isLocked ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent'
              }}>
                <input 
                  type="checkbox" 
                  checked={!!isVisible} 
                  disabled={isLocked}
                  onChange={e => {
                    if (isLocked) return;
                    if (e.target.checked) setCols(prev => [...prev, c])
                    else setCols(prev => prev.filter(col => col.id !== c.id))
                  }} 
                />
                {isLocked ? '🔒 ' : ''}{c.label}
              </label>
            )
          })}
        </div>
        <button className="btn btn-primary mt-6 w-full" onClick={onClose}>Finish</button>
      </div>
    </div>
  )
}

export function AgingConfigModal({ show, onClose, agingConfig, setAgingConfig, onConfirm }) {
  if (!show) return null
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ width: 360, padding: 24 }}>
        <div style={{ fontWeight: 700, marginBottom: 20, fontSize: '1.1rem' }}>⚙️ Configure Aging Bar</div>
        <div className="form-group">
          <label className="form-label">Critical Level (Days until Red)</label>
          <select className="form-select" value={agingConfig.criticalLevel} onChange={e => setAgingConfig(prev => ({ ...prev, criticalLevel: parseInt(e.target.value) }))}>
            {[3, 5, 7, 8, 10, 14].map(v => <option key={v} value={v}>{v} Days</option>)}
          </select>
        </div>
        <div className="form-group mt-4">
          <label className="form-label">Aging Span (Grouping)</label>
          <select className="form-select" value={agingConfig.span} onChange={e => setAgingConfig(prev => ({ ...prev, span: parseInt(e.target.value) }))}>
            {[1, 2, 3].map(v => <option key={v} value={v}>{v} Day{v > 1 ? 's' : ''}</option>)}
          </select>
        </div>
        <div className="flex gap-2 mt-8">
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={onConfirm}>Confirm</button>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export function NameRulesModal({ show, onClose, nameSettings, setNameSettings, onSave }) {
  if (!show) return null
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ width: 380, padding: 24 }}>
        <div style={{ fontWeight: 700, marginBottom: 18, fontSize: '1.1rem' }}>🖊️ Customer Name Rules</div>
        <div className="form-group">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={nameSettings.shorten} onChange={e => setNameSettings({ ...nameSettings, shorten: e.target.checked })} />
            <span style={{ fontSize: '0.85rem' }}>Limit to max 2 words (Short View)</span>
          </label>
        </div>
        <div className="form-group mt-4">
          <label className="form-label">Hide Words (comma separated)</label>
          <textarea className="form-textarea" rows={3} placeholder="e.g. Mr, Ms, Dr, Malik" value={nameSettings.stripWords} onChange={e => setNameSettings({ ...nameSettings, stripWords: e.target.value })} style={{ fontSize: '0.8rem' }} />
        </div>
        <div className="flex gap-2 mt-6">
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={onSave}>Save Instructions</button>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
