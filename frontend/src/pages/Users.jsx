import { useState, useEffect } from 'react'
import { useApp } from '../App'

export default function Users() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const { addToast, token } = useApp()
  const [showAdd, setShowAdd] = useState(false)
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'agent' })

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
        setNewUser({ username: '', password: '', role: 'agent' })
        fetchUsers()
      } else {
        const d = await res.json()
        addToast(d.error || 'Failed to create user', 'error')
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
      }
    } catch (e) {
      addToast('Failed to delete user', 'error')
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2>User Management</h2>
          <p>Manage ERP access and authorities</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Cancel' : '+ Create New User'}
        </button>
      </div>

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
            <div style={{ gridColumn: 'span 3', textAlign: 'right', marginTop: 10 }}>
              <button type="submit" className="btn btn-primary">Create Account</button>
            </div>
          </form>
        </div>
      )}

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Username</th>
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
                  <td>
                    <span className={`badge ${u.role === 'admin' ? 'badge-delivered' : u.role === 'manager' ? 'badge-advice' : 'badge-pending'}`}>
                      {u.role.toUpperCase()}
                    </span>
                  </td>
                  <td>{new Date(u.created_at).toLocaleDateString()}</td>
                  <td style={{ textAlign: 'right' }}>
                    {u.username !== 'admin' && (
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteUser(u.id)}>Delete Account</button>
                    )}
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
