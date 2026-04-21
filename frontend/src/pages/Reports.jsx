import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp, useToast } from '../App';

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
  const [monthFilter, setMonthFilter] = useState('all');
  
  const handleDrilldown = (row, colId) => {
    const isMonthly = !!row.month;
    const dateStr = isMonthly ? row.month : row.date;
    
    let filters = {
      preset: 'Custom Range',
      customStart: isMonthly ? `${dateStr}-01` : dateStr,
      customEnd: isMonthly ? `${dateStr}-31` : dateStr, // backend/helper handles overflow
      status: 'All Statuses'
    };

    if (colId === 'landedOrders') filters.status = 'All Statuses';
    else if (colId === 'cancelations') filters.status = 'Cancelled';
    else if (colId === 'pending') filters.status = 'Pending,Booked,Picked Up';
    else if (colId === 'totalDispatched') filters.status = 'In Transit,Out for Delivery,Shipped';
    else if (colId === 'delivered') filters.status = 'Delivered';
    else if (colId === 'restock') filters.status = 'Return Received';
    else if (colId === 'missingParcel') filters.status = 'Returned';
    else if (colId === 'intransit') filters.status = 'In Transit';
    else if (colId === 'fakeReturns') {
      filters.status = '[WATCHDOG FRAUD]';
    }

    navigate('/search', { state: filters });
  };
  
  // View Persistence State
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
    
    // Optimistic update
    setDailyData(prev => prev.map(row => {
      if (row.date === date) {
        const updated = { ...row, [field]: numValue };
        const totalMarketing = (updated.marketingSpend || 0) + (updated.tiktokMarketing || 0);
        
        // Recalculate dependencies
        updated.pnl = updated.grossProfit - updated.taxPaid - totalMarketing - updated.hybridCourier - (updated.actualExp || 0);
        updated.marPercent = updated.deliveredSale > 0 ? (totalMarketing / updated.deliveredSale) * 100 : 0;
        // Approximation of roasMeta if needed, but usually we trust the calculated roasMeta from backend
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
      
      const res = await fetch(`/api/reports/metrics?t=${Date.now()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Failed to save');
    } catch (e) {
      toast('Error saving: ' + e.message, 'error');
      fetchData(); // Revert on error
    }
  };

  const sortData = (data, config) => {
    if (!config.key) return data;
    const sorted = [...data].sort((a, b) => {
      let valA = a[config.key];
      let valB = b[config.key];

      // Handle month vs date
      if (config.key === 'date' && !a.date && a.month) valA = a.month;
      if (config.key === 'date' && !b.date && b.month) valB = b.month;

      if (valA < valB) return config.direction === 'asc' ? -1 : 1;
      if (valA > valB) return config.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  };

  const monthlyData = useMemo(() => {
    const rawMonthly = Object.values(dailyData.reduce((acc, row) => {
      const month = row.date.substring(0, 7); // YYYY-MM
      if (!acc[month]) {
        acc[month] = {
          month,
          deliveredSale: 0, cgs: 0, marketingSpend: 0, tiktokMarketing: 0,
          estCourier: 0, actualCourier: 0, hybridCourier: 0, actualExp: 0, landedOrders: 0, cancelations: 0,
          pending: 0, totalDispatched: 0, delivered: 0, restock: 0, missingParcel: 0,
          intransit: 0, fakeReturns: 0, withoutTrackingId: 0,
          paymentPaid: 0, diffCorrection: 0, deliveredPaymentPending: 0,
          totalSale: 0
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
      const cgsPercent = m.deliveredSale > 0 ? (m.cgs / m.deliveredSale) * 100 : 0;
      const taxPaid = m.deliveredSale * 0.04;
      const netSales = m.deliveredSale - taxPaid;
      const grossProfit = m.deliveredSale - m.cgs;
      const marPercent = m.deliveredSale > 0 ? (totalMarketing / m.deliveredSale) * 100 : 0;
      const courierDiff = m.actualCourier - (m.estCourier);
      const pnl = grossProfit - taxPaid - totalMarketing - m.hybridCourier - m.actualExp;
      const canPercent = m.landedOrders > 0 ? (m.cancelations / m.landedOrders) * 100 : 0;
      const delPercent = m.totalDispatched > 0 ? (m.delivered / m.totalDispatched) * 100 : 0;
      const aov = m.delivered > 0 ? (m.deliveredSale / m.delivered) : 0;
      const roasMeta = totalMarketing > 0 ? (m.totalSale / totalMarketing) : 0;
      const cpaAvg = m.landedOrders > 0 ? (totalMarketing / m.landedOrders) : 0;
      const netOrders = m.landedOrders - m.cancelations;
      const netCpaAvg = netOrders > 0 ? (totalMarketing / netOrders) : 0;

      return { ...m, date: m.month, aov, cgsPercent, taxPaid, netSales, grossProfit, marPercent, pnl, canPercent, delPercent, roasMeta, cpaAvg, netCpaAvg, courierDiff };
    });

    return sortData(rawMonthly, sortConfig);
  }, [dailyData, sortConfig]);

  const filteredDaily = useMemo(() => {
    let data = monthFilter === 'all' ? dailyData : dailyData.filter(r => r.date.startsWith(monthFilter));
    return sortData(data, sortConfig);
  }, [dailyData, monthFilter, sortConfig]);

  const requestSort = (key) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const toggleColumn = (colId) => {
    setHiddenColumns(prev => 
      prev.includes(colId) ? prev.filter(c => c !== colId) : [...prev, colId]
    );
  };

  const columns = [
    { id: 'date', label: view === 'daily' ? 'Dates' : 'Month', group: 'key' },
    { id: 'aov', label: 'AOV', group: 'income' },
    { id: 'deliveredSale', label: 'Delivered Sale', group: 'income' },
    { id: 'cgs', label: 'CGS', group: 'income' },
    { id: 'cgsPercent', label: 'CGS %', group: 'income' },
    { id: 'netSales', label: '-4% Tax', group: 'income' },
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
    { id: 'totalDispatched', label: 'Dispatched', group: 'kpi' },
    { id: 'disPercent', label: 'Dis %', group: 'kpi' },
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

  const renderSortIcon = (key) => {
    if (sortConfig.key !== key) return <span style={{ opacity: 0.2, marginLeft: 4 }}>↕</span>;
    return <span style={{ marginLeft: 4, color: '#fbbf24' }}>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
  };

  const renderEditable = (row, field) => (
    <input 
      type="number" 
      value={row[field] || ''}
      onChange={(e) => handleMetricChange(row.date, field, e.target.value)}
      onBlur={(e) => handleMetricChange(row.date, field, e.target.value)}
      placeholder="0"
      className="editable-input"
    />
  );

  return (
    <div className="page-container" style={{ maxWidth: '100%' }}>
      <style>{`
        .reports-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13px; text-align: right; white-space: nowrap; }
        .reports-table th { padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.1); position: sticky; top: 0; z-index: 10; font-weight: 700; color: #fff; text-transform: uppercase; letter-spacing: 0.05em; cursor: pointer; user-select: none; }
        .reports-table th:hover { background-color: rgba(255,255,255,0.1); }
        .reports-table td { padding: 10px 16px; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .reports-table tr:hover { background-color: rgba(255,255,255,0.05); }
        
        .editable-input { width: 90px; padding: 6px; text-align: right; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.2); color: #fff; border-radius: 4px; font-weight: 600; }
        .editable-input:focus { outline: none; border-color: #fbbf24; box-shadow: 0 0 0 2px rgba(251,191,36,0.2); }
        
        .head-sales { background-color: #854d0e !important; }
        .head-out { background-color: #6b21a8 !important; }
        .head-pnl { background-color: #065f46 !important; }
        .head-kpi { background-color: #1e293b !important; }

        .col-sales { background-color: rgba(251, 191, 36, 0.05); }
        .col-out { background-color: rgba(168, 85, 247, 0.05); }
        .col-pnl-cell { background-color: rgba(16, 185, 129, 0.1); font-weight: 800; font-size: 14px; }
        
        .sticky-col { position: sticky; left: 0; background-color: #0f172a !important; z-index: 20; border-right: 2px solid rgba(255,255,255,0.1); text-align: left !important; font-weight: 800; }
        
        .column-picker { position: absolute; top: 100%; left: 0; z-index: 100; background: #1e293b; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 16px; width: 250px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); max-height: 400px; overflow-y: auto; }
        .column-item { display: flex; alignItems: center; gap: 8px; margin-bottom: 8px; cursor: pointer; font-size: 12px; }
        .column-item input { cursor: pointer; }
        
        .view-controls { display: flex; gap: 12px; align-items: center; margin-bottom: 20px; }
      `}</style>

      <header className="page-header" style={{ marginBottom: 20 }}>
        <h1 className="page-title">📈 Profit & Loss Command Center</h1>
        <p className="page-subtitle">Complete 34-column operational dashboard synchronized with Shopify & Couriers</p>
      </header>

      <div className="view-controls" style={{ justifyContent: 'flex-start' }}>
        <div style={{ position: 'relative' }}>
          <button 
            className="btn" 
            onClick={() => setShowColPicker(!showColPicker)}
            style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}
          >
            ⚙️ Columns {hiddenColumns.length > 0 && `(${columns.length - hiddenColumns.length}/${columns.length})`}
          </button>
          
          {showColPicker && (
            <div className="column-picker">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <button onClick={() => setHiddenColumns([])} style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: 11, cursor: 'pointer' }}>Show All</button>
                <button onClick={() => setHiddenColumns(columns.filter(c => c.group !== 'key').map(c => c.id))} style={{ background: 'none', border: 'none', color: '#f87171', fontSize: 11, cursor: 'pointer' }}>Hide All</button>
                <button onClick={() => { setHiddenColumns([]); setSortConfig({ key: 'date', direction: 'desc' }); }} style={{ background: 'none', border: 'none', color: '#fbbf24', fontSize: 11, cursor: 'pointer' }}>Reset View</button>
              </div>
              {columns.map(col => (
                <label key={col.id} className="column-item">
                  <input 
                    type="checkbox" 
                    checked={!hiddenColumns.includes(col.id)} 
                    onChange={() => toggleColumn(col.id)}
                    disabled={col.group === 'key'}
                  />
                  <span>{col.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {view === 'daily' && (
          <select 
            value={monthFilter} 
            onChange={e => setMonthFilter(e.target.value)}
            className="editable-input"
            style={{ width: 'auto', background: 'rgba(255,255,255,0.1)', cursor: 'pointer' }}
          >
            <option value="all">All Months</option>
            {columns.find(c => c.id === 'date' && !hiddenColumns.includes('date')) && (
               Array.from(new Set(dailyData.map(r => r.date.substring(0, 7)))).sort((a,b)=>b.localeCompare(a)).map(m => (
                <option key={m} value={m}>{m}</option>
              ))
            )}
          </select>
        )}

        <div style={{ display: 'flex', gap: 8, background: 'rgba(0,0,0,0.3)', padding: 6, borderRadius: 10 }}>
          <button 
            className={`btn ${view === 'daily' ? 'btn-primary' : ''}`}
            onClick={() => setView('daily')}
            style={{ 
              backgroundColor: view === 'daily' ? '#4f46e5' : 'transparent', 
              border: 'none',
              padding: '8px 16px',
              fontWeight: 600
            }}
          >
            📅 Daily PNL
          </button>
          <button 
            className={`btn ${view === 'monthly' ? 'btn-primary' : ''}`}
            onClick={() => setView('monthly')}
            style={{ 
              backgroundColor: view === 'monthly' ? '#4f46e5' : 'transparent', 
              border: 'none',
              padding: '8px 16px',
              fontWeight: 600
            }}
          >
            📊 Month Vise
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 100, textAlign: 'center', opacity: 0.5 }}>
          <div style={{ fontSize: 24, marginBottom: 10 }}>⏳</div>
          Crunching numbers...
        </div>
      ) : (
        <div className="stat-card" style={{ padding: 0, overflowX: 'auto', maxHeight: 'calc(100vh - 220px)', overflowY: 'auto', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)' }}>
          <table className="reports-table">
            <thead>
              <tr style={{ height: 40 }}>
                {columns.find(c => c.id === 'date' && !hiddenColumns.includes('date')) && <th className="sticky-col" style={{ zIndex: 21 }}></th>}
                
                {columns.filter(c => c.group === 'income' && !hiddenColumns.includes(c.id)).length > 0 && (
                  <th colSpan={columns.filter(c => c.group === 'income' && !hiddenColumns.includes(c.id)).length} className="head-sales" style={{ borderRight: '1px solid rgba(255,255,255,0.2)', textAlign: 'center' }}>💸 INCOME & SALES</th>
                )}
                
                {columns.filter(c => c.group === 'expense' && !hiddenColumns.includes(c.id)).length > 0 && (
                  <th colSpan={columns.filter(c => c.group === 'expense' && !hiddenColumns.includes(c.id)).length} className="head-out" style={{ borderRight: '1px solid rgba(255,255,255,0.2)', textAlign: 'center' }}>📉 EXPENSES (OUT)</th>
                )}
                
                {columns.filter(c => c.group === 'profit' && !hiddenColumns.includes(c.id)).length > 0 && (
                  <th colSpan={columns.filter(c => c.group === 'profit' && !hiddenColumns.includes(c.id)).length} className="head-pnl" style={{ borderRight: '1px solid rgba(255,255,255,0.2)', textAlign: 'center' }}>💰 PROFIT</th>
                )}
                
                {columns.filter(c => c.group === 'kpi' && !hiddenColumns.includes(c.id)).length > 0 && (
                  <th colSpan={columns.filter(c => c.group === 'kpi' && !hiddenColumns.includes(c.id)).length} className="head-kpi" style={{ textAlign: 'center' }}>🛡️ OPERATIONAL KPIs</th>
                )}
              </tr>
              <tr>
                {visibleCols.map((col, idx) => {
                  let className = "";
                  if (col.id === 'date') className = "sticky-col";
                  else if (col.group === 'income') className = "head-sales";
                  else if (col.group === 'expense') className = "head-out";
                  else if (col.group === 'profit') className = "head-pnl";
                  else if (col.group === 'kpi') className = "head-kpi";

                  // Add border right to last in group if next is different
                  const nextCol = visibleCols[idx+1];
                  const style = (nextCol && nextCol.group !== col.group) ? { borderRight: '1px solid rgba(255,255,255,0.2)' } : {};
                  if (col.id === 'date') style.zIndex = 21;

                  return (
                    <th key={col.id} className={className} style={style} onClick={() => requestSort(col.id)}>
                      {col.label} {renderSortIcon(col.id)}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {(view === 'daily' ? filteredDaily : monthlyData).map(row => (
                <tr key={row.date || row.month}>
                  {visibleCols.map((col, idx) => {
                    let content = "";
                    let className = "";
                    let style = {};

                    if (col.id === 'date') {
                      content = row.date || row.month;
                      className = "sticky-col";
                    } else if (col.group === 'income') {
                      className = "col-sales";
                      if (['aov', 'deliveredSale', 'cgs', 'netSales', 'taxPaid', 'grossProfit'].includes(col.id)) content = formatCurrency(row[col.id]);
                      else if (col.id === 'cgsPercent') content = formatPercent(row[col.id]);
                      
                      if (col.id === 'deliveredSale') style = { color: '#34d399', fontWeight: 600 };
                      if (col.id === 'taxPaid') style = { color: '#f87171' };
                    } else if (col.group === 'expense') {
                      className = "col-out";
                      if (['marPercent'].includes(col.id)) content = formatPercent(row[col.id]);
                      else if (['marketingSpend', 'tiktokMarketing', 'actualExp'].includes(col.id)) {
                        content = view === 'daily' ? renderEditable(row, col.id) : formatCurrency(row[col.id]);
                      } else {
                        content = formatCurrency(row[col.id]);
                        if (col.id === 'estCourier') style = { color: '#f87171' };
                        if (col.id === 'courierDiff') style = { color: row.courierDiff > 0 ? '#f87171' : '#34d399' };
                      }
                    } else if (col.id === 'pnl') {
                      className = "col-pnl-cell";
                      content = formatCurrency(row.pnl);
                      style = { color: row.pnl >= 0 ? '#34d399' : '#fca5a5', textAlign: 'center' };
                    } else {
                      // KPIs
                      if (['delPercent', 'canPercent', 'disPercent'].includes(col.id)) content = formatPercent(row[col.id]);
                      else if (['roasMeta'].includes(col.id)) content = formatNumber(row[col.id]);
                      else if (['cpaAvg', 'netCpaAvg', 'paymentPaid'].includes(col.id)) content = formatCurrency(row[col.id]);
                      else if (col.id === 'diffCorrection') content = view === 'daily' ? renderEditable(row, col.id) : formatCurrency(row[col.id]);
                      else content = row[col.id];

                      if (col.id === 'cancelations' || col.id === 'missingParcel' || col.id === 'fakeReturns') style = { color: '#f87171' };
                      if (col.id === 'pending' || col.id === 'deliveredPaymentPending') style = { color: '#fbbf24' };
                      if (col.id === 'delivered' || col.id === 'restock' || col.id === 'paymentPaid') style = { color: '#34d399' };
                      if (col.id === 'intransit') style = { color: '#60a5fa' };
                    }

                    const isKPI = col.group === 'kpi' || col.id === 'landedOrders' || col.id === 'cancelations';
                    const isClickable = isKPI && ['landedOrders', 'cancelations', 'pending', 'totalDispatched', 'delivered', 'restock', 'missingParcel', 'intransit', 'fakeReturns'].includes(col.id);

                    const nextCol = visibleCols[idx+1];
                    if (nextCol && nextCol.group !== col.group) {
                      style.borderRight = '1px solid rgba(255,255,255,0.1)';
                      if (col.id === 'pnl') style.borderRight = '2px solid rgba(255,255,255,0.2)';
                    }

                    return (
                      <td 
                        key={col.id} 
                        className={className} 
                        style={{
                          ...style,
                          cursor: isClickable ? 'pointer' : 'default',
                        }}
                        onClick={() => isClickable && handleDrilldown(row, col.id)}
                      >
                        {isClickable ? (
                          <span style={{ borderBottom: '1px dashed rgba(255,255,255,0.3)', display: 'inline-block' }}>
                            {content}
                          </span>
                        ) : content}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {(view === 'daily' ? filteredDaily : monthlyData).length === 0 && (
                <tr>
                  <td colSpan={visibleCols.length} style={{ padding: 40, textAlign: 'center', opacity: 0.5 }}>No data found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
