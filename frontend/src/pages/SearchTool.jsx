import { useState, useEffect, useCallback, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'

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
  
  const matchesGlobal = includes.every(t => expanded.includes(t)) && !excludes.some(e => expanded.includes(e))
  if (!matchesGlobal) return false

  const { colFilters } = order._meta || {}
  if (colFilters) {
    for (const [key, val] of Object.entries(colFilters)) {
      if (val && !String(order[key] || '').toLowerCase().includes(val.toLowerCase())) return false
    }
  }

  return true
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
    return (delivered && paid < 1 && price > 1) || 
           (delivered && diff > 1 && paid >= 1) || 
           (returnedOrCancelled && paid > 1) || 
           (diff < -1)
  }
  if (mode === '[WATCHDOG FRAUD]') return true
  if (mode === '[NO TRACKING]') return (!order.tracking_number || order.tracking_number.trim() === '') && s !== 'cancelled'
  if (mode === '[UNPAID DELIVERED]') return s.includes('delivered') && paid < 1
  return true
}

function getStatusBadgeClass(status) {
  const s = (status||'').toLowerCase()
  if (s.includes('delivered')) return 'badge-delivered'
  if (s.includes('return')||s.includes('cancel')) return 'badge-returned'
  if (s.includes('review')||s.includes('attempt')||s.includes('refused')) return 'badge-pending'
  return 'badge-pending'
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
  const [colFilters, setColFilters] = useState({
    ref_number: '', customer_name: '', city: '', phone: '', status: '', courier: '', tracking_number: '', notes: ''
  })
  const [compactMode, setCompactMode] = useState(() => localStorage.getItem('search_compact') === 'true')
  const [editingOrder, setEditingOrder] = useState(null)
  const [editorLoading, setEditorLoading] = useState(false)

  const fetchOrderDetails = async (orderId) => {
    setEditorLoading(true)
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${apiUrl}/api/orders/${orderId}/details`)
      const data = await res.json()
      setEditingOrder(data)
    } catch (e) {
      addToast('Failed to fetch order details', 'error')
    } finally {
      setEditorLoading(false)
    }
  }

  const toggleCompact = () => {
    setCompactMode(prev => {
      localStorage.setItem('search_compact', !prev)
      return !prev
    })
  }

  const [nameSettings, setNameSettings] = useState(() => {
    const saved = localStorage.getItem('trace_name_settings')
    return saved ? JSON.parse(saved) : { shorten: true, stripWords: 'Mr, Ms, Dr, Malik, M.' }
  })
  const [showNameDialog, setShowNameDialog] = useState(false)

  const saveNameSettings = (newSettings) => {
    setNameSettings(newSettings)
    localStorage.setItem('trace_name_settings', JSON.stringify(newSettings))
    setShowNameDialog(false)
  }

  const formatCustomerName = (name) => {
    if (!name) return '—'
    let n = name.trim()
    const strip = nameSettings.stripWords.split(',').map(s => s.trim()).filter(Boolean)
    strip.forEach(s => {
      const reg = new RegExp(`\\b${s}\\b`, 'gi')
      n = n.replace(reg, '')
    })
    let words = n.split(/\s+/).filter(Boolean)
    if (words.length >= 4 && words.length % 2 === 0) {
      const mid = words.length / 2
      const firstHalf = words.slice(0, mid).join(' ').toLowerCase()
      const secondHalf = words.slice(mid).join(' ').toLowerCase()
      if (firstHalf === secondHalf) words = words.slice(0, mid)
    }
    if (nameSettings.shorten && words.length > 2) words = words.slice(0, 2)
    return words.join(' ') || '—'
  }

  const [agingConfig, setAgingConfig] = useState(() => {
    const saved = localStorage.getItem('trace_aging_config')
    return saved ? JSON.parse(saved) : { criticalLevel: 8, span: 1 }
  })
  const [activeAgingBucket, setActiveAgingBucket] = useState(null)
  const [showAgingConfig, setShowAgingConfig] = useState(false)

  const agingBuckets = useMemo(() => {
    const { criticalLevel, span } = agingConfig
    const buckets = [{ label: 'Day 0', min: 0, max: 0 }]
    for (let i = 1; i < criticalLevel; i += span) {
      const max = Math.min(i + span - 1, criticalLevel - 1)
      buckets.push({ label: i === max ? `Day ${i}` : `Day ${i}-${max}`, min: i, max: max })
    }
    buckets.push({ label: `Day ${criticalLevel}+`, min: criticalLevel, max: 9999 })
    return buckets
  }, [agingConfig])

  const today = new Date(); today.setHours(0,0,0,0)
  const [showAgingBar, setShowAgingBar] = useState(() => localStorage.getItem('trace_show_aging') !== 'false')

  const isBacklogOrder = (o) => {
    const status = (o.delivery_status || '').toLowerCase()
    const hasTracking = !!o.tracking_number && o.tracking_number !== '—' && String(o.tracking_number).length > 3
    const hasCourier = !!o.courier && o.courier !== '—'
    const isOut = ['booked','picked','transit','attempt','delivered','return','cancel','warehouse','available'].some(s => status.includes(s))
    return status.includes('pending') && !hasTracking && !hasCourier && !isOut
  }

  const agingCounts = useMemo(() => {
    const counts = {}
    allOrders.forEach(o => {
      if (!o.order_date || !isBacklogOrder(o)) return
      const d = new Date(o.order_date); d.setHours(0,0,0,0)
      const diff = Math.floor((today - d) / 86400000)
      const b = agingBuckets.find(bucket => diff >= bucket.min && diff <= bucket.max)
      if (b) counts[b.label] = (counts[b.label] || 0) + 1
    })
    return counts
  }, [allOrders, agingBuckets, today])

  const DEFAULT_COLS = [
    { id: 'ref_number', label: 'Order ID' },
    { id: 'order_date', label: 'Date' },
    { id: 'customer_name', label: 'Customer' },
    { id: 'phone', label: 'Phone' },
    { id: 'city', label: 'City' },
    { id: 'price', label: 'Price' },
    { id: 'paid_amount', label: 'Paid Amount' },
    { id: 'diff', label: 'Pending Bal.' },
    { id: 'delivery_status', label: 'Status' },
    { id: 'courier', label: 'Courier' },
    { id: 'tracking_number', label: 'Tracking #' },
    { id: 'edit', label: 'Edit Status' },
    { id: 'payment_date', label: 'P&L Date' },
    { id: 'notes', label: 'Shopify Note' }
  ]
  const [cols, setCols] = useState(() => {
    const saved = localStorage.getItem('trace_search_cols')
    return saved ? JSON.parse(saved) : DEFAULT_COLS
  })
  const [draggedIdx, setDraggedIdx] = useState(null)

  useEffect(() => {
    if (location.state) {
      const { preset: p, customStart: cs, customEnd: ce, status: s, keyword: k } = location.state
      if (p) setPreset(p)
      if (cs) setCustomStart(cs)
      if (ce) setCustomEnd(ce)
      if (s) setStatus(s)
      if (k) setKeyword(k)
      window.history.replaceState({}, document.title)
    }
  }, [location.state])

  const [savedViews, setSavedViews] = useState(() => {
    try { return JSON.parse(localStorage.getItem('traceerp_views') || '[]') } catch { return [] }
  })
  const [selectedView, setSelectedView] = useState('')
  const [viewName, setViewName] = useState('')
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [kpi, setKpi] = useState({ total: 0, sum: 0, delivered: 0, returned: 0, pending: 0 })

  useEffect(() => {
    if (!activeStoreId) return
    setLoading(true)
    fetch(`/api/orders?store_id=${activeStoreId}&limit=5000&t=${Date.now()}`)
      .then(r => r.json())
      .then(data => { setAllOrders(data.orders || []); setLoading(false) })
      .catch(() => { addToast('Failed to load orders', 'error'); setLoading(false) })
  }, [activeStoreId])

  const runSearch = useCallback(() => {
    const dateRange = getDateRange(preset, customStart, customEnd)
    const isSpecial = SPECIAL_MODES.includes(status)
    const bypassStatus = status === 'All Statuses' || isSpecial

    let filtered = allOrders.filter(order => {
      order._meta = { colFilters }
      const orderDate = order.order_date ? new Date(order.order_date) : null
      const diff = orderDate ? Math.floor((today - new Date(orderDate).setHours(0,0,0,0)) / 86400000) : -1

      if (activeAgingBucket) {
        if (!isBacklogOrder(order)) return false
        const b = agingBuckets.find(bucket => bucket.label === activeAgingBucket)
        if (b && (diff < b.min || diff > b.max)) return false
      } else if (dateRange && orderDate) {
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
  }, [allOrders, preset, customStart, customEnd, status, keyword, sort, activeAgingBucket, agingBuckets, colFilters])

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

  const updateOrderField = async (orderId, field, value) => {
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value })
      })
      const data = await res.json()
      if (data.order) setAllOrders(prev => prev.map(o => o.id === orderId ? data.order : o))
      else setAllOrders(prev => prev.map(o => o.id === orderId ? { ...o, [field]: value } : o))
      addToast('✅ Saved', 'success')
    } catch {
      addToast('❌ Failed to save', 'error')
    }
  }

  const deliveryRate = kpi.total > 0 ? ((kpi.delivered / kpi.total) * 100).toFixed(1) : 0

  return (
    <div className={`page-container ${compactMode ? 'ultra-compact' : ''}`}>
      
      {/* Aging Config Dialog */}
      {showAgingConfig && (
        <div className="modal-overlay">
          <div className="card modal-content" style={{ width: 360 }}>
            <h3>⚙️ Aging Config</h3>
            <div className="form-group mt-4">
              <label className="form-label">Critical Level (Days)</label>
              <select className="form-select" value={agingConfig.criticalLevel} onChange={e => setAgingConfig(p => ({ ...p, criticalLevel: parseInt(e.target.value) }))}>
                {[3, 5, 7, 8, 10, 14].map(v => <option key={v} value={v}>{v} Days</option>)}
              </select>
            </div>
            <div className="flex gap-2 mt-8">
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => { localStorage.setItem('trace_aging_config', JSON.stringify(agingConfig)); setShowAgingConfig(false); }}>Confirm</button>
              <button className="btn btn-secondary" onClick={() => setShowAgingConfig(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Name Settings Dialog */}
      {showNameDialog && (
        <div className="modal-overlay">
          <div className="card modal-content" style={{ width: 380 }}>
            <h3>🖊️ Name Rules</h3>
            <div className="form-group mt-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={nameSettings.shorten} onChange={e => saveNameSettings({ ...nameSettings, shorten: e.target.checked })} />
                <span className="text-secondary">Shorten names (Max 2 words)</span>
              </label>
            </div>
            <div className="form-group mt-4">
              <label className="form-label">Hide Words (comma separated)</label>
              <textarea className="form-input" rows={3} value={nameSettings.stripWords} onChange={e => setNameSettings({ ...nameSettings, stripWords: e.target.value })} />
            </div>
            <div className="flex gap-2 mt-6">
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => saveNameSettings(nameSettings)}>Save Rules</button>
              <button className="btn btn-secondary" onClick={() => setShowNameDialog(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="sticky-controls">
        <div className="page-header">
          <div>
            <h2>🔍 Command Center</h2>
            {!compactMode && <p>Advanced multi-store search and operations</p>}
          </div>
          <div className="flex gap-2">
            <button className={`btn btn-sm ${compactMode ? 'btn-primary' : 'btn-secondary'}`} onClick={toggleCompact}>
              {compactMode ? '✨ Show KPIs' : '🎯 Focus Mode'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowSaveDialog(true)}>💾 Save View</button>
            <button className="btn btn-primary btn-sm" onClick={runSearch}>🔄 Run Search</button>
          </div>
        </div>

        {!compactMode && (
          <div className="kpi-grid animate-fade" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginBottom: 16 }}>
            {[
              { label: 'Results', value: kpi.total.toLocaleString(), color: 'blue' },
              { label: 'Total Value', value: `Rs ${Math.round(kpi.sum).toLocaleString()}`, color: 'purple' },
              { label: 'Delivered', value: kpi.delivered, color: 'green' },
              { label: 'Returned', value: kpi.returned, color: 'red' },
              { label: 'In Transit', value: kpi.pending, color: 'yellow' },
            ].map(k => (
              <div key={k.label} className="kpi-card card">
                <div className="kpi-label">{k.label}</div>
                <div className="kpi-value text-brand">{k.value}</div>
              </div>
            ))}
          </div>
        )}

        {showAgingBar && (
          <div className="card mb-4" style={{ padding: 8 }}>
            <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', height: 48, background: 'var(--bg-elevated)' }}>
              {agingBuckets.map((b, idx) => {
                const count = agingCounts[b.label] || 0
                const isActive = activeAgingBucket === b.label
                let bg = 'var(--success)'
                if (b.min >= agingConfig.criticalLevel) bg = 'var(--danger)'
                else if (b.min >= agingConfig.criticalLevel - 2) bg = 'var(--warning)'
                
                return (
                  <div 
                    key={b.label}
                    onClick={() => setActiveAgingBucket(isActive ? null : b.label)}
                    className={`aging-bucket ${isActive ? 'active' : ''}`}
                    style={{ flex: 1, background: bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: activeAgingBucket && !isActive ? 0.3 : 1, transition: 'var(--transition)' }}
                  >
                    <span style={{ fontSize: '0.6rem', fontWeight: 800, color: '#fff', opacity: 0.8 }}>{b.label}</span>
                    <span style={{ fontSize: '1rem', fontWeight: 800, color: '#fff' }}>{count}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="card mb-4" style={{ padding: 16 }}>
          <div className="form-grid-3" style={{ gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label className="form-label">📅 Date Preset</label>
              <select className="form-select" value={preset} onChange={e => setPreset(e.target.value)}>
                {DATE_PRESETS.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">🏷️ Status</label>
              <select className="form-select" value={status} onChange={e => setStatus(e.target.value)}>
                {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label className="form-label">🔑 Search Keyword</label>
              <input className="form-input" placeholder="Name, City, ID..." value={keyword} onChange={e => setKeyword(e.target.value)} onKeyDown={e => e.key === 'Enter' && runSearch()} />
            </div>
            <div>
              <label className="form-label">🗂️ Sort</label>
              <select className="form-select" value={sort} onChange={e => setSort(e.target.value)}>
                {SORT_OPTIONS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">⭐ View</label>
              <select className="form-select" value={selectedView} onChange={e => loadView(e.target.value)}>
                <option value="">Default View</option>
                {savedViews.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="loading-overlay"><span className="loading-spinner"></span> Refreshing records...</div>
      ) : (
        <div className="table-wrapper animate-fade">
          <table>
            <thead>
              <tr>
                {cols.map((col, idx) => (
                  <th key={col.id} style={{ cursor: 'move' }}>{col.label}</th>
                ))}
              </tr>
              <tr className="header-search-row">
                {cols.map(col => (
                  <th key={col.id} style={{ padding: '4px 8px' }}>
                    {['ref_number','customer_name','phone','city','courier','tracking_number','notes'].includes(col.id) && (
                      <input className="header-search-input" placeholder="Filter..." value={colFilters[col.id] || ''} onChange={e => setColFilters(p => ({ ...p, [col.id]: e.target.value }))} />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map(o => {
                const diff = (parseFloat(o.price)||0) - (parseFloat(o.paid_amount)||0)
                const isClear = Math.abs(diff) <= 1
                const badgeClass = getStatusBadgeClass(o.delivery_status)
                const s = (o.delivery_status||'').toLowerCase()
                const orderDate = o.order_date ? new Date(o.order_date) : null
                const daysOld = orderDate ? Math.floor((today-orderDate)/86400000) : 0
                const isCritical = !s.includes('delivered') && !s.includes('return') && daysOld >= 5

                return (
                  <tr key={o.id}>
                    {cols.map(col => {
                      if (col.id === 'ref_number') return (
                        <td key={col.id}>
                          <div className="flex items-center gap-2">
                            <button onClick={() => fetchOrderDetails(o.id)} className="btn btn-secondary btn-sm" style={{ padding: '2px 8px' }}>EDIT</button>
                            <a href={`https://${o.shop_domain}/admin/orders/${o.shopify_order_id}`} target="_blank" rel="noreferrer" className="text-brand font-bold">{o.ref_number || o.shopify_order_id}</a>
                          </div>
                        </td>
                      )
                      if (col.id === 'order_date') return <td key={col.id} style={{ color: isCritical ? 'var(--danger)' : 'inherit', fontWeight: isCritical ? 700 : 400 }}>{o.order_date} {isCritical && <span>({daysOld}d)</span>}</td>
                      if (col.id === 'customer_name') return <td key={col.id}>{formatCustomerName(o.customer_name)}</td>
                      if (col.id === 'phone') return <td key={col.id}>{o.phone ? <a href={`https://wa.me/${o.phone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer" className="text-success">💬 {o.phone}</a> : '—'}</td>
                      if (col.id === 'price') return <td key={col.id} className="font-bold">Rs {Math.round(o.price).toLocaleString()}</td>
                      if (col.id === 'paid_amount') return <td key={col.id}><PaidAmountCell order={o} onSave={updateOrderField} /></td>
                      if (col.id === 'diff') return <td key={col.id} className={!isClear ? 'text-danger' : 'text-success'}>{!isClear ? `Rs ${Math.round(diff).toLocaleString()}` : '✅ Clear'}</td>
                      if (col.id === 'delivery_status') return <td key={col.id}><span className={`badge ${badgeClass}`}>{o.delivery_status || 'Pending'}</span></td>
                      if (col.id === 'courier') return <td key={col.id} className="text-muted">{o.courier || '—'}</td>
                      if (col.id === 'tracking_number') return <td key={col.id}>{o.tracking_number ? <a href="#" className="text-info">🚚 {o.tracking_number}</a> : '—'}</td>
                      if (col.id === 'edit') return (
                        <td key={col.id}>
                          <select className="form-select" style={{ padding: '4px', fontSize: '0.75rem' }} value={o.delivery_status || ''} onChange={e => updateOrderField(o.id, 'delivery_status', e.target.value)}>
                            {['Pending','Booked','Picked Up','In Transit','Delivered','Attempted','Refused','Returned','Cancelled'].map(st => <option key={st} value={st}>{st}</option>)}
                          </select>
                        </td>
                      )
                      if (col.id === 'notes') return <td key={col.id} className="truncate text-muted" style={{ maxWidth: 150 }}>{o.notes || '—'}</td>
                      return <td key={col.id}>—</td>
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Save View Modal */}
      {showSaveDialog && (
        <div className="modal-overlay">
          <div className="card modal-content" style={{ width: 320 }}>
            <h3>💾 Save View</h3>
            <input className="form-input mt-4" placeholder="View Name" value={viewName} onChange={e => setViewName(e.target.value)} />
            <div className="flex gap-2 mt-6">
              <button className="btn btn-primary" onClick={saveView}>Save</button>
              <button className="btn btn-secondary" onClick={() => setShowSaveDialog(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Editor Modal */}
      {editingOrder && (
        <div className="modal-overlay">
          <div className="card modal-content" style={{ maxWidth: 900, width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
             <div className="flex justify-between items-center mb-6">
                <h2>Order Details</h2>
                <button className="btn btn-secondary" onClick={() => setEditingOrder(null)}>Close</button>
             </div>
             <div className="form-grid-2">
                <div className="card bg-elevated">
                   <h4>Line Items</h4>
                   {(editingOrder.line_items || []).map(item => (
                     <div key={item.id} className="flex gap-4 py-4 border-b">
                        <div className="font-bold">{item.title}</div>
                        <div className="ml-auto">Rs {Math.round(item.price).toLocaleString()} × {item.quantity}</div>
                     </div>
                   ))}
                </div>
                <div className="card bg-elevated">
                   <h4>Customer Information</h4>
                   <div className="form-group mt-4">
                      <label className="form-label">Full Name</label>
                      <input className="form-input" value={editingOrder.customer_name || ''} onChange={e => setEditingOrder({...editingOrder, customer_name: e.target.value})} onBlur={() => updateOrderField(editingOrder.id, 'customer_name', editingOrder.customer_name)} />
                   </div>
                   <div className="form-group mt-4">
                      <label className="form-label">Phone</label>
                      <input className="form-input" value={editingOrder.phone || ''} onChange={e => setEditingOrder({...editingOrder, phone: e.target.value})} onBlur={() => updateOrderField(editingOrder.id, 'phone', editingOrder.phone)} />
                   </div>
                </div>
             </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PaidAmountCell({ order, onSave }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(order.paid_amount || '')
  useEffect(() => { setVal(order.paid_amount || '') }, [order.paid_amount])
  const commit = () => {
    const num = parseFloat(val)
    if (!isNaN(num) && num !== parseFloat(order.paid_amount || 0)) onSave(order.id, 'paid_amount', num)
    setEditing(false)
  }
  if (editing) return <input type="number" className="form-input" style={{ width: 80, padding: 4 }} value={val} autoFocus onChange={e => setVal(e.target.value)} onBlur={commit} onKeyDown={e => e.key === 'Enter' && commit()} />
  return <span onClick={() => setEditing(true)} className="cursor-pointer font-bold">{order.paid_amount ? `Rs ${Math.round(order.paid_amount).toLocaleString()}` : '—'} ✏️</span>
}
