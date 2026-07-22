import React, { useState, useEffect, useCallback } from 'react'
import { useApp } from '../context/AppContext'

const API = import.meta.env.VITE_API_URL || ''

const STATUS_COLORS = {
  approved: { bg: 'rgba(74,222,128,0.12)', color: '#4ade80', border: 'rgba(74,222,128,0.25)', label: '✅ Approved' },
  pending:  { bg: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: 'rgba(251,191,36,0.25)', label: '⏳ Pending' },
  rejected: { bg: 'rgba(248,113,113,0.12)', color: '#f87171', border: 'rgba(248,113,113,0.25)', label: '❌ Rejected' },
}

function StarDisplay({ rating, size = 14 }) {
  return (
    <span style={{ letterSpacing: 2, fontSize: size, display: 'inline-flex', alignItems: 'center' }}>
      {[1, 2, 3, 4, 5].map(i => (
        <span
          key={i}
          style={{
            color: i <= rating ? '#fbbf24' : '#333',
            textShadow: i <= rating ? '0 0 10px rgba(251,191,36,0.4)' : 'none',
            transition: 'color 0.2s'
          }}
        >
          ★
        </span>
      ))}
    </span>
  )
}

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.pending
  return (
    <span style={{
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      borderRadius: 99, padding: '4px 12px', fontSize: 11, fontWeight: 700,
      letterSpacing: 0.5, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4
    }}>
      {s.label}
    </span>
  )
}

export default function ReviewsManager() {
  const { token, addToast, activeStoreId } = useApp()
  
  // Navigation tab state
  const [activeTab, setActiveTab] = useState('moderation') // 'moderation' | 'campaigns' | 'templates'
  
  // Lightbox state for review images
  const [selectedImage, setSelectedImage] = useState(null)

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
  const [previewDevice, setPreviewDevice]     = useState('desktop') // 'desktop' | 'mobile'

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
    <div style={{ padding: '28px 32px', maxWidth: 1280, margin: '0 auto', fontFamily: "'Inter', sans-serif" }}>

      {/* Hero Header Card */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(20,20,25,0.95) 0%, rgba(30,30,40,0.95) 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20,
        padding: '28px 32px',
        marginBottom: 28,
        boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Glow accent */}
        <div style={{
          position: 'absolute', top: -60, right: -60, width: 220, height: 220,
          background: 'radial-gradient(circle, rgba(251,191,36,0.15) 0%, rgba(0,0,0,0) 70%)',
          pointerEvents: 'none'
        }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20, position: 'relative', zIndex: 1 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 26 }}>⭐</span>
              <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0, letterSpacing: -0.5, color: '#fff' }}>
                Reviews & Email Campaigns
              </h1>
              <span style={{
                background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)',
                padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 800, letterSpacing: 0.5
              }}>
                AUTOMATED ENGINE
              </span>
            </div>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13, maxWidth: 600, lineHeight: 1.5 }}>
              Moderate customer product feedback, automate post-delivery review requests, and design custom email templates.
            </p>
          </div>

          {/* Navigation Pill Tabs */}
          <div style={{
            display: 'flex', background: 'rgba(0,0,0,0.5)', padding: 5, borderRadius: 14,
            border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(10px)'
          }}>
            <button
              onClick={() => setActiveTab('moderation')}
              style={{
                padding: '10px 22px', borderRadius: 10, border: 'none',
                background: activeTab === 'moderation' ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)' : 'transparent',
                color: activeTab === 'moderation' ? '#000' : 'var(--text-muted)',
                fontWeight: 800, fontSize: 13, cursor: 'pointer', transition: 'all 0.2s ease',
                boxShadow: activeTab === 'moderation' ? '0 4px 15px rgba(245,158,11,0.3)' : 'none',
                display: 'flex', alignItems: 'center', gap: 8
              }}
            >
              <span>⭐ Moderation</span>
            </button>

            <button
              onClick={() => setActiveTab('campaigns')}
              style={{
                padding: '10px 22px', borderRadius: 10, border: 'none',
                background: activeTab === 'campaigns' ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : 'transparent',
                color: activeTab === 'campaigns' ? '#fff' : 'var(--text-muted)',
                fontWeight: 800, fontSize: 13, cursor: 'pointer', transition: 'all 0.2s ease',
                boxShadow: activeTab === 'campaigns' ? '0 4px 15px rgba(59,130,246,0.3)' : 'none',
                display: 'flex', alignItems: 'center', gap: 8
              }}
            >
              <span>📧 Campaigns</span>
            </button>

            <button
              onClick={() => setActiveTab('templates')}
              style={{
                padding: '10px 22px', borderRadius: 10, border: 'none',
                background: activeTab === 'templates' ? 'linear-gradient(135deg, #a855f7 0%, #9333ea 100%)' : 'transparent',
                color: activeTab === 'templates' ? '#fff' : 'var(--text-muted)',
                fontWeight: 800, fontSize: 13, cursor: 'pointer', transition: 'all 0.2s ease',
                boxShadow: activeTab === 'templates' ? '0 4px 15px rgba(168,85,247,0.3)' : 'none',
                display: 'flex', alignItems: 'center', gap: 8
              }}
            >
              <span>📝 Template Studio</span>
            </button>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────── */}
      {/* TAB 1: REVIEWS MODERATION */}
      {/* ──────────────────────────────────────────────────────────────── */}
      {activeTab === 'moderation' && (
        <>
          {/* Controls Bar */}
          <div style={{
            display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', marginBottom: 24, background: 'var(--surface)',
            padding: '14px 20px', borderRadius: 14, border: '1px solid var(--border)'
          }}>
            {/* Filter Pills */}
            <div style={{ display: 'flex', gap: 8 }}>
              {['pending', 'approved', 'rejected', 'all'].map(f => (
                <button
                  key={f}
                  onClick={() => { setFilter(f); setPage(1) }}
                  style={{
                    padding: '7px 16px', borderRadius: 8, border: '1px solid',
                    borderColor: filter === f ? 'var(--accent)' : 'transparent',
                    background: filter === f ? 'rgba(255,255,255,0.08)' : 'transparent',
                    color: filter === f ? '#fff' : 'var(--text-muted)',
                    fontWeight: 700, fontSize: 12, cursor: 'pointer', textTransform: 'capitalize',
                    transition: 'all 0.15s'
                  }}
                >
                  {f === 'pending' ? '⏳ Pending' : f === 'approved' ? '✅ Approved' : f === 'rejected' ? '❌ Rejected' : 'All Reviews'}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Search handle or customer..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                style={{
                  background: '#141414', border: '1px solid var(--border)', borderRadius: 8,
                  padding: '7px 14px', color: '#fff', fontSize: 13, outline: 'none', width: 220
                }}
              />
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                Total: <strong style={{ color: '#fff' }}>{total}</strong>
              </span>
            </div>
          </div>

          {/* Reviews List */}
          {loading ? (
            <div style={{ padding: 64, textAlign: 'center', color: 'var(--text-muted)' }}>
              <div className="loading-spinner" style={{ margin: '0 auto 16px' }} />
              Fetching product reviews...
            </div>
          ) : reviews.length === 0 ? (
            <div style={{
              background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 16,
              padding: 64, textAlign: 'center', color: 'var(--text-muted)'
            }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>💬</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 4 }}>No reviews found</div>
              <div style={{ fontSize: 13 }}>No product reviews match the current filter criteria.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {reviews.map(r => (
                <div
                  key={r.id}
                  style={{
                    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
                    padding: 20, transition: 'transform 0.15s, border-color 0.15s',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 12 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <StarDisplay rating={r.rating} size={16} />
                        <span style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>
                          {r.customer_name || 'Anonymous Customer'}
                        </span>
                        {r.verified && (
                          <span style={{ background: 'rgba(74,222,128,0.15)', color: '#4ade80', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 99 }}>
                            VERIFIED BUYER
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <span>Product: <strong style={{ color: '#fff' }}>{r.product_handle}</strong></span>
                        {r.email && <span>Email: <strong style={{ color: '#fff' }}>{r.email}</strong></span>}
                        <span>Date: {new Date(r.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <StatusBadge status={r.status} />
                  </div>

                  {/* Body Text */}
                  {r.body && (
                    <p style={{
                      margin: '0 0 14px', fontSize: 14, color: '#ddd', lineHeight: 1.6,
                      background: 'rgba(0,0,0,0.25)', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)'
                    }}>
                      "{r.body}"
                    </p>
                  )}

                  {/* Photo Thumbnails */}
                  {Array.isArray(r.photos) && r.photos.length > 0 && (
                    <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                      {r.photos.map((pUrl, pIdx) => (
                        <img
                          key={pIdx}
                          src={pUrl}
                          alt="Customer feedback thumbnail"
                          onClick={() => setSelectedImage(pUrl)}
                          style={{
                            width: 64, height: 64, borderRadius: 8, objectFit: 'cover',
                            border: '1px solid var(--border)', cursor: 'pointer', transition: 'transform 0.15s'
                          }}
                        />
                      ))}
                    </div>
                  )}

                  {/* Action Controls */}
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    {r.status !== 'approved' && (
                      <button
                        onClick={() => doAction(r.id, 'approve')}
                        disabled={actionLoading[r.id] === 'approve'}
                        style={{
                          padding: '6px 14px', borderRadius: 8, border: 'none',
                          background: 'rgba(74,222,128,0.15)', color: '#4ade80',
                          fontSize: 12, fontWeight: 700, cursor: 'pointer'
                        }}
                      >
                        {actionLoading[r.id] === 'approve' ? 'Approving...' : 'Approve'}
                      </button>
                    )}

                    {r.status !== 'rejected' && (
                      <button
                        onClick={() => doAction(r.id, 'reject')}
                        disabled={actionLoading[r.id] === 'reject'}
                        style={{
                          padding: '6px 14px', borderRadius: 8, border: 'none',
                          background: 'rgba(251,191,36,0.15)', color: '#fbbf24',
                          fontSize: 12, fontWeight: 700, cursor: 'pointer'
                        }}
                      >
                        {actionLoading[r.id] === 'reject' ? 'Rejecting...' : 'Reject'}
                      </button>
                    )}

                    <button
                      onClick={() => doAction(r.id, 'delete')}
                      disabled={actionLoading[r.id] === 'delete'}
                      style={{
                        padding: '6px 14px', borderRadius: 8, border: 'none',
                        background: 'rgba(248,113,113,0.15)', color: '#f87171',
                        fontSize: 12, fontWeight: 700, cursor: 'pointer'
                      }}
                    >
                      {actionLoading[r.id] === 'delete' ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              ))}

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
                  {Array.from({ length: totalPages }).map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setPage(idx + 1)}
                      style={{
                        width: 36, height: 36, borderRadius: 8, border: 'none',
                        background: page === idx + 1 ? 'var(--accent)' : 'var(--surface)',
                        color: page === idx + 1 ? '#000' : '#fff', fontWeight: 700, cursor: 'pointer'
                      }}
                    >
                      {idx + 1}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ──────────────────────────────────────────────────────────────── */}
      {/* TAB 2: EMAIL CAMPAIGNS */}
      {/* ──────────────────────────────────────────────────────────────── */}
      {activeTab === 'campaigns' && (
        <>
          {/* KPI Metrics Dashboard Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
            
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20,
              boxShadow: '0 8px 20px rgba(0,0,0,0.2)'
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                📦 Delivered Orders ({daysWindow}D)
              </div>
              <div style={{ fontSize: 32, fontWeight: 900, marginTop: 6, color: '#fff' }}>
                {campaignStats.totalDelivered}
              </div>
            </div>

            <div style={{
              background: 'linear-gradient(135deg, rgba(74,222,128,0.08) 0%, rgba(20,20,25,0.95) 100%)',
              border: '1px solid rgba(74,222,128,0.25)', borderRadius: 16, padding: 20,
              boxShadow: '0 8px 20px rgba(0,0,0,0.2)'
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                🟢 Review Emails Sent
              </div>
              <div style={{ fontSize: 32, fontWeight: 900, marginTop: 6, color: '#4ade80' }}>
                {campaignStats.sent}
              </div>
            </div>

            <div style={{
              background: 'linear-gradient(135deg, rgba(251,191,36,0.08) 0%, rgba(20,20,25,0.95) 100%)',
              border: '1px solid rgba(251,191,36,0.25)', borderRadius: 16, padding: 20,
              boxShadow: '0 8px 20px rgba(0,0,0,0.2)'
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                ⏳ Pending Email Scan
              </div>
              <div style={{ fontSize: 32, fontWeight: 900, marginTop: 6, color: '#fbbf24' }}>
                {campaignStats.pending}
              </div>
            </div>

            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20,
              boxShadow: '0 8px 20px rgba(0,0,0,0.2)'
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                ⚪ Skipped (No Email)
              </div>
              <div style={{ fontSize: 32, fontWeight: 900, marginTop: 6, color: 'var(--text-muted)' }}>
                {campaignStats.noEmail}
              </div>
            </div>

          </div>

          {/* Action Bar */}
          <div style={{
            display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', marginBottom: 20, background: 'var(--surface)', padding: '14px 20px',
            borderRadius: 14, border: '1px solid var(--border)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>Window Period:</span>
              <select
                value={daysWindow}
                onChange={e => { setDaysWindow(parseInt(e.target.value)); setCampaignPage(1) }}
                style={{
                  background: '#141414', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '8px 14px', color: '#fff',
                  fontSize: 13, fontWeight: 700, outline: 'none'
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
                padding: '10px 22px', borderRadius: 10, border: 'none',
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer',
                opacity: scanLoading ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 8,
                boxShadow: '0 4px 15px rgba(59,130,246,0.3)'
              }}
            >
              {scanLoading ? '🚀 Scanning & Sending...' : `🚀 Trigger Email Scan (Last ${daysWindow} Days)`}
            </button>
          </div>

          {/* Delivered Orders Table */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
            {campaignLoading ? (
              <div style={{ padding: 64, textAlign: 'center', color: 'var(--text-muted)' }}>
                <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
                Loading email campaign data...
              </div>
            ) : campaignOrders.length === 0 ? (
              <div style={{ padding: 64, textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 44, marginBottom: 12 }}>📦</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>No delivered orders found</div>
              </div>
            ) : (
              <div>
                <div style={{
                  display: 'grid', gridTemplateColumns: '130px 180px 1fr 150px 130px 140px',
                  padding: '14px 20px', borderBottom: '1px solid var(--border)',
                  fontSize: 11, fontWeight: 800, letterSpacing: 1,
                  color: 'var(--text-muted)', textTransform: 'uppercase', background: 'rgba(0,0,0,0.2)'
                }}>
                  <span>Order Ref</span>
                  <span>Customer</span>
                  <span>Email Address</span>
                  <span>Delivered On</span>
                  <span>Email Status</span>
                  <span style={{ textAlign: 'right' }}>Action</span>
                </div>

                {campaignOrders.map((o, idx) => {
                  const isSent = o.review_email_sent === 1
                  const isNoEmail = o.review_email_sent === -1 || !o.email

                  return (
                    <div
                      key={o.id}
                      style={{
                        display: 'grid', gridTemplateColumns: '130px 180px 1fr 150px 130px 140px',
                        padding: '14px 20px',
                        borderBottom: idx < campaignOrders.length - 1 ? '1px solid var(--border)' : 'none',
                        alignItems: 'center', gap: 12
                      }}
                    >
                      <span style={{ fontWeight: 800, fontSize: 13, fontFamily: 'monospace', color: 'var(--accent)' }}>
                        {o.ref_number || `#${o.id}`}
                      </span>

                      <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
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
                              background: '#141414', border: '1px solid #333', borderRadius: 6,
                              padding: '6px 10px', fontSize: 12, color: '#fff', width: '90%', outline: 'none'
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
                          <span style={{ background: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 99, padding: '4px 10px', fontSize: 11, fontWeight: 800 }}>
                            🟢 Sent
                          </span>
                        ) : isNoEmail ? (
                          <span style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 99, padding: '4px 10px', fontSize: 11, fontWeight: 800 }}>
                            ⚪ No Email
                          </span>
                        ) : (
                          <span style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 99, padding: '4px 10px', fontSize: 11, fontWeight: 800 }}>
                            ⏳ Pending
                          </span>
                        )}
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <button
                          onClick={() => sendSingleEmail(o.id, o.email)}
                          disabled={sendingSingle[o.id]}
                          style={{
                            padding: '6px 14px', borderRadius: 8, border: 'none',
                            background: isSent ? 'rgba(255,255,255,0.1)' : 'var(--accent)',
                            color: isSent ? 'var(--text-muted)' : '#000',
                            fontSize: 12, fontWeight: 800, cursor: 'pointer',
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
      {/* TAB 3: EMAIL TEMPLATE MANAGER STUDIO */}
      {/* ──────────────────────────────────────────────────────────────── */}
      {activeTab === 'templates' && (
        <div>
          {templateLoading ? (
            <div style={{ padding: 64, textAlign: 'center', color: 'var(--text-muted)' }}>
              <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
              Loading Email Template...
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
              
              {/* Left Column: Template Code Editor */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#fff' }}>📝 Review Request Template Code</h3>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={resetTemplate}
                      disabled={templateSaving}
                      style={{
                        padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)',
                        background: 'transparent', color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer'
                      }}
                    >
                      Reset Default
                    </button>
                    <button
                      onClick={saveTemplate}
                      disabled={templateSaving}
                      style={{
                        padding: '7px 20px', borderRadius: 8, border: 'none',
                        background: 'linear-gradient(135deg, #a855f7 0%, #9333ea 100%)',
                        color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer',
                        opacity: templateSaving ? 0.6 : 1, boxShadow: '0 4px 15px rgba(168,85,247,0.3)'
                      }}
                    >
                      {templateSaving ? 'Saving...' : '💾 Save Template'}
                    </button>
                  </div>
                </div>

                {/* Available Variables Pills */}
                <div style={{ marginBottom: 18, background: '#111116', padding: 14, borderRadius: 12, border: '1px dashed #333' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5 }}>
                    Available Placeholders (Click to insert):
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {['{{customer_name}}', '{{first_name}}', '{{product_title}}', '{{review_url}}'].map(tag => (
                      <button
                        key={tag}
                        onClick={() => {
                          setTemplateHtml(prev => prev + tag)
                          addToast(`Inserted tag: ${tag}`, 'info')
                        }}
                        style={{
                          background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.3)',
                          color: '#c084fc', borderRadius: 6, padding: '5px 10px', fontSize: 11,
                          fontFamily: 'monospace', fontWeight: 700, cursor: 'pointer'
                        }}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Subject Field */}
                <div style={{ marginBottom: 18 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Email Subject Line:
                  </label>
                  <input
                    type="text"
                    value={templateSubject}
                    onChange={e => setTemplateSubject(e.target.value)}
                    placeholder="e.g. How was your TRACE order, {{first_name}}? ⭐"
                    style={{
                      width: '100%', background: '#101014', border: '1px solid var(--border)',
                      borderRadius: 10, padding: '12px 14px', color: '#fff', fontSize: 13,
                      fontWeight: 700, outline: 'none'
                    }}
                  />
                </div>

                {/* HTML Body Editor */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    HTML Body Editor:
                  </label>
                  <textarea
                    value={templateHtml}
                    onChange={e => setTemplateHtml(e.target.value)}
                    rows={18}
                    style={{
                      width: '100%', background: '#0a0a0d', border: '1px solid var(--border)',
                      borderRadius: 10, padding: '14px', color: '#38bdf8', fontSize: 12,
                      fontFamily: 'monospace', lineHeight: 1.6, outline: 'none', resize: 'vertical'
                    }}
                  />
                </div>
              </div>

              {/* Right Column: Interactive Device Email Preview */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#fff' }}>👁️ Live Email Device Preview</h3>
                  
                  {/* Device View Mode Toggle */}
                  <div style={{ display: 'flex', background: '#141414', padding: 3, borderRadius: 8, border: '1px solid #333' }}>
                    <button
                      onClick={() => setPreviewDevice('desktop')}
                      style={{
                        padding: '4px 10px', borderRadius: 6, border: 'none',
                        background: previewDevice === 'desktop' ? '#333' : 'transparent',
                        color: previewDevice === 'desktop' ? '#fff' : '#888',
                        fontSize: 11, fontWeight: 700, cursor: 'pointer'
                      }}
                    >
                      💻 Desktop
                    </button>
                    <button
                      onClick={() => setPreviewDevice('mobile')}
                      style={{
                        padding: '4px 10px', borderRadius: 6, border: 'none',
                        background: previewDevice === 'mobile' ? '#333' : 'transparent',
                        color: previewDevice === 'mobile' ? '#fff' : '#888',
                        fontSize: 11, fontWeight: 700, cursor: 'pointer'
                      }}
                    >
                      📱 Mobile
                    </button>
                  </div>
                </div>

                {/* Device Frame Shell */}
                <div style={{
                  maxWidth: previewDevice === 'mobile' ? 380 : '100%',
                  margin: '0 auto',
                  border: '1px solid #333', borderRadius: 14, overflow: 'hidden', background: '#0a0a0a',
                  boxShadow: '0 20px 40px rgba(0,0,0,0.5)', transition: 'max-width 0.3s ease'
                }}>
                  {/* Apple Mail Bar */}
                  <div style={{ background: '#1e1e24', padding: '12px 16px', borderBottom: '1px solid #2a2a30', fontSize: 12, color: '#aaa' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 99, background: '#ff5f56' }} />
                      <div style={{ width: 10, height: 10, borderRadius: 99, background: '#ffbd2e' }} />
                      <div style={{ width: 10, height: 10, borderRadius: 99, background: '#27c93f' }} />
                    </div>
                    <div><strong>From:</strong> TRACE Pakistan &lt;info@tracepk.com&gt;</div>
                    <div style={{ marginTop: 4 }}><strong>Subject:</strong> {templateSubject.replace(/\{\{first_name\}\}/g, 'Salar').replace(/\{\{customer_name\}\}/g, 'Salar Khan')}</div>
                  </div>

                  {/* Rendered HTML Viewport */}
                  <iframe
                    title="Live Email Preview"
                    srcDoc={previewHtml}
                    style={{ width: '100%', height: 480, border: 'none', background: '#0a0a0a' }}
                  />
                </div>
              </div>

            </div>
          )}
        </div>
      )}

      {/* Lightbox Modal for Photo Thumbnails */}
      {selectedImage && (
        <div
          onClick={() => setSelectedImage(null)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: 20
          }}
        >
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
            <img
              src={selectedImage}
              alt="Full size customer upload"
              style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 12, boxShadow: '0 20px 50px rgba(0,0,0,0.8)' }}
            />
            <button
              onClick={() => setSelectedImage(null)}
              style={{
                position: 'absolute', top: -16, right: -16, background: '#fff', color: '#000',
                border: 'none', borderRadius: 99, width: 36, height: 36, fontWeight: 900,
                cursor: 'pointer', fontSize: 16
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
