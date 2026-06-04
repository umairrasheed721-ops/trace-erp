import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp, useToast } from '../context/AppContext';
import { useRoutePersistence } from '../context/RoutePersistenceContext';
import useReportsData from '../hooks/useReportsData';
import ReportsFilterBar from '../components/Reports/ReportsFilterBar';
import PnLMetricsPanel from '../components/Reports/PnLMetricsPanel';
import ReportsChartSection from '../components/Reports/ReportsChartSection';

export default function Reports() {
  const { activeStoreId } = useApp();
  const navigate = useNavigate();
  const toast = useToast();
  
  const reportsData = useReportsData(activeStoreId, toast);
  const { view, datePreset, customStart, customEnd, showCustom, setView, setDatePreset, setCustomStart, setCustomEnd, setShowCustom, hiddenColumns } = reportsData;

  // ─── Route Persistence ───────────────────────────────────────────
  const { registerModule, unregisterModule, persistModuleState, getModuleState } = useRoutePersistence();
  const tableContainerRef = useRef(null);
  const pendingScrollRestoreRef = useRef(null);

  const saveState = useCallback(() => {
    const scrollTop = tableContainerRef.current ? tableContainerRef.current.scrollTop : 0;
    const scrollLeft = tableContainerRef.current ? tableContainerRef.current.scrollLeft : 0;
    persistModuleState('Reports', {
      view,
      datePreset,
      customStart,
      customEnd,
      showCustom,
      scrollTop,
      scrollLeft
    });
  }, [persistModuleState, view, datePreset, customStart, customEnd, showCustom]);

  const restoreState = useCallback(() => {
    const state = getModuleState('Reports');
    if (state) {
      if (state.view !== undefined) setView(state.view);
      if (state.datePreset !== undefined) setDatePreset(state.datePreset);
      if (state.customStart !== undefined) setCustomStart(state.customStart);
      if (state.customEnd !== undefined) setCustomEnd(state.customEnd);
      if (state.showCustom !== undefined) setShowCustom(state.showCustom);

      pendingScrollRestoreRef.current = {
        scrollTop: state.scrollTop || 0,
        scrollLeft: state.scrollLeft || 0
      };
    }
  }, [getModuleState, setView, setDatePreset, setCustomStart, setCustomEnd, setShowCustom]);

  // Register callbacks on mount/state updates
  useEffect(() => {
    registerModule('Reports', { saveState, restoreState });
    return () => unregisterModule('Reports');
  }, [registerModule, unregisterModule, saveState, restoreState]);

  // Hydrate state from cache exactly once on initial mount
  useEffect(() => {
    restoreState();
  }, []);

  // Restore scroll positions once data loading is complete and component is rendered
  useEffect(() => {
    if (!reportsData.loading && pendingScrollRestoreRef.current) {
      const { scrollTop, scrollLeft } = pendingScrollRestoreRef.current;
      const timer = setTimeout(() => {
        if (tableContainerRef.current) {
          tableContainerRef.current.scrollTop = scrollTop;
          tableContainerRef.current.scrollLeft = scrollLeft;
        }
      }, 50);
      pendingScrollRestoreRef.current = null;
      return () => clearTimeout(timer);
    }
  }, [reportsData.loading]);
  
  const handleDrilldown = (row, colId) => {
    const isMonthly = !!row.month;
    const dateStr = isMonthly ? row.month : row.date;
    
    let filters = {
      preset: 'Custom Range',
      customStart: isMonthly ? `${dateStr}-01` : dateStr,
      customEnd: isMonthly ? new Date(parseInt(dateStr.split('-')[0]), parseInt(dateStr.split('-')[1]), 0).toLocaleDateString('en-CA') : dateStr, 
      status: 'All Statuses'
    };

    if (colId === 'landedOrders') filters.status = 'All Statuses';
    else if (colId === 'cancelations') filters.status = 'Cancelled';
    else if (colId === 'pending') filters.status = 'Pending';
    else if (colId === 'booked') filters.status = 'Booked,Picked Up,Unassigned';
    else if (colId === 'totalDispatched') filters.status = 'In Transit,Out for Delivery,Shipped';
    else if (colId === 'delivered') filters.status = 'Delivered';
    else if (colId === 'restock') filters.status = 'Return Received';
    else if (colId === 'missingParcel') filters.status = 'Returned';
    else if (colId === 'intransit') filters.status = 'In Transit';
    else if (colId === 'fakeReturns') filters.status = '[WATCHDOG FRAUD]';
    else if (colId === 'withoutTrackingId') filters.status = '[NO TRACKING]';
    else if (colId === 'deliveredPaymentPending') filters.status = '[UNPAID DELIVERED]';
    else if (colId === 'costGaps') filters.status = '[MISSING COST]';
    else if (colId === 'overduePayoutCount') filters.status = 'OVERDUE PAYOUT';

    navigate('/search', { state: filters });
  };

  const columns = [
    { id: 'date', label: view === 'daily' ? 'Dates' : 'Month', group: 'key' },
    { id: 'aov', label: 'AOV', group: 'income' },
    { id: 'deliveredSale', label: 'Delivered Sale', group: 'income' },
    { id: 'cgs', label: 'CGS', group: 'income' },
    { id: 'cgsPercent', label: 'CGS %', group: 'income' },
    { id: 'taxPaid', label: 'TAX Paid', group: 'income' },
    { id: 'grossProfit', label: 'Gross Profit', group: 'income' },
    { id: 'marPercent', label: 'Mar %', group: 'expense' },
    { id: 'marketingSpend', label: 'Meta Ads', group: 'expense' },
    { id: 'tiktokMarketing', label: 'Tiktok', group: 'expense' },
    { id: 'estCourier', label: 'Est. Courier', group: 'expense' },
    { id: 'actualCourier', label: 'Actual Courier', group: 'expense' },
    { id: 'courierDiff', label: 'Diff Correction', group: 'expense' },
    { id: 'actualExp', label: 'Manual Exp', group: 'expense' },
    { id: 'pnl', label: 'FINAL PNL', group: 'profit' },
    { id: 'delPercent', label: 'Del%', group: 'kpi' },
    { id: 'roasMeta', label: 'ROAS', group: 'kpi' },
    { id: 'cpaAvg', label: 'CPA AVG', group: 'kpi' },
    { id: 'netCpaAvg', label: 'Net CPA', group: 'kpi' },
    { id: 'landedOrders', label: 'Landed', group: 'kpi' },
    { id: 'cancelations', label: 'Cancel', group: 'kpi' },
    { id: 'canPercent', label: 'Can %', group: 'kpi' },
    { id: 'pending', label: 'Pending', group: 'kpi' },
    { id: 'booked', label: 'Booked', group: 'kpi' },
    { id: 'totalDispatched', label: 'Dispatched', group: 'kpi' },
    { id: 'delivered', label: 'Delivered', group: 'kpi' },
    { id: 'restock', label: 'Restock', group: 'kpi' },
    { id: 'missingParcel', label: 'Missing Parcel', group: 'kpi' },
    { id: 'intransit', label: 'Transit', group: 'kpi' },
    { id: 'fakeReturns', label: 'Fake Attempt', group: 'kpi' },
    { id: 'withoutTrackingId', label: 'No Tracking', group: 'kpi' },
    { id: 'paymentPaid', label: 'Payouts', group: 'kpi' },
    { id: 'diffCorrection', label: 'Correction', group: 'kpi' },
    { id: 'deliveredPaymentPending', label: 'Unpaid Del', group: 'kpi' },
    { id: 'costGaps', label: 'Cost Gaps', group: 'kpi' },
    { id: 'unpaidAmount', label: 'Unpaid Payouts', group: 'kpi' },
    { id: 'overduePayoutCount', label: 'Overdue 10+', group: 'kpi' }
  ];

  const visibleCols = columns.filter(c => !hiddenColumns.includes(c.id));

  return (
    <div className="page-container" style={{ maxWidth: '100%' }}>
      <style>{`
        .reports-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13px; text-align: right; white-space: nowrap; }
        .reports-table th { padding: 12px 16px; border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 10; font-weight: 700; color: var(--text-primary); text-transform: uppercase; cursor: pointer; user-select: none; }
        .reports-table td { padding: 10px 16px; border-bottom: 1px solid var(--border); color: var(--text-primary); transition: background 0.1s; }
        .reports-table tr:nth-child(even) { background-color: rgba(255,255,255,0.02); }
        .reports-table tr:hover { background-color: var(--bg-active) !important; }
        .editable-input { width: 90px; padding: 6px; text-align: right; background: var(--bg-elevated); border: 1px solid var(--border); color: var(--text-primary); border-radius: 4px; font-weight: 600; transition: all 0.2s; }
        .editable-input:focus { border-color: var(--brand); box-shadow: 0 0 0 2px var(--brand-glow); outline: none; background: var(--bg-surface); }
        .head-sales { background-color: #854d0e !important; color: white !important; border-right: 1px solid rgba(255,255,255,0.1); }
        .head-out { background-color: #6b21a8 !important; color: white !important; border-right: 1px solid rgba(255,255,255,0.1); }
        .head-pnl { background-color: #065f46 !important; color: white !important; border-right: 1px solid rgba(255,255,255,0.1); }
        .head-kpi { background-color: var(--bg-active) !important; color: var(--text-primary) !important; }
        .sticky-col { position: sticky; left: 0; background-color: var(--bg-surface) !important; z-index: 20; border-right: 3px solid var(--border); text-align: left !important; font-weight: 800; color: var(--text-primary); box-shadow: 2px 0 5px rgba(0,0,0,0.1); }
        .column-picker { position: absolute; top: 100%; left: 0; z-index: 100; background: var(--bg-surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; width: 250px; box-shadow: 0 10px 25px rgba(0,0,0,0.15); max-height: 400px; overflow-y: auto; }
        .view-controls { display: flex; gap: 12px; align-items: center; margin-bottom: 20px; }
      `}</style>

      <header className="page-header" style={{ marginBottom: 20 }}>
        <h1 className="page-title">📈 Profit & Loss Command Center</h1>
      </header>

      <ReportsFilterBar
        {...reportsData}
        columns={columns}
      />

      <PnLMetricsPanel
        {...reportsData}
        visibleCols={visibleCols}
        columns={columns}
        tableContainerRef={tableContainerRef}
        handleDrilldown={handleDrilldown}
      />

      <ReportsChartSection />

      {reportsData.showBulkModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>
          <div className="stat-card" style={{ width: 500, padding: 32, border: '1px solid var(--blue)', background: 'var(--bg-surface)' }}>
            <h2 style={{ color: 'var(--blue)', marginTop: 0 }}>🚀 Bulk Marketing Sync</h2>
            <p style={{ fontSize: '0.85rem', opacity: 0.7, color: 'var(--text-secondary)' }}>Paste a column from Excel. Applied in table order.</p>
            <select className="editable-input" style={{ width: '100%', marginBottom: 16 }} value={reportsData.bulkMetric} onChange={e => reportsData.setBulkMetric(e.target.value)}>
              <option value="marketingSpend">Meta Ads</option>
              <option value="tiktokMarketing">TikTok Ads</option>
              <option value="actualExp">Manual Expenses</option>
              <option value="diffCorrection">Correction</option>
            </select>
            <textarea className="editable-input" style={{ width: '100%', height: 180, textAlign: 'left', marginBottom: 16 }} placeholder="Paste here..." value={reportsData.bulkData} onChange={e => reportsData.setBulkData(e.target.value)} disabled={reportsData.bulkLoading} />
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={reportsData.processBulkSync} disabled={reportsData.bulkLoading}>{reportsData.bulkLoading ? 'Syncing...' : 'Sync Data'}</button>
              <button className="btn" onClick={() => reportsData.setShowBulkModal(false)} disabled={reportsData.bulkLoading} style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
