import React, { useState } from 'react'
import { useApp } from '../context/AppContext'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState('login') // 'login', 'forgot', 'reset'
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [newPass, setNewPass] = useState('')
  const { addToast, setToken, setUser } = useApp()

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      const data = await res.json()
      if (res.ok) {
        localStorage.setItem('trace_token', data.token)
        localStorage.setItem('trace_user', JSON.stringify(data.user))
        setToken(data.token)
        setUser(data.user)
        addToast(`Welcome back, ${data.user.username}!`, 'success')
      } else {
        addToast(data.error || 'Login failed', 'error')
      }
    } catch (err) {
      addToast('Network error', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleForgot = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      const data = await res.json()
      if (res.ok) {
        addToast('✅ Recovery code sent to your Gmail', 'success')
        setMode('reset')
      } else {
        addToast(data.error || 'Recovery failed', 'error')
      }
    } catch {
      addToast('Network error', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, new_password: newPass })
      })
      const data = await res.json()
      if (res.ok) {
        addToast('✅ Password reset successfully!', 'success')
        setMode('login')
      } else {
        addToast(data.error || 'Reset failed', 'error')
      }
    } catch {
      addToast('Network error', 'error')
    } finally {
      setLoading(false)
    }
  }

  const [showPass, setShowPass] = useState(false)

  return (
    <div className="login-container" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'var(--bg-base)',
      padding: 20
    }}>
      <div className="login-card" style={{
        width: '100%',
        maxWidth: 400,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: 40,
        boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
        animation: 'slideIn 0.4s ease-out'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          <h1 style={{ 
            fontSize: '2rem', 
            fontWeight: 800, 
            background: 'linear-gradient(135deg, var(--brand), #60a5fa)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: -1
          }}>TRACE ERP</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 5 }}>
            {mode === 'login' ? 'Sign in to manage your empire' : mode === 'forgot' ? 'Account Recovery' : 'Set New Password'}
          </p>
        </div>

        {mode === 'login' && (
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label">Username</label>
              <input className="form-input" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <div style={{ position: 'relative' }}>
                <input 
                  className="form-input" 
                  type={showPass ? "text" : "password"} 
                  placeholder="••••••••" 
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  required 
                  style={{ paddingRight: 45 }}
                />
                <button 
                  type="button" 
                  onClick={() => setShowPass(!showPass)}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '1.1rem',
                    padding: 5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: 0.7
                  }}
                >
                  {showPass ? '👁️' : '🙈'}
                </button>
              </div>
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px' }} disabled={loading}>
              {loading ? <span className="loading-spinner"></span> : 'Login to Dashboard'}
            </button>
            <div style={{ textAlign: 'center', marginTop: 15 }}>
              <button type="button" className="btn-link" onClick={() => setMode('forgot')} style={{ fontSize: '0.8rem', opacity: 0.7 }}>Forgot password?</button>
            </div>
          </form>
        )}

        {mode === 'forgot' && (
          <form onSubmit={handleForgot}>
            <div className="form-group">
              <label className="form-label">Recovery Email (Gmail)</label>
              <input className="form-input" type="email" placeholder="yourname@gmail.com" value={email} onChange={e => setEmail(e.target.value)} required />
              <small style={{ color: 'var(--text-muted)', marginTop: 8, display: 'block' }}>Enter the Gmail linked to your account.</small>
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px' }} disabled={loading}>
              {loading ? <span className="loading-spinner"></span> : 'Send Recovery Code'}
            </button>
            <div style={{ textAlign: 'center', marginTop: 15 }}>
              <button type="button" className="btn-link" onClick={() => setMode('login')} style={{ fontSize: '0.8rem', opacity: 0.7 }}>Back to login</button>
            </div>
          </form>
        )}

        {mode === 'reset' && (
          <form onSubmit={handleReset}>
            <div className="form-group">
              <label className="form-label">Verification Code</label>
              <input className="form-input" placeholder="6-digit code" value={code} onChange={e => setCode(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">New Password</label>
              <div style={{ position: 'relative' }}>
                <input 
                  className="form-input" 
                  type={showPass ? "text" : "password"} 
                  placeholder="Min 6 characters" 
                  value={newPass} 
                  onChange={e => setNewPass(e.target.value)} 
                  required 
                  style={{ paddingRight: 45 }}
                />
                <button 
                  type="button" 
                  onClick={() => setShowPass(!showPass)}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '1.1rem',
                    padding: 5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: 0.7
                  }}
                >
                  {showPass ? '👁️' : '🙈'}
                </button>
              </div>
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px' }} disabled={loading}>
              {loading ? <span className="loading-spinner"></span> : 'Reset Password'}
            </button>
          </form>
        )}

        <div style={{ marginTop: 30, textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Trace ERP v1.5.2 &copy; 2024
        </div>
      </div>
    </div>
  )
}
