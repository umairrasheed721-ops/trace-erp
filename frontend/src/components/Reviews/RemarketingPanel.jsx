import React, { useState, useEffect, useCallback, useMemo } from 'react'

const API = import.meta.env.VITE_API_URL || ''

const Svg = {
  Spark: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3z" />
    </svg>
  ),
  Users: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Send: ({ size = 13 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />
    </svg>
  ),
  Shield: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  ),
  Alert: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" /><path d="M12 17h.01" />
    </svg>
  ),
  Zap: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  Play: ({ size = 12 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  ),
  Pause: ({ size = 12 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
    </svg>
  ),
  Trash: ({ size = 12 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  ),
  Refresh: ({ size = 13 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" />
    </svg>
  ),
  Gift: ({ size = 15 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13" />
      <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
      <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" />
    </svg>
  ),
  Clock: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
}

const SEGMENTS = [
  { id: 'all_delivered', label: 'All Delivered Buyers', desc: 'Every verified delivered buyer' },
  { id: 'vip',           label: 'VIP Repeat (2+ Orders)', desc: 'Highest-trust repeat customers' },
  { id: 'winback_45',    label: 'Win-Back (45+ Days)', desc: 'Delivered 45+ days ago, quiet since' },
  { id: 'winback_90',    label: 'Win-Back (90+ Days)', desc: 'Dormant buyers from 3+ months ago' },
  { id: 'recent_30',     label: 'Recent (Last 30 Days)', desc: 'Fresh delivered buyers' },
]

const LETTER_PRESETS = [
  {
    id: 'vip_early',
    label: 'VIP Early Access',
    name: 'VIP Early Drop Access',
    subject: 'Early access for you, {{first_name}}',
    bodyText: `Hi {{first_name}},\n\nSince you picked up {{last_product}} from us before, I wanted to give you a quick heads-up before we share our new drop publicly.\n\nWe just added a limited batch of fresh pieces online today. If you want first pick on your size before they move, you can take a quiet look here.\n\nJust reply to this email if you need any sizing help.`,
    ctaLabel: 'See the new drop',
  },
  {
    id: 'restock',
    label: 'Restock Note',
    name: 'Popular Sizes Restocked',
    subject: 'Quick update on sizes, {{first_name}}',
    bodyText: `Hi {{first_name}},\n\nHope your {{last_product}} is holding up well.\n\nA few of our most requested sizes just came back in stock today at {{store_name}}. Thought I would drop you a quick note in case you had your eye on another color.\n\nFeel free to reply directly if you want recommendations.`,
    ctaLabel: 'Browse restocked items',
  },
  {
    id: 'winback',
    label: '45-Day Win-Back',
    name: 'Personal Check-In (Win-Back)',
    subject: 'Checking in from {{store_name}}, {{first_name}}',
    bodyText: `Hi {{first_name}},\n\nIt has been a little while since your last order ({{last_product}}), so I wanted to check in and say thanks again for supporting {{store_name}}.\n\nWe have quietly updated our collection with new fits this month. If you feel like taking a look, I have kept a personal returning-customer code active for you — just reply here if you would like it or visit the site directly.`,
    ctaLabel: 'Visit our store',
  },
]

const PROMO_TRIGGERS = [
  'flash sale', 'mega sale', 'clearance', 'buy now', 'act now', 'limited time',
  'urgent', 'click here', '50% off', '60% off', '70% off', '80% off',
  '100% free', 'free gift', 'exclusive offer', 'special deal', 'hurry',
  'last chance', 'big sale', 'discount code', 'promo code', 'newsletter',
]

const RISKY_SENDER_PREFIXES = ['promo@', 'marketing@', 'newsletter@', 'offers@', 'deals@', 'vip@', 'noreply@', 'no-reply@', 'sales@']

function analyzePrimarySafety({ subject, bodyText, senderEmail }) {
  const warnings = []
  const combined = `${subject || ''} ${bodyText || ''}`
  const lower = combined.toLowerCase()

  const senderLower = (senderEmail || '').trim().toLowerCase()
  if (senderLower && RISKY_SENDER_PREFIXES.some(p => senderLower.startsWith(p))) {
    warnings.push(`Sender "${senderEmail}" looks promotional — use orders@ or care@ for Primary Inbox.`)
  }

  const matchedWords = PROMO_TRIGGERS.filter(w => lower.includes(w))
  if (matchedWords.length > 0) {
    warnings.push(`Promotions trigger words detected: ${matchedWords.slice(0, 4).join(', ')}`)
  }

  const capsWords = (subject || '').match(/\b[A-Z]{4,}\b/g) || []
  const filteredCaps = capsWords.filter(w => !['TRACE', 'PKR', 'COD', 'VIP'].includes(w))
  if (filteredCaps.length >= 2) {
    warnings.push(`Avoid ALL-CAPS words in subject (${filteredCaps.slice(0, 3).join(', ')})`)
  }

  if (/!{2,}/.test(combined)) {
    warnings.push('Avoid repeated exclamation marks (!!) — looks like promo mail.')
  }

  const urlMatches = (bodyText || '').match(/https?:\/\/\S+/gi) || []
  if (urlMatches.length > 1) {
    warnings.push('Keep max 1 clean link — multiple URLs trigger Gmail Promotions.')
  }

  const emojiMatches = combined.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || []
  if (emojiMatches.length >= 2) {
    warnings.push(`Too many emojis (${emojiMatches.length}) — plain text with 0-1 emoji lands in Primary.`)
  }

  return {
    safe: warnings.length === 0,
    warnings,
  }
}

const CAMPAIGN_STATUS_STYLE = {
  running:   { bg: 'rgba(16,185,129,0.10)', color: '#059669', dot: '#10b981', border: 'rgba(16,185,129,0.25)', label: 'Auto-Dripping' },
  paused:    { bg: 'rgba(245,158,11,0.10)', color: '#b45309', dot: '#f59e0b', border: 'rgba(245,158,11,0.26)', label: 'Paused' },
  completed: { bg: 'rgba(37,99,235,0.10)',  color: '#2563eb', dot: '#3b82f6', border: 'rgba(37,99,235,0.25)',  label: 'Completed' },
}

export default function RemarketingPanel({ activeStoreId, token, addToast, provider, onOpenSetup }) {
  const [subTab, setSubTab] = useState('broadcast') // 'broadcast' | 'autopilot'
  const [loading, setLoading] = useState(false)

  // Config / Autopilot state
  const [config, setConfig] = useState(null)
  const [savingConfig, setSavingConfig] = useState(false)
  const [autoForm, setAutoForm] = useState({
    reviewRewardEnabled: false,
    reviewRewardMinRating: 4,
    reviewRewardCode: '',
    reviewRewardMessage: '',
    postDeliveryEnabled: false,
    postDeliveryDays: 10,
    postDeliveryCode: '',
    postDeliverySubject: '',
    postDeliveryBody: '',
    remarketingFromName: '',
    remarketingFromEmail: '',
  })

  // Audience filters state
  const [filters, setFilters] = useState({
    segment: 'all_delivered',
    city: '',
    product: '',
    minSpent: '',
    excludeRto: true,
  })
  const [audienceLoading, setAudienceLoading] = useState(false)
  const [audienceTotal, setAudienceTotal] = useState(0)
  const [audienceSample, setAudienceSample] = useState([])
  const [showSample, setShowSample] = useState(false)

  // Campaign composer state
  const [campName, setCampName] = useState('')
  const [campSubject, setCampSubject] = useState('')
  const [campBody, setCampBody] = useState('')
  const [campCtaLabel, setCampCtaLabel] = useState('')
  const [campCtaUrl, setCampCtaUrl] = useState('')
  const [dailyLimit, setDailyLimit] = useState(150)
  const [overrideSender, setOverrideSender] = useState(false)
  const [campSenderName, setCampSenderName] = useState('')
  const [campSenderEmail, setCampSenderEmail] = useState('')
  const [launching, setLaunching] = useState(false)

  // Inline test send state
  const [testRecipient, setTestRecipient] = useState('')
  const [sendingTest, setSendingTest] = useState(false)

  // Campaigns queue & quota state
  const [campaignsData, setCampaignsData] = useState({ sentToday: 0, maxDailyCap: 220, campaigns: [] })
  const [campBusy, setCampBusy] = useState({})

  const authHeaders = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...(activeStoreId ? { 'x-active-store-id': String(activeStoreId) } : {}),
  }), [token, activeStoreId])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const qs = activeStoreId ? `?store_id=${activeStoreId}` : ''
      const [cfgRes, campRes] = await Promise.all([
        fetch(`${API}/api/remarketing/config${qs}`, { headers: authHeaders }),
        fetch(`${API}/api/remarketing/campaigns${qs}`, { headers: authHeaders }),
      ])
      const [cfgJson, campJson] = await Promise.all([cfgRes.json(), campRes.json()])
      if (cfgJson.success && cfgJson.data) {
        const d = cfgJson.data
        setConfig(d)
        setAutoForm({
          reviewRewardEnabled: Boolean(d.reviewRewardEnabled),
          reviewRewardMinRating: Number(d.reviewRewardMinRating) || 4,
          reviewRewardCode: d.reviewRewardCode || '',
          reviewRewardMessage: d.reviewRewardMessage || '',
          postDeliveryEnabled: Boolean(d.postDeliveryEnabled),
          postDeliveryDays: Number(d.postDeliveryDays) || 10,
          postDeliveryCode: d.postDeliveryCode || '',
          postDeliverySubject: d.postDeliverySubject || '',
          postDeliveryBody: d.postDeliveryBody || '',
          remarketingFromName: d.remarketingFromName || '',
          remarketingFromEmail: d.remarketingFromEmail || '',
        })
        setCampCtaUrl(prev => prev || d.websiteUrl || '')
      }
      if (campJson.success && campJson.data) {
        setCampaignsData(campJson.data)
      }
    } catch (_) {
      addToast('Failed to load remarketing data', 'error')
    } finally {
      setLoading(false)
    }
  }, [activeStoreId, authHeaders, addToast])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // Debounced live audience preview
  useEffect(() => {
    let cancelled = false
    const t = setTimeout(async () => {
      setAudienceLoading(true)
      try {
        const res = await fetch(`${API}/api/remarketing/audience-preview`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ store_id: activeStoreId, filters }),
        })
        const json = await res.json()
        if (!cancelled && json.success && json.data) {
          setAudienceTotal(json.data.total || 0)
          setAudienceSample(json.data.sample || [])
        }
      } catch (_) {}
      finally {
        if (!cancelled) setAudienceLoading(false)
      }
    }, 320)
    return () => { cancelled = true; clearTimeout(t) }
  }, [activeStoreId, authHeaders, filters])

  const effectiveSenderName = (overrideSender && campSenderName.trim())
    || config?.remarketingFromName
    || config?.fromName
    || provider?.fromName
    || 'Store Team'

  const effectiveSenderEmail = (overrideSender && campSenderEmail.trim())
    || config?.remarketingFromEmail
    || config?.fromEmail
    || provider?.fromEmail
    || ''

  const safety = useMemo(() => analyzePrimarySafety({
    subject: campSubject,
    bodyText: campBody,
    senderEmail: effectiveSenderEmail,
  }), [campSubject, campBody, effectiveSenderEmail])

  const applyPreset = (preset) => {
    setCampName(preset.name)
    setCampSubject(preset.subject)
    setCampBody(preset.bodyText)
    setCampCtaLabel(preset.ctaLabel)
    if (!campCtaUrl && config?.websiteUrl) setCampCtaUrl(config.websiteUrl)
  }

  const insertVar = (tokenStr) => {
    setCampBody(prev => (prev ? `${prev}${prev.endsWith(' ') || prev.endsWith('\n') ? '' : ' '}${tokenStr}` : tokenStr))
  }

  const handleSendTest = async () => {
    const email = testRecipient.trim()
    if (!email || !email.includes('@')) {
      addToast('Enter a valid email address for the test send', 'error')
      return
    }
    setSendingTest(true)
    try {
      const res = await fetch(`${API}/api/remarketing/campaigns/send-test`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          store_id: activeStoreId,
          email,
          subject: campSubject || `Quick note from ${effectiveSenderName}`,
          bodyText: campBody || 'Hi {{first_name}},\n\nTesting Primary Inbox delivery from your store.',
          ctaLabel: campCtaLabel,
          ctaUrl: campCtaUrl,
          senderName: overrideSender ? campSenderName : '',
          senderEmail: overrideSender ? campSenderEmail : '',
        }),
      })
      const json = await res.json()
      if (json.success) {
        addToast(json.message || `Test sent to ${email}`, 'success')
      } else {
        addToast(json.error || 'Failed to send test', 'error')
      }
    } catch (_) {
      addToast('Network error sending test email', 'error')
    } finally {
      setSendingTest(false)
    }
  }

  const handleLaunchCampaign = async (e) => {
    e.preventDefault()
    if (!campName.trim() || !campSubject.trim() || !campBody.trim()) {
      addToast('Campaign name, subject, and message are required', 'error')
      return
    }
    if (audienceTotal <= 0) {
      addToast('No eligible verified delivered buyers match these filters', 'error')
      return
    }
    setLaunching(true)
    try {
      const res = await fetch(`${API}/api/remarketing/campaigns`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          store_id: activeStoreId,
          name: campName.trim(),
          subject: campSubject.trim(),
          bodyText: campBody.trim(),
          ctaLabel: campCtaLabel.trim(),
          ctaUrl: campCtaUrl.trim(),
          dailyLimit: Number(dailyLimit) || 150,
          senderName: overrideSender ? campSenderName.trim() : '',
          senderEmail: overrideSender ? campSenderEmail.trim() : '',
          filters,
          startImmediately: true,
        }),
      })
      const json = await res.json()
      if (json.success) {
        addToast(json.message || 'Auto-Drip campaign launched', 'success')
        setCampName('')
        setCampSubject('')
        setCampBody('')
        setCampCtaLabel('')
        await fetchAll()
      } else {
        addToast(json.error || 'Failed to create campaign', 'error')
      }
    } catch (_) {
      addToast('Network error creating campaign', 'error')
    } finally {
      setLaunching(false)
    }
  }

  const handleToggleStatus = async (camp) => {
    const next = camp.status === 'running' ? 'paused' : 'running'
    setCampBusy(prev => ({ ...prev, [camp.id]: true }))
    try {
      const res = await fetch(`${API}/api/remarketing/campaigns/${camp.id}/status`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ store_id: activeStoreId, status: next }),
      })
      const json = await res.json()
      if (json.success) {
        addToast(json.message, 'success')
        await fetchAll()
      } else {
        addToast(json.error || 'Failed to update status', 'error')
      }
    } catch (_) {
      addToast('Failed to update campaign status', 'error')
    } finally {
      setCampBusy(prev => ({ ...prev, [camp.id]: false }))
    }
  }

  const handleDripNow = async (camp) => {
    setCampBusy(prev => ({ ...prev, [camp.id]: true }))
    try {
      const res = await fetch(`${API}/api/remarketing/campaigns/${camp.id}/drip-now`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ store_id: activeStoreId }),
      })
      const json = await res.json()
      if (json.success) {
        addToast(json.message, 'success')
        await fetchAll()
      } else {
        addToast(json.error || 'Drip batch failed', 'error')
      }
    } catch (_) {
      addToast('Failed to trigger drip batch', 'error')
    } finally {
      setCampBusy(prev => ({ ...prev, [camp.id]: false }))
    }
  }

  const handleDeleteCampaign = async (camp) => {
    if (!window.confirm(`Delete campaign "${camp.name}" and its queue history?`)) return
    setCampBusy(prev => ({ ...prev, [camp.id]: true }))
    try {
      const qs = activeStoreId ? `?store_id=${activeStoreId}` : ''
      const res = await fetch(`${API}/api/remarketing/campaigns/${camp.id}${qs}`, {
        method: 'DELETE',
        headers: authHeaders,
      })
      const json = await res.json()
      if (json.success) {
        addToast('Campaign deleted', 'success')
        await fetchAll()
      } else {
        addToast(json.error || 'Failed to delete', 'error')
      }
    } catch (_) {
      addToast('Network error deleting campaign', 'error')
    } finally {
      setCampBusy(prev => ({ ...prev, [camp.id]: false }))
    }
  }

  const handleSaveAutopilot = async (e) => {
    e.preventDefault()
    if (autoForm.reviewRewardEnabled && !autoForm.reviewRewardCode.trim()) {
      addToast('Enter a coupon code to enable the Review Thank-You Reward flow', 'error')
      return
    }
    setSavingConfig(true)
    try {
      const res = await fetch(`${API}/api/remarketing/config`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ store_id: activeStoreId, ...autoForm }),
      })
      const json = await res.json()
      if (json.success) {
        addToast('Autopilot remarketing settings saved', 'success')
        await fetchAll()
      } else {
        addToast(json.error || 'Failed to save settings', 'error')
      }
    } catch (_) {
      addToast('Network error saving settings', 'error')
    } finally {
      setSavingConfig(false)
    }
  }

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '8.5px 11px', color: 'var(--text-primary)',
    fontSize: 13, outline: 'none', fontFamily: 'inherit',
  }

  const labelStyle = {
    display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5,
  }

  const estDays = audienceTotal > 0 ? Math.max(1, Math.ceil(audienceTotal / Math.max(10, Number(dailyLimit) || 150))) : 0
  const isConfigured = Boolean(provider?.configured ?? config?.configured)
  const activeAutopilotCount = (autoForm.reviewRewardEnabled ? 1 : 0) + (autoForm.postDeliveryEnabled ? 1 : 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Unconfigured Store Warning Banner */}
      {!isConfigured && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
          padding: '12px 16px', borderRadius: 12,
          background: 'rgba(245,158,11,0.09)', border: '1px solid rgba(245,158,11,0.32)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: '#b45309', display: 'flex' }}><Svg.Alert size={16} /></span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                Email not connected for {provider?.storeName || config?.storeName || 'this store'} yet
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Connect this store&apos;s isolated Brevo/Resend key in Email Setup before launching remarketing campaigns.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenSetup}
            style={{
              padding: '7px 14px', borderRadius: 8, border: 'none',
              background: '#2563eb', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Connect Email
          </button>
        </div>
      )}

      {/* Sub-navigation & Live Quota Bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
        background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 14px',
      }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {[
            { id: 'broadcast', label: 'Broadcast & Auto-Drip', icon: <Svg.Send size={13} /> },
            { id: 'autopilot', label: `Autopilot Flows (${activeAutopilotCount}/2 ON)`, icon: <Svg.Zap size={13} /> },
          ].map(item => {
            const active = subTab === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSubTab(item.id)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6.5px 13px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5,
                  fontWeight: active ? 700 : 600,
                  border: active ? '1px solid rgba(37,99,235,0.35)' : '1px solid var(--border)',
                  background: active ? 'rgba(37,99,235,0.10)' : 'var(--bg-elevated)',
                  color: active ? '#2563eb' : 'var(--text-muted)',
                }}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12 }}>
          <span
            title="80/day reserved for transactional review emails out of Brevo's 300/day free tier per store"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', borderRadius: 99,
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              color: 'var(--text-primary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums',
            }}
          >
            <Svg.Clock size={12.5} />
            <span>Today&apos;s Drip: <strong>{campaignsData.sentToday}</strong> / {campaignsData.maxDailyCap}</span>
          </span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 99,
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            color: 'var(--text-muted)', fontWeight: 600, fontVariantNumeric: 'tabular-nums',
          }}>
            <span>Opted Out: <strong style={{ color: 'var(--text-primary)' }}>{config?.unsubscribedCount ?? 0}</strong></span>
          </span>
          <button
            type="button"
            onClick={fetchAll}
            disabled={loading}
            title="Refresh remarketing metrics"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)',
              background: 'var(--bg-elevated)', color: 'var(--text-muted)', cursor: 'pointer',
            }}
          >
            <Svg.Refresh size={13} />
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SUB-TAB 1: BROADCAST & AUTO-DRIP                                   */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {subTab === 'broadcast' && (
        <>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
            gap: 16,
            alignItems: 'start',
          }}>

            {/* LEFT: Smart Delivered-Only Audience Builder */}
            <div style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 14,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#2563eb', display: 'flex' }}><Svg.Users size={16} /></span>
                  <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: 'var(--text-primary)' }}>
                    1. Verified Buyer Audience
                  </h3>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                  background: 'rgba(16,185,129,0.10)', color: '#059669', border: '1px solid rgba(16,185,129,0.22)',
                }}>
                  Delivered Only
                </span>
              </div>

              {/* Segment Selector */}
              <div>
                <label style={labelStyle}>Buyer Segment</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {SEGMENTS.map(seg => {
                    const active = filters.segment === seg.id
                    return (
                      <button
                        key={seg.id}
                        type="button"
                        onClick={() => setFilters(prev => ({ ...prev, segment: seg.id }))}
                        style={{
                          textAlign: 'left', padding: '8.5px 11px', borderRadius: 8, cursor: 'pointer',
                          border: active ? '1px solid rgba(37,99,235,0.45)' : '1px solid var(--border)',
                          background: active ? 'rgba(37,99,235,0.08)' : 'var(--bg-elevated)',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: active ? '#2563eb' : 'var(--text-primary)' }}>
                            {seg.label}
                          </div>
                          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1 }}>{seg.desc}</div>
                        </div>
                        <span style={{
                          width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                          border: active ? '4px solid #2563eb' : '1.5px solid var(--border)',
                          boxSizing: 'border-box',
                        }} />
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Extra Filters */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>City (Optional)</label>
                  <input
                    type="text"
                    value={filters.city}
                    onChange={e => setFilters(prev => ({ ...prev, city: e.target.value }))}
                    placeholder="e.g. Lahore"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Min Spend (Rs.)</label>
                  <input
                    type="number"
                    min="0"
                    value={filters.minSpent}
                    onChange={e => setFilters(prev => ({ ...prev, minSpent: e.target.value }))}
                    placeholder="e.g. 5000"
                    style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Bought Product Keyword (Optional)</label>
                <input
                  type="text"
                  value={filters.product}
                  onChange={e => setFilters(prev => ({ ...prev, product: e.target.value }))}
                  placeholder="e.g. Hoodie, Tracksuit, Crew"
                  style={inputStyle}
                />
              </div>

              {/* RTO Protection Checkbox */}
              <label style={{
                display: 'flex', alignItems: 'flex-start', gap: 9, cursor: 'pointer',
                padding: '9px 11px', borderRadius: 8,
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              }}>
                <input
                  type="checkbox"
                  checked={filters.excludeRto}
                  onChange={e => setFilters(prev => ({ ...prev, excludeRto: e.target.checked }))}
                  style={{ marginTop: 2, accentColor: '#059669' }}
                />
                <span style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.45 }}>
                  <strong>Exclude RTO / Returned / Refused buyers</strong>
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)' }}>
                    Auto-removes return-prone customers &amp; unsubscribed emails to protect domain reputation.
                  </span>
                </span>
              </label>

              {/* Live Audience Result Box */}
              <div style={{
                padding: '12px 14px', borderRadius: 10,
                background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.22)',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#2563eb' }}>
                      Eligible Verified Buyers
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
                      {audienceLoading ? '...' : audienceTotal.toLocaleString()}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 11.5, color: 'var(--text-muted)' }}>
                    {audienceTotal > 0
                      ? <>Auto-drip finishes in <strong style={{ color: 'var(--text-primary)' }}>~{estDays}d</strong></>
                      : 'Adjust filters to match buyers'}
                  </div>
                </div>

                {audienceSample.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={() => setShowSample(s => !s)}
                      style={{
                        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                        fontSize: 11.5, fontWeight: 700, color: '#2563eb',
                      }}
                    >
                      {showSample ? 'Hide sample recipients ▲' : `Preview sample (${audienceSample.length}) ▼`}
                    </button>
                    {showSample && (
                      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {audienceSample.map((row, idx) => (
                          <div key={idx} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                            fontSize: 11.5, padding: '5px 8px', borderRadius: 6,
                            background: 'var(--bg-surface)', border: '1px solid var(--border)',
                          }}>
                            <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              <strong style={{ color: 'var(--text-primary)' }}>{row.customer_name || 'Buyer'}</strong>
                              <span style={{ color: 'var(--text-muted)' }}> · {row.email}</span>
                            </div>
                            <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                              {row.delivered_orders}x · Rs.{Number(row.total_spent || 0).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT: Primary-Inbox Personal Letter Composer */}
            <form
              onSubmit={handleLaunchCampaign}
              style={{
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 13,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#059669', display: 'flex' }}><Svg.Shield size={16} /></span>
                  <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: 'var(--text-primary)' }}>
                    2. Primary-Inbox Letter Composer
                  </h3>
                </div>

                {/* Live Primary-Safe Badge */}
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '3px 10px', borderRadius: 99, fontSize: 11.5, fontWeight: 700,
                  background: safety.safe ? 'rgba(16,185,129,0.10)' : 'rgba(245,158,11,0.12)',
                  color: safety.safe ? '#059669' : '#b45309',
                  border: `1px solid ${safety.safe ? 'rgba(16,185,129,0.28)' : 'rgba(245,158,11,0.32)'}`,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: safety.safe ? '#10b981' : '#f59e0b' }} />
                  {safety.safe ? 'Primary-Safe' : `Promotions Risk (${safety.warnings.length})`}
                </span>
              </div>

              {/* 1-Click Primary-Safe Presets */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)' }}>Templates:</span>
                {LETTER_PRESETS.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p)}
                    style={{
                      padding: '4px 10px', borderRadius: 7, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                      background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)',
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Campaign Name</label>
                  <input
                    type="text"
                    required
                    value={campName}
                    onChange={e => setCampName(e.target.value)}
                    placeholder="e.g. Winter Restock — VIP Buyers"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Daily Drip Limit (Max 220)</label>
                  <input
                    type="number"
                    min="10"
                    max="220"
                    value={dailyLimit}
                    onChange={e => setDailyLimit(Math.min(220, Math.max(10, parseInt(e.target.value, 10) || 150)))}
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Sender Identity Strip */}
              <div style={{
                padding: '8px 11px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Sending as: <strong style={{ color: 'var(--text-primary)' }}>{effectiveSenderName}</strong>{' '}
                    <code style={{ fontSize: 11.5, color: 'var(--text-primary)' }}>&lt;{effectiveSenderEmail || 'unconfigured'}&gt;</code>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOverrideSender(o => !o)}
                    style={{
                      background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                      fontSize: 11.5, fontWeight: 700, color: '#2563eb',
                    }}
                  >
                    {overrideSender ? 'Use Default' : 'Override Sender'}
                  </button>
                </div>
                {overrideSender && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                    <input
                      type="text"
                      value={campSenderName}
                      onChange={e => setCampSenderName(e.target.value)}
                      placeholder="e.g. Umair from TRACE"
                      style={inputStyle}
                    />
                    <input
                      type="email"
                      value={campSenderEmail}
                      onChange={e => setCampSenderEmail(e.target.value)}
                      placeholder="care@yourstore.com (avoid promo@)"
                      style={inputStyle}
                    />
                  </div>
                )}
              </div>

              <div>
                <label style={labelStyle}>Subject Line (Short &amp; Human — Avoid ALL CAPS / % OFF)</label>
                <input
                  type="text"
                  required
                  value={campSubject}
                  onChange={e => setCampSubject(e.target.value)}
                  placeholder="Quick update for you, {{first_name}}"
                  style={inputStyle}
                />
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5, flexWrap: 'wrap', gap: 6 }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>Plain-Text Personal Letter</label>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {['{{first_name}}', '{{last_product}}', '{{order_ref}}', '{{store_name}}'].map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => insertVar(v)}
                        style={{
                          fontSize: 10.5, fontWeight: 700, padding: '2px 6px', borderRadius: 5, cursor: 'pointer',
                          background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-muted)',
                        }}
                      >
                        +{v}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  required
                  rows={6}
                  value={campBody}
                  onChange={e => setCampBody(e.target.value)}
                  placeholder="Write like a short personal email from the founder (no banners, no promo buttons — lands straight in Primary Inbox)."
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.55 }}
                />
              </div>

              {/* Single Clean Text Link */}
              <div style={{ display: 'grid', gridTemplateColumns: '0.85fr 1.15fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Single Link Label (Optional)</label>
                  <input
                    type="text"
                    value={campCtaLabel}
                    onChange={e => setCampCtaLabel(e.target.value)}
                    placeholder="e.g. See the new drop"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Destination URL (Optional)</label>
                  <input
                    type="url"
                    value={campCtaUrl}
                    onChange={e => setCampCtaUrl(e.target.value)}
                    placeholder={config?.websiteUrl || 'https://tracepk.com/collections/new'}
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Live Promotions Risk Warnings */}
              {!safety.safe && (
                <div style={{
                  padding: '9px 12px', borderRadius: 8,
                  background: 'rgba(245,158,11,0.09)', border: '1px solid rgba(245,158,11,0.32)',
                  fontSize: 12, color: '#b45309', lineHeight: 1.5,
                }}>
                  <strong style={{ display: 'block', marginBottom: 3 }}>Gmail Promotions Filter Warnings:</strong>
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {safety.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}

              {/* Footer: Inline Test Send + Launch CTA */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
                paddingTop: 10, borderTop: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 220px' }}>
                  <input
                    type="email"
                    value={testRecipient}
                    onChange={e => setTestRecipient(e.target.value)}
                    placeholder="Test inbox email..."
                    style={{ ...inputStyle, padding: '7.5px 10px', fontSize: 12.5 }}
                  />
                  <button
                    type="button"
                    disabled={sendingTest || !isConfigured}
                    onClick={handleSendTest}
                    style={{
                      padding: '7.5px 12px', borderRadius: 8, border: '1px solid var(--border)',
                      background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                      fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', cursor: sendingTest ? 'wait' : 'pointer',
                      opacity: !isConfigured ? 0.5 : 1,
                    }}
                  >
                    {sendingTest ? 'Sending...' : 'Send Test'}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={launching || !isConfigured || audienceTotal <= 0}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    padding: '8.5px 18px', borderRadius: 8, border: 'none',
                    background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 700,
                    cursor: (launching || !isConfigured || audienceTotal <= 0) ? 'not-allowed' : 'pointer',
                    opacity: (launching || !isConfigured || audienceTotal <= 0) ? 0.5 : 1,
                  }}
                >
                  <Svg.Send size={13} />
                  <span>{launching ? 'Queueing...' : `Launch Auto-Drip (${audienceTotal})`}</span>
                </button>
              </div>
            </form>
          </div>

          {/* BOTTOM: Campaigns Drip Queue & 14-Day Live Revenue Attribution */}
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 12, overflow: 'hidden',
          }}>
            <div style={{
              padding: '13px 16px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: 'var(--text-primary)' }}>
                  Auto-Drip Queue &amp; Live Order Attribution
                </h3>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  Background worker drips max 12 emails every 15 min · Tracks real Shopify orders placed within 14 days of email delivery
                </div>
              </div>
            </div>

            {campaignsData.campaigns.length === 0 ? (
              <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
                No remarketing campaigns yet for this store. Pick a segment above and launch your first Primary-Safe drip campaign.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)', textAlign: 'left' }}>
                      <th style={{ padding: '9px 14px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Campaign</th>
                      <th style={{ padding: '9px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Status</th>
                      <th style={{ padding: '9px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Drip Progress</th>
                      <th style={{ padding: '9px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Daily Cap</th>
                      <th style={{ padding: '9px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>14d Attributed Sales</th>
                      <th style={{ padding: '9px 14px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaignsData.campaigns.map(c => {
                      const st = CAMPAIGN_STATUS_STYLE[c.status] || CAMPAIGN_STATUS_STYLE.paused
                      const pct = c.total_recipients > 0 ? Math.min(100, Math.round((c.sent_count / c.total_recipients) * 100)) : 0
                      const remaining = Math.max(0, (c.total_recipients || 0) - (c.sent_count || 0) - (c.failed_count || 0))
                      const busy = Boolean(campBusy[c.id])
                      return (
                        <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '11px 14px', maxWidth: 280 }}>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{c.name}</div>
                            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {c.subject}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                              From: {c.sender_email}
                            </div>
                          </td>
                          <td style={{ padding: '11px 12px' }}>
                            <span
                              title={c.last_error || ''}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                padding: '3px 9px', borderRadius: 99, fontSize: 11.5, fontWeight: 700,
                                background: st.bg, color: st.color, border: `1px solid ${st.border}`, whiteSpace: 'nowrap',
                              }}
                            >
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot }} />
                              {st.label}
                            </span>
                            {c.last_error && (
                              <div style={{ fontSize: 10.5, color: '#dc2626', marginTop: 3, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.last_error}>
                                {c.last_error}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '11px 12px', minWidth: 150 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontVariantNumeric: 'tabular-nums', marginBottom: 4 }}>
                              <strong style={{ color: 'var(--text-primary)' }}>{c.sent_count} / {c.total_recipients}</strong>
                              <span style={{ color: 'var(--text-muted)' }}>{pct}%</span>
                            </div>
                            <div style={{ height: 5, borderRadius: 99, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: c.status === 'completed' ? '#3b82f6' : '#10b981', borderRadius: 99 }} />
                            </div>
                            {c.failed_count > 0 && (
                              <div style={{ fontSize: 10.5, color: '#dc2626', marginTop: 2 }}>{c.failed_count} failed</div>
                            )}
                          </td>
                          <td style={{ padding: '11px 12px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                            {c.daily_limit}/day
                          </td>
                          <td style={{ padding: '11px 12px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: 800, color: c.attributedRevenue > 0 ? '#059669' : 'var(--text-primary)' }}>
                              Rs. {Number(c.attributedRevenue || 0).toLocaleString()}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              {c.attributedOrders || 0} repeat {c.attributedOrders === 1 ? 'order' : 'orders'}
                            </div>
                          </td>
                          <td style={{ padding: '11px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              {remaining > 0 && c.status !== 'completed' && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => handleDripNow(c)}
                                  title="Send up to 12 recipients immediately"
                                  style={{
                                    padding: '5px 9px', borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                                    background: 'rgba(37,99,235,0.10)', color: '#2563eb', border: '1px solid rgba(37,99,235,0.28)',
                                  }}
                                >
                                  Drip 12 Now
                                </button>
                              )}
                              {c.status !== 'completed' && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => handleToggleStatus(c)}
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                    padding: '5px 9px', borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                                    background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)',
                                  }}
                                >
                                  {c.status === 'running' ? <><Svg.Pause size={11} /> Pause</> : <><Svg.Play size={11} /> Resume</>}
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleDeleteCampaign(c)}
                                title="Delete campaign"
                                style={{
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  width: 28, height: 28, borderRadius: 7, cursor: 'pointer',
                                  background: 'rgba(239,68,68,0.08)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.24)',
                                }}
                              >
                                <Svg.Trash size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SUB-TAB 2: AUTOPILOT FLOWS (NO ABANDONED — WHATSAPP HANDLES IT)    */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {subTab === 'autopilot' && (
        <form onSubmit={handleSaveAutopilot} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          <div style={{
            padding: '11px 15px', borderRadius: 10,
            background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.25)',
            display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--text-primary)',
          }}>
            <span style={{ color: '#059669', display: 'flex', flexShrink: 0 }}><Svg.Shield size={16} /></span>
            <span>
              Both autopilot flows send plain-text personal letters from your store&apos;s verified <strong>{config?.fromEmail || 'orders@'}</strong> address to stay strictly inside <strong>Gmail Primary Inbox</strong>. (Abandoned checkout recovery stays on WhatsApp.)
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>

            {/* FLOW 1: Review -> Instant Thank-You Coupon */}
            <div style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 13,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{
                    width: 32, height: 32, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(16,185,129,0.12)', color: '#059669',
                  }}>
                    <Svg.Gift size={16} />
                  </span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: 'var(--text-primary)' }}>
                      Flow 1 · Review → Thank-You Coupon
                    </h3>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1 }}>
                      Auto-replies instantly when a buyer submits a positive review
                    </div>
                  </div>
                </div>

                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: autoForm.reviewRewardEnabled ? '#059669' : 'var(--text-muted)' }}>
                  <input
                    type="checkbox"
                    checked={autoForm.reviewRewardEnabled}
                    onChange={e => setAutoForm(prev => ({ ...prev, reviewRewardEnabled: e.target.checked }))}
                    style={{ width: 16, height: 16, accentColor: '#059669' }}
                  />
                  {autoForm.reviewRewardEnabled ? 'ON' : 'OFF'}
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Minimum Rating</label>
                  <select
                    value={autoForm.reviewRewardMinRating}
                    onChange={e => setAutoForm(prev => ({ ...prev, reviewRewardMinRating: parseInt(e.target.value, 10) }))}
                    style={inputStyle}
                  >
                    <option value={4}>4★ &amp; 5★ Reviews</option>
                    <option value={5}>5★ Reviews Only</option>
                    <option value={1}>All Reviews (1★+)</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Shopify Coupon Code</label>
                  <input
                    type="text"
                    value={autoForm.reviewRewardCode}
                    onChange={e => setAutoForm(prev => ({ ...prev, reviewRewardCode: e.target.value.toUpperCase() }))}
                    placeholder="e.g. TRACE10"
                    style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>
                  Personal Thank-You Letter <span style={{ fontWeight: 500, textTransform: 'none' }}>(Vars: {'{{first_name}}'}, {'{{product_title}}'}, {'{{coupon_code}}'})</span>
                </label>
                <textarea
                  rows={6}
                  value={autoForm.reviewRewardMessage}
                  onChange={e => setAutoForm(prev => ({ ...prev, reviewRewardMessage: e.target.value }))}
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.55 }}
                />
              </div>
            </div>

            {/* FLOW 2: Day +10 Post-Delivery Repeat Buyer Check-In */}
            <div style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 13,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{
                    width: 32, height: 32, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(37,99,235,0.12)', color: '#2563eb',
                  }}>
                    <Svg.Spark size={16} />
                  </span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: 'var(--text-primary)' }}>
                      Flow 2 · Day +{autoForm.postDeliveryDays} Repeat Check-In
                    </h3>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1 }}>
                      Daily 11:00 AM PKT · 0-RTO Delivered buyers only · Max 40/day
                    </div>
                  </div>
                </div>

                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: autoForm.postDeliveryEnabled ? '#059669' : 'var(--text-muted)' }}>
                  <input
                    type="checkbox"
                    checked={autoForm.postDeliveryEnabled}
                    onChange={e => setAutoForm(prev => ({ ...prev, postDeliveryEnabled: e.target.checked }))}
                    style={{ width: 16, height: 16, accentColor: '#059669' }}
                  />
                  {autoForm.postDeliveryEnabled ? 'ON' : 'OFF'}
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '0.7fr 1.3fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Days After Delivery</label>
                  <input
                    type="number"
                    min="3"
                    max="60"
                    value={autoForm.postDeliveryDays}
                    onChange={e => setAutoForm(prev => ({ ...prev, postDeliveryDays: parseInt(e.target.value, 10) || 10 }))}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Repeat Code (Optional)</label>
                  <input
                    type="text"
                    value={autoForm.postDeliveryCode}
                    onChange={e => setAutoForm(prev => ({ ...prev, postDeliveryCode: e.target.value.toUpperCase() }))}
                    placeholder="e.g. BACK10"
                    style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Subject Line</label>
                <input
                  type="text"
                  value={autoForm.postDeliverySubject}
                  onChange={e => setAutoForm(prev => ({ ...prev, postDeliverySubject: e.target.value }))}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>
                  Check-In Message <span style={{ fontWeight: 500, textTransform: 'none' }}>(Vars: {'{{first_name}}'}, {'{{product_title}}'}, {'{{order_ref}}'}, {'{{coupon_code}}'})</span>
                </label>
                <textarea
                  rows={4}
                  value={autoForm.postDeliveryBody}
                  onChange={e => setAutoForm(prev => ({ ...prev, postDeliveryBody: e.target.value }))}
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.55 }}
                />
              </div>
            </div>
          </div>

          {/* Card 3: Optional Broadcast Sender Identity */}
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: 18,
          }}>
            <div style={{ marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>
                Broadcast Sender Identity (Optional — Primary Inbox Shield)
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                Leave blank to send broadcasts from your default <strong>{config?.fromEmail || 'orders@'}</strong>. If you prefer a separate human identity for broadcasts (e.g. <code>Umair from TRACE &lt;care@tracepk.com&gt;</code>), verify that sender in your Brevo/Resend account first — never use <code>promo@</code> or <code>vip@</code>.
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              <div>
                <label style={labelStyle}>Broadcast From Name</label>
                <input
                  type="text"
                  value={autoForm.remarketingFromName}
                  onChange={e => setAutoForm(prev => ({ ...prev, remarketingFromName: e.target.value }))}
                  placeholder={`Default: ${config?.fromName || 'Store Name'}`}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Broadcast From Email</label>
                <input
                  type="email"
                  value={autoForm.remarketingFromEmail}
                  onChange={e => setAutoForm(prev => ({ ...prev, remarketingFromEmail: e.target.value }))}
                  placeholder={`Default: ${config?.fromEmail || 'orders@store.com'}`}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              disabled={savingConfig}
              style={{
                padding: '9.5px 22px', borderRadius: 9, border: 'none',
                background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: savingConfig ? 'wait' : 'pointer', opacity: savingConfig ? 0.65 : 1,
              }}
            >
              {savingConfig ? 'Saving...' : 'Save Autopilot Settings'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
