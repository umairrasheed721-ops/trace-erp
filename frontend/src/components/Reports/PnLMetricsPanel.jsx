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
    description: "Active/dispatched orders missing product cost registry mapping.",
    formula: "COUNT(id) WHERE status NOT IN ('Cancelled', 'Returned', 'Return Received', 'RTO') AND cost = 0",
    example: "Orders where product cost = Rs 0 in the system. This means PNL/margin cannot be calculated accurately. Go to Cost Manager to fix these missing costs."
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

// ─── Group Styles ────────────────────────────────────────────────────────────
const GROUP_STYLES = {
  income:  { bg: 'rgba(161,98,7,0.10)',   border: 'rgba(161,98,7,0.3)',    accent: '#f59e0b', badge: 'linear-gradient(135deg,#92400e,#b45309)',  label: '💸 INCOME'   },
  expense: { bg: 'rgba(109,40,217,0.10)', border: 'rgba(109,40,217,0.28)', accent: '#a855f7', badge: 'linear-gradient(135deg,#5b21b6,#7c3aed)',  label: '📉 EXPENSES' },
  profit:  { bg: 'rgba(6,95,70,0.12)',    border: 'rgba(6,95,70,0.32)',    accent: '#10b981', badge: 'linear-gradient(135deg,#065f46,#047857)',  label: '💰 PROFIT'   },
  kpi:     { bg: 'rgba(30,41,59,0.5)',    border: 'rgba(71,85,105,0.25)',  accent: '#94a3b8', badge: 'linear-gradient(135deg,#1e293b,#334155)',  label: '🛡️ KPIs'     },
};

const CLICKABLE_IDS = new Set(['landedOrders','cancelations','pending','booked','totalDispatched','delivered','restock','missingParcel','intransit','cashInTransit','fakeReturns','withoutTrackingId','deliveredPaymentPending','costGaps','overduePayoutCount','zeroExpenseCount']);
const CURRENCY_IDS = new Set(['aov','deliveredSale','cgs','taxPaid','grossProfit','estCourier','actualCourier','courierDiff','actualExp','pnl','actualPnl','paymentPaid','marketingSpend','tiktokMarketing','cpaAvg','netCpaAvg','unpaidAmount','diffCorrection','cashInTransit']);
const PERCENT_IDS  = new Set(['cgsPercent','marPercent','delPercent','canPercent','ndrRecoveryRate']);
const NUMBER_IDS   = new Set(['roasMeta','deliveredRoas']);
const EDITABLE_IDS = new Set(['marketingSpend','tiktokMarketing','actualExp','diffCorrection']);

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
  columns,
  tableLayout
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

  // ─── Vertical Layout ────────────────────────────────────────────────────────
  if (tableLayout === 'vertical' && dataset.length > 0) {
    const metricCols = visibleCols.filter(c => c.id !== 'date');
    const periods = dataset.map(r => r.date || r.month);

    const getCellContent = (col, row) => {
      if (view === 'daily' && EDITABLE_IDS.has(col.id)) return renderEditable(row, col.id);
      let content = row[col.id];
      if (CURRENCY_IDS.has(col.id)) content = formatCurrency(row[col.id]);
      if (PERCENT_IDS.has(col.id))  content = formatPercent(row[col.id]);
      if (NUMBER_IDS.has(col.id))   content = formatNumber(row[col.id]);
      return content;
    };

    // Inject separator rows before each new group
    const rowsWithSeparators = [];
    let lastGroup = null;
    for (const col of metricCols) {
      if (col.group !== lastGroup) {
        rowsWithSeparators.push({ type: 'separator', group: col.group });
        lastGroup = col.group;
      }
      rowsWithSeparators.push({ type: 'metric', col });
    }

    const InfoModal = () => activeColumnInfo && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)' }}>
        <div style={{ width: 460, padding: '28px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 12px 40px rgba(0,0,0,0.6)' }}>
          <h3 style={{ color: 'var(--brand)', margin: '0 0 14px', fontSize: '1.15rem', fontWeight: 800 }}>ℹ️ {activeColumnInfo.label}</h3>
          <p style={{ fontSize: '0.88rem', lineHeight: 1.7, margin: '0 0 14px', color: 'var(--text-primary)' }}>{activeColumnInfo.description}</p>
          {activeColumnInfo.example && (
            <div style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', marginBottom: 12 }}>
              <strong style={{ display: 'block', fontSize: '0.7rem', color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>💡 Simple Explanation</strong>
              <span style={{ fontSize: '0.84rem', lineHeight: 1.65 }}>{activeColumnInfo.example}</span>
            </div>
          )}
          <div style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)', fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--brand)', wordBreak: 'break-all', marginBottom: 16 }}>
            <strong style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Formula / Logic</strong>
            {activeColumnInfo.formula}
          </div>
          <button className="btn btn-primary" style={{ width: '100%', padding: 10 }} onClick={() => setActiveColumnInfo(null)}>Dismiss</button>
        </div>
      </div>
    );

    return (
      <>
        <style>{`
          .vt-wrap { border-radius: 12px; overflow: hidden; border: 1px solid var(--border); background: var(--bg-surface); }
          .vt-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13px; }

          /* Header */
          .vt-corner { position: sticky; left: 0; z-index: 21; background: var(--bg-elevated); padding: 11px 18px;
            font-size: 0.68rem; font-weight: 700; letter-spacing: 0.08em; color: var(--text-muted);
            text-transform: uppercase; border-bottom: 2px solid var(--border); border-right: 2px solid var(--border); white-space: nowrap; }
          .vt-period { padding: 11px 18px; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.05em;
            text-align: right; text-transform: uppercase; background: var(--bg-elevated);
            color: var(--text-secondary); border-bottom: 2px solid var(--border); white-space: nowrap; }

          /* Separator rows */
          .vt-sep td { padding: 0 !important; border: none !important; height: 36px; }
          .vt-sep-inner { display: flex; align-items: center; gap: 10px; padding: 8px 16px 4px; }
          .vt-badge { display: inline-flex; align-items: center; gap: 6px; padding: 3px 13px 3px 10px;
            border-radius: 20px; font-size: 0.68rem; font-weight: 800; letter-spacing: 0.07em;
            color: #fff; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
          .vt-sep-line { flex: 1; height: 1px; opacity: 0.5; }

          /* Metric rows */
          .vt-row td { border-bottom: 1px solid rgba(255,255,255,0.035); transition: background 0.1s; }
          .vt-row:hover td { background: rgba(255,255,255,0.035) !important; }

          /* Label sticky cell */
          .vt-label-cell { position: sticky; left: 0; z-index: 18; background: var(--bg-surface);
            border-right: 2px solid var(--border); padding: 0; min-width: 230px; max-width: 280px; }
          .vt-label-inner { display: flex; align-items: center; gap: 7px; padding: 10px 16px;
            font-weight: 600; font-size: 0.8rem; color: var(--text-primary); white-space: nowrap; }
          .vt-info-btn { opacity: 0; transition: opacity 0.15s; cursor: pointer; display: inline-flex;
            align-items: center; justify-content: center; flex-shrink: 0;
            width: 16px; height: 16px; border-radius: 50%; background: var(--bg-elevated);
            border: 1px solid var(--border); font-size: 9px; color: var(--text-secondary); font-weight: bold; }
          .vt-row:hover .vt-info-btn { opacity: 1; }

          /* Data cells */
          .vt-cell { padding: 10px 18px !important; text-align: right !important;
            font-size: 0.82rem; font-weight: 500; white-space: nowrap; }
          .vt-cell.clickable { cursor: pointer; }
          .vt-cell.clickable:hover { background: rgba(255,255,255,0.05) !important; }

          /* PNL highlight rows */
          .vt-pnl-row .vt-label-cell { background: var(--bg-elevated) !important; }
          .vt-pnl-row .vt-label-inner { font-size: 0.85rem; font-weight: 800; }
          .vt-pnl-row .vt-cell { font-size: 0.88rem !important; font-weight: 800 !important; }
        `}</style>

        <div ref={tableContainerRef} className="vt-wrap stat-card" style={{ padding: 0, overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 200px)' }}>
          <table className="vt-table">
            <thead>
              <tr>
                <th className="vt-corner">METRIC</th>
                {periods.map(p => (
                  <th key={p} className="vt-period">{p}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowsWithSeparators.map((item, idx) => {
                if (item.type === 'separator') {
                  const gs = GROUP_STYLES[item.group] || GROUP_STYLES.kpi;
                  return (
                    <tr key={`sep-${item.group}`} className="vt-sep">
                      <td colSpan={periods.length + 1}>
                        <div className="vt-sep-inner">
                          <span className="vt-badge" style={{ background: gs.badge }}>{gs.label}</span>
                          <span className="vt-sep-line" style={{ background: gs.border }} />
                        </div>
                      </td>
                    </tr>
                  );
                }

                const { col } = item;
                const info = COLUMN_INFO[col.id];
                const gs = GROUP_STYLES[col.group] || GROUP_STYLES.kpi;
                const isPnl = col.id === 'pnl' || col.id === 'actualPnl';

                return (
                  <tr key={col.id} className={`vt-row${isPnl ? ' vt-pnl-row' : ''}`}>
                    {/* Sticky label */}
                    <td className="vt-label-cell" style={{ background: isPnl ? 'var(--bg-elevated)' : undefined }}>
                      <div className="vt-label-inner">
                        <span style={{ flex: 1, color: isPnl ? gs.accent : undefined }}>{col.label}</span>
                        {info && (
                          <span className="vt-info-btn" onClick={() => setActiveColumnInfo({ label: col.label, ...info })}>i</span>
                        )}
                      </div>
                    </td>

                    {/* Data cells */}
                    {dataset.map(row => {
                      const content = getCellContent(col, row);
                      const clickable = CLICKABLE_IDS.has(col.id);
                      const isAlert = (
                        (col.id === 'costGaps'          && row.costGaps > 0) ||
                        (col.id === 'overduePayoutCount' && row.overduePayoutCount > 0) ||
                        (col.id === 'zeroExpenseCount'  && row.zeroExpenseCount > 0)
                      );
                      const pnlColor = isPnl ? (row[col.id] >= 0 ? '#10b981' : '#ef4444') : undefined;

                      return (
                        <td
                          key={row.date || row.month}
                          className={`vt-cell${clickable ? ' clickable' : ''}`}
                          style={{
                            color:      pnlColor || (isAlert ? '#ef4444' : undefined),
                            fontWeight: isPnl ? 800 : isAlert ? 700 : undefined,
                            borderLeft: `2px solid ${gs.border}`,
                          }}
                          onClick={() => clickable && handleDrilldown(row, col.id)}
                        >
                          {clickable
                            ? <span style={{ borderBottom: '1px dashed var(--text-muted)' }}>{content}</span>
                            : content
                          }
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <InfoModal />
      </>
    );
  }
  // ─── End Vertical Layout ─────────────────────────────────────────────────────

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
                  style={{ minWidth: getColMinWidth(col) }}
                  title={info ? `${info.description}\nFormula: ${info.formula}` : undefined}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: col.id === 'date' ? 'flex-start' : 'flex-end', gap: 4, width: '100%' }}>
                    <span style={{ flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: col.id === 'date' ? 'left' : 'right' }}>
                      {col.label}
                    </span>
                    {info && (
                      <span
                        style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '14px', height: '14px', borderRadius: '50%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', fontSize: '9px', color: 'var(--text-secondary)', marginLeft: '2px', fontWeight: 'bold', flexShrink: 0 }}
                        onClick={(e) => { e.stopPropagation(); setActiveColumnInfo({ label: col.label, ...info }); }}
                      >i</span>
                    )}
                    {sortConfig.key === col.id && (
                      <span style={{ flexShrink: 0, marginLeft: 2 }}>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
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
                if (CURRENCY_IDS.has(col.id)) content = formatCurrency(row[col.id]);
                if (PERCENT_IDS.has(col.id))  content = formatPercent(row[col.id]);
                if (NUMBER_IDS.has(col.id))   content = formatNumber(row[col.id]);
                if (view === 'daily' && EDITABLE_IDS.has(col.id)) content = renderEditable(row, col.id);

                if (col.id === 'pnl')      style = { color: row.pnl >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 800 };
                if (col.id === 'actualPnl') style = { color: row.actualPnl >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 800 };
                const isClickable = CLICKABLE_IDS.has(col.id);
                const isAlert = (
                  (col.id === 'costGaps'          && row.costGaps > 0) ||
                  (col.id === 'overduePayoutCount' && row.overduePayoutCount > 0) ||
                  (col.id === 'zeroExpenseCount'  && row.zeroExpenseCount > 0)
                );

                return (
                  <td
                    key={col.id}
                    style={{
                      ...style,
                      cursor: isClickable ? 'pointer' : 'default',
                      color: isAlert ? 'var(--red)' : style.color,
                      fontWeight: isAlert ? 'bold' : style.fontWeight
                    }}
                    onClick={() => isClickable && handleDrilldown(row, col.id)}
                  >
                    {isClickable ? <span style={{ borderBottom: '1px dashed var(--text-muted)' }}>{content}</span> : content}
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
