import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'

// ─── Status Badge Colors ──────────────────────────────────────────────────────
const ERP_COLORS = {
  'Pending':          { bg: 'rgba(249,115,22,0.08)', color: '#fb923c', border: 'rgba(249,115,22,0.15)' },
  'Confirmed':        { bg: 'rgba(59,130,246,0.08)',  color: '#60a5fa', border: 'rgba(59,130,246,0.15)' },
  'Booked':           { bg: 'rgba(139,92,246,0.08)', color: '#a78bfa', border: 'rgba(139,92,246,0.15)' },
  'Picked Up':        { bg: 'rgba(20,184,166,0.08)', color: '#2dd4bf', border: 'rgba(20,184,166,0.15)' },
  'In Transit':       { bg: 'rgba(59,130,246,0.08)',  color: '#60a5fa', border: 'rgba(59,130,246,0.15)' },
  'Out for Delivery': { bg: 'rgba(250,204,21,0.08)', color: '#facc15', border: 'rgba(250,204,21,0.15)' },
  'Attempted':        { bg: 'rgba(249,115,22,0.08)', color: '#fb923c', border: 'rgba(249,115,22,0.15)' },
  'Shipper Advice':   { bg: 'rgba(239,68,68,0.08)',  color: '#f87171', border: 'rgba(239,68,68,0.15)' },
  'Undelivered':      { bg: 'rgba(239,68,68,0.08)',  color: '#f87171', border: 'rgba(239,68,68,0.15)' },
  'Refused':          { bg: 'rgba(239,68,68,0.08)',  color: '#ef4444', border: 'rgba(239,68,68,0.15)' },
  'Delivered':        { bg: 'rgba(34,197,94,0.08)',  color: '#4ade80', border: 'rgba(34,197,94,0.15)' },
  'Return Initiated': { bg: 'rgba(168,85,247,0.08)', color: '#c084fc', border: 'rgba(168,85,247,0.15)' },
  'Returned':         { bg: 'rgba(239,68,68,0.08)',  color: '#ef4444', border: 'rgba(239,68,68,0.15)' },
  'Cancelled':        { bg: 'rgba(107,114,128,0.08)',color: '#9ca3af', border: 'rgba(107,114,128,0.15)' },
}

const MATCH_META = {
  exact:    { label: 'EXACT',    bg: 'rgba(59,130,246,0.08)',  color: '#60a5fa', border: 'rgba(59,130,246,0.15)',  icon: '⚡' },
  wildcard: { label: 'WILDCARD', bg: 'rgba(249,115,22,0.08)', color: '#fb923c', border: 'rgba(249,115,22,0.15)', icon: '✱' },
  regex:    { label: 'REGEX',    bg: 'rgba(239,68,68,0.08)',  color: '#f87171', border: 'rgba(239,68,68,0.15)',  icon: '.*' },
}

function ErpBadge({ status }) {
  const c = ERP_COLORS[status] || { bg: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)', border: 'var(--border)' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '3px 8px', borderRadius: 6, fontSize: '0.72rem',
      fontWeight: 600, background: c.bg, color: c.color, border: `1px solid ${c.border}`,
    }}>
      {status}
    </span>
  )
}

function MatchBadge({ type }) {
  const m = MATCH_META[type] || MATCH_META.exact
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 6px', borderRadius: 4, fontSize: '0.62rem',
      fontWeight: 700, fontFamily: 'monospace',
      background: m.bg, color: m.color, border: `1px solid ${m.border}`,
    }}>
      <span>{m.icon}</span> {m.label}
    </span>
  )
}

export default function StatusMappingManager() {
  const [mappings, setMappings] = useState([])
  const [erpStatuses, setErpStatuses] = useState([])
  const [couriers, setCouriers] = useState(['All', 'PostEx', 'Instaworld'])
  const [loading, setLoading] = useState(true)
  const { addToast, user, activeStoreId } = useApp()
  const [showAdd, setShowAdd] = useState(false)
  const [newMapping, setNewMapping] = useState({ courier: 'All', courier_status: '', erp_status: 'Pending', matching_type: 'exact' })
  const [editingId, setEditingId] = useState(null)
  const [editData, setEditData] = useState({})
  const [conflicts, setConflicts] = useState([])
  
  // Filtering & Search
  const [filterCourier, setFilterCourier] = useState('All')
  const [filterMode, setFilterMode] = useState('All')
  const [search, setSearch] = useState('')

  // Simulator
  const [testStatus, setTestStatus] = useState('')
  const [testCourier, setTestCourier] = useState('All')
  const [testResult, setTestResult] = useState(null)
  const [testLoading, setTestLoading] = useState(false)

  // Schedules
  const [schedules, setSchedules] = useState([])
  const [schedulerLoading, setSchedulerLoading] = useState(true)

  // Live Logs Terminal Console
  const [liveLogs, setLiveLogs] = useState({ type: 'None', logs: [], created_at: null })
  const [showLogsConsole, setShowLogsConsole] = useState(false)
  const [logsLoading, setLogsLoading] = useState(false)

  const fetchLiveLogs = async () => {
    setLogsLoading(true)
    try {
      const res = await fetch('/api/sync/live-logs')
      const data = await res.json()
      if (res.ok) {
        setLiveLogs(data)
      }
    } catch (e) {
      console.error('Failed to load live logs:', e)
    } finally {
      setLogsLoading(false)
    }
  }

  useEffect(() => {
    if (showLogsConsole) {
      fetchLiveLogs()
    }
  }, [showLogsConsole])

  const fetchMappings = async () => {
    try {
      const res = await fetch('/api/status-mappings')
      const data = await res.json()
      if (res.ok) {
        setMappings(data.mappings || [])
        setErpStatuses(data.erp_statuses || [])
        setCouriers(data.couriers || ['All', 'PostEx', 'Instaworld'])
        setConflicts(data.conflicts || [])
      } else {
        addToast(data.error || 'Failed to load mappings', 'error')
      }
    } catch (e) {
      addToast('Failed to load mappings', 'error')
    } finally {
      setLoading(false)
    }
  }

  const fetchSchedules = async () => {
    try {
      const res = await fetch('/api/scheduler/schedules')
      const data = await res.json()
      if (res.ok) setSchedules(data)
    } catch (e) {
      addToast('Failed to load schedules', 'error')
    } finally {
      setSchedulerLoading(false)
    }
  }

  useEffect(() => {
    fetchMappings()
    fetchSchedules()
  }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    try {
      const res = await fetch('/api/status-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMapping)
      })
      const data = await res.json()
      if (res.ok) {
        if (data.conflictWarning) {
          addToast(`⚠️ Warning: ${data.conflictWarning}`, 'warning', 6000)
        } else {
          addToast('Mapping rule created', 'success')
        }
        setShowAdd(false)
        setNewMapping({ courier: 'All', courier_status: '', erp_status: 'Pending', matching_type: 'exact' })
        fetchMappings()
      } else {
        addToast(data.error || 'Failed to add mapping', 'error')
      }
    } catch (e) { addToast('Network error', 'error') }
  }

  const handleTestMapping = async (e) => {
    if (e) e.preventDefault()
    if (!testStatus) return
    setTestLoading(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/status-mappings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courier: testCourier, raw_status: testStatus })
      })
      const data = await res.json()
      if (res.ok) setTestResult(data)
      else addToast(data.error || 'Failed to simulate', 'error')
    } catch (e) { addToast('Network error', 'error') }
    finally { setTestLoading(false) }
  }

  const handleToggle = async (id) => {
    try {
      const res = await fetch(`/api/status-mappings/${id}/toggle`, { method: 'PATCH' })
      if (res.ok) {
        setMappings(mappings.map(m => m.id === id ? { ...m, is_active: 1 - m.is_active } : m))
      }
    } catch (e) { addToast('Toggle failed', 'error') }
  }

  const handleToggleFinal = async (id) => {
    try {
      const res = await fetch(`/api/status-mappings/${id}/toggle-final`, { method: 'PATCH' })
      if (res.ok) {
        setMappings(mappings.map(m => m.id === id ? { ...m, is_final: 1 - (m.is_final || 0) } : m))
        addToast('Terminal status lock updated', 'info')
      }
    } catch (e) { addToast('Toggle final status failed', 'error') }
  }

  const handleToggleErpFinal = async (status, enableLock) => {
    try {
      const res = await fetch('/api/status-mappings/toggle-erp-final', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ erp_status: status, is_final: enableLock })
      })
      const data = await res.json()
      if (res.ok) {
        setMappings(data.mappings || [])
        addToast(`${status} dead status lock ${enableLock ? 'ENABLED 🔒' : 'DISABLED 🔓'}`, enableLock ? 'warning' : 'info')
      }
    } catch (e) { addToast('Toggle dead status failed', 'error') }
  }

  const isStatusLocked = (status) => {
    const defaults = ['Return Received', 'Delivered', 'Cancelled', 'Returned'];
    const matching = mappings.filter(m => m.erp_status?.toLowerCase() === status.toLowerCase());
    if (matching.length > 0) return matching.some(m => m.is_final === 1);
    return defaults.map(d => d.toLowerCase()).includes(status.toLowerCase());
  }

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this rule?')) return
    try {
      const res = await fetch(`/api/status-mappings/${id}`, { method: 'DELETE' })
      if (res.ok) {
        addToast('Mapping deleted', 'success')
        fetchMappings()
      }
    } catch (e) { addToast('Delete failed', 'error') }
  }

  const startEdit = (m) => {
    setEditingId(m.id)
    setEditData({ ...m })
  }

  const saveEdit = async () => {
    try {
      const res = await fetch(`/api/status-mappings/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData)
      })
      const d = await res.json()
      if (res.ok) {
        if (d.conflictWarning) {
          addToast(`⚠️ Warning: ${d.conflictWarning}`, 'warning', 6000)
        } else {
          addToast('Rule updated successfully', 'success')
        }
        setEditingId(null)
        fetchMappings()
      } else {
        addToast(d.error || 'Update failed', 'error')
      }
    } catch (e) { addToast('Network error', 'error') }
  }

  const handleUpdateSchedule = async (id, interval, active) => {
    try {
      const res = await fetch(`/api/scheduler/schedules/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval_minutes: interval, is_active: active ? 1 : 0 })
      })
      if (res.ok) {
        addToast('Scheduler updated', 'success')
        fetchSchedules()
      }
    } catch (e) { addToast('Scheduler update failed', 'error') }
  }

  const handleTriggerSync = async (id) => {
    try {
      addToast('Triggering sync...', 'info')
      const res = await fetch(`/api/scheduler/trigger/${id}?store_id=${activeStoreId}`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        addToast(data.message || 'Sync started in background', 'success')
        fetchSchedules()
      } else {
        addToast(data.error || 'Failed to trigger sync', 'error')
      }
    } catch (e) { addToast('Sync trigger failed', 'error') }
  }

  // Row filtering
  const visibleMappings = mappings.filter(m => {
    if (filterCourier !== 'All' && m.courier !== filterCourier) return false
    if (filterMode === 'final' && !m.is_final) return false
    if (filterMode !== 'All' && filterMode !== 'final' && (m.matching_type || 'exact') !== filterMode) return false
    if (search) {
      const s = search.toLowerCase()
      return m.courier_status.toLowerCase().includes(s) || m.erp_status.toLowerCase().includes(s)
    }
    return true
  })

  // Numeric stats calculations
  const stats = {
    total: mappings.length,
    active: mappings.filter(m => m.is_active).length,
    finalLocks: mappings.filter(m => m.is_final).length,
    wildcard: mappings.filter(m => m.matching_type === 'wildcard').length,
    regex: mappings.filter(m => m.matching_type === 'regex').length,
  }

  if (user?.role !== 'admin') {
    return (
      <div className="page-container" style={{ textAlign: 'center', paddingTop: 100 }}>
        <div style={{ fontSize: '4rem' }}>🔒</div>
        <h2>Access Denied</h2>
        <p style={{ color: 'var(--text-muted)' }}>Only administrators can manage status mappings.</p>
      </div>
    )
  }

  return (
    <div className="page-container" style={{ maxWidth: 1440, margin: '0 auto', padding: '24px' }}>
      
      {/* ── Page Header ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'var(--text-bright)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>🗺️</span> Status Mapping Manager
          </h2>
          <p style={{ margin: '4px 0 0', opacity: 0.5, fontSize: 13 }}>
            Map raw courier status values to internal ERP lifecycle stages dynamically
          </p>
        </div>
        <button
          className="btn btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 38, borderRadius: 8 }}
          onClick={() => setShowAdd(!showAdd)}
        >
          {showAdd ? '✕ Close Form' : '＋ Add Mapping Rule'}
        </button>
      </div>

      {/* ── Stats Dashboard Grid ────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Total Rules', value: stats.total, color: 'var(--brand)', icon: '📋' },
          { label: 'Active Rules', value: stats.active, color: '#4ade80', icon: '🟢' },
          { label: 'Dead Status Locks', value: stats.finalLocks, color: '#ef4444', icon: '🔒' },
          { label: 'Wildcard Rules', value: stats.wildcard, color: '#fb923c', icon: '✱' },
          { label: 'Regex Rules', value: stats.regex, color: '#f87171', icon: '.*' },
        ].map(s => (
          <div key={s.label} style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '16px 20px',
            display: 'flex', alignItems: 'center', gap: 16,
          }}>
            <div style={{ fontSize: '1.6rem' }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4, fontWeight: 500 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 🚨 Overlap / Rule Conflicts Alert Banner */}
      {conflicts.length > 0 && (
        <div style={{
          background: 'rgba(239,68,68,0.06)',
          border: '1px solid rgba(239,68,68,0.18)',
          borderRadius: 12,
          padding: '16px 20px',
          marginBottom: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 8
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f87171', fontWeight: 700, fontSize: '0.9rem' }}>
            <span>🚨</span> Overlapping Rule Conflicts Detected ({conflicts.length})
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {conflicts.map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#f87171', fontSize: '1rem' }}>•</span>
                <span>{c.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 🔒 Dead Status Control Panel */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '20px',
        marginBottom: 28,
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-bright)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🔒</span> Dead Status Lock Control Panel (Internal ERP States)
            </h3>
            <p style={{ margin: '4px 0 0', opacity: 0.65, fontSize: 12 }}>
              Internal ERP states (like <strong>Return Received</strong> from warehouse scanning) do not rely on courier APIs.
              When locked as a <strong>Dead Status</strong>, no courier sync or Shopify sync can overwrite the order's delivery status.
            </p>
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#f87171', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', padding: '5px 12px', borderRadius: 20 }}>
            🔒 {erpStatuses.filter(isStatusLocked).length} Locked Dead Statuses
          </div>
        </div>

        {/* Informational Callout */}
        <div style={{
          padding: '10px 14px',
          borderRadius: 8,
          background: 'rgba(59,130,246,0.05)',
          border: '1px solid rgba(59,130,246,0.15)',
          marginBottom: 16,
          fontSize: '0.8rem',
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: 10
        }}>
          <span style={{ fontSize: '1.1rem' }}>💡</span>
          <div>
            <strong>Internal Action Protection:</strong> Statuses like <span style={{ color: 'var(--brand)', fontWeight: 700 }}>Return Received</span> are set when your team scans parcels in Unified Returns. Locking them prevents background courier syncs (which still report <em>Returned</em>) from overwriting your warehouse receiving.
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
          {erpStatuses.map(status => {
            const locked = isStatusLocked(status);
            const isInternal = status === 'Return Received';
            return (
              <div key={status} style={{
                padding: '12px 14px',
                borderRadius: 10,
                background: locked ? 'rgba(239,68,68,0.05)' : 'rgba(255,255,255,0.015)',
                border: `1px solid ${locked ? 'rgba(239,68,68,0.25)' : 'var(--border)'}`,
                display: 'flex',
                flexDirection: 'column',
                justify: 'space-between',
                gap: 10,
                transition: 'all 0.15s ease'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ErpBadge status={status} />
                    {isInternal && (
                      <span style={{ fontSize: 9, fontWeight: 700, background: 'rgba(59,130,246,0.1)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)', padding: '1px 5px', borderRadius: 4 }}>
                        Warehouse Scan
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 800, color: locked ? '#f87171' : 'var(--text-muted)' }}>
                    {locked ? '🔒 DEAD' : '🔓 OPEN'}
                  </span>
                </div>
                <button
                  type="button"
                  className={`btn btn-sm ${locked ? 'btn-danger' : 'btn-secondary'}`}
                  style={{ width: '100%', fontSize: 11, fontWeight: 700, padding: '6px 0', borderRadius: 6, cursor: 'pointer' }}
                  onClick={() => handleToggleErpFinal(status, !locked)}
                >
                  {locked ? '🔒 Locked (Dead Status)' : '🔓 Click to Lock'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Main Layout Column Split ─────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', gap: 24, alignItems: 'start' }}>
        
        {/* LEFT COLUMN: RULES TABLE & EDITOR */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          
          {/* Add Form Container */}
          {showAdd && (
            <div style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '20px',
            }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: 'var(--text-bright)' }}>
                ✦ Create New Mapping Rule
              </h3>
              <form onSubmit={handleAdd} style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
                <div className="form-group" style={{ flex: '1 1 140px', marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: 11, fontWeight: 600 }}>Courier</label>
                  <select className="form-select btn-sm" value={newMapping.courier} onChange={e => setNewMapping({ ...newMapping, courier: e.target.value })}>
                    {couriers.map(c => <option key={c} value={c}>{c === 'All' ? '🌐 All Couriers' : c}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ flex: '1 1 160px', marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: 11, fontWeight: 600 }}>Match Mode</label>
                  <select className="form-select btn-sm" value={newMapping.matching_type} onChange={e => setNewMapping({ ...newMapping, matching_type: e.target.value })}>
                    <option value="exact">Exact Match (=)</option>
                    <option value="wildcard">Wildcard (✱)</option>
                    <option value="regex">Regular Expression (.*)</option>
                  </select>
                </div>
                <div className="form-group" style={{ flex: '2 1 200px', marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: 11, fontWeight: 600 }}>
                    Status Pattern
                  </label>
                  <input
                    className="form-input btn-sm"
                    style={{ fontFamily: 'monospace', fontSize: 12 }}
                    placeholder={
                      newMapping.matching_type === 'wildcard' ? 'arrived at %' :
                      newMapping.matching_type === 'regex' ? '^en-route to .* warehouse$' :
                      'delivery unsuccessful'
                    }
                    value={newMapping.courier_status}
                    onChange={e => setNewMapping({ ...newMapping, courier_status: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group" style={{ flex: '1 1 160px', marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: 11, fontWeight: 600 }}>ERP Status</label>
                  <select className="form-select btn-sm" value={newMapping.erp_status} onChange={e => {
                    const status = e.target.value;
                    const isLocked = isStatusLocked(status);
                    setNewMapping({
                      ...newMapping,
                      erp_status: status,
                      is_final: isLocked ? 1 : newMapping.is_final,
                      courier_status: newMapping.courier_status || (status === 'Return Received' ? 'return_received' : '')
                    });
                  }}>
                    {erpStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={!!newMapping.is_final}
                      onChange={e => setNewMapping({ ...newMapping, is_final: e.target.checked ? 1 : 0 })}
                    />
                    <span>🔒 Lock (Dead Status)</span>
                  </label>
                </div>
                <div>
                  <button type="submit" className="btn btn-primary btn-sm" style={{ height: 32, borderRadius: 6, fontWeight: 600 }}>
                    Save Rule
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Table Container Card */}
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 12, overflow: 'hidden',
          }}>
            
            {/* Table Header Filter controls */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', borderBottom: '1px solid var(--border)',
              flexWrap: 'wrap', gap: 12,
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-bright)' }}>
                  Mapping Rules
                </h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <input
                  className="form-input btn-sm"
                  placeholder="🔎 Search statuses..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ width: 180, borderRadius: 6 }}
                />
                <select className="form-select btn-sm" value={filterCourier} onChange={e => setFilterCourier(e.target.value)} style={{ borderRadius: 6 }}>
                  <option value="All">All Couriers</option>
                  {couriers.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select className="form-select btn-sm" value={filterMode} onChange={e => setFilterMode(e.target.value)} style={{ borderRadius: 6 }}>
                  <option value="All">All Modes</option>
                  <option value="final">🔒 Dead Status Locks</option>
                  <option value="exact">Exact</option>
                  <option value="wildcard">Wildcard</option>
                  <option value="regex">Regex</option>
                </select>
              </div>
            </div>

            {/* Rules Listing Table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.01)', borderBottom: '1px solid var(--border)' }}>
                    {['Courier', 'Mode', 'Raw Courier Pattern', '', 'ERP Target', 'Terminal Lock', 'Active', 'Actions'].map((h, idx) => (
                      <th key={idx} style={{
                        padding: '12px 16px', textAlign: idx === 7 ? 'right' : 'left',
                        fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                        color: 'var(--text-muted)', letterSpacing: '0.05em',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="8" style={{ textAlign: 'center', padding: 48, opacity: 0.5 }}>Loading mapping rules...</td></tr>
                  ) : visibleMappings.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
                        No status rules matched the active search filters.
                      </td>
                    </tr>
                  ) : visibleMappings.map((m, idx) => (
                    <tr key={m.id} style={{
                      borderBottom: '1px solid var(--border)',
                      background: editingId === m.id ? 'rgba(59,130,246,0.03)' : idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.005)',
                      opacity: m.is_active ? 1 : 0.5,
                      transition: 'all 0.15s ease',
                    }}>
                      
                      {/* Courier Name */}
                      <td style={{ padding: '10px 16px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {editingId === m.id ? (
                          <select className="form-select btn-sm" value={editData.courier} onChange={e => setEditData({ ...editData, courier: e.target.value })}>
                            {couriers.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        ) : (
                          <span style={{ opacity: 0.85 }}>{m.courier}</span>
                        )}
                      </td>

                      {/* Matching mode type */}
                      <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                        {editingId === m.id ? (
                          <select className="form-select btn-sm" value={editData.matching_type || 'exact'} onChange={e => setEditData({ ...editData, matching_type: e.target.value })}>
                            <option value="exact">Exact</option>
                            <option value="wildcard">Wildcard</option>
                            <option value="regex">Regex</option>
                          </select>
                        ) : (
                          <MatchBadge type={m.matching_type || 'exact'} />
                        )}
                      </td>

                      {/* Pattern String */}
                      <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                        {editingId === m.id ? (
                          <input className="form-input btn-sm" style={{ width: '100%', fontFamily: 'monospace' }}
                            value={editData.courier_status} onChange={e => setEditData({ ...editData, courier_status: e.target.value })} />
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ color: 'var(--text-bright)', opacity: 0.9 }}>{m.courier_status}</span>
                            {conflicts.some(c => c.ruleId1 === m.id || c.ruleId2 === m.id) && (
                              <span 
                                title="Overlapping Rule Conflict" 
                                style={{ 
                                  fontSize: '0.65rem', 
                                  background: 'rgba(239,68,68,0.1)', 
                                  color: '#f87171', 
                                  border: '1px solid rgba(239,68,68,0.2)',
                                  borderRadius: 4,
                                  padding: '1px 5px',
                                  fontWeight: 700
                                }}
                              >
                                ⚠️ CLASH
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '10px 4px', opacity: 0.3 }}>→</td>

                      {/* Resulting ERP Status */}
                      <td style={{ padding: '10px 16px' }}>
                        {editingId === m.id ? (
                          <select className="form-select btn-sm" value={editData.erp_status} onChange={e => setEditData({ ...editData, erp_status: e.target.value })}>
                            {erpStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : (
                          <ErpBadge status={m.erp_status} />
                        )}
                      </td>

                      {/* Terminal Lock (is_final) Switch */}
                      <td style={{ padding: '10px 16px' }}>
                        <div
                          onClick={() => handleToggleFinal(m.id)}
                          title="If locked (FINAL), once an order reaches this ERP status, future courier updates will be ignored."
                          style={{
                            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                            fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
                            background: m.is_final ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.04)',
                            color: m.is_final ? '#f87171' : 'var(--text-muted)',
                            border: `1px solid ${m.is_final ? 'rgba(239,68,68,0.25)' : 'var(--border)'}`,
                          }}
                        >
                          <span>{m.is_final ? '🔒 FINAL' : '🔓 OPEN'}</span>
                        </div>
                      </td>

                      {/* Active Status Switch */}
                      <td style={{ padding: '10px 16px' }}>
                        <div
                          onClick={() => handleToggle(m.id)}
                          style={{
                            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                            fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
                            background: m.is_active ? 'rgba(34,197,94,0.08)' : 'rgba(156,163,175,0.08)',
                            color: m.is_active ? '#4ade80' : '#9ca3af',
                            border: `1px solid ${m.is_active ? 'rgba(34,197,94,0.15)' : 'rgba(156,163,175,0.15)'}`,
                          }}
                        >
                          <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
                          {m.is_active ? 'ACTIVE' : 'OFF'}
                        </div>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                        {editingId === m.id ? (
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            <button className="btn btn-sm btn-primary" style={{ padding: '4px 10px', borderRadius: 4 }} onClick={saveEdit}>Save</button>
                            <button className="btn btn-sm btn-secondary" style={{ padding: '4px 10px', borderRadius: 4 }} onClick={() => setEditingId(null)}>Cancel</button>
                          </div>
                        ) : (
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            <button className="btn btn-sm btn-secondary" style={{ padding: '4px 8px', borderRadius: 4 }} onClick={() => startEdit(m)}>✏️ Edit</button>
                            <button className="btn btn-sm btn-danger" style={{ padding: '4px 8px', borderRadius: 4 }} onClick={() => handleDelete(m.id)}>🗑</button>
                          </div>
                        )}
                      </td>

                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </div>

        </div>

        {/* RIGHT COLUMN: SIMULATOR & SCHEDULER SIDEBAR */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          
          {/* SIMULATOR SANDBOX */}
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '20px',
          }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--text-bright)', display: 'flex', alignItems: 'center', gap: 8 }}>
              ⚡ Match Simulator
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: 11, color: 'var(--text-muted)' }}>
              Test raw API status logs locally to preview active mappings.
            </p>

            <form onSubmit={handleTestMapping} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: 11, fontWeight: 600 }}>Test Courier</label>
                <select className="form-select btn-sm" value={testCourier} onChange={e => setTestCourier(e.target.value)}>
                  {couriers.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: 11, fontWeight: 600 }}>Raw Courier Status String</label>
                <input
                  className="form-input btn-sm"
                  style={{ fontFamily: 'monospace', fontSize: 12 }}
                  placeholder="e.g. arrived at rawalpindi warehouse"
                  value={testStatus}
                  onChange={e => { setTestStatus(e.target.value); setTestResult(null) }}
                  required
                />
              </div>

              <button
                type="submit"
                className="btn btn-secondary btn-sm"
                style={{ height: 32, borderRadius: 6, fontWeight: 600, marginTop: 4 }}
                disabled={testLoading}
              >
                {testLoading ? 'Simulating...' : '⚡ Test Status Match'}
              </button>
            </form>

            {testResult && (
              <div style={{
                marginTop: 16, padding: 12,
                background: 'rgba(255,255,255,0.02)', borderRadius: 8,
                border: '1px solid var(--border)',
                display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Resulting ERP:</span>
                  <ErpBadge status={testResult.mapped_status} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Rule Mode:</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-bright)', fontFamily: 'monospace' }}>
                    {testResult.matched_by}
                  </span>
                </div>
                {testResult.rule_id && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Rule Reference ID:</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand)' }}>#{testResult.rule_id}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* AUTOMATION SCHEDULER */}
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '20px',
          }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--text-bright)' }}>
              ⏰ Background Sync Syncing
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: 11, color: 'var(--text-muted)' }}>
              Manage background courier sync intervals.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {schedulerLoading ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Loading scheduler items...</div>
              ) : schedules.map(s => (
                <div key={s.id} style={{
                  paddingBottom: 14,
                  borderBottom: '1px solid var(--border)',
                  display: 'flex', flexDirection: 'column', gap: 10,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-bright)' }}>
                        {s.courier} <span style={{ opacity: 0.5, fontWeight: 400 }}>({s.sync_type})</span>
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                        Run: {s.last_run_at ? new Date(s.last_run_at).toLocaleTimeString() : 'Never'}
                      </div>
                    </div>

                    <div
                      onClick={() => handleUpdateSchedule(s.id, s.interval_minutes, !s.is_active)}
                      style={{
                        cursor: 'pointer', fontSize: 9, fontWeight: 700,
                        padding: '3px 8px', borderRadius: 20,
                        background: s.is_active ? 'rgba(34,197,94,0.08)' : 'rgba(156,163,175,0.08)',
                        color: s.is_active ? '#4ade80' : '#9ca3af',
                        border: `1px solid ${s.is_active ? 'rgba(34,197,94,0.15)' : 'rgba(156,163,175,0.15)'}`,
                      }}
                    >
                      {s.is_active ? '● ACTIVE' : '○ OFF'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <input
                        type="number"
                        className="form-input btn-sm"
                        value={s.interval_minutes}
                        onChange={e => handleUpdateSchedule(s.id, parseInt(e.target.value), s.is_active)}
                        style={{ width: '100%', height: 28, fontSize: 12 }}
                      />
                    </div>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ height: 28, borderRadius: 6, fontSize: 11, paddingInline: 10, whiteSpace: 'nowrap' }}
                      onClick={() => handleTriggerSync(s.id)}
                    >
                      🔄 Sync Now
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* HELP & DOCUMENTATION CARD */}
          <div style={{
            background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.12)',
            borderRadius: 12, padding: '16px 20px',
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#60a5fa', marginBottom: 6 }}>
              💡 Rule Matching Logic
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              The sync worker resolves raw tracking inputs in sequence:
              <br />
              <span style={{ fontWeight: 600, color: 'var(--text-bright)' }}>1. Exact Match:</span> O(1) direct dictionary match.
              <br />
              <span style={{ fontWeight: 600, color: 'var(--text-bright)' }}>2. Wildcard Pattern:</span> Converts `%` to matches.
              <br />
              <span style={{ fontWeight: 600, color: 'var(--text-bright)' }}>3. Regex Pattern:</span> Complex Regular Expressions.
            </p>
          </div>

        </div>

      </div>

      {/* 📟 Monospace Live Sync Logs Console */}
      <div style={{
        marginTop: 28,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden'
      }}>
        <div 
          onClick={() => setShowLogsConsole(!showLogsConsole)}
          style={{
            padding: '16px 20px',
            background: 'rgba(255,255,255,0.02)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            borderBottom: showLogsConsole ? '1px solid var(--border)' : 'none'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, color: 'var(--text-bright)', fontSize: '0.9rem' }}>
            <span>📟</span> Live Sync Logs Terminal
            {liveLogs.created_at && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                (Last run: {new Date(liveLogs.created_at).toLocaleString()})
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {showLogsConsole && (
              <button 
                onClick={(e) => { e.stopPropagation(); fetchLiveLogs(); }} 
                disabled={logsLoading}
                className="btn btn-secondary btn-sm"
                style={{ padding: '2px 8px', fontSize: '0.7rem', height: 24 }}
              >
                🔄 Refresh Logs
              </button>
            )}
            <span style={{ transform: showLogsConsole ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', fontSize: '0.8rem' }}>▶</span>
          </div>
        </div>

        {showLogsConsole && (
          <div style={{
            background: '#090d16',
            padding: '16px 20px',
            maxHeight: 300,
            overflowY: 'auto',
            fontFamily: 'monospace',
            fontSize: '0.8rem',
            lineHeight: 1.5,
            color: '#34d399'
          }}>
            {logsLoading ? (
              <div style={{ color: 'var(--text-muted)' }}>Loading console stream...</div>
            ) : !liveLogs.logs || liveLogs.logs.length === 0 ? (
              <div style={{ color: 'var(--text-muted)' }}>No logs found for latest sync session.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ color: '#a78bfa', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 6, marginBottom: 6 }}>
                  [CONSOLE SESSION: {liveLogs.type}]
                </div>
                {liveLogs.logs.map((log, index) => (
                  <div key={index} style={{ display: 'flex', gap: 8 }}>
                    <span style={{ color: '#f43f5e', userSelect: 'none' }}>[{index + 1}]</span>
                    {log.id && log.id !== 'SYSTEM' && (
                      <span style={{ color: '#60a5fa', fontWeight: 600 }}>{log.id}:</span>
                    )}
                    <span style={{ color: log.status === 'FAILED' ? '#f43f5e' : log.status === 'ABORTED' ? '#fb923c' : '#34d399' }}>
                      {log.message || log.error || 'Processed'}
                    </span>
                    {log.details && (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>({log.details})</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  )
}
