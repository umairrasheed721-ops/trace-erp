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
  
  // Navigation tab state
  const [activeTab, setActiveTab] = useState('moderation') // 'moderation' | 'campaigns' | 'templates'
  
  // Moderation tab state
  const [reviews, setReviews]     = useState([])
  const [total, setTotal]         = useState(0)
  const [loading, setLoading]     = useState(true)
  const [filter, setFilter]       = useState('pending')
  const [search, setSearch]       = useState('')
  const [page, setPage]           = useState(1)
  const [actionLoading, setActionLoading] = useState({})
  const LIMIT = 25

  // Campaign tab state
  const [daysWindow, setDaysWindow]       = useState(7)
  const [campaignStats, setCampaignStats] = useState({ totalDelivered: 0, sent: 0, pending: 0, noEmail: 0 })
  const [campaignOrders, setCampaignOrders] = useState([])
  const [campaignTotal, setCampaignTotal]   = useState(0)
  const [campaignPage, setCampaignPage]     = useState(1)
  const [campaignLoading, setCampaignLoading] = useState(false)
  const [scanLoading, setScanLoading]       = useState(false)
  const [sendingSingle, setSendingSingle]   = useState({})
  const [inputEmails, setInputEmails]       = useState({})

  // Template Manager state
  const [templateSubject, setTemplateSubject] = useState('')
  const [templateHtml, setTemplateHtml]       = useState('')
  const [templateLoading, setTemplateLoading] = useState(false)
  const [templateSaving, setTemplateSaving]   = useState(false)

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

  const fetchCampaignData = useCallback(async () => {
    setCampaignLoading(true)
    try {
      const statsParams = new URLSearchParams({ days: daysWindow })
      if (activeStoreId) statsParams.set('store_id', activeStoreId)

      const ordersParams = new URLSearchParams({ days: daysWindow, page: campaignPage, limit: 50 })
      if (activeStoreId) ordersParams.set('store_id', activeStoreId)

      const [statsRes, ordersRes] = await Promise.all([
        fetch(`${API}/api/reviews/campaigns/stats?${statsParams}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/api/reviews/campaigns/orders?${ordersParams}`, { headers: { Authorization: `Bearer ${token}` } })
      ])

      const statsJson = await statsRes.json()
      const ordersJson = await ordersRes.json()

      if (statsJson.success) setCampaignStats(statsJson.data)
      if (ordersJson.success) {
        setCampaignOrders(ordersJson.data.orders)
        setCampaignTotal(ordersJson.data.total)
      }
    } catch (err) {
      addToast('Failed to load email campaign data', 'error')
    } finally {
      setCampaignLoading(false)
    }
  }, [token, daysWindow, campaignPage, activeStoreId])

  const fetchTemplateData = useCallback(async () => {
    setTemplateLoading(true)
    try {
      const res = await fetch(`${API}/api/reviews/templates/review_request`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const json = await res.json()
      if (json.success) {
        setTemplateSubject(json.data.subject)
        setTemplateHtml(json.data.bodyHtml)
      }
    } catch (err) {
      addToast('Failed to load email template', 'error')
    } finally {
      setTemplateLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (activeTab === 'moderation') fetchReviews()
    else if (activeTab === 'campaigns') fetchCampaignData()
    else if (activeTab === 'templates') fetchTemplateData()
  }, [activeTab, fetchReviews, fetchCampaignData, fetchTemplateData])

  async function saveTemplate() {
    setTemplateSaving(true)
    try {
      const res = await fetch(`${API}/api/reviews/templates/review_request`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ subject: templateSubject, bodyHtml: templateHtml })
      })
      const json = await res.json()
      if (json.success) {
        addToast('✅ Email template saved successfully!', 'success')
      } else {
        addToast(json.error || 'Failed to save template', 'error')
      }
    } catch (err) {
      addToast('Failed to save template', 'error')
    } finally {
      setTemplateSaving(false)
    }
  }

  async function resetTemplate() {
    if (!window.confirm('Reset template to original default design?')) return
    setTemplateSaving(true)
    try {
      const res = await fetch(`${API}/api/reviews/templates/review_request/reset`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      const json = await res.json()
      if (json.success) {
        setTemplateSubject(json.data.subject)
        setTemplateHtml(json.data.bodyHtml)
        addToast('✅ Template reset to default', 'success')
      } else {
        addToast(json.error || 'Failed to reset template', 'error')
      }
    } catch (err) {
      addToast('Failed to reset template', 'error')
    } finally {
      setTemplateSaving(false)
    }
  }

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

  async function triggerBatchScan() {
    setScanLoading(true)
    try {
      const res = await fetch(`${API}/api/reviews/campaigns/trigger-scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ days: daysWindow })
      })
      const json = await res.json()
      if (json.success) {
        addToast(`🚀 Review email scan complete! Processed: ${json.data.processed}, Sent: ${json.data.sent}`, 'success')
        fetchCampaignData()
      } else {
        addToast(json.error || 'Scan failed', 'error')
      }
    } catch (err) {
      addToast('Failed to trigger email scan', 'error')
    } finally {
      setScanLoading(false)
    }
  }

  async function sendSingleEmail(orderId, defaultEmail) {
    const customEmail = inputEmails[orderId] || defaultEmail
    if (!customEmail) {
      addToast('Please enter a valid customer email address', 'error')
      return
    }

    setSendingSingle(prev => ({ ...prev, [orderId]: true }))
    try {
      const res = await fetch(`${API}/api/reviews/campaigns/send-single`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ order_id: orderId, email: customEmail })
      })
      const json = await res.json()
      if (json.success) {
        addToast(`✅ ${json.message}`, 'success')
        fetchCampaignData()
      } else {
        addToast(json.error || 'Failed to send email', 'error')
      }
    } catch (err) {
      addToast('Failed to send email', 'error')
    } finally {
      setSendingSingle(prev => ({ ...prev, [orderId]: false }))
    }
  }

  const totalPages = Math.ceil(total / LIMIT)

  // Compute live preview HTML with mock variables
  const previewHtml = (templateHtml || '')
    .replace(/\{\{customer_name\}\}/g, 'Salar Khan')
    .replace(/\{\{first_name\}\}/g, 'Salar')
    .replace(/\{\{product_title\}\}/g, 'TRACE Heavyweight Oversized Hoodie')
    .replace(/\{\{review_url\}\}/g, '#preview-mode')

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: 1 }}>
            ⭐ Reviews & Email Campaigns
          </h1>
          <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>
            Moderate customer reviews, manage review request campaigns, and customize email templates
          </p>
        </div>

        {/* Top Level Nav Tabs */}
        <div style={{ display: 'flex', background: 'var(--surface)', padding: 4, borderRadius: 10, border: '1px solid var(--border)' }}>
          <button
            onClick={() => setActiveTab('moderation')}
            style={{
              padding: '8px 18px', borderRadius: 8, border: 'none',
              background: activeTab === 'moderation' ? 'var(--accent)' : 'transparent',
              color: activeTab === 'moderation' ? '#000' : 'var(--text-muted)',
              fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s'
            }}
          >
            ⭐ Moderation
          </button>
          <button
            onClick={() => setActiveTab('campaigns')}
            style={{
              padding: '8px 18px', borderRadius: 8, border: 'none',
              background: activeTab === 'campaigns' ? 'var(--accent)' : 'transparent',
              color: activeTab === 'campaigns' ? '#000' : 'var(--text-muted)',
              fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s'
            }}
          >
            📧 Campaigns
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            style={{
              padding: '8px 18px', borderRadius: 8, border: 'none',
              background: activeTab === 'templates' ? 'var(--accent)' : 'transparent',
              color: activeTab === 'templates' ? '#000' : 'var(--text-muted)',
              fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s'
            }}
          >
            📝 Template Manager
          </button>
        </div>
      </div>

      {/* MODERATION TAB CONTENT */}
      {activeTab === 'moderation' && (
        <>
          {/* Filter Bar */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
            {['pending', 'approved', 'rejected', 'all'].map(f => (
              <button
                key={f}
                onClick={() => { setFilter(f); setPage(1) }}
                style={{
                  padding: '7px 18px', borderRadius: 8,
                  border: filter === f ? '1px solid var(--accent)' : '1px solid var(--border)',
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
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
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
                  display: 'grid', gridTemplateColumns: '1fr 120px 100px 180px 140px',
                  padding: '12px 20px', borderBottom: '1px solid var(--border)',
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
                      display: 'grid', gridTemplateColumns: '1fr 120px 100px 180px 140px',
                      padding: '16px 20px',
                      borderBottom: idx < reviews.length - 1 ? '1px solid var(--border)' : 'none',
                      alignItems: 'start', gap: 12, transition: 'background 0.15s', cursor: 'default'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{r.reviewer_name}</span>
                        {r.reviewer_email && (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', opacity: 0.7 }}>
                            {r.reviewer_email}
                          </span>
                        )}
                      </div>
                      {r.title && <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{r.title}</div>}
                      <div style={{
                        fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55,
                        maxHeight: 60, overflow: 'hidden', textOverflow: 'ellipsis',
                        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical'
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

                    <div style={{ paddingTop: 2 }}>
                      <StarDisplay rating={r.rating} />
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                        {r.rating}/5
                      </div>
                    </div>

                    <div style={{ paddingTop: 2 }}>
                      <StatusBadge status={r.status} />
                    </div>

                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace', paddingTop: 4, wordBreak: 'break-all' }}>
                      <a href={`https://tracepk.com/products/${r.product_handle}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                        {r.product_handle}
                      </a>
                    </div>

                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', paddingTop: 2 }}>
                      {r.status !== 'approved' && (
                        <button
                          onClick={() => doAction(r.id, 'approve')}
                          disabled={!!actionLoading[r.id]}
                          title="Approve"
                          style={{
                            padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(74,222,128,0.3)',
                            background: 'rgba(74,222,128,0.1)', color: '#4ade80', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                            opacity: actionLoading[r.id] ? 0.5 : 1
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
                            background: 'rgba(251,191,36,0.1)', color: '#fbbf24', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                            opacity: actionLoading[r.id] ? 0.5 : 1
                          }}
                        >
                          {actionLoading[r.id] === 'reject' ? '...' : '⏸️'}
                        </button>
                      )}
                      <button
                        onClick={() => { if (window.confirm('Delete this review permanently?')) doAction(r.id, 'delete') }}
                        disabled={!!actionLoading[r.id]}
                        title="Delete"
                        style={{
                          padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(248,113,113,0.3)',
                          background: 'rgba(248,113,113,0.1)', color: '#f87171', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                          opacity: actionLoading[r.id] ? 0.5 : 1
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

          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 20 }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', opacity: page === 1 ? 0.3 : 1 }}>← Prev</button>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Page {page} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', opacity: page === totalPages ? 0.3 : 1 }}>Next →</button>
            </div>
          )}
        </>
      )}

      {/* CAMPAIGNS TAB CONTENT */}
      {activeTab === 'campaigns' && (
        <>
          {/* Summary Stat Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                📦 Delivered Orders (Last {daysWindow}D)
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, marginTop: 8, color: '#fff' }}>
                {campaignStats.totalDelivered}
              </div>
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 12, padding: '18px 20px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                🟢 Review Emails Sent
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, marginTop: 8, color: '#4ade80' }}>
                {campaignStats.sent}
              </div>
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 12, padding: '18px 20px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                ⏳ Pending Email Scan
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, marginTop: 8, color: '#fbbf24' }}>
                {campaignStats.pending}
              </div>
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                ⚪ Skipped (No Email Address)
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, marginTop: 8, color: 'var(--text-muted)' }}>
                {campaignStats.noEmail}
              </div>
            </div>
          </div>

          {/* Action Bar */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>Window Period:</span>
              <select
                value={daysWindow}
                onChange={e => { setDaysWindow(parseInt(e.target.value)); setCampaignPage(1) }}
                style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '7px 12px', color: 'var(--text)',
                  fontSize: 13, fontWeight: 600, outline: 'none'
                }}
              >
                <option value={7}>Last 7 Days (Recommended)</option>
                <option value={14}>Last 14 Days</option>
                <option value={30}>Last 30 Days</option>
              </select>
            </div>

            <button
              onClick={triggerBatchScan}
              disabled={scanLoading}
              style={{
                padding: '9px 20px', borderRadius: 8, border: 'none',
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                opacity: scanLoading ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 8
              }}
            >
              {scanLoading ? '🚀 Scanning & Sending...' : `🚀 Trigger Email Scan (Last ${daysWindow} Days)`}
            </button>
          </div>

          {/* Delivered Orders Table */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
            {campaignLoading ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
                <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
                Loading email campaign data...
              </div>
            ) : campaignOrders.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>No delivered orders in last {daysWindow} days</div>
              </div>
            ) : (
              <div>
                {/* Table Header */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '120px 160px 1fr 140px 120px 140px',
                  padding: '12px 20px', borderBottom: '1px solid var(--border)',
                  fontSize: 11, fontWeight: 700, letterSpacing: 1,
                  color: 'var(--text-muted)', textTransform: 'uppercase'
                }}>
                  <span>Order Ref</span>
                  <span>Customer</span>
                  <span>Email Address</span>
                  <span>Delivered On</span>
                  <span>Email Status</span>
                  <span style={{ textAlign: 'right' }}>Action</span>
                </div>

                {/* Rows */}
                {campaignOrders.map((o, idx) => {
                  const isSent = o.review_email_sent === 1
                  const isNoEmail = o.review_email_sent === -1 || !o.email

                  return (
                    <div
                      key={o.id}
                      style={{
                        display: 'grid', gridTemplateColumns: '120px 160px 1fr 140px 120px 140px',
                        padding: '14px 20px',
                        borderBottom: idx < campaignOrders.length - 1 ? '1px solid var(--border)' : 'none',
                        alignItems: 'center', gap: 12
                      }}
                    >
                      <span style={{ fontWeight: 700, fontSize: 13, fontFamily: 'monospace' }}>
                        {o.ref_number || `#${o.id}`}
                      </span>

                      <span style={{ fontSize: 13, fontWeight: 600 }}>
                        {o.customer_name || 'Customer'}
                      </span>

                      <div>
                        {o.email ? (
                          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                            {o.email}
                          </span>
                        ) : (
                          <input
                            type="email"
                            placeholder="Enter email..."
                            value={inputEmails[o.id] || ''}
                            onChange={e => setInputEmails({ ...inputEmails, [o.id]: e.target.value })}
                            style={{
                              background: '#1a1a1a', border: '1px solid #333', borderRadius: 6,
                              padding: '5px 10px', fontSize: 12, color: '#fff', width: '90%', outline: 'none'
                            }}
                          />
                        )}
                      </div>

                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {o.status_date ? new Date(o.status_date).toLocaleDateString('en-PK', {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                        }) : 'N/A'}
                      </span>

                      <div>
                        {isSent ? (
                          <span style={{ background: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 99, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>
                            🟢 Sent
                          </span>
                        ) : isNoEmail ? (
                          <span style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 99, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>
                            ⚪ No Email
                          </span>
                        ) : (
                          <span style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 99, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>
                            ⏳ Pending
                          </span>
                        )}
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <button
                          onClick={() => sendSingleEmail(o.id, o.email)}
                          disabled={sendingSingle[o.id]}
                          style={{
                            padding: '6px 14px', borderRadius: 6, border: 'none',
                            background: isSent ? 'var(--surface-hover)' : 'var(--accent)',
                            color: isSent ? 'var(--text-muted)' : '#000',
                            fontSize: 12, fontWeight: 700, cursor: 'pointer',
                            opacity: sendingSingle[o.id] ? 0.5 : 1
                          }}
                        >
                          {sendingSingle[o.id] ? 'Sending...' : isSent ? 'Resend' : 'Send Now'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ──────────────────────────────────────────────────────────────── */}
      {/* TAB 3: EMAIL TEMPLATE MANAGER */}
      {/* ──────────────────────────────────────────────────────────────── */}
      {activeTab === 'templates' && (
        <div>
          {templateLoading ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
              <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
              Loading Email Template...
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
              
              {/* Left Column: Template Editor */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>📝 Review Request Email Template</h3>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={resetTemplate}
                      disabled={templateSaving}
                      style={{
                        padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)',
                        background: 'transparent', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer'
                      }}
                    >
                      Reset Default
                    </button>
                    <button
                      onClick={saveTemplate}
                      disabled={templateSaving}
                      style={{
                        padding: '6px 18px', borderRadius: 8, border: 'none',
                        background: 'var(--accent)', color: '#000', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        opacity: templateSaving ? 0.6 : 1
                      }}
                    >
                      {templateSaving ? 'Saving...' : '💾 Save Template'}
                    </button>
                  </div>
                </div>

                {/* Available Variables Pills */}
                <div style={{ marginBottom: 16, background: '#111', padding: 12, borderRadius: 10, border: '1px dashed #333' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
                    Available Placeholders (Click to insert):
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {['{{customer_name}}', '{{first_name}}', '{{product_title}}', '{{review_url}}'].map(tag => (
                      <button
                        key={tag}
                        onClick={() => {
                          setTemplateHtml(prev => prev + tag)
                          addToast(`Copied/Inserted: ${tag}`, 'info')
                        }}
                        style={{
                          background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                          color: 'var(--accent)', borderRadius: 6, padding: '4px 8px', fontSize: 11,
                          fontFamily: 'monospace', cursor: 'pointer'
                        }}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Subject Field */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
                    Email Subject Line:
                  </label>
                  <input
                    type="text"
                    value={templateSubject}
                    onChange={e => setTemplateSubject(e.target.value)}
                    placeholder="e.g. How was your TRACE order, {{first_name}}? ⭐"
                    style={{
                      width: '100%', background: '#141414', border: '1px solid var(--border)',
                      borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 13,
                      fontWeight: 600, outline: 'none'
                    }}
                  />
                </div>

                {/* HTML Body Editor */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
                    HTML Template Body Code:
                  </label>
                  <textarea
                    value={templateHtml}
                    onChange={e => setTemplateHtml(e.target.value)}
                    rows={18}
                    style={{
                      width: '100%', background: '#0d0d0d', border: '1px solid var(--border)',
                      borderRadius: 8, padding: '12px', color: '#38bdf8', fontSize: 12,
                      fontFamily: 'monospace', lineHeight: 1.5, outline: 'none', resize: 'vertical'
                    }}
                  />
                </div>
              </div>

              {/* Right Column: Live Email Preview */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>👁️ Live Email Preview</h3>
                  <span style={{ fontSize: 11, background: 'rgba(74,222,128,0.1)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.2)', padding: '2px 8px', borderRadius: 99, fontWeight: 700 }}>
                    Real-time Sample Render
                  </span>
                </div>

                {/* Preview Frame */}
                <div style={{ border: '1px solid #333', borderRadius: 10, overflow: 'hidden', background: '#0a0a0a' }}>
                  {/* Mock Email Top Bar */}
                  <div style={{ background: '#1e1e1e', padding: '10px 14px', borderBottom: '1px solid #333', fontSize: 12, color: '#aaa' }}>
                    <div><strong>From:</strong> TRACE Pakistan &lt;info@tracepk.com&gt;</div>
                    <div style={{ marginTop: 4 }}><strong>Subject:</strong> {templateSubject.replace(/\{\{first_name\}\}/g, 'Salar').replace(/\{\{customer_name\}\}/g, 'Salar Khan')}</div>
                  </div>

                  {/* Rendered HTML */}
                  <iframe
                    title="Email Preview"
                    srcDoc={previewHtml}
                    style={{ width: '100%', height: 480, border: 'none', background: '#0a0a0a' }}
                  />
                </div>
              </div>

            </div>
          )}
        </div>
      )}

    </div>
  )
}
