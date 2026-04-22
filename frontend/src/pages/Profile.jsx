import React, { useState } from 'react'
import { useApp } from '../context/AppContext'

export default function Profile() {
  const { user, setUser, addToast, token } = useApp()
  const [passForm, setPassForm] = useState({ current: '', new: '', confirm: '' })
  const [email, setEmail] = useState(user?.email || '')
  const [loading, setLoading] = useState(false)

  const handleUpdateEmail = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/auth/update-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ email })
      })
      if (res.ok) {
        addToast('✅ Recovery email updated', 'success')
        setUser({ ...user, email })
      } else {
        addToast('❌ Failed to update email', 'error')
      }
    } catch {
      addToast('Network error', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    if (passForm.new !== passForm.confirm) return addToast('Passwords do not match', 'error')
    if (passForm.new.length < 6) return addToast('Password too short (min 6 chars)', 'error')

    setLoading(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ current_password: passForm.current, new_password: passForm.new })
      })
      const data = await res.json()
      if (res.ok) {
        addToast('✅ Password changed successfully', 'success')
        setPassForm({ current: '', new: '', confirm: '' })
      } else {
        addToast(data.error || 'Failed to change password', 'error')
      }
    } catch {
      addToast('Network error', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-container" style={{ maxWidth: 600 }}>
      <div className="page-header">
        <div>
          <h2>👤 My Account</h2>
          <p>Manage your password and recovery options</p>
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-title">Recovery Email (Gmail)</div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 15 }}>
          Linking your Gmail allows you to recover your account if you forget your password.
        </p>
        <form onSubmit={handleUpdateEmail}>
          <div className="form-group">
            <label className="form-label">Gmail Address</label>
            <input 
              className="form-input" 
              type="email" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              placeholder="yourname@gmail.com"
              required
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Saving...' : 'Update Email'}
          </button>
        </form>
      </div>

      <div className="card">
        <div className="card-title">Change Password</div>
        <form onSubmit={handleChangePassword}>
          <div className="form-group">
            <label className="form-label">Current Password</label>
            <input 
              className="form-input" 
              type="password" 
              value={passForm.current} 
              onChange={e => setPassForm({...passForm, current: e.target.value})} 
              required
            />
          </div>
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">New Password</label>
              <input 
                className="form-input" 
                type="password" 
                value={passForm.new} 
                onChange={e => setPassForm({...passForm, new: e.target.value})} 
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Confirm New Password</label>
              <input 
                className="form-input" 
                type="password" 
                value={passForm.confirm} 
                onChange={e => setPassForm({...passForm, confirm: e.target.value})} 
                required
              />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Updating...' : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  )
}
