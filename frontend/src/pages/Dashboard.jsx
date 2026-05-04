import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import ProfitabilityCharts from '../components/ProfitabilityCharts'

export default function Dashboard() {
  const { activeStoreId, activeStore, addToast, user } = useApp()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!activeStoreId) { setLoading(false); return }
    setLoading(true)
    const token = localStorage.getItem('trace_token');
    fetch(`/api/stores/${activeStoreId}/stats`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => { setStats(data); setLoading(false) })
      .catch(() => { addToast('Failed to load stats', 'error'); setLoading(false) })
  }, [activeStoreId])

  if (!activeStoreId) {
    return (
      <div className="empty-state" style={{ paddingTop: 100 }}>
        <div className="empty-icon">🔌</div>
        <h3>No Store Connected</h3>
        <p>Connect your first Shopify store to get started</p>
        <a href="/connect" className="btn btn-primary mt-4">Connect Store</a>
      </div>
    )
  }

  const kpis = stats ? [
    { label: 'Total Orders', value: stats.total_orders.toLocaleString(), icon: '📦', color: 'blue', sub: 'All time' },
    { label: 'Delivered', value: stats.delivered.toLocaleString(), icon: '✅', color: 'green', sub: `${stats.delivery_rate}% rate` },
    { label: 'Returned (RTO)', value: stats.returned.toLocaleString(), icon: '↩️', color: 'red', sub: `${stats.rto_rate}% rate` },
    { label: 'In Transit', value: stats.pending.toLocaleString(), icon: '🚚', color: 'yellow', sub: 'Active orders' },
    { label: 'Stuck Orders', value: stats.stuck.toLocaleString(), icon: '⏳', color: 'orange', sub: '> 48 hours' },
    ...(user?.role === 'admin' ? [{ label: 'Revenue (Paid)', value: `Rs ${parseInt(stats.revenue).toLocaleString()}`, icon: '💰', color: 'purple', sub: 'Confirmed only' }] : []),
  ] : []

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Dashboard</h2>
          <p>{activeStore?.shop_domain}</p>
        </div>
      </div>

      {loading ? (
        <div className="loading-overlay"><span className="loading-spinner"></span> Loading stats...</div>
      ) : (
        <>
          <div className="kpi-grid">
            {kpis.map(kpi => (
              <div key={kpi.label} className={`kpi-card ${kpi.color}`}>
                <div className="kpi-label">{kpi.label}</div>
                <div className="kpi-value">{kpi.value}</div>
                <div className="kpi-sub">{kpi.sub}</div>
                <div className="kpi-icon">{kpi.icon}</div>
              </div>
            ))}
          </div>

          {user?.role === 'admin' && <ProfitabilityCharts storeId={activeStoreId} />}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="card">
              <div className="card-title">Quick Actions</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <QuickAction href="/orders" icon="📦" label="View All Orders" desc="Browse, search and filter orders" />
                <QuickAction href="/stuck" icon="⏳" label="Review Stuck Orders" desc="Orders with no movement > 48h" />
                <QuickAction href="/advice" icon="🧠" label="Shipper Advice" desc="Take action on problem deliveries" />
                <QuickAction href="/watchdog" icon="🐕" label="Watchdog Report" desc="PostEx rider fraud detection" />
              </div>
            </div>

            <div className="card">
              <div className="card-title">Performance Summary</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
                <StatBar label="Delivery Rate" value={parseFloat(stats?.delivery_rate || 0)} color="var(--green)" />
                <StatBar label="RTO Rate" value={parseFloat(stats?.rto_rate || 0)} color="var(--red)" />
                <StatBar label="In Transit" value={stats?.total_orders > 0 ? (stats.pending / stats.total_orders * 100).toFixed(1) : 0} color="var(--yellow)" />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function QuickAction({ href, icon, label, desc }) {
  return (
    <a href={href} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', textDecoration: 'none', transition: 'var(--transition)' }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--brand)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      <span style={{ fontSize: '1.3rem' }}>{icon}</span>
      <div>
        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{desc}</div>
      </div>
    </a>
  )
}

function StatBar({ label, value, color }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color }}>{value}%</span>
      </div>
      <div style={{ height: 5, background: 'var(--bg-active)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(value, 100)}%`, height: '100%', background: color, borderRadius: 4, transition: '0.8s ease' }}></div>
      </div>
    </div>
  )
}
