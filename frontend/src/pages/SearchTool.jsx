import { useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { useApp } from '../App'

const DATE_PRESETS = ['Today','Yesterday','Last 7 Days','Last 30 Days','This Month','Last Month','This Year','All Time','Custom Range']
const SORT_OPTIONS = ['Default','Newest First','Oldest First','Highest Price','Lowest Price']
const CITY_ALIASES = {
  karachi: ['khi','krachi','karaci'],
  lahore: ['lhr','lahor'],
  islamabad: ['isb'],
  rawalpindi: ['rwp','pindi'],
  faisalabad: ['fsd','faisalabd']
}

const SPECIAL_MODES = ['[ACTIVE PIPELINE]','[GHOST PIPELINE]','[NEEDS ADJUSTMENT]','[RUN SYSTEM AUDIT]','[WATCHDOG FRAUD]','[NO TRACKING]','[UNPAID DELIVERED]']
const STATUS_OPTIONS = ['All Statuses',...SPECIAL_MODES,'Pending','Delivered','Return Received','Cancelled','Returned','Booked','Shipper Advice','Undelivered','Refused','Attempted']

function getDateRange(preset, customStart, customEnd) {
  const now = new Date(); now.setHours(0,0,0,0)
  const end = new Date(); end.setHours(23,59,59,999)
  if (preset === 'Today') return { start: now, end }
  if (preset === 'Yesterday') {
    const d = new Date(now); d.setDate(d.getDate()-1)
    const e = new Date(d); e.setHours(23,59,59,999)
    return { start: d, end: e }
  }
  if (preset === 'Last 7 Days') { const s = new Date(now); s.setDate(s.getDate()-7); return { start: s, end } }
  if (preset === 'Last 30 Days') { const s = new Date(now); s.setDate(s.getDate()-30); return { start: s, end } }
  if (preset === 'This Month') { const s = new Date(now); s.setDate(1); return { start: s, end } }
  if (preset === 'Last Month') {
    const s = new Date(now.getFullYear(), now.getMonth()-1, 1)
    const e = new Date(now.getFullYear(), now.getMonth(), 0); e.setHours(23,59,59,999)
    return { start: s, end: e }
  }
  if (preset === 'This Year') { const s = new Date(now); s.setMonth(0); s.setDate(1); return { start: s, end } }
  if (preset === 'All Time') return { start: new Date('2020-01-01'), end }
  if (preset === 'Custom Range' && customStart) {
    const s = new Date(customStart); s.setHours(0,0,0,0)
    const e = customEnd ? new Date(customEnd) : new Date(s)
    e.setHours(23,59,59,999)
    return { start: s, end: e }
  }
  return null
}

function matchesSearch(order, keyword) {
  if (!keyword) return true
  const searchable = `${order.shopify_order_id||''} ${order.ref_number||''} ${order.customer_name||''} ${order.phone||''} ${order.city||''} ${order.tracking_number||''}`.toLowerCase()
  
  let expanded = searchable
  for (const [city, aliases] of Object.entries(CITY_ALIASES)) {
    if (searchable.includes(city) || aliases.some(a => searchable.includes(a))) {
      expanded += ' ' + city + ' ' + aliases.join(' ')
    }
  }

  const kw = keyword.toLowerCase()
  if (kw.includes(',') || kw.includes('\n')) {
    const terms = kw.split(/[\n,]+/).map(t => t.trim()).filter(Boolean)
    return terms.some(t => expanded.includes(t))
  }
  const parts = kw.split(/\s+/)
  const includes = parts.filter(p => !p.startsWith('-'))
  const excludes = parts.filter(p => p.startsWith('-')).map(p => p.slice(1))
  return includes.every(t => expanded.includes(t)) && !excludes.some(e => expanded.includes(e))
}

function applySpecialMode(order, mode, today) {
  const s = (order.delivery_status || '').toLowerCase()
  const paid = parseFloat(order.paid_amount) || 0
  const price = parseFloat(order.price) || 0
  const statusDate = order.status_date ? new Date(order.status_date) : null
  const daysOld = statusDate ? Math.floor((today - statusDate) / 86400000) : 999

  if (mode === '[ACTIVE PIPELINE]') return !['delivered','return received','cancelled','returned'].includes(s)
  if (mode === '[GHOST PIPELINE]') return (s.includes('pending')||s===''||s.includes('unbooked')||s.includes('returned')) && daysOld > 3
  if (mode === '[NEEDS ADJUSTMENT]') {
    const delivered = s.includes('delivered')
    const returnedOrCancelled = s.includes('return') || s.includes('cancel')
    const diff = price - paid
    
    // Flag if:
    // 1. Delivered but essentially unpaid (balance > 1)
    // 2. Delivered but partially paid (balance > 1)
    // 3. Returned/Cancelled but has any significant payment (> 1)
    // 4. Significant overpayment (balance < -1)
    return (delivered && paid < 1 && price > 1) || 
           (delivered && diff > 1 && paid >= 1) || 
           (returnedOrCancelled && paid > 1) || 
           (diff < -1)
  }
  if (mode === '[WATCHDOG FRAUD]') {
    return true; 
  }
  if (mode === '[NO TRACKING]') {
    return (!order.tracking_number || order.tracking_number.trim() === '') && s !== 'cancelled'
  }
  if (mode === '[UNPAID DELIVERED]') {
    return s.includes('delivered') && paid < 1
  }
  return true
}

function getStatusColor(status) {
  const s = (status||'').toLowerCase()
  if (s.includes('delivered')) return { bg: 'var(--green-dim)', color: 'var(--green)' }
  if (s.includes('return')||s.includes('cancel')) return { bg: 'var(--red-dim)', color: 'var(--red)' }
  if (s.includes('review')||s.includes('attempt')||s.includes('refused')) return { bg: 'var(--orange-dim)', color: 'var(--orange)' }
  return { bg: 'var(--yellow-dim)', color: 'var(--yellow)' }
}

export default function SearchTool() {
  const { activeStoreId, addToast } = useApp()
  const location = useLocation()
  const [allOrders, setAllOrders] = useState([])
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)

  const [preset, setPreset] = useState('Last Month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [status, setStatus] = useState('[ACTIVE PIPELINE]')
  const [keyword, setKeyword] = useState('')
  const [sort, setSort] = useState('Default')

  // Apply drill-down state from Reports page
  useEffect(() => {
    if (location.state) {
      const { preset: p, customStart: cs, customEnd: ce, status: s, keyword: k } = location.state
      if (p) setPreset(p)
      if (cs) setCustomStart(cs)
      if (ce) setCustomEnd(ce)
      if (s) setStatus(s)
      if (k) setKeyword(k)
      // Clear state after application so refreshes use defaults or current state
      window.history.replaceState({}, document.title)
    }
  }, [location.state])

  const [savedViews, setSavedViews] = useState(() => {
    try { return JSON.parse(localStorage.getItem('traceerp_views') || '[]') } catch { return [] }
  })
  const [selectedView, setSelectedView] = useState('')
  const [viewName, setViewName] = useState('')
  const [showSaveDialog, setShowSaveDialog] = useState(false)

  // KPIs
  const [kpi, setKpi] = useState({ total: 0, sum: 0, delivered: 0, returned: 0, pending: 0 })

  // Load all orders for the active store (we filter client-side for instant search)
  useEffect(() => {
    if (!activeStoreId) return
    setLoading(true)
    fetch(`/api/orders?store_id=${activeStoreId}&limit=5000&t=${Date.now()}`)
      .then(r => r.json())
      .then(data => { setAllOrders(data.orders || []); setLoading(false) })
      .catch(() => { addToast('Failed to load orders', 'error'); setLoading(false) })
  }, [activeStoreId])

  const runSearch = useCallback(() => {
    const today = new Date(); today.setHours(0,0,0,0)
    const dateRange = getDateRange(preset, customStart, customEnd)
    const isSpecial = SPECIAL_MODES.includes(status)
    const bypassStatus = status === 'All Statuses' || isSpecial

    let filtered = allOrders.filter(order => {
      const orderDate = order.order_date ? new Date(order.order_date) : null
      if (dateRange && orderDate) {
        orderDate.setHours(0,0,0,0)
        if (orderDate < dateRange.start || orderDate > dateRange.end) return false
      }
      if (isSpecial && !applySpecialMode(order, status, today)) return false
      if (!bypassStatus) {
        const s = (order.delivery_status||'').toLowerCase()
        if (!status.split(',').some(st => s.includes(st.trim().toLowerCase()))) return false
      }
      if (keyword && !matchesSearch(order, keyword)) return false
      return true
    })

    if (sort === 'Newest First') filtered.sort((a,b) => new Date(b.order_date)-new Date(a.order_date))
    else if (sort === 'Oldest First') filtered.sort((a,b) => new Date(a.order_date)-new Date(b.order_date))
    else if (sort === 'Highest Price') filtered.sort((a,b) => (b.price||0)-(a.price||0))
    else if (sort === 'Lowest Price') filtered.sort((a,b) => (a.price||0)-(b.price||0))

    let delivered=0, returned=0, pending=0, sum=0
    filtered.forEach(o => {
      const s = (o.delivery_status||'').toLowerCase()
      sum += parseFloat(o.price)||0
      if (s.includes('delivered')) delivered++
      else if (s.includes('return')||s.includes('cancel')) returned++
      else pending++
    })
    setKpi({ total: filtered.length, sum, delivered, returned, pending })
    setResults(filtered)
  }, [allOrders, preset, customStart, customEnd, status, keyword, sort])

  useEffect(() => { if (allOrders.length) runSearch() }, [allOrders, runSearch])

  const saveView = () => {
    if (!viewName.trim()) return
    const view = { name: viewName, preset, customStart, customEnd, status, keyword, sort, createdAt: Date.now() }
    const updated = [...savedViews.filter(v => v.name !== viewName), view]
    setSavedViews(updated)
    localStorage.setItem('traceerp_views', JSON.stringify(updated))
    setShowSaveDialog(false); setViewName('')
    addToast(`✅ View "${viewName}" saved`, 'success')
  }

  const loadView = (name) => {
    const v = savedViews.find(v => v.name === name)
    if (!v) return
    setPreset(v.preset); setCustomStart(v.customStart||''); setCustomEnd(v.customEnd||'')
    setStatus(v.status); setKeyword(v.keyword||''); setSort(v.sort)
    setSelectedView(name)
  }

  const deleteView = () => {
    if (!selectedView) return
    const updated = savedViews.filter(v => v.name !== selectedView)
    setSavedViews(updated)
    localStorage.setItem('traceerp_views', JSON.stringify(updated))
    setSelectedView(''); addToast(`View deleted`, 'info')
  }

  const updateOrderField = async (orderId, field, value) => {
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value })
      })
      const data = await res.json()
      // Backend returns full updated row (includes auto-stamped payment_date, payment_status)
      if (data.order) {
        setAllOrders(prev => prev.map(o => o.id === orderId ? data.order : o))
      } else {
        setAllOrders(prev => prev.map(o => o.id === orderId ? { ...o, [field]: value } : o))
      }
      addToast('✅ Saved', 'success')
    } catch {
      addToast('❌ Failed to save', 'error')
    }
  }

  const deliveryRate = kpi.total > 0 ? ((kpi.delivered / kpi.total) * 100).toFixed(1) : 0

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>🔍 Command Center</h2>
          <p>Advanced search, filter, and order management</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary btn-sm" onClick={() => setShowSaveDialog(true)}>💾 Save View</button>
          {selectedView && <button className="btn btn-danger btn-sm" onClick={deleteView}>🗑 Delete View</button>}
          <button className="btn btn-primary btn-sm" onClick={runSearch}>🔄 Run Search</button>
        </div>
      </div>

      {/* KPI Scorecard */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginBottom: 16 }}>
        {[
          { label: 'Results', value: kpi.total.toLocaleString(), color: 'blue', icon: '🔍' },
          { label: 'Total Value', value: `Rs ${Math.round(kpi.sum).toLocaleString()}`, color: 'purple', icon: '💰' },
          { label: 'Delivered', value: kpi.delivered, color: 'green', icon: '✅' },
          { label: 'Returned', value: kpi.returned, color: 'red', icon: '↩️' },
          { label: 'In Transit', value: kpi.pending, color: 'yellow', icon: '🚚' },
        ].map(k => (
          <div key={k.label} className={`kpi-card ${k.color}`} style={{ padding: 12 }}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ fontSize: '1.3rem' }}>{k.value}</div>
            <div className="kpi-icon" style={{ fontSize: '1rem' }}>{k.icon}</div>
          </div>
        ))}
      </div>

      {/* Pipeline Bar */}
      {kpi.total > 0 && (
        <div className="card" style={{ padding: '10px 16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', height: 10, borderRadius: 6, overflow: 'hidden', gap: 2 }}>
            <div style={{ flex: kpi.delivered, background: 'var(--green)', transition: '0.5s' }} title={`Delivered: ${kpi.delivered}`} />
            <div style={{ flex: kpi.returned, background: 'var(--red)', transition: '0.5s' }} title={`Returned: ${kpi.returned}`} />
            <div style={{ flex: kpi.pending, background: 'var(--yellow)', transition: '0.5s' }} title={`In Transit: ${kpi.pending}`} />
          </div>
          <div className="flex gap-3 mt-4" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            <span style={{ color: 'var(--green)' }}>✅ Delivered: {deliveryRate}%</span>
            <span style={{ color: 'var(--red)' }}>↩️ Returned: {kpi.total > 0 ? ((kpi.returned/kpi.total)*100).toFixed(1) : 0}%</span>
            <span style={{ color: 'var(--yellow)' }}>🚚 In Transit: {kpi.pending}</span>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card" style={{ padding: '14px 16px', marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 130px 1fr 1fr 1fr 1fr', gap: 10, alignItems: 'end' }}>
          <div>
            <label className="form-label">📅 Date Preset</label>
            <select className="form-select" value={preset} onChange={e => setPreset(e.target.value)}>
              {DATE_PRESETS.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          {preset === 'Custom Range' ? <>
            <div>
              <label className="form-label">📆 Start</label>
              <input type="date" className="form-input" value={customStart} onChange={e => setCustomStart(e.target.value)} />
            </div>
            <div>
              <label className="form-label">🏁 End</label>
              <input type="date" className="form-input" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
            </div>
          </> : <><div/><div/></>}
          <div>
            <label className="form-label">🏷️ Status / Mode</label>
            <select className="form-select" value={status} onChange={e => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">🔑 Keyword (use commas for OR)</label>
            <input className="form-input" placeholder="name, city, tracking, phone..." value={keyword} onChange={e => setKeyword(e.target.value)} onKeyDown={e => e.key === 'Enter' && runSearch()} />
          </div>
          <div>
            <label className="form-label">🗂️ Sort By</label>
            <select className="form-select" value={sort} onChange={e => setSort(e.target.value)}>
              {SORT_OPTIONS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">⭐ Load View</label>
            <div className="flex gap-2">
              <select className="form-select" value={selectedView} onChange={e => loadView(e.target.value)}>
                <option value="">— Select View —</option>
                {savedViews.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-4" style={{ paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-primary" onClick={runSearch} disabled={loading}>
            {loading ? <><span className="loading-spinner"></span> Searching...</> : '🔄 Run Search'}
          </button>
          <button className="btn btn-secondary" onClick={() => { setPreset('Last Month'); setStatus('[ACTIVE PIPELINE]'); setKeyword(''); setSort('Default'); setCustomStart(''); setCustomEnd('') }}>
            🧹 Reset
          </button>
        </div>
      </div>

      {/* Save View Dialog */}
      {showSaveDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: 360, padding: 24 }}>
            <div style={{ fontWeight: 700, marginBottom: 14 }}>💾 Save Current View</div>
            <div className="form-group">
              <label className="form-label">View Name</label>
              <input className="form-input" placeholder="e.g. Karachi Pending" value={viewName} onChange={e => setViewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveView()} autoFocus />
            </div>
            <div className="flex gap-2 mt-4">
              <button className="btn btn-primary" onClick={saveView}>Save</button>
              <button className="btn btn-secondary" onClick={() => setShowSaveDialog(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Results Table */}
      {loading ? (
        <div className="loading-overlay"><span className="loading-spinner"></span> Searching...</div>
      ) : results.length === 0 ? (
        <div className="empty-state"><div className="empty-icon">🔍</div><h3>No Results</h3><p>Adjust your filters and try again</p></div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Order ID</th><th>Date</th><th>Customer</th><th>Phone</th><th>City</th>
                <th>Price</th><th>Paid Amount</th><th>Pending Bal.</th><th>Status</th>
                <th>Courier</th><th>Tracking #</th><th>Edit Status</th><th>P&L Date</th>
              </tr>
            </thead>
            <tbody>
              {results.map(o => {
                const diff = (parseFloat(o.price)||0) - (parseFloat(o.paid_amount)||0)
                const isClear = Math.abs(diff) <= 1
                const { bg, color } = getStatusColor(o.delivery_status)
                const s = (o.delivery_status||'').toLowerCase()
                const orderDate = o.order_date ? new Date(o.order_date) : null
                const today = new Date(); today.setHours(0,0,0,0)
                const daysOld = orderDate ? Math.floor((today-orderDate)/86400000) : 0
                const isPending = !s.includes('delivered') && !s.includes('return') && !s.includes('cancel')
                const dateAged = isPending && daysOld >= 5

                return (
                  <tr key={o.id}>
                    <td>
                      <a
                        href={`https://${o.shop_domain}/admin/orders/${o.shopify_order_id}`}
                        target="_blank" rel="noreferrer"
                        style={{ color: 'var(--brand)', fontSize: '0.75rem', textDecoration: 'none', fontWeight: 600 }}
                      >
                        🛍️ {o.ref_number || o.shopify_order_id}
                      </a>
                    </td>
                    <td style={{ fontSize: '0.75rem', color: dateAged ? 'var(--orange)' : 'var(--text-muted)', fontWeight: dateAged ? 700 : 400 }}>
                      {o.order_date || '—'}
                      {dateAged && <span style={{ fontSize: '0.65rem', marginLeft: 4 }}>{daysOld}d</span>}
                    </td>
                    <td>{o.customer_name}</td>
                    <td style={{ fontSize: '0.75rem' }}>
                      {o.phone ? (
                        <a href={`https://wa.me/${o.phone.replace(/\D/g,'').replace(/^0/,'92')}`} target="_blank" rel="noreferrer" style={{ color: 'var(--green)', textDecoration: 'none' }}>
                          💬 {o.phone}
                        </a>
                      ) : '—'}
                    </td>
                    <td>{o.city || '—'}</td>
                    <td style={{ fontWeight: 700 }}>Rs {Math.round(parseFloat(o.price)||0).toLocaleString()}</td>

                    {/* 3. INLINE PAID AMOUNT EDIT */}
                    <td>
                      <PaidAmountCell order={o} onSave={updateOrderField} />
                    </td>

                    <td style={{ color: diff > 1 && s.includes('delivered') ? 'var(--red)' : 'var(--text-muted)', fontWeight: diff > 1 && s.includes('delivered') ? 700 : 400 }}>
                      {!isClear ? `Rs ${Math.round(diff).toLocaleString()}` : <span style={{color:'var(--green)'}}>✅ Clear</span>}
                    </td>
                    <td><span className="badge" style={{ background: bg, color }}>{o.delivery_status || 'Pending'}</span></td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{o.courier || '—'}</td>
                    <td style={{ fontSize: '0.75rem' }}>
                      {o.tracking_number ? (
                        <a
                          href={(o.courier||'').toLowerCase().includes('insta')
                            ? `https://instaworld.com.pk/track/${o.tracking_number}`
                            : `https://merchant.postex.pk/track/${o.tracking_number}`}
                          target="_blank" rel="noreferrer"
                          style={{ color: 'var(--blue)', textDecoration: 'none' }}
                        >
                          🚚 {o.tracking_number}
                        </a>
                      ) : '—'}
                    </td>
                    <td>
                      <select
                        className="form-select"
                        style={{ padding: '3px 6px', fontSize: '0.72rem', width: 130 }}
                        value={o.delivery_status || ''}
                        onChange={e => updateOrderField(o.id, 'delivery_status', e.target.value)}
                      >
                        {['Pending','Booked','Picked Up','In Transit','Out for Delivery','Delivered','Return Initiated','Return Received','Cancelled'].map(st => (
                          <option key={st} value={st}>{st}</option>
                        ))}
                      </select>
                    </td>
                    {/* 4. P&L DATE — auto-stamped by backend on Delivered */}
                    <td style={{ fontSize: '0.72rem', color: o.payment_date ? 'var(--green)' : 'var(--text-muted)', fontWeight: o.payment_date ? 600 : 400 }}>
                      {o.payment_date ? `📅 ${o.payment_date}` : s.includes('delivered') ? '⚠️ Missing' : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Inline Paid Amount Cell ───────────────────────────────────────────────────
function PaidAmountCell({ order, onSave }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(order.paid_amount || '')

  // Sync if parent updates (e.g. after backend auto-change)
  useEffect(() => { setVal(order.paid_amount || '') }, [order.paid_amount])

  const commit = () => {
    const num = parseFloat(val)
    if (!isNaN(num) && num !== parseFloat(order.paid_amount || 0)) {
      onSave(order.id, 'paid_amount', num)
    }
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        type="number"
        className="form-input"
        style={{ width: 100, padding: '3px 6px', fontSize: '0.75rem' }}
        value={val}
        autoFocus
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
      />
    )
  }

  const paid = parseFloat(order.paid_amount) || 0
  const price = parseFloat(order.price) || 0
  const diff = price - paid
  const isPartial = paid >= 1 && diff > 1
  const isFull = Math.abs(diff) <= 1 && paid >= 1

  return (
    <span
      onClick={() => setEditing(true)}
      title="Click to edit"
      style={{
        cursor: 'pointer',
        color: isFull ? 'var(--green)' : isPartial ? 'var(--yellow)' : 'var(--text-muted)',
        fontWeight: paid > 0 ? 600 : 400,
        fontSize: '0.78rem',
        display: 'flex', alignItems: 'center', gap: 4
      }}
    >
      {paid > 0 ? `Rs ${Math.round(paid).toLocaleString()}` : <span style={{ opacity: 0.5 }}>—</span>}
      {isPartial && <span style={{ fontSize: '0.6rem', background: 'var(--yellow-dim)', color: 'var(--yellow)', padding: '1px 4px', borderRadius: 4 }}>Partial</span>}
      <span style={{ fontSize: '0.6rem', opacity: 0.3, marginLeft: 2 }}>✏️</span>
    </span>
  )
}
