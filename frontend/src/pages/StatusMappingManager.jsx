import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'

export default function StatusMappingManager() {
  const [mappings, setMappings] = useState([])
  const [erpStatuses, setErpStatuses] = useState([])
  const [loading, setLoading] = useState(true)
  const { addToast, user } = useApp()
  const [showAdd, setShowAdd] = useState(false)
  const [newMapping, setNewMapping] = useState({ courier: 'All', courier_status: '', erp_status: 'Pending' })
  const [editingId, setEditingId] = useState(null)
  const [editData, setEditData] = useState({})

  const fetchMappings = async () => {
    try {
      const res = await fetch('/api/status-mappings')
      const data = await res.json()
      if (res.ok) {
        setMappings(data.mappings || [])
        setErpStatuses(data.erp_statuses || [])
      } else {
        addToast(data.error || 'Failed to load mappings', 'error')
      }
    } catch (e) {
      addToast('Failed to load mappings', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMappings()
  }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    try {
      const res = await fetch('/api/status-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMapping)
      })
      if (res.ok) {
        addToast('Mapping added successfully', 'success')
        setShowAdd(false)
        setNewMapping({ courier: 'All', courier_status: '', erp_status: 'Pending' })
        fetchMappings()
      } else {
        const d = await res.json()
        addToast(d.error || 'Failed to add mapping', 'error')
      }
    } catch (e) { addToast('Network error', 'error') }
  }

  const handleToggle = async (id) => {
    try {
      const res = await fetch(`/api/status-mappings/${id}/toggle`, { method: 'PATCH' })
      if (res.ok) {
        setMappings(mappings.map(m => m.id === id ? { ...m, is_active: 1 - m.is_active } : m))
      }
    } catch (e) { addToast('Failed to toggle status', 'error') }
  }

  const handleDelete = async (id) => {
    if (!confirm('Are you sure? This will stop auto-mapping for this status.')) return
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
      if (res.ok) {
        addToast('Updated successfully', 'success')
        setEditingId(null)
        fetchMappings()
      } else {
        const d = await res.json()
        addToast(d.error || 'Update failed', 'error')
      }
    } catch (e) { addToast('Network error', 'error') }
  }

  if (user?.role !== 'admin') {
    return (
      <div className="page-container" style={{ textAlign: 'center', paddingTop: 100 }}>
        <h1 style={{ fontSize: '4rem' }}>🔒</h1>
        <h2>Access Denied</h2>
        <p>Only administrators can manage courier status mappings.</p>
      </div>
    )
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2>Status Mapping Manager</h2>
          <p>Map raw courier status strings to your internal ERP statuses</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Close' : 'Add New Mapping'}
        </button>
      </div>

      {showAdd && (
        <div className="card" style={{ marginBottom: 24, padding: 20 }}>
          <h3 className="card-title">New Mapping</h3>
          <form onSubmit={handleAdd} className="form-grid-3" style={{ alignItems: 'flex-end' }}>
            <div className="form-group">
              <label className="form-label">Courier</label>
              <select 
                className="form-select" 
                value={newMapping.courier}
                onChange={e => setNewMapping({...newMapping, courier: e.target.value})}
              >
                <option value="All">All Couriers (Generic)</option>
                <option value="PostEx">PostEx</option>
                <option value="Instaworld">Instaworld / TCS / LCS</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Raw Courier Status (Exact String)</label>
              <input 
                className="form-input" 
                placeholder="e.g. delivery unsuccessful"
                value={newMapping.courier_status}
                onChange={e => setNewMapping({...newMapping, courier_status: e.target.value})}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Maps to ERP Status</label>
              <select 
                className="form-select"
                value={newMapping.erp_status}
                onChange={e => setNewMapping({...newMapping, erp_status: e.target.value})}
              >
                {erpStatuses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ marginTop: 10 }}>
              <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Save Mapping</button>
            </div>
          </form>
        </div>
      )}

      <div className="card no-padding">
        <table className="data-table">
          <thead>
            <tr>
              <th>Courier</th>
              <th>Raw Status (From API)</th>
              <th></th>
              <th>Internal ERP Status</th>
              <th>State</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', padding: 40 }}>Loading mappings...</td></tr>
            ) : mappings.length === 0 ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', padding: 40 }}>No mappings found.</td></tr>
            ) : mappings.map(m => (
              <tr key={m.id} style={{ opacity: m.is_active ? 1 : 0.5 }}>
                <td>
                  {editingId === m.id ? (
                    <select 
                      className="form-select btn-sm"
                      value={editData.courier}
                      onChange={e => setEditData({...editData, courier: e.target.value})}
                    >
                      <option value="All">All</option>
                      <option value="PostEx">PostEx</option>
                      <option value="Instaworld">Instaworld</option>
                    </select>
                  ) : (
                    <span className="badge badge-pending">{m.courier}</span>
                  )}
                </td>
                <td>
                  {editingId === m.id ? (
                    <input 
                      className="form-input btn-sm"
                      value={editData.courier_status}
                      onChange={e => setEditData({...editData, courier_status: e.target.value})}
                    />
                  ) : (
                    <code style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>"{m.courier_status}"</code>
                  )}
                </td>
                <td style={{ color: 'var(--text-muted)' }}>➜</td>
                <td>
                  {editingId === m.id ? (
                    <select 
                      className="form-select btn-sm"
                      value={editData.erp_status}
                      onChange={e => setEditData({...editData, erp_status: e.target.value})}
                    >
                      {erpStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : (
                    <span className="badge badge-delivered" style={{ fontWeight: 800 }}>{m.erp_status}</span>
                  )}
                </td>
                <td>
                  <span 
                    className={`badge ${m.is_active ? 'badge-delivered' : 'badge-pending'}`}
                    onClick={() => handleToggle(m.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    {m.is_active ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  {editingId === m.id ? (
                    <div className="flex justify-end gap-2">
                      <button className="btn btn-sm btn-primary" onClick={saveEdit}>Save</button>
                      <button className="btn btn-sm btn-secondary" onClick={() => setEditingId(null)}>Cancel</button>
                    </div>
                  ) : (
                    <div className="flex justify-end gap-2">
                      <button className="btn btn-sm btn-secondary" onClick={() => startEdit(m)}>Edit</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(m.id)}>Delete</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 24, padding: 20, background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', borderLeft: '4px solid var(--brand)' }}>
        <h4 style={{ color: 'var(--brand)', marginBottom: 8 }}>💡 Pro Tip</h4>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          When a courier status is received from an API, the system looks for an active mapping. 
          If no mapping is found, the <b>ERP Status remains unchanged</b>, but the raw text is still saved in the <i>Courier Status</i> column for your reference.
          This prevents unknown courier statuses from corrupting your P&L reports.
        </p>
      </div>
    </div>
  )
}
