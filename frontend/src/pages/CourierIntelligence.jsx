import { useState, useEffect, useCallback } from 'react'
import { useApp } from '../context/AppContext'

const DATE_PRESETS = ['Last 7 Days', 'Last 30 Days', 'This Month', 'Last Month', 'All Time', 'Custom']

export default function CourierIntelligence() {
  const { activeStoreId } = useApp()
  const [data, setData] = useState({ comparison: [], cities: [] })
  const [loading, setLoading] = useState(true)
  const [preset, setPreset] = useState('Last 30 Days')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

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
    } else if (preset === 'Custom') {
      start = customStart
      end = customEnd
    }

    try {
      const res = await fetch(`/api/reports/courier-comparison?store_id=${activeStoreId}&startDate=${start}&endDate=${end}`)
      const d = await res.json()
      
      // 🛡️ Data Sanitization: Filter out numeric-only names or short trash data
      d.comparison = d.comparison.filter(c => 
        c.courier_name && 
        /[a-zA-Z]/.test(c.courier_name) && 
        c.courier_name.length > 2 &&
        c.total_orders > 0
      )
      
      setData(d)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [activeStoreId, preset, customStart, customEnd])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div className="page-container" style={{ padding: '30px', maxWidth: '1400px', margin: '0 auto' }}>
      
      {/* 🚀 ELITE HEADER */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '40px',
        padding: '20px 30px',
        background: 'linear-gradient(90deg, rgba(124, 58, 237, 0.1) 0%, rgba(0,0,0,0) 100%)',
        borderRadius: '20px',
        borderLeft: '4px solid var(--brand)'
      }}>
        <div>
          <h1 style={{ fontSize: '2.4rem', fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-1px' }}>
            Logistics Intelligence
          </h1>
          <p style={{ opacity: 0.5, fontWeight: 600, fontSize: '1rem', marginTop: '4px' }}>
            Global performance auditing and regional optimization
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          {preset === 'Custom' && (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input 
                type="date" 
                value={customStart} 
                onChange={e => setCustomStart(e.target.value)}
                style={{ 
                  background: 'rgba(255,255,255,0.05)', 
                  border: '1px solid var(--border)', 
                  borderRadius: '12px', 
                  padding: '12px 15px', 
                  color: '#fff',
                  colorScheme: 'dark'
                }}
              />
              <span style={{ opacity: 0.5, fontWeight: 700 }}>to</span>
              <input 
                type="date" 
                value={customEnd} 
                onChange={e => setCustomEnd(e.target.value)}
                style={{ 
                  background: 'rgba(255,255,255,0.05)', 
                  border: '1px solid var(--border)', 
                  borderRadius: '12px', 
                  padding: '12px 15px', 
                  color: '#fff',
                  colorScheme: 'dark'
                }}
              />
            </div>
          )}
          <div style={{ position: 'relative' }}>
            <select 
              value={preset} 
              onChange={e => setPreset(e.target.value)}
              style={{ 
                appearance: 'none',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '12px 40px 12px 20px',
                color: '#fff',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}
            >
              {DATE_PRESETS.map(p => <option key={p} style={{ background: '#111' }}>{p}</option>)}
            </select>
            <span style={{ position: 'absolute', right: '15px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5, pointerEvents: 'none' }}>▼</span>
          </div>
          <button 
            onClick={fetchData}
            style={{ 
              background: 'var(--brand)', 
              color: '#fff', 
              border: 'none', 
              padding: '12px 25px', 
              borderRadius: '12px', 
              fontWeight: 800, 
              cursor: 'pointer',
              boxShadow: '0 8px 20px rgba(124, 58, 237, 0.3)'
            }}
          >
            🔄 Sync Report
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ height: '50vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="loading-spinner" style={{ width: '50px', height: '50px' }}></div>
        </div>
      ) : (
        <>
          {/* 🏆 COURIER SCORECARDS */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', 
            gap: '30px', 
            marginBottom: '60px' 
          }}>
            {data.comparison.sort((a,b) => b.total_orders - a.total_orders).map(c => {
              const totalDispatched = c.total_orders;
              const delRate = totalDispatched > 0 ? ((c.delivered / totalDispatched) * 100).toFixed(1) : 0
              const retRate = totalDispatched > 0 ? ((c.returned / totalDispatched) * 100).toFixed(1) : 0
              const firstAttemptRate = c.delivered > 0 ? (((c.first_attempt_delivered || 0) / c.delivered) * 100).toFixed(1) : 0;
              const score = Math.round(parseFloat(delRate) - (parseFloat(retRate) * 0.4))

              return (
                <div key={c.courier_name} className="card" style={{ 
                  padding: '30px', 
                  borderRadius: '24px', 
                  background: 'rgba(255,255,255,0.02)', 
                  border: '1px solid rgba(255,255,255,0.05)',
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  {/* Subtle Background Glow */}
                  <div style={{ 
                    position: 'absolute', top: '-50px', right: '-50px', width: '150px', height: '150px', 
                    background: score > 70 ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)', 
                    filter: 'blur(50px)', borderRadius: '50%' 
                  }}></div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '25px' }}>
                    <div>
                      <h2 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#fff', margin: 0 }}>{c.courier_name}</h2>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, opacity: 0.4, letterSpacing: '1px' }}>
                        {c.total_orders} TOTAL DISPATCHES
                      </span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '2.5rem', fontWeight: 900, color: score > 70 ? 'var(--green)' : 'var(--orange)', lineHeight: 0.9 }}>
                        {score}
                      </div>
                      <span style={{ fontSize: '0.6rem', fontWeight: 800, opacity: 0.4 }}>PERF. INDEX</span>
                    </div>
                  </div>

                  {/* Visual Gauges */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '30px' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 800, opacity: 0.6 }}>DELIVERY SUCCESS</span>
                        <span style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--green)' }}>{delRate}%</span>
                      </div>
                      <div style={{ height: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', overflow: 'hidden' }}>
                        <div style={{ width: `${delRate}%`, height: '100%', background: 'var(--green)', borderRadius: '10px', boxShadow: '0 0 15px rgba(16, 185, 129, 0.3)' }}></div>
                      </div>
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 800, opacity: 0.6 }}>RETURN RATE</span>
                        <span style={{ fontSize: '1rem', fontWeight: 900, color: parseFloat(retRate) > 20 ? 'var(--red)' : '#fff' }}>{retRate}%</span>
                      </div>
                      <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', overflow: 'hidden' }}>
                        <div style={{ width: `${retRate}%`, height: '100%', background: parseFloat(retRate) > 20 ? 'var(--red)' : 'rgba(255,255,255,0.2)', borderRadius: '6px' }}></div>
                      </div>
                    </div>
                  </div>

                  {/* Secondary Metrics */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                    <div style={{ padding: '15px', borderRadius: '16px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.02)' }}>
                      <div style={{ fontSize: '0.65rem', fontWeight: 800, opacity: 0.3, marginBottom: '5px' }}>AVG. FEE</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 900 }}>Rs {Math.round(c.avg_fee || 0)}</div>
                    </div>
                    <div style={{ padding: '15px', borderRadius: '16px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.02)' }}>
                      <div style={{ fontSize: '0.65rem', fontWeight: 800, opacity: 0.3, marginBottom: '5px' }}>DELIVERY TIME</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 900 }}>{c.avg_days_to_deliver ? c.avg_days_to_deliver.toFixed(1) : '—'} <span style={{ fontSize: '0.8rem', opacity: 0.3 }}>d</span></div>
                    </div>
                    <div style={{ padding: '15px', borderRadius: '16px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.02)' }}>
                      <div style={{ fontSize: '0.65rem', fontWeight: 800, opacity: 0.3, marginBottom: '5px' }}>1ST ATTEMPT %</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 900, color: firstAttemptRate > 80 ? 'var(--green)' : 'var(--orange)' }}>{firstAttemptRate}%</div>
                    </div>
                  </div>

                  <div style={{ marginTop: '25px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.8rem', fontWeight: 700, color: 'var(--brand)' }}>
                    <span style={{ fontSize: '1.2rem' }}>📦</span> {c.in_transit} Active Shipments in Route
                  </div>
                </div>
              )
            })}
          </div>

          {/* 📍 REGIONAL STRATEGY */}
          <div style={{ borderRadius: '30px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', padding: '40px' }}>
            <div style={{ marginBottom: '30px' }}>
              <h2 style={{ fontSize: '1.6rem', fontWeight: 900, margin: 0 }}>City-Specific Strategy</h2>
              <p style={{ opacity: 0.4, fontWeight: 600 }}>Dominant carrier recommendations by regional delivery success</p>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 15px' }}>
                <thead>
                  <tr style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>
                    <th style={{ padding: '0 20px', textAlign: 'left' }}>Regional Hub</th>
                    <th style={{ padding: '0 20px', textAlign: 'left' }}>Primary Partner</th>
                    <th style={{ padding: '0 20px', textAlign: 'center' }}>Success Rate</th>
                    <th style={{ padding: '0 20px', textAlign: 'left' }}>Strategic Verdict</th>
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
                      <tr key={city} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '15px' }}>
                        <td style={{ padding: '25px 20px', fontWeight: 900, fontSize: '1.1rem', borderRadius: '15px 0 0 15px' }}>{city}</td>
                        <td style={{ padding: '25px 20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ width: '35px', height: '35px', borderRadius: '10px', background: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.8rem' }}>
                              {best.courier_name[0]}
                            </div>
                            <span style={{ fontWeight: 800, fontSize: '1rem' }}>{best.courier_name}</span>
                          </div>
                        </td>
                        <td style={{ padding: '25px 20px', textAlign: 'center' }}>
                          <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--green)' }}>{rate}%</div>
                          <div style={{ fontSize: '0.6rem', opacity: 0.3, fontWeight: 800 }}>FROM {best.total} PARCELS</div>
                        </td>
                        <td style={{ padding: '25px 20px', borderRadius: '0 15px 15px 0' }}>
                          {parseFloat(rate) >= 90 ? (
                            <span style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '10px 20px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 900 }}>🚀 ELITE RELIABILITY</span>
                          ) : parseFloat(rate) >= 70 ? (
                            <span style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', padding: '10px 20px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 900 }}>👑 MARKET LEADER</span>
                          ) : (
                            <span style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', padding: '10px 20px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 900 }}>⚡ VOLATILE HUB</span>
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
