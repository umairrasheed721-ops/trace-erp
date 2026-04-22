import { useState, useEffect, useCallback } from 'react'
import { useApp } from '../context/AppContext'

const DATE_PRESETS = ['Last 7 Days', 'Last 30 Days', 'This Month', 'Last Month', 'All Time']

export default function CourierIntelligence() {
  const { activeStoreId } = useApp()
  const [data, setData] = useState({ comparison: [], cities: [] })
  const [loading, setLoading] = useState(true)
  const [preset, setPreset] = useState('Last 30 Days')

  const fetchData = useCallback(async () => {
    if (!activeStoreId) return
    setLoading(true)

    let start = '', end = ''
    const now = new Date()
    if (preset === 'Last 7 Days') {
      const d = new Date(); d.setDate(d.getDate() - 7)
      start = d.toISOString().split('T')[0]; end = now.toISOString().split('T')[0]
    } else if (preset === 'Last 30 Days') {
      const d = new Date(); d.setDate(d.getDate() - 30)
      start = d.toISOString().split('T')[0]; end = now.toISOString().split('T')[0]
    } else if (preset === 'This Month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      end = now.toISOString().split('T')[0]
    } else if (preset === 'Last Month') {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0]
      end = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0]
    }

    try {
      const res = await fetch(`/api/reports/courier-comparison?store_id=${activeStoreId}&startDate=${start}&endDate=${end}`)
      const d = await res.json()
      // Filter out empty courier names
      d.comparison = d.comparison.filter(c => c.courier_name && c.courier_name.trim() !== '')
      setData(d)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [activeStoreId, preset])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div className="page-container intelligence-page" style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 32px' }}>
      
      {/* Header Section */}
      <div className="intelligence-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 40, flexWrap: 'wrap', gap: 20 }}>
        <div style={{ flex: 1, minWidth: 300 }}>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 900, letterSpacing: '-0.8px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: '2.5rem' }}>🧠</span> Courier Intelligence
          </h1>
          <p style={{ opacity: 0.5, fontSize: '1rem', fontWeight: 500 }}>Competitive benchmarking and regional logistics auditing</p>
        </div>
        
        <div style={{ 
          display: 'flex', 
          alignItems: 'center',
          gap: 12, 
          background: 'rgba(255,255,255,0.03)', 
          padding: '8px 16px', 
          borderRadius: 16, 
          border: '1px solid var(--border)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 800, opacity: 0.4 }}>TIMEFRAME</span>
            <select 
              className="form-select" 
              value={preset} 
              onChange={e => setPreset(e.target.value)} 
              style={{ width: 140, background: 'none', border: 'none', fontWeight: 800, fontSize: '0.9rem', color: 'var(--brand)', cursor: 'pointer' }}
            >
              {DATE_PRESETS.map(p => <option key={p} style={{ background: '#111', color: '#fff' }}>{p}</option>)}
            </select>
          </div>
          <div style={{ width: 1, height: 24, background: 'var(--border)' }}></div>
          <button 
            className="btn btn-primary" 
            onClick={fetchData} 
            style={{ borderRadius: 10, padding: '8px 20px', fontWeight: 800, fontSize: '0.8rem', boxShadow: '0 4px 10px var(--brand-dim)' }}
          >
            🔄 Sync Data
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ height: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <div className="loading-spinner" style={{ width: 40, height: 40, borderWidth: 4 }}></div>
          <p style={{ fontWeight: 600, opacity: 0.5 }}>Analyzing logistics performance...</p>
        </div>
      ) : (
        <>
          {/* Main Comparison Grid - FORCED 3 COLUMNS ON DESKTOP */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(3, 1fr)', 
            gap: 24, 
            marginBottom: 48,
            // Responsive fallback
            gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))' 
          }}>
            {data.comparison.sort((a,b) => b.total_orders - a.total_orders).map(c => {
              const totalFinished = c.delivered + c.returned
              const delRate = totalFinished > 0 ? ((c.delivered / totalFinished) * 100).toFixed(1) : 0
              const retRate = totalFinished > 0 ? ((c.returned / totalFinished) * 100).toFixed(1) : 0
              const performanceScore = Math.round(parseFloat(delRate) - (parseFloat(retRate) * 0.5))
              
              return (
                <div key={c.courier_name} className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg-elevated)', transition: 'transform 0.2s' }}>
                  
                  {/* Card Header */}
                  <div style={{ padding: '24px 24px 16px', background: 'rgba(255,255,255,0.01)', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: '#fff' }}>{c.courier_name}</h3>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.4, marginTop: 4 }}>{c.total_orders.toLocaleString()} TOTAL SHIPMENTS</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '1.8rem', fontWeight: 900, color: performanceScore > 60 ? 'var(--green)' : 'var(--orange)', lineHeight: 1 }}>{performanceScore}</div>
                        <div style={{ fontSize: '0.6rem', fontWeight: 800, opacity: 0.4 }}>PERF. SCORE</div>
                      </div>
                    </div>
                  </div>

                  <div style={{ padding: 24 }}>
                    {/* Primary Bars */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 24 }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: 800, opacity: 0.6 }}>SUCCESS RATE</span>
                          <span style={{ fontSize: '0.9rem', fontWeight: 900, color: 'var(--green)' }}>{delRate}%</span>
                        </div>
                        <div style={{ height: 12, background: 'rgba(255,255,255,0.04)', borderRadius: 6, overflow: 'hidden' }}>
                          <div style={{ width: `${delRate}%`, height: '100%', background: 'linear-gradient(90deg, #10b981 0%, #34d399 100%)', borderRadius: 6 }}></div>
                        </div>
                      </div>

                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: 800, opacity: 0.6 }}>RETURN RATE</span>
                          <span style={{ fontSize: '0.9rem', fontWeight: 900, color: parseFloat(retRate) > 25 ? 'var(--red)' : '#fff' }}>{retRate}%</span>
                        </div>
                        <div style={{ height: 6, background: 'rgba(255,255,255,0.04)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${retRate}%`, height: '100%', background: parseFloat(retRate) > 25 ? 'var(--red)' : 'rgba(255,255,255,0.2)', borderRadius: 3 }}></div>
                        </div>
                      </div>
                    </div>

                    {/* Meta Stats Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.03)' }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 800, opacity: 0.3, textTransform: 'uppercase', marginBottom: 4 }}>Avg. Fee</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>Rs {Math.round(c.avg_fee || 0).toLocaleString()}</div>
                      </div>
                      <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.03)' }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 800, opacity: 0.3, textTransform: 'uppercase', marginBottom: 4 }}>Avg. Transit</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{c.avg_days_to_deliver ? c.avg_days_to_deliver.toFixed(1) : '—'} <span style={{ fontSize: '0.75rem', opacity: 0.4 }}>days</span></div>
                      </div>
                    </div>
                    
                    <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.03)', display: 'flex', justifyContent: 'center' }}>
                       <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand)', display: 'flex', alignItems: 'center', gap: 6 }}>
                         📦 {c.in_transit} Orders Currently in Pipeline
                       </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Strategic Table Section */}
          <div className="card" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>📍 Regional Strategic Playbook</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', opacity: 0.5 }}>Recommended logistics provider per major delivery hub</p>
              </div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: 8 }}>
                Min. Sample Size: 3 Orders
              </div>
            </div>
            
            <div className="table-wrapper">
              <table style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.01)' }}>
                    <th style={{ padding: '16px 32px', fontSize: '0.75rem', textTransform: 'uppercase', opacity: 0.6 }}>City Hub</th>
                    <th style={{ padding: '16px 32px', fontSize: '0.75rem', textTransform: 'uppercase', opacity: 0.6 }}>Service Provider</th>
                    <th style={{ padding: '16px 32px', fontSize: '0.75rem', textTransform: 'uppercase', opacity: 0.6, textAlign: 'center' }}>Success Rate</th>
                    <th style={{ padding: '16px 32px', fontSize: '0.75rem', textTransform: 'uppercase', opacity: 0.6 }}>Market Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(
                    data.cities.reduce((acc, curr) => {
                      if (!acc[curr.city]) acc[curr.city] = []
                      acc[curr.city].push(curr)
                      return acc
                    }, {})
                  ).sort(([a],[b]) => a.localeCompare(b)).map(([city, options]) => {
                    const sorted = options.sort((a,b) => (b.delivered/b.total) - (a.delivered/a.total))
                    const best = sorted[0]
                    const rate = ((best.delivered / best.total) * 100).toFixed(1)
                    
                    return (
                      <tr key={city} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <td style={{ padding: '20px 32px', fontWeight: 800, fontSize: '1rem' }}>{city}</td>
                        <td style={{ padding: '20px 32px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--brand)' }}></div>
                            <span style={{ fontWeight: 700 }}>{best.courier_name}</span>
                          </div>
                        </td>
                        <td style={{ padding: '20px 32px', textAlign: 'center' }}>
                          <span style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--green)' }}>{rate}%</span>
                          <div style={{ fontSize: '0.65rem', opacity: 0.4, fontWeight: 700 }}>{best.total} SAMPLES</div>
                        </td>
                        <td style={{ padding: '20px 32px' }}>
                          {parseFloat(rate) >= 90 ? (
                            <span style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '6px 12px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 900 }}>🚀 HIGH RELIABILITY</span>
                          ) : parseFloat(rate) >= 75 ? (
                            <span style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', padding: '6px 12px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 900 }}>⭐ RECOMMENDED</span>
                          ) : (
                            <span style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', padding: '6px 12px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 900 }}>⚠️ VOLATILE</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
