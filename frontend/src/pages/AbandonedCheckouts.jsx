import React, { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'

export default function AbandonedCheckouts() {
  const { activeStoreId, addToast } = useApp()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState({ stats: {}, checkouts: [] })
  const [activeTab, setActiveTab] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [datePreset, setDatePreset] = useState('LAST_30_DAYS')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

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

  // Set default preset to LAST_30_DAYS on initial mount
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

  // Filter checkouts by active tab & search query
  const filteredCheckouts = allCheckouts.filter(c => {
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

  // Open WhatsApp
  const handleWhatsApp = (c) => {
    const name = (c.customer_name || 'Customer').trim()
    const cleanPhone = (c.phone || '').replace(/\D/g, '').replace(/^0/, '92')
    if (!cleanPhone) {
      addToast('No phone number available for this customer', 'warning')
      return
    }

    const useWaWeb = localStorage.getItem('trace_use_wa_web') === 'true'
    const baseUrl = useWaWeb ? 'https://web.whatsapp.com/send' : 'whatsapp://send'
    const msg = `Assalam-o-Alaikum ${name}, aapka TRACE cart checkout par wapas aapka intezar kar raha hai. Kya aapko order complete karne mein koi dushwari pesh aa rahi hai?`
    window.open(`${baseUrl}?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`, '_blank')
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
            Smart reconciled Shopify checkouts to prevent contacting customers who already placed an order.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
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
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 16,
        marginBottom: 24
      }}>
        <div className="stat-card" style={{ padding: 20, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 1 }}>
            Total Value (Abandoned)
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: 6 }}>
            {formatRs(stats.total_abandoned_value)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Unrecovered Checkouts Value
          </div>
        </div>

        <div className="stat-card" style={{ padding: 20, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ fontSize: '0.75rem', color: '#f87171', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 1 }}>
            🔴 True Abandoned
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f87171', marginTop: 6 }}>
            {stats.true_abandoned || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
            No order created yet (Needs Contact)
          </div>
        </div>

        <div className="stat-card" style={{ padding: 20, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ fontSize: '0.75rem', color: '#4ade80', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 1 }}>
            🟢 Recovered / Placed
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#4ade80', marginTop: 6 }}>
            {stats.recovered || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Order placed afterwards
          </div>
        </div>

        <div className="stat-card" style={{ padding: 20, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ fontSize: '0.75rem', color: '#fbbf24', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 1 }}>
            🟡 Existing Customers
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fbbf24', marginTop: 6 }}>
            {stats.existing_customer || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Has active/previous orders
          </div>
        </div>

        <div className="stat-card" style={{ padding: 20, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--brand)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 1 }}>
            Recovery Rate
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--brand)', marginTop: 6 }}>
            {stats.recovery_rate_pct || 0}%
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Natural Conversion Rate
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Control */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid var(--border)',
        marginBottom: 20,
        flexWrap: 'wrap',
        gap: 12
      }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { key: 'ALL', label: 'All Checkouts', badge: stats.total || 0 },
            { key: 'TRUE_ABANDONED', label: '🛒 True Abandoned', badge: stats.true_abandoned || 0 },
            { key: 'RECOVERED', label: '🟢 Recovered / Placed', badge: stats.recovered || 0 },
            { key: 'EXISTING_CUSTOMER', label: '🟡 Existing Customer', badge: stats.existing_customer || 0 },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '12px 18px',
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
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCheckouts.map(c => {
                const isRecovered = c.reconciliation_status === 'RECOVERED'
                const isExisting = c.reconciliation_status === 'EXISTING_CUSTOMER'

                return (
                  <tr
                    key={c.id}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: isRecovered ? 'rgba(74, 222, 128, 0.03)' : 'transparent'
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
                        <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 600, color: 'var(--brand)' }}>
                          📞 {c.phone}
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
                    <td style={{ padding: '12px 16px', maxWidth: 220 }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={(c.line_items || []).map(i => `${i.title} (${i.variant_title}) x${i.quantity}`).join(', ')}>
                        {(c.line_items || []).map(i => i.title).join(', ') || 'Cart Items'}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        {c.items_count} item{c.items_count > 1 ? 's' : ''}
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
                          title={isRecovered ? 'Customer already placed an order - WhatsApp disabled' : 'Open WhatsApp Manual Chat'}
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
  )
}
