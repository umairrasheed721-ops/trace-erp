import { useState, useEffect, useCallback } from 'react'
import { useApp } from '../context/AppContext'

const DATE_PRESETS = ['Last 7 Days', 'Last 30 Days', 'This Month', 'Last Month', 'All Time']

export default function CourierIntelligence() {
  const { activeStoreId } = useApp()
  const [data, setData] = useState({ comparison: [], cities: [] })
  const [loading, setLoading] = useState(true)
  const [preset, setPreset] = useState('Last 30 Days')
  const [customRange, setCustomRange] = useState({ start: '', end: '' })

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
      setData(d)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [activeStoreId, preset])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div className="page-container">
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>🧠 Courier Intelligence</h2>
          <p style={{ opacity: 0.6 }}>Carrier battleground & strategic performance audit</p>
        </div>
        <div className="flex gap-2">
          <select className="form-select" value={preset} onChange={e => setPreset(e.target.value)} style={{ width: 160 }}>
            {DATE_PRESETS.map(p => <option key={p}>{p}</option>)}
          </select>
          <button className="btn btn-primary" onClick={fetchData}>🔄 Refresh</button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center" style={{ height: '40vh' }}>
          <div className="loading-spinner"></div>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
            {data.comparison.sort((a,b) => b.total_orders - a.total_orders).map(c => {
              const delRate = c.total_orders > 0 ? ((c.delivered / (c.delivered + c.returned)) * 100).toFixed(1) : 0
              const retRate = c.total_orders > 0 ? ((c.returned / (c.delivered + c.returned)) * 100).toFixed(1) : 0
              const isHighReturn = parseFloat(retRate) > 25

              return (
                <div key={c.courier_name} className="card p-0 overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                  <div className="p-5" style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)' }}>
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>{c.courier_name}</h3>
                        <div style={{ fontSize: '0.75rem', opacity: 0.5, marginTop: 2 }}>{c.total_orders.toLocaleString()} Total Shipments</div>
                      </div>
                      <div className="badge" style={{ background: 'var(--brand-dim)', color: 'var(--brand)', fontWeight: 700 }}>
                        {c.in_transit} Live
                      </div>
                    </div>
                  </div>

                  <div className="p-5">
                    <div className="flex flex-col gap-6">
                      {/* Success Bar */}
                      <div>
                        <div className="flex justify-between items-end mb-2">
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.7 }}>DELIVERY SUCCESS RATE</span>
                          <span style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--green)' }}>{delRate}%</span>
                        </div>
                        <div style={{ height: 10, background: 'rgba(255,255,255,0.05)', borderRadius: 5, overflow: 'hidden' }}>
                          <div style={{ width: `${delRate}%`, height: '100%', background: 'linear-gradient(90deg, var(--green-dim), var(--green))', borderRadius: 5 }}></div>
                        </div>
                      </div>

                      {/* Return Rate */}
                      <div>
                        <div className="flex justify-between items-end mb-2">
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.7 }}>RETURN RATE</span>
                          <span style={{ fontSize: '1.1rem', fontWeight: 800, color: isHighReturn ? 'var(--red)' : 'var(--text-main)' }}>{retRate}%</span>
                        </div>
                        <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${retRate}%`, height: '100%', background: isHighReturn ? 'var(--red)' : 'var(--text-muted)', borderRadius: 3 }}></div>
                        </div>
                      </div>

                      {/* Stats Grid */}
                      <div className="grid grid-cols-2 gap-3 mt-2">
                        <div className="p-4 rounded-xl" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.03)' }}>
                          <div style={{ fontSize: '0.65rem', opacity: 0.5, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Avg. Cost</div>
                          <div style={{ fontSize: '1rem', fontWeight: 700 }}>Rs {Math.round(c.avg_fee || 0).toLocaleString()}</div>
                        </div>
                        <div className="p-4 rounded-xl" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.03)' }}>
                          <div style={{ fontSize: '0.65rem', opacity: 0.5, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Delivery Speed</div>
                          <div style={{ fontSize: '1rem', fontWeight: 700 }}>{c.avg_days_to_deliver ? c.avg_days_to_deliver.toFixed(1) : '—'} <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>days</span></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* City Strategy Table */}
          <div className="card">
            <div className="p-5 border-b" style={{ borderColor: 'var(--border)' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>📍 City Strategy Guide</h3>
              <p style={{ fontSize: '0.8rem', opacity: 0.5, margin: '4px 0 0 0' }}>Highest performing courier per city (min. 3 orders)</p>
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>City</th>
                    <th>Courier</th>
                    <th style={{ textAlign: 'center' }}>Samples</th>
                    <th style={{ textAlign: 'center' }}>Delivered</th>
                    <th style={{ textAlign: 'center' }}>Success Rate</th>
                    <th>Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(
                    data.cities.reduce((acc, curr) => {
                      if (!acc[curr.city]) acc[curr.city] = []
                      acc[curr.city].push(curr)
                      return acc
                    }, {})
                  ).map(([city, options]) => {
                    // Find the best one for this city
                    const sorted = options.sort((a,b) => (b.delivered/b.total) - (a.delivered/a.total))
                    
                    return sorted.map((item, i) => {
                      const rate = ((item.delivered / item.total) * 100).toFixed(1)
                      const isBest = i === 0
                      
                      return (
                        <tr key={`${city}-${item.courier_name}`} style={isBest ? { background: 'rgba(52, 211, 153, 0.03)' } : { opacity: 0.6 }}>
                          <td style={{ fontWeight: i === 0 ? 700 : 400 }}>{i === 0 ? city : ''}</td>
                          <td>
                            <div className="flex items-center gap-2">
                              <span style={{ fontWeight: 600 }}>{item.courier_name}</span>
                              {isBest && <span style={{ fontSize: '1rem' }}>🏆</span>}
                            </div>
                          </td>
                          <td style={{ textAlign: 'center' }}>{item.total}</td>
                          <td style={{ textAlign: 'center' }}>{item.delivered}</td>
                          <td style={{ textAlign: 'center', fontWeight: 800, color: rate > 80 ? 'var(--green)' : 'var(--text-main)' }}>{rate}%</td>
                          <td>
                            {isBest ? (
                              <span className="badge green" style={{ fontSize: '0.65rem' }}>BEST CHOICE</span>
                            ) : (
                              <span style={{ fontSize: '0.65rem', opacity: 0.5 }}>Sub-optimal</span>
                            )}
                          </td>
                        </tr>
                      )
                    })
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
