import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp, useToast } from '../context/AppContext';

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(amount || 0);
}

function formatPercent(value) {
  return (value || 0).toFixed(2) + '%';
}

function formatNumber(value) {
  return (value || 0).toFixed(2);
}

export default function Reports() {
  const { activeStoreId } = useApp();
  const navigate = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [dailyData, setDailyData] = useState([]);
  const [view, setView] = useState('daily'); // 'daily' or 'monthly'

  // ─── Date Range Filter ───────────────────────────────────────────
  const getPresetRange = (preset) => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const pad = (n) => String(n).padStart(2, '0');
    const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    switch (preset) {
      case 'This Month':   return { start: `${y}-${pad(m+1)}-01`, end: fmt(now) };
      case 'Last Month': {
        const lm = new Date(y, m, 0);
        return { start: `${lm.getFullYear()}-${pad(lm.getMonth()+1)}-01`, end: fmt(lm) };
      }
      case 'This Quarter': {
        const qStart = new Date(y, Math.floor(m/3)*3, 1);
        return { start: fmt(qStart), end: fmt(now) };
      }
      case 'This Year':  return { start: `${y}-01-01`, end: fmt(now) };
      case 'Last Year':  return { start: `${y-1}-01-01`, end: `${y-1}-12-31` };
      case 'All Time':   return { start: '2010-01-01', end: fmt(now) };
      default:           return { start: '', end: '' };
    }
  };
  const [datePreset, setDatePreset] = useState('This Year');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const activeDateRange = datePreset === 'Custom'
    ? { start: customStart, end: customEnd }
    : getPresetRange(datePreset);

  const isInRange = (dateStr) => {
    if (!activeDateRange.start && !activeDateRange.end) return true;
    if (activeDateRange.start && dateStr < activeDateRange.start) return false;
    if (activeDateRange.end && dateStr > activeDateRange.end) return false;
    return true;
  };
  
  const handleDrilldown = (row, colId) => {
    const isMonthly = !!row.month;
    const dateStr = isMonthly ? row.month : row.date;
    
    let filters = {
      preset: 'Custom Range',
      customStart: isMonthly ? `${dateStr}-01` : dateStr,
      customEnd: isMonthly ? `${dateStr}-31` : dateStr, 
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

    navigate('/search', { state: filters });
  };
  
  const [hiddenColumns, setHiddenColumns] = useState(() => {
    const saved = localStorage.getItem('reports_hidden_columns');
    return saved ? JSON.parse(saved) : [];
  });
  const [sortConfig, setSortConfig] = useState(() => {
    const saved = localStorage.getItem('reports_sort_config');
    return saved ? JSON.parse(saved) : { key: 'date', direction: 'desc' };
  });
  const [showColPicker, setShowColPicker] = useState(false);

  useEffect(() => {
    localStorage.setItem('reports_hidden_columns', JSON.stringify(hiddenColumns));
  }, [hiddenColumns]);

  useEffect(() => {
    localStorage.setItem('reports_sort_config', JSON.stringify(sortConfig));
  }, [sortConfig]);

  useEffect(() => {
    if (!activeStoreId) return;
    fetchData();
  }, [activeStoreId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/daily?store_id=${activeStoreId}&t=${Date.now()}`);
      if (!res.ok) throw new Error('Failed to fetch data');
      const data = await res.json();
      setDailyData(data);
    } catch (e) {
      toast('Error loading reports: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleMetricChange = async (date, field, value) => {
    const numValue = parseFloat(value) || 0;
    setDailyData(prev => prev.map(row => {
      if (row.date === date) {
        const updated = { ...row, [field]: numValue };
        const totalMarketing = (updated.marketingSpend || 0) + (updated.tiktokMarketing || 0);
        updated.pnl = updated.grossProfit - totalMarketing - updated.hybridCourier - (updated.actualExp || 0);
        updated.marPercent = updated.deliveredSale > 0 ? (totalMarketing / updated.deliveredSale) * 100 : 0;
        const landedOrders = updated.landedOrders || 0;
        updated.cpaAvg = landedOrders > 0 ? (totalMarketing / landedOrders) : 0;
        const netOrders = landedOrders - (updated.cancelations || 0);
        updated.netCpaAvg = netOrders > 0 ? (totalMarketing / netOrders) : 0;
        return updated;
      }
      return row;
    }));

    try {
      const row = dailyData.find(r => r.date === date);
      const payload = {
        store_id: activeStoreId,
        date: date,
        marketing_spend: field === 'marketingSpend' ? numValue : (row.marketingSpend || 0),
        tiktok_marketing: field === 'tiktokMarketing' ? numValue : (row.tiktokMarketing || 0),
        actual_exp: field === 'actualExp' ? numValue : (row.actualExp || 0),
        diff_correction: field === 'diffCorrection' ? numValue : (row.diffCorrection || 0)
      };
      await fetch(`/api/reports/metrics?t=${Date.now()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      toast('Error saving: ' + e.message, 'error');
      fetchData();
    }
  };

  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkMetric, setBulkMetric] = useState('marketingSpend');
  const [bulkData, setBulkData] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);

  const processBulkSync = async () => {
    const lines = bulkData.split(/\r?\n/).map(l => l.trim()).filter(l => l !== '');
    if (lines.length === 0) return toast("No data found", "error");

    setBulkLoading(true);
    const currentData = view === 'daily' ? filteredDaily : monthlyData;
    const updates = [];
    
    for (let i = 0; i < lines.length; i++) {
      if (i < currentData.length) {
        const rawVal = lines[i].replace(/[^0-9.]/g, '');
        const numValue = parseFloat(rawVal);
        if (!isNaN(numValue)) {
          updates.push({
            date: currentData[i].date,
            value: numValue
          });
        }
      }
    }

    if (updates.length > 0) {
      await handleBulkMetricUpdate(bulkMetric, updates);
      setShowBulkModal(false);
      setBulkData('');
    } else {
      toast("No valid numbers found", "error");
    }
    setBulkLoading(false);
  };

  const handleBulkMetricUpdate = async (field, updates) => {
    const fieldMapping = {
      marketingSpend: 'marketing_spend',
      tiktokMarketing: 'tiktok_marketing',
      actualExp: 'actual_exp',
      diffCorrection: 'diff_correction'
    };

    const dbField = fieldMapping[field];
    if (!dbField) return;

    setDailyData(prev => prev.map(row => {
      const update = updates.find(u => u.date === row.date);
      if (update) {
        const numValue = parseFloat(update.value) || 0;
        const updated = { ...row, [field]: numValue };
        const totalMarketing = (updated.marketingSpend || 0) + (updated.tiktokMarketing || 0);
        updated.pnl = updated.grossProfit - totalMarketing - updated.hybridCourier - (updated.actualExp || 0);
        updated.marPercent = updated.deliveredSale > 0 ? (totalMarketing / updated.deliveredSale) * 100 : 0;
        const landedOrders = updated.landedOrders || 0;
        updated.cpaAvg = landedOrders > 0 ? (totalMarketing / landedOrders) : 0;
        const netOrders = landedOrders - (updated.cancelations || 0);
        updated.netCpaAvg = netOrders > 0 ? (totalMarketing / netOrders) : 0;
        return updated;
      }
      return row;
    }));

    try {
      const res = await fetch(`/api/reports/bulk-metrics?t=${Date.now()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: activeStoreId, metric_field: dbField, updates })
      });
      if (!res.ok) throw new Error('Failed to save bulk');
      toast(`Successfully synced ${updates.length} rows`, 'success');
    } catch (e) {
      toast('Error saving bulk: ' + e.message, 'error');
      fetchData();
    }
  };

  const handlePaste = (e, startDate, field) => {
    const text = e.clipboardData.getData('text');
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l !== '');
    if (lines.length <= 1) return; 
    
    e.preventDefault();
    const currentData = view === 'daily' ? filteredDaily : monthlyData;
    const startIndex = currentData.findIndex(r => r.date === startDate);
    if (startIndex === -1) return toast("Error: Start date not found", "error");

    const updates = [];
    for (let i = 0; i < lines.length; i++) {
      const rowIndex = startIndex + i;
      if (rowIndex < currentData.length) {
        const rawVal = lines[i].replace(/[^0-9.]/g, '');
        const numValue = parseFloat(rawVal);
        if (!isNaN(numValue)) {
          updates.push({ date: currentData[rowIndex].date, value: numValue });
        }
      }
    }

    if (updates.length > 0) {
      toast(`Pasting ${updates.length} values...`, 'info');
      handleBulkMetricUpdate(field, updates);
    }
  };

  const sortData = (data, config) => {
    if (!config.key) return data;
    return [...data].sort((a, b) => {
      let valA = a[config.key];
      let valB = b[config.key];
      if (config.key === 'date' && !a.date && a.month) valA = a.month;
      if (config.key === 'date' && !b.date && b.month) valB = b.month;
      if (valA < valB) return config.direction === 'asc' ? -1 : 1;
      if (valA > valB) return config.direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const monthlyData = useMemo(() => {
    const sourceData = dailyData.filter(r => isInRange(r.date));
    const rawMonthly = Object.values(sourceData.reduce((acc, row) => {
      const month = row.date.substring(0, 7);
      if (!acc[month]) {
        acc[month] = {
          month, deliveredSale: 0, cgs: 0, marketingSpend: 0, tiktokMarketing: 0,
          estCourier: 0, actualCourier: 0, hybridCourier: 0, actualExp: 0, landedOrders: 0, cancelations: 0,
          pending: 0, booked: 0, totalDispatched: 0, delivered: 0, restock: 0, missingParcel: 0,
          intransit: 0, fakeReturns: 0, withoutTrackingId: 0,
          paymentPaid: 0, diffCorrection: 0, deliveredPaymentPending: 0, totalSale: 0
        };
      }
      const m = acc[month];
      m.deliveredSale += row.deliveredSale || 0;
      m.cgs += row.cgs || 0;
      m.marketingSpend += row.marketingSpend || 0;
      m.tiktokMarketing += row.tiktokMarketing || 0;
      m.estCourier += row.estCourier || 0;
      m.actualCourier += row.actualCourier || 0;
      m.hybridCourier += row.hybridCourier || 0;
      m.actualExp += row.actualExp || 0;
      m.landedOrders += row.landedOrders || 0;
      m.cancelations += row.cancelations || 0;
      m.pending += row.pending || 0;
      m.booked += row.booked || 0;
      m.totalDispatched += row.totalDispatched || 0;
      m.delivered += row.delivered || 0;
      m.restock += row.restock || 0;
      m.missingParcel += row.missingParcel || 0;
      m.intransit += row.intransit || 0;
      m.fakeReturns += row.fakeReturns || 0;
      m.withoutTrackingId += row.withoutTrackingId || 0;
      m.paymentPaid += row.paymentPaid || 0;
      m.diffCorrection += row.diffCorrection || 0;
      m.deliveredPaymentPending += row.deliveredPaymentPending || 0;
      const totalMarketing = (row.marketingSpend || 0) + (row.tiktokMarketing || 0);
      m.totalSale += (row.roasMeta * totalMarketing);
      return acc;
    }, {})).map(m => {
      const totalMarketing = m.marketingSpend + m.tiktokMarketing;
      const taxPaid = m.deliveredSale * 0.04;
      const grossProfit = m.deliveredSale - m.cgs;
      const pnl = grossProfit - totalMarketing - m.hybridCourier - m.actualExp;
      const landedOrders = m.landedOrders || 0;
      const netOrders = landedOrders - m.cancelations;
      return { 
        ...m, date: m.month, 
        aov: m.delivered > 0 ? (m.deliveredSale / m.delivered) : 0,
        cgsPercent: m.deliveredSale > 0 ? (m.cgs / m.deliveredSale) * 100 : 0,
        taxPaid, grossProfit, 
        marPercent: m.deliveredSale > 0 ? (totalMarketing / m.deliveredSale) * 100 : 0,
        pnl, 
        canPercent: landedOrders > 0 ? (m.cancelations / landedOrders) * 100 : 0,
        delPercent: m.totalDispatched > 0 ? (m.delivered / m.totalDispatched) * 100 : 0,
        roasMeta: totalMarketing > 0 ? (m.totalSale / totalMarketing) : 0,
        cpaAvg: landedOrders > 0 ? (totalMarketing / landedOrders) : 0,
        netCpaAvg: netOrders > 0 ? (totalMarketing / netOrders) : 0,
        courierDiff: m.actualCourier - m.estCourier
      };
    });
    return sortData(rawMonthly, sortConfig);
  }, [dailyData, activeDateRange.start, activeDateRange.end, sortConfig]);

  const filteredDaily = useMemo(() => {
    let data = dailyData.filter(r => isInRange(r.date));
    return sortData(data, sortConfig);
  }, [dailyData, activeDateRange.start, activeDateRange.end, sortConfig]);

  const requestSort = (key) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') direction = 'asc';
    setSortConfig({ key, direction });
  };

  const toggleColumn = (colId) => {
    setHiddenColumns(prev => prev.includes(colId) ? prev.filter(c => c !== colId) : [...prev, colId]);
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
    { id: 'deliveredPaymentPending', label: 'Unpaid Del', group: 'kpi' }
  ];

  const visibleCols = columns.filter(c => !hiddenColumns.includes(c.id));

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

  return (
    <div className="page-container" style={{ maxWidth: '100%' }}>
      <style>{`
        .reports-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13px; text-align: right; white-space: nowrap; }
        .reports-table th { padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.1); position: sticky; top: 0; z-index: 10; font-weight: 700; color: #fff; text-transform: uppercase; cursor: pointer; user-select: none; }
        .reports-table td { padding: 10px 16px; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .reports-table tr:hover { background-color: rgba(255,255,255,0.05); }
        .editable-input { width: 90px; padding: 6px; text-align: right; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.2); color: #fff; border-radius: 4px; font-weight: 600; }
        .head-sales { background-color: #854d0e !important; }
        .head-out { background-color: #6b21a8 !important; }
        .head-pnl { background-color: #065f46 !important; }
        .head-kpi { background-color: #1e293b !important; }
        .sticky-col { position: sticky; left: 0; background-color: #0f172a !important; z-index: 20; border-right: 2px solid rgba(255,255,255,0.1); text-align: left !important; font-weight: 800; }
        .column-picker { position: absolute; top: 100%; left: 0; z-index: 100; background: #1e293b; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 16px; width: 250px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); max-height: 400px; overflow-y: auto; }
        .view-controls { display: flex; gap: 12px; align-items: center; margin-bottom: 20px; }
      `}</style>

      <header className="page-header" style={{ marginBottom: 20 }}>
        <h1 className="page-title">📈 Profit & Loss Command Center</h1>
      </header>

      {/* ─── Date Range Filter Bar ─── */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', fontWeight: 700, letterSpacing: '0.06em' }}>DATE RANGE</span>
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
              borderColor: datePreset === p ? 'var(--brand)' : 'rgba(255,255,255,0.15)',
              background: datePreset === p ? 'var(--brand-glow)' : 'transparent',
              color: datePreset === p ? 'var(--brand)' : 'rgba(255,255,255,0.5)',
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
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem' }}>→</span>
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
          <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.3)', marginLeft: 4 }}>
            {activeDateRange.start} → {activeDateRange.end}
          </span>
        )}
      </div>

      <div className="view-controls">
        <div style={{ position: 'relative' }}>
          <button className="btn" onClick={() => setShowColPicker(!showColPicker)} style={{ background: 'rgba(255,255,255,0.1)' }}>⚙️ Columns</button>
          {showColPicker && (
            <div className="column-picker">
              {columns.map(col => (
                <label key={col.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 12 }}>
                  <input type="checkbox" checked={!hiddenColumns.includes(col.id)} onChange={() => toggleColumn(col.id)} disabled={col.group === 'key'} />
                  <span>{col.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {view === 'daily' && filteredDaily.length > 0 && (
          <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)' }}>
            {filteredDaily.length} days
          </span>
        )}
        {view === 'monthly' && monthlyData.length > 0 && (
          <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)' }}>
            {monthlyData.length} months
          </span>
        )}

        <div style={{ display: 'flex', gap: 8, background: 'rgba(0,0,0,0.3)', padding: 6, borderRadius: 10 }}>
          <button className={`btn ${view === 'daily' ? 'btn-primary' : ''}`} onClick={() => setView('daily')}>📅 Daily PNL</button>
          <button className={`btn ${view === 'monthly' ? 'btn-primary' : ''}`} onClick={() => setView('monthly')}>📊 Month Vise</button>
        </div>

        <button className="btn" onClick={() => setShowBulkModal(true)} style={{ background: 'var(--blue-dim)', color: 'var(--blue)', border: '1px solid var(--blue)' }}>🚀 Bulk Sync Spend</button>
      </div>

      {loading ? (
        <div style={{ padding: 100, textAlign: 'center', opacity: 0.5 }}>⏳ Crunching numbers...</div>
      ) : (
        <div className="stat-card" style={{ padding: 0, overflowX: 'auto', maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' }}>
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
                  <th key={col.id} className={col.id === 'date' ? 'sticky-col' : ''} onClick={() => requestSort(col.id)}>
                    {col.label} {sortConfig.key === col.id ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(view === 'daily' ? filteredDaily : monthlyData).map(row => (
                <tr key={row.date || row.month}>
                  {visibleCols.map(col => {
                    let content = row[col.id];
                    let style = {};
                    if (col.id === 'date') return <td key={col.id} className="sticky-col">{row.date || row.month}</td>;
                    if (['aov', 'deliveredSale', 'cgs', 'taxPaid', 'grossProfit', 'estCourier', 'actualCourier', 'courierDiff', 'actualExp', 'pnl', 'paymentPaid', 'marketingSpend', 'tiktokMarketing', 'cpaAvg', 'netCpaAvg'].includes(col.id)) content = formatCurrency(row[col.id]);
                    if (['cgsPercent', 'marPercent', 'delPercent', 'canPercent'].includes(col.id)) content = formatPercent(row[col.id]);
                    if (['roasMeta'].includes(col.id)) content = formatNumber(row[col.id]);
                    if (view === 'daily' && ['marketingSpend', 'tiktokMarketing', 'actualExp', 'diffCorrection'].includes(col.id)) content = renderEditable(row, col.id);
                    
                    if (col.id === 'pnl') style = { color: row.pnl >= 0 ? '#34d399' : '#fca5a5', fontWeight: 800 };
                    const isClickable = ['landedOrders', 'cancelations', 'pending', 'booked', 'totalDispatched', 'delivered', 'restock', 'missingParcel', 'intransit', 'fakeReturns', 'withoutTrackingId', 'deliveredPaymentPending'].includes(col.id);

                    return (
                      <td 
                        key={col.id} 
                        style={{ ...style, cursor: isClickable ? 'pointer' : 'default' }} 
                        onClick={() => isClickable && handleDrilldown(row, col.id)}
                      >
                        {isClickable ? (
                          <span style={{ borderBottom: '1px dashed rgba(255,255,255,0.3)' }}>{content}</span>
                        ) : content}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showBulkModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>
          <div className="stat-card" style={{ width: 500, padding: 32, border: '1px solid var(--blue)' }}>
            <h2 style={{ color: 'var(--blue)', marginTop: 0 }}>🚀 Bulk Marketing Sync</h2>
            <p style={{ fontSize: '0.85rem', opacity: 0.7 }}>Paste a column from Excel. Applied in table order.</p>
            <select className="editable-input" style={{ width: '100%', marginBottom: 16 }} value={bulkMetric} onChange={e => setBulkMetric(e.target.value)}>
              <option value="marketingSpend">Meta Ads</option>
              <option value="tiktokMarketing">TikTok Ads</option>
              <option value="actualExp">Manual Expenses</option>
              <option value="diffCorrection">Correction</option>
            </select>
            <textarea className="editable-input" style={{ width: '100%', height: 180, textAlign: 'left', marginBottom: 16 }} placeholder="Paste here..." value={bulkData} onChange={e => setBulkData(e.target.value)} disabled={bulkLoading} />
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={processBulkSync} disabled={bulkLoading}>{bulkLoading ? 'Syncing...' : 'Sync Data'}</button>
              <button className="btn" onClick={() => setShowBulkModal(false)} disabled={bulkLoading}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
