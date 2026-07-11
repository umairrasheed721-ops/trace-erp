import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import ProfitabilityCharts from '../components/ProfitabilityCharts'
import ApiStatusBanner from '../components/ApiStatusBanner'

const KPI_CONFIG = {
  'Total Orders':    { gradient: 'linear-gradient(135deg,rgba(99,102,241,0.18),rgba(168,85,247,0.12))', border: 'rgba(99,102,241,0.3)',  glow: 'rgba(99,102,241,0.15)',  valueColor: '#818cf8' },
  'Delivered':       { gradient: 'linear-gradient(135deg,rgba(16,185,129,0.18),rgba(52,211,153,0.1))',  border: 'rgba(16,185,129,0.3)',  glow: 'rgba(16,185,129,0.15)',  valueColor: '#34d399' },
  'Returned (RTO)':  { gradient: 'linear-gradient(135deg,rgba(239,68,68,0.18),rgba(248,113,113,0.1))', border: 'rgba(239,68,68,0.3)',   glow: 'rgba(239,68,68,0.15)',   valueColor: '#f87171' },
  'Unbooked':        { gradient: 'linear-gradient(135deg,rgba(168,85,247,0.18),rgba(192,132,252,0.1))',border: 'rgba(168,85,247,0.3)',  glow: 'rgba(168,85,247,0.15)', valueColor: '#c084fc' },
  'In Transit':      { gradient: 'linear-gradient(135deg,rgba(245,158,11,0.18),rgba(251,191,36,0.1))', border: 'rgba(245,158,11,0.3)',  glow: 'rgba(245,158,11,0.15)',  valueColor: '#fbbf24' },
  'Stuck Orders':    { gradient: 'linear-gradient(135deg,rgba(249,115,22,0.18),rgba(251,146,60,0.1))', border: 'rgba(249,115,22,0.3)',  glow: 'rgba(249,115,22,0.15)',  valueColor: '#fb923c' },
  'Revenue (Paid)':  { gradient: 'linear-gradient(135deg,rgba(16,185,129,0.18),rgba(52,211,153,0.1))',  border: 'rgba(16,185,129,0.3)',  glow: 'rgba(16,185,129,0.15)',  valueColor: '#34d399' },
}

const QUICK_ACTIONS = [
  { href: '/search',   icon: '🔍', label: 'Command Center',     desc: 'Advanced search, bulk status & sync',      accent: '#6366f1' },
  { href: '/stuck',    icon: '⏳', label: 'Stuck Orders',        desc: 'Orders with no movement > 48h',            accent: '#f59e0b' },
  { href: '/advice',   icon: '🧠', label: 'Shipper Advice',      desc: 'Take action on problem deliveries',         accent: '#a855f7' },
  { href: '/watchdog', icon: '🐕', label: 'Watchdog Report',     desc: 'PostEx rider fraud detection',             accent: '#ef4444' },
]

export default function Dashboard() {
  const { activeStoreId, activeStore, addToast, user } = useApp()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const handleCardClick = (label) => {
    let status = 'All Statuses'
    let preset = 'All Time'
    if (label === 'Delivered')      status = 'Delivered'
    else if (label === 'Returned (RTO)') status = '[RETURNED]'
    else if (label === 'In Transit')    status = '[ACTIVE PIPELINE]'
    else if (label === 'Unbooked')      status = '[UNBOOKED]'
    else if (label === 'Stuck Orders')  status = '[STUCK PIPELINE]'
    else if (label === 'Total Orders')  status = 'All Statuses'
    else if (label === 'Revenue (Paid)') status = '[PAID]'
    navigate('/search', { state: { status, preset } })
  }

  useEffect(() => {
    if (!activeStoreId) { setLoading(false); return }
    setLoading(true)
    fetch(`/api/stores/${activeStoreId}/stats`)
      .then(r => {
        if (!r.ok) throw new Error('Failed to load stats');
        return r.json();
      })
      .then(data => { setStats(data); setLoading(false) })
      .catch(() => { addToast('Failed to load stats', 'error'); setLoading(false) })
  }, [activeStoreId])

  if (!activeStoreId) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: '60vh', gap: 16, textAlign: 'center'
      }}>
        <div style={{
          width: 80, height: 80, borderRadius: 24,
          background: 'linear-gradient(135deg,rgba(99,102,241,0.2),rgba(168,85,247,0.2))',
          border: '1px solid rgba(99,102,241,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem'
        }}>🔌</div>
        <div>
          <h3 style={{ margin: '0 0 8px', fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)' }}>No Store Connected</h3>
          <p style={{ margin: '0 0 20px', color: 'var(--text-muted)', fontSize: '0.88rem' }}>Connect your first Shopify store to get started</p>
        </div>
        <a href="/connect" style={{
          padding: '11px 24px', borderRadius: 12, textDecoration: 'none',
          background: 'linear-gradient(135deg,#6366f1,#a855f7)',
          color: '#fff', fontWeight: 700, fontSize: '0.9rem',
          boxShadow: '0 4px 16px rgba(99,102,241,0.35)'
        }}>Connect Store →</a>
      </div>
    )
  }

  const kpis = (stats && !stats.error) ? [
    { label: 'Total Orders',   value: (stats.total_orders || 0).toLocaleString(), icon: '📦', sub: 'All time' },
    { label: 'Delivered',      value: (stats.delivered || 0).toLocaleString(),    icon: '✅', sub: `${stats.delivery_rate || 0}% rate` },
    { label: 'Returned (RTO)', value: (stats.returned || 0).toLocaleString(),     icon: '↩️', sub: `${stats.rto_rate || 0}% rate` },
    { label: 'Unbooked',       value: (stats.unbooked || 0).toLocaleString(),     icon: '📝', sub: 'No tracking ID' },
    { label: 'In Transit',     value: (stats.pending || 0).toLocaleString(),      icon: '🚚', sub: 'Active pipeline' },
    { label: 'Stuck Orders',   value: (stats.stuck || 0).toLocaleString(),        icon: '⏳', sub: '> 48 hours' },
    ...(user?.role === 'admin' ? [{ label: 'Revenue (Paid)', value: `Rs ${parseInt(stats.revenue || 0).toLocaleString()}`, icon: '💰', sub: 'Confirmed only' }] : []),
  ] : []

  const getGreeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  return (
    <div>
      <ApiStatusBanner />

      {/* ─── Page Header ─── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                background: 'linear-gradient(135deg,rgba(99,102,241,0.25),rgba(168,85,247,0.2))',
                border: '1px solid rgba(99,102,241,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem'
              }}>🏠</div>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {getGreeting()}{user?.name ? `, ${user.name.split(' ')[0]}` : ''} 👋
                </h2>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {activeStore?.store_name || activeStore?.shop_domain} · {new Date().toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 0', gap: 14 }}>
          <div style={{ width: 40, height: 40, border: '3px solid rgba(99,102,241,0.3)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Loading stats...</div>
        </div>
      ) : (
        <>
          {/* ─── KPI Grid ─── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 14,
            marginBottom: 28
          }}>
            {kpis.map(kpi => {
              const cfg = KPI_CONFIG[kpi.label] || KPI_CONFIG['Total Orders']
              return (
                <div
                  key={kpi.label}
                  onClick={() => handleCardClick(kpi.label)}
                  style={{
                    padding: '18px 18px 16px',
                    borderRadius: 16,
                    background: cfg.gradient,
                    border: `1px solid ${cfg.border}`,
                    cursor: 'pointer',
                    position: 'relative',
                    overflow: 'hidden',
                    transition: 'transform 0.18s, box-shadow 0.18s'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-3px)'
                    e.currentTarget.style.boxShadow = `0 8px 28px ${cfg.glow}`
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'none'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  {/* Icon watermark */}
                  <div style={{
                    position: 'absolute', right: 10, top: 10,
                    fontSize: '2.4rem', opacity: 0.25, pointerEvents: 'none', userSelect: 'none'
                  }}>{kpi.icon}</div>

                  {/* Label */}
                  <div style={{
                    fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: 8
                  }}>{kpi.label}</div>

                  {/* Value */}
                  <div style={{
                    fontSize: '1.75rem', fontWeight: 800, lineHeight: 1,
                    color: cfg.valueColor, marginBottom: 6
                  }}>{kpi.value}</div>

                  {/* Sub */}
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{kpi.sub}</div>

                  {/* Subtle arrow */}
                  <div style={{
                    position: 'absolute', bottom: 12, right: 14,
                    fontSize: '0.7rem', color: cfg.valueColor, opacity: 0.5
                  }}>→</div>
                </div>
              )
            })}
          </div>

          {/* ─── Charts ─── */}
          {user?.role === 'admin' && <ProfitabilityCharts storeId={activeStoreId} />}

          {/* ─── Bottom Row ─── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 8 }}>

            {/* Quick Actions */}
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 16, overflow: 'hidden',
              boxShadow: '0 2px 12px rgba(0,0,0,0.1)'
            }}>
              <div style={{
                padding: '14px 20px', borderBottom: '1px solid var(--border)',
                background: 'linear-gradient(90deg,rgba(99,102,241,0.07) 0%,transparent 100%)',
                display: 'flex', alignItems: 'center', gap: 8
              }}>
                <span style={{ fontSize: '0.95rem' }}>⚡</span>
                <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>Quick Actions</span>
              </div>
              <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {QUICK_ACTIONS.map(a => (
                  <a
                    key={a.href}
                    href={a.href}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 12px', borderRadius: 10, textDecoration: 'none',
                      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                      transition: 'all 0.15s'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = a.accent
                      e.currentTarget.style.background = `${a.accent}12`
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'var(--border)'
                      e.currentTarget.style.background = 'var(--bg-elevated)'
                    }}
                  >
                    <div style={{
                      width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                      background: `${a.accent}18`, border: `1px solid ${a.accent}35`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem'
                    }}>{a.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>{a.label}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 1 }}>{a.desc}</div>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0 }}>→</span>
                  </a>
                ))}
              </div>
            </div>

            {/* Performance Summary */}
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 16, overflow: 'hidden',
              boxShadow: '0 2px 12px rgba(0,0,0,0.1)'
            }}>
              <div style={{
                padding: '14px 20px', borderBottom: '1px solid var(--border)',
                background: 'linear-gradient(90deg,rgba(16,185,129,0.07) 0%,transparent 100%)',
                display: 'flex', alignItems: 'center', gap: 8
              }}>
                <span style={{ fontSize: '0.95rem' }}>📊</span>
                <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>Performance Summary</span>
              </div>
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
                <EnhancedStatBar
                  label="Delivery Rate"
                  value={parseFloat(stats?.delivery_rate || 0)}
                  color="#34d399"
                  bg="rgba(16,185,129,0.1)"
                  icon="✅"
                />
                <EnhancedStatBar
                  label="RTO Rate"
                  value={parseFloat(stats?.rto_rate || 0)}
                  color="#f87171"
                  bg="rgba(239,68,68,0.1)"
                  icon="↩️"
                />
                <EnhancedStatBar
                  label="In Transit"
                  value={stats?.total_orders > 0 ? parseFloat((stats.pending / stats.total_orders * 100).toFixed(1)) : 0}
                  color="#fbbf24"
                  bg="rgba(245,158,11,0.1)"
                  icon="🚚"
                />

                {/* Delivery vs RTO visual */}
                <div style={{ marginTop: 4 }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>Delivered vs Returned</div>
                  <div style={{ display: 'flex', height: 8, borderRadius: 100, overflow: 'hidden', gap: 2 }}>
                    <div style={{
                      flex: parseFloat(stats?.delivery_rate || 0),
                      background: 'linear-gradient(90deg, #34d399, #10b981)',
                      borderRadius: '100px 0 0 100px', minWidth: 4
                    }} />
                    <div style={{
                      flex: parseFloat(stats?.rto_rate || 0),
                      background: 'linear-gradient(90deg, #f87171, #ef4444)',
                      borderRadius: '0 100px 100px 0', minWidth: 4
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
                    <span style={{ fontSize: '0.65rem', color: '#34d399', fontWeight: 700 }}>✅ {stats?.delivery_rate}% delivered</span>
                    <span style={{ fontSize: '0.65rem', color: '#f87171', fontWeight: 700 }}>↩️ {stats?.rto_rate}% returned</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function EnhancedStatBar({ label, value, color, bg, icon }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '0.82rem' }}>{icon}</span>
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</span>
        </div>
        <span style={{
          fontSize: '0.78rem', fontWeight: 800, color,
          background: bg, padding: '2px 8px', borderRadius: 20
        }}>{value}%</span>
      </div>
      <div style={{ height: 6, background: 'var(--bg-active)', borderRadius: 100, overflow: 'hidden' }}>
        <div style={{
          width: `${Math.min(value, 100)}%`, height: '100%', borderRadius: 100,
          background: `linear-gradient(90deg, ${color}, ${color}bb)`,
          transition: '0.9s cubic-bezier(0.4,0,0.2,1)'
        }} />
      </div>
    </div>
  )
}
