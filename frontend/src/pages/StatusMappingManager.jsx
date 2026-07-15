import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'

// ─── ERP status colour palette ────────────────────────────────────────────────
const ERP_COLORS = {
  'Pending':          { bg: 'rgba(249,115,22,0.12)', color: '#fb923c', border: 'rgba(249,115,22,0.25)' },
  'Confirmed':        { bg: 'rgba(59,130,246,0.12)',  color: '#60a5fa', border: 'rgba(59,130,246,0.25)' },
  'Booked':           { bg: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: 'rgba(139,92,246,0.25)' },
  'Picked Up':        { bg: 'rgba(20,184,166,0.12)', color: '#2dd4bf', border: 'rgba(20,184,166,0.25)' },
  'In Transit':       { bg: 'rgba(59,130,246,0.12)',  color: '#60a5fa', border: 'rgba(59,130,246,0.25)' },
  'Out for Delivery': { bg: 'rgba(250,204,21,0.12)', color: '#facc15', border: 'rgba(250,204,21,0.25)' },
  'Attempted':        { bg: 'rgba(249,115,22,0.12)', color: '#fb923c', border: 'rgba(249,115,22,0.25)' },
  'Shipper Advice':   { bg: 'rgba(239,68,68,0.10)',  color: '#f87171', border: 'rgba(239,68,68,0.20)' },
  'Undelivered':      { bg: 'rgba(239,68,68,0.10)',  color: '#f87171', border: 'rgba(239,68,68,0.20)' },
  'Refused':          { bg: 'rgba(239,68,68,0.12)',  color: '#ef4444', border: 'rgba(239,68,68,0.25)' },
  'Delivered':        { bg: 'rgba(34,197,94,0.12)',  color: '#4ade80', border: 'rgba(34,197,94,0.25)' },
  'Return Initiated': { bg: 'rgba(168,85,247,0.12)', color: '#c084fc', border: 'rgba(168,85,247,0.25)' },
  'Returned':         { bg: 'rgba(239,68,68,0.12)',  color: '#ef4444', border: 'rgba(239,68,68,0.25)' },
  'Cancelled':        { bg: 'rgba(107,114,128,0.12)',color: '#9ca3af', border: 'rgba(107,114,128,0.25)' },
}

const MATCH_META = {
  exact:    { label: 'EXACT',    bg: 'rgba(59,130,246,0.10)',  color: '#60a5fa', border: 'rgba(59,130,246,0.2)',  icon: '=' },
  wildcard: { label: 'WILDCARD', bg: 'rgba(249,115,22,0.10)', color: '#fb923c', border: 'rgba(249,115,22,0.2)', icon: '*' },
  regex:    { label: 'REGEX',    bg: 'rgba(239,68,68,0.10)',  color: '#f87171', border: 'rgba(239,68,68,0.2)',  icon: '.*' },
}

function ErpBadge({ status }) {
  const c = ERP_COLORS[status] || { bg: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', border: 'var(--border-light)' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem',
      fontWeight: 700, letterSpacing: '0.03em',
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
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
      padding: '2px 8px', borderRadius: 6, fontSize: '0.62rem',
      fontWeight: 800, fontFamily: 'monospace', letterSpacing: '0.05em',
      background: m.bg, color: m.color, border: `1px solid ${m.border}`,
    }}>
      <span style={{ opacity: 0.7 }}>{m.icon}</span> {m.label}
    </span>
  )
}

// ─── Inline styles shared ─────────────────────────────────────────────────────
const S = {
  sectionCard: {
    borderRadius: 14,
    border: '1px solid var(--border-light)',
    background: 'var(--bg-card)',
    overflow: 'hidden',
    marginBottom: 24,
  },
  sectionHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '18px 22px',
    borderBottom: '1px solid var(--border-light)',
    background: 'rgba(255,255,255,0.015)',
  },
  sectionTitle: {
    margin: 0, fontSize: '0.95rem', fontWeight: 700,
    display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-primary)',
  },
  sectionSub: { margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 3 },
  pillTag: {
    fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.08em',
    padding: '2px 8px', borderRadius: 6,
    background: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.2)',
  },
  pillTagBlue: {
    fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.08em',
    padding: '2px 8px', borderRadius: 6,
    background: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)',
  },
}

export default function StatusMappingManager() {
  const [mappings, setMappings] = useState([])
  const [erpStatuses, setErpStatuses] = useState([])
  const [couriers, setCouriers] = useState(['All', 'PostEx', 'Instaworld'])
  const [loading, setLoading] = useState(true)
  const { addToast, user } = useApp()
  const [showAdd, setShowAdd] = useState(false)
  const [newMapping, setNewMapping] = useState({ courier: 'All', courier_status: '', erp_status: 'Pending', matching_type: 'exact' })
  const [editingId, setEditingId] = useState(null)
  const [editData, setEditData] = useState({})
  const [filterCourier, setFilterCourier] = useState('All')
  const [filterMode, setFilterMode] = useState('All')
  const [search, setSearch] = useState('')

  // Simulator
  const [testStatus, setTestStatus] = useState('')
  const [testCourier, setTestCourier] = useState('All')
  const [testResult, setTestResult] = useState(null)
  const [testLoading, setTestLoading] = useState(false)

  const [schedules, setSchedules] = useState([])
  const [schedulerLoading, setSchedulerLoading] = useState(true)

  const fetchMappings = async () => {
    try {
      const res = await fetch('/api/status-mappings')
      const data = await res.json()
      if (res.ok) {
        setMappings(data.mappings || [])
        setErpStatuses(data.erp_statuses || [])
        setCouriers(data.couriers || ['All', 'PostEx', 'Instaworld'])
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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMapping)
      })
      if (res.ok) {
        addToast('Mapping added', 'success')
        setShowAdd(false)
        setNewMapping({ courier: 'All', courier_status: '', erp_status: 'Pending', matching_type: 'exact' })
        fetchMappings()
      } else {
        const d = await res.json()
        addToast(d.error || 'Failed to add mapping', 'error')
      }
    } catch (e) { addToast('Network error', 'error') }
  }

  const handleTestMapping = async (e) => {
    if (e) e.preventDefault()
    if (!testStatus) return
    setTestLoading(true); setTestResult(null)
    try {
      const res = await fetch('/api/status-mappings/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
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
      if (res.ok) setMappings(mappings.map(m => m.id === id ? { ...m, is_active: 1 - m.is_active } : m))
    } catch (e) { addToast('Toggle failed', 'error') }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this mapping rule?')) return
    try {
      const res = await fetch(`/api/status-mappings/${id}`, { method: 'DELETE' })
      if (res.ok) { addToast('Deleted', 'success'); fetchMappings() }
    } catch (e) { addToast('Delete failed', 'error') }
  }

  const startEdit = (m) => { setEditingId(m.id); setEditData({ ...m }) }

  const saveEdit = async () => {
    try {
      const res = await fetch(`/api/status-mappings/${editingId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData)
      })
      if (res.ok) { addToast('Updated', 'success'); setEditingId(null); fetchMappings() }
      else { const d = await res.json(); addToast(d.error || 'Update failed', 'error') }
    } catch (e) { addToast('Network error', 'error') }
  }

  const handleUpdateSchedule = async (id, interval, active) => {
    try {
      const res = await fetch(`/api/scheduler/schedules/${id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval_minutes: interval, is_active: active })
      })
      if (res.ok) { addToast('Schedule updated', 'success'); fetchSchedules() }
    } catch (e) { addToast('Update failed', 'error') }
  }

  const handleTriggerSync = async (id) => {
    addToast('Sync triggered…', 'info')
    try {
      const res = await fetch(`/api/scheduler/trigger/${id}`, { method: 'POST' })
      if (res.ok) { addToast('Sync complete!', 'success'); fetchSchedules() }
    } catch (e) { addToast('Sync failed', 'error') }
  }

  // Filtered rows
  const visibleMappings = mappings.filter(m => {
    if (filterCourier !== 'All' && m.courier !== filterCourier) return false
    if (filterMode !== 'All' && (m.matching_type || 'exact') !== filterMode) return false
    if (search && !m.courier_status.toLowerCase().includes(search.toLowerCase()) &&
        !m.erp_status.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const stats = {
    total:    mappings.length,
    active:   mappings.filter(m => m.is_active).length,
    wildcard: mappings.filter(m => m.matching_type === 'wildcard').length,
    regex:    mappings.filter(m => m.matching_type === 'regex').length,
  }

  if (user?.role !== 'admin') {
    return (
      <div className="page-container" style={{ textAlign: 'center', paddingTop: 100 }}>
        <div style={{ fontSize: '4rem' }}>🔒</div>
        <h2>Access Denied</h2>
        <p style={{ color: 'var(--text-muted)' }}>Only administrators can manage courier status mappings.</p>
      </div>
    )
  }

  return (
    <div className="page-container" style={{ maxWidth: 1300 }}>

      {/* ── Page Header ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: 'linear-gradient(135deg, rgba(59,130,246,0.3), rgba(139,92,246,0.3))',
              border: '1px solid rgba(59,130,246,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem'
            }}>🗺️</div>
            <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>Status Mapping Manager</h2>
          </div>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Map raw courier API statuses → internal ERP lifecycle stages
          </p>
        </div>
        <button
          className="btn btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: 8, height: 40, borderRadius: 10 }}
          onClick={() => setShowAdd(!showAdd)}
        >
          {showAdd ? (
            <><span style={{ fontSize: '1.1rem' }}>✕</span> Close</>
          ) : (
            <><span style={{ fontSize: '1.1rem' }}>+</span> New Mapping Rule</>
          )}
        </button>
      </div>

      {/* ── Stats Row ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total Rules',  value: stats.total,    icon: '📋', color: '#60a5fa' },
          { label: 'Active Rules', value: stats.active,   icon: '✅', color: '#4ade80' },
          { label: 'Wildcard',     value: stats.wildcard, icon: '*',   color: '#fb923c', mono: true },
          { label: 'Regex',        value: stats.regex,    icon: '.*',  color: '#f87171', mono: true },
        ].map(s => (
          <div key={s.label} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-light)',
            borderRadius: 12, padding: '14px 18px',
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9, flexShrink: 0,
              background: `${s.color}18`, border: `1px solid ${s.color}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: s.mono ? '0.8rem' : '1.1rem', fontFamily: s.mono ? 'monospace' : undefined,
              fontWeight: 800, color: s.color,
            }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, lineHeight: 1, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Automation Scheduler ─────────────────────────────────────────────── */}
      <div style={S.sectionCard}>
        <div style={S.sectionHeader}>
          <div>
            <h3 style={S.sectionTitle}>
              ⏰ Automation Scheduler
              <span style={S.pillTagBlue}>LIVE</span>
            </h3>
            <p style={S.sectionSub}>Configure background sync frequency per courier</p>
          </div>
        </div>
        <div style={{ padding: '18px 22px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {schedulerLoading ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: 8 }}>Loading schedules…</div>
          ) : schedules.map(s => (
            <div key={s.id} style={{
              border: '1px solid var(--border-light)', borderRadius: 12,
              padding: '16px 18px', background: 'rgba(255,255,255,0.02)',
              display: 'flex', flexDirection: 'column', gap: 14,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                    {s.courier} <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.8rem' }}>/ {s.sync_type}</span>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 3 }}>
                    Last: {s.last_run_at ? new Date(s.last_run_at).toLocaleTimeString() : 'Never'}
                  </div>
                </div>
                <div
                  onClick={() => handleUpdateSchedule(s.id, s.interval_minutes, !s.is_active)}
                  style={{
                    cursor: 'pointer', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.06em',
                    padding: '3px 10px', borderRadius: 20,
                    background: s.is_active ? 'rgba(34,197,94,0.12)' : 'rgba(107,114,128,0.12)',
                    color: s.is_active ? '#4ade80' : '#9ca3af',
                    border: `1px solid ${s.is_active ? 'rgba(34,197,94,0.25)' : 'rgba(107,114,128,0.2)'}`,
                    transition: 'all 0.2s',
                  }}
                >
                  {s.is_active ? '● ENABLED' : '○ DISABLED'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>
                    Interval (minutes)
                  </label>
                  <input
                    type="number"
                    className="form-input btn-sm"
                    value={s.interval_minutes}
                    onChange={e => handleUpdateSchedule(s.id, parseInt(e.target.value), s.is_active)}
                    style={{ width: '100%' }}
                  />
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ marginTop: 22, whiteSpace: 'nowrap', borderRadius: 8 }}
                  onClick={() => handleTriggerSync(s.id)}
                >
                  🔄 Sync Now
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Add New Mapping Form ─────────────────────────────────────────────── */}
      {showAdd && (
        <div style={{
          ...S.sectionCard,
          border: '1px solid rgba(59,130,246,0.25)',
          background: 'linear-gradient(135deg, rgba(59,130,246,0.04), rgba(139,92,246,0.04))',
        }}>
          <div style={S.sectionHeader}>
            <div>
              <h3 style={{ ...S.sectionTitle, color: '#60a5fa' }}>
                ✦ New Mapping Rule
              </h3>
              <p style={S.sectionSub}>Add a rule to translate a raw courier status into an ERP lifecycle stage</p>
            </div>
          </div>
          <div style={{ padding: '20px 22px' }}>
            <form onSubmit={handleAdd} style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
              <div className="form-group" style={{ flex: '1 1 180px', marginBottom: 0 }}>
                <label className="form-label">Courier</label>
                <select className="form-select" value={newMapping.courier} onChange={e => setNewMapping({ ...newMapping, courier: e.target.value })}>
                  {couriers.map(c => <option key={c} value={c}>{c === 'All' ? '🌐 All Couriers' : c}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: '1 1 210px', marginBottom: 0 }}>
                <label className="form-label">Match Mode</label>
                <select className="form-select" value={newMapping.matching_type} onChange={e => setNewMapping({ ...newMapping, matching_type: e.target.value })}>
                  <option value="exact">= Exact String</option>
                  <option value="wildcard">* Wildcard (e.g. arrived at %)</option>
                  <option value="regex">.* Regular Expression</option>
                </select>
              </div>
              <div className="form-group" style={{ flex: '2 1 280px', marginBottom: 0 }}>
                <label className="form-label">
                  Raw Status Pattern
                  <span style={{ marginLeft: 8, fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                    {newMapping.matching_type === 'wildcard' ? '— use % as wildcard' : newMapping.matching_type === 'regex' ? '— full JS regex syntax' : '— exact string (lowercase)'}
                  </span>
                </label>
                <input
                  className="form-input"
                  style={{ fontFamily: 'monospace' }}
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
              <div className="form-group" style={{ flex: '1 1 190px', marginBottom: 0 }}>
                <label className="form-label">Maps to ERP Status</label>
                <select className="form-select" value={newMapping.erp_status} onChange={e => setNewMapping({ ...newMapping, erp_status: e.target.value })}>
                  {erpStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div style={{ flex: '0 0 auto' }}>
                <button type="submit" className="btn btn-primary" style={{ height: 36, paddingInline: 22, borderRadius: 9 }}>
                  Save Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Mappings Table ───────────────────────────────────────────────────── */}
      <div style={S.sectionCard}>
        <div style={S.sectionHeader}>
          <div>
            <h3 style={S.sectionTitle}>Mapping Rules <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({visibleMappings.length})</span></h3>
            <p style={S.sectionSub}>Raw courier string → ERP status translation table</p>
          </div>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              className="form-input btn-sm"
              placeholder="🔎 Search status…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: 180, borderRadius: 8 }}
            />
            <select className="form-select btn-sm" value={filterCourier} onChange={e => setFilterCourier(e.target.value)} style={{ borderRadius: 8 }}>
              <option value="All">All Couriers</option>
              {couriers.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="form-select btn-sm" value={filterMode} onChange={e => setFilterMode(e.target.value)} style={{ borderRadius: 8 }}>
              <option value="All">All Modes</option>
              <option value="exact">Exact</option>
              <option value="wildcard">Wildcard</option>
              <option value="regex">Regex</option>
            </select>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                {['Courier', 'Mode', 'Raw Pattern', '', 'ERP Status', 'State', 'Actions'].map((h, i) => (
                  <th key={i} style={{
                    padding: '12px 16px', textAlign: i === 6 ? 'right' : 'left',
                    fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.07em',
                    color: 'var(--text-muted)', textTransform: 'uppercase',
                    background: 'rgba(255,255,255,0.01)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading rules…</td></tr>
              ) : visibleMappings.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: 56 }}>
                    <div style={{ fontSize: '2rem', marginBottom: 8 }}>🗂️</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No mapping rules found</div>
                  </td>
                </tr>
              ) : visibleMappings.map((m, idx) => (
                <tr key={m.id} style={{
                  borderBottom: '1px solid var(--border-light)',
                  opacity: m.is_active ? 1 : 0.45,
                  background: editingId === m.id ? 'rgba(59,130,246,0.04)' : idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.008)',
                  transition: 'background 0.15s',
                }}>
                  {/* Courier */}
                  <td style={{ padding: '11px 16px', whiteSpace: 'nowrap' }}>
                    {editingId === m.id ? (
                      <select className="form-select btn-sm" value={editData.courier} onChange={e => setEditData({ ...editData, courier: e.target.value })}>
                        {couriers.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    ) : (
                      <span style={{
                        fontSize: '0.75rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                        background: 'rgba(139,92,246,0.1)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)',
                      }}>{m.courier}</span>
                    )}
                  </td>
                  {/* Mode */}
                  <td style={{ padding: '11px 16px' }}>
                    {editingId === m.id ? (
                      <select className="form-select btn-sm" value={editData.matching_type || 'exact'} onChange={e => setEditData({ ...editData, matching_type: e.target.value })}>
                        <option value="exact">Exact</option>
                        <option value="wildcard">Wildcard</option>
                        <option value="regex">Regex</option>
                      </select>
                    ) : <MatchBadge type={m.matching_type || 'exact'} />}
                  </td>
                  {/* Raw Pattern */}
                  <td style={{ padding: '11px 16px', maxWidth: 300 }}>
                    {editingId === m.id ? (
                      <input className="form-input btn-sm" style={{ fontFamily: 'monospace', width: '100%' }}
                        value={editData.courier_status} onChange={e => setEditData({ ...editData, courier_status: e.target.value })} />
                    ) : (
                      <code style={{
                        fontSize: '0.78rem', color: 'var(--text-primary)',
                        background: 'rgba(255,255,255,0.05)', padding: '3px 8px', borderRadius: 6,
                        fontFamily: 'monospace', border: '1px solid var(--border-light)',
                        display: 'inline-block', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                        title={m.courier_status}
                      >{m.courier_status}</code>
                    )}
                  </td>
                  {/* Arrow */}
                  <td style={{ padding: '11px 8px', color: 'var(--text-muted)', fontSize: '1rem' }}>→</td>
                  {/* ERP Status */}
                  <td style={{ padding: '11px 16px' }}>
                    {editingId === m.id ? (
                      <select className="form-select btn-sm" value={editData.erp_status} onChange={e => setEditData({ ...editData, erp_status: e.target.value })}>
                        {erpStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : <ErpBadge status={m.erp_status} />}
                  </td>
                  {/* State Toggle */}
                  <td style={{ padding: '11px 16px' }}>
                    <div
                      onClick={() => handleToggle(m.id)}
                      style={{
                        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                        fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.06em',
                        padding: '4px 10px', borderRadius: 20, transition: 'all 0.2s',
                        background: m.is_active ? 'rgba(34,197,94,0.1)' : 'rgba(107,114,128,0.1)',
                        color: m.is_active ? '#4ade80' : '#6b7280',
                        border: `1px solid ${m.is_active ? 'rgba(34,197,94,0.2)' : 'rgba(107,114,128,0.2)'}`,
                      }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                      {m.is_active ? 'ACTIVE' : 'OFF'}
                    </div>
                  </td>
                  {/* Actions */}
                  <td style={{ padding: '11px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {editingId === m.id ? (
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button className="btn btn-sm btn-primary" style={{ borderRadius: 8 }} onClick={saveEdit}>Save</button>
                        <button className="btn btn-sm btn-secondary" style={{ borderRadius: 8 }} onClick={() => setEditingId(null)}>Cancel</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button className="btn btn-sm btn-secondary" style={{ borderRadius: 8 }} onClick={() => startEdit(m)}>✏️ Edit</button>
                        <button className="btn btn-sm btn-danger"    style={{ borderRadius: 8 }} onClick={() => handleDelete(m.id)}>🗑</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Simulator ───────────────────────────────────────────────────────── */}
      <div style={{
        ...S.sectionCard,
        border: '1px solid rgba(250,204,21,0.2)',
        background: 'linear-gradient(135deg, rgba(250,204,21,0.03), rgba(249,115,22,0.03))',
      }}>
        <div style={S.sectionHeader}>
          <div>
            <h3 style={{ ...S.sectionTitle, color: '#facc15' }}>
              ⚡ Mapping Simulator
              <span style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.08em', padding: '2px 8px', borderRadius: 6, background: 'rgba(250,204,21,0.12)', color: '#facc15', border: '1px solid rgba(250,204,21,0.2)' }}>SANDBOX</span>
            </h3>
            <p style={S.sectionSub}>Test any raw status string live against your active mapping rules — no data is changed</p>
          </div>
        </div>

        <div style={{ padding: '20px 22px' }}>
          <form onSubmit={handleTestMapping} style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: '1 1 180px', marginBottom: 0 }}>
              <label className="form-label">Test Courier</label>
              <select className="form-select" value={testCourier} onChange={e => setTestCourier(e.target.value)}>
                {couriers.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: '3 1 320px', marginBottom: 0 }}>
              <label className="form-label">Raw Courier Status Text</label>
              <input
                className="form-input"
                style={{ fontFamily: 'monospace' }}
                placeholder="e.g.  arrived at destination warehouse"
                value={testStatus}
                onChange={e => { setTestStatus(e.target.value); setTestResult(null) }}
                required
              />
            </div>
            <div style={{ flex: '0 0 auto' }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={testLoading}
                style={{ height: 36, paddingInline: 24, borderRadius: 9, background: 'linear-gradient(135deg,#f59e0b,#d97706)', border: 'none' }}
              >
                {testLoading ? '…' : '⚡ Test Match'}
              </button>
            </div>
          </form>

          {testResult && (
            <div style={{
              marginTop: 20, padding: '18px 20px',
              background: 'rgba(255,255,255,0.025)', borderRadius: 12,
              border: '1px solid rgba(250,204,21,0.15)',
              display: 'flex', flexWrap: 'wrap', gap: 32, alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Result</div>
                <ErpBadge status={testResult.mapped_status} />
              </div>
              <div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Matched By</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: testResult.matched_by !== 'None' ? 'monospace' : undefined }}>
                  {testResult.matched_by}
                </div>
              </div>
              {testResult.rule_id && (
                <div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Rule ID</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#60a5fa' }}>#{testResult.rule_id}</div>
                </div>
              )}
              <div style={{ marginLeft: 'auto' }}>
                {testResult.mapped_status === 'Remain Unchanged (No Map)' ? (
                  <span style={{ fontSize: '0.75rem', color: '#f87171', background: 'rgba(239,68,68,0.1)', padding: '4px 12px', borderRadius: 20, border: '1px solid rgba(239,68,68,0.2)' }}>
                    ✕ No match found
                  </span>
                ) : (
                  <span style={{ fontSize: '0.75rem', color: '#4ade80', background: 'rgba(34,197,94,0.1)', padding: '4px 12px', borderRadius: 20, border: '1px solid rgba(34,197,94,0.2)' }}>
                    ✓ Match found
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Pro Tip ─────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '16px 20px', borderRadius: 12,
        background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.15)',
        display: 'flex', gap: 14, alignItems: 'flex-start',
      }}>
        <div style={{ fontSize: '1.2rem', marginTop: 1 }}>💡</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 4, color: '#60a5fa' }}>How matching works</div>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Rules are evaluated in priority order: <b>Exact → Wildcard → Regex → Hardcoded fallbacks</b>. 
            If no rule matches, the ERP status stays unchanged but the raw text is saved for auditing.
            Use the Simulator above to validate patterns before saving.
          </p>
        </div>
      </div>

    </div>
  )
}
