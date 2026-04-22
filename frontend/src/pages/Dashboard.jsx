import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'

export default function Dashboard() {
  const { activeStoreId, activeStore, addToast } = useApp()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!activeStoreId) { setLoading(false); return }
    setLoading(true)
    fetch(`/api/stores/${activeStoreId}/stats`)
      .then(r => r.json())
      .then(data => { setStats(data); setLoading(false) })
      .catch(() => { addToast('Failed to load stats', 'error'); setLoading(false) })
  }, [activeStoreId])

  if (!activeStoreId) {
    return (
      <div className="empty-state animate-fade" style={{ paddingTop: 100 }}>
        <div className="empty-icon">🔌</div>
        <h3>No Store Connected</h3>
        <p>Connect your first Shopify store to get started</p>
        <a href="/connect" className="btn btn-primary mt-8">Connect Store</a>
      </div>
    )
  }

  const kpis = stats ? [
    { label: 'Total Orders', value: stats.total_orders.toLocaleString(), icon: '📦', color: 'blue', sub: 'Historical volume' },
    { label: 'Delivered', value: stats.delivered.toLocaleString(), icon: '✅', color: 'green', sub: `${stats.delivery_rate}% Delivery Rate` },
    { label: 'Returned (RTO)', value: stats.returned.toLocaleString(), icon: '↩️', color: 'red', sub: `${stats.rto_rate}% RTO Rate` },
    { label: 'Active Shipments', value: stats.pending.toLocaleString(), icon: '🚚', color: 'yellow', sub: 'In transit to customers' },
    { label: 'Stuck Orders', value: stats.stuck.toLocaleString(), icon: '⏳', color: 'orange', sub: 'Requires immediate attention' },
    { label: 'Revenue (Paid)', value: `Rs ${parseInt(stats.revenue).toLocaleString()}`, icon: '💰', color: 'purple', sub: 'Confirmed net income' },
  ] : []

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div>
          <h2>Operational Intelligence</h2>
          <p>Real-time analytics for {activeStore?.store_name || activeStore?.shop_domain}</p>
        </div>
      </div>

      {loading ? (
        <div className="loading-overlay"><span className="loading-spinner"></span> Synthesizing data...</div>
      ) : (
        <>
          <div className="kpi-grid">
            {kpis.map(kpi => (
              <div key={kpi.label} className="kpi-card card">
                <div className="kpi-label">{kpi.label}</div>
                <div className="kpi-value text-brand">{kpi.value}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{kpi.sub}</div>
                <div style={{ position: 'absolute', top: 20, right: 20, fontSize: '1.4rem', opacity: 0.2 }}>{kpi.icon}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 24 }}>
            <div className="card">
              <h3 className="mb-8">Operational Shortcuts</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <QuickAction href="/orders" icon="📦" label="All Orders" desc="Browse and search entire database" />
                <QuickAction href="/stuck" icon="⏳" label="Stuck Monitor" desc="Orders with no courier movement" />
                <QuickAction href="/advice" icon="🧠" label="Shipper Advice" desc="Problem deliveries requiring action" />
                <QuickAction href="/watchdog" icon="🐕" label="Watchdog" desc="PostEx rider fraud detection system" />
              </div>
            </div>

            <div className="card">
              <h3 className="mb-8">Efficiency Metrics</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <StatBar label="Delivery Success Rate" value={parseFloat(stats?.delivery_rate || 0)} color="var(--success)" />
                <StatBar label="Return (RTO) Rate" value={parseFloat(stats?.rto_rate || 0)} color="var(--danger)" />
                <StatBar label="Network Utilization" value={stats?.total_orders > 0 ? (stats.pending / stats.total_orders * 100).toFixed(1) : 0} color="var(--info)" />
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
    <a href={href} className="btn-action" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', textDecoration: 'none', transition: 'var(--transition)' }}>
      <span style={{ fontSize: '1.5rem' }}>{icon}</span>
      <div>
        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>{label}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{desc}</div>
      </div>
    </a>
  )
}

function StatBar({ label, value, color }) {
  return (
    <div>
      <div className="flex justify-between mb-4">
        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ fontSize: '0.85rem', fontWeight: 700, color }}>{value}%</span>
      </div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${Math.min(value, 100)}%`, background: color }}></div>
      </div>
    </div>
  )
}
