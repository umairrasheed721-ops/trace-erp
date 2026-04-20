import { useEffect, useState } from 'react'
import { useApp } from '../App'

const VERDICT_CLASS = {
  'FAKE': 'verdict-fake',
  'SUSPICIOUS': 'verdict-suspicious',
  'VERIFIED': 'verdict-verified',
}

function getVerdictClass(verdict) {
  if (!verdict) return ''
  if (verdict.includes('FAKE')) return 'verdict-fake'
  if (verdict.includes('SUSPICIOUS')) return 'verdict-suspicious'
  if (verdict.includes('VERIFIED')) return 'verdict-verified'
  return 'verdict-moving'
}

export default function Watchdog() {
  const { activeStoreId, addToast, setBadgeCounts } = useApp()
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [filter, setFilter] = useState('all')

  const load = () => {
    if (!activeStoreId) return
    setLoading(true)
    fetch(`/api/watchdog?store_id=${activeStoreId}`)
      .then(r => r.json())
      .then(data => {
        const rows = Array.isArray(data) ? data : []
        setResults(rows)
        const fakeCount = rows.filter(w => w.verdict?.includes('FAKE')).length
        setBadgeCounts(prev => ({ ...prev, watchdog: fakeCount }))
        setLoading(false)
      })
      .catch(() => { addToast('Failed to load watchdog data', 'error'); setLoading(false) })
  }

  useEffect(() => { load() }, [activeStoreId])

  const runWatchdog = async () => {
    setRunning(true)
    addToast('🐕 Watchdog audit started in background (PostEx only)...', 'info')
    try {
      await fetch('/api/watchdog/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: activeStoreId })
      })
      setTimeout(() => { load(); setRunning(false) }, 5000)
    } catch {
      addToast('Failed to run watchdog', 'error')
      setRunning(false)
    }
  }

  const deleteResult = async (id) => {
    await fetch(`/api/watchdog/${id}`, { method: 'DELETE' })
    setResults(prev => prev.filter(r => r.id !== id))
    addToast('Result cleared (will re-audit next run)', 'info')
  }

  const filtered = results.filter(r => {
    if (filter === 'all') return true
    if (filter === 'fake') return r.verdict?.includes('FAKE')
    if (filter === 'suspicious') return r.verdict?.includes('SUSPICIOUS')
    if (filter === 'verified') return r.verdict?.includes('VERIFIED')
    return true
  })

  const fakesCount = results.filter(r => r.verdict?.includes('FAKE')).length
  const suspCount = results.filter(r => r.verdict?.includes('SUSPICIOUS')).length
  const verifiedCount = results.filter(r => r.verdict?.includes('VERIFIED')).length

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>🐕 Watchdog</h2>
          <p>PostEx rider fraud detection — Tri-Layer audit engine</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>🔄 Refresh</button>
          <button className="btn btn-primary btn-sm" onClick={runWatchdog} disabled={running || !activeStoreId}>
            {running ? <><span className="loading-spinner"></span> Running...</> : '🚀 Run Audit'}
          </button>
        </div>
      </div>

      {/* Summary Badges */}
      <div className="flex gap-2 mb-4" style={{ flexWrap: 'wrap' }}>
        <button className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter('all')}>All ({results.length})</button>
        <button className={`btn btn-sm ${filter === 'fake' ? 'btn-danger' : 'btn-secondary'}`} onClick={() => setFilter('fake')}>🔴 Fake ({fakesCount})</button>
        <button className={`btn btn-sm ${filter === 'suspicious' ? '' : 'btn-secondary'}`} style={filter === 'suspicious' ? { background: 'var(--orange)', color: 'white' } : {}} onClick={() => setFilter('suspicious')}>🟠 Suspicious ({suspCount})</button>
        <button className={`btn btn-sm ${filter === 'verified' ? 'btn-success' : 'btn-secondary'}`} onClick={() => setFilter('verified')}>🟢 Verified ({verifiedCount})</button>
      </div>

      {loading ? (
        <div className="loading-overlay"><span className="loading-spinner"></span> Loading audit results...</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🐕</div>
          <h3>{results.length === 0 ? 'No Audit Results Yet' : 'No Results Match Filter'}</h3>
          <p>{results.length === 0 ? 'Click "Run Audit" to start the PostEx rider verification' : 'Try a different filter'}</p>
          {results.length === 0 && (
            <button className="btn btn-primary mt-4" onClick={runWatchdog} disabled={running}>
              🚀 Run First Audit
            </button>
          )}
        </div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Tracking #</th>
                <th>Request Time</th>
                <th>Latest Status</th>
                <th>Verdict</th>
                <th>Duration</th>
                <th>Evidence (Enroute → Attempt)</th>
                <th>Audited At</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}>
                  <td className="font-mono" style={{ color: 'var(--brand)', fontSize: '0.75rem' }}>{r.tracking_number}</td>
                  <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {r.request_time ? new Date(r.request_time).toLocaleString() : '—'}
                  </td>
                  <td><span className="badge badge-advice">{r.latest_status || '—'}</span></td>
                  <td><span className={getVerdictClass(r.verdict)} style={{ fontSize: '0.78rem' }}>{r.verdict}</span></td>
                  <td style={{ fontWeight: 600, fontSize: '0.78rem' }}>{r.duration}</td>
                  <td className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{r.evidence}</td>
                  <td style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                  </td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => deleteResult(r.id)} title="Clear result (allow re-audit)">🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
