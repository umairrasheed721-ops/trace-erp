import React, { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'

const DEFAULT_WA_TEMPLATES = {
  REMINDER: "Assalam-o-Alaikum {{customer_name}}, aapka {{store_name}} cart checkout par wapas aapka intezar kar raha hai. Kya aapko order complete karne mein koi dushwari pesh aa rahi hai?\n\nComplete link: {{checkout_url}}",
  DISCOUNT: "Assalam-o-Alaikum {{customer_name}}! Aap ke {{store_name}} cart par Special Discount activate kar diya gaya hai.\n\nComplete karne ke liye link par click karein: {{checkout_url}}",
  LINK: "Assalam-o-Alaikum {{customer_name}}, yeh aapke {{store_name}} order (Total {{total_price}}) ka direct checkout link hai: {{checkout_url}}",
  CUSTOM: "Assalam-o-Alaikum {{customer_name}}, aapka cart link: {{checkout_url}}"
}

export default function AbandonedCheckouts() {
  const { activeStoreId, activeStore, addToast } = useApp()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState({ stats: {}, checkouts: [] })
  const [activeTab, setActiveTab] = useState('TRUE_ABANDONED') // Default directly to True Abandoned for maximum ease!
  const [searchQuery, setSearchQuery] = useState('')
  const [datePreset, setDatePreset] = useState('LAST_30_DAYS')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  
  // Custom message template option
  const [msgTemplate, setMsgTemplate] = useState('REMINDER') // REMINDER | DISCOUNT | LINK | CUSTOM
  const [useWaWeb, setUseWaWeb] = useState(localStorage.getItem('trace_use_wa_web') === 'true')

  // WA Templates state
  const [waTemplates, setWaTemplates] = useState(() => {
    try {
      const saved = localStorage.getItem('trace_abandoned_wa_templates')
      return saved ? { ...DEFAULT_WA_TEMPLATES, ...JSON.parse(saved) } : DEFAULT_WA_TEMPLATES
    } catch (_) {
      return DEFAULT_WA_TEMPLATES
    }
  })
  const [showCustomizerModal, setShowCustomizerModal] = useState(false)
  const [selectedCheckoutForImages, setSelectedCheckoutForImages] = useState(null)
  const [editingKey, setEditingKey] = useState('REMINDER')
  const [editingText, setEditingText] = useState('')
  const textareaRef = useRef(null)

  // Dismissed/Handled checkouts set stored in localStorage
  const [dismissedIds, setDismissedIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('trace_dismissed_abandoned') || '[]')
    } catch (_) {
      return []
    }
  })

  // Toggle WA Web setting
  const toggleWaWeb = () => {
    const newVal = !useWaWeb
    setUseWaWeb(newVal)
    localStorage.setItem('trace_use_wa_web', String(newVal))
    addToast(`Switched to WhatsApp ${newVal ? 'Web' : 'App'}`, 'info')
  }

  // Dismiss a checkout (hide/mark handled)
  const handleDismiss = (id) => {
    const updated = Array.from(new Set([...dismissedIds, String(id)]))
    setDismissedIds(updated)
    localStorage.setItem('trace_dismissed_abandoned', JSON.stringify(updated))
    addToast('Marked as handled / dismissed', 'success')
  }

  // Restore a dismissed checkout
  const handleRestore = (id) => {
    const updated = dismissedIds.filter(dId => dId !== String(id))
    setDismissedIds(updated)
    localStorage.setItem('trace_dismissed_abandoned', JSON.stringify(updated))
    addToast('Restored to active list', 'info')
  }

  // Compute dates based on preset
  const handlePresetChange = (preset) => {
    setDatePreset(preset)
    const now = new Date()
    const formatDateStr = (d) => d.toISOString().split('T')[0]

    if (preset === 'TODAY') {
      const todayStr = formatDateStr(now)
      setStartDate(todayStr)
      setEndDate(todayStr)
    } else if (preset === 'YESTERDAY') {
      const y = new Date(now)
      y.setDate(y.getDate() - 1)
      const yStr = formatDateStr(y)
      setStartDate(yStr)
      setEndDate(yStr)
    } else if (preset === 'LAST_7_DAYS') {
      const past = new Date(now)
      past.setDate(past.getDate() - 7)
      setStartDate(formatDateStr(past))
      setEndDate(formatDateStr(now))
    } else if (preset === 'LAST_30_DAYS') {
      const past = new Date(now)
      past.setDate(past.getDate() - 30)
      setStartDate(formatDateStr(past))
      setEndDate(formatDateStr(now))
    } else if (preset === 'THIS_MONTH') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
      setStartDate(formatDateStr(firstDay))
      setEndDate(formatDateStr(now))
    } else if (preset === 'ALL_TIME') {
      setStartDate('')
      setEndDate('')
    }
  }

  // Initial mount: set preset
  useEffect(() => {
    handlePresetChange('LAST_30_DAYS')
  }, [])

  const fetchAbandoned = async () => {
    if (!activeStoreId) return
    setLoading(true)
    try {
      let url = `/api/abandoned?store_id=${activeStoreId}&limit=250`
      if (startDate) url += `&start_date=${encodeURIComponent(startDate)}`
      if (endDate) url += `&end_date=${encodeURIComponent(endDate)}`

      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch abandoned checkouts')
      const json = await res.json()
      setData({
        stats: json.stats || {},
        checkouts: Array.isArray(json.checkouts) ? json.checkouts : []
      })
    } catch (err) {
      addToast(err.message || 'Error loading abandoned checkouts', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAbandoned()
  }, [activeStoreId, startDate, endDate])

  const stats = data.stats || {}
  const allCheckouts = data.checkouts || []

  // Filter checkouts by active tab, dismissed state, & search query
  const filteredCheckouts = allCheckouts.filter(c => {
    // Dismissed filter (unless viewing ALL or DISMISSED)
    const isDismissed = dismissedIds.includes(String(c.id))
    if (activeTab === 'DISMISSED') return isDismissed
    if (isDismissed && activeTab !== 'ALL') return false

    // Tab filter
    if (activeTab === 'TRUE_ABANDONED' && c.reconciliation_status !== 'TRUE_ABANDONED') return false
    if (activeTab === 'RECOVERED' && c.reconciliation_status !== 'RECOVERED') return false
    if (activeTab === 'EXISTING_CUSTOMER' && c.reconciliation_status !== 'EXISTING_CUSTOMER') return false

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      const name = (c.customer_name || '').toLowerCase()
      const phone = (c.phone || '').toLowerCase()
      const email = (c.email || '').toLowerCase()
      const city = (c.city || '').toLowerCase()
      return name.includes(q) || phone.includes(q) || email.includes(q) || city.includes(q)
    }

    return true
  })

  // Format currency
  const formatRs = (amt) => `Rs ${Math.round(amt || 0).toLocaleString()}`

  // Format Date
  const formatDate = (dateStr) => {
    if (!dateStr) return '—'
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }

  // Helper to format live preview text
  const getPreviewText = (textKey, rawText) => {
    const templateText = rawText !== undefined ? rawText : (waTemplates[textKey] || DEFAULT_WA_TEMPLATES[textKey] || '')
    return templateText
      .replace(/\{\{customer_name\}\}/g, 'Ali Ahmed')
      .replace(/\{\{checkout_url\}\}/g, 'https://tracepk.com/checkouts/cn/c123456789')
      .replace(/\{\{total_price\}\}/g, 'Rs 3,500')
      .replace(/\{\{items_summary\}\}/g, '2 item(s)')
      .replace(/\{\{store_name\}\}/g, activeStore?.store_name || 'TRACE')
  }

  // Insert variable tag into editor at cursor position
  const insertVariable = (varName) => {
    const textToInsert = `{{${varName}}}`
    if (!textareaRef.current) {
      setEditingText(prev => prev + ` ${textToInsert}`)
      return
    }
    const start = textareaRef.current.selectionStart || 0
    const end = textareaRef.current.selectionEnd || 0
    const newText = editingText.substring(0, start) + textToInsert + editingText.substring(end)
    setEditingText(newText)
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + textToInsert.length
        textareaRef.current.focus()
      }
    }, 50)
  }

  // Save template to localStorage
  const saveTemplate = () => {
    const updated = { ...waTemplates, [editingKey]: editingText }
    setWaTemplates(updated)
    localStorage.setItem('trace_abandoned_wa_templates', JSON.stringify(updated))
    addToast('✅ WhatsApp template saved!', 'success')
  }

  // Reset template to default
  const resetTemplateToDefault = () => {
    const defaultText = DEFAULT_WA_TEMPLATES[editingKey] || ''
    setEditingText(defaultText)
    const updated = { ...waTemplates, [editingKey]: defaultText }
    setWaTemplates(updated)
    localStorage.setItem('trace_abandoned_wa_templates', JSON.stringify(updated))
    addToast('Reset to default template', 'info')
  }

  // Open WhatsApp with selected Template
  const handleWhatsApp = (c) => {
    const name = (c.customer_name || 'Customer').trim()
    const cleanPhone = (c.phone || '').replace(/\D/g, '').replace(/^0/, '92')
    if (!cleanPhone) {
      addToast('No phone number available for this customer', 'warning')
      return
    }

    const baseUrl = useWaWeb ? 'https://web.whatsapp.com/send' : 'whatsapp://send'
    const checkoutLink = c.abandoned_checkout_url || ''
    const formattedPrice = `Rs ${parseInt(c.total_price || 0).toLocaleString()}`
    const itemsSummary = `${c.line_items_count || 1} item(s)`
    const storeName = activeStore?.store_name || 'TRACE'

    let rawTemplate = waTemplates[msgTemplate] || DEFAULT_WA_TEMPLATES[msgTemplate] || DEFAULT_WA_TEMPLATES.REMINDER
    
    // Safely replace variables (Rule 24 compliant)
    const msg = rawTemplate
      .replace(/\{\{customer_name\}\}/g, name)
      .replace(/\{\{checkout_url\}\}/g, checkoutLink)
      .replace(/\{\{total_price\}\}/g, formattedPrice)
      .replace(/\{\{items_summary\}\}/g, itemsSummary)
      .replace(/\{\{store_name\}\}/g, storeName)

    window.open(`${baseUrl}?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`, '_blank')
  }

  // Copy Phone / Text helper
  const copyText = (text, label) => {
    if (!text) return
    navigator.clipboard.writeText(text)
    addToast(`Copied ${label}!`, 'success')
  }

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            🛒 Abandoned Checkouts
          </h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Reconciled Shopify checkouts. 1-click WhatsApp / Call, template presets, and zero-confusion matching.
          </p>
        </div>

        {/* Top Controls */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* WhatsApp Web Mode Toggle Button */}
          <button
            className="btn btn-secondary btn-sm"
            onClick={toggleWaWeb}
            title="Click to toggle between WhatsApp Web browser tab vs WhatsApp App"
            style={{
              height: 36,
              padding: '0 12px',
              fontSize: '0.8rem',
              fontWeight: 700,
              background: useWaWeb ? 'rgba(74, 222, 128, 0.15)' : 'var(--bg-surface)',
              color: useWaWeb ? '#4ade80' : 'var(--text-primary)',
              border: useWaWeb ? '1px solid rgba(74, 222, 128, 0.4)' : '1px solid var(--border)'
            }}
          >
            {useWaWeb ? '💻 WA Web' : '📱 WA App'}
          </button>

          {/* WhatsApp Message Template Preset */}
          <select
            value={msgTemplate}
            onChange={(e) => setMsgTemplate(e.target.value)}
            className="form-select"
            title="Choose template message for WhatsApp"
            style={{
              height: 36,
              fontSize: '0.8rem',
              padding: '0 10px',
              borderRadius: 8,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              fontWeight: 600
            }}
          >
            <option value="REMINDER">💬 Gentle Reminder</option>
            <option value="DISCOUNT">🏷️ 10% Discount Offer</option>
            <option value="LINK">🔗 Direct Cart Link</option>
            <option value="CUSTOM">⭐ Custom Template</option>
          </select>

          {/* WhatsApp Template Customizer Trigger Button */}
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setEditingKey(msgTemplate);
              setEditingText(waTemplates[msgTemplate] || DEFAULT_WA_TEMPLATES[msgTemplate] || '');
              setShowCustomizerModal(true);
            }}
            title="Customize WhatsApp message templates & variable placeholders"
            style={{
              height: 36,
              padding: '0 12px',
              fontSize: '0.8rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              borderRadius: 8,
              background: 'rgba(99, 102, 241, 0.12)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              color: 'var(--brand)'
            }}
          >
            <span>⚙️</span> Customize
          </button>

          {/* Date Filter Preset Dropdown */}
          <select
            value={datePreset}
            onChange={(e) => handlePresetChange(e.target.value)}
            className="form-select"
            style={{
              height: 36,
              fontSize: '0.8rem',
              padding: '0 10px',
              borderRadius: 8,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              fontWeight: 600
            }}
          >
            <option value="TODAY">📅 Today</option>
            <option value="YESTERDAY">📅 Yesterday</option>
            <option value="LAST_7_DAYS">📅 Last 7 Days</option>
            <option value="LAST_30_DAYS">📅 Last 30 Days (Default)</option>
            <option value="THIS_MONTH">📅 This Month</option>
            <option value="ALL_TIME">📅 All Time</option>
            <option value="CUSTOM">📅 Custom Range</option>
          </select>

          {/* Custom Date Inputs */}
          {datePreset === 'CUSTOM' && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="form-control"
                style={{ height: 36, fontSize: '0.8rem', padding: '0 8px', borderRadius: 8 }}
              />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="form-control"
                style={{ height: 36, fontSize: '0.8rem', padding: '0 8px', borderRadius: 8 }}
              />
            </div>
          )}

          <button
            className="btn btn-secondary btn-sm"
            onClick={fetchAbandoned}
            disabled={loading}
            style={{ height: 36, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {loading ? <span className="loading-spinner" /> : '🔄'} Refresh
          </button>
        </div>
      </div>

      {/* Stat Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 16,
        marginBottom: 24
      }}>
        <div className="stat-card" style={{ padding: 18, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 1 }}>
            Total Value (Abandoned)
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: 4 }}>
            {formatRs(stats.total_abandoned_value)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
            Unrecovered Value
          </div>
        </div>

        <div className="stat-card" style={{ padding: 18, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ fontSize: '0.72rem', color: '#f87171', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 1 }}>
            🔴 True Abandoned
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f87171', marginTop: 4 }}>
            {stats.true_abandoned || 0}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
            Needs Contact
          </div>
        </div>

        <div className="stat-card" style={{ padding: 18, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ fontSize: '0.72rem', color: '#4ade80', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 1 }}>
            🟢 Recovered / Placed
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#4ade80', marginTop: 4 }}>
            {stats.recovered || 0}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
            Order placed afterwards
          </div>
        </div>

        <div className="stat-card" style={{ padding: 18, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ fontSize: '0.72rem', color: '#fbbf24', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 1 }}>
            🟡 Existing Customers
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fbbf24', marginTop: 4 }}>
            {stats.existing_customer || 0}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
            Has previous orders
          </div>
        </div>

        <div className="stat-card" style={{ padding: 18, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--brand)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 1 }}>
            Recovery Rate
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--brand)', marginTop: 4 }}>
            {stats.recovery_rate_pct || 0}%
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
            Natural Conversion
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Control */}
      <div style={{
        display: 'flex',
        justify: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid var(--border)',
        marginBottom: 20,
        flexWrap: 'wrap',
        gap: 12
      }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {[
            { key: 'TRUE_ABANDONED', label: '🔴 True Abandoned (Actionable)', badge: stats.true_abandoned || 0 },
            { key: 'ALL', label: 'All Checkouts', badge: stats.total || 0 },
            { key: 'RECOVERED', label: '🟢 Recovered / Placed', badge: stats.recovered || 0 },
            { key: 'EXISTING_CUSTOMER', label: '🟡 Existing Customer', badge: stats.existing_customer || 0 },
            { key: 'DISMISSED', label: '🚫 Handled / Dismissed', badge: dismissedIds.length },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '12px 16px',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab.key ? '2px solid var(--brand)' : '2px solid transparent',
                color: activeTab === tab.key ? 'var(--brand)' : 'var(--text-secondary)',
                fontWeight: activeTab === tab.key ? 700 : 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: '0.85rem',
                transition: 'all 0.2s'
              }}
            >
              <span>{tab.label}</span>
              <span style={{
                fontSize: '0.72rem',
                background: activeTab === tab.key ? 'var(--brand)' : 'var(--bg-elevated)',
                color: activeTab === tab.key ? '#fff' : 'var(--text-muted)',
                padding: '2px 8px',
                borderRadius: 20,
                fontWeight: 600
              }}>
                {tab.badge}
              </span>
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div style={{ minWidth: 240 }}>
          <input
            type="text"
            placeholder="🔍 Search name, phone, email, city..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="form-control"
            style={{
              height: 36,
              fontSize: '0.8rem',
              padding: '0 12px',
              borderRadius: 8,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)'
            }}
          />
        </div>
      </div>

      {/* Main Table */}
      {loading ? (
        <div className="loading-overlay" style={{ padding: '60px 0', textAlign: 'center' }}>
          <span className="loading-spinner" /> Fetching and reconciling checkouts from Shopify...
        </div>
      ) : filteredCheckouts.length === 0 ? (
        <div className="empty-state" style={{ padding: '60px 0', textAlign: 'center' }}>
          <div className="empty-icon" style={{ fontSize: '2.5rem', marginBottom: 12 }}>🛒</div>
          <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>No Abandoned Checkouts Found</h3>
          <p style={{ color: 'var(--text-muted)', marginTop: 6, fontSize: '0.85rem' }}>
            No checkouts match the current tab filter or search query.
          </p>
        </div>
      ) : (
        <div className="table-wrapper" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '12px 16px' }}>Customer</th>
                <th style={{ padding: '12px 16px' }}>Contact Info</th>
                <th style={{ padding: '12px 16px' }}>Cart Items</th>
                <th style={{ padding: '12px 16px' }}>Total Price</th>
                <th style={{ padding: '12px 16px' }}>Reconciliation Status</th>
                <th style={{ padding: '12px 16px' }}>Abandoned Date</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Quick Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCheckouts.map(c => {
                const isRecovered = c.reconciliation_status === 'RECOVERED'
                const isExisting = c.reconciliation_status === 'EXISTING_CUSTOMER'
                const isDismissed = dismissedIds.includes(String(c.id))

                return (
                  <tr
                    key={c.id}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: isRecovered ? 'rgba(74, 222, 128, 0.03)' : isDismissed ? 'rgba(255, 255, 255, 0.02)' : 'transparent',
                      opacity: isDismissed ? 0.6 : 1
                    }}
                  >
                    {/* Customer Name & City */}
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                        {c.customer_name}
                      </div>
                      {c.city && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                          📍 {c.city}
                        </div>
                      )}
                    </td>

                    {/* Contact Info (Phone & Email) */}
                    <td style={{ padding: '12px 16px' }}>
                      {c.phone ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 600, color: 'var(--brand)' }}>
                            📞 {c.phone}
                          </span>
                          <button
                            onClick={() => copyText(c.phone, 'Phone number')}
                            title="Copy Phone Number"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '0.75rem', opacity: 0.7 }}
                          >
                            📋
                          </button>
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No Phone</div>
                      )}
                      {c.email ? (
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                          ✉️ {c.email}
                        </div>
                      ) : null}
                    </td>

                    {/* Cart Items */}
                    <td style={{ padding: '12px 16px', maxWidth: 260 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {/* Inline Product Image Thumbnails */}
                        <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                          {(c.line_items || []).slice(0, 3).map((item, idx) => (
                            item.image_url ? (
                              <img
                                key={idx}
                                src={item.image_url}
                                alt={item.title}
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: 6,
                                  objectFit: 'cover',
                                  border: '1px solid var(--border)',
                                  marginLeft: idx > 0 ? -8 : 0,
                                  boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                                  background: 'var(--bg-elevated)',
                                  cursor: 'pointer'
                                }}
                                onClick={() => setSelectedCheckoutForImages(c)}
                                title={`${item.title} - Click to view images`}
                              />
                            ) : (
                              <div
                                key={idx}
                                onClick={() => setSelectedCheckoutForImages(c)}
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: 6,
                                  background: 'var(--bg-elevated)',
                                  border: '1px solid var(--border)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '0.75rem',
                                  marginLeft: idx > 0 ? -8 : 0,
                                  cursor: 'pointer'
                                }}
                                title={`${item.title} - Click to view images`}
                              >
                                📦
                              </div>
                            )
                          ))}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={(c.line_items || []).map(i => `${i.title} (${i.variant_title}) x${i.quantity}`).join(', ')}>
                            {(c.line_items || []).map(i => i.title).join(', ') || 'Cart Items'}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              {c.items_count} item{c.items_count > 1 ? 's' : ''}
                            </span>
                            <button
                              onClick={() => setSelectedCheckoutForImages(c)}
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '1px 6px', fontSize: '0.68rem', borderRadius: 4, height: 20, display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 700 }}
                              title="View full product images & cart snapshot"
                            >
                              <span>📸</span> Images
                            </button>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Total Price */}
                    <td style={{ padding: '12px 16px', fontWeight: 700, fontSize: '0.85rem' }}>
                      {formatRs(c.total_price)}
                    </td>

                    {/* Reconciliation Status Badge */}
                    <td style={{ padding: '12px 16px' }}>
                      {isRecovered ? (
                        <div>
                          <span style={{
                            background: 'rgba(74, 222, 128, 0.15)',
                            color: '#4ade80',
                            border: '1px solid rgba(74, 222, 128, 0.3)',
                            padding: '4px 10px',
                            borderRadius: 20,
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          }}>
                            🟢 Order Placed
                          </span>
                          {c.matched_order?.ref_number && (
                            <div style={{ fontSize: '0.7rem', color: '#4ade80', marginTop: 4, fontWeight: 600 }}>
                              Ref: {c.matched_order.ref_number} ({c.matched_order.delivery_status})
                            </div>
                          )}
                        </div>
                      ) : isExisting ? (
                        <div>
                          <span style={{
                            background: 'rgba(251, 191, 36, 0.15)',
                            color: '#fbbf24',
                            border: '1px solid rgba(251, 191, 36, 0.3)',
                            padding: '4px 10px',
                            borderRadius: 20,
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          }}>
                            🟡 Existing Customer
                          </span>
                          {c.matched_order?.ref_number && (
                            <div style={{ fontSize: '0.7rem', color: '#fbbf24', marginTop: 4, fontWeight: 600 }}>
                              Previous Ref: {c.matched_order.ref_number}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span style={{
                          background: 'rgba(239, 68, 68, 0.15)',
                          color: '#f87171',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          padding: '4px 10px',
                          borderRadius: 20,
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4
                        }}>
                          🔴 True Abandoned
                        </span>
                      )}
                    </td>

                    {/* Abandoned Date */}
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      {formatDate(c.created_at)}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                        {/* WhatsApp Button */}
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleWhatsApp(c)}
                          disabled={isRecovered || !c.phone}
                          title={isRecovered ? 'Customer already placed an order - WhatsApp disabled' : 'Open WhatsApp Chat'}
                          style={{
                            padding: '4px 10px',
                            fontSize: '0.75rem',
                            opacity: isRecovered || !c.phone ? 0.4 : 1,
                            cursor: isRecovered || !c.phone ? 'not-allowed' : 'pointer'
                          }}
                        >
                          💬 WhatsApp
                        </button>

                        {/* Call Button */}
                        {c.phone ? (
                          <a
                            href={`tel:${c.phone}`}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '4px 10px', fontSize: '0.75rem', textDecoration: 'none' }}
                            title="Call Customer"
                          >
                            📞 Call
                          </a>
                        ) : null}

                        {/* Open Checkout Link */}
                        {c.abandoned_checkout_url ? (
                          <a
                            href={c.abandoned_checkout_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-primary btn-sm"
                            style={{ padding: '4px 10px', fontSize: '0.75rem', textDecoration: 'none' }}
                            title="Open Shopify Checkout Link"
                          >
                            🔗 Link
                          </a>
                        ) : null}

                        {/* Dismiss / Restore Button */}
                        {isDismissed ? (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleRestore(c.id)}
                            title="Restore checkout"
                            style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                          >
                            ↩️ Restore
                          </button>
                        ) : (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleDismiss(c.id)}
                            title="Mark as handled / dismiss"
                            style={{ padding: '4px 8px', fontSize: '0.72rem', opacity: 0.7 }}
                          >
                            ✕ Dismiss
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 💬 WHATSAPP TEMPLATE CUSTOMIZER MODAL */}
      {showCustomizerModal && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setShowCustomizerModal(false); }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 99999,
            display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)',
            animation: 'fadeIn 0.2s ease-out', padding: 20
          }}
        >
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 18,
            width: '100%', maxWidth: 780, maxHeight: '90vh', overflowY: 'auto', padding: 24,
            boxShadow: '0 25px 60px rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column', gap: 20
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12, background: 'rgba(34, 197, 94, 0.15)',
                  border: '1px solid rgba(34, 197, 94, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.3rem'
                }}>💬</div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    WhatsApp Template Customizer
                  </h3>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Customize cart recovery messages with dynamic placeholders & live preview
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowCustomizerModal(false)}
                className="btn btn-secondary btn-sm"
                style={{ padding: '6px 12px', borderRadius: 8, fontSize: '0.9rem' }}
              >
                ✕
              </button>
            </div>

            {/* Template Selector Tabs */}
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
              {[
                { key: 'REMINDER', label: '💬 Gentle Reminder' },
                { key: 'DISCOUNT', label: '🏷️ 10% Discount Offer' },
                { key: 'LINK', label: '🔗 Direct Cart Link' },
                { key: 'CUSTOM', label: '⭐ Custom Message' }
              ].map(t => (
                <button
                  key={t.key}
                  onClick={() => {
                    setEditingKey(t.key);
                    setEditingText(waTemplates[t.key] || DEFAULT_WA_TEMPLATES[t.key] || '');
                  }}
                  className="btn btn-sm"
                  style={{
                    padding: '8px 14px',
                    borderRadius: 10,
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    background: editingKey === t.key ? 'rgba(34, 197, 94, 0.2)' : 'var(--bg-elevated)',
                    border: editingKey === t.key ? '1px solid #22c55e' : '1px solid var(--border)',
                    color: editingKey === t.key ? '#22c55e' : 'var(--text-secondary)'
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Editor & Preview Split View */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Left Column: Variable Chips & Editor */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  Click to Insert Variables:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {[
                    { varName: 'customer_name', label: '👤 {{customer_name}}' },
                    { varName: 'checkout_url', label: '🔗 {{checkout_url}}' },
                    { varName: 'total_price', label: '💰 {{total_price}}' },
                    { varName: 'items_summary', label: '📦 {{items_summary}}' },
                    { varName: 'store_name', label: '🏬 {{store_name}}' }
                  ].map(v => (
                    <button
                      key={v.varName}
                      type="button"
                      onClick={() => insertVariable(v.varName)}
                      className="btn btn-secondary btn-sm"
                      style={{
                        padding: '4px 8px',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        borderRadius: 6,
                        background: 'rgba(99, 102, 241, 0.1)',
                        border: '1px solid rgba(99, 102, 241, 0.25)',
                        color: 'var(--brand)'
                      }}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>

                <textarea
                  ref={textareaRef}
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  placeholder="Type message template here..."
                  style={{
                    width: '100%',
                    height: 200,
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: 12,
                    fontSize: '0.85rem',
                    lineHeight: 1.5,
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    outline: 'none'
                  }}
                />

                <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                  <button
                    onClick={resetTemplateToDefault}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '0.75rem', padding: '6px 12px' }}
                  >
                    🔄 Reset Default
                  </button>
                  <button
                    onClick={saveTemplate}
                    className="btn btn-primary btn-sm"
                    style={{ fontSize: '0.75rem', padding: '6px 16px', background: '#22c55e', borderColor: '#22c55e' }}
                  >
                    💾 Save Template
                  </button>
                </div>
              </div>

              {/* Right Column: Simulated WhatsApp Mobile Chat Preview */}
              <div style={{
                background: '#0b141a',
                borderRadius: 14,
                border: '1px solid var(--border)',
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                backgroundImage: 'radial-gradient(rgba(255,255,255,0.03) 1px, transparent 0)',
                backgroundSize: '12px 12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#25d366', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem' }}>
                    💬
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#e9edef' }}>WhatsApp Live Preview</div>
                    <div style={{ fontSize: '0.68rem', color: '#8696a0' }}>Sample: Ali Ahmed (Rs 3,500)</div>
                  </div>
                </div>

                {/* WhatsApp Chat Bubble */}
                <div style={{
                  background: '#005c4b',
                  color: '#e9edef',
                  borderRadius: '12px 12px 0px 12px',
                  padding: 12,
                  fontSize: '0.8rem',
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
                  alignSelf: 'flex-end',
                  maxWidth: '92%'
                }}>
                  {getPreviewText(editingKey, editingText)}
                  <div style={{ fontSize: '0.62rem', color: 'rgba(233, 237, 239, 0.6)', textAlign: 'right', marginTop: 6 }}>
                    12:45 PM ✓✓
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🖼️ PRODUCT IMAGES & CART SNAPSHOT MODAL */}
      {selectedCheckoutForImages && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedCheckoutForImages(null); }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 99999,
            display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)',
            animation: 'fadeIn 0.2s ease-out', padding: 20
          }}
        >
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 18,
            width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', padding: 24,
            boxShadow: '0 25px 60px rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column', gap: 20
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12, background: 'rgba(99, 102, 241, 0.15)',
                  border: '1px solid rgba(99, 102, 241, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.3rem'
                }}>🖼️</div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    Cart Items & Product Images
                  </h3>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Customer: {selectedCheckoutForImages.customer_name} ({selectedCheckoutForImages.phone || 'No phone'})
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedCheckoutForImages(null)}
                className="btn btn-secondary btn-sm"
                style={{ padding: '6px 12px', borderRadius: 8, fontSize: '0.9rem' }}
              >
                ✕
              </button>
            </div>

            {/* Checkout Items List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {(selectedCheckoutForImages.line_items || []).map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    padding: 14,
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 14
                  }}
                >
                  {/* Product Image */}
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.title}
                      style={{
                        width: 80,
                        height: 80,
                        borderRadius: 10,
                        objectFit: 'cover',
                        border: '1px solid var(--border)',
                        background: '#fff',
                        boxShadow: '0 4px 10px rgba(0,0,0,0.2)'
                      }}
                    />
                  ) : (
                    <div style={{
                      width: 80,
                      height: 80,
                      borderRadius: 10,
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px dashed var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.8rem',
                      color: 'var(--text-muted)'
                    }}>
                      📦
                    </div>
                  )}

                  {/* Item Details */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {item.title}
                    </div>
                    {item.variant_title && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--brand)', fontWeight: 600, marginTop: 2 }}>
                        Variant: {item.variant_title}
                      </div>
                    )}
                    {item.sku && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        SKU: <span style={{ fontFamily: 'monospace' }}>{item.sku}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: '0.8rem', fontWeight: 600 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Qty: x{item.quantity}</span>
                      <span style={{ color: '#22c55e' }}>{formatRs(item.price)} each</span>
                    </div>
                  </div>

                  {/* Line Total */}
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Line Total</div>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>
                      {formatRs((item.price || 0) * (item.quantity || 1))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Total Footer & Actions */}
            <div style={{
              display: 'flex',
              justify: 'space-between',
              alignItems: 'center',
              borderTop: '1px solid var(--border)',
              paddingTop: 16
            }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Cart Total</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#22c55e' }}>
                  {formatRs(selectedCheckoutForImages.total_price)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => {
                    const text = (selectedCheckoutForImages.line_items || [])
                      .map(i => `• ${i.title} (${i.variant_title || 'Default'}) x${i.quantity} - Rs ${i.price}`)
                      .join('\n');
                    navigator.clipboard.writeText(`🛒 Cart Items for ${selectedCheckoutForImages.customer_name}:\n${text}\n\nTotal: ${formatRs(selectedCheckoutForImages.total_price)}`);
                    addToast('📋 Cart summary copied to clipboard!', 'success');
                  }}
                  className="btn btn-secondary btn-sm"
                >
                  📋 Copy Summary
                </button>
                <button
                  onClick={() => {
                    const checkout = selectedCheckoutForImages;
                    setSelectedCheckoutForImages(null);
                    handleWhatsApp(checkout);
                  }}
                  className="btn btn-primary btn-sm"
                  style={{ background: '#22c55e', borderColor: '#22c55e' }}
                >
                  💬 Send WhatsApp
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
