import { useState, useEffect, useCallback } from 'react'
import { useApp } from '../context/AppContext'

const DATE_PRESETS = ['Last 30 Days', 'Last 7 Days', 'This Month', 'Last Month', 'All Time', 'Custom']

const COURIER_COLORS = {
  PostEx: { bg: '#6366f1', glow: 'rgba(99,102,241,0.15)', light: 'rgba(99,102,241,0.1)' },
  InstaLogistics: { bg: '#10b981', glow: 'rgba(16,185,129,0.15)', light: 'rgba(16,185,129,0.1)' },
  Leopards: { bg: '#f59e0b', glow: 'rgba(245,158,11,0.15)', light: 'rgba(245,158,11,0.1)' },
  TCS: { bg: '#ef4444', glow: 'rgba(239,68,68,0.15)', light: 'rgba(239,68,68,0.1)' },
  'Self Delivery': { bg: '#a855f7', glow: 'rgba(168,85,247,0.15)', light: 'rgba(168,85,247,0.1)' },
  Unknown: { bg: '#6b7280', glow: 'rgba(107,114,128,0.15)', light: 'rgba(107,114,128,0.1)' },
}
const getCourier = (name) => COURIER_COLORS[name] || COURIER_COLORS.Unknown

const fmt = (n) => (n || 0).toLocaleString('en-PK')
const fmtK = (n) => {
  n = n || 0
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(Math.round(n))
}

const SectionHeader = ({ icon, title, subtitle }) => (
  <div style={{ marginBottom: '28px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
      <div style={{
        width: '46px', height: '46px', borderRadius: '14px',
        background: 'var(--brand)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: '1.3rem', flexShrink: 0,
        boxShadow: '0 8px 20px var(--brand-glow)'
      }}>{icon}</div>
      <div>
        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>{title}</h2>
        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600, opacity: 0.6 }}>{subtitle}</p>
      </div>
    </div>
  </div>
)

const Section = ({ children, style = {} }) => (
  <div style={{
    background: 'var(--bg-surface)', border: '1px solid var(--border)',
    borderRadius: '28px', padding: '36px', marginBottom: '32px', ...style
  }}>
    {children}
  </div>
)

const StatPill = ({ label, value, color, sub }) => (
  <div style={{
    padding: '18px 22px', borderRadius: '18px', background: 'var(--bg-elevated)',
    border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '4px'
  }}>
    <span style={{ fontSize: '0.65rem', fontWeight: 800, opacity: 0.35, letterSpacing: '1px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</span>
    <span style={{ fontSize: '1.4rem', fontWeight: 900, color: color || 'var(--text-primary)', lineHeight: 1.1 }}>{value}</span>
    {sub && <span style={{ fontSize: '0.7rem', opacity: 0.4, color: 'var(--text-muted)', fontWeight: 600 }}>{sub}</span>}
  </div>
)

const Bar = ({ pct, color }) => (
  <div style={{ height: '8px', background: 'var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
    <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', background: color || 'var(--brand)', borderRadius: '8px', transition: 'width 0.6s ease' }} />
  </div>
)

const Badge = ({ text, type }) => {
  const styles = {
    success: { bg: 'rgba(16,185,129,0.1)', color: '#10b981' },
    warn: { bg: 'rgba(245,158,11,0.1)', color: '#f59e0b' },
    danger: { bg: 'rgba(239,68,68,0.1)', color: '#ef4444' },
    info: { bg: 'rgba(99,102,241,0.1)', color: '#6366f1' },
  }
  const s = styles[type] || styles.info
  return (
    <span style={{ background: s.bg, color: s.color, padding: '5px 12px', borderRadius: '8px', fontSize: '0.7rem', fontWeight: 900 }}>{text}</span>
  )
}

export default function CourierIntelligence() {
  const { activeStoreId } = useApp()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [preset, setPreset] = useState('Last 30 Days')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [activeTab, setActiveTab] = useState(0)
  const [weeklyFilter, setWeeklyFilter] = useState('All')

  const fetchData = useCallback(async () => {
    if (!activeStoreId) return
    setLoading(true)

    let startDate = '', endDate = ''
    const now = new Date()
    if (preset === 'Last 7 Days') {
      const d = new Date(); d.setDate(d.getDate() - 7)
      startDate = d.toISOString().split('T')[0]; endDate = now.toISOString().split('T')[0]
    } else if (preset === 'Last 30 Days') {
      const d = new Date(); d.setDate(d.getDate() - 30)
      startDate = d.toISOString().split('T')[0]; endDate = now.toISOString().split('T')[0]
    } else if (preset === 'This Month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      endDate = now.toISOString().split('T')[0]
    } else if (preset === 'Last Month') {
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0]
      endDate = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0]
    } else if (preset === 'Custom') {
      startDate = customStart; endDate = customEnd
    }

    try {
      const url = `/api/reports/logistics-intelligence?store_id=${activeStoreId}${startDate ? `&startDate=${startDate}&endDate=${endDate}` : ''}`
      const res = await fetch(url)
      const d = await res.json()
      setData(d)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [activeStoreId, preset, customStart, customEnd])

  useEffect(() => { fetchData() }, [fetchData])

  const TABS = [
    { label: '💰 Cost & Profit', icon: '💰' },
    { label: '📉 Return Losses', icon: '📉' },
    { label: '🚨 Dead Zones', icon: '🚨' },
    { label: '📦 Live Exposure', icon: '📦' },
    { label: '📈 Weekly Trend', icon: '📈' },
    { label: '❌ Failed Attempts', icon: '❌' },
    { label: '🚚 Shipping P&L', icon: '🚚' },
    { label: '⏱️ City Speed', icon: '⏱️' },
    { label: '🥧 Courier Mix', icon: '🥧' },
  ]

  return (
    <div className="page-container" style={{ padding: '30px', maxWidth: '1400px', margin: '0 auto' }}>

      {/* ── HEADER ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '36px', padding: '24px 30px',
        background: 'linear-gradient(90deg, var(--brand-glow) 0%, rgba(0,0,0,0) 100%)',
        borderRadius: '22px', borderLeft: '4px solid var(--brand)'
      }}>
        <div>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-1px' }}>
            Logistics Intelligence
          </h1>
          <p style={{ opacity: 0.45, fontWeight: 600, fontSize: '0.95rem', marginTop: '4px', color: 'var(--text-secondary)' }}>
            Offline courier auditor — 10 performance dimensions, zero API calls
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          {preset === 'Custom' && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '12px', padding: '10px 14px', color: 'var(--text-primary)', fontSize: '0.85rem' }} />
              <span style={{ opacity: 0.4, fontWeight: 700, color: 'var(--text-muted)' }}>→</span>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '12px', padding: '10px 14px', color: 'var(--text-primary)', fontSize: '0.85rem' }} />
            </div>
          )}
          <div style={{ position: 'relative' }}>
            <select value={preset} onChange={e => setPreset(e.target.value)} style={{
              appearance: 'none', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: '12px', padding: '10px 36px 10px 18px', color: 'var(--text-primary)',
              fontWeight: 700, cursor: 'pointer', fontSize: '0.88rem'
            }}>
              {DATE_PRESETS.map(p => <option key={p} style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>{p}</option>)}
            </select>
            <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4, pointerEvents: 'none', color: 'var(--text-muted)' }}>▼</span>
          </div>
          <button onClick={fetchData} style={{
            background: 'var(--brand)', color: '#fff', border: 'none',
            padding: '10px 22px', borderRadius: '12px', fontWeight: 800, cursor: 'pointer',
            boxShadow: '0 6px 18px var(--brand-glow)', fontSize: '0.88rem'
          }}>🔄 Refresh</button>
        </div>
      </div>

      {loading ? (
        <div style={{ height: '50vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '20px' }}>
          <div className="loading-spinner" style={{ width: '48px', height: '48px' }} />
          <p style={{ opacity: 0.4, fontWeight: 700, color: 'var(--text-muted)' }}>Auditing courier performance…</p>
        </div>
      ) : !data ? null : (
        <>
          {/* ── SECTION 1 + 3: Cost-Per-Delivery + Profit per Courier (always visible at top) ── */}
          <Section>
            <SectionHeader icon="💰" title="Cost-Per-Delivery & Profit by Courier"
              subtitle="Avg courier fee paid on delivered orders vs net profit generated" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
              {data.costPerDelivery.map(c => {
                const clr = getCourier(c.courier_name)
                const profit = data.profitByCourier.find(p => p.courier_name === c.courier_name)
                const delRate = c.total_orders > 0 ? ((c.delivered / c.total_orders) * 100).toFixed(1) : 0
                return (
                  <div key={c.courier_name} style={{
                    padding: '28px', borderRadius: '22px', background: 'var(--bg-elevated)',
                    border: `1px solid ${clr.bg}33`, position: 'relative', overflow: 'hidden'
                  }}>
                    <div style={{ position: 'absolute', top: '-30px', right: '-30px', width: '120px', height: '120px', background: clr.glow, borderRadius: '50%', filter: 'blur(40px)' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                      <div>
                        <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: clr.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#fff', fontSize: '1rem', marginBottom: '10px' }}>{c.courier_name[0]}</div>
                        <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900, color: 'var(--text-primary)' }}>{c.courier_name}</h3>
                        <span style={{ fontSize: '0.75rem', opacity: 0.4, fontWeight: 700, color: 'var(--text-muted)' }}>{fmt(c.total_orders)} TOTAL ORDERS</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '2rem', fontWeight: 900, color: clr.bg }}>Rs {fmtK(c.avg_fee_delivered)}</div>
                        <div style={{ fontSize: '0.65rem', opacity: 0.4, fontWeight: 800, color: 'var(--text-muted)' }}>AVG FEE/DELIVERY</div>
                      </div>
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 800, opacity: 0.5, color: 'var(--text-secondary)' }}>DELIVERY RATE</span>
                        <span style={{ fontSize: '0.9rem', fontWeight: 900, color: parseFloat(delRate) > 70 ? '#10b981' : '#f59e0b' }}>{delRate}%</span>
                      </div>
                      <Bar pct={delRate} color={parseFloat(delRate) > 70 ? '#10b981' : '#f59e0b'} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                      <StatPill label="Delivered" value={fmt(c.delivered)} color="#10b981" />
                      <StatPill label="Returned" value={fmt(c.returned)} color="#ef4444" />
                      <StatPill label="Total Fee" value={`Rs ${fmtK(c.total_fee_paid)}`} />
                    </div>

                    {profit && (
                      <div style={{ marginTop: '16px', padding: '16px', borderRadius: '14px', background: profit.net_profit > 0 ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${profit.net_profit > 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 800, opacity: 0.5, color: 'var(--text-muted)' }}>NET PROFIT (delivered orders)</span>
                          <span style={{ fontWeight: 900, fontSize: '1.1rem', color: profit.net_profit > 0 ? '#10b981' : '#ef4444' }}>Rs {fmtK(profit.net_profit)}</span>
                        </div>
                        <div style={{ fontSize: '0.72rem', opacity: 0.4, marginTop: '4px', color: 'var(--text-muted)' }}>Rs {fmt(profit.avg_profit_per_order)} avg per order</div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </Section>

          {/* ── TAB NAV ── */}
          <div style={{
            display: 'flex', gap: '8px', marginBottom: '28px', overflowX: 'auto',
            padding: '4px', background: 'var(--bg-elevated)', borderRadius: '18px', border: '1px solid var(--border)'
          }}>
            {TABS.map((t, i) => (
              <button key={i} onClick={() => setActiveTab(i)} style={{
                padding: '10px 18px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                fontWeight: 800, fontSize: '0.82rem', whiteSpace: 'nowrap', transition: 'all 0.2s',
                background: activeTab === i ? 'var(--brand)' : 'transparent',
                color: activeTab === i ? '#fff' : 'var(--text-muted)',
                boxShadow: activeTab === i ? '0 4px 14px var(--brand-glow)' : 'none'
              }}>{t.label}</button>
            ))}
          </div>

           {activeTab === 0 && (
            <Section>
              <SectionHeader icon="📊" title="Profit Breakdown Table" subtitle="Revenue, courier cost, and average delivery/return costs per carrier" />
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 10px' }}>
                  <thead>
                    <tr style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                      {['Courier', 'Total Landed', 'Booked', 'In Transit', 'Delivered', 'Returned', 'Revenue', 'Courier Cost', 'Avg Del. Cost (w/tax)', 'Avg Ret. Cost', 'Avg/Order'].map(h => (
                        <th key={h} style={{ padding: '0 16px', textAlign: h === 'Courier' ? 'left' : 'right' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.profitByCourier.map(c => {
                      const clr = getCourier(c.courier_name)
                      return (
                        <tr key={c.courier_name} style={{ background: 'var(--bg-elevated)' }}>
                          <td style={{ padding: '18px 16px', borderRadius: '12px 0 0 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: clr.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: '0.8rem' }}>{c.courier_name[0]}</div>
                              <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{c.courier_name}</span>
                            </div>
                          </td>
                          <td style={{ padding: '18px 16px', textAlign: 'right', fontWeight: 800, color: 'var(--text-secondary)' }}>{fmt(c.total_landed || 0)}</td>
                          <td style={{ padding: '18px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>{fmt(c.booked || 0)}</td>
                          <td style={{ padding: '18px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>{fmt(c.intransit || 0)}</td>
                          <td style={{ padding: '18px 16px', textAlign: 'right', fontWeight: 800, color: 'var(--text-primary)' }}>{fmt(c.delivered)}</td>
                          <td style={{ padding: '18px 16px', textAlign: 'right', fontWeight: 800, color: '#ef4444' }}>{fmt(c.returned || 0)}</td>
                          <td style={{ padding: '18px 16px', textAlign: 'right', fontWeight: 800, color: 'var(--text-primary)' }}>Rs {fmtK(c.revenue)}</td>
                          <td style={{ padding: '18px 16px', textAlign: 'right', fontWeight: 700, color: '#f59e0b' }}>Rs {fmtK(c.courier_cost)}</td>
                          <td style={{ padding: '18px 16px', textAlign: 'right', fontWeight: 900, color: '#f59e0b' }}>
                            Rs {fmt(c.avg_delivery_cost || 0)}
                            <div style={{ fontSize: '0.6rem', opacity: 0.4, fontWeight: 700, color: 'var(--text-muted)' }}>incl. tax</div>
                          </td>
                          <td style={{ padding: '18px 16px', textAlign: 'right', fontWeight: 900, color: '#f97316' }}>
                            {c.avg_return_cost ? `Rs ${fmt(c.avg_return_cost)}` : <span style={{ opacity: 0.25 }}>—</span>}
                            {c.avg_return_cost ? <div style={{ fontSize: '0.6rem', opacity: 0.4, fontWeight: 700, color: 'var(--text-muted)' }}>no tax</div> : null}
                          </td>
                          <td style={{ padding: '18px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--text-secondary)', borderRadius: '0 12px 12px 0' }}>Rs {fmt(c.avg_profit_per_order)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* ── TAB 1: Return Losses ── */}
          {activeTab === 1 && (
            <Section>
              <SectionHeader icon="📉" title="Revenue Leaked via Returns" subtitle="Total lost revenue, return shipping cost, and inventory at risk per courier" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
                {data.returnLoss.map(c => {
                  const clr = getCourier(c.courier_name)
                  const totalLoss = (c.return_shipping_cost || 0) + (c.inventory_cost_at_risk || 0)
                  return (
                    <div key={c.courier_name} style={{ padding: '28px', borderRadius: '22px', background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.12)', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: 'rgba(239,68,68,0.06)', borderRadius: '50%', filter: 'blur(30px)' }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '22px' }}>
                        <div>
                          <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: clr.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, marginBottom: '10px' }}>{c.courier_name[0]}</div>
                          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, color: 'var(--text-primary)' }}>{c.courier_name}</h3>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#ef4444' }}>{fmt(c.return_count)}</div>
                          <div style={{ fontSize: '0.65rem', opacity: 0.4, fontWeight: 800, color: 'var(--text-muted)' }}>RETURNS</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 18px', background: 'var(--bg-elevated)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: 700, opacity: 0.55, color: 'var(--text-muted)' }}>Lost Revenue (COD not collected)</span>
                          <span style={{ fontWeight: 900, color: '#ef4444' }}>Rs {fmtK(c.lost_revenue)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 18px', background: 'var(--bg-elevated)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: 700, opacity: 0.55, color: 'var(--text-muted)' }}>Return Shipping Paid</span>
                          <span style={{ fontWeight: 900, color: '#f59e0b' }}>Rs {fmtK(c.return_shipping_cost)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 18px', background: 'var(--bg-elevated)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: 700, opacity: 0.55, color: 'var(--text-muted)' }}>Inventory Cost at Risk</span>
                          <span style={{ fontWeight: 900, color: '#f97316' }}>Rs {fmtK(c.inventory_cost_at_risk)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 18px', background: 'rgba(239,68,68,0.07)', borderRadius: '12px', border: '1px solid rgba(239,68,68,0.15)' }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#ef4444' }}>Total Sunk Cost</span>
                          <span style={{ fontWeight: 900, color: '#ef4444', fontSize: '1.1rem' }}>Rs {fmtK(totalLoss)}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Section>
          )}

          {/* ── TAB 2: Dead Zone Cities ── */}
          {activeTab === 2 && (
            <Section>
              <SectionHeader icon="🚨" title="Dead Zone Cities" subtitle="Cities with delivery rate below 50% — avoid or switch courier" />
              {data.deadZoneCities.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px', opacity: 0.4 }}>
                  <div style={{ fontSize: '3rem' }}>🎉</div>
                  <p style={{ fontWeight: 700, color: 'var(--text-muted)', marginTop: '12px' }}>No dead zones found in this period. All cities are performing above 50%!</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 10px' }}>
                    <thead>
                      <tr style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        {['City', 'Courier', 'Total', 'Delivered', 'Returned', 'Delivery Rate', 'Risk Level'].map(h => (
                          <th key={h} style={{ padding: '0 16px', textAlign: h === 'City' || h === 'Courier' ? 'left' : 'center' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.deadZoneCities.map((c, i) => {
                        const clr = getCourier(c.courier_name)
                        const risk = c.delivery_rate < 20 ? 'danger' : c.delivery_rate < 35 ? 'warn' : 'info'
                        const riskLabel = c.delivery_rate < 20 ? '🔴 CRITICAL' : c.delivery_rate < 35 ? '🟠 HIGH RISK' : '🟡 CAUTION'
                        return (
                          <tr key={`${c.city}-${c.courier_name}`} style={{ background: 'var(--bg-elevated)' }}>
                            <td style={{ padding: '16px 16px', borderRadius: '12px 0 0 12px', fontWeight: 900, color: 'var(--text-primary)', fontSize: '1rem' }}>{c.city}</td>
                            <td style={{ padding: '16px 16px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: clr.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: '0.75rem' }}>{c.courier_name[0]}</div>
                                <span style={{ fontWeight: 700 }}>{c.courier_name}</span>
                              </div>
                            </td>
                            <td style={{ padding: '16px', textAlign: 'center', fontWeight: 700 }}>{c.total_orders}</td>
                            <td style={{ padding: '16px', textAlign: 'center', fontWeight: 700, color: '#10b981' }}>{c.delivered}</td>
                            <td style={{ padding: '16px', textAlign: 'center', fontWeight: 700, color: '#ef4444' }}>{c.returned}</td>
                            <td style={{ padding: '16px', textAlign: 'center' }}>
                              <div style={{ fontWeight: 900, fontSize: '1.1rem', color: '#ef4444' }}>{c.delivery_rate}%</div>
                              <div style={{ height: '4px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden', marginTop: '6px' }}>
                                <div style={{ width: `${c.delivery_rate}%`, height: '100%', background: '#ef4444', borderRadius: '4px' }} />
                              </div>
                            </td>
                            <td style={{ padding: '16px', textAlign: 'center', borderRadius: '0 12px 12px 0' }}>
                              <Badge text={riskLabel} type={risk} />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          )}

          {/* ── TAB 3: Pending Cost Exposure ── */}
          {activeTab === 3 && (
            <Section>
              <SectionHeader icon="📦" title="Live Exposure — In-Transit Parcels" subtitle="COD amount and courier cost currently at risk (real-time, no date filter)" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '24px' }}>
                {data.pendingExposure.map(c => {
                  const clr = getCourier(c.courier_name)
                  return (
                    <div key={c.courier_name} style={{ padding: '32px', borderRadius: '24px', background: 'var(--bg-elevated)', border: `1px solid ${clr.bg}44`, position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '120px', height: '120px', background: clr.glow, borderRadius: '50%', filter: 'blur(50px)' }} />
                      <div style={{ marginBottom: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: clr.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: '1.2rem' }}>{c.courier_name[0]}</div>
                          <div>
                            <div style={{ fontWeight: 900, fontSize: '1.3rem', color: 'var(--text-primary)' }}>{c.courier_name}</div>
                            <div style={{ fontSize: '0.75rem', opacity: 0.4, fontWeight: 700, color: 'var(--text-muted)' }}>{fmt(c.in_transit_count)} parcels in transit</div>
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div style={{ padding: '18px', borderRadius: '16px', background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.15)' }}>
                          <div style={{ fontSize: '0.65rem', fontWeight: 800, opacity: 0.4, marginBottom: '6px', color: 'var(--text-muted)' }}>COD AT RISK</div>
                          <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#6366f1' }}>Rs {fmtK(c.cod_at_risk)}</div>
                          <div style={{ fontSize: '0.7rem', opacity: 0.35, marginTop: '4px', color: 'var(--text-muted)' }}>expected to collect</div>
                        </div>
                        <div style={{ padding: '18px', borderRadius: '16px', background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.15)' }}>
                          <div style={{ fontSize: '0.65rem', fontWeight: 800, opacity: 0.4, marginBottom: '6px', color: 'var(--text-muted)' }}>FEE COMMITTED</div>
                          <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#f59e0b' }}>Rs {fmtK(c.actual_committed_fee)}</div>
                          <div style={{ fontSize: '0.7rem', opacity: 0.35, marginTop: '4px', color: 'var(--text-muted)' }}>courier cost locked</div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Section>
          )}

          {/* ── TAB 4: Weekly Trend ── */}
          {activeTab === 4 && (
            <Section>
              <SectionHeader icon="📈" title="Weekly Delivery Rate Trend" subtitle="Last 12 weeks performance per courier — spot declines early" />
              {/* Courier filter */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
                {['All', ...new Set(data.weeklyTrend.map(w => w.courier_name))].map(cn => (
                  <button key={cn} onClick={() => setWeeklyFilter(cn)} style={{
                    padding: '7px 16px', borderRadius: '10px', cursor: 'pointer',
                    fontWeight: 800, fontSize: '0.8rem', transition: 'all 0.2s',
                    background: weeklyFilter === cn ? getCourier(cn).bg || 'var(--brand)' : 'var(--bg-elevated)',
                    color: weeklyFilter === cn ? '#fff' : 'var(--text-muted)',
                    border: `1px solid ${weeklyFilter === cn ? 'transparent' : 'var(--border)'}`
                  }}>{cn}</button>
                ))}
              </div>

              {/* Grouped by courier */}
              {(() => {
                const grouped = {}
                data.weeklyTrend.filter(w => weeklyFilter === 'All' || w.courier_name === weeklyFilter).forEach(w => {
                  if (!grouped[w.courier_name]) grouped[w.courier_name] = []
                  grouped[w.courier_name].push(w)
                })
                return Object.entries(grouped).map(([courier, weeks]) => {
                  const clr = getCourier(courier)
                  return (
                    <div key={courier} style={{ marginBottom: '28px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: clr.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: '0.85rem' }}>{courier[0]}</div>
                        <span style={{ fontWeight: 900, fontSize: '1rem', color: 'var(--text-primary)' }}>{courier}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        {weeks.map((w, i) => {
                          const barH = Math.max(20, (w.delivery_rate / 100) * 100)
                          const color = w.delivery_rate >= 70 ? '#10b981' : w.delivery_rate >= 50 ? '#f59e0b' : '#ef4444'
                          return (
                            <div key={i} title={`${w.week_start}: ${w.delivery_rate}% (${w.total_orders} orders)`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', cursor: 'default' }}>
                              <span style={{ fontSize: '0.65rem', fontWeight: 900, color }}>{w.delivery_rate}%</span>
                              <div style={{ width: '32px', height: `${barH}px`, background: color, borderRadius: '6px 6px 0 0', opacity: 0.85, transition: 'all 0.3s', boxShadow: `0 0 10px ${color}44` }} />
                              <span style={{ fontSize: '0.6rem', opacity: 0.35, color: 'var(--text-muted)', writingMode: 'initial', fontWeight: 700 }}>{w.week_start?.slice(5)}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })
              })()}
            </Section>
          )}

          {/* ── TAB 5: Failed Attempts ── */}
          {activeTab === 5 && (
            <Section>
              <SectionHeader icon="❌" title="Failed Attempt Cost Calculator" subtitle="Money spent on couriers that couldn't deliver on first try" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
                {data.failedAttemptCosts.map(c => {
                  const clr = getCourier(c.courier_name)
                  const failRate = c.total_orders > 0 ? ((c.orders_with_failed_attempts / c.total_orders) * 100).toFixed(1) : 0
                  
                  // Ratios
                  const totalDelivered = c.total_delivered || 0
                  const firstAttemptPct = totalDelivered > 0 ? ((c.first_attempt_delivered / totalDelivered) * 100).toFixed(1) : 0
                  const failedButDelivered = c.failed_but_delivered || 0
                  const failedAndReturned = c.failed_and_returned || 0
                  const ordersAffected = c.orders_with_failed_attempts || 0
                  
                  const failedToDeliveredPct = ordersAffected > 0 ? ((failedButDelivered / ordersAffected) * 100).toFixed(1) : 0
                  const failedToReturnedPct = ordersAffected > 0 ? ((failedAndReturned / ordersAffected) * 100).toFixed(1) : 0

                  return (
                    <div key={c.courier_name} style={{ padding: '28px', borderRadius: '22px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: 'rgba(239,68,68,0.05)', borderRadius: '50%', filter: 'blur(30px)' }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: clr.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900 }}>{c.courier_name[0]}</div>
                          <h3 style={{ margin: 0, fontWeight: 900, color: 'var(--text-primary)' }}>{c.courier_name}</h3>
                        </div>
                        <Badge text={`${failRate}% fail rate`} type={parseFloat(failRate) > 20 ? 'danger' : parseFloat(failRate) > 10 ? 'warn' : 'success'} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <StatPill label="Failed Attempts (total)" value={fmt(c.total_failed_attempts)} color="#ef4444" />
                        <StatPill label="Orders Affected" value={fmt(ordersAffected)} color="#f59e0b" />
                        <StatPill label="Fee on Multi-Attempt" value={`Rs ${fmtK(c.fee_on_multi_attempt)}`} color="#ef4444" sub="total courier cost paid" />
                        <StatPill label="Avg Fee (failed)" value={`Rs ${fmt(c.avg_fee_multi_attempt)}`} sub="per affected order" />
                      </div>

                      <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Delivery & Recovery Ratios</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                          {/* 1st Attempt Delivery Rate */}
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '6px' }}>
                              <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>1st Attempt Delivery Rate</span>
                              <span style={{ color: '#10b981', fontWeight: 900 }}>{firstAttemptPct}% <span style={{ opacity: 0.5, fontWeight: 600, fontSize: '0.65rem' }}>({fmt(c.first_attempt_delivered)}/{fmt(totalDelivered)})</span></span>
                            </div>
                            <div style={{ width: '100%', height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ width: `${firstAttemptPct}%`, height: '100%', background: '#10b981', borderRadius: '3px' }} />
                            </div>
                          </div>

                          {/* Failed Attempt to Delivered Ratio */}
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '6px' }}>
                              <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>Failed to Delivered (Recovery)</span>
                              <span style={{ color: '#3b82f6', fontWeight: 900 }}>{failedToDeliveredPct}% <span style={{ opacity: 0.5, fontWeight: 600, fontSize: '0.65rem' }}>({fmt(failedButDelivered)}/{fmt(ordersAffected)})</span></span>
                            </div>
                            <div style={{ width: '100%', height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ width: `${failedToDeliveredPct}%`, height: '100%', background: '#3b82f6', borderRadius: '3px' }} />
                            </div>
                          </div>

                          {/* Failed Attempt to Returned Ratio */}
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '6px' }}>
                              <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>Failed to Returned (RTO)</span>
                              <span style={{ color: '#ef4444', fontWeight: 900 }}>{failedToReturnedPct}% <span style={{ opacity: 0.5, fontWeight: 600, fontSize: '0.65rem' }}>({fmt(failedAndReturned)}/{fmt(ordersAffected)})</span></span>
                            </div>
                            <div style={{ width: '100%', height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ width: `${failedToReturnedPct}%`, height: '100%', background: '#ef4444', borderRadius: '3px' }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Section>
          )}

          {/* ── TAB 6: Shipping Fee Recovery ── */}
          {activeTab === 6 && (
            <Section>
              <SectionHeader icon="🚚" title="Shipping Fee Recovery P&L" subtitle="Shipping charged to customer vs actual courier cost paid — gap is your gain or loss" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '24px' }}>
                {data.shippingRecovery.map(c => {
                  const clr = getCourier(c.courier_name)
                  const isProfit = c.net_shipping_pnl >= 0
                  return (
                    <div key={c.courier_name} style={{ padding: '30px', borderRadius: '24px', background: 'var(--bg-elevated)', border: `1px solid ${isProfit ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: clr.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900 }}>{c.courier_name[0]}</div>
                          <span style={{ fontWeight: 900, fontSize: '1.2rem', color: 'var(--text-primary)' }}>{c.courier_name}</span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: isProfit ? '#10b981' : '#ef4444' }}>Rs {fmtK(c.net_shipping_pnl)}</div>
                          <div style={{ fontSize: '0.65rem', opacity: 0.4, fontWeight: 800, color: 'var(--text-muted)' }}>NET SHIPPING P&L</div>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                        <div style={{ padding: '14px', borderRadius: '12px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.12)' }}>
                          <div style={{ fontSize: '0.65rem', fontWeight: 800, opacity: 0.4, marginBottom: '4px', color: 'var(--text-muted)' }}>CHARGED TO CUSTOMER</div>
                          <div style={{ fontWeight: 900, color: '#10b981', fontSize: '1.2rem' }}>Rs {fmtK(c.total_shipping_collected)}</div>
                          <div style={{ fontSize: '0.7rem', opacity: 0.4, color: 'var(--text-muted)' }}>avg Rs {fmt(c.avg_shipping_charged)}</div>
                        </div>
                        <div style={{ padding: '14px', borderRadius: '12px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)' }}>
                          <div style={{ fontSize: '0.65rem', fontWeight: 800, opacity: 0.4, marginBottom: '4px', color: 'var(--text-muted)' }}>PAID TO COURIER</div>
                          <div style={{ fontWeight: 900, color: '#ef4444', fontSize: '1.2rem' }}>Rs {fmtK(c.total_courier_paid)}</div>
                          <div style={{ fontSize: '0.7rem', opacity: 0.4, color: 'var(--text-muted)' }}>avg Rs {fmt(c.avg_courier_cost)}</div>
                        </div>
                      </div>

                      {c.orders_underwater > 0 && (
                        <div style={{ padding: '12px 16px', borderRadius: '12px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#ef4444' }}>⚠️ Orders where shipping &lt; courier fee</span>
                          <Badge text={`${c.orders_underwater} orders`} type="danger" />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </Section>
          )}

          {/* ── TAB 7: City Delivery Days ── */}
          {activeTab === 7 && (
            <Section>
              <SectionHeader icon="⏱️" title="City-Level Delivery Speed" subtitle="Average days from order to delivered, per city and courier (min 5 delivered orders)" />
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 8px' }}>
                  <thead>
                    <tr style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                      {['City', 'Courier', 'Delivered', 'Avg Days', 'Fastest', 'Slowest', 'Speed'].map(h => (
                        <th key={h} style={{ padding: '0 14px', textAlign: h === 'City' || h === 'Courier' ? 'left' : 'center' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.cityDeliveryDays.map((c, i) => {
                      const clr = getCourier(c.courier_name)
                      const speed = c.avg_days <= 2 ? { label: '⚡ Express', type: 'success' } : c.avg_days <= 4 ? { label: '✅ Normal', type: 'info' } : { label: '🐢 Slow', type: 'warn' }
                      return (
                        <tr key={`${c.city}-${c.courier_name}-${i}`} style={{ background: 'var(--bg-elevated)' }}>
                          <td style={{ padding: '14px 14px', borderRadius: '10px 0 0 10px', fontWeight: 800, color: 'var(--text-primary)' }}>{c.city}</td>
                          <td style={{ padding: '14px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: clr.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: '0.7rem' }}>{c.courier_name[0]}</div>
                              <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{c.courier_name}</span>
                            </div>
                          </td>
                          <td style={{ padding: '14px', textAlign: 'center', fontWeight: 700 }}>{c.delivered_count}</td>
                          <td style={{ padding: '14px', textAlign: 'center' }}>
                            <span style={{ fontWeight: 900, fontSize: '1.2rem', color: c.avg_days <= 2 ? '#10b981' : c.avg_days <= 4 ? 'var(--text-primary)' : '#f59e0b' }}>{c.avg_days}d</span>
                          </td>
                          <td style={{ padding: '14px', textAlign: 'center', fontWeight: 700, color: '#10b981' }}>{c.fastest_days}d</td>
                          <td style={{ padding: '14px', textAlign: 'center', fontWeight: 700, color: '#f59e0b' }}>{c.slowest_days}d</td>
                          <td style={{ padding: '14px', textAlign: 'center', borderRadius: '0 10px 10px 0' }}>
                            <Badge text={speed.label} type={speed.type} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* ── TAB 8: Courier Mix ── */}
          {activeTab === 8 && (
            <Section>
              <SectionHeader icon="🥧" title="Courier Volume Mix — Last 6 Months" subtitle="Monthly order count, delivery rate, and total fees by courier" />
              {(() => {
                const months = [...new Set(data.courierMix.map(m => m.month))].sort()
                const couriers = [...new Set(data.courierMix.map(m => m.courier_name))]
                const byMonth = {}
                data.courierMix.forEach(r => {
                  if (!byMonth[r.month]) byMonth[r.month] = {}
                  byMonth[r.month][r.courier_name] = r
                })
                return (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 10px' }}>
                      <thead>
                        <tr style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                          <th style={{ padding: '0 16px', textAlign: 'left' }}>Month</th>
                          {couriers.map(cn => {
                            const clr = getCourier(cn)
                            return (
                              <th key={cn} style={{ padding: '0 16px', textAlign: 'center' }}>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                  <div style={{ width: '18px', height: '18px', borderRadius: '5px', background: clr.bg, display: 'inline-block' }} />
                                  {cn}
                                </div>
                              </th>
                            )
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {months.map(month => {
                          const row = byMonth[month] || {}
                          const totalOrders = couriers.reduce((s, cn) => s + (row[cn]?.order_count || 0), 0)
                          return (
                            <tr key={month} style={{ background: 'var(--bg-elevated)' }}>
                              <td style={{ padding: '16px', borderRadius: '12px 0 0 12px', fontWeight: 900, color: 'var(--text-primary)', fontSize: '1rem' }}>{month}</td>
                              {couriers.map((cn, ci) => {
                                const d = row[cn]
                                const clr = getCourier(cn)
                                const share = totalOrders > 0 && d ? ((d.order_count / totalOrders) * 100).toFixed(0) : 0
                                const delRate = d && d.order_count > 0 ? ((d.delivered / d.order_count) * 100).toFixed(0) : 0
                                return (
                                  <td key={cn} style={{ padding: '16px', textAlign: 'center', borderRadius: ci === couriers.length - 1 ? '0 12px 12px 0' : undefined }}>
                                    {d ? (
                                      <div>
                                        <div style={{ fontWeight: 900, fontSize: '1.1rem', color: 'var(--text-primary)' }}>{fmt(d.order_count)}</div>
                                        <div style={{ fontSize: '0.7rem', color: clr.bg, fontWeight: 800 }}>{share}% share</div>
                                        <div style={{ fontSize: '0.68rem', opacity: 0.4, color: 'var(--text-muted)' }}>{delRate}% del • Rs {fmtK(d.total_fee)}</div>
                                      </div>
                                    ) : (
                                      <span style={{ opacity: 0.2, fontSize: '0.8rem' }}>—</span>
                                    )}
                                  </td>
                                )
                              })}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              })()}
            </Section>
          )}
        </>
      )}
    </div>
  )
}
