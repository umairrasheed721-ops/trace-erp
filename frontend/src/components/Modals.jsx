import React from 'react'

// Columns that can NEVER be removed — they power profit reports and core operations
const LOCKED_COLS = ['delivery_status', 'edit'];

export function SaveViewModal({ show, onClose, viewName, setViewName, isViewLocked, setIsViewLocked, onSave }) {
  if (!show) return null
  return (
    <div className="modal-overlay">
      <div className="modal-content glass-panel" style={{ width: 380, padding: 28 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 className="premium-title" style={{ margin: 0, fontSize: '1.25rem' }}>💾 Save Current View</h3>
          <button 
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer',
              fontSize: '1.2rem', padding: '4px 8px', borderRadius: '50%'
            }}
          >
            ✕
          </button>
        </div>

        {/* Input */}
        <div className="form-group" style={{ marginBottom: 20 }}>
          <label className="form-label" style={{ fontWeight: 600, marginBottom: 8, display: 'block' }}>View Name</label>
          <input 
            className="form-input" 
            placeholder="e.g. Fulfillment View" 
            value={viewName} 
            onChange={e => setViewName(e.target.value)} 
            autoFocus
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
        </div>

        {/* Lock Switch */}
        <label style={{ 
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, 
          cursor: 'pointer', fontSize: '0.85rem', userSelect: 'none',
          background: 'var(--bg-elevated)', padding: '10px 14px', borderRadius: 8,
          border: '1px solid var(--border-bright)'
        }}>
          <input 
            type="checkbox" 
            checked={isViewLocked} 
            onChange={e => setIsViewLocked(e.target.checked)} 
            style={{ width: 16, height: 16, accentColor: 'var(--brand)', cursor: 'pointer' }}
          />
          <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Lock Column Order</span>
        </label>

        {/* Actions */}
        <div className="flex gap-2">
          <button className="btn btn-primary" style={{ flex: 1, padding: '11px 20px', borderRadius: 8, fontWeight: 700 }} onClick={onSave}>Save View</button>
          <button className="btn btn-secondary" style={{ padding: '11px 20px', borderRadius: 8 }} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export function ColumnPickerModal({ show, onClose, cols, setCols, DEFAULT_COLS }) {
  if (!show) return null

  const handleReset = () => {
    if (window.confirm('Reset all columns to default layout?')) {
      localStorage.removeItem('trace_search_cols');
      setCols(DEFAULT_COLS);
    }
  };

  const CATEGORIES = [
    {
      title: '📦 Order & Source',
      ids: ['ref_number', 'order_date', 'items', 'order_source', 'notes']
    },
    {
      title: '👤 Customer Info',
      ids: ['customer_name', 'customer_history', 'phone', 'address', 'city']
    },
    {
      title: '🚚 Logistics & Status',
      ids: ['tracking_number', 'courier', 'courier_status', 'delivery_status', 'wa_erp_status', 'postex_weight', 'status_date']
    },
    {
      title: '💰 Financials & Performance',
      ids: ['price', 'cost', 'courier_fee', 'profit', 'payment_status', 'paid_amount', 'payment_ref', 'payment_date']
    },
    {
      title: '⚡ Actions',
      ids: ['edit']
    }
  ];

  return (
    <div className="modal-overlay" style={{ zIndex: 10000 }}>
      <div className="modal-content glass-panel" style={{ width: 680, padding: '24px 28px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, borderBottom: '1px solid var(--border-bright)', paddingBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.4rem' }}>⚙️</span>
            <h3 className="premium-title" style={{ margin: 0, fontSize: '1.25rem', letterSpacing: '-0.02em' }}>Configure Columns</h3>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button 
              className="btn btn-secondary btn-sm" 
              onClick={handleReset}
              style={{ fontSize: '0.78rem', color: 'var(--orange)', display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8 }}
              title="Restore all default columns"
            >
              🔄 Reset Default
            </button>
            <button 
              onClick={onClose}
              style={{
                background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer',
                fontSize: '1.2rem', padding: '4px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: '50%', transition: 'background 0.2s'
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content Wrapper */}
        <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4, marginBottom: 20 }}>
          <div style={{ 
            fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 18, 
            background: 'var(--bg-hover)', padding: '10px 14px', borderRadius: 8, 
            border: '1px solid var(--border-bright)', display: 'flex', alignItems: 'center', gap: 6
          }}>
            <span>🔒</span>
            <span>Locked columns (Status, Action) cannot be removed — they power profit reports and core operations.</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {CATEGORIES.map(category => {
              const categoryCols = DEFAULT_COLS.filter(c => category.ids.includes(c.id));
              if (categoryCols.length === 0) return null;

              return (
                <div key={category.title} style={{
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)',
                  borderRadius: 12, padding: 16
                }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {category.title}
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                    {categoryCols.map(c => {
                      const isVisible = cols.some(col => col.id === c.id)
                      const isLocked = LOCKED_COLS.includes(c.id)

                      return (
                        <label 
                          key={c.id} 
                          style={{ 
                            display: 'flex', alignItems: 'center', justifySelf: 'stretch', gap: 10, fontSize: '0.82rem', 
                            cursor: isLocked ? 'not-allowed' : 'pointer', 
                            padding: '10px 14px', 
                            background: isLocked ? 'rgba(99,102,241,0.06)' : isVisible ? 'var(--bg-surface)' : 'var(--bg-elevated)', 
                            borderRadius: 10,
                            border: isLocked 
                              ? '1px solid rgba(99,102,241,0.25)' 
                              : isVisible 
                                ? '1px solid var(--brand)' 
                                : '1px solid var(--border-bright)',
                            transition: 'all 0.2s ease',
                            userSelect: 'none'
                          }}
                        >
                          <input 
                            type="checkbox" 
                            checked={!!isVisible} 
                            disabled={isLocked}
                            style={{
                              width: 16, height: 16, cursor: isLocked ? 'not-allowed' : 'pointer',
                              accentColor: 'var(--brand)'
                            }}
                            onChange={e => {
                              if (isLocked) return;
                              if (e.target.checked) setCols(prev => [...prev, c])
                              else setCols(prev => prev.filter(col => col.id !== c.id))
                            }} 
                          />
                          <span style={{ 
                            fontWeight: isVisible || isLocked ? 600 : 400,
                            color: isLocked ? 'var(--text-muted)' : 'var(--text-primary)',
                            display: 'flex', alignItems: 'center', gap: 4
                          }}>
                            {c.label}
                            {isLocked && <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>🔒</span>}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer Button */}
        <button 
          className="btn btn-primary" 
          style={{ width: '100%', padding: '12px', fontWeight: 700, borderRadius: 10, fontSize: '0.9rem' }} 
          onClick={onClose}
        >
          Finish Configuration
        </button>
      </div>
    </div>
  )
}

export function AgingConfigModal({ show, onClose, agingConfig, setAgingConfig, onConfirm }) {
  if (!show) return null
  return (
    <div className="modal-overlay">
      <div className="modal-content glass-panel" style={{ width: 380, padding: 28 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 className="premium-title" style={{ margin: 0, fontSize: '1.25rem' }}>⏳ Aging Bar Config</h3>
          <button 
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer',
              fontSize: '1.2rem', padding: '4px 8px', borderRadius: '50%'
            }}
          >
            ✕
          </button>
        </div>

        {/* Inputs */}
        <div className="form-group" style={{ marginBottom: 16 }}>
          <label className="form-label" style={{ fontWeight: 600, marginBottom: 8, display: 'block' }}>Critical Level (Days until Red)</label>
          <select 
            className="form-select" 
            value={agingConfig.criticalLevel} 
            onChange={e => setAgingConfig(prev => ({ ...prev, criticalLevel: parseInt(e.target.value) }))}
            style={{ width: '100%' }}
          >
            {[3, 5, 7, 8, 10, 14].map(v => <option key={v} value={v}>{v} Days</option>)}
          </select>
        </div>

        <div className="form-group" style={{ marginBottom: 24 }}>
          <label className="form-label" style={{ fontWeight: 600, marginBottom: 8, display: 'block' }}>Aging Span (Grouping)</label>
          <select 
            className="form-select" 
            value={agingConfig.span} 
            onChange={e => setAgingConfig(prev => ({ ...prev, span: parseInt(e.target.value) }))}
            style={{ width: '100%' }}
          >
            {[1, 2, 3].map(v => <option key={v} value={v}>{v} Day{v > 1 ? 's' : ''}</option>)}
          </select>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button className="btn btn-primary" style={{ flex: 1, padding: '11px 20px', borderRadius: 8, fontWeight: 700 }} onClick={onConfirm}>Confirm</button>
          <button className="btn btn-secondary" style={{ padding: '11px 20px', borderRadius: 8 }} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export function NameRulesModal({ show, onClose, nameSettings, setNameSettings, onSave }) {
  if (!show) return null
  return (
    <div className="modal-overlay">
      <div className="modal-content glass-panel" style={{ width: 400, padding: 28 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 className="premium-title" style={{ margin: 0, fontSize: '1.25rem' }}>🖊️ Customer Name Rules</h3>
          <button 
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer',
              fontSize: '1.2rem', padding: '4px 8px', borderRadius: '50%'
            }}
          >
            ✕
          </button>
        </div>

        {/* Shorten Switch */}
        <label style={{ 
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, 
          cursor: 'pointer', fontSize: '0.85rem', userSelect: 'none',
          background: 'var(--bg-elevated)', padding: '12px 14px', borderRadius: 8,
          border: '1px solid var(--border-bright)'
        }}>
          <input 
            type="checkbox" 
            checked={nameSettings.shorten} 
            onChange={e => setNameSettings({ ...nameSettings, shorten: e.target.checked })} 
            style={{ width: 16, height: 16, accentColor: 'var(--brand)', cursor: 'pointer' }}
          />
          <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Limit to max 2 words (Short View)</span>
        </label>

        {/* Textarea */}
        <div className="form-group" style={{ marginBottom: 24 }}>
          <label className="form-label" style={{ fontWeight: 600, marginBottom: 8, display: 'block' }}>Hide/Strip Words (comma separated)</label>
          <textarea 
            className="form-textarea" 
            rows={3} 
            placeholder="e.g. Mr, Ms, Dr, Malik" 
            value={nameSettings.stripWords} 
            onChange={e => setNameSettings({ ...nameSettings, stripWords: e.target.value })} 
            style={{ fontSize: '0.85rem', width: '100%', boxSizing: 'border-box', padding: '10px 12px', resize: 'none' }}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button className="btn btn-primary" style={{ flex: 1, padding: '11px 20px', borderRadius: 8, fontWeight: 700 }} onClick={onSave}>Save Instructions</button>
          <button className="btn btn-secondary" style={{ padding: '11px 20px', borderRadius: 8 }} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
