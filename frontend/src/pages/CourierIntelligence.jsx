import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'

export default function CourierIntelligence() {
  const { activeStoreId } = useApp()
  const [data, setData] = useState({ comparison: [], cities: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!activeStoreId) return
    setLoading(true)
    fetch(`/api/reports/courier-comparison?store_id=${activeStoreId}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [activeStoreId])

  if (loading) return <div className="loading-overlay"><span className="loading-spinner"></span> Analyzing Carriers...</div>

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2>📊 Courier Intelligence</h2>
          <p>Head-to-head performance analysis (PostEx vs LCS vs TCS)</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {data.comparison.map(c => {
          const delRate = c.total_orders > 0 ? ((c.delivered / c.total_orders) * 100).toFixed(1) : 0
          const retRate = c.total_orders > 0 ? ((c.returned / c.total_orders) * 100).toFixed(1) : 0
          
          return (
            <div key={c.courier_name} className="card p-6 border-t-4" style={{ borderColor: delRate > 80 ? 'var(--green)' : 'var(--orange)' }}>
              <div className="flex justify-between items-center mb-4">
                <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{c.courier_name}</h3>
                <span className="badge" style={{ background: 'var(--bg-elevated)' }}>{c.total_orders} Orders</span>
              </div>
              
              <div className="flex flex-col gap-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Delivery Success</span>
                    <span style={{ fontWeight: 700, color: 'var(--green)' }}>{delRate}%</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--bg-elevated)', borderRadius: 3 }}>
                    <div style={{ width: `${delRate}%`, height: '100%', background: 'var(--green)', borderRadius: 3 }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Return Rate</span>
                    <span style={{ fontWeight: 700, color: 'var(--red)' }}>{retRate}%</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--bg-elevated)', borderRadius: 3 }}>
                    <div style={{ width: `${retRate}%`, height: '100%', background: 'var(--red)', borderRadius: 3 }}></div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div className="p-3 bg-dim rounded-lg">
                    <div className="text-xs opacity-60">Avg. Cost</div>
                    <div className="font-bold">Rs {Math.round(c.avg_fee || 0)}</div>
                  </div>
                  <div className="p-3 bg-dim rounded-lg">
                    <div className="text-xs opacity-60">Avg. Days</div>
                    <div className="font-bold">{c.avg_days_to_deliver ? c.avg_days_to_deliver.toFixed(1) : '—'} d</div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="card">
        <div className="card-header">
          <h3 style={{ margin: 0 }}>📍 City Performance (Strategic Guide)</h3>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>City</th>
                <th>Courier</th>
                <th>Total Orders</th>
                <th>Delivered</th>
                <th>Success Rate</th>
                <th>Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {data.cities.map((city, idx) => {
                const rate = ((city.delivered / city.total) * 100).toFixed(1)
                const isBest = !data.cities.some(c => c.city === city.city && (c.delivered/c.total) > (city.delivered/city.total))
                
                return (
                  <tr key={idx} style={isBest ? { background: 'rgba(52, 211, 153, 0.05)' } : {}}>
                    <td style={{ fontWeight: 600 }}>{city.city}</td>
                    <td>{city.courier_name}</td>
                    <td>{city.total}</td>
                    <td>{city.delivered}</td>
                    <td style={{ fontWeight: 700, color: rate > 80 ? 'var(--green)' : 'var(--orange)' }}>{rate}%</td>
                    <td>
                      {isBest ? (
                        <span className="badge green">✨ Top Performer</span>
                      ) : (
                        <span className="opacity-50">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
