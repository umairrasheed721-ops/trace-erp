import { useState } from 'react'
import { useApp } from '../App'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { addToast, setToken, setUser } = useApp()

  const handleSubmit = async (e) => {
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
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 5 }}>Sign in to manage your empire</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input 
              className="form-input" 
              type="text" 
              placeholder="Enter your username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="form-group" style={{ marginBottom: 25 }}>
            <label className="form-label">Password</label>
            <input 
              className="form-input" 
              type="password" 
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '0.9rem' }}
            disabled={loading}
          >
            {loading ? <span className="loading-spinner"></span> : 'Login to Dashboard'}
          </button>
        </form>

        <div style={{ marginTop: 30, textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Trace ERP v1.5.2 &copy; 2024
        </div>
      </div>
    </div>
  )
}
