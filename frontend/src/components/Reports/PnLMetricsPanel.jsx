import React from 'react';
import { formatCurrency, formatPercent, formatNumber, getColMinWidth } from '../../hooks/useReportsData';

export default function PnLMetricsPanel({
  loading,
  view,
  filteredDaily,
  monthlyData,
  visibleCols,
  sortConfig,
  requestSort,
  handleMetricChange,
  handlePaste,
  handleDrilldown,
  tableContainerRef,
  hiddenColumns,
  columns
}) {
  const renderEditable = (row, field) => {
    const rawVal = row[field];
    const displayVal = (rawVal === 0 || rawVal === null || rawVal === undefined) ? '' : Math.round(rawVal * 100) / 100;
    return (
      <input 
        type="text" inputMode="numeric"
        value={displayVal}
        onChange={(e) => handleMetricChange(row.date, field, e.target.value.replace(/[^0-9.]/g, ''))}
        onPaste={(e) => handlePaste(e, row.date, field)}
        placeholder="0" className="editable-input"
      />
    );
  };

  if (loading) {
    return (
      <div style={{ padding: 100, textAlign: 'center', opacity: 0.5, color: 'var(--text-muted)' }}>
        ⏳ Crunching numbers...
      </div>
    );
  }

  const dataset = view === 'daily' ? filteredDaily : monthlyData;

  return (
    <div ref={tableContainerRef} className="stat-card" style={{ padding: 0, overflowX: 'auto', maxHeight: 'calc(100vh - 220px)', overflowY: 'auto', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
      <table className="reports-table">
        <thead>
          <tr style={{ height: 40 }}>
            {columns.find(c => c.id === 'date' && !hiddenColumns.includes('date')) && <th className="sticky-col"></th>}
            {visibleCols.filter(c => c.group === 'income').length > 0 && <th colSpan={visibleCols.filter(c => c.group === 'income').length} className="head-sales" style={{ textAlign: 'center' }}>💸 INCOME</th>}
            {visibleCols.filter(c => c.group === 'expense').length > 0 && <th colSpan={visibleCols.filter(c => c.group === 'expense').length} className="head-out" style={{ textAlign: 'center' }}>📉 EXPENSES</th>}
            {visibleCols.filter(c => c.group === 'profit').length > 0 && <th colSpan={visibleCols.filter(c => c.group === 'profit').length} className="head-pnl" style={{ textAlign: 'center' }}>💰 PROFIT</th>}
            {visibleCols.filter(c => c.group === 'kpi').length > 0 && <th colSpan={visibleCols.filter(c => c.group === 'kpi').length} className="head-kpi" style={{ textAlign: 'center' }}>🛡️ KPIs</th>}
          </tr>
          <tr>
            {visibleCols.map(col => (
              <th 
                key={col.id} 
                className={col.id === 'date' ? 'sticky-col' : ''} 
                onClick={() => requestSort(col.id)}
                style={{
                  minWidth: getColMinWidth(col),
                }}
              >
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: col.id === 'date' ? 'flex-start' : 'flex-end', 
                  gap: 4,
                  width: '100%'
                }}>
                  <span style={{ 
                    flexGrow: 1, 
                    minWidth: 0, 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    whiteSpace: 'nowrap',
                    textAlign: col.id === 'date' ? 'left' : 'right'
                  }}>
                    {col.label}
                  </span>
                  {sortConfig.key === col.id && (
                    <span style={{ flexShrink: 0, marginLeft: 2 }}>
                      {sortConfig.direction === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataset.map(row => (
            <tr key={row.date || row.month}>
              {visibleCols.map(col => {
                let content = row[col.id];
                let style = {};
                if (col.id === 'date') return <td key={col.id} className="sticky-col">{row.date || row.month}</td>;
                if (['aov', 'deliveredSale', 'cgs', 'taxPaid', 'grossProfit', 'estCourier', 'actualCourier', 'courierDiff', 'actualExp', 'pnl', 'paymentPaid', 'marketingSpend', 'tiktokMarketing', 'cpaAvg', 'netCpaAvg', 'unpaidAmount', 'diffCorrection'].includes(col.id)) content = formatCurrency(row[col.id]);
                if (['cgsPercent', 'marPercent', 'delPercent', 'canPercent'].includes(col.id)) content = formatPercent(row[col.id]);
                if (['roasMeta'].includes(col.id)) content = formatNumber(row[col.id]);
                if (view === 'daily' && ['marketingSpend', 'tiktokMarketing', 'actualExp', 'diffCorrection'].includes(col.id)) content = renderEditable(row, col.id);
                
                if (col.id === 'pnl') style = { color: row.pnl >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 800 };
                const isClickable = ['landedOrders', 'cancelations', 'pending', 'booked', 'totalDispatched', 'delivered', 'restock', 'missingParcel', 'intransit', 'fakeReturns', 'withoutTrackingId', 'deliveredPaymentPending', 'costGaps', 'overduePayoutCount'].includes(col.id);

                return (
                  <td 
                    key={col.id} 
                    style={{ 
                      ...style, 
                      cursor: isClickable ? 'pointer' : 'default',
                      color: ((col.id === 'costGaps' && row.costGaps > 0) || (col.id === 'overduePayoutCount' && row.overduePayoutCount > 0)) ? 'var(--red)' : style.color,
                      fontWeight: ((col.id === 'costGaps' && row.costGaps > 0) || (col.id === 'overduePayoutCount' && row.overduePayoutCount > 0)) ? 'bold' : style.fontWeight
                    }} 
                    onClick={() => isClickable && handleDrilldown(row, col.id)}
                  >
                    {isClickable ? (
                      <span style={{ borderBottom: '1px dashed var(--text-muted)' }}>{content}</span>
                    ) : content}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
