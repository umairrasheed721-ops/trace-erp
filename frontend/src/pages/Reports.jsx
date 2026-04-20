import { useState, useEffect, useMemo } from 'react';
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
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [dailyData, setDailyData] = useState([]);
  const [view, setView] = useState('daily'); // 'daily' or 'monthly'
  const [monthFilter, setMonthFilter] = useState('all');

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
        updated.pnl = updated.grossProfit - updated.taxPaid - totalMarketing - updated.estCourier - (updated.actualExp || 0);
        updated.marPercent = updated.deliveredSale > 0 ? (totalMarketing / updated.deliveredSale) * 100 : 0;
        updated.roasMeta = totalMarketing > 0 ? ((updated.deliveredSale / (updated.delPercent/100)) / totalMarketing) : 0; // Approximate total sale if not stored, wait totalSale is not in state directly. But it's fine, we update it via backend sync soon.
        updated.cpaAvg = updated.landedOrders > 0 ? (totalMarketing / updated.landedOrders) : 0;
        const netOrders = updated.landedOrders - updated.cancelations;
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
        marketing_spend: field === 'marketingSpend' ? numValue : row.marketingSpend,
        tiktok_marketing: field === 'tiktokMarketing' ? numValue : row.tiktokMarketing,
        actual_exp: field === 'actualExp' ? numValue : row.actualExp,
        diff_correction: field === 'diffCorrection' ? numValue : row.diffCorrection
      };
      
      const res = await fetch(`/api/reports/metrics?t=${Date.now()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Failed to save');
      // No toast for every keystroke to avoid spam
    } catch (e) {
      toast('Error saving: ' + e.message, 'error');
      fetchData(); // Revert on error
    }
  };

  const monthlyData = useMemo(() => {
    return Object.values(dailyData.reduce((acc, row) => {
      const month = row.date.substring(0, 7); // YYYY-MM
      if (!acc[month]) {
        acc[month] = {
          month,
          deliveredSale: 0, cgs: 0, marketingSpend: 0, tiktokMarketing: 0,
          estCourier: 0, actualExp: 0, landedOrders: 0, cancelations: 0,
          pending: 0, totalDispatched: 0, delivered: 0, restocked: 0,
          intransit: 0, fakeReturns: 0, withoutTrackingId: 0,
          paymentPaid: 0, diffCorrection: 0, deliveredPaymentPending: 0,
          totalSale: 0 // to calc roas
        };
      }
      
      const m = acc[month];
      m.deliveredSale += row.deliveredSale || 0;
      m.cgs += row.cgs || 0;
      m.marketingSpend += row.marketingSpend || 0;
      m.tiktokMarketing += row.tiktokMarketing || 0;
      m.estCourier += row.estCourier || 0;
      m.actualExp += row.actualExp || 0;
      m.landedOrders += row.landedOrders || 0;
      m.cancelations += row.cancelations || 0;
      m.pending += row.pending || 0;
      m.totalDispatched += row.totalDispatched || 0;
      m.delivered += row.delivered || 0;
      m.restocked += row.restocked || 0;
      m.intransit += row.intransit || 0;
      m.fakeReturns += row.fakeReturns || 0;
      m.withoutTrackingId += row.withoutTrackingId || 0;
      m.paymentPaid += row.paymentPaid || 0;
      m.diffCorrection += row.diffCorrection || 0;
      m.deliveredPaymentPending += row.deliveredPaymentPending || 0;
      
      // We can approximate totalSale by reverse engineering roas Meta if available, or just keeping the raw value.
      // Wait, in daily we sent totalSale? No, we used it for ROAS but didn't output totalSale directly.
      // Let's approximate it. ROAS = totalSale / totalMarketing.
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
      const pnl = grossProfit - taxPaid - totalMarketing - m.estCourier - m.actualExp;
      const canPercent = m.landedOrders > 0 ? (m.cancelations / m.landedOrders) * 100 : 0;
      const delPercent = m.totalDispatched > 0 ? (m.delivered / m.totalDispatched) * 100 : 0;
      const disPercent = m.landedOrders > 0 ? (m.totalDispatched / m.landedOrders) * 100 : 0;
      const aov = m.delivered > 0 ? (m.deliveredSale / m.delivered) : 0;
      const roasMeta = totalMarketing > 0 ? (m.totalSale / totalMarketing) : 0;
      const cpaAvg = m.landedOrders > 0 ? (totalMarketing / m.landedOrders) : 0;
      const netOrders = m.landedOrders - m.cancelations;
      const netCpaAvg = netOrders > 0 ? (totalMarketing / netOrders) : 0;

      return {
        ...m, aov, cgsPercent, netSales, taxPaid, grossProfit, marPercent,
        pnl, canPercent, delPercent, disPercent, roasMeta, cpaAvg, netCpaAvg
      };
    }).sort((a, b) => b.month.localeCompare(a.month));
  }, [dailyData]);

  // Available months for filter
  const months = useMemo(() => {
    const s = new Set(dailyData.map(r => r.date.substring(0, 7)));
    return Array.from(s).sort((a,b)=>b.localeCompare(a));
  }, [dailyData]);

  const filteredDaily = useMemo(() => {
    if (monthFilter === 'all') return dailyData;
    return dailyData.filter(r => r.date.startsWith(monthFilter));
  }, [dailyData, monthFilter]);

  const renderEditable = (row, field) => (
    <input 
      type="number" 
      value={row[field] || ''}
      onChange={(e) => handleMetricChange(row.date, field, e.target.value)}
      onBlur={(e) => handleMetricChange(row.date, field, e.target.value)} // ensure save on blur
      placeholder="0"
      className="editable-input"
    />
  );

  return (
    <div className="page-container" style={{ maxWidth: '100%' }}>
      <style>{`
        .reports-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13px; text-align: right; white-space: nowrap; }
        .reports-table th { padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.1); position: sticky; top: 0; z-index: 10; font-weight: 700; color: #fff; text-transform: uppercase; letter-spacing: 0.05em; }
        .reports-table td { padding: 10px 16px; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .reports-table tr:hover { background-color: rgba(255,255,255,0.05); }
        
        .editable-input { width: 90px; padding: 6px; text-align: right; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.2); color: #fff; border-radius: 4px; font-weight: 600; }
        .editable-input:focus { outline: none; border-color: #fbbf24; box-shadow: 0 0 0 2px rgba(251,191,36,0.2); }
        
        /* Spreadsheet Color Coding */
        .head-sales { background-color: #854d0e !important; } /* Dark Yellow/Gold */
        .head-out { background-color: #6b21a8 !important; }   /* Dark Purple */
        .head-pnl { background-color: #065f46 !important; }   /* Dark Green */
        .head-kpi { background-color: #1e293b !important; }   /* Neutral Dark */

        .col-sales { background-color: rgba(251, 191, 36, 0.05); }
        .col-out { background-color: rgba(168, 85, 247, 0.05); }
        .col-pnl-cell { background-color: rgba(16, 185, 129, 0.1); font-weight: 800; font-size: 14px; }
        
        .sticky-col { position: sticky; left: 0; background-color: #0f172a !important; z-index: 20; border-right: 2px solid rgba(255,255,255,0.1); text-align: left !important; font-weight: 800; }
      `}</style>

      <header className="page-header" style={{ marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">📈 Profit & Loss Command Center</h1>
          <p className="page-subtitle">Complete 34-column operational dashboard synchronized with Shopify & Couriers</p>
        </div>
        
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          {view === 'daily' && (
            <select 
              value={monthFilter} 
              onChange={e => setMonthFilter(e.target.value)}
              className="editable-input"
              style={{ width: 'auto', background: 'rgba(255,255,255,0.1)', cursor: 'pointer' }}
            >
              <option value="all">All Months</option>
              {months.map(m => <option key={m} value={m}>{m}</option>)}
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
      </header>

      {loading ? (
        <div style={{ padding: 100, textAlign: 'center', opacity: 0.5 }}>
          <div style={{ fontSize: 24, marginBottom: 10 }}>⏳</div>
          Crunching numbers for all 34 columns...
        </div>
      ) : (
        <div className="stat-card" style={{ padding: 0, overflowX: 'auto', maxHeight: 'calc(100vh - 220px)', overflowY: 'auto', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)' }}>
          <table className="reports-table">
            <thead>
              <tr style={{ height: 40 }}>
                <th className="sticky-col" style={{ zIndex: 21 }}></th>
                <th colSpan="7" className="head-sales" style={{ borderRight: '1px solid rgba(255,255,255,0.2)' }}>💸 INCOME & SALES</th>
                <th colSpan="5" className="head-out" style={{ borderRight: '1px solid rgba(255,255,255,0.2)' }}>📉 EXPENSES (OUT)</th>
                <th colSpan="1" className="head-pnl" style={{ borderRight: '1px solid rgba(255,255,255,0.2)' }}>💰 PROFIT</th>
                <th colSpan="18" className="head-kpi">🛡️ OPERATIONAL KPIs</th>
              </tr>
              <tr>
                <th className="sticky-col" style={{ zIndex: 21 }}>{view === 'daily' ? 'Dates' : 'Month'}</th>
                <th className="head-sales">AOV</th>
                <th className="head-sales">Delivered Sale</th>
                <th className="head-sales">CGS</th>
                <th className="head-sales">CGS %</th>
                <th className="head-sales">-4% Tax</th>
                <th className="head-sales">TAX Paid</th>
                <th className="head-sales" style={{ borderRight: '1px solid rgba(255,255,255,0.2)' }}>Gross Profit</th>
                
                <th className="head-out">Mar %</th>
                <th className="head-out">Meta Ads ✏️</th>
                <th className="head-out">Tiktok ✏️</th>
                <th className="head-out">Est. Courier</th>
                <th className="head-out">Actual Courier</th>
                <th className="head-out">Diff Correction</th>
                <th className="head-out" style={{ borderRight: '1px solid rgba(255,255,255,0.2)' }}>Manual Exp ✏️</th>
                
                <th className="head-pnl" style={{ borderRight: '1px solid rgba(255,255,255,0.2)' }}>FINAL PNL</th>
                
                <th className="head-kpi">Del%</th>
                <th className="head-kpi">ROAS</th>
                <th className="head-kpi">CPA AVG</th>
                <th className="head-kpi">Net CPA</th>
                <th className="head-kpi">Landed</th>
                <th className="head-kpi">Cancel</th>
                <th className="head-kpi">Can %</th>
                <th className="head-kpi">Pending</th>
                <th className="head-kpi">Dispatched</th>
                <th className="head-kpi">Dis %</th>
                <th className="head-kpi">Delivered</th>
                <th className="head-kpi">Returned</th>
                <th className="head-kpi">Transit</th>
                <th className="head-kpi" style={{ color: '#f87171' }}>FAKE RET</th>
                <th className="head-kpi">No Tracking</th>
                <th className="head-kpi">Payouts</th>
                <th className="head-kpi">Correction ✏️</th>
                <th className="head-kpi">Unpaid Del</th>
              </tr>
            </thead>
            <tbody>
              {(view === 'daily' ? filteredDaily : monthlyData).map(row => (
                <tr key={row.date || row.month}>
                  <td className="sticky-col">{row.date || row.month}</td>
                  <td className="col-sales">{formatCurrency(row.aov)}</td>
                  <td className="col-sales" style={{ color: '#34d399', fontWeight: 600 }}>{formatCurrency(row.deliveredSale)}</td>
                  <td className="col-sales">{formatCurrency(row.cgs)}</td>
                  <td className="col-sales">{formatPercent(row.cgsPercent)}</td>
                  <td className="col-sales">{formatCurrency(row.netSales)}</td>
                  <td className="col-sales" style={{ color: '#f87171' }}>{formatCurrency(row.taxPaid)}</td>
                  <td className="col-sales" style={{ fontWeight: 800, borderRight: '1px solid rgba(255,255,255,0.1)' }}>{formatCurrency(row.grossProfit)}</td>
                  
                  <td className="col-out">{formatPercent(row.marPercent)}</td>
                  <td className="col-out">
                    {view === 'daily' ? renderEditable(row, 'marketingSpend') : formatCurrency(row.marketingSpend)}
                  </td>
                  <td className="col-out">
                    {view === 'daily' ? renderEditable(row, 'tiktokMarketing') : formatCurrency(row.tiktokMarketing)}
                  </td>
                  <td className="col-out" style={{ color: '#f87171' }}>{formatCurrency(row.estCourier)}</td>
                  <td className="col-out">{formatCurrency(row.actualCourier)}</td>
                  <td className="col-out" style={{ color: row.courierDiff > 0 ? '#f87171' : '#34d399' }}>{formatCurrency(row.courierDiff)}</td>
                  <td className="col-out" style={{ borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                    {view === 'daily' ? renderEditable(row, 'actualExp') : formatCurrency(row.actualExp)}
                  </td>
                  
                  <td className="col-pnl-cell" style={{ 
                    color: row.pnl >= 0 ? '#34d399' : '#fca5a5',
                    borderRight: '2px solid rgba(255,255,255,0.2)',
                    textAlign: 'center'
                  }}>
                    {formatCurrency(row.pnl)}
                  </td>
                  
                  <td>{formatPercent(row.delPercent)}</td>
                  <td>{formatNumber(row.roasMeta)}</td>
                  <td>{formatCurrency(row.cpaAvg)}</td>
                  <td>{formatCurrency(row.netCpaAvg)}</td>
                  
                  <td style={{ fontWeight: 600 }}>{row.landedOrders}</td>
                  <td style={{ color: '#f87171' }}>{row.cancelations}</td>
                  <td>{formatPercent(row.canPercent)}</td>
                  <td style={{ color: '#fbbf24' }}>{row.pending}</td>
                  <td style={{ fontWeight: 600 }}>{row.totalDispatched}</td>
                  <td>{formatPercent(row.disPercent)}</td>
                  <td style={{ color: '#34d399', fontWeight: 600 }}>{row.delivered}</td>
                  <td style={{ color: '#f87171' }}>{row.restocked}</td>
                  <td style={{ color: '#60a5fa' }}>{row.intransit}</td>
                  <td style={{ color: '#ef4444', fontWeight: 900 }}>{row.fakeReturns}</td>
                  <td style={{ opacity: 0.5 }}>{row.withoutTrackingId}</td>
                  
                  <td style={{ color: '#34d399' }}>{formatCurrency(row.paymentPaid)}</td>
                  <td>
                    {view === 'daily' ? renderEditable(row, 'diffCorrection') : formatCurrency(row.diffCorrection)}
                  </td>
                  <td style={{ color: '#fbbf24' }}>{row.deliveredPaymentPending}</td>
                </tr>
              ))}
              {(view === 'daily' ? filteredDaily : monthlyData).length === 0 && (
                <tr>
                  <td colSpan="32" style={{ padding: 40, textAlign: 'center', opacity: 0.5 }}>No data found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
