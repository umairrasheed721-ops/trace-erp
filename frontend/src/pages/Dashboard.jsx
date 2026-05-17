import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import ProfitabilityCharts from '../components/ProfitabilityCharts'
import ApiStatusBanner from '../components/ApiStatusBanner'

export default function Dashboard() {
  const { activeStoreId, activeStore, addToast, user } = useApp()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const handleCardClick = (label) => {
    let status = 'All Statuses'
    let preset = 'All Time'
    
    if (label === 'Delivered') status = 'Delivered'
    else if (label === 'Returned (RTO)') status = '[RETURNED]'
    else if (label === 'In Transit') status = '[ACTIVE PIPELINE]'
    else if (label === 'Unbooked') status = '[UNBOOKED]'
    else if (label === 'Stuck Orders') status = '[STUCK PIPELINE]'
    else if (label === 'Total Orders') status = 'All Statuses'
    else if (label === 'Revenue (Paid)') status = '[PAID]'
    
    navigate('/search', { state: { status, preset } })
  }

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
    { label: 'Unbooked', value: stats.unbooked.toLocaleString(), icon: '📝', color: 'purple', sub: 'No Tracking ID' },
    { label: 'In Transit', value: stats.pending.toLocaleString(), icon: '🚚', color: 'yellow', sub: 'Active Pipeline' },
    { label: 'Stuck Orders', value: stats.stuck.toLocaleString(), icon: '⏳', color: 'orange', sub: '> 48 hours' },
    ...(user?.role === 'admin' ? [{ label: 'Revenue (Paid)', value: `Rs ${parseInt(stats.revenue).toLocaleString()}`, icon: '💰', color: 'purple', sub: 'Confirmed only' }] : []),
  ] : []

  return (
    <div>
      <ApiStatusBanner />
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
              <div 
                key={kpi.label} 
                className={`kpi-card ${kpi.color}`} 
                onClick={() => handleCardClick(kpi.label)}
                style={{ cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 12px rgba(0,0,0,0.1)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}
              >
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
                <QuickAction href="/search" icon="🔍" label="Command Center" desc="Advanced search, bulk status & sync" />
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

          {/* Phase 3: Customer Success & WhatsApp Simulation Panel */}
          <CustomerSuccessSimulator storeId={activeStoreId} addToast={addToast} />
        </>
      )}
    </div>
  )
}

function CustomerSuccessSimulator({ storeId, addToast }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [customAddress, setCustomAddress] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState(null);

  const fetchOrders = () => {
    if (!storeId) return;
    setLoading(true);
    fetch(`/api/customer-success/orders/${storeId}`)
      .then(r => r.json())
      .then(data => { setOrders(data.orders || []); setLoading(false); })
      .catch(() => { setLoading(false); });
  };

  useEffect(() => { fetchOrders(); }, [storeId]);

  const handleSimulate = (orderId, action, customAddr = '') => {
    fetch('/api/customer-success/simulate-trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId, action, custom_address: customAddr })
    })
      .then(r => r.json())
      .then(res => {
        if (res.error) throw new Error(res.error);
        addToast(res.message, 'success');
        fetchOrders();
      })
      .catch(err => addToast(err.message || 'Simulation failed', 'error'));
  };

  const getWaBadge = (status) => {
    if (status === 'Verified') return <span style={{ background: '#10b98120', color: '#10b981', padding: '2px 8px', borderRadius: 12, fontSize: '0.7rem', fontWeight: 600 }}>🟢 Verified</span>;
    if (status === 'Address_Updated') return <span style={{ background: '#3b82f620', color: '#3b82f6', padding: '2px 8px', borderRadius: 12, fontSize: '0.7rem', fontWeight: 600 }}>✏️ Curated</span>;
    if (status === 'Cancelled') return <span style={{ background: '#ef444420', color: '#ef4444', padding: '2px 8px', borderRadius: 12, fontSize: '0.7rem', fontWeight: 600 }}>🔴 Cancelled</span>;
    return <span style={{ background: '#f59e0b20', color: '#f59e0b', padding: '2px 8px', borderRadius: 12, fontSize: '0.7rem', fontWeight: 600 }}>🟡 Pending</span>;
  };

  return (
    <div className="card" style={{ marginTop: 24, border: '1px solid #6366f140', background: 'linear-gradient(145deg, var(--bg-elevated), #0f172a)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>💬 Customer Success & WhatsApp Simulator</span>
            <span style={{ fontSize: '0.7rem', background: '#6366f1', color: '#fff', padding: '2px 8px', borderRadius: 12 }}>Phase 3 Live</span>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>Simulate automated WhatsApp verification button clicks and preview the public Tracking Portal rescue flow.</p>
        </div>
        <button onClick={fetchOrders} className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '6px 12px' }}>🔄 Refresh List</button>
      </div>

      {loading ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Loading recent orders...</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-active)' }}>
                <th>Order</th>
                <th>Customer</th>
                <th>Address</th>
                <th>WhatsApp Status</th>
                <th>Courier Status</th>
                <th>Simulation Actions</th>
                <th>Public Tracking Portal</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ fontWeight: 600 }}>#{o.ref_number || o.shopify_order_id}</td>
                  <td>{o.customer_name} ({o.phone})</td>
                  <td style={{ maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={o.address}>{o.address}, {o.city}</td>
                  <td>{getWaBadge(o.wa_verification_status)}</td>
                  <td>
                    <span style={{ background: o.delivery_status === 'Attempted' ? '#ef444420' : 'var(--bg-active)', color: o.delivery_status === 'Attempted' ? '#ef4444' : 'var(--text-secondary)', padding: '2px 6px', borderRadius: 4, fontSize: '0.7rem' }}>
                      {o.delivery_status || 'Pending'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button onClick={() => handleSimulate(o.id, 'SEND_VERIFICATION')} className="btn" style={{ background: '#3b82f620', color: '#3b82f6', border: '1px solid #3b82f640', fontSize: '0.7rem', padding: '4px 8px' }}>Send WA</button>
                      <button onClick={() => handleSimulate(o.id, 'SIMULATE_CONFIRM')} className="btn" style={{ background: '#10b98120', color: '#10b981', border: '1px solid #10b98140', fontSize: '0.7rem', padding: '4px 8px' }}>Confirm</button>
                      <button onClick={() => handleSimulate(o.id, 'SIMULATE_CANCEL')} className="btn" style={{ background: '#ef444420', color: '#ef4444', border: '1px solid #ef444440', fontSize: '0.7rem', padding: '4px 8px' }}>Cancel</button>
                      <button onClick={() => handleSimulate(o.id, 'SIMULATE_ATTEMPTED')} className="btn" style={{ background: '#f59e0b20', color: '#f59e0b', border: '1px solid #f59e0b40', fontSize: '0.7rem', padding: '4px 8px' }}>Fail Attempt</button>
                    </div>
                  </td>
                  <td>
                    <a href={`/track/${o.tracking_slug || 'tr_mock_slug'}`} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ fontSize: '0.7rem', padding: '4px 10px', textDecoration: 'none', display: 'inline-block' }}>
                      🌐 Open Portal
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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

