import React, { useState } from 'react';
import { formatCurrency, formatPercent, formatNumber, getColMinWidth } from '../../hooks/useReportsData';

const COLUMN_INFO = {
  date: {
    description: "The reporting period group (daily dates or monthly segments).",
    formula: "COALESCE(order_date, status_date)",
    example: "Each row = one day (or one month in monthly view). It groups all your orders by when they were placed."
  },
  aov: {
    description: "Average Order Value. The average sale price collected per successfully delivered shipment.",
    formula: "Delivered Sale / Delivered Count",
    example: "If you delivered 100 orders worth Rs 300,000 total → AOV = Rs 3,000. Higher AOV means each customer spends more per order."
  },
  deliveredSale: {
    description: "Gross revenue collected from all successfully delivered shipments. This represents actual cash sales.",
    formula: "SUM(price) WHERE status = 'Delivered'",
    example: "Only counts orders that physically reached the customer. Returns, cancellations, and in-transit orders are NOT included. This is your real earned revenue."
  },
  cgs: {
    description: "Cost of Goods Sold. Represents the total product purchasing cost plus packaging material costs of all delivered and returned orders.",
    formula: "Pure CGS + Sunk Packaging",
    example: "If a shirt costs Rs 500 to buy from supplier and Rs 50 for packaging → CGS per order = Rs 550. This is your direct cost of the product itself."
  },
  cgsPercent: {
    description: "CGS Percentage. Shows what portion of the delivered revenue is spent on product costs.",
    formula: "(CGS / Delivered Sale) * 100",
    example: "If CGS = Rs 1,00,000 and Delivered Sale = Rs 3,00,000 → CGS% = 33%. Ideally keep this below 40% for healthy margins."
  },
  taxPaid: {
    description: "Sales Tax. Estimated tax liability calculated as 4% of delivered sale revenue.",
    formula: "Delivered Sale * 0.04",
    example: "This is an automated estimate only. If Delivered Sale = Rs 5,00,000 → Tax estimate = Rs 20,000. Consult your accountant for exact tax obligations."
  },
  grossProfit: {
    description: "Gross Profit. Earnings remaining after deducting product costs (CGS) and packaging waste.",
    formula: "Delivered Sale - CGS",
    example: "Delivered Rs 3,00,000 in sales, product cost was Rs 1,00,000 → Gross Profit = Rs 2,00,000. This is before marketing and overhead costs."
  },
  marPercent: {
    description: "Marketing Cost Ratio. The percentage of delivered sales revenue spent on Meta/TikTok advertising.",
    formula: "(Total Ad Spend / Delivered Sale) * 100",
    example: "Spent Rs 30,000 on ads, made Rs 3,00,000 in delivered sales → Marketing% = 10%. Lower is better. Target below 15%."
  },
  marketingSpend: {
    description: "Meta Ads Spend. Total marketing expenditure spent on Facebook and Instagram ads.",
    formula: "Synced via Meta API or manually entered",
    example: "The total rupees spent on Meta (Facebook/Instagram) campaigns that day. You can manually edit this field directly in the table."
  },
  tiktokMarketing: {
    description: "TikTok Ads Spend. Total marketing expenditure spent on TikTok ads.",
    formula: "Synced via TikTok API or manually entered",
    example: "The total rupees spent on TikTok campaigns that day. You can manually edit this field directly in the table."
  },
  estCourier: {
    description: "Estimated Courier Cost. Flat estimate calculated at Rs 200 per dispatched parcel.",
    formula: "Dispatched Orders * 200",
    example: "If 500 orders dispatched → Estimated Courier = Rs 1,00,000. This is a rough benchmark. Compare with Actual Courier to see if couriers are overbilling."
  },
  actualCourier: {
    description: "Actual Courier Cost. True courier bills reconciled from courier payouts.",
    formula: "Sum of courier charges from payouts data",
    example: "What couriers actually charged you (from their payout sheets). Compare with Estimated Courier to spot discrepancies or overcharging."
  },
  courierDiff: {
    description: "Courier billing discrepancy correction adjustment.",
    formula: "Actual Courier Cost - (Reconciled Count * 200)",
    example: "If actual courier bills are Rs 5,000 more than estimate → Diff = +Rs 5,000 (you're being overbilled). Negative means you paid less than expected."
  },
  actualExp: {
    description: "Manual Operational Expenses. Custom overhead costs (rent, salaries, office, etc.) entered manually.",
    formula: "Manually entered daily/monthly expenses",
    example: "Monthly rent Rs 50,000, salaries Rs 2,00,000 → Total manual expense = Rs 2,50,000. Enter these to get an accurate final PNL."
  },
  pnl: {
    description: "Final Profit & Loss. Net profit estimate after subtracting marketing, hybrid shipping fees, and overheads from Gross Profit.",
    formula: "Gross Profit - Ad Spend - Hybrid Courier Cost - Manual Expenses",
    example: "Gross Profit Rs 2,00,000 − Ads Rs 30,000 − Courier Rs 50,000 − Rent Rs 20,000 = PNL Rs 1,00,000. This is your estimated monthly take-home profit."
  },
  actualPnl: {
    description: "Actual Cash Profit. Profit based on actual payout cash deposited in bank minus product costs, marketing, shipping, and manual expenses.",
    formula: "(Payouts Received - CGS) - Ad Spend - Hybrid Courier Cost - Manual Expenses",
    example: "Unlike Final PNL (which uses delivered sale), this uses bank deposits only. More conservative and accurate for cash-flow decisions."
  },
  delPercent: {
    description: "Delivery Rate. The percentage of dispatched orders that have been successfully delivered.",
    formula: "(Delivered / Dispatched) * 100",
    example: "Dispatched 1,000 orders, 750 delivered → Del% = 75%. For COD e-commerce in Pakistan, 70–80% is typical. Below 65% is a red flag."
  },
  ndrRecoveryRate: {
    description: "NDR Recovery Rate. The percentage of orders that failed delivery initially (reattempted) but were successfully delivered afterwards by customer success actions.",
    formula: "(Reattempts Delivered / Total Orders with Failed Attempts) * 100",
    example: "100 orders got 'Attempted/Not Available', your support team called and 60 were eventually delivered → NDR Recovery = 60%. Higher = better support team performance."
  },
  roasMeta: {
    description: "Landed ROAS (Traditional ROAS). Gross sales value of all landed orders divided by total marketing spend. Includes all orders regardless of delivery outcome.",
    formula: "Landed Shopify Sales / Total Ad Spend",
    example: "Spent Rs 50,000 on ads, total orders worth Rs 2,00,000 placed → Landed ROAS = 4x. Caution: this counts returns/cancellations too. Use Delivered ROAS for real ROI."
  },
  deliveredRoas: {
    description: "Delivered ROAS (Cash ROAS). Only counts revenue from physically delivered orders. This is your true marketing ROI.",
    formula: "Delivered Sale / Total Ad Spend",
    example: "Spent Rs 50,000 on ads, delivered Rs 1,50,000 in actual cash → Delivered ROAS = 3x. This is the real number — what you actually earned per ad rupee spent."
  },
  cpaAvg: {
    description: "Average Cost Per Acquisition. Total marketing spend divided by total landed orders.",
    formula: "Total Ad Spend / Landed Orders",
    example: "Spent Rs 50,000 on ads, got 200 orders → CPA = Rs 250 per order. This includes cancelled orders. Lower CPA = more efficient campaigns."
  },
  netCpaAvg: {
    description: "Net Cost Per Acquisition. Marketing spend divided by orders minus cancellations. More accurate than CPA.",
    formula: "Total Ad Spend / (Landed - Cancelled)",
    example: "Spent Rs 50,000, got 200 orders, 50 cancelled → Net CPA = Rs 50,000 / 150 = Rs 333. This is the true cost to acquire a real dispatched customer."
  },
  landedOrders: {
    description: "Total orders created and synced.",
    formula: "COUNT(id) of all orders",
    example: "All orders that came in that day, regardless of status. 300 Landed = 300 people placed an order. Includes all pending, cancelled, shipped, delivered."
  },
  cancelations: {
    description: "Total cancellations before dispatch.",
    formula: "COUNT(id) WHERE status = 'Cancelled'",
    example: "50 out of 300 orders got cancelled → 50 cancellations. These orders never shipped. High cancellations waste marketing budget and hurt CPA."
  },
  canPercent: {
    description: "Cancellation Rate. Percentage of landed orders that got cancelled.",
    formula: "(Cancellations / Landed Orders) * 100",
    example: "50 cancelled out of 300 landed → Cancel% = 16.7%. In Pakistan COD, 15–25% is common. Above 30% means serious product/ad targeting issues."
  },
  pending: {
    description: "Pending orders awaiting verification/dispatch.",
    formula: "COUNT(id) WHERE status = 'Pending'",
    example: "Orders that arrived today but haven't been confirmed or dispatched yet. High pending count could mean your operations team is slow or there are confirmation hold-ups."
  },
  booked: {
    description: "Booked orders registered with couriers but not yet picked up.",
    formula: "COUNT(id) WHERE status IN ('Booked', 'Picked Up', 'Unassigned')",
    example: "Orders that are ready and handed to courier but still awaiting movement. If this stays high for days, couriers may have a pickup delay issue."
  },
  totalDispatched: {
    description: "Dispatched orders shipped out.",
    formula: "Landed Orders - Cancelled - Pending - Booked",
    example: "300 Landed − 50 Cancelled − 20 Pending − 30 Booked = 200 Dispatched. These are orders actively moving through the courier network."
  },
  delivered: {
    description: "Successfully delivered shipments.",
    formula: "COUNT(id) WHERE status = 'Delivered'",
    example: "Orders confirmed delivered to the customer's door. This is your real revenue-generating count. Cash for these orders should be received from couriers."
  },
  restock: {
    description: "Restocked parcels successfully returned to warehouse.",
    formula: "COUNT(id) WHERE status = 'Return Received'",
    example: "Returned parcels that physically arrived back at your warehouse and were restocked. You can resell these items. Track this to measure inventory recovery."
  },
  missingParcel: {
    description: "Parcels marked returned by courier but not yet physically received back at warehouse.",
    formula: "COUNT(id) WHERE status = 'Returned'",
    example: "Courier says 'Return' but you haven't received the parcel yet. If this number stays high for weeks, couriers may have lost your stock. Chase them immediately."
  },
  intransit: {
    description: "Shipments currently in transit with couriers.",
    formula: "COUNT(id) WHERE status IN ('Shipped', 'Out for Delivery', 'In Transit')",
    example: "Orders that left your warehouse and are on their way to customers. Normal for recent orders, but old orders (7+ days) stuck here indicate delivery issues."
  },
  cashInTransit: {
    description: "Floating cash value of orders currently in transit — money not yet collected.",
    formula: "SUM(price) WHERE status IN ('Shipped', 'Out for Delivery', 'In Transit')",
    example: "500 in-transit orders × avg Rs 2,500 = Rs 12.5 lakh floating. This cash is 'locked' with couriers until delivered. Monitor to understand your cash flow gaps."
  },
  fakeReturns: {
    description: "Watchdog-detected fake RTO attempts by couriers.",
    formula: "COUNT(watchdog_results) WHERE verdict = 'FAKE RTO'",
    example: "Courier marks an order 'Returned' but delivery was never attempted. Watchdog catches these. Each fake return = lost sale + courier fee paid for nothing. Dispute these."
  },
  withoutTrackingId: {
    description: "Dispatched orders missing tracking numbers.",
    formula: "COUNT(id) WHERE status != 'Cancelled' AND (tracking_number IS NULL OR tracking_number = '')",
    example: "Orders that were dispatched but no courier tracking ID was attached. Without this, you can't track delivery progress. Fix these immediately in courier booking."
  },
  paymentPaid: {
    description: "Total payouts paid into bank account by couriers.",
    formula: "SUM(paid_amount)",
    example: "Total COD cash deposited by PostEx, Leopards, etc. into your bank account. This is your real incoming cash. Use this for Actual PNL calculations."
  },
  diffCorrection: {
    description: "Adjustments synced from custom operations spreadsheet.",
    formula: "Manually synced adjustment values",
    example: "Any manual corrections, reconciliation differences, or one-off adjustments you want reflected in the PNL. Useful for end-of-month true-up entries."
  },
  deliveredPaymentPending: {
    description: "Delivered shipments unpaid by couriers.",
    formula: "COUNT(id) WHERE status = 'Delivered' AND (paid_amount IS NULL OR paid_amount < 1)",
    example: "Orders marked delivered but courier hasn't paid you yet. This is money owed to you. If this number is high and old, chase your courier for overdue COD remittances."
  },
  costGaps: {
    description: "Delivered shipments missing product cost registry mapping.",
    formula: "COUNT(id) WHERE status = 'Delivered' AND cost = 0",
    example: "Delivered orders where product cost = Rs 0 in the system. This means PNL for these orders is overstated. Go to Cost Manager and fill in the missing costs."
  },
  zeroExpenseCount: {
    description: "Dispatched shipments showing zero courier fees.",
    formula: "COUNT(id) WHERE status != 'Cancelled' AND courier_fee = 0",
    example: "Orders that shipped but show Rs 0 courier charges. Usually means payout reconciliation is incomplete. High count = your courier expense figures are understated."
  },
  unpaidAmount: {
    description: "Total cash amount of delivered shipments pending payout.",
    formula: "SUM(price) WHERE status = 'Delivered' AND (paid_amount IS NULL OR paid_amount < 1)",
    example: "If 200 delivered orders are unpaid at avg Rs 2,500 = Rs 5 lakh owed to you. This is money sitting with the courier. High value = chase your courier payout immediately."
  },
  overduePayoutCount: {
    description: "Delivered orders unpaid for more than 10 days since status update date.",
    formula: "COUNT(id) WHERE status = 'Delivered' AND unpaid AND days_since_status > 10",
    example: "Couriers typically pay within 7–10 days of delivery. Any delivered order still unpaid after 10 days is overdue. Contact courier account manager with this list."
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
            <p style={{ margin: '0 0 12px 0' }}>{activeColumnInfo.description}</p>
            {activeColumnInfo.example && (
              <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', marginBottom: '12px' }}>
                <strong style={{ display: 'block', fontSize: '0.72rem', color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>💡 Simple Explanation</strong>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.6 }}>{activeColumnInfo.example}</span>
              </div>
            )}
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
