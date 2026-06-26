import { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'

// ─── Avatar Generator ───
const getAvatar = (username) => {
  const colors = [
    ['#a855f7', '#7c3aed'], ['#3b82f6', '#1d4ed8'], ['#22c55e', '#15803d'],
    ['#f97316', '#c2410c'], ['#ec4899', '#be185d'], ['#14b8a6', '#0f766e']
  ]
  const idx = username ? username.charCodeAt(0) % colors.length : 0
  return { bg: colors[idx][0], shadow: colors[idx][1], letter: (username || '?')[0].toUpperCase() }
}

const ROLE_META = {
  admin:   { label: 'Super Admin', color: '#a855f7', bg: 'rgba(168,85,247,0.12)', icon: '👑' },
  manager: { label: 'Manager',     color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  icon: '🏢' },
  agent:   { label: 'Agent',       color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   icon: '👤' },
}

// ─── Confirm Delete Modal ───
function ConfirmDeleteModal({ user, onConfirm, onCancel, loading }) {
  const inputRef = useRef(null)
  useEffect(() => { if (inputRef.current) inputRef.current.focus() }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'fadeIn 0.15s ease'
    }}>
      <div style={{
        background: 'var(--bg-elevated)', border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: 'var(--radius-lg)', padding: 32, width: 420,
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        animation: 'slideUp 0.2s ease'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.8rem', margin: '0 auto 16px'
          }}>🗑️</div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>
            Delete User Account
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            You are about to permanently delete <strong style={{ color: 'var(--text-primary)' }}>"{user.username}"</strong>.
            This action cannot be undone.
          </p>
        </div>

        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: 24,
          fontSize: '0.78rem', color: '#f87171'
        }}>
          ⚠️ All login access for this account will be immediately revoked.
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn btn-secondary"
            style={{ flex: 1 }}
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            className="btn btn-danger"
            style={{ flex: 1, justifyContent: 'center' }}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? <><span className="loading-spinner" style={{ width: 14, height: 14 }} /> Deleting...</> : '🗑️ Delete Account'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── User Form Modal ───
function UserFormModal({ editUser, stores, onClose, onSave, loading }) {
  const isNew = !editUser?.id
  const [form, setForm] = useState(() => {
    if (editUser) {
      return {
        ...editUser,
        allowed_stores: Array.isArray(editUser.allowed_stores) ? editUser.allowed_stores : []
      }
    }
    return { username: '', password: '', email: '', role: 'agent', can_override_erp_status: 0, can_set_final_status: 0, allowed_stores: [] }
  })

  const set = (field, val) => setForm(prev => ({ ...prev, [field]: val }))

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'fadeIn 0.15s ease'
    }}>
      <div style={{
        background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)',
        borderRadius: 'var(--radius-lg)', padding: 32, width: 520,
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        animation: 'slideUp 0.2s ease'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            background: 'var(--brand-glow)', border: '1px solid var(--brand)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem'
          }}>
            {isNew ? '➕' : '✏️'}
          </div>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>
              {isNew ? 'Create New User' : `Edit — ${editUser.username}`}
            </h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0, marginTop: 2 }}>
              {isNew ? 'Fill in details to create a new ERP account' : 'Update account details and permissions'}
            </p>
          </div>
          <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={e => { e.preventDefault(); onSave(form) }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Username *</label>
              <input
                className="form-input"
                value={form.username}
                onChange={e => set('username', e.target.value)}
                placeholder="e.g. sarah_ops"
                required
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">{isNew ? 'Password *' : 'New Password'}</label>
              <input
                className="form-input"
                type="password"
                value={form.password || ''}
                onChange={e => set('password', e.target.value)}
                placeholder={isNew ? '••••••••' : 'Leave blank to keep current'}
                required={isNew}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Email (Recovery)</label>
              <input
                className="form-input"
                type="email"
                value={form.email || ''}
                onChange={e => set('email', e.target.value)}
                placeholder="user@gmail.com"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Role *</label>
              <select className="form-select" value={form.role} onChange={e => set('role', e.target.value)}>
                <option value="admin">👑 Super Admin — Full Access</option>
                <option value="manager">🏢 Manager — No P&L / Settings</option>
                <option value="agent">👤 Agent — Order Lookup Only</option>
              </select>
            </div>
          </div>

          {/* Store Permissions */}
          {form.role !== 'admin' && (
            <div style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', padding: '14px 16px', marginBottom: 22
            }}>
              <p style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
                Authorized Store Access
              </p>
              {stores.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No connected stores found.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px' }}>
                  {stores.map(store => {
                    const isChecked = form.allowed_stores.includes(store.id);
                    return (
                      <label key={store.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={e => {
                            const nextAllowed = e.target.checked
                              ? [...form.allowed_stores, store.id]
                              : form.allowed_stores.filter(id => id !== store.id);
                            set('allowed_stores', nextAllowed);
                          }}
                        />
                        <span style={{ fontSize: '0.82rem' }}>🏪 {store.store_name || store.shop_domain}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Permissions */}
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', padding: '14px 16px', marginBottom: 22
          }}>
            <p style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
              Advanced Permissions
            </p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 10, opacity: form.role === 'admin' ? 0.5 : 1 }}>
              <input
                type="checkbox"
                checked={form.role === 'admin' || form.can_override_erp_status === 1}
                disabled={form.role === 'admin'}
                onChange={e => set('can_override_erp_status', e.target.checked ? 1 : 0)}
              />
              <span style={{ fontSize: '0.82rem' }}>🔓 Allow manual ERP status override</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', opacity: form.role === 'admin' ? 0.5 : 1 }}>
              <input
                type="checkbox"
                checked={form.role === 'admin' || form.can_set_final_status === 1}
                disabled={form.role === 'admin'}
                onChange={e => set('can_set_final_status', e.target.checked ? 1 : 0)}
              />
              <span style={{ fontSize: '0.82rem', color: 'var(--brand)' }}>⚡ Allow Final Status (Delivered / Return Received)</span>
            </label>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose} disabled={loading}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={loading}>
              {loading ? <><span className="loading-spinner" style={{ width: 14, height: 14 }} /> Saving...</> : isNew ? '✅ Create Account' : '💾 Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── User Card Row ───
function UserRow({ u, stores, currentUserId, onEdit, onDelete }) {
  const av = getAvatar(u.username)
  const role = ROLE_META[u.role] || ROLE_META.agent
  const isSelf = currentUserId === u.id
  const isProtected = u.username === 'admin'

  return (
    <tr style={{ transition: 'background 0.15s' }}>
      <td style={{ width: 40 }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>#{u.id}</span>
      </td>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
            background: `linear-gradient(135deg, ${av.bg}, ${av.shadow})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.9rem', fontWeight: 700, color: '#fff',
            boxShadow: `0 2px 8px ${av.shadow}50`
          }}>
            {av.letter}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}>
              {u.username}
              {isSelf && <span style={{ fontSize: '0.65rem', background: 'var(--brand-glow)', color: 'var(--brand)', borderRadius: 4, padding: '1px 6px', fontWeight: 600 }}>YOU</span>}
              {isProtected && <span style={{ fontSize: '0.65rem', background: 'rgba(234,179,8,0.12)', color: '#eab308', borderRadius: 4, padding: '1px 6px', fontWeight: 600 }}>🔒 PROTECTED</span>}
            </div>
            <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: 1 }}>{u.email || '—'}</div>
          </div>
        </div>
      </td>
      <td>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600,
            background: role.bg, color: role.color, width: 'fit-content'
          }}>
            {role.icon} {role.label}
          </span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(u.can_override_erp_status === 1 || u.role === 'admin') && (
              <span style={{ fontSize: '0.63rem', color: 'var(--green)', fontWeight: 600 }}>🔓 Status Override</span>
            )}
            {(u.can_set_final_status === 1 || u.role === 'admin') && (
              <span style={{ fontSize: '0.63rem', color: 'var(--brand)', fontWeight: 600 }}>⚡ Final Status</span>
            )}
          </div>
          {u.role !== 'admin' && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
              {Array.isArray(u.allowed_stores) && u.allowed_stores.length > 0 ? (
                u.allowed_stores.map(sid => {
                  const s = stores.find(store => store.id === sid);
                  return (
                    <span key={sid} style={{ fontSize: '0.63rem', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', padding: '1px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>
                      🏪 {s ? (s.store_name || s.shop_domain) : `Store #${sid}`}
                    </span>
                  );
                })
              ) : (
                <span style={{ fontSize: '0.63rem', color: '#f87171', fontWeight: 500 }}>🚫 No store access</span>
              )}
            </div>
          )}
          {u.role === 'admin' && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
              <span style={{ fontSize: '0.63rem', background: 'rgba(168,85,247,0.08)', color: '#a855f7', padding: '1px 6px', borderRadius: 4, border: '1px solid rgba(168,85,247,0.15)', fontWeight: 600 }}>
                🏪 All Stores
              </span>
            </div>
          )}
        </div>
      </td>
      <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
        {u.created_at ? new Date(u.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
      </td>
      <td style={{ textAlign: 'right' }}>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => onEdit(u)}
          >
            ✏️ Edit
          </button>
          {!isProtected && !isSelf && (
            <button
              className="btn btn-danger btn-sm"
              onClick={() => onDelete(u)}
            >
              🗑️ Delete
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

// ─── Main Users Page ───
export default function Users() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const { addToast, token, user: currentUser, stores } = useApp()

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setUsers(Array.isArray(data) ? data : [])
    } catch (e) {
      addToast('Failed to load users', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (token) fetchUsers()
  }, [token])

  const handleSave = async (form) => {
    setSaving(true)
    try {
      const isNew = !form.id
      const url = isNew ? '/api/users' : `/api/users/${form.id}`
      const method = isNew ? 'POST' : 'PUT'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(form)
      })

      const d = await res.json()
      if (res.ok) {
        addToast(isNew ? `✅ User "${form.username}" created!` : `✅ "${form.username}" updated!`, 'success')
        setShowModal(false)
        setEditTarget(null)
        fetchUsers()
      } else {
        addToast(d.error || 'Failed to save user', 'error')
      }
    } catch (e) {
      addToast(`Network error: ${e.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/users/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) {
        addToast(`🗑️ "${deleteTarget.username}" has been deleted`, 'success')
        setDeleteTarget(null)
        fetchUsers()
      } else {
        addToast(d.error || d.message || `Delete failed (HTTP ${res.status})`, 'error')
      }
    } catch (e) {
      addToast(`Network error: ${e.message}`, 'error')
    } finally {
      setDeleting(false)
    }
  }

  const filtered = users.filter(u => {
    const matchSearch = !search || u.username.toLowerCase().includes(search.toLowerCase()) || (u.email || '').toLowerCase().includes(search.toLowerCase())
    const matchRole = roleFilter === 'all' || u.role === roleFilter
    return matchSearch && matchRole
  })

  const stats = {
    total: users.length,
    admins: users.filter(u => u.role === 'admin').length,
    managers: users.filter(u => u.role === 'manager').length,
    agents: users.filter(u => u.role === 'agent').length,
  }

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0 }}>User Management</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.83rem', marginTop: 4 }}>
            Manage ERP access, roles and authorities
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditTarget(null); setShowModal(true) }}>
          + Create New User
        </button>
      </div>

      {/* Stats Strip */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Accounts', value: stats.total, icon: '👥', color: 'var(--brand)' },
          { label: 'Super Admins', value: stats.admins, icon: '👑', color: '#a855f7' },
          { label: 'Managers', value: stats.managers, icon: '🏢', color: '#3b82f6' },
          { label: 'Agents', value: stats.agents, icon: '👤', color: '#22c55e' },
        ].map(s => (
          <div key={s.label} style={{
            flex: '1 1 140px', background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '14px 18px',
            display: 'flex', alignItems: 'center', gap: 12
          }}>
            <span style={{ fontSize: '1.5rem' }}>{s.icon}</span>
            <div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Role Authority Matrix */}
      <RoleAuthorityMatrix addToast={addToast} token={token} />

      {/* Users Table */}
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', overflow: 'hidden'
      }}>
        {/* Table Toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px',
          borderBottom: '1px solid var(--border)', flexWrap: 'wrap'
        }}>
          <div style={{ position: 'relative', flex: '1 1 220px' }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.9rem' }}>🔍</span>
            <input
              className="form-input"
              style={{ paddingLeft: 32, height: 36, fontSize: '0.8rem' }}
              placeholder="Search by username or email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select
            className="form-select"
            style={{ width: 160, height: 36, fontSize: '0.8rem' }}
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
          >
            <option value="all">All Roles</option>
            <option value="admin">Super Admin</option>
            <option value="manager">Manager</option>
            <option value="agent">Agent</option>
          </select>
          <button className="btn btn-secondary btn-sm" onClick={fetchUsers} title="Refresh">
            🔄 Refresh
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
            <span className="loading-spinner" style={{ width: 24, height: 24, marginBottom: 12, display: 'inline-block' }} />
            <p style={{ marginTop: 12 }}>Loading users...</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 50 }}>ID</th>
                  <th>User</th>
                  <th>Role & Permissions</th>
                  <th>Created</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <div className="empty-state" style={{ padding: 40 }}>
                        <div className="empty-icon">👤</div>
                        <h3>{search || roleFilter !== 'all' ? 'No users match your filter' : 'No users found'}</h3>
                        <p>{search || roleFilter !== 'all' ? 'Try adjusting your search or filter' : 'Create the first user to get started'}</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map(u => (
                    <UserRow
                      key={u.id}
                      u={u}
                      stores={stores}
                      currentUserId={currentUser?.id}
                      onEdit={u => { setEditTarget({ ...u, password: '' }); setShowModal(true) }}
                      onDelete={setDeleteTarget}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length > 0 && (
          <div style={{
            padding: '10px 18px', borderTop: '1px solid var(--border)',
            fontSize: '0.75rem', color: 'var(--text-muted)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <span>Showing {filtered.length} of {users.length} users</span>
            {search || roleFilter !== 'all' ? (
              <button className="btn btn-secondary btn-sm" onClick={() => { setSearch(''); setRoleFilter('all') }}>
                Clear Filters
              </button>
            ) : null}
          </div>
        )}
      </div>

      {/* Modals */}
      {showModal && (
        <UserFormModal
          editUser={editTarget}
          stores={stores}
          onClose={() => { setShowModal(false); setEditTarget(null) }}
          onSave={handleSave}
          loading={saving}
        />
      )}

      {deleteTarget && (
        <ConfirmDeleteModal
          user={deleteTarget}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}
    </div>
  )
}

// ─── Role Authority Matrix ───
function RoleAuthorityMatrix({ addToast, token }) {
  const { permissions, setPermissions, fetchPermissions } = useApp()
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const load = async () => {
      await fetchPermissions()
      setLoading(false)
    }
    load()
  }, [])

  const pages = [
    { id: '/', label: 'Dashboard', icon: '🏠' },
    { id: '/search', label: 'Command Center', icon: '🔍' },
    { id: '/returns', label: 'Unified Returns', icon: '↩️' },
    { id: '/whatsapp-portal', label: 'WA Live Chat', icon: '💬' },
    { id: '/whatsapp-bot', label: 'WhatsApp Bot', icon: '🤖' },
    { id: '/whatsapp-templates', label: 'WA Templates', icon: '✍️' },
    { id: '/finance', label: 'Finance Engine', icon: '💰' },
    { id: '/payout-reconciler', label: 'Payout Reconciler', icon: '💸' },
    { id: '/costing', label: 'Master Costing', icon: '💎' },
    { id: '/prevention', label: 'Cost Watchdog', icon: '🛡️' },
    { id: '/reports', label: 'Profit & Loss', icon: '📊' },
    { id: '/marketing', label: 'Marketing Intel', icon: '🧠' },
    { id: '/reviews', label: 'Reviews Manager', icon: '⭐' },
    { id: '/intelligence', label: 'Courier Intelligence', icon: '🚚' },
    { id: '/stuck', label: 'Stuck Monitor', icon: '⏳' },
    { id: '/advice', label: 'Advice Monitor', icon: '🧠' },
    { id: '/watchdog', label: 'Watchdog', icon: '🐕' },
    { id: '/connect', label: 'Connect Store', icon: '🔌' },
    { id: '/users', label: 'User Management', icon: '👥' },
    { id: '/diagnostics', label: 'Diagnostic Center', icon: '🛠️' },
    { id: '/system-status', label: 'System Status', icon: '🛡️' },
    { id: '/status-mappings', label: 'Status Mappings', icon: '🔀' },
    { id: '/profile', label: 'My Profile', icon: '👤' },
  ]

  const roles = ['manager', 'agent']

  const hasAccess = (role, pageId) => {
    if (role === 'admin') return true
    if (!Array.isArray(permissions)) return false
    return permissions.some(p => p.role_name === role && p.page_id === pageId)
  }

  const toggleAccess = async (role, pageId) => {
    const currentForRole = Array.isArray(permissions)
      ? permissions.filter(p => p.role_name === role).map(p => p.page_id)
      : []

    const isAdding = !currentForRole.includes(pageId)
    const newPageIds = isAdding
      ? [...currentForRole, pageId]
      : currentForRole.filter(id => id !== pageId)

    // Optimistic UI
    if (isAdding) {
      setPermissions(prev => [...prev, { role_name: role, page_id: pageId }])
    } else {
      setPermissions(prev => prev.filter(p => !(p.role_name === role && p.page_id === pageId)))
    }

    try {
      const res = await fetch('/api/users/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ role_name: role, page_ids: newPageIds })
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `HTTP ${res.status}`)
      }
    } catch (e) {
      addToast(`⚠️ Permission sync failed: ${e.message}`, 'error')
      fetchPermissions()
    }
  }

  const managerCount = Array.isArray(permissions) ? permissions.filter(p => p.role_name === 'manager').length : 0
  const agentCount = Array.isArray(permissions) ? permissions.filter(p => p.role_name === 'agent').length : 0

  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', marginBottom: 24, overflow: 'hidden'
    }}>
      {/* Matrix Header */}
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', cursor: 'pointer', userSelect: 'none',
          borderBottom: collapsed ? 'none' : '1px solid var(--border)'
        }}
        onClick={() => setCollapsed(c => !c)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '1.3rem' }}>🔐</span>
          <div>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>Role Authority Matrix</h3>
            <p style={{ margin: 0, marginTop: 2, fontSize: '0.76rem', color: 'var(--text-muted)' }}>
              Define dynamic tab access per role — Super Admin always has full access
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ fontSize: '0.72rem', background: 'rgba(59,130,246,0.12)', color: '#3b82f6', padding: '3px 8px', borderRadius: 20, fontWeight: 600 }}>
              Manager: {managerCount}/{pages.length}
            </span>
            <span style={{ fontSize: '0.72rem', background: 'rgba(34,197,94,0.12)', color: '#22c55e', padding: '3px 8px', borderRadius: 20, fontWeight: 600 }}>
              Agent: {agentCount}/{pages.length}
            </span>
          </div>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', transition: 'transform 0.2s', display: 'inline-block', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▼</span>
        </div>
      </div>

      {!collapsed && (
        <div style={{ maxHeight: 480, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading matrix...</div>
          ) : (
            <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
                <tr>
                  <th style={{
                    background: 'var(--bg-elevated)', textAlign: 'left',
                    fontWeight: 600, fontSize: '0.72rem', padding: '12px 20px'
                  }}>
                    Module / Tab
                  </th>
                  {roles.map(role => (
                    <th key={role} style={{
                      background: 'var(--bg-elevated)', textAlign: 'center',
                      fontWeight: 600, fontSize: '0.72rem', minWidth: 140, padding: '12px 20px'
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <span>{ROLE_META[role]?.icon} {role.toUpperCase()} ACCESS</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pages.map((page, idx) => (
                  <tr key={page.id} style={{ background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                    <td style={{ padding: '10px 20px', fontWeight: 500, fontSize: '0.82rem', maxWidth: 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: '1rem', minWidth: 20, textAlign: 'center' }}>{page.icon}</span>
                        <span>{page.label}</span>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 400 }}>{page.id}</span>
                      </div>
                    </td>
                    {roles.map(role => (
                      <td key={role} style={{ textAlign: 'center', padding: '10px 20px' }}>
                        <label className="switch" style={{ display: 'inline-block' }}>
                          <input
                            type="checkbox"
                            checked={hasAccess(role, page.id)}
                            onChange={() => toggleAccess(role, page.id)}
                          />
                          <span className="slider round" />
                        </label>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
