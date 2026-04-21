import { useState, useEffect, useCallback, useMemo } from 'react'
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
  
  const matchesGlobal = includes.every(t => expanded.includes(t)) && !excludes.some(e => expanded.includes(e))
  if (!matchesGlobal) return false

  // Add column specific filters if any
  const { colFilters } = order._meta || {} // We will attach this in runSearch
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
  const [colFilters, setColFilters] = useState({
    ref_number: '', customer_name: '', city: '', phone: '', status: '', courier: '', tracking_number: '', notes: ''
  })
  const [compactMode, setCompactMode] = useState(() => localStorage.getItem('search_compact') === 'true')
  const [editingOrder, setEditingOrder] = useState(null)
  const [editorLoading, setEditorLoading] = useState(false)

  const fetchOrderDetails = async (orderId) => {
    setEditorLoading(true)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/orders/${orderId}/details`)
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

  // ─── Name Cleaning Logic ─────────────────
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
    
    // 1. Strip words
    const strip = nameSettings.stripWords.split(',').map(s => s.trim()).filter(Boolean)
    strip.forEach(s => {
      const reg = new RegExp(`\\b${s}\\b`, 'gi')
      n = n.replace(reg, '')
    })

    // 2. Clean extra spaces
    let words = n.split(/\s+/).filter(Boolean)
    
    // 3. Deduplicate (e.g. "John Doe John Doe")
    if (words.length >= 4 && words.length % 2 === 0) {
      const mid = words.length / 2
      const firstHalf = words.slice(0, mid).join(' ').toLowerCase()
      const secondHalf = words.slice(mid).join(' ').toLowerCase()
      if (firstHalf === secondHalf) words = words.slice(0, mid)
    }

    // 4. Shorten to max 2 words
    if (nameSettings.shorten && words.length > 2) {
      words = words.slice(0, 2)
    }

    return words.join(' ') || '—'
  }

  // ─── Aging Logic ─────────────────────────
  const [agingConfig, setAgingConfig] = useState(() => {
    const saved = localStorage.getItem('trace_aging_config')
    return saved ? JSON.parse(saved) : { criticalLevel: 8, span: 1 }
  })
  const [activeAgingBucket, setActiveAgingBucket] = useState(null)
  const [showAgingConfig, setShowAgingConfig] = useState(false)

  const getAgingBuckets = () => {
    const { criticalLevel, span } = agingConfig
    const buckets = [{ label: 'Day 0', min: 0, max: 0 }]
    
    for (let i = 1; i < criticalLevel; i += span) {
      const max = Math.min(i + span - 1, criticalLevel - 1)
      buckets.push({ 
        label: i === max ? `Day ${i}` : `Day ${i}-${max}`, 
        min: i, 
        max: max 
      })
    }
    buckets.push({ label: `Day ${criticalLevel}+`, min: criticalLevel, max: 9999 })
    return buckets
  }

  const agingBuckets = useMemo(() => getAgingBuckets(), [agingConfig])
  const today = new Date(); today.setHours(0,0,0,0)
  const [showAgingBar, setShowAgingBar] = useState(() => localStorage.getItem('trace_show_aging') !== 'false')

  const toggleAgingBar = () => {
    setShowAgingBar(prev => {
      localStorage.setItem('trace_show_aging', !prev)
      return !prev
    })
  }

  const isBacklogOrder = (o) => {
    const status = (o.delivery_status || '').toLowerCase()
    const hasTracking = !!o.tracking_number && o.tracking_number !== '—' && String(o.tracking_number).length > 3
    const hasCourier = !!o.courier && o.courier !== '—'
    
    // Statuses that imply it's NOT in the warehouse anymore
    const isOut = status.includes('booked') || 
                  status.includes('picked') || 
                  status.includes('transit') || 
                  status.includes('attempt') || 
                  status.includes('delivered') || 
                  status.includes('return') ||
                  status.includes('cancel') ||
                  status.includes('warehouse') ||
                  status.includes('available')

    // It's ONLY a backlog if it's Pending AND has no tracking/courier AND isn't already "Out"
    return status.includes('pending') && !hasTracking && !hasCourier && !isOut
  }

  const getAgingCounts = (orders) => {
    const counts = {}
    orders.forEach(o => {
      if (!o.order_date || !isBacklogOrder(o)) return
      
      const d = new Date(o.order_date); d.setHours(0,0,0,0)
      const diff = Math.floor((today - d) / 86400000)
      const b = agingBuckets.find(bucket => diff >= bucket.min && diff <= bucket.max)
      if (b) counts[b.label] = (counts[b.label] || 0) + 1
    })
    return counts
  }
  const agingCounts = getAgingCounts(allOrders)

  // ─── Drag & Drop Columns ─────────────────
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

  const onDragStart = (idx) => setDraggedIdx(idx)
  const onDragOver = (e) => e.preventDefault()
  const onDrop = (targetIdx) => {
    if (draggedIdx === null) return
    const newCols = [...cols]
    const [removed] = newCols.splice(draggedIdx, 1)
    newCols.splice(targetIdx, 0, removed)
    setCols(newCols)
    localStorage.setItem('trace_search_cols', JSON.stringify(newCols))
    setDraggedIdx(null)
  }

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
      // Inject colFilters for matchesSearch to use
      order._meta = { colFilters }
      
      const orderDate = order.order_date ? new Date(order.order_date) : null
      const diff = orderDate ? Math.floor((today - new Date(orderDate).setHours(0,0,0,0)) / 86400000) : -1

      // 1. Aging Bucket Filter (Bypasses Date Preset when active)
      if (activeAgingBucket) {
        if (!isBacklogOrder(order)) return false
        const b = agingBuckets.find(bucket => bucket.label === activeAgingBucket)
        if (b && (diff < b.min || diff > b.max)) return false
      } else if (dateRange && orderDate) {
        // Only apply Date Preset if no Aging Bucket is active
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
  }, [allOrders, preset, customStart, customEnd, status, keyword, sort, activeAgingBucket, agingBuckets])

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
    <div className={compactMode ? 'ultra-compact' : ''}>
      
      {/* Aging Config Dialog */}
      {showAgingConfig && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1002, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: 360, padding: 24 }}>
            <div style={{ fontWeight: 700, marginBottom: 20, fontSize: '1.1rem' }}>⚙️ Configure Aging Bar</div>
            
            <div className="form-group">
              <label className="form-label">Critical Level (Days until Red)</label>
              <select 
                className="form-select" 
                value={agingConfig.criticalLevel}
                onChange={e => setAgingConfig(prev => ({ ...prev, criticalLevel: parseInt(e.target.value) }))}
              >
                {[3, 5, 7, 8, 10, 14].map(v => <option key={v} value={v}>{v} Days</option>)}
              </select>
            </div>

            <div className="form-group mt-4">
              <label className="form-label">Aging Span (Grouping)</label>
              <select 
                className="form-select" 
                value={agingConfig.span}
                onChange={e => setAgingConfig(prev => ({ ...prev, span: parseInt(e.target.value) }))}
              >
                {[1, 2, 3].map(v => <option key={v} value={v}>{v} Day{v > 1 ? 's' : ''}</option>)}
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: 380, padding: 24 }}>
            <div style={{ fontWeight: 700, marginBottom: 18, fontSize: '1.1rem' }}>🖊️ Customer Name Rules</div>
            
            <div className="form-group">
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={nameSettings.shorten} 
                  onChange={e => saveNameSettings({ ...nameSettings, shorten: e.target.checked })} 
                />
                <span style={{ fontSize: '0.85rem' }}>Limit to max 2 words (Short View)</span>
              </label>
            </div>

            <div className="form-group mt-4">
              <label className="form-label">Hide Words (comma separated)</label>
              <textarea 
                className="form-textarea" 
                rows={3}
                placeholder="e.g. Mr, Ms, Dr, Malik"
                value={nameSettings.stripWords}
                onChange={e => setNameSettings({ ...nameSettings, stripWords: e.target.value })}
                style={{ fontSize: '0.8rem' }}
              />
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 6 }}>
                These words will be hidden from the Customer column automatically.
              </p>
            </div>

            <div className="flex gap-2 mt-6">
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => saveNameSettings(nameSettings)}>Save Instructions</button>
              <button className="btn btn-secondary" onClick={() => setShowNameDialog(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      <div className="sticky-controls">
        <div className="page-header" style={compactMode ? { marginBottom: 8 } : {}}>
          <div>
            <h2 style={compactMode ? { fontSize: '1rem' } : {}}>🔍 Command Center</h2>
            {!compactMode && <p>Advanced search, filter, and order management</p>}
          </div>
          <div className="flex gap-2">
            <button 
              className={`btn btn-sm ${compactMode ? 'btn-primary' : 'btn-secondary'}`} 
              onClick={toggleCompact}
              title={compactMode ? 'Show Full Stats' : 'Focus Mode (Hide Stats)'}
            >
              {compactMode ? '✨ Show KPIs' : '🎯 Focus Mode'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowSaveDialog(true)}>💾 Save View</button>
            {selectedView && <button className="btn btn-danger btn-sm" onClick={deleteView}>🗑 Delete View</button>}
            <button className="btn btn-primary btn-sm" onClick={runSearch}>🔄 Run Search</button>
          </div>
        </div>

        {!compactMode && (
          <>
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
            <div className="card mb-4" style={{ padding: '8px 16px' }}>
              <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: 'var(--bg-elevated)', marginBottom: 8 }}>
                <div style={{ width: `${(kpi.delivered / kpi.total * 100) || 0}%`, background: 'var(--green)' }}></div>
                <div style={{ width: `${(kpi.returned / kpi.total * 100) || 0}%`, background: 'var(--red)' }}></div>
                <div style={{ width: `${(kpi.pending / kpi.total * 100) || 0}%`, background: 'var(--yellow)' }}></div>
              </div>
              <div className="flex gap-3" style={{ fontSize: '0.68rem', fontWeight: 600 }}>
                <span style={{ color: 'var(--green)' }}>Delivered: {deliveryRate}%</span>
                <span style={{ color: 'var(--red)' }}>Returned: {((kpi.returned / kpi.total * 100) || 0).toFixed(1)}%</span>
                <span style={{ color: 'var(--yellow)' }}>In Transit: {kpi.pending}</span>
              </div>
            </div>
          </>
        )}

        <div className="card" style={{ padding: compactMode ? '8px 12px' : '14px 16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showAgingBar ? 10 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>📊 Pending by Operations</div>
              <button 
                onClick={toggleAgingBar} 
                style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5, fontSize: '0.75rem', padding: '2px 6px' }}
                title={showAgingBar ? 'Hide Bar' : 'Show Bar'}
              >
                {showAgingBar ? '🙈 Hide' : '👁️ Show'}
              </button>
            </div>
            <button onClick={() => setShowAgingConfig(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6, fontSize: '0.9rem' }}>⚙️</button>
          </div>
          
          {showAgingBar && (
            <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', height: 44, border: '1px solid var(--border)', transition: 'all 0.3s ease' }}>
              {agingBuckets.map((b, idx) => {
                const count = agingCounts[b.label] || 0
                const isActive = activeAgingBucket === b.label
                // Color logic: green -> brown -> red
                let bg = 'var(--green)'
                if (b.min >= agingConfig.criticalLevel) bg = '#c53030' // Red
                else if (b.min >= agingConfig.criticalLevel - 2) bg = '#975a5e' // Brownish
                
                return (
                  <div 
                    key={b.label}
                    onClick={() => setActiveAgingBucket(isActive ? null : b.label)}
                    style={{ 
                      flex: 1, 
                      background: bg, 
                      display: 'flex', 
                      flexDirection: 'column', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      cursor: 'pointer',
                      opacity: activeAgingBucket && !isActive ? 0.3 : 1,
                      borderRight: idx < agingBuckets.length - 1 ? '1px solid rgba(255,255,255,0.1)' : 'none',
                      transition: 'all 0.2s',
                      position: 'relative'
                    }}
                  >
                    <div style={{ fontSize: '0.62rem', fontWeight: 800, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', marginBottom: 2 }}>{b.label}</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#fff' }}>{count}</div>
                    {isActive && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: '#fff' }}></div>}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="card" style={{ padding: compactMode ? '8px 12px' : '14px 16px', marginBottom: 16 }}>
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
              <label className="form-label">🔑 Keyword</label>
              <input className="form-input" placeholder="name, city, tracking..." value={keyword} onChange={e => setKeyword(e.target.value)} onKeyDown={e => e.key === 'Enter' && runSearch()} />
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
                <option value="">— Select View —</option>
                {savedViews.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
              </select>
            </div>
          </div>
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
          <table className="draggable-table">
            <thead>
              <tr>
                {cols.map((col, idx) => (
                  <th 
                    key={col.id}
                    draggable
                    onDragStart={() => onDragStart(idx)}
                    onDragOver={onDragOver}
                    onDrop={() => onDrop(idx)}
                    style={{ cursor: 'move', userSelect: 'none' }}
                  >
                    {col.label}
                    {col.id === 'customer_name' && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); setShowNameDialog(true); }} 
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.7rem', marginLeft: 4, opacity: 0.5 }}
                        title="Edit Name Rules"
                      >
                        🖊️
                      </button>
                    )}
                  </th>
                ))}
              </tr>
              <tr className="header-search-row">
                {cols.map(col => {
                  const isFiltered = ['ref_number','customer_name','phone','city','courier','tracking_number','notes'].includes(col.id);
                  return (
                    <th key={col.id} style={{ padding: '4px 8px' }}>
                      {isFiltered && (
                        <input 
                          className="header-search-input"
                          placeholder="Search..."
                          value={colFilters[col.id] || ''}
                          onChange={e => setColFilters(prev => ({ ...prev, [col.id]: e.target.value }))}
                        />
                      )}
                    </th>
                  )
                })}
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
                    {cols.map(col => {
                      if (col.id === 'ref_number') return (
                        <td key={col.id}>
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => fetchOrderDetails(o.id)}
                              className="btn btn-primary btn-sm"
                              style={{ padding: '2px 6px', fontSize: '0.65rem', whiteSpace: 'nowrap' }}
                              title="Edit Full Order"
                            >
                              ✏️ EDIT
                            </button>
                            <a href={`https://${o.shop_domain}/admin/orders/${o.shopify_order_id}`} target="_blank" rel="noreferrer" style={{ color: 'var(--brand)', fontSize: '0.75rem', textDecoration: 'none', fontWeight: 600 }}>
                              {o.ref_number || o.shopify_order_id}
                            </a>
                          </div>
                        </td>
                      )
                      if (col.id === 'order_date') return (
                        <td key={col.id} style={{ fontSize: '0.75rem', color: dateAged ? 'var(--orange)' : 'var(--text-muted)', fontWeight: dateAged ? 700 : 400 }}>
                          {o.order_date || '—'}
                          {dateAged && <span style={{ fontSize: '0.65rem', marginLeft: 4 }}>{daysOld}d</span>}
                        </td>
                      )
                      if (col.id === 'customer_name') return (
                        <td key={col.id} title={o.customer_name}>
                          {formatCustomerName(o.customer_name)}
                        </td>
                      )
                      if (col.id === 'phone') return (
                        <td key={col.id} style={{ fontSize: '0.75rem' }}>
                          {o.phone ? <a href={`https://wa.me/${o.phone.replace(/\D/g,'').replace(/^0/,'92')}`} target="_blank" rel="noreferrer" style={{ color: 'var(--green)', textDecoration: 'none' }}>💬 {o.phone}</a> : '—'}
                        </td>
                      )
                      if (col.id === 'city') return <td key={col.id}>{o.city || '—'}</td>
                      if (col.id === 'price') return <td key={col.id} style={{ fontWeight: 700 }}>Rs {Math.round(parseFloat(o.price)||0).toLocaleString()}</td>
                      if (col.id === 'paid_amount') return <td key={col.id}><PaidAmountCell order={o} onSave={updateOrderField} /></td>
                      if (col.id === 'diff') return (
                        <td key={col.id} style={{ color: diff > 1 && s.includes('delivered') ? 'var(--red)' : 'var(--text-muted)', fontWeight: diff > 1 && s.includes('delivered') ? 700 : 400 }}>
                          {!isClear ? `Rs ${Math.round(diff).toLocaleString()}` : <span style={{color:'var(--green)'}}>✅ Clear</span>}
                        </td>
                      )
                      if (col.id === 'delivery_status') return <td key={col.id}><span className="badge" style={{ background: bg, color }}>{o.delivery_status || 'Pending'}</span></td>
                      if (col.id === 'courier') return <td key={col.id} style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{o.courier || '—'}</td>
                      if (col.id === 'tracking_number') return (
                        <td key={col.id} style={{ fontSize: '0.75rem' }}>
                          {o.tracking_number ? (
                            <a href={(o.courier||'').toLowerCase().includes('insta') ? `https://instaworld.com.pk/track/${o.tracking_number}` : `https://merchant.postex.pk/track/${o.tracking_number}`} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)', textDecoration: 'none' }}>🚚 {o.tracking_number}</a>
                          ) : '—'}
                        </td>
                      )
                      if (col.id === 'edit') return (
                        <td key={col.id}>
                          <select className="form-select" style={{ padding: '3px 6px', fontSize: '0.72rem', width: 130 }} value={o.delivery_status || ''} onChange={e => updateOrderField(o.id, 'delivery_status', e.target.value)}>
                            {[
                              'Pending','Booked','Picked Up','In Transit','Out for Delivery','Delivered',
                              'Attempted','Refused','Arrived at Warehouse','Not Available',
                              'Return Initiated','Return Received','Cancelled'
                            ].map(st => <option key={st} value={st}>{st}</option>)}
                          </select>
                        </td>
                      )
                      if (col.id === 'payment_date') return (
                        <td key={col.id} style={{ fontSize: '0.72rem', color: o.payment_date ? 'var(--green)' : 'var(--text-muted)', fontWeight: o.payment_date ? 600 : 400 }}>
                          {o.payment_date ? `📅 ${o.payment_date}` : s.includes('delivered') ? '⚠️ Missing' : '—'}
                        </td>
                      )
                      if (col.id === 'notes') return <td key={col.id}><NoteCell order={o} onSave={updateOrderField} /></td>
                      return <td key={col.id}>—</td>
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Shopify-Style Order Editor Modal ─────────────────────────────────── */}
      {editingOrder && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(4px)' }}>
          <div className="card" style={{ width: '100%', maxWidth: 1100, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', animation: 'slideUp 0.3s ease-out' }}>
            
            {/* Modal Header */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-elevated)' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Order {editingOrder.ref_number || editingOrder.shopify_order_id}</h2>
                  <span className="badge" style={{ background: 'var(--yellow-dim)', color: 'var(--yellow)' }}>{editingOrder.payment_status || 'Pending'}</span>
                  <span className="badge" style={{ background: 'var(--blue-dim)', color: 'var(--blue)' }}>{editingOrder.delivery_status || 'Unfulfilled'}</span>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(editingOrder.order_date).toLocaleString()}</p>
              </div>
              <div className="flex gap-2">
                {editorLoading && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>⏳ Syncing...</span>}
                <button className="btn btn-secondary" onClick={() => setEditingOrder(null)}>Close</button>
              </div>
            </div>

            {/* Modal Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, background: 'var(--bg-app)' }}>
              
              {/* Left Column: Products & Financials */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                
                {/* Products Card */}
                <div className="card" style={{ padding: 0 }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: '0.85rem' }}>🛒 Line Items</div>
                  <div style={{ padding: 16 }}>
                    {(editingOrder.line_items || []).map(item => (
                      <div key={item.id} style={{ display: 'flex', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                        <div style={{ width: 50, height: 50, borderRadius: 6, background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '1px solid var(--border)' }}>
                          {item.image_url ? <img src={item.image_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '0.6rem', fontWeight: 800 }}>{item.sku?.slice(0,3)}</span>}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{item.title}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{item.variant_title} • SKU: {item.sku || '—'}</div>
                        </div>
                        <div style={{ textAlign: 'right', fontSize: '0.85rem' }}>
                          <div>Rs {Math.round(item.price).toLocaleString()} × {item.quantity}</div>
                          <div style={{ fontWeight: 700 }}>Rs {Math.round(item.price * item.quantity).toLocaleString()}</div>
                        </div>
                      </div>
                    ))}
                    {!editingOrder.line_items?.length && (
                      <div style={{ textAlign: 'center', padding: 20 }}>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No items found locally.</p>
                        <button className="btn btn-primary btn-sm" onClick={() => fetchOrderDetails(editingOrder.id)}>🔄 Fetch from Shopify</button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Financials Summary */}
                <div className="card" style={{ padding: 16 }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.8rem' }}>
                     <span>Subtotal</span>
                     <span>Rs {Math.round(editingOrder.price - 250).toLocaleString()}</span>
                   </div>
                   <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.8rem' }}>
                     <span>Shipping</span>
                     <span>Rs 250</span>
                   </div>
                   <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '1rem', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                     <span>Total</span>
                     <span>Rs {Math.round(editingOrder.price).toLocaleString()}</span>
                   </div>
                </div>
              </div>

              {/* Right Column: Customer & Notes */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                
                {/* Notes Card */}
                <div className="card" style={{ padding: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 12 }}>📝 Order Notes</div>
                  <textarea 
                    className="form-textarea" 
                    rows={4} 
                    value={editingOrder.notes || ''} 
                    onChange={e => setEditingOrder({ ...editingOrder, notes: e.target.value })}
                    onBlur={() => updateOrderField(editingOrder.id, 'notes', editingOrder.notes)}
                    style={{ fontSize: '0.8rem' }}
                    placeholder="Enter customer notes..."
                  />
                  <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 8 }}>Notes sync live with Shopify.</p>
                </div>

                {/* Customer Details Card */}
                <div className="card" style={{ padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>👤 Customer</div>
                  </div>
                  
                  <div className="form-group" style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Full Name</label>
                    <input 
                      className="form-input" 
                      value={editingOrder.customer_name || ''} 
                      onChange={e => setEditingOrder({ ...editingOrder, customer_name: e.target.value })}
                      onBlur={() => updateOrderField(editingOrder.id, 'customer_name', editingOrder.customer_name)}
                      style={{ height: 32, fontSize: '0.8rem' }}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Phone</label>
                    <input 
                      className="form-input" 
                      value={editingOrder.phone || ''} 
                      onChange={e => setEditingOrder({ ...editingOrder, phone: e.target.value })}
                      onBlur={() => updateOrderField(editingOrder.id, 'phone', editingOrder.phone)}
                      style={{ height: 32, fontSize: '0.8rem' }}
                    />
                  </div>

                  <div className="form-group">
                    <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Address</label>
                    <textarea 
                      className="form-textarea" 
                      rows={3}
                      value={editingOrder.address || ''} 
                      onChange={e => setEditingOrder({ ...editingOrder, address: e.target.value })}
                      onBlur={() => updateOrderField(editingOrder.id, 'address', editingOrder.address)}
                      style={{ fontSize: '0.8rem' }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
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
// ─── Inline Note Cell ───────────────────────────────────────────────────
function NoteCell({ order, onSave }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(order.notes || '')

  useEffect(() => { setVal(order.notes || '') }, [order.notes])

  const commit = () => {
    if (val !== (order.notes || '')) {
      onSave(order.id, 'notes', val)
    }
    setEditing(false)
  }

  if (editing) {
    return (
      <textarea
        className="form-input"
        style={{ width: 180, height: 60, fontSize: '0.72rem', padding: '4px' }}
        value={val}
        autoFocus
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Escape') setEditing(false) }}
      />
    )
  }

  return (
    <div
      onClick={() => setEditing(true)}
      style={{
        cursor: 'pointer',
        fontSize: '0.72rem',
        color: order.notes ? '#fff' : 'var(--text-muted)',
        maxWidth: 180,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }}
      title={order.notes || 'Click to edit Shopify Note'}
    >
      {order.notes || <span style={{ opacity: 0.3 }}>Empty Note...</span>}
    </div>
  )
}
