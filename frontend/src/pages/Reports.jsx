import { useState, useEffect } from 'react';
import { useApp, useToast } from '../App';

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(amount || 0);
}

function formatPercent(value) {
  return (value || 0).toFixed(2) + '%';
}

export default function Reports() {
  const { activeStoreId } = useApp();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [dailyData, setDailyData] = useState([]);
  const [view, setView] = useState('daily'); // 'daily' or 'monthly'

  useEffect(() => {
    if (!activeStoreId) return;
    fetchData();
  }, [activeStoreId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/daily?store_id=${activeStoreId}`);
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
        // Recalculate PNL
        updated.pnl = updated.grossProfit - updated.taxPaid - updated.marketingSpend - updated.estCourier - updated.actualExp;
        if (field === 'marketingSpend') {
          updated.marPercent = updated.deliveredSale > 0 ? (updated.marketingSpend / updated.deliveredSale) * 100 : 0;
        }
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
        actual_exp: field === 'actualExp' ? numValue : row.actualExp
      };
      
      const res = await fetch('/api/reports/metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Failed to save');
      toast('Saved successfully', 'success', 2000);
    } catch (e) {
      toast('Error saving: ' + e.message, 'error');
      fetchData(); // Revert on error
    }
  };

  // Group data for monthly view
  const monthlyData = Object.values(dailyData.reduce((acc, row) => {
    const month = row.date.substring(0, 7); // YYYY-MM
    if (!acc[month]) {
      acc[month] = {
        month,
        totalOrders: 0,
        deliveredSale: 0,
        cgs: 0,
        marketingSpend: 0,
        estCourier: 0,
        actualExp: 0,
        landedOrders: 0,
        cancelations: 0,
        totalDeliveredOrders: 0 // Track for AOV
      };
    }
    
    // We need to back-calculate total delivered orders if possible, or just sum sales.
    // We didn't send total_delivered_orders from backend in the result object directly, 
    // but AOV = deliveredSale / total_delivered_orders. So total_delivered_orders = deliveredSale / AOV.
    const delOrders = row.aov > 0 ? Math.round(row.deliveredSale / row.aov) : 0;
    
    acc[month].totalOrders += row.landedOrders;
    acc[month].deliveredSale += row.deliveredSale;
    acc[month].cgs += row.cgs;
    acc[month].marketingSpend += row.marketingSpend;
    acc[month].estCourier += row.estCourier;
    acc[month].actualExp += row.actualExp;
    acc[month].landedOrders += row.landedOrders;
    acc[month].cancelations += row.cancelations;
    acc[month].totalDeliveredOrders += delOrders;
    return acc;
  }, {})).map(m => {
    const cgsPercent = m.deliveredSale > 0 ? (m.cgs / m.deliveredSale) * 100 : 0;
    const taxPaid = m.deliveredSale * 0.04;
    const grossProfit = m.deliveredSale - m.cgs;
    const marPercent = m.deliveredSale > 0 ? (m.marketingSpend / m.deliveredSale) * 100 : 0;
    const pnl = grossProfit - taxPaid - m.marketingSpend - m.estCourier - m.actualExp;
    const canPercent = m.landedOrders > 0 ? (m.cancelations / m.landedOrders) * 100 : 0;
    const delPercent = m.landedOrders > 0 ? (m.totalDeliveredOrders / m.landedOrders) * 100 : 0;
    const aov = m.totalDeliveredOrders > 0 ? (m.deliveredSale / m.totalDeliveredOrders) : 0;

    return {
      ...m,
      cgsPercent,
      taxPaid,
      grossProfit,
      marPercent,
      pnl,
      canPercent,
      delPercent,
      aov
    };
  }).sort((a, b) => b.month.localeCompare(a.month));


  return (
    <div className="page-container">
      <header className="page-header" style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">📈 Profit & Loss Reports</h1>
          <p className="page-subtitle">Track your daily and monthly financial metrics</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button 
            className={`btn ${view === 'daily' ? 'btn-primary' : ''}`}
            onClick={() => setView('daily')}
            style={{ backgroundColor: view === 'daily' ? '#4f46e5' : 'rgba(255,255,255,0.1)' }}
          >
            Daily (PNL)
          </button>
          <button 
            className={`btn ${view === 'monthly' ? 'btn-primary' : ''}`}
            onClick={() => setView('monthly')}
            style={{ backgroundColor: view === 'monthly' ? '#4f46e5' : 'rgba(255,255,255,0.1)' }}
          >
            Month Vise
          </button>
        </div>
      </header>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', opacity: 0.5 }}>Loading reports data...</div>
      ) : (
        <div className="stat-card" style={{ overflowX: 'auto', padding: 0 }}>
          {view === 'daily' ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'right' }}>
              <thead>
                <tr style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left' }}>Date</th>
                  <th style={{ padding: '12px 16px' }}>AOV</th>
                  <th style={{ padding: '12px 16px' }}>Delivered Sale</th>
                  <th style={{ padding: '12px 16px' }}>CGS</th>
                  <th style={{ padding: '12px 16px' }}>CGS %</th>
                  <th style={{ padding: '12px 16px' }}>-4% Tax</th>
                  <th style={{ padding: '12px 16px' }}>TAX Paid</th>
                  <th style={{ padding: '12px 16px' }}>Gross Profit</th>
                  <th style={{ padding: '12px 16px' }}>Mar %</th>
                  <th style={{ padding: '12px 16px', backgroundColor: 'rgba(255,255,255,0.08)' }}>Marketing Spend ✏️</th>
                  <th style={{ padding: '12px 16px' }}>Est Courier</th>
                  <th style={{ padding: '12px 16px', backgroundColor: 'rgba(255,255,255,0.08)' }}>Actual Exp ✏️</th>
                  <th style={{ padding: '12px 16px' }}>PNL</th>
                </tr>
              </thead>
              <tbody>
                {dailyData.map(row => (
                  <tr key={row.date} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s' }}>
                    <td style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 'bold' }}>{row.date}</td>
                    <td style={{ padding: '12px 16px' }}>{formatCurrency(row.aov)}</td>
                    <td style={{ padding: '12px 16px', color: '#34d399' }}>{formatCurrency(row.deliveredSale)}</td>
                    <td style={{ padding: '12px 16px', color: '#f87171' }}>{formatCurrency(row.cgs)}</td>
                    <td style={{ padding: '12px 16px' }}>{formatPercent(row.cgsPercent)}</td>
                    <td style={{ padding: '12px 16px' }}>{formatCurrency(row.netSales)}</td>
                    <td style={{ padding: '12px 16px', color: '#f87171' }}>{formatCurrency(row.taxPaid)}</td>
                    <td style={{ padding: '12px 16px', fontWeight: 'bold' }}>{formatCurrency(row.grossProfit)}</td>
                    <td style={{ padding: '12px 16px' }}>{formatPercent(row.marPercent)}</td>
                    <td style={{ padding: '8px 16px', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                      <input 
                        type="number" 
                        value={row.marketingSpend || ''}
                        onChange={(e) => handleMetricChange(row.date, 'marketingSpend', e.target.value)}
                        placeholder="0"
                        style={{ width: 80, padding: 6, textAlign: 'right', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 4 }}
                      />
                    </td>
                    <td style={{ padding: '12px 16px', color: '#f87171' }}>{formatCurrency(row.estCourier)}</td>
                    <td style={{ padding: '8px 16px', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                      <input 
                        type="number" 
                        value={row.actualExp || ''}
                        onChange={(e) => handleMetricChange(row.date, 'actualExp', e.target.value)}
                        placeholder="0"
                        style={{ width: 80, padding: 6, textAlign: 'right', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 4 }}
                      />
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 'bold', color: row.pnl >= 0 ? '#34d399' : '#f87171', fontSize: 14 }}>
                      {formatCurrency(row.pnl)}
                    </td>
                  </tr>
                ))}
                {dailyData.length === 0 && (
                  <tr><td colSpan="13" style={{ padding: 30, textAlign: 'center', opacity: 0.5 }}>No data found for selected store.</td></tr>
                )}
              </tbody>
            </table>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'right' }}>
              <thead>
                <tr style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left' }}>Month</th>
                  <th style={{ padding: '12px 16px' }}>AOV</th>
                  <th style={{ padding: '12px 16px' }}>Delivered Sale</th>
                  <th style={{ padding: '12px 16px' }}>CGS %</th>
                  <th style={{ padding: '12px 16px' }}>Mar %</th>
                  <th style={{ padding: '12px 16px' }}>Marketing Spend</th>
                  <th style={{ padding: '12px 16px' }}>Est Courier</th>
                  <th style={{ padding: '12px 16px' }}>Actual Exp</th>
                  <th style={{ padding: '12px 16px' }}>PNL</th>
                  <th style={{ padding: '12px 16px' }}>Del %</th>
                  <th style={{ padding: '12px 16px' }}>Landed Orders</th>
                  <th style={{ padding: '12px 16px' }}>Cancelations</th>
                  <th style={{ padding: '12px 16px' }}>Can %</th>
                </tr>
              </thead>
              <tbody>
                {monthlyData.map(row => (
                  <tr key={row.month} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 'bold' }}>{row.month}</td>
                    <td style={{ padding: '12px 16px' }}>{formatCurrency(row.aov)}</td>
                    <td style={{ padding: '12px 16px', color: '#34d399' }}>{formatCurrency(row.deliveredSale)}</td>
                    <td style={{ padding: '12px 16px' }}>{formatPercent(row.cgsPercent)}</td>
                    <td style={{ padding: '12px 16px' }}>{formatPercent(row.marPercent)}</td>
                    <td style={{ padding: '12px 16px', color: '#f87171' }}>{formatCurrency(row.marketingSpend)}</td>
                    <td style={{ padding: '12px 16px', color: '#f87171' }}>{formatCurrency(row.estCourier)}</td>
                    <td style={{ padding: '12px 16px', color: '#f87171' }}>{formatCurrency(row.actualExp)}</td>
                    <td style={{ padding: '12px 16px', fontWeight: 'bold', color: row.pnl >= 0 ? '#34d399' : '#f87171', fontSize: 14 }}>
                      {formatCurrency(row.pnl)}
                    </td>
                    <td style={{ padding: '12px 16px' }}>{formatPercent(row.delPercent)}</td>
                    <td style={{ padding: '12px 16px' }}>{row.landedOrders}</td>
                    <td style={{ padding: '12px 16px', color: '#f87171' }}>{row.cancelations}</td>
                    <td style={{ padding: '12px 16px' }}>{formatPercent(row.canPercent)}</td>
                  </tr>
                ))}
                {monthlyData.length === 0 && (
                  <tr><td colSpan="13" style={{ padding: 30, textAlign: 'center', opacity: 0.5 }}>No data found for selected store.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
