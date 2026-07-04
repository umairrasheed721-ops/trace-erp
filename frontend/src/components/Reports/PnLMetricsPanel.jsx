import React, { useState } from 'react';
import { formatCurrency, formatPercent, formatNumber, getColMinWidth } from '../../hooks/useReportsData';

const COLUMN_INFO = {
  date: {
    description: "The reporting period group (daily dates or monthly segments).",
    formula: "COALESCE(order_date, status_date)"
  },
  aov: {
    description: "Average Order Value. The average sale price collected per successfully delivered shipment.",
    formula: "Delivered Sale / Delivered Count"
  },
  deliveredSale: {
    description: "Gross revenue collected from all successfully delivered shipments. This represents actual cash sales.",
    formula: "SUM(price) WHERE status = 'Delivered'"
  },
  cgs: {
    description: "Cost of Goods Sold. Represents the total product purchasing cost plus packaging material costs of all delivered and returned orders.",
    formula: "Pure CGS + Sunk Packaging"
  },
  cgsPercent: {
    description: "CGS Percentage. Shows what portion of the delivered revenue is spent on product costs.",
    formula: "(CGS / Delivered Sale) * 100"
  },
  taxPaid: {
    description: "Sales Tax. Estimated tax liability calculated as 4% of delivered sale revenue.",
    formula: "Delivered Sale * 0.04"
  },
  grossProfit: {
    description: "Gross Profit. Earnings remaining after deducting product costs (CGS) and packaging waste.",
    formula: "Delivered Sale - CGS"
  },
  marPercent: {
    description: "Marketing Cost Ratio. The percentage of delivered sales revenue spent on Meta/TikTok advertising.",
    formula: "(Total Ad Spend / Delivered Sale) * 100"
  },
  marketingSpend: {
    description: "Meta Ads Spend. Total marketing expenditure spent on Facebook and Instagram ads.",
    formula: "Synced via Meta API or manually entered"
  },
  tiktokMarketing: {
    description: "TikTok Ads Spend. Total marketing expenditure spent on TikTok ads.",
    formula: "Synced via TikTok API or manually entered"
  },
  estCourier: {
    description: "Estimated Courier Cost. Flat estimate calculated at Rs 200 per dispatched parcel.",
    formula: "Dispatched Orders * 200"
  },
  actualCourier: {
    description: "Actual Courier Cost. True courier bills reconciled from courier payouts.",
    formula: "Sum of courier charges from payouts data"
  },
  courierDiff: {
    description: "Courier billing discrepancy correction adjustment.",
    formula: "Actual Courier Cost - (Reconciled Count * 200)"
  },
  actualExp: {
    description: "Manual Operational Expenses. Custom overhead costs (rent, salaries, office, etc.) entered manually.",
    formula: "Manually entered daily/monthly expenses"
  },
  pnl: {
    description: "Final Profit & Loss. Net profit estimate after subtracting marketing, hybrid shipping fees, and overheads from Gross Profit.",
    formula: "Gross Profit - Ad Spend - Hybrid Courier Cost - Manual Expenses"
  },
  actualPnl: {
    description: "Actual Cash Profit. Profit based on actual payout cash deposited in bank minus product costs, marketing, shipping, and manual expenses.",
    formula: "(Payouts Received - CGS) - Ad Spend - Hybrid Courier Cost - Manual Expenses"
  },
  delPercent: {
    description: "Delivery Rate. The percentage of dispatched orders that have been successfully delivered.",
    formula: "(Delivered / Dispatched) * 100"
  },
  ndrRecoveryRate: {
    description: "NDR Recovery Rate. The percentage of orders that failed delivery initially (reattempted) but were successfully delivered afterwards by customer success actions.",
    formula: "(Reattempts Delivered / Total Orders with Failed Attempts) * 100"
  },
  roasMeta: {
    description: "Landed ROAS (Traditional ROAS). Gross sales value of all landed orders divided by total marketing spend.",
    formula: "Landed Shopify Sales / Total Ad Spend"
  },
  deliveredRoas: {
    description: "Delivered ROAS (Cash ROAS). Delivered sales value divided by total marketing spend. Evaluates true marketing ROI on cash collected.",
    formula: "Delivered Sale / Total Ad Spend"
  },
  cpaAvg: {
    description: "Average Cost Per Acquisition. Total marketing spend divided by total landed orders.",
    formula: "Total Ad Spend / Landed Orders"
  },
  netCpaAvg: {
    description: "Net Cost Per Acquisition. Total marketing spend divided by active dispatched orders (excluding early cancellations).",
    formula: "Total Ad Spend / (Landed - Cancelled)"
  },
  landedOrders: {
    description: "Total orders created and synced.",
    formula: "COUNT(id) of all orders"
  },
  cancelations: {
    description: "Total cancellations before dispatch.",
    formula: "COUNT(id) WHERE status = 'Cancelled'"
  },
  canPercent: {
    description: "Cancellation Rate. Percentage of landed orders that got cancelled.",
    formula: "(Cancellations / Landed Orders) * 100"
  },
  pending: {
    description: "Pending orders awaiting verification/dispatch.",
    formula: "COUNT(id) WHERE status = 'Pending'"
  },
  booked: {
    description: "Booked orders registered with couriers but not yet picked up.",
    formula: "COUNT(id) WHERE status IN ('Booked', 'Picked Up', 'Unassigned')"
  },
  totalDispatched: {
    description: "Dispatched orders shipped out.",
    formula: "Landed Orders - Cancelled - Pending - Booked"
  },
  delivered: {
    description: "Successfully delivered shipments.",
    formula: "COUNT(id) WHERE status = 'Delivered'"
  },
  restock: {
    description: "Restocked parcels successfully returned to warehouse.",
    formula: "COUNT(id) WHERE status = 'Return Received'"
  },
  missingParcel: {
    description: "Parcels marked returned but not yet physically received back at warehouse.",
    formula: "COUNT(id) WHERE status = 'Returned'"
  },
  intransit: {
    description: "Shipments currently in transit with couriers.",
    formula: "COUNT(id) WHERE status IN ('Shipped', 'Out for Delivery', 'In Transit')"
  },
  cashInTransit: {
    description: "Floating value currently in transit with couriers and not yet paid.",
    formula: "SUM(price) WHERE status IN ('Shipped', 'Out for Delivery', 'In Transit')"
  },
  fakeReturns: {
    description: "Watchdog-detected fake RTO attempts by couriers.",
    formula: "COUNT(watchdog_results) WHERE verdict = 'FAKE RTO'"
  },
  withoutTrackingId: {
    description: "Dispatched orders missing tracking numbers.",
    formula: "COUNT(id) WHERE status != 'Cancelled' AND (tracking_number IS NULL OR tracking_number = '')"
  },
  paymentPaid: {
    description: "Total payouts paid into bank account by couriers.",
    formula: "SUM(paid_amount)"
  },
  diffCorrection: {
    description: "Adjustments synced from custom operations spreadsheet.",
    formula: "Manually synced adjustment values"
  },
  deliveredPaymentPending: {
    description: "Delivered shipments unpaid by couriers.",
    formula: "COUNT(id) WHERE status = 'Delivered' AND (paid_amount IS NULL OR paid_amount < 1)"
  },
  costGaps: {
    description: "Delivered shipments missing product cost registry mapping.",
    formula: "COUNT(id) WHERE status = 'Delivered' AND cost = 0"
  },
  zeroExpenseCount: {
    description: "Dispatched shipments showing zero courier fees.",
    formula: "COUNT(id) WHERE status != 'Cancelled' AND courier_fee = 0"
  },
  unpaidAmount: {
    description: "Total cash amount of delivered shipments pending payout.",
    formula: "SUM(price) WHERE status = 'Delivered' AND (paid_amount IS NULL OR paid_amount < 1)"
  },
  overduePayoutCount: {
    description: "Delivered orders unpaid for more than 10 days since status update date.",
    formula: "COUNT(id) WHERE status = 'Delivered' AND unpaid AND days_since_status > 10"
  }
};

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

  const [activeColumnInfo, setActiveColumnInfo] = useState(null);

  if (loading) {
    return (
      <div style={{ padding: 100, textAlign: 'center', opacity: 0.5, color: 'var(--text-muted)' }}>
        ⏳ Crunching numbers...
      </div>
    );
  }

  const dataset = view === 'daily' ? filteredDaily : monthlyData;

  return (
    <>
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
            {visibleCols.map(col => {
              const info = COLUMN_INFO[col.id];
              return (
                <th 
                  key={col.id} 
                  className={col.id === 'date' ? 'sticky-col' : ''} 
                  onClick={() => requestSort(col.id)}
                  style={{
                    minWidth: getColMinWidth(col),
                  }}
                  title={info ? `${info.description}\nFormula: ${info.formula}` : undefined}
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
                    {info && (
                      <span 
                        style={{
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '14px',
                          height: '14px',
                          borderRadius: '50%',
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border)',
                          fontSize: '9px',
                          color: 'var(--text-secondary)',
                          marginLeft: '2px',
                          fontWeight: 'bold',
                          flexShrink: 0
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveColumnInfo({ label: col.label, ...info });
                        }}
                      >
                        i
                      </span>
                    )}
                    {sortConfig.key === col.id && (
                      <span style={{ flexShrink: 0, marginLeft: 2 }}>
                        {sortConfig.direction === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {dataset.map(row => (
            <tr key={row.date || row.month}>
              {visibleCols.map(col => {
                let content = row[col.id];
                let style = {};
                if (col.id === 'date') return <td key={col.id} className="sticky-col">{row.date || row.month}</td>;
                if (['aov', 'deliveredSale', 'cgs', 'taxPaid', 'grossProfit', 'estCourier', 'actualCourier', 'courierDiff', 'actualExp', 'pnl', 'actualPnl', 'paymentPaid', 'marketingSpend', 'tiktokMarketing', 'cpaAvg', 'netCpaAvg', 'unpaidAmount', 'diffCorrection', 'cashInTransit'].includes(col.id)) content = formatCurrency(row[col.id]);
                if (['cgsPercent', 'marPercent', 'delPercent', 'canPercent', 'ndrRecoveryRate'].includes(col.id)) content = formatPercent(row[col.id]);
                if (['roasMeta', 'deliveredRoas'].includes(col.id)) content = formatNumber(row[col.id]);
                if (view === 'daily' && ['marketingSpend', 'tiktokMarketing', 'actualExp', 'diffCorrection'].includes(col.id)) content = renderEditable(row, col.id);
                
                if (col.id === 'pnl') style = { color: row.pnl >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 800 };
                if (col.id === 'actualPnl') style = { color: row.actualPnl >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 800 };
                const isClickable = ['landedOrders', 'cancelations', 'pending', 'booked', 'totalDispatched', 'delivered', 'restock', 'missingParcel', 'intransit', 'cashInTransit', 'fakeReturns', 'withoutTrackingId', 'deliveredPaymentPending', 'costGaps', 'overduePayoutCount', 'zeroExpenseCount'].includes(col.id);

                return (
                  <td 
                    key={col.id} 
                    style={{ 
                      ...style, 
                      cursor: isClickable ? 'pointer' : 'default',
                      color: ((col.id === 'costGaps' && row.costGaps > 0) || (col.id === 'overduePayoutCount' && row.overduePayoutCount > 0) || (col.id === 'zeroExpenseCount' && row.zeroExpenseCount > 0)) ? 'var(--red)' : style.color,
                      fontWeight: ((col.id === 'costGaps' && row.costGaps > 0) || (col.id === 'overduePayoutCount' && row.overduePayoutCount > 0) || (col.id === 'zeroExpenseCount' && row.zeroExpenseCount > 0)) ? 'bold' : style.fontWeight
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

    {activeColumnInfo && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
        <div className="stat-card" style={{ width: 450, padding: '24px', border: '1px solid var(--border)', background: 'var(--bg-surface)', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
          <h3 style={{ color: 'var(--brand)', marginTop: 0, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.2rem', fontWeight: 800 }}>
            <span>ℹ️ {activeColumnInfo.label}</span>
          </h3>
          <div style={{ margin: '16px 0', fontSize: '0.9rem', lineHeight: 1.6, color: 'var(--text-primary)' }}>
            <p style={{ margin: '0 0 16px 0' }}>{activeColumnInfo.description}</p>
            <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--brand)', wordBreak: 'break-all' }}>
              <strong style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Formula / Logic</strong>
              {activeColumnInfo.formula}
            </div>
          </div>
          <button className="btn btn-primary" style={{ width: '100%', marginTop: '8px', padding: '10px' }} onClick={() => setActiveColumnInfo(null)}>Dismiss</button>
        </div>
      </div>
    )}
  </>
  );
}
