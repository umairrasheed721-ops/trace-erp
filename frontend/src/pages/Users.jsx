import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'

export default function Users() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const { addToast, token } = useApp()
  const [showAdd, setShowAdd] = useState(false)
  const [newUser, setNewUser] = useState({ username: '', password: '', email: '', role: 'agent' })
  const [editUser, setEditUser] = useState(null)

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
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

  const handleAddUser = async (e) => {
    e.preventDefault()
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newUser)
      })
      if (res.ok) {
        addToast('User created successfully', 'success')
        setShowAdd(false)
        setNewUser({ username: '', password: '', email: '', role: 'agent' })
        fetchUsers()
      } else {
        const d = await res.json()
        addToast(d.error || 'Failed to create user', 'error')
      }
    } catch (e) {
      addToast('Network error', 'error')
    }
  }

  const handleEditUserSubmit = async (e) => {
    e.preventDefault()
    try {
      const res = await fetch(`/api/users/${editUser.id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(editUser)
      })
      if (res.ok) {
        addToast('User updated successfully', 'success')
        setEditUser(null)
        fetchUsers()
      } else {
        const d = await res.json()
        addToast(d.error || 'Failed to update user', 'error')
      }
    } catch (e) {
      addToast('Network error', 'error')
    }
  }

  const handleDeleteUser = async (id) => {
    if (!confirm('Are you sure you want to delete this user?')) return
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        addToast('User deleted', 'success')
        fetchUsers()
      } else {
        let errMsg = 'Failed to delete user';
        try {
          const d = await res.json()
          errMsg = d.error || d.message || errMsg;
        } catch (_) {
          errMsg = `Failed to delete user: ${res.status} ${res.statusText}`;
        }
        addToast(errMsg, 'error')
      }
    } catch (e) {
      addToast(`Failed to delete user: ${e.message}`, 'error')
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2>User Management</h2>
          <p>Manage ERP access and authorities</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowAdd(!showAdd); setEditUser(null); }}>
          {showAdd ? 'Cancel' : '+ Create New User'}
        </button>
      </div>

      {editUser && (
        <div style={{ 
          background: 'var(--bg-surface)', 
          border: '1px solid var(--border)', 
          borderRadius: 'var(--radius)', 
          marginBottom: 24, 
          padding: 20,
          animation: 'slideIn 0.3s ease-out'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
            <h3 className="card-title" style={{ margin: 0 }}>Edit User: {editUser.username}</h3>
            <button className="btn btn-secondary btn-sm" onClick={() => setEditUser(null)}>Cancel</button>
          </div>
          <form onSubmit={handleEditUserSubmit} className="form-grid-3">
            <div className="form-group">
              <label className="form-label">Username</label>
              <input 
                className="form-input" 
                value={editUser.username} 
                onChange={e => setEditUser({...editUser, username: e.target.value})} 
                required 
              />
            </div>
            <div className="form-group">
              <label className="form-label">New Password</label>
              <input 
                className="form-input" 
                type="password"
                value={editUser.password || ''} 
                onChange={e => setEditUser({...editUser, password: e.target.value})} 
                placeholder="Leave blank to keep current"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Email (Recovery)</label>
              <input 
                className="form-input" 
                type="email"
                value={editUser.email || ''} 
                onChange={e => setEditUser({...editUser, email: e.target.value})} 
              />
            </div>
            <div className="form-group">
              <label className="form-label">Role</label>
              <select 
                className="form-select"
                value={editUser.role}
                onChange={e => setEditUser({...editUser, role: e.target.value})}
              >
                <option value="admin">Super Admin (All Access)</option>
                <option value="manager">Manager (No P&L / Settings)</option>
                <option value="agent">Agent (Order Lookup Only)</option>
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: 'span 3', display: 'flex', gap: 20 }}>
              <label className="flex items-center gap-2 cursor-pointer" style={{ marginTop: 10 }}>
                <input 
                  type="checkbox" 
                  checked={editUser.role === 'admin' || editUser.can_override_erp_status === 1}
                  disabled={editUser.role === 'admin'}
                  onChange={e => setEditUser({...editUser, can_override_erp_status: e.target.checked ? 1 : 0})} 
                />
                <span style={{ fontSize: '0.85rem' }}>Allow manual ERP status override (Authority)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer" style={{ marginTop: 10 }}>
                <input 
                  type="checkbox" 
                  checked={editUser.role === 'admin' || editUser.can_set_final_status === 1}
                  disabled={editUser.role === 'admin'}
                  onChange={e => setEditUser({...editUser, can_set_final_status: e.target.checked ? 1 : 0})} 
                />
                <span style={{ fontSize: '0.85rem', color: 'var(--brand)' }}>⚡ Allow Final Status (Delivered / Return Received)</span>
              </label>
            </div>
            <div style={{ gridColumn: 'span 3', textAlign: 'right', marginTop: 10 }}>
              <button type="submit" className="btn btn-primary">Save Changes</button>
            </div>
          </form>
        </div>
      )}

      {showAdd && (
        <div style={{ 
          background: 'var(--bg-surface)', 
          border: '1px solid var(--border)', 
          borderRadius: 'var(--radius)', 
          marginBottom: 24, 
          padding: 20,
          animation: 'slideIn 0.3s ease-out'
        }}>
          <h3 className="card-title">New User Details</h3>
          <form onSubmit={handleAddUser} className="form-grid-3">
            <div className="form-group">
              <label className="form-label">Username</label>
              <input 
                className="form-input" 
                value={newUser.username} 
                onChange={e => setNewUser({...newUser, username: e.target.value})} 
                placeholder="e.g. umair"
                required 
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input 
                className="form-input" 
                type="password"
                value={newUser.password} 
                onChange={e => setNewUser({...newUser, password: e.target.value})} 
                placeholder="••••••••"
                required 
              />
            </div>
            <div className="form-group">
              <label className="form-label">Email (Recovery)</label>
              <input 
                className="form-input" 
                type="email"
                value={newUser.email} 
                onChange={e => setNewUser({...newUser, email: e.target.value})} 
                placeholder="user@gmail.com"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Role</label>
              <select 
                className="form-select"
                value={newUser.role}
                onChange={e => setNewUser({...newUser, role: e.target.value})}
              >
                <option value="admin">Super Admin (All Access)</option>
                <option value="manager">Manager (No P&L / Settings)</option>
                <option value="agent">Agent (Order Lookup Only)</option>
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: 'span 3', display: 'flex', gap: 20 }}>
              <label className="flex items-center gap-2 cursor-pointer" style={{ marginTop: 10 }}>
                <input 
                  type="checkbox" 
                  checked={newUser.role === 'admin' || newUser.can_override_erp_status === 1}
                  disabled={newUser.role === 'admin'}
                  onChange={e => setNewUser({...newUser, can_override_erp_status: e.target.checked ? 1 : 0})} 
                />
                <span style={{ fontSize: '0.85rem' }}>Allow manual ERP status override (Authority)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer" style={{ marginTop: 10 }}>
                <input 
                  type="checkbox" 
                  checked={newUser.role === 'admin' || newUser.can_set_final_status === 1}
                  disabled={newUser.role === 'admin'}
                  onChange={e => setNewUser({...newUser, can_set_final_status: e.target.checked ? 1 : 0})} 
                />
                <span style={{ fontSize: '0.85rem', color: 'var(--brand)' }}>⚡ Allow Final Status (Delivered / Return Received)</span>
              </label>
            </div>
            <div style={{ gridColumn: 'span 3', textAlign: 'right', marginTop: 10 }}>
              <button type="submit" className="btn btn-primary">Create Account</button>
            </div>
          </form>
        </div>
      )}


      {/* 🔐 ROLE AUTHORITY MATRIX */}
      <RoleAuthorityMatrix addToast={addToast} token={token} />

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Username</th>
              <th>Email (Recovery)</th>
              <th>Role</th>
              <th>Created At</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="5" style={{ textAlign: 'center', padding: 40 }}><span className="loading-spinner"></span> Loading users...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan="5" style={{ textAlign: 'center', padding: 40 }}>No users found</td></tr>
            ) : (
              users.map(u => (
                <tr key={u.id}>
                  <td>#{u.id}</td>
                  <td style={{ fontWeight: 600 }}>{u.username}</td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{u.email || '—'}</td>
                  <td>
                    <div className="flex flex-col gap-1">
                      <span className={`badge ${u.role === 'admin' ? 'badge-delivered' : u.role === 'manager' ? 'badge-advice' : 'badge-pending'}`}>
                        {u.role.toUpperCase()}
                      </span>
                      {(u.can_override_erp_status === 1 || u.role === 'admin') && (
                        <span style={{ fontSize: '0.65rem', color: 'var(--green)', fontWeight: 600 }}>🔓 Status Override OK</span>
                      )}
                    </div>
                  </td>
                  <td>{new Date(u.created_at).toLocaleDateString()}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => { setEditUser({ ...u, password: '' }); setShowAdd(false); }}>Edit</button>
                      {u.username !== 'admin' && (
                        <button className="btn btn-danger btn-sm" onClick={() => handleDeleteUser(u.id)}>Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RoleAuthorityMatrix({ addToast, token }) {
  const { permissions, setPermissions, fetchPermissions } = useApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    const load = async () => {
      await fetchPermissions();
      setLoading(false);
    };
    load();
  }, []);

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
    { id: '/profile', label: 'My Profile', icon: '👤' }
  ];

  const roles = ['manager', 'agent'];



  const hasAccess = (role, pageId) => {
    if (role === 'admin') return true;
    if (!Array.isArray(permissions)) return false;
    return permissions.some(p => p.role_name === role && p.page_id === pageId);
  };

  const toggleAccess = async (role, pageId) => {
    // 🚀 OPTIMISTIC UPDATE: Update UI immediately
    const currentForRole = Array.isArray(permissions) 
      ? permissions.filter(p => p.role_name === role).map(p => p.page_id)
      : [];
    
    let newPageIds;
    const isAdding = !currentForRole.includes(pageId);
    
    if (isAdding) {
      newPageIds = [...currentForRole, pageId];
      setPermissions(prev => [...prev, { role_name: role, page_id: pageId }]);
    } else {
      newPageIds = currentForRole.filter(id => id !== pageId);
      setPermissions(prev => prev.filter(p => !(p.role_name === role && p.page_id === pageId)));
    }

    try {
      const res = await fetch('/api/users/permissions', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ role_name: role, page_ids: newPageIds })
      });
      
      if (!res.ok) {
        throw new Error('Failed');
      }
      // Success - no toast needed for every click to avoid spam
    } catch (e) {
      addToast('⚠️ Sync failed. Reverting...', 'error');
      fetchPermissions(); // Revert on failure
    }
  };

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 24, marginBottom: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>🔐 Role Authority Matrix</h3>
        <p style={{ margin: '5px 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Define dynamic tab access for each role. (Super Admin always has full access)</p>
      </div>

      <div className="table-wrapper" style={{ maxHeight: 500, overflowY: 'auto' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
            <tr>
              <th style={{ background: 'var(--bg-app)', borderBottom: '2px solid var(--border)' }}>Module / Tab</th>
              {roles.map(role => (
                <th key={role} style={{ background: 'var(--bg-app)', borderBottom: '2px solid var(--border)', textAlign: 'center' }}>
                  {role.toUpperCase()} ACCESS
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={roles.length + 1} style={{ textAlign: 'center', padding: 40 }}>Loading authority matrix...</td></tr>
            ) : (
              pages.map(page => (
                <tr key={page.id}>
                  <td style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600 }}>
                    <span style={{ fontSize: '1.2rem' }}>{page.icon}</span>
                    <span>{page.label}</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>{page.id}</span>
                  </td>
                  {roles.map(role => (
                    <td key={role} style={{ textAlign: 'center' }}>
                      <label className="switch" style={{ display: 'inline-block' }}>
                        <input 
                          type="checkbox" 
                          checked={hasAccess(role, page.id)} 
                          onChange={() => toggleAccess(role, page.id)}
                          disabled={saving === `${role}-${page.id}`}
                        />
                        <span className="slider round"></span>
                      </label>
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
