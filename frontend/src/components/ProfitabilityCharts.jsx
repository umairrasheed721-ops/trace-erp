import React, { useState, useEffect, useMemo } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, BarChart, Bar, Cell
} from 'recharts';

const ProfitabilityCharts = ({ storeId }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    fetchData();
  }, [storeId, days]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('trace_token');
      const res = await fetch(`/api/reports/profitability-chart-data?store_id=${storeId}&days=${days}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error('Chart Data Error:', e);
    } finally {
      setLoading(false);
    }
  };

  const processedData = useMemo(() => {
    if (!data || data.length === 0) return [];
    // Filter out today if it has no revenue yet to avoid sharp drops
    const today = new Date().toISOString().split('T')[0];
    return data.filter(d => d.date !== today || d.revenue > 0);
  }, [data]);

  if (loading) return <div className="loading-shimmer" style={{ height: 400 }}>Loading Charts...</div>;

  const hasRoasData = processedData.some(d => d.roi > 0);

  return (
    <div className="profitability-dashboard" style={{ marginTop: 20 }}>
      <div className="chart-controls" style={{ marginBottom: 20, display: 'flex', gap: 10 }}>
         {[7, 14, 30, 90].map(d => (
           <button 
             key={d} 
             onClick={() => setDays(d)}
             className={days === d ? 'active' : ''}
             style={{
               padding: '8px 16px',
               borderRadius: 8,
               border: '1px solid var(--border-color)',
               background: days === d ? 'var(--primary-color)' : 'transparent',
               color: days === d ? '#fff' : 'inherit',
               cursor: 'pointer'
             }}
           >
             Last {d} Days
           </button>
         ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Main Performance Chart */}
        <div className="card" style={{ padding: 20, borderRadius: 12, background: 'var(--card-bg)', border: '1px solid var(--border-color)', minWidth: 0 }}>
          <h3 style={{ marginBottom: 15, fontSize: 16 }}>Revenue vs Net Profit</h3>
          <div style={{ height: 350 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={processedData}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(str) => str.split('-').slice(1).join('/')}
                  stroke="var(--text-muted)"
                  fontSize={12}
                />
                <YAxis stroke="var(--text-muted)" fontSize={12} />
                <Tooltip 
                  contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 8 }}
                  itemStyle={{ fontSize: 13 }}
                />
                <Legend iconType="circle" />
                <Area 
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="#4f46e5" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorRev)" 
                  name="Total Sale"
                />
                <Area 
                  type="monotone" 
                  dataKey="netProfit" 
                  stroke="#10b981" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorProfit)" 
                  name="Net Profit"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Ad Spend vs ROI */}
        <div className="card" style={{ padding: 20, borderRadius: 12, background: 'var(--card-bg)', border: '1px solid var(--border-color)', minWidth: 0 }}>
          <h3 style={{ marginBottom: 15, fontSize: 16 }}>Marketing ROI (ROAS)</h3>
          <div style={{ height: 350, position: 'relative' }}>
            {!hasRoasData && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-surface)', zIndex: 100, borderRadius: 8, flexDirection: 'column', gap: 10, border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '2.5rem' }}>📈</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>No Marketing ROI data found</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ROAS will appear when ad spend is recorded</div>
              </div>
            )}
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={processedData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(str) => str.split('-').slice(1).join('/')}
                  stroke="var(--text-muted)"
                  fontSize={12}
                />
                <YAxis stroke="var(--text-muted)" fontSize={12} />
                <Tooltip 
                  contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 8 }}
                />
                <Legend />
                <Bar dataKey="roi" name="ROI / ROAS" radius={[4, 4, 0, 0]}>
                  {processedData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.roi > 3 ? '#10b981' : entry.roi > 1 ? '#f59e0b' : '#ef4444'} />
                  ))}
                </Bar>
                <Line type="monotone" dataKey="adSpend" stroke="#6366f1" strokeWidth={2} dot={false} name="Ad Spend" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfitabilityCharts;
