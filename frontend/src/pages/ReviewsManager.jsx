import React, { useState, useEffect, useCallback } from 'react'
import { useApp } from '../context/AppContext'

const API = import.meta.env.VITE_API_URL || ''

const STATUS_COLORS = {
  approved: { bg: 'rgba(74,222,128,0.12)', color: '#4ade80', border: 'rgba(74,222,128,0.25)', label: '✅ Approved' },
  pending:  { bg: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: 'rgba(251,191,36,0.25)', label: '⏳ Pending' },
  rejected: { bg: 'rgba(248,113,113,0.12)', color: '#f87171', border: 'rgba(248,113,113,0.25)', label: '❌ Rejected' },
}

function StarDisplay({ rating }) {
  return (
    <span style={{ letterSpacing: 2, fontSize: 14 }}>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ color: i <= rating ? '#FFD700' : '#333' }}>★</span>
      ))}
    </span>
  )
}

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.pending
  return (
    <span style={{
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      borderRadius: 99, padding: '3px 10px', fontSize: 11, fontWeight: 700,
      letterSpacing: 0.5, whiteSpace: 'nowrap'
    }}>
      {s.label}
    </span>
  )
}

export default function ReviewsManager() {
  const { token, addToast, activeStoreId } = useApp()
  const [reviews, setReviews]     = useState([])
  const [total, setTotal]         = useState(0)
  const [loading, setLoading]     = useState(true)
  const [filter, setFilter]       = useState('pending')
  const [search, setSearch]       = useState('')
  const [page, setPage]           = useState(1)
  const [actionLoading, setActionLoading] = useState({})
  const LIMIT = 25

  const fetchReviews = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ status: filter, page, limit: LIMIT })
      if (search) params.set('handle', search.trim())
      if (activeStoreId) params.set('store_id', activeStoreId)
      const res = await fetch(`${API}/api/reviews?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const json = await res.json()
      if (json.success) {
        setReviews(json.data.reviews)
        setTotal(json.data.total)
      }
    } catch (err) {
      addToast('Failed to load reviews', 'error')
    } finally {
      setLoading(false)
    }
  }, [token, filter, page, search, activeStoreId])

  useEffect(() => { fetchReviews() }, [fetchReviews])

  async function doAction(id, action) {
    setActionLoading(prev => ({ ...prev, [id]: action }))
    try {
      const method = action === 'delete' ? 'DELETE' : 'PUT'
      const url = action === 'delete'
        ? `${API}/api/reviews/${id}`
        : `${API}/api/reviews/${id}/${action}`
      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}` }
      })
      const json = await res.json()
      if (json.success) {
        addToast(
          action === 'approve' ? '✅ Review approved' :
          action === 'reject'  ? '❌ Review rejected' : '🗑️ Review deleted',
          'success'
        )
        fetchReviews()
      } else {
        addToast(json.error || 'Action failed', 'error')
      }
    } catch (err) {
      addToast('Action failed', 'error')
    } finally {
      setActionLoading(prev => ({ ...prev, [id]: null }))
    }
  }

  const totalPages = Math.ceil(total / LIMIT)

  const summaryStats = {
    total,
    pending: filter === 'pending' ? total : '—',
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: 1 }}>
          ⭐ Reviews Manager
        </h1>
        <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>
          Approve, reject, or delete customer reviews before they appear on tracepk.com
        </p>
      </div>

      {/* Filter Bar */}
      <div style={{
        display: 'flex', gap: 12, alignItems: 'center',
        flexWrap: 'wrap', marginBottom: 20
      }}>
        {['pending', 'approved', 'rejected', 'all'].map(f => (
          <button
            key={f}
            onClick={() => { setFilter(f); setPage(1) }}
            style={{
              padding: '7px 18px',
              borderRadius: 8,
              border: filter === f
                ? '1px solid var(--accent)'
                : '1px solid var(--border)',
              background: filter === f ? 'var(--accent)' : 'transparent',
              color: filter === f ? '#000' : 'var(--text-muted)',
              fontWeight: 700, fontSize: 13, cursor: 'pointer',
              textTransform: 'capitalize', transition: 'all 0.15s'
            }}
          >
            {f === 'all' ? 'All Reviews' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Filter by product handle..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '8px 14px', color: 'var(--text)',
              fontSize: 13, width: 240, outline: 'none'
            }}
          />
          <span style={{ color: 'var(--text-muted)', fontSize: 13, whiteSpace: 'nowrap' }}>
            {total} review{total !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Reviews Table */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        overflow: 'hidden'
      }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
            <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
            Loading reviews...
          </div>
        ) : reviews.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>
              {filter === 'pending' ? '🎉' : '📭'}
            </div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>
              {filter === 'pending' ? 'No pending reviews!' : 'No reviews found'}
            </div>
            <div style={{ fontSize: 13, marginTop: 6, opacity: 0.6 }}>
              {filter === 'pending' ? 'You\'re all caught up.' : 'Try changing the filter.'}
            </div>
          </div>
        ) : (
          <div>
            {/* Table Header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 120px 100px 180px 140px',
              padding: '12px 20px',
              borderBottom: '1px solid var(--border)',
              fontSize: 11, fontWeight: 700, letterSpacing: 1,
              color: 'var(--text-muted)', textTransform: 'uppercase'
            }}>
              <span>Review</span>
              <span>Rating</span>
              <span>Status</span>
              <span>Product</span>
              <span style={{ textAlign: 'right' }}>Actions</span>
            </div>

            {/* Rows */}
            {reviews.map((r, idx) => (
              <div
                key={r.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 120px 100px 180px 140px',
                  padding: '16px 20px',
                  borderBottom: idx < reviews.length - 1 ? '1px solid var(--border)' : 'none',
                  alignItems: 'start',
                  gap: 12,
                  transition: 'background 0.15s',
                  cursor: 'default',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {/* Review Content */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{r.reviewer_name}</span>
                    {r.reviewer_email && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', opacity: 0.7 }}>
                        {r.reviewer_email}
                      </span>
                    )}
                  </div>
                  {r.title && (
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{r.title}</div>
                  )}
                  <div style={{
                    fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55,
                    maxHeight: 60, overflow: 'hidden', textOverflow: 'ellipsis',
                    display: '-webkit-box', WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical'
                  }}>
                    {r.body || <em style={{ opacity: 0.4 }}>No body</em>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, opacity: 0.5 }}>
                    {r.location && `📍 ${r.location} · `}
                    {r.review_date ? new Date(r.review_date).toLocaleDateString('en-PK', {
                      year: 'numeric', month: 'short', day: 'numeric'
                    }) : ''}
                  </div>
                </div>

                {/* Rating */}
                <div style={{ paddingTop: 2 }}>
                  <StarDisplay rating={r.rating} />
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                    {r.rating}/5
                  </div>
                </div>

                {/* Status */}
                <div style={{ paddingTop: 2 }}>
                  <StatusBadge status={r.status} />
                </div>

                {/* Product Handle */}
                <div style={{
                  fontSize: 12, color: 'var(--text-muted)',
                  fontFamily: 'monospace', paddingTop: 4,
                  wordBreak: 'break-all'
                }}>
                  <a
                    href={`https://tracepk.com/products/${r.product_handle}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--accent)', textDecoration: 'none' }}
                  >
                    {r.product_handle}
                  </a>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', paddingTop: 2 }}>
                  {r.status !== 'approved' && (
                    <button
                      onClick={() => doAction(r.id, 'approve')}
                      disabled={!!actionLoading[r.id]}
                      title="Approve"
                      style={{
                        padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(74,222,128,0.3)',
                        background: 'rgba(74,222,128,0.1)', color: '#4ade80',
                        fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        opacity: actionLoading[r.id] ? 0.5 : 1, transition: 'all 0.15s'
                      }}
                    >
                      {actionLoading[r.id] === 'approve' ? '...' : '✅'}
                    </button>
                  )}
                  {r.status !== 'rejected' && (
                    <button
                      onClick={() => doAction(r.id, 'reject')}
                      disabled={!!actionLoading[r.id]}
                      title="Reject"
                      style={{
                        padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(251,191,36,0.3)',
                        background: 'rgba(251,191,36,0.1)', color: '#fbbf24',
                        fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        opacity: actionLoading[r.id] ? 0.5 : 1, transition: 'all 0.15s'
                      }}
                    >
                      {actionLoading[r.id] === 'reject' ? '...' : '⏸️'}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (window.confirm('Delete this review permanently?')) doAction(r.id, 'delete')
                    }}
                    disabled={!!actionLoading[r.id]}
                    title="Delete"
                    style={{
                      padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(248,113,113,0.3)',
                      background: 'rgba(248,113,113,0.1)', color: '#f87171',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      opacity: actionLoading[r.id] ? 0.5 : 1, transition: 'all 0.15s'
                    }}
                  >
                    {actionLoading[r.id] === 'delete' ? '...' : '🗑️'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 20 }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              padding: '7px 16px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text)', cursor: 'pointer',
              opacity: page === 1 ? 0.3 : 1
            }}
          >← Prev</button>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{
              padding: '7px 16px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text)', cursor: 'pointer',
              opacity: page === totalPages ? 0.3 : 1
            }}
          >Next →</button>
        </div>
      )}
    </div>
  )
}
