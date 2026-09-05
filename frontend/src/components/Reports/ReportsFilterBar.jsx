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
  setHiddenColumns,
  toggleColumn,
  view,
  setView,
  filteredDaily,
  monthlyData,
  setShowBulkModal,
  tableLayout,
  setTableLayout
}) {
  const whatsappColIds = new Set([
    'date', 'whatsappOrders', 'whatsappPercent', 'whatsappDelPercent', 'whatsappRetPercent', 
    'whatsappTotalSale', 'whatsappDeliveredSale', 'whatsappAov', 'whatsappCgs', 'whatsappAvgCgs', 
    'whatsappCourier', 'whatsappAvgCourier'
  ]);

  const nonWhatsappCols = (columns || []).filter(c => !whatsappColIds.has(c.id)).map(c => c.id);
  const isWhatsappView = hiddenColumns && hiddenColumns.length === nonWhatsappCols.length && 
    nonWhatsappCols.length > 0 && nonWhatsappCols.every(id => hiddenColumns.includes(id));
  const isAllView = !hiddenColumns || hiddenColumns.length === 0;
  const activePreset = isWhatsappView ? 'whatsapp' : (isAllView ? 'all' : 'custom');

  const setWhatsappView = () => {
    if (typeof setHiddenColumns === 'function') {
      setHiddenColumns(nonWhatsappCols);
    }
  };

  const setAllColumnsView = () => {
    if (typeof setHiddenColumns === 'function') {
      setHiddenColumns([]);
    }
  };

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

        {/* 💬 View Preset Mode Switcher */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-active)', padding: 4, borderRadius: 10, border: '1px solid var(--border)' }}>
          <button
            className={`btn ${activePreset === 'all' ? 'btn-primary' : ''}`}
            onClick={setAllColumnsView}
            title="Show all PnL columns (Normal View)"
            style={{ padding: '6px 14px', fontSize: '0.76rem', fontWeight: 700 }}
          >
            👁️ Normal View
          </button>
          <button
            className={`btn ${activePreset === 'whatsapp' ? 'btn-primary' : ''}`}
            onClick={setWhatsappView}
            title="Focus ONLY on WhatsApp metrics & hide all other noise"
            style={{ 
              padding: '6px 14px', 
              fontSize: '0.76rem', 
              fontWeight: 700, 
              background: activePreset === 'whatsapp' ? '#25D366' : 'transparent', 
              color: activePreset === 'whatsapp' ? '#ffffff' : '#25D366',
              border: activePreset === 'whatsapp' ? 'none' : '1px solid rgba(37,211,102,0.4)',
              boxShadow: activePreset === 'whatsapp' ? '0 0 10px rgba(37,211,102,0.3)' : 'none'
            }}
          >
            💬 WhatsApp View
          </button>
        </div>

        {isWhatsappView && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 12px',
            borderRadius: 20,
            background: 'rgba(37,211,102,0.12)',
            border: '1px solid rgba(37,211,102,0.3)',
            color: '#25D366',
            fontSize: '0.72rem',
            fontWeight: 700
          }}>
            <span>💬 WhatsApp Focus Mode Active (11 Metrics)</span>
            <button
              onClick={setAllColumnsView}
              style={{
                background: 'rgba(37,211,102,0.25)',
                border: 'none',
                color: '#25D366',
                borderRadius: '50%',
                width: 18,
                height: 18,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: 10,
                fontWeight: 900
              }}
              title="Exit WhatsApp View & Restore All Columns"
            >
              ✕
            </button>
          </div>
        )}

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

        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-active)', padding: 5, borderRadius: 10, marginLeft: 'auto' }}>
          <button
            className={`btn ${tableLayout === 'horizontal' ? 'btn-primary' : ''}`}
            onClick={() => setTableLayout('horizontal')}
            title="Horizontal: Months as rows"
            style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem' }}
          >
            <span>⬌</span> Horizontal
          </button>
          <button
            className={`btn ${tableLayout === 'vertical' ? 'btn-primary' : ''}`}
            onClick={() => setTableLayout('vertical')}
            title="Vertical: Months as columns"
            style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem' }}
          >
            <span>⬍</span> Vertical
          </button>
        </div>
      </div>
    </>
  );
}
