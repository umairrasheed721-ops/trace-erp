import React, { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'

export default function AdviceMonitor() {
  const { activeStoreId, addToast, setBadgeCounts } = useApp()

  // Primary Navigation Tab (4 Stages)
  const [activeTab, setActiveTab] = useState('advice_required')

  // Sub-filter for Stage 4 (Reattempts Active)
  const [reattemptOutcomeFilter, setReattemptOutcomeFilter] = useState('all')

  // Search & Courier Filter
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCourier, setSelectedCourier] = useState('all')

  // Data States
  const [adviceList, setAdviceList] = useState([])
  const [reattemptsData, setReattemptsData] = useState([])
  const [reattemptStats, setReattemptStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState({})

  // Courier Action Remarks Modal States
  const [actionModalOrder, setActionModalOrder] = useState(null)
  const [actionModalType, setActionModalType] = useState('Reattempt') // 'Reattempt' or 'Return'
  const [actionNote, setActionNote] = useState('')

  // Visual History Drawer Modal States
  const [historyOrder, setHistoryOrder] = useState(null)
  const [historyData, setHistoryData] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Toggle SLA Expired (>48h)
  const [showExpired, setShowExpired] = useState(false)

  // Load Data
  const loadData = () => {
    if (!activeStoreId) return
    setLoading(true)
    Promise.all([
      fetch(`/api/monitors/advice?store_id=${activeStoreId}`).then(res => res.json()),
      fetch(`/api/monitors/reattempts?store_id=${activeStoreId}`).then(res => res.json())
    ])
      .then(([adviceRes, reattemptsRes]) => {
        const adviceArray = Array.isArray(adviceRes) ? adviceRes : []
        setAdviceList(adviceArray)

        const reattemptsArray = Array.isArray(reattemptsRes) ? reattemptsRes : (reattemptsRes?.orders || [])
        setReattemptsData(reattemptsArray)
        setReattemptStats(reattemptsRes?.stats || null)

        // Count pending action orders for badge
        const totalPending = adviceArray.filter(o => o.advice_category === 'advice_required' || o.advice_category === 'immediate_return').length
        setBadgeCounts(prev => ({ ...prev, advice: totalPending }))

        setLoading(false)
      })
      .catch(() => {
        addToast('Failed to load Advice Monitor data', 'error')
        setLoading(false)
      })
  }

  useEffect(() => {
    loadData()
  }, [activeStoreId])

  // Open Action Remarks Modal
  const openActionModal = (order, type) => {
    setActionModalOrder(order)
    setActionModalType(type)
    setActionNote(type === 'Reattempt' ? 'Customer confirmed order - Please reattempt delivery' : 'Customer refused / Return confirmed')
  }

  // Submit Courier Action with Remarks
  const submitCourierAction = async () => {
    if (!actionModalOrder) return
    const order = actionModalOrder
    const action = actionModalType

    setActionLoading(prev => ({ ...prev, [order.id]: 'loading' }))
    try {
      const res = await fetch('/api/monitors/courier-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: activeStoreId,
          tracking_number: order.tracking_number,
          action,
          note: actionNote || ''
        })
      })
      const data = await res.json()
      if (data.success) {
        addToast(data.message || `✅ ${action} instruction sent to ${order.courier || 'Courier'} with remarks!`, 'success')
        setActionLoading(prev => ({ ...prev, [order.id]: 'done' }))
        loadData()
      } else {
        addToast(`❌ ${data.error || 'Action failed'}`, 'error')
        setActionLoading(prev => ({ ...prev, [order.id]: null }))
      }
    } catch {
      addToast('Network error while processing courier action', 'error')
      setActionLoading(prev => ({ ...prev, [order.id]: null }))
    } finally {
      setActionModalOrder(null)
      setActionNote('')
    }
  }

  // Blacklist / Ignore Order
  const handleIgnore = async (order) => {
    try {
      await fetch('/api/monitors/blacklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: activeStoreId, tracking_number: order.tracking_number })
      })
      addToast(`🚫 ${order.tracking_number} ignored from advice monitor`, 'info')
      loadData()
    } catch {
      addToast('Failed to ignore tracking number', 'error')
    }
  }

  // Visual History Drawer Modal
  const openTrackingHistory = async (order) => {
    setHistoryOrder(order)
    setHistoryData([])
    setHistoryLoading(true)
    try {
      const res = await fetch(`/api/monitors/tracking-history?store_id=${activeStoreId}&tracking_number=${order.tracking_number}`)
      const data = await res.json()
      if (data.success && Array.isArray(data.history)) {
        setHistoryData(data.history)
      } else {
        addToast('No tracking history available', 'info')
      }
    } catch {
      addToast('Failed to fetch tracking history', 'error')
    } finally {
      setHistoryLoading(false)
    }
  }

  // Pre-filled WhatsApp Links
  const getCustomerWaLink = (order) => {
    let phone = (order.phone || '').trim().replace(/[^0-9]/g, '')
    if (phone.startsWith('0')) phone = '92' + phone.substring(1)
    else if (phone.length === 10 && !phone.startsWith('92')) phone = '92' + phone

    let productText = order.product_titles || ''
    if (!productText && order.line_items) {
      try {
        const parsed = typeof order.line_items === 'string' ? JSON.parse(order.line_items) : order.line_items
        if (Array.isArray(parsed)) {
          productText = parsed.map(li => `${li.title || li.name} x${li.quantity || 1}`).join(', ')
        }
      } catch (_) {}
    }

    const priceText = parseInt(order.price || 0).toLocaleString()
    const fullAddress = [order.address, order.city].filter(Boolean).join(', ')

    const msg = `Assalam-o-Alaikum ${order.customer_name || 'Customer'},\n\nAap ke order ke hawale se delivery update ke liye contact kar rahe hain:\n📦 *Order / Tracking #:* ${order.tracking_number}${order.ref_number ? ` (Ref: #${order.ref_number})` : ''}\n🛍️ *Items:* ${productText || 'Product Items'}\n💰 *Total Amount (COD):* Rs ${priceText}\n📍 *Delivery Address:* ${fullAddress || 'N/A'}\n🚚 *Courier:* ${order.courier || 'PostEx'}\n\nKya aap is order ki delivery re-attempt confirm karna chahte hain? Please reply kar ke confirm kar dein taake hum courier ko instruction bhej sakein. Shukriya!`

    const useWeb = localStorage.getItem('trace_use_wa_web') === 'true'
    const baseUrl = useWeb ? 'https://web.whatsapp.com/send' : 'whatsapp://send'
    return `${baseUrl}?phone=${phone}&text=${encodeURIComponent(msg)}`
  }

  const getGroupWaLink = (order) => {
    const rawStatus = order.courier_status || order.delivery_status || 'Shipper Advice Required'
    const cleanNote = order.notes ? order.notes.replace(/Order has been shipped via [^.]+\.?/gi, '').replace(/\[Shipper Advice - [^\]]+\]/g, '').trim() : ''
    const msg = `📢 *SHIPPER ADVICE ALERT ~ TRACE ERP*\n📦 *Tracking:* ${order.tracking_number}\n🛍️ *Customer:* ${order.customer_name || 'N/A'} (${order.phone || 'N/A'})\n💬 *Status:* ${rawStatus}\n💰 *Price:* Rs ${parseInt(order.price || 0).toLocaleString()}\n🚚 *Courier:* ${order.courier || 'PostEx'}${cleanNote ? `\n📝 *Note:* ${cleanNote}` : ''}`
    const useWeb = localStorage.getItem('trace_use_wa_web') === 'true'
    const baseUrl = useWeb ? 'https://web.whatsapp.com/send' : 'whatsapp://send'
    return `${baseUrl}?text=${encodeURIComponent(msg)}`
  }

  // Filter by SLA (<48h)
  const filterBySla = (list) => {
    if (showExpired) return list
    return list.filter(o => {
      const rawDate = o.status_date || o.order_date
      if (!rawDate) return true
      try {
        const dateStr = rawDate.includes('T') ? rawDate : rawDate.replace(' ', 'T') + '+05:00'
        const parsedMs = Date.parse(dateStr)
        if (!isNaN(parsedMs)) {
          const elapsedHours = (Date.now() - parsedMs) / 3600000
          return elapsedHours <= 48
        }
      } catch (_) {}
      return true
    })
  }

  // Categorize Lists by Stage
  const adviceRequiredOrders = filterBySla(adviceList.filter(o => o.advice_category === 'advice_required'))
  const firstAttemptOrders = filterBySla(adviceList.filter(o => o.advice_category === 'first_attempt'))
  const immediateReturnOrders = filterBySla(adviceList.filter(o => o.advice_category === 'immediate_return'))

  // Select Current Tab Base Orders
  let baseOrders = []
  if (activeTab === 'advice_required') baseOrders = adviceRequiredOrders
  else if (activeTab === 'first_attempt') baseOrders = firstAttemptOrders
  else if (activeTab === 'immediate_return') baseOrders = immediateReturnOrders
  else if (activeTab === 'reattempts') {
    baseOrders = reattemptsData
    if (reattemptOutcomeFilter !== 'all') {
      baseOrders = baseOrders.filter(o => o.outcome === reattemptOutcomeFilter)
    }
  }

  // Apply Courier & Text Search Filter
  const displayOrders = baseOrders.filter(o => {
    if (selectedCourier !== 'all') {
      const c = (o.courier || 'postex').toLowerCase()
      if (!c.includes(selectedCourier.toLowerCase())) return false
    }
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      (o.tracking_number || '').toLowerCase().includes(q) ||
      (o.customer_name || '').toLowerCase().includes(q) ||
      (o.phone || '').toLowerCase().includes(q) ||
      (o.city || '').toLowerCase().includes(q)
    )
  })

  // Export CSV Dispute Sheet for Courier
  const exportDisputeSheet = () => {
    const rows = [
      ['Tracking Number', 'Customer Name', 'Phone', 'City', 'Courier', 'ERP Status', 'Courier Status', 'Notes', 'Price']
    ]
    displayOrders.forEach(o => {
      rows.push([
        `"${o.tracking_number || ''}"`,
        `"${(o.customer_name || '').replace(/"/g, '""')}"`,
        `"${o.phone || ''}"`,
        `"${o.city || ''}"`,
        `"${o.courier || ''}"`,
        `"${o.delivery_status || ''}"`,
        `"${o.courier_status || ''}"`,
        `"${(o.notes || '').replace(/"/g, '""')}"`,
        o.price || 0
      ])
    })
    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.join(',')).join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Shipper_Advice_Dispute_Sheet_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="advice-monitor-page" style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      
      {/* 🚀 Header Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
            🧠 Advice Monitor
          </h2>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Real-time Shipper Advice tracking, 1st attempt return alerts & reattempt disputes
          </span>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button 
            onClick={exportDisputeSheet} 
            className="btn btn-secondary btn-sm"
            style={{ borderRadius: 8, fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            📄 Export Dispute Sheet (.csv)
          </button>

          <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={showExpired} 
              onChange={e => setShowExpired(e.target.checked)} 
              style={{ borderRadius: 4 }}
            />
            Show Expired (&gt;48h)
          </label>

          <button 
            onClick={loadData} 
            className="btn btn-primary btn-sm" 
            disabled={loading}
            style={{ borderRadius: 8, fontSize: '0.78rem' }}
          >
            {loading ? '🔄 Refreshing...' : '🔄 Refresh'}
          </button>
        </div>
      </div>

      {/* 📊 Metric Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 15, marginBottom: 20 }}>
        
        {/* Card 1: Pending Advice Required */}
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
            🚨 Pending Advice Required
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: adviceRequiredOrders.length > 0 ? '#f97316' : 'var(--text-primary)' }}>
            {adviceRequiredOrders.length} <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>parcels</span>
          </div>
        </div>

        {/* Card 2: Total Active Reattempts */}
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
            🔄 Active Reattempts Tracked
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--brand)' }}>
            {reattemptStats?.total || reattemptsData.length} <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>sent</span>
          </div>
        </div>

        {/* Card 3: Advice Conversion Rate */}
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
            📈 Advice Conversion Rate
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--green)' }}>
            {reattemptStats?.successRate || 0}% <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>({reattemptStats?.deliveredCount || 0} Delivered)</span>
          </div>
        </div>

        {/* Card 4: Pending Courier (>24h) */}
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
            ⚠️ Pending Courier (&gt;24h)
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: (reattemptStats?.pendingCount || 0) > 0 ? '#ef4444' : 'var(--text-primary)' }}>
            {reattemptStats?.pendingCount || 0} <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>needs follow-up</span>
          </div>
        </div>

      </div>

      {/* 🔍 Search & Courier Controls */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <input 
          type="text" 
          placeholder="🔍 Search Tracking #, Customer Name, Phone, City..." 
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="input"
          style={{ flex: 1, borderRadius: 10, padding: '10px 16px', fontSize: '0.85rem' }}
        />
        <select 
          value={selectedCourier} 
          onChange={e => setSelectedCourier(e.target.value)}
          className="input"
          style={{ width: 180, borderRadius: 10, padding: '10px 14px', fontSize: '0.85rem' }}
        >
          <option value="all">🚚 All Couriers</option>
          <option value="postex">PostEx</option>
          <option value="instaworld">Instaworld</option>
          <option value="leopards">Leopards</option>
          <option value="lcs">M&P / LCS</option>
          <option value="tcs">TCS</option>
        </select>
      </div>

      {/* 🧭 Primary 4 Navigation Tabs */}
      <div style={{ display: 'flex', gap: 10, borderBottom: '2px solid var(--border)', paddingBottom: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        
        {/* Stage 1: Advice Required */}
        <button
          onClick={() => setActiveTab('advice_required')}
          className={`btn ${activeTab === 'advice_required' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ borderRadius: 10, padding: '8px 16px', fontSize: '0.82rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}
        >
          🚨 Shipper Advice Required ({adviceRequiredOrders.length})
        </button>

        {/* Stage 2: 1st Attempt Failed */}
        <button
          onClick={() => setActiveTab('first_attempt')}
          className={`btn ${activeTab === 'first_attempt' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ borderRadius: 10, padding: '8px 16px', fontSize: '0.82rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}
        >
          🔴 1st Attempt Failed ({firstAttemptOrders.length})
        </button>

        {/* Stage 3: Courier Auto-Return */}
        <button
          onClick={() => setActiveTab('immediate_return')}
          className={`btn ${activeTab === 'immediate_return' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ 
            borderRadius: 10, 
            padding: '8px 16px', 
            fontSize: '0.82rem', 
            fontWeight: 700, 
            display: 'flex', 
            alignItems: 'center', 
            gap: 8,
            background: activeTab === 'immediate_return' ? '#ef4444' : 'rgba(239, 68, 68, 0.1)',
            color: activeTab === 'immediate_return' ? '#fff' : '#ef4444',
            border: '1px solid rgba(239, 68, 68, 0.3)'
          }}
        >
          ⚡ 1st Attempt Immediate Return ({immediateReturnOrders.length})
        </button>

        {/* Stage 4: Reattempts Active & Disputes */}
        <button
          onClick={() => setActiveTab('reattempts')}
          className={`btn ${activeTab === 'reattempts' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ borderRadius: 10, padding: '8px 16px', fontSize: '0.82rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}
        >
          🔄 Reattempts Sent ({reattemptsData.length})
        </button>

      </div>

      {/* 🟢 Sub-Pills for Stage 4 (Active Reattempts) */}
      {activeTab === 'reattempts' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', background: 'rgba(255,255,255,0.02)', padding: 12, borderRadius: 12, border: '1px solid var(--border)' }}>
          <button
            onClick={() => setReattemptOutcomeFilter('all')}
            className={`btn btn-xs ${reattemptOutcomeFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: 16, padding: '4px 12px', fontSize: '0.75rem', fontWeight: 700 }}
          >
            All Reattempts ({reattemptsData.length})
          </button>
          
          <button
            onClick={() => setReattemptOutcomeFilter('return_initiated')}
            className={`btn btn-xs ${reattemptOutcomeFilter === 'return_initiated' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: 16, padding: '4px 12px', fontSize: '0.75rem', fontWeight: 700, background: reattemptOutcomeFilter === 'return_initiated' ? '#ef4444' : 'rgba(239, 68, 68, 0.15)', color: reattemptOutcomeFilter === 'return_initiated' ? '#fff' : '#ef4444' }}
          >
            🚨 Advice Ignored / Return Initiated ({reattemptStats?.returnInitiatedCount || 0})
          </button>

          <button
            onClick={() => setReattemptOutcomeFilter('cs_requested_return')}
            className={`btn btn-xs ${reattemptOutcomeFilter === 'cs_requested_return' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: 16, padding: '4px 12px', fontSize: '0.75rem', fontWeight: 700, background: reattemptOutcomeFilter === 'cs_requested_return' ? '#8b5cf6' : 'rgba(139, 92, 246, 0.15)', color: reattemptOutcomeFilter === 'cs_requested_return' ? '#fff' : '#8b5cf6' }}
          >
            📦 CS Confirmed Return ({reattemptStats?.csReturnCount || 0})
          </button>

          <button
            onClick={() => setReattemptOutcomeFilter('delivered_post_advice')}
            className={`btn btn-xs ${reattemptOutcomeFilter === 'delivered_post_advice' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: 16, padding: '4px 12px', fontSize: '0.75rem', fontWeight: 700, background: reattemptOutcomeFilter === 'delivered_post_advice' ? '#10b981' : 'rgba(16, 185, 129, 0.15)', color: reattemptOutcomeFilter === 'delivered_post_advice' ? '#fff' : '#10b981' }}
          >
            🟢 Delivered ({reattemptStats?.deliveredCount || 0})
          </button>

          <button
            onClick={() => setReattemptOutcomeFilter('out_for_reattempt')}
            className={`btn btn-xs ${reattemptOutcomeFilter === 'out_for_reattempt' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: 16, padding: '4px 12px', fontSize: '0.75rem', fontWeight: 700, background: reattemptOutcomeFilter === 'out_for_reattempt' ? '#3b82f6' : 'rgba(59, 130, 246, 0.15)', color: reattemptOutcomeFilter === 'out_for_reattempt' ? '#fff' : '#3b82f6' }}
          >
            🚚 In Progress ({reattemptStats?.outForReattemptCount || 0})
          </button>

          <button
            onClick={() => setReattemptOutcomeFilter('pending_courier_action')}
            className={`btn btn-xs ${reattemptOutcomeFilter === 'pending_courier_action' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: 16, padding: '4px 12px', fontSize: '0.75rem', fontWeight: 700, background: reattemptOutcomeFilter === 'pending_courier_action' ? '#f59e0b' : 'rgba(245, 158, 11, 0.15)', color: reattemptOutcomeFilter === 'pending_courier_action' ? '#fff' : '#f59e0b' }}
          >
            ⚠️ Pending Courier &gt;24h ({reattemptStats?.pendingCount || 0})
          </button>

          <button
            onClick={() => setReattemptOutcomeFilter('failed_rto')}
            className={`btn btn-xs ${reattemptOutcomeFilter === 'failed_rto' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: 16, padding: '4px 12px', fontSize: '0.75rem', fontWeight: 700, background: reattemptOutcomeFilter === 'failed_rto' ? '#6b7280' : 'rgba(107, 114, 128, 0.15)', color: reattemptOutcomeFilter === 'failed_rto' ? '#fff' : '#6b7280' }}
          >
            🔴 Returned ({reattemptStats?.failedCount || 0})
          </button>
        </div>
      )}

      {/* 📦 Main Data Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
          <span className="loading-spinner" style={{ width: 28, height: 28, marginBottom: 12 }}></span>
          <div>Loading Advice Monitor Orders...</div>
        </div>
      ) : displayOrders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 16 }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>✅</div>
          <h3 style={{ margin: '0 0 6px 0', fontSize: '1.1rem' }}>No Orders in This Stage</h3>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            All parcels in this category have been processed or moved to their next lifecycle stage.
          </span>
        </div>
      ) : (
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '12px 14px' }}>TRACKING #</th>
                  <th style={{ padding: '12px 14px' }}>CUSTOMER</th>
                  <th style={{ padding: '12px 14px' }}>ERP STATUS</th>
                  <th style={{ padding: '12px 14px' }}>COURIER RAW STATUS</th>
                  <th style={{ padding: '12px 14px' }}>ORDER NOTES</th>
                  <th style={{ padding: '12px 14px' }}>PRICE</th>
                  <th style={{ padding: '12px 14px' }}>PRODUCT</th>
                  <th style={{ padding: '12px 14px', textAlign: 'center' }}>COURIER ACTION</th>
                  <th style={{ padding: '12px 14px', textAlign: 'center' }}>SHARE</th>
                  <th style={{ padding: '12px 14px', textAlign: 'center' }}>IGNORE</th>
                </tr>
              </thead>
              <tbody>
                {displayOrders.map(order => {
                  const isActioning = actionLoading[order.id] === 'loading'
                  
                  // Product titles parsing
                  let productText = order.product_titles || ''
                  if (!productText && order.line_items) {
                    try {
                      const parsed = typeof order.line_items === 'string' ? JSON.parse(order.line_items) : order.line_items
                      if (Array.isArray(parsed)) {
                        productText = parsed.map(li => `${li.title || li.name} x${li.quantity || 1}`).join(', ')
                      }
                    } catch (_) {}
                  }

                  return (
                    <tr key={order.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }}>
                      
                      {/* Tracking & Ref */}
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--brand)' }}>
                        <div>{order.tracking_number}</div>
                        {order.ref_number && (
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                            Ref: #{order.ref_number}
                          </span>
                        )}
                      </td>

                      {/* Customer Info */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 700 }}>{order.customer_name || 'N/A'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>📞 {order.phone || 'N/A'}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', maxWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          📍 {order.city || 'N/A'}
                        </div>
                      </td>

                      {/* ERP Status Badge */}
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ 
                          padding: '3px 9px', 
                          borderRadius: 12, 
                          fontSize: '0.72rem', 
                          fontWeight: 700,
                          background: 'rgba(99,102,241,0.12)',
                          color: 'var(--brand)',
                          border: '1px solid rgba(99,102,241,0.3)',
                          display: 'inline-block',
                          marginBottom: 4
                        }}>
                          {order.delivery_status || 'Advice Needed'}
                        </span>
                        
                        {/* Stage 4 Outcome Sub-Badge */}
                        {order.outcomeLabel && (
                          <div>
                            <span style={{ 
                              padding: '2px 7px', 
                              borderRadius: 10, 
                              fontSize: '0.68rem', 
                              fontWeight: 700,
                              background: order.outcome === 'return_initiated' ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.06)',
                              color: order.outcome === 'return_initiated' ? '#ef4444' : 'var(--text-secondary)',
                              border: order.outcome === 'return_initiated' ? '1px solid rgba(239,68,68,0.4)' : '1px solid var(--border)'
                            }}>
                              {order.outcomeLabel}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Courier Raw Status & History Drawer Trigger */}
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ 
                          padding: '3px 8px', 
                          borderRadius: 8, 
                          fontSize: '0.73rem', 
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid var(--border)',
                          display: 'inline-block',
                          marginBottom: 4
                        }}>
                          {order.courier_status || 'N/A'}
                        </span>
                        <div>
                          <button
                            onClick={() => openTrackingHistory(order)}
                            className="btn btn-xs btn-secondary"
                            style={{ borderRadius: 6, fontSize: '0.68rem', padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          >
                            📜 History
                          </button>
                        </div>
                      </td>

                      {/* Order Notes */}
                      <td style={{ padding: '12px 14px', maxWidth: 160, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {order.notes ? (
                          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            📝 {order.notes.replace(/Order has been shipped via [^.]+\.?/gi, '').replace(/\[Shipper Advice - [^\]]+\]/g, '').trim() || 'Standard Note'}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>-</span>
                        )}
                      </td>

                      {/* Price */}
                      <td style={{ padding: '12px 14px', fontWeight: 800 }}>
                        Rs {parseInt(order.price || 0).toLocaleString()}
                      </td>

                      {/* Product Titles */}
                      <td style={{ padding: '12px 14px', maxWidth: 180, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={productText}>
                          🛍️ {productText || 'Product Item'}
                        </div>
                      </td>

                      {/* Courier Actions (Reattempt / Return) */}
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                          <button
                            onClick={() => openActionModal(order, 'Reattempt')}
                            disabled={isActioning}
                            className="btn btn-xs btn-primary"
                            style={{ borderRadius: 6, padding: '4px 8px', fontSize: '0.72rem', fontWeight: 700 }}
                          >
                            {isActioning ? '...' : '⚡ Reattempt'}
                          </button>

                          <button
                            onClick={() => openActionModal(order, 'Return')}
                            disabled={isActioning}
                            className="btn btn-xs"
                            style={{ borderRadius: 6, padding: '4px 8px', fontSize: '0.72rem', fontWeight: 700, background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)' }}
                          >
                            {isActioning ? '...' : '🔴 Stop Return'}
                          </button>
                        </div>
                      </td>

                      {/* Share WhatsApp Links */}
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                          <a
                            href={getCustomerWaLink(order)}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-xs btn-secondary"
                            style={{ borderRadius: 6, fontSize: '0.68rem', padding: '3px 6px', textDecoration: 'none' }}
                            title="Send WhatsApp message to customer"
                          >
                            📱 Customer
                          </a>

                          <a
                            href={getGroupWaLink(order)}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-xs btn-secondary"
                            style={{ borderRadius: 6, fontSize: '0.68rem', padding: '3px 6px', textDecoration: 'none' }}
                            title="Share Shipper Advice alert to team group"
                          >
                            📢 Group
                          </a>
                        </div>
                      </td>

                      {/* Blacklist / Ignore */}
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        <button
                          onClick={() => handleIgnore(order)}
                          className="btn btn-xs btn-secondary"
                          style={{ borderRadius: '50%', width: 26, height: 26, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                          title="Ignore parcel from Advice Monitor"
                        >
                          🚫
                        </button>
                      </td>

                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ⚡ Courier Action Remarks Modal (Sends Remarks to Courier Portal & Shopify Notes) */}
      {actionModalOrder && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 16, maxWidth: 520, width: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
            
            {/* Modal Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: actionModalType === 'Reattempt' ? 'var(--brand)' : '#ef4444' }}>
                  {actionModalType === 'Reattempt' ? '⚡ Send Reattempt Advice to Courier' : '🔴 Send Return / Stop Instruction'}
                </h3>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Tracking: <strong>{actionModalOrder.tracking_number}</strong> ({actionModalOrder.customer_name})
                </span>
              </div>
              <button 
                onClick={() => setActionModalOrder(null)} 
                className="btn btn-sm btn-secondary"
                style={{ borderRadius: '50%', width: 32, height: 32, padding: 0 }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: 20 }}>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
                Enter the remarks instruction below. This will be sent directly to <strong>{actionModalOrder.courier || 'PostEx'} API Portal</strong> and saved to <strong>Shopify Order Notes</strong>:
              </div>

              {/* Quick Template Chips */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                <button
                  type="button"
                  onClick={() => setActionNote('Customer confirmed order - Please reattempt delivery')}
                  className="btn btn-xs btn-secondary"
                  style={{ borderRadius: 12, fontSize: '0.72rem', padding: '3px 8px' }}
                >
                  ⚡ Customer confirmed
                </button>

                <button
                  type="button"
                  onClick={() => setActionNote('Call customer before delivery - Customer waiting')}
                  className="btn btn-xs btn-secondary"
                  style={{ borderRadius: 12, fontSize: '0.72rem', padding: '3px 8px' }}
                >
                  📞 Call before delivery
                </button>

                <button
                  type="button"
                  onClick={() => setActionNote('Address verified & confirmed by customer')}
                  className="btn btn-xs btn-secondary"
                  style={{ borderRadius: 12, fontSize: '0.72rem', padding: '3px 8px' }}
                >
                  📍 Address confirmed
                </button>
              </div>

              <textarea
                value={actionNote}
                onChange={e => setActionNote(e.target.value)}
                placeholder="Enter remarks for courier..."
                rows={4}
                className="input"
                style={{ width: '100%', borderRadius: 10, padding: 12, fontSize: '0.85rem', resize: 'vertical' }}
              />
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button 
                onClick={() => setActionModalOrder(null)} 
                className="btn btn-secondary btn-sm" 
                style={{ borderRadius: 8 }}
              >
                Cancel
              </button>

              <button 
                onClick={submitCourierAction} 
                className={`btn btn-sm ${actionModalType === 'Reattempt' ? 'btn-primary' : 'btn-danger'}`} 
                style={{ borderRadius: 8, fontWeight: 700, background: actionModalType === 'Return' ? '#ef4444' : undefined }}
              >
                🚀 Send to {actionModalOrder.courier || 'Courier'} & Sync Shopify
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 📜 Visual Milestone History Drawer Modal */}
      {historyOrder && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 16, maxWidth: 600, width: '100%', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
            
            {/* Modal Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>📜 Courier Milestone Timeline</h3>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Tracking: <strong style={{ color: 'var(--brand)' }}>{historyOrder.tracking_number}</strong> ({historyOrder.customer_name})
                </span>
              </div>
              <button 
                onClick={() => setHistoryOrder(null)} 
                className="btn btn-sm btn-secondary"
                style={{ borderRadius: '50%', width: 32, height: 32, padding: 0 }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
              {historyLoading ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  <span className="loading-spinner" style={{ width: 24, height: 24, marginBottom: 10 }}></span>
                  <div>Fetching live courier milestones...</div>
                </div>
              ) : historyData.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  No milestone history recorded for this parcel.
                </div>
              ) : (
                <div style={{ position: 'relative', paddingLeft: 20 }}>
                  <div style={{ position: 'absolute', top: 10, bottom: 10, left: 6, width: 2, background: 'var(--border)' }}></div>
                  {historyData.map((h, idx) => (
                    <div key={idx} style={{ position: 'relative', marginBottom: 16, paddingLeft: 16 }}>
                      <div style={{ position: 'absolute', left: -20, top: 4, width: 10, height: 10, borderRadius: '50%', background: idx === 0 ? 'var(--brand)' : 'var(--border)', border: '2px solid var(--bg-elevated)' }}></div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: idx === 0 ? 'var(--brand)' : 'var(--text-primary)' }}>
                        {h.message}
                      </div>
                      {h.dateTime && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                          🕒 {h.dateTime}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', textAlign: 'right' }}>
              <button onClick={() => setHistoryOrder(null)} className="btn btn-secondary btn-sm" style={{ borderRadius: 8 }}>
                Close
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  )
}
