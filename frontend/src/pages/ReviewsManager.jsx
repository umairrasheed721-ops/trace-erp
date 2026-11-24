import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { copyWithTooltip } from '../utils/orderUtils'

const API = import.meta.env.VITE_API_URL || ''

const REVIEW_STATUS_STYLES = {
  approved: { bg: 'rgba(16,185,129,0.10)', color: '#059669', dot: '#10b981', border: 'rgba(16,185,129,0.24)', label: 'Approved' },
  pending:  { bg: 'rgba(245,158,11,0.10)', color: '#b45309', dot: '#f59e0b', border: 'rgba(245,158,11,0.26)', label: 'Pending' },
  rejected: { bg: 'rgba(239,68,68,0.10)',  color: '#dc2626', dot: '#ef4444', border: 'rgba(239,68,68,0.24)',  label: 'Rejected' },
}

// ── Crisp inline SVG icons (light/dark adaptive, zero emoji clutter) ──
const Icon = {
  Star: ({ size = 15 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
  Mail: ({ size = 15 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  ),
  Code: ({ size = 15 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
    </svg>
  ),
  Send: ({ size = 13 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />
    </svg>
  ),
  Search: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
    </svg>
  ),
  Refresh: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" />
    </svg>
  ),
  Clock: ({ size = 13 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  Monitor: ({ size = 13 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="14" x="2" y="3" rx="2" /><line x1="8" x2="16" y1="21" y2="21" /><line x1="12" x2="12" y1="17" y2="21" />
    </svg>
  ),
  Phone: ({ size = 13 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="14" height="20" x="5" y="2" rx="2" ry="2" /><path d="M12 18h.01" />
    </svg>
  ),
  Check: ({ size = 13 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Flask: ({ size = 13 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2" />
      <path d="M8.5 2h7" /><path d="M7 16h10" />
    </svg>
  ),
  Plug: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22v-5" /><path d="M9 8V2" /><path d="M15 8V2" />
      <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
    </svg>
  ),
  Shield: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  ),
}

function StarDisplay({ rating, size = 14 }) {
  return (
    <span style={{ letterSpacing: 1.5, fontSize: size, display: 'inline-flex', alignItems: 'center' }} aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} style={{ color: i <= rating ? '#f59e0b' : 'var(--border)' }}>★</span>
      ))}
    </span>
  )
}

function StatusPill({ dot, color, bg, border, label }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: bg, color, border: `1px solid ${border}`,
      borderRadius: 99, padding: '3px 10px', fontSize: 11.5, fontWeight: 700,
      whiteSpace: 'nowrap', letterSpacing: '0.01em'
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot, flexShrink: 0 }} />
      {label}
    </span>
  )
}

function getPrimaryProductTitle(order) {
  if (order.product_titles && order.product_titles.trim()) {
    return order.product_titles.trim()
  }
  if (order.line_items) {
    try {
      const items = JSON.parse(order.line_items)
      if (Array.isArray(items) && items.length > 0) {
        const first = items[0]?.title || items[0]?.name || ''
        return items.length > 1 ? `${first} (+${items.length - 1} more)` : first
      }
    } catch (_) {}
  }
  return ''
}

function getDeliveryEligibility(statusDate) {
  if (!statusDate) return { text: 'N/A', ready: false, sub: '' }
  const dt = new Date(statusDate)
  if (isNaN(dt.getTime())) return { text: 'N/A', ready: false, sub: '' }
  const hoursAgo = (Date.now() - dt.getTime()) / (1000 * 60 * 60)
  const text = dt.toLocaleDateString('en-PK', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  })
  if (hoursAgo >= 24) {
    const daysAgo = Math.floor(hoursAgo / 24)
    return { text, ready: true, sub: daysAgo === 1 ? 'Auto-ready (1d ago)' : `Auto-ready (${daysAgo}d ago)` }
  }
  const hrsLeft = Math.max(1, Math.ceil(24 - hoursAgo))
  return { text, ready: false, sub: `Auto-send in ~${hrsLeft}h` }
}

export default function ReviewsManager() {
  const { token, addToast, activeStoreId } = useApp()

  // Navigation tab state
  const [activeTab, setActiveTab] = useState('campaigns') // 'moderation' | 'campaigns' | 'templates'

  // Lightbox state for review images
  const [selectedImage, setSelectedImage] = useState(null)

  // Moderation tab state
  const [reviews, setReviews] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('pending')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [actionLoading, setActionLoading] = useState({})
  const LIMIT = 25

  // Campaign tab state
  const [daysWindow, setDaysWindow] = useState(7)
  const [campaignStatusFilter, setCampaignStatusFilter] = useState('all') // 'all' | 'pending' | 'sent' | 'no_email'
  const [campaignSearch, setCampaignSearch] = useState('')
  const [debouncedCampaignSearch, setDebouncedCampaignSearch] = useState('')
  const [campaignStats, setCampaignStats] = useState({ totalDelivered: 0, sent: 0, pending: 0, autoReady: 0, noEmail: 0, emailProvider: null })
  const [campaignOrders, setCampaignOrders] = useState([])
  const [campaignTotal, setCampaignTotal] = useState(0)
  const [campaignPage, setCampaignPage] = useState(1)
  const [campaignLoading, setCampaignLoading] = useState(false)
  const [scanLoading, setScanLoading] = useState(false)
  const [sendingSingle, setSendingSingle] = useState({})
  const [inputEmails, setInputEmails] = useState({})
  const CAMPAIGN_LIMIT = 50

  // Send Test Email modal state
  const [showTestModal, setShowTestModal] = useState(false)
  const [testEmail, setTestEmail] = useState('trace721.t@gmail.com')
  const [sendingTest, setSendingTest] = useState(false)

  // Template Manager state
  const [templateSubject, setTemplateSubject] = useState('')
  const [templateHtml, setTemplateHtml] = useState('')
  const [templateLoading, setTemplateLoading] = useState(false)
  const [templateSaving, setTemplateSaving] = useState(false)
  const [previewDevice, setPreviewDevice] = useState('desktop')

  // Plug & Play Per-Store Email Setup state
  const [setupLoading, setSetupLoading] = useState(false)
  const [setupSaving, setSetupSaving] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [setupForm, setSetupForm] = useState({
    storeId: activeStoreId || 1,
    storeName: '',
    shopDomain: '',
    enabled: false,
    provider: 'brevo',
    apiKeyInput: '',
    hasApiKey: false,
    maskedApiKey: '',
    fromName: '',
    fromEmail: '',
    replyTo: '',
    websiteUrl: '',
  })

  // Debounce campaign search
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedCampaignSearch(campaignSearch.trim())
      setCampaignPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [campaignSearch])

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
  }, [token, filter, page, search, activeStoreId, addToast])

  const fetchCampaignData = useCallback(async () => {
    setCampaignLoading(true)
    try {
      const statsParams = new URLSearchParams({ days: daysWindow })
      if (activeStoreId) statsParams.set('store_id', activeStoreId)

      const ordersParams = new URLSearchParams({
        days: daysWindow,
        page: campaignPage,
        limit: CAMPAIGN_LIMIT,
        status: campaignStatusFilter
      })
      if (activeStoreId) ordersParams.set('store_id', activeStoreId)
      if (debouncedCampaignSearch) ordersParams.set('search', debouncedCampaignSearch)

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
  }, [token, daysWindow, campaignPage, campaignStatusFilter, debouncedCampaignSearch, activeStoreId, addToast])

  const fetchTemplateData = useCallback(async () => {
    setTemplateLoading(true)
    try {
      const params = new URLSearchParams()
      if (activeStoreId) params.set('store_id', activeStoreId)
      const res = await fetch(`${API}/api/reviews/templates/review_request?${params}`, {
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
  }, [token, activeStoreId, addToast])

  const fetchEmailSettings = useCallback(async () => {
    setSetupLoading(true)
    try {
      const params = new URLSearchParams()
      if (activeStoreId) params.set('store_id', activeStoreId)
      const res = await fetch(`${API}/api/reviews/settings?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const json = await res.json()
      if (json.success && json.data) {
        const d = json.data
        setSetupForm({
          storeId: d.storeId,
          storeName: d.storeName || '',
          shopDomain: d.shopDomain || '',
          enabled: Boolean(d.enabled),
          provider: d.provider || 'brevo',
          apiKeyInput: '',
          hasApiKey: Boolean(d.hasApiKey),
          maskedApiKey: d.maskedApiKey || '',
          fromName: d.fromName || d.storeName || '',
          fromEmail: d.fromEmail || '',
          replyTo: d.replyTo || '',
          websiteUrl: d.websiteUrl || '',
        })
      }
    } catch (err) {
      addToast('Failed to load store email settings', 'error')
    } finally {
      setSetupLoading(false)
    }
  }, [token, activeStoreId, addToast])

  useEffect(() => {
    if (activeTab === 'moderation') fetchReviews()
    else if (activeTab === 'campaigns') fetchCampaignData()
    else if (activeTab === 'templates') {
      fetchTemplateData()
      fetchCampaignData()
    } else if (activeTab === 'setup') {
      fetchEmailSettings()
      fetchCampaignData()
    }
  }, [activeTab, activeStoreId, fetchReviews, fetchCampaignData, fetchTemplateData, fetchEmailSettings])

  async function saveEmailSettings(andOpenTest = false) {
    if (!setupForm.hasApiKey && !setupForm.apiKeyInput.trim()) {
      addToast(`Paste this store's ${setupForm.provider === 'resend' ? 'Resend' : 'Brevo'} API key first`, 'error')
      return
    }
    if (!setupForm.fromEmail.trim() || !setupForm.fromEmail.includes('@')) {
      addToast('Enter a valid verified Sender Email (e.g. orders@yourdomain.com)', 'error')
      return
    }
    setSetupSaving(true)
    try {
      const res = await fetch(`${API}/api/reviews/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          store_id: activeStoreId || setupForm.storeId || 1,
          enabled: setupForm.enabled,
          provider: setupForm.provider,
          api_key: setupForm.apiKeyInput.trim() || undefined,
          from_name: setupForm.fromName.trim(),
          from_email: setupForm.fromEmail.trim(),
          reply_to: setupForm.replyTo.trim(),
          website_url: setupForm.websiteUrl.trim(),
        })
      })
      const json = await res.json()
      if (json.success) {
        addToast(json.message || 'Store email settings saved!', 'success')
        await Promise.all([fetchEmailSettings(), fetchCampaignData()])
        if (andOpenTest) setShowTestModal(true)
      } else {
        addToast(json.error || 'Failed to save email settings', 'error')
      }
    } catch (err) {
      addToast('Failed to save email settings', 'error')
    } finally {
      setSetupSaving(false)
    }
  }

  async function saveTemplate() {
    setTemplateSaving(true)
    try {
      const res = await fetch(`${API}/api/reviews/templates/review_request`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ store_id: activeStoreId || 1, subject: templateSubject, bodyHtml: templateHtml })
      })
      const json = await res.json()
      if (json.success) addToast('Email template saved for this store', 'success')
      else addToast(json.error || 'Failed to save template', 'error')
    } catch (err) {
      addToast('Failed to save template', 'error')
    } finally {
      setTemplateSaving(false)
    }
  }

  async function resetTemplate() {
    if (!window.confirm('Reset this store template to original default design?')) return
    setTemplateSaving(true)
    try {
      const res = await fetch(`${API}/api/reviews/templates/review_request/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ store_id: activeStoreId || 1 })
      })
      const json = await res.json()
      if (json.success) {
        setTemplateSubject(json.data.subject)
        setTemplateHtml(json.data.bodyHtml)
        addToast('Template reset to default', 'success')
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
      const url = action === 'delete' ? `${API}/api/reviews/${id}` : `${API}/api/reviews/${id}/${action}`
      const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}` } })
      const json = await res.json()
      if (json.success) {
        addToast(action === 'approve' ? 'Review approved' : action === 'reject' ? 'Review rejected' : 'Review deleted', 'success')
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
        body: JSON.stringify({ days: daysWindow, store_id: activeStoreId || 1 })
      })
      const json = await res.json()
      if (json.success && json.data?.success !== false) {
        if (json.data.sent === 0 && json.data.lastError) {
          addToast(`Email send failed: ${json.data.lastError}`, 'error')
        } else if (json.data.processed === 0) {
          addToast('No eligible orders (>24h delivered) waiting to send right now.', 'info')
        } else {
          addToast(`Scan complete — Sent: ${json.data.sent} / ${json.data.processed}${json.data.failed ? ` (${json.data.failed} failed)` : ''}`, 'success')
        }
        fetchCampaignData()
      } else {
        addToast(json.error || json.data?.error || 'Scan failed', 'error')
      }
    } catch (err) {
      addToast('Failed to trigger email scan', 'error')
    } finally {
      setScanLoading(false)
    }
  }

  async function sendSingleEmail(orderId, defaultEmail) {
    const customEmail = (inputEmails[orderId] || defaultEmail || '').trim()
    if (!customEmail || !customEmail.includes('@')) {
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
        addToast(json.message || `Email sent to ${customEmail}`, 'success')
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

  async function handleSendTestEmail(e) {
    e.preventDefault()
    const target = testEmail.trim()
    if (!target || !target.includes('@')) {
      addToast('Enter a valid email address', 'error')
      return
    }
    setSendingTest(true)
    try {
      const res = await fetch(`${API}/api/reviews/campaigns/send-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: target, store_id: activeStoreId || 1 })
      })
      const json = await res.json()
      if (json.success) {
        addToast(json.message || `Test email sent to ${target}`, 'success')
        setShowTestModal(false)
      } else {
        addToast(json.error || 'Failed to send test email', 'error')
      }
    } catch (err) {
      addToast('Failed to send test email', 'error')
    } finally {
      setSendingTest(false)
    }
  }

  const totalPages = Math.ceil(total / LIMIT)
  const campaignTotalPages = Math.ceil(campaignTotal / CAMPAIGN_LIMIT)

  const sentRate = useMemo(() => {
    const eligible = (campaignStats.sent || 0) + (campaignStats.pending || 0)
    if (!eligible) return 0
    return Math.round(((campaignStats.sent || 0) / eligible) * 100)
  }, [campaignStats])

  const provider = campaignStats.emailProvider
  const activeSenderEmail = provider?.fromEmail || setupForm.fromEmail || 'orders@yourdomain.com'
  const activeBrandName = provider?.fromName || setupForm.fromName || provider?.storeName || 'TRACE Pakistan'
  const activeWebsiteUrl = provider?.websiteUrl || setupForm.websiteUrl || 'https://tracepk.com'
  const activeWebsiteDisplay = activeWebsiteUrl.replace(/^https?:\/\//i, '').replace(/\/+$/, '')

  const previewHtml = (templateHtml || '')
    .replace(/\{\{customer_name\}\}/g, 'Salar Khan')
    .replace(/\{\{first_name\}\}/g, 'Salar')
    .replace(/\{\{order_ref\}\}/g, '#TR35089')
    .replace(/\{\{store_name\}\}/g, activeBrandName)
    .replace(/\{\{store_url\}\}/g, activeWebsiteUrl)
    .replace(/\{\{store_url_display\}\}/g, activeWebsiteDisplay)
    .replace(/\{\{product_title\}\}/g, 'Heavyweight Oversized Hoodie')
    .replace(/\{\{review_url\}\}/g, '#preview-mode')

  return (
    <div style={{ padding: '20px 24px 36px', maxWidth: 1520, margin: '0 auto' }}>

      {/* ─── Clean Enterprise Header Bar ─── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 16, marginBottom: 20,
        paddingBottom: 16, borderBottom: '1px solid var(--border)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
              Reviews &amp; Email Campaigns
            </h1>

            {provider && (
              <button
                type="button"
                onClick={() => setActiveTab('setup')}
                title={provider.error || `Click to edit email settings for ${provider.storeName || 'this store'}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '3.5px 10px', borderRadius: 99, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                  background: !provider.configured
                    ? 'rgba(239,68,68,0.10)'
                    : provider.enabled
                      ? 'rgba(16,185,129,0.10)'
                      : 'rgba(245,158,11,0.10)',
                  color: !provider.configured
                    ? '#dc2626'
                    : provider.enabled
                      ? '#059669'
                      : '#b45309',
                  border: `1px solid ${!provider.configured ? 'rgba(239,68,68,0.25)' : provider.enabled ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.28)'}`
                }}
              >
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: !provider.configured ? '#ef4444' : provider.enabled ? '#10b981' : '#f59e0b'
                }} />
                {!provider.configured
                  ? `${provider.storeName ? `${provider.storeName}: ` : ''}Not Configured · Click to Setup`
                  : `${provider.label} · ${provider.fromEmail}${provider.enabled ? '' : ' (Auto OFF)'}`}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 12.5, color: 'var(--text-muted)' }}>
            <Icon.Clock size={12.5} />
            <span>Automated daily scan at 10:00 AM PKT (24h+ post-delivery) · Isolated per store</span>
          </div>
        </div>

        {/* Segmented Tab Navigation */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
          background: 'var(--bg-elevated)', padding: 4, borderRadius: 10,
          border: '1px solid var(--border)'
        }}>
          {[
            { id: 'moderation', label: 'Moderation', icon: <Icon.Star size={14} /> },
            { id: 'campaigns',  label: 'Email Campaigns', icon: <Icon.Mail size={14} />, badge: campaignStats.pending > 0 ? campaignStats.pending : null },
            { id: 'templates',  label: 'Template Studio', icon: <Icon.Code size={14} /> },
            { id: 'setup',      label: 'Email Setup', icon: <Icon.Plug size={14} />, alertDot: provider && !provider.configured },
          ].map(tab => {
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '7px 14px', borderRadius: 7, border: active ? '1px solid var(--border)' : '1px solid transparent',
                  background: active ? 'var(--bg-surface)' : 'transparent',
                  color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontSize: 12.5, fontWeight: active ? 700 : 600, cursor: 'pointer',
                  boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {tab.badge != null && (
                  <span style={{
                    fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: 99,
                    background: active ? 'rgba(245,158,11,0.14)' : 'rgba(148,163,184,0.16)',
                    color: active ? '#b45309' : 'var(--text-muted)',
                    fontVariantNumeric: 'tabular-nums'
                  }}>
                    {tab.badge}
                  </span>
                )}
                {tab.alertDot && (
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444' }} />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────── */}
      {/* TAB 1: REVIEWS MODERATION */}
      {/* ──────────────────────────────────────────────────────────────── */}
      {activeTab === 'moderation' && (
        <>
          <div style={{
            display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', marginBottom: 16, background: 'var(--bg-surface)',
            padding: '10px 14px', borderRadius: 12, border: '1px solid var(--border)'
          }}>
            <div style={{ display: 'flex', gap: 4, background: 'var(--bg-elevated)', padding: 3, borderRadius: 8, border: '1px solid var(--border)' }}>
              {[
                { id: 'pending',  label: 'Pending' },
                { id: 'approved', label: 'Approved' },
                { id: 'rejected', label: 'Rejected' },
                { id: 'all',      label: 'All Reviews' }
              ].map(f => {
                const active = filter === f.id
                return (
                  <button
                    key={f.id}
                    onClick={() => { setFilter(f.id); setPage(1) }}
                    style={{
                      padding: '5px 12px', borderRadius: 6, border: 'none',
                      background: active ? 'var(--bg-surface)' : 'transparent',
                      color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                      fontWeight: active ? 700 : 600, fontSize: 12, cursor: 'pointer',
                      boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
                    }}
                  >
                    {f.label}
                  </button>
                )
              })}
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <span style={{ position: 'absolute', left: 10, color: 'var(--text-muted)', display: 'flex' }}>
                  <Icon.Search size={13.5} />
                </span>
                <input
                  type="text"
                  placeholder="Search product or customer..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1) }}
                  style={{
                    background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8,
                    padding: '6px 12px 6px 32px', color: 'var(--text-primary)', fontSize: 12.5, outline: 'none', width: 240
                  }}
                />
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                <strong style={{ color: 'var(--text-primary)' }}>{total}</strong> reviews
              </span>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 64, textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
              <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
              <div style={{ fontSize: 13 }}>Loading reviews...</div>
            </div>
          ) : reviews.length === 0 ? (
            <div style={{
              background: 'var(--bg-surface)', border: '1px dashed var(--border)', borderRadius: 12,
              padding: 56, textAlign: 'center', color: 'var(--text-muted)'
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>No reviews found</div>
              <div style={{ fontSize: 12.5 }}>No product reviews match the selected status filter.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {reviews.map(r => {
                const st = REVIEW_STATUS_STYLES[r.status] || REVIEW_STATUS_STYLES.pending
                const reviewerName = r.reviewer_name || r.customer_name || 'Anonymous Customer'
                const reviewerEmail = r.reviewer_email || r.email || ''
                const reviewDateRaw = r.review_date || r.created_at
                let photoList = Array.isArray(r.photos) ? r.photos : []
                if (!photoList.length && r.picture_urls) {
                  try {
                    const parsed = typeof r.picture_urls === 'string' && r.picture_urls.trim().startsWith('[')
                      ? JSON.parse(r.picture_urls)
                      : String(r.picture_urls).split(',').map(u => u.trim()).filter(Boolean)
                    if (Array.isArray(parsed)) photoList = parsed
                  } catch (_) {}
                }
                const isVerifiedBuyer = Boolean(r.verified || r.source === 'customer')
                return (
                  <div
                    key={r.id}
                    style={{
                      background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12,
                      padding: '16px 20px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 10 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                          <StarDisplay rating={r.rating} size={15} />
                          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                            {reviewerName}
                          </span>
                          {isVerifiedBuyer && (
                            <span style={{
                              background: 'rgba(16,185,129,0.10)', color: '#059669',
                              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                              border: '1px solid rgba(16,185,129,0.25)', letterSpacing: '0.03em'
                            }}>
                              VERIFIED BUYER
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                          <span>Product: <strong style={{ color: 'var(--text-primary)', fontWeight: 600, fontFamily: 'monospace' }}>{r.product_handle}</strong></span>
                          {reviewerEmail && <span style={{ fontFamily: 'monospace' }}>{reviewerEmail}</span>}
                          {reviewDateRaw && <span>{new Date(reviewDateRaw).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                        </div>
                      </div>

                      <StatusPill {...st} />
                    </div>

                    {r.title && (
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                        {r.title}
                      </div>
                    )}

                    {r.body && (
                      <p style={{
                        margin: '0 0 12px', fontSize: 13.5, color: 'var(--text-primary)', lineHeight: 1.55,
                        background: 'var(--bg-elevated)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)'
                      }}>
                        {r.body}
                      </p>
                    )}

                    {photoList.length > 0 && (
                      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                        {photoList.map((pUrl, pIdx) => (
                          <img
                            key={pIdx}
                            src={pUrl}
                            alt="Customer feedback"
                            onClick={() => setSelectedImage(pUrl)}
                            style={{
                              width: 58, height: 58, borderRadius: 8, objectFit: 'cover',
                              border: '1px solid var(--border)', cursor: 'pointer'
                            }}
                          />
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                      {r.status !== 'approved' && (
                        <button
                          onClick={() => doAction(r.id, 'approve')}
                          disabled={actionLoading[r.id] === 'approve'}
                          style={{
                            padding: '5px 12px', borderRadius: 7, border: '1px solid rgba(16,185,129,0.30)',
                            background: 'rgba(16,185,129,0.10)', color: '#059669',
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
                            padding: '5px 12px', borderRadius: 7, border: '1px solid rgba(245,158,11,0.30)',
                            background: 'rgba(245,158,11,0.10)', color: '#b45309',
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
                          padding: '5px 12px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.28)',
                          background: 'transparent', color: '#dc2626',
                          fontSize: 12, fontWeight: 700, cursor: 'pointer'
                        }}
                      >
                        {actionLoading[r.id] === 'delete' ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                )
              })}

              {totalPages > 1 && (
                <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 12 }}>
                  {Array.from({ length: totalPages }).map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setPage(idx + 1)}
                      style={{
                        minWidth: 34, height: 34, borderRadius: 8, border: '1px solid var(--border)',
                        background: page === idx + 1 ? 'var(--text-primary)' : 'var(--bg-surface)',
                        color: page === idx + 1 ? 'var(--bg-surface)' : 'var(--text-primary)',
                        fontWeight: 700, fontSize: 12, cursor: 'pointer'
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
          {/* Per-Store Setup Banner when selected store has no email provider connected yet */}
          {provider && !provider.configured && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
              background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.32)',
              borderRadius: 12, padding: '12px 16px', marginBottom: 16
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: '#b45309', display: 'flex' }}><Icon.Shield size={18} /></span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                    Email not connected for {provider.storeName || 'this store'} yet
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
                    Each store uses its own isolated Brevo/Resend account (300 free emails/day per store) — no emails will send until configured.
                  </div>
                </div>
              </div>
              <button
                onClick={() => setActiveTab('setup')}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7.5px 14px', borderRadius: 8, border: 'none',
                  background: '#2563eb', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer'
                }}
              >
                <Icon.Plug size={13.5} />
                <span>Connect Email</span>
              </button>
            </div>
          )}

          {/* Executive KPI Strip (Clickable Filters) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 18 }}>
            {[
              {
                id: 'all',
                label: `Delivered Orders (${daysWindow}D)`,
                value: campaignStats.totalDelivered,
                sub: `${sentRate}% of mailable orders contacted`,
                accent: '#6366f1',
                valColor: 'var(--text-primary)',
              },
              {
                id: 'sent',
                label: 'Review Emails Sent',
                value: campaignStats.sent,
                sub: campaignStats.sent > 0 ? 'Delivered via Brevo API' : 'No emails sent in this window yet',
                accent: '#10b981',
                valColor: '#059669',
              },
              {
                id: 'pending',
                label: 'Pending Queue',
                value: campaignStats.pending,
                sub: `${campaignStats.autoReady || 0} ready now (24h+ delivered)`,
                accent: '#f59e0b',
                valColor: '#b45309',
              },
              {
                id: 'no_email',
                label: 'Missing Email',
                value: campaignStats.noEmail,
                sub: 'Enter email inline to send manually',
                accent: '#94a3b8',
                valColor: 'var(--text-muted)',
              },
            ].map(card => {
              const selected = campaignStatusFilter === card.id
              return (
                <button
                  key={card.id}
                  onClick={() => { setCampaignStatusFilter(card.id); setCampaignPage(1) }}
                  style={{
                    textAlign: 'left',
                    background: 'var(--bg-surface)',
                    border: `1px solid ${selected ? card.accent : 'var(--border)'}`,
                    boxShadow: selected ? `0 0 0 2px ${card.accent}22` : '0 1px 2px rgba(0,0,0,0.03)',
                    borderRadius: 12,
                    padding: '16px 18px',
                    cursor: 'pointer',
                    position: 'relative',
                    overflow: 'hidden',
                    transition: 'border-color 0.15s ease, box-shadow 0.15s ease'
                  }}
                >
                  <div style={{
                    position: 'absolute', top: 0, left: 0, bottom: 0, width: 3.5,
                    background: card.accent, opacity: selected ? 1 : 0.45
                  }} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {card.label}
                    </span>
                    {selected && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: card.accent, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Filtered
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: card.valColor, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>
                    {card.value}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6 }}>
                    {card.sub}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Unified Action & Filter Toolbar */}
          <div style={{
            display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', marginBottom: 14, background: 'var(--bg-surface)',
            padding: '10px 14px', borderRadius: 12, border: '1px solid var(--border)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {/* Search Box */}
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <span style={{ position: 'absolute', left: 10, color: 'var(--text-muted)', display: 'flex' }}>
                  <Icon.Search size={13.5} />
                </span>
                <input
                  type="text"
                  placeholder="Search order #, customer, email, product..."
                  value={campaignSearch}
                  onChange={e => setCampaignSearch(e.target.value)}
                  style={{
                    background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8,
                    padding: '6.5px 12px 6.5px 32px', color: 'var(--text-primary)', fontSize: 12.5,
                    outline: 'none', width: 270
                  }}
                />
              </div>

              {/* Status Filter Segmented Pills */}
              <div style={{ display: 'inline-flex', background: 'var(--bg-elevated)', padding: 3, borderRadius: 8, border: '1px solid var(--border)' }}>
                {[
                  { id: 'all',      label: 'All' },
                  { id: 'pending',  label: 'Pending' },
                  { id: 'sent',     label: 'Sent' },
                  { id: 'no_email', label: 'No Email' },
                ].map(st => {
                  const active = campaignStatusFilter === st.id
                  return (
                    <button
                      key={st.id}
                      onClick={() => { setCampaignStatusFilter(st.id); setCampaignPage(1) }}
                      style={{
                        padding: '4.5px 10px', borderRadius: 6, border: 'none',
                        background: active ? 'var(--bg-surface)' : 'transparent',
                        color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                        fontSize: 12, fontWeight: active ? 700 : 600, cursor: 'pointer',
                        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
                      }}
                    >
                      {st.label}
                    </button>
                  )
                })}
              </div>

              {/* Window Selector */}
              <select
                value={daysWindow}
                onChange={e => { setDaysWindow(parseInt(e.target.value)); setCampaignPage(1) }}
                style={{
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '6.5px 10px', color: 'var(--text-primary)',
                  fontSize: 12.5, fontWeight: 600, outline: 'none', cursor: 'pointer'
                }}
              >
                <option value={7}>Last 7 Days</option>
                <option value={14}>Last 14 Days</option>
                <option value={30}>Last 30 Days</option>
              </select>
            </div>

            {/* Right CTAs */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={fetchCampaignData}
                disabled={campaignLoading}
                title="Refresh list"
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border)',
                  background: 'var(--bg-elevated)', color: 'var(--text-muted)', cursor: 'pointer'
                }}
              >
                <Icon.Refresh size={14} />
              </button>

              <button
                onClick={() => setShowTestModal(true)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 13px', borderRadius: 8, border: '1px solid var(--border)',
                  background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                  fontSize: 12.5, fontWeight: 700, cursor: 'pointer'
                }}
              >
                <Icon.Flask size={13.5} />
                <span>Send Test</span>
              </button>

              <button
                onClick={triggerBatchScan}
                disabled={scanLoading}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '7.5px 16px', borderRadius: 8, border: 'none',
                  background: '#2563eb', color: '#fff',
                  fontSize: 12.5, fontWeight: 700, cursor: scanLoading ? 'wait' : 'pointer',
                  opacity: scanLoading ? 0.65 : 1,
                  boxShadow: '0 1px 2px rgba(37,99,235,0.25)'
                }}
              >
                <Icon.Send size={13} />
                <span>
                  {scanLoading
                    ? 'Sending Campaign...'
                    : `Run Scan (${campaignStats.autoReady || 0} Ready)`}
                </span>
              </button>
            </div>
          </div>

          {/* Delivered Orders Data Table */}
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
          }}>
            {campaignLoading ? (
              <div style={{ padding: 56, textAlign: 'center', color: 'var(--text-muted)' }}>
                <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
                <div style={{ fontSize: 13 }}>Loading campaign queue...</div>
              </div>
            ) : campaignOrders.length === 0 ? (
              <div style={{ padding: 56, textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>No matching orders</div>
                <div style={{ fontSize: 12.5 }}>Try switching the status filter or extending the date window.</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{
                      background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)',
                      fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
                      color: 'var(--text-muted)', textTransform: 'uppercase'
                    }}>
                      <th style={{ padding: '11px 16px', width: 120 }}>Order</th>
                      <th style={{ padding: '11px 16px', minWidth: 220 }}>Customer &amp; Product</th>
                      <th style={{ padding: '11px 16px', minWidth: 240 }}>Recipient Email</th>
                      <th style={{ padding: '11px 16px', width: 185 }}>Delivered</th>
                      <th style={{ padding: '11px 16px', width: 120 }}>Status</th>
                      <th style={{ padding: '11px 16px', width: 120, textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaignOrders.map((o) => {
                      const isSent = o.review_email_sent === 1
                      const hasEmail = Boolean((o.email || '').trim())
                      const isNoEmail = !isSent && (o.review_email_sent === -1 || !hasEmail)
                      const productTitle = getPrimaryProductTitle(o)
                      const delivery = getDeliveryEligibility(o.status_date)
                      const effectiveEmail = (inputEmails[o.id] || o.email || '').trim()
                      const isSending = Boolean(sendingSingle[o.id])

                      return (
                        <tr
                          key={o.id}
                          style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.12s ease' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                        >
                          {/* Order Ref */}
                          <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                            <span
                              onClick={e => copyWithTooltip(o.ref_number || `#${o.id}`, e, 'Order Ref Copied')}
                              title="Click to copy order ref"
                              style={{
                                fontWeight: 700, fontSize: 13, fontFamily: 'monospace',
                                color: 'var(--text-primary)', cursor: 'pointer',
                                padding: '2px 6px', borderRadius: 5,
                                background: 'var(--bg-elevated)', border: '1px solid var(--border)'
                              }}
                            >
                              {o.ref_number || `#${o.id}`}
                            </span>
                          </td>

                          {/* Customer & Product */}
                          <td style={{ padding: '12px 16px', verticalAlign: 'middle', maxWidth: 300 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                              {o.customer_name || 'Customer'}
                            </div>
                            {productTitle && (
                              <div
                                title={productTitle}
                                style={{
                                  fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2,
                                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 280
                                }}
                              >
                                {productTitle}
                              </div>
                            )}
                          </td>

                          {/* Recipient Email */}
                          <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                            {hasEmail ? (
                              <span
                                onClick={e => copyWithTooltip(o.email, e, 'Email Copied')}
                                title="Click to copy email"
                                style={{ fontSize: 12.5, color: 'var(--text-primary)', fontFamily: 'monospace', cursor: 'pointer' }}
                              >
                                {o.email}
                              </span>
                            ) : (
                              <input
                                type="email"
                                placeholder="Add customer email..."
                                value={inputEmails[o.id] || ''}
                                onChange={e => setInputEmails(prev => ({ ...prev, [o.id]: e.target.value }))}
                                style={{
                                  background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 7,
                                  padding: '5.5px 10px', fontSize: 12, color: 'var(--text-primary)',
                                  width: '100%', maxWidth: 240, outline: 'none'
                                }}
                              />
                            )}
                          </td>

                          {/* Delivered Date + Auto-Scan Eligibility */}
                          <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                              {delivery.text}
                            </div>
                            {!isSent && !isNoEmail && delivery.sub && (
                              <div style={{
                                fontSize: 11, marginTop: 2, fontWeight: 600,
                                color: delivery.ready ? '#059669' : 'var(--text-muted)'
                              }}>
                                {delivery.sub}
                              </div>
                            )}
                          </td>

                          {/* Email Status */}
                          <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                            {isSent ? (
                              <StatusPill dot="#10b981" color="#059669" bg="rgba(16,185,129,0.10)" border="rgba(16,185,129,0.25)" label="Sent" />
                            ) : isNoEmail ? (
                              <StatusPill dot="#94a3b8" color="var(--text-muted)" bg="var(--bg-elevated)" border="var(--border)" label="No Email" />
                            ) : (
                              <StatusPill dot="#f59e0b" color="#b45309" bg="rgba(245,158,11,0.10)" border="rgba(245,158,11,0.26)" label="Pending" />
                            )}
                          </td>

                          {/* Action */}
                          <td style={{ padding: '12px 16px', verticalAlign: 'middle', textAlign: 'right' }}>
                            <button
                              onClick={() => sendSingleEmail(o.id, o.email)}
                              disabled={isSending || !effectiveEmail}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                padding: '5.5px 12px', borderRadius: 7,
                                border: isSent ? '1px solid var(--border)' : '1px solid transparent',
                                background: isSent
                                  ? 'transparent'
                                  : effectiveEmail
                                    ? 'var(--brand, #4f46e5)'
                                    : 'var(--bg-elevated)',
                                color: isSent
                                  ? 'var(--text-muted)'
                                  : effectiveEmail
                                    ? '#fff'
                                    : 'var(--text-muted)',
                                fontSize: 12, fontWeight: 700,
                                cursor: (isSending || !effectiveEmail) ? 'not-allowed' : 'pointer',
                                opacity: isSending ? 0.6 : (!effectiveEmail ? 0.5 : 1),
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {isSending ? 'Sending...' : isSent ? 'Resend' : (
                                <>
                                  <Icon.Send size={11.5} />
                                  <span>Send</span>
                                </>
                              )}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Footer */}
            {campaignTotal > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 16px', borderTop: '1px solid var(--border)',
                background: 'var(--bg-elevated)', fontSize: 12, color: 'var(--text-muted)'
              }}>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  Showing <strong style={{ color: 'var(--text-primary)' }}>{((campaignPage - 1) * CAMPAIGN_LIMIT) + 1}–{Math.min(campaignPage * CAMPAIGN_LIMIT, campaignTotal)}</strong> of <strong style={{ color: 'var(--text-primary)' }}>{campaignTotal}</strong> orders
                </span>
                {campaignTotalPages > 1 && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button
                      disabled={campaignPage <= 1}
                      onClick={() => setCampaignPage(p => Math.max(1, p - 1))}
                      style={{
                        padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)',
                        background: 'var(--bg-surface)', color: 'var(--text-primary)',
                        fontSize: 12, fontWeight: 600, cursor: campaignPage <= 1 ? 'not-allowed' : 'pointer',
                        opacity: campaignPage <= 1 ? 0.45 : 1
                      }}
                    >
                      Previous
                    </button>
                    <span style={{ fontSize: 12, fontWeight: 600, padding: '0 6px', fontVariantNumeric: 'tabular-nums' }}>
                      Page {campaignPage} / {campaignTotalPages}
                    </span>
                    <button
                      disabled={campaignPage >= campaignTotalPages}
                      onClick={() => setCampaignPage(p => Math.min(campaignTotalPages, p + 1))}
                      style={{
                        padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)',
                        background: 'var(--bg-surface)', color: 'var(--text-primary)',
                        fontSize: 12, fontWeight: 600, cursor: campaignPage >= campaignTotalPages ? 'not-allowed' : 'pointer',
                        opacity: campaignPage >= campaignTotalPages ? 0.45 : 1
                      }}
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ──────────────────────────────────────────────────────────────── */}
      {/* TAB 3: EMAIL TEMPLATE STUDIO */}
      {/* ──────────────────────────────────────────────────────────────── */}
      {activeTab === 'templates' && (
        <div>
          {templateLoading ? (
            <div style={{ padding: 56, textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
              <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
              <div style={{ fontSize: 13 }}>Loading email template...</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>

              {/* Left Column: Editor */}
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>Review Request Template</h3>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Changes apply to all automated &amp; manual emails</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => setShowTestModal(true)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '6.5px 12px', borderRadius: 7, border: '1px solid var(--border)',
                        background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 700, cursor: 'pointer'
                      }}
                    >
                      <Icon.Flask size={13} />
                      <span>Test</span>
                    </button>
                    <button
                      onClick={resetTemplate}
                      disabled={templateSaving}
                      style={{
                        padding: '6.5px 12px', borderRadius: 7, border: '1px solid var(--border)',
                        background: 'transparent', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer'
                      }}
                    >
                      Reset
                    </button>
                    <button
                      onClick={saveTemplate}
                      disabled={templateSaving}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '6.5px 14px', borderRadius: 7, border: 'none',
                        background: '#2563eb', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        opacity: templateSaving ? 0.6 : 1
                      }}
                    >
                      <Icon.Check size={13} />
                      <span>{templateSaving ? 'Saving...' : 'Save Changes'}</span>
                    </button>
                  </div>
                </div>

                {/* Placeholders */}
                <div style={{ marginBottom: 14, background: 'var(--bg-elevated)', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.04em' }}>
                    Dynamic Variables (Click to append)
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {['{{first_name}}', '{{customer_name}}', '{{order_ref}}', '{{product_title}}', '{{store_name}}', '{{store_url_display}}', '{{review_url}}'].map(tag => (
                      <button
                        key={tag}
                        onClick={() => {
                          setTemplateHtml(prev => prev + tag)
                          addToast(`Inserted ${tag}`, 'info')
                        }}
                        style={{
                          background: 'var(--bg-surface)', border: '1px solid var(--border)',
                          color: 'var(--text-primary)', borderRadius: 6, padding: '4px 9px', fontSize: 11.5,
                          fontFamily: 'monospace', fontWeight: 600, cursor: 'pointer'
                        }}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Subject */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Subject Line
                  </label>
                  <input
                    type="text"
                    value={templateSubject}
                    onChange={e => setTemplateSubject(e.target.value)}
                    placeholder="How was your TRACE order, {{first_name}}?"
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                      borderRadius: 8, padding: '9px 12px', color: 'var(--text-primary)', fontSize: 13,
                      fontWeight: 600, outline: 'none'
                    }}
                  />
                </div>

                {/* HTML Body */}
                <div>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    HTML Template
                  </label>
                  <textarea
                    value={templateHtml}
                    onChange={e => setTemplateHtml(e.target.value)}
                    rows={19}
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                      borderRadius: 8, padding: 12, color: 'var(--text-primary)', fontSize: 12,
                      fontFamily: 'monospace', lineHeight: 1.55, outline: 'none', resize: 'vertical'
                    }}
                  />
                </div>
              </div>

              {/* Right Column: Live Device Preview */}
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>Live Inbox Preview</h3>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Rendered with sample order data</div>
                  </div>
                  <div style={{ display: 'inline-flex', background: 'var(--bg-elevated)', padding: 3, borderRadius: 8, border: '1px solid var(--border)' }}>
                    <button
                      onClick={() => setPreviewDevice('desktop')}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '4.5px 10px', borderRadius: 6, border: 'none',
                        background: previewDevice === 'desktop' ? 'var(--bg-surface)' : 'transparent',
                        color: previewDevice === 'desktop' ? 'var(--text-primary)' : 'var(--text-muted)',
                        fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                        boxShadow: previewDevice === 'desktop' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
                      }}
                    >
                      <Icon.Monitor size={12.5} />
                      <span>Desktop</span>
                    </button>
                    <button
                      onClick={() => setPreviewDevice('mobile')}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '4.5px 10px', borderRadius: 6, border: 'none',
                        background: previewDevice === 'mobile' ? 'var(--bg-surface)' : 'transparent',
                        color: previewDevice === 'mobile' ? 'var(--text-primary)' : 'var(--text-muted)',
                        fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                        boxShadow: previewDevice === 'mobile' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
                      }}
                    >
                      <Icon.Phone size={12.5} />
                      <span>Mobile</span>
                    </button>
                  </div>
                </div>

                <div style={{
                  maxWidth: previewDevice === 'mobile' ? 375 : '100%',
                  margin: '0 auto', border: '1px solid var(--border)', borderRadius: 12,
                  overflow: 'hidden', background: '#ffffff', transition: 'max-width 0.25s ease'
                }}>
                  <div style={{ background: '#f8fafc', padding: '12px 16px', borderBottom: '1px solid #e2e8f0', fontSize: 12, color: '#64748b' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 99, background: '#ef4444' }} />
                      <span style={{ width: 9, height: 9, borderRadius: 99, background: '#f59e0b' }} />
                      <span style={{ width: 9, height: 9, borderRadius: 99, background: '#22c55e' }} />
                    </div>
                    <div><strong style={{ color: '#0f172a' }}>From:</strong> {activeBrandName} &lt;{activeSenderEmail}&gt;</div>
                    <div style={{ marginTop: 3 }}>
                      <strong style={{ color: '#0f172a' }}>Subject:</strong>{' '}
                      {(templateSubject || '')
                        .replace(/\{\{first_name\}\}/g, 'Salar')
                        .replace(/\{\{customer_name\}\}/g, 'Salar Khan')
                        .replace(/\{\{order_ref\}\}/g, '#TR35089')
                        .replace(/\{\{store_name\}\}/g, activeBrandName)}
                    </div>
                  </div>
                  <iframe
                    title="Live Email Preview"
                    srcDoc={previewHtml}
                    style={{ width: '100%', height: 500, border: 'none', background: '#ffffff', display: 'block' }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────── */}
      {/* TAB 4: PLUG & PLAY PER-STORE EMAIL SETUP */}
      {/* ──────────────────────────────────────────────────────────────── */}
      {activeTab === 'setup' && (
        <div>
          {setupLoading ? (
            <div style={{ padding: 56, textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
              <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
              <div style={{ fontSize: 13 }}>Loading store email configuration...</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.55fr) minmax(280px, 1fr)', gap: 18, alignItems: 'start' }}>

              {/* Left: Plug & Play Store Connection Form */}
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 22 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap',
                  gap: 12, paddingBottom: 16, marginBottom: 18, borderBottom: '1px solid var(--border)'
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>
                        Email Connection — {setupForm.storeName || `Store #${activeStoreId || 1}`}
                      </h3>
                      {setupForm.shopDomain && (
                        <span style={{
                          fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)',
                          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                          padding: '2px 8px', borderRadius: 6
                        }}>
                          {setupForm.shopDomain}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                      Plug &amp; play per-store credentials saved in ERP database — no Railway dashboard needed.
                    </div>
                  </div>

                  {/* Auto-Send Daily Cron Toggle */}
                  <label style={{
                    display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                    padding: '7px 12px', borderRadius: 9,
                    background: setupForm.enabled ? 'rgba(16,185,129,0.10)' : 'var(--bg-elevated)',
                    border: `1px solid ${setupForm.enabled ? 'rgba(16,185,129,0.30)' : 'var(--border)'}`
                  }}>
                    <input
                      type="checkbox"
                      checked={setupForm.enabled}
                      onChange={e => setSetupForm(prev => ({ ...prev, enabled: e.target.checked }))}
                      style={{ width: 16, height: 16, accentColor: '#10b981', cursor: 'pointer' }}
                    />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: setupForm.enabled ? '#059669' : 'var(--text-primary)', lineHeight: 1.2 }}>
                        {setupForm.enabled ? 'Auto-Send Enabled' : 'Auto-Send Paused'}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Daily 10:00 AM PKT cron</div>
                    </div>
                  </label>
                </div>

                {/* Provider Selector */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Email Provider
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[
                      { id: 'brevo', title: 'Brevo API', sub: '300 free emails/day · 1-click GoDaddy DNS' },
                      { id: 'resend', title: 'Resend API', sub: '100 free emails/day · Custom domain API' },
                    ].map(p => {
                      const active = setupForm.provider === p.id
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSetupForm(prev => ({ ...prev, provider: p.id }))}
                          style={{
                            textAlign: 'left', padding: '11px 14px', borderRadius: 9, cursor: 'pointer',
                            background: active ? 'rgba(37,99,235,0.06)' : 'var(--bg-elevated)',
                            border: `1.5px solid ${active ? '#2563eb' : 'var(--border)'}`
                          }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{p.title}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>{p.sub}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* API Key Input */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {setupForm.provider === 'resend' ? 'Resend API Key' : 'Brevo API Key'} *
                    </label>
                    {setupForm.hasApiKey && (
                      <span style={{
                        fontSize: 11, fontWeight: 700, color: '#059669',
                        background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.25)',
                        padding: '1.5px 8px', borderRadius: 99, fontFamily: 'monospace'
                      }}>
                        ● Saved ({setupForm.maskedApiKey})
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={setupForm.apiKeyInput}
                      onChange={e => setSetupForm(prev => ({ ...prev, apiKeyInput: e.target.value }))}
                      placeholder={setupForm.hasApiKey
                        ? 'Leave blank to keep saved key, or paste a new key to replace...'
                        : (setupForm.provider === 'resend' ? 're_...' : 'xkeysib-...')}
                      style={{
                        flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                        borderRadius: 8, padding: '9px 12px', color: 'var(--text-primary)',
                        fontSize: 12.5, fontFamily: 'monospace', outline: 'none'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(s => !s)}
                      style={{
                        padding: '0 12px', borderRadius: 8, border: '1px solid var(--border)',
                        background: 'var(--bg-elevated)', color: 'var(--text-muted)',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer'
                      }}
                    >
                      {showApiKey ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                {/* Brand & Sender Identity Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Brand / From Name *
                    </label>
                    <input
                      type="text"
                      value={setupForm.fromName}
                      onChange={e => setSetupForm(prev => ({ ...prev, fromName: e.target.value }))}
                      placeholder="e.g. Rabbi Trends"
                      style={{
                        width: '100%', boxSizing: 'border-box',
                        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                        borderRadius: 8, padding: '9px 12px', color: 'var(--text-primary)', fontSize: 13, outline: 'none'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Verified Sender Email *
                    </label>
                    <input
                      type="email"
                      value={setupForm.fromEmail}
                      onChange={e => setSetupForm(prev => ({ ...prev, fromEmail: e.target.value }))}
                      placeholder="orders@yourstore.com"
                      style={{
                        width: '100%', boxSizing: 'border-box',
                        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                        borderRadius: 8, padding: '9px 12px', color: 'var(--text-primary)', fontSize: 13,
                        fontFamily: 'monospace', outline: 'none'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Reply-To Email
                    </label>
                    <input
                      type="email"
                      value={setupForm.replyTo}
                      onChange={e => setSetupForm(prev => ({ ...prev, replyTo: e.target.value }))}
                      placeholder="support@yourstore.com or store Gmail"
                      style={{
                        width: '100%', boxSizing: 'border-box',
                        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                        borderRadius: 8, padding: '9px 12px', color: 'var(--text-primary)', fontSize: 13,
                        fontFamily: 'monospace', outline: 'none'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Store Website URL
                    </label>
                    <input
                      type="text"
                      value={setupForm.websiteUrl}
                      onChange={e => setSetupForm(prev => ({ ...prev, websiteUrl: e.target.value }))}
                      placeholder="https://yourstore.com"
                      style={{
                        width: '100%', boxSizing: 'border-box',
                        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                        borderRadius: 8, padding: '9px 12px', color: 'var(--text-primary)', fontSize: 13,
                        fontFamily: 'monospace', outline: 'none'
                      }}
                    />
                  </div>
                </div>

                {/* Footer Actions */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10,
                  paddingTop: 14, borderTop: '1px solid var(--border)'
                }}>
                  <button
                    type="button"
                    disabled={setupSaving}
                    onClick={() => saveEmailSettings(true)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '8.5px 15px', borderRadius: 8, border: '1px solid var(--border)',
                      background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                      fontSize: 12.5, fontWeight: 700, cursor: 'pointer', opacity: setupSaving ? 0.6 : 1
                    }}
                  >
                    <Icon.Flask size={13.5} />
                    <span>Save &amp; Send Test</span>
                  </button>

                  <button
                    type="button"
                    disabled={setupSaving}
                    onClick={() => saveEmailSettings(false)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '8.5px 18px', borderRadius: 8, border: 'none',
                      background: '#2563eb', color: '#fff',
                      fontSize: 12.5, fontWeight: 700, cursor: 'pointer', opacity: setupSaving ? 0.6 : 1
                    }}
                  >
                    <Icon.Check size={13.5} />
                    <span>{setupSaving ? 'Saving...' : 'Save Settings'}</span>
                  </button>
                </div>
              </div>

              {/* Right: Quick Setup Checklist & Isolation Guarantee */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ color: '#059669', display: 'flex' }}><Icon.Shield size={16} /></span>
                    <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>
                      Strict Store Isolation Active
                    </h4>
                  </div>
                  <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.55 }}>
                    Every store uses its own separate Brevo/Resend account, API key, sender identity, email template, and public review page. Unconfigured stores are automatically skipped by the 10:00 AM daily scan — zero cross-store email leakage.
                  </p>
                </div>

                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>
                    60-Second Setup for Any New Store
                  </h4>
                  <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.7 }}>
                    <li>Create a free <strong style={{ color: 'var(--text-primary)' }}>Brevo</strong> account using this store&apos;s email (<strong style={{ color: 'var(--text-primary)' }}>300 free emails/day</strong>).</li>
                    <li>Authenticate the store domain under <strong style={{ color: 'var(--text-primary)' }}>Senders, domains, IPs</strong> and add <code style={{ fontSize: 11.5 }}>orders@store.com</code>.</li>
                    <li>Under <strong style={{ color: 'var(--text-primary)' }}>Security → Authorized IPs</strong>, deactivate API IP blocking.</li>
                    <li>Generate an API key (<strong style={{ color: 'var(--text-primary)' }}>Transactional email: All</strong>), paste it here, and click <strong style={{ color: 'var(--text-primary)' }}>Save &amp; Send Test</strong>.</li>
                  </ol>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Send Test Email Modal ─── */}
      {showTestModal && (
        <div
          onClick={() => !sendingTest && setShowTestModal(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16
          }}
        >
          <form
            onClick={e => e.stopPropagation()}
            onSubmit={handleSendTestEmail}
            style={{
              width: '100%', maxWidth: 420, background: 'var(--bg-surface)',
              border: '1px solid var(--border)', borderRadius: 14, padding: 22,
              boxShadow: '0 20px 50px rgba(0,0,0,0.25)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>Send Test Email</h3>
              <button
                type="button"
                onClick={() => setShowTestModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, padding: 4 }}
              >
                ✕
              </button>
            </div>
            <p style={{ margin: '0 0 16px', fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Sends a sample review request using your active template from <strong style={{ color: 'var(--text-primary)' }}>{activeSenderEmail}</strong>.
            </p>
            <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Recipient Email
            </label>
            <input
              type="email"
              required
              autoFocus
              value={testEmail}
              onChange={e => setTestEmail(e.target.value)}
              placeholder="name@example.com"
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '9px 12px', color: 'var(--text-primary)',
                fontSize: 13, outline: 'none', marginBottom: 16
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowTestModal(false)}
                style={{
                  padding: '7.5px 14px', borderRadius: 8, border: '1px solid var(--border)',
                  background: 'transparent', color: 'var(--text-muted)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={sendingTest}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7.5px 16px', borderRadius: 8, border: 'none',
                  background: '#2563eb', color: '#fff', fontSize: 12.5, fontWeight: 700,
                  cursor: sendingTest ? 'wait' : 'pointer', opacity: sendingTest ? 0.65 : 1
                }}
              >
                <Icon.Send size={12.5} />
                <span>{sendingTest ? 'Sending...' : 'Send Test'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ─── Lightbox Modal for Photo Thumbnails ─── */}
      {selectedImage && (
        <div
          onClick={() => setSelectedImage(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20
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
                position: 'absolute', top: -14, right: -14, background: '#fff', color: '#000',
                border: 'none', borderRadius: 99, width: 34, height: 34, fontWeight: 900, cursor: 'pointer', fontSize: 15
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
