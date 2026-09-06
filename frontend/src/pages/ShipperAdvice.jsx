import React, { useState, useEffect, useCallback } from 'react'
import { useApp } from '../context/AppContext'

// Helper: Parse note string into logical single-line blocks & filter out generic fulfillment logs
function parseNoteBlocks(notes) {
  if (!notes) return []
  
  // Split by newline (\n) or by bracketed boundaries like " | ["
  const lines = String(notes)
    .split(/\r?\n|\|\s*(?=\[)/)
    .map(l => l.trim())
    .filter(Boolean)

  const blocks = []

  lines.forEach(line => {
    // 🛡️ Filter out generic system shipping confirmation logs
    const isGenericShippingNote = /(?:confirm\s+)?order\s+has\s+been\s+shipped/i.test(line) ||
                                  /order\s+fulfilled/i.test(line) ||
                                  /fulfillment\s+created/i.test(line)
    if (isGenericShippingNote && !line.includes('[')) return

    // Replace any inner pipes '|' with ' • ' and clean up leading/trailing pipes/bullets
    const joinedLine = line
      .split('|')
      .map(s => s.trim())
      .filter(Boolean)
      .filter(s => !/(?:confirm\s+)?order\s+has\s+been\s+shipped/i.test(s) && !/order\s+fulfilled/i.test(s))
      .join(' • ')

    if (joinedLine) {
      blocks.push(joinedLine)
    }
  })

  return blocks
}

// Helper: Format raw date string into clean Pakistani ERP date format
function formatOrderDate(dateStr, includeTime = false) {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) {
      const parts = String(dateStr).split('T')[0].split('-')
      if (parts.length === 3) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        const mIdx = parseInt(parts[1], 10) - 1
        return `${parts[2]} ${months[mIdx] || parts[1]} ${parts[0]}`
      }
      return dateStr
    }
    const day = String(d.getDate()).padStart(2, '0')
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const month = months[d.getMonth()]
    const year = d.getFullYear()
    if (!includeTime) {
      return `${day} ${month} ${year}`
    }
    const hours = d.getHours()
    const minutes = String(d.getMinutes()).padStart(2, '0')
    const ampm = hours >= 12 ? 'PM' : 'AM'
    const formattedHours = hours % 12 || 12
    return `${day} ${month} ${year}, ${String(formattedHours).padStart(2, '0')}:${minutes} ${ampm}`
  } catch (_) {
    return dateStr
  }
}

export default function ShipperAdvice() {
  const { activeStoreId, addToast } = useApp()
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('advice_required')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCourier, setSelectedCourier] = useState('all')
  const [selectedMonth, setSelectedMonth] = useState('all')
  const [availableMonths, setAvailableMonths] = useState([{ value: 'all', label: '📅 All Active (Last 45 Days)' }])
  const [financialImpact, setFinancialImpact] = useState({ total_problem_parcels: 0, total_cod_at_risk: 0, total_ignored_parcels: 0 })

  const [adviceRequired, setAdviceRequired] = useState([])
  const [stuckParcels, setStuckParcels] = useState([])
  const [reattemptsSent, setReattemptsSent] = useState([])
  const [returnsRequested, setReturnsRequested] = useState([])
  const [historyList, setHistoryList] = useState([])
  const [historySubTab, setHistorySubTab] = useState('all') // 'all' | 'ignored' | 'pending' | 'resolved'
  const [counts, setCounts] = useState({ advice_required: 0, stuck_parcels: 0, reattempts_sent: 0, returns_requested: 0, history: 0, history_resolved: 0, history_ignored: 0, history_pending: 0, total: 0 })

  // Modal States
  const [reattemptModalOrder, setReattemptModalOrder] = useState(null)
  const [reattemptRemark, setReattemptRemark] = useState('')
  const [allowOpenParcel, setAllowOpenParcel] = useState(true)
  const [modalLoading, setModalLoading] = useState(false)

  const [imageModalOrder, setImageModalOrder] = useState(null)
  const [historyModalOrder, setHistoryModalOrder] = useState(null)
  const [liveHistory, setLiveHistory] = useState([])
  const [liveHistoryLoading, setLiveHistoryLoading] = useState(false)

  const openHistoryModal = async (order) => {
    setHistoryModalOrder(order)
    setLiveHistory([])
    setLiveHistoryLoading(true)
    try {
      const res = await fetch(`/api/shipper-advice/live-tracking-history?tracking_number=${encodeURIComponent(order.tracking_number)}&store_id=${activeStoreId}`)
      if (res.ok) {
        const data = await res.json()
        setLiveHistory(Array.isArray(data.tracking_history) ? data.tracking_history : [])
        if (data.courier_status) {
          setHistoryModalOrder(prev => ({ ...prev, courier_status: data.courier_status }))
        }
      }
    } catch (err) {
      console.error('Failed to fetch live tracking history:', err)
    } finally {
      setLiveHistoryLoading(false)
    }
  }

  // Fetch Shipper Advice Feed
  const fetchAdviceFeed = useCallback(async () => {
    if (!activeStoreId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/shipper-advice?store_id=${activeStoreId}&month=${selectedMonth}`)
      if (!res.ok) throw new Error('Failed to load Shipper Advice data')
      const data = await res.json()

      setAdviceRequired(data.advice_required || [])
      setStuckParcels(data.stuck_parcels || [])
      setReattemptsSent(data.reattempts_sent || [])
      setReturnsRequested(data.returns_requested || [])
      setHistoryList(data.history || [])
      if (Array.isArray(data.available_months) && data.available_months.length > 0) {
        setAvailableMonths(data.available_months)
      }
      if (data.financial_impact) {
        setFinancialImpact(data.financial_impact)
      }
      setCounts(data.counts || { advice_required: 0, stuck_parcels: 0, reattempts_sent: 0, returns_requested: 0, history: 0, total: 0 })
    } catch (err) {
      addToast(`❌ ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [activeStoreId, selectedMonth, addToast])

  useEffect(() => {
    fetchAdviceFeed()
  }, [fetchAdviceFeed])

  // Handle Reattempt Submit
  const handleReattemptSubmit = async () => {
    if (!reattemptModalOrder) return
    setModalLoading(true)
    try {
      const res = await fetch('/api/shipper-advice/reattempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: reattemptModalOrder.id,
          remarks: reattemptRemark
        })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        addToast(`⚡ Reattempt instruction logged for #${reattemptModalOrder.ref_number || reattemptModalOrder.tracking_number} & synced to Shopify!`, 'success')
        setReattemptModalOrder(null)
        setReattemptRemark('')
        fetchAdviceFeed()
      } else {
        addToast(`❌ ${data.error || 'Failed to submit reattempt'}`, 'error')
      }
    } catch {
      addToast('Network error while logging reattempt', 'error')
    } finally {
      setModalLoading(false)
    }
  }

  // Handle Return Submit
  const handleReturnSubmit = async (order) => {
    if (!window.confirm(`Mark Return Requested for ${order.ref_number || order.tracking_number}?`)) return
    try {
      const res = await fetch('/api/shipper-advice/return', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: order.id, reason: 'Return Requested by Merchant' })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        addToast(`↩️ Return requested for ${order.ref_number || order.tracking_number}!`, 'info')
        fetchAdviceFeed()
      }
    } catch {
      addToast('Failed to log return request', 'error')
    }
  }

  // Handle Ignore/Blacklist
  const handleIgnore = async (order) => {
    const identifier = order.ref_number || order.tracking_number || order.id
    if (!window.confirm(`Ignore order #${identifier} from Shipper Advice feed?`)) return
    try {
      const res = await fetch('/api/shipper-advice/ignore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tracking_number: order.tracking_number || null,
          ref_number: order.ref_number || null,
          order_id: order.id,
          store_id: activeStoreId
        })
      })
      if (res.ok) {
        addToast(`🙈 Order #${identifier} ignored from feed`, 'info')
        fetchAdviceFeed()
      } else {
        const data = await res.json()
        addToast(`❌ ${data.error || 'Failed to ignore order'}`, 'error')
      }
    } catch {
      addToast('Failed to ignore order', 'error')
    }
  }

  // Template Defaults & States
  const DEFAULT_CUSTOMER_TEMPLATE = `📢 *SHIPPER ADVICE ALERT ~ TRACE ERP*\n📦 *Order:* {order_ref}\n🚚 *Tracking:* {tracking}\n🛍️ *Customer:* {customer_name} ({phone})\n📍 *City:* {city}\n⚠️ *Courier Status:* {courier_status}\n💰 *Amount:* {price}`
  const DEFAULT_GROUP_TEMPLATE = `📦 *SHIPPER ADVICE / COURIER CS ESCALATION*\n🔖 *Order #:* {order_ref}\n🚚 *Courier:* {courier}\n🔢 *Tracking #:* {tracking}\n👤 *Customer:* {customer_name}\n📞 *Phone:* {phone}\n📍 *Address/City:* {address}\n💰 *COD Price:* {price}\n⚠️ *Courier Status:* {courier_status}\n📝 *Notes:* {notes}\n🛍️ *Items:* {items}\n\n🙏 Please assist in reattempting delivery at earliest. Thank you!`
  const DEFAULT_STUCK_TEMPLATE = `🚨 *STUCK PARCEL ESCALATION REPORT*\n🔖 *Order #:* {order_ref}\n🚚 *Courier:* {courier}\n🔢 *Tracking #:* {tracking}\n⏳ *Days Stuck:* {days_stuck} Days\n👤 *Customer:* {customer_name} ({phone})\n📍 *City/Address:* {address}\n💰 *COD Value:* {price}\n⚠️ *Last Courier Status:* {courier_status}\n📝 *Remarks:* {notes}\n🛍️ *Items:* {items}\n\n⚠️ *Urgent Action Requested:* This parcel has been stuck at hub for {days_stuck} days without movement. Please dispatch rider immediately or provide status update!`
  const DEFAULT_ESCALATE_TEMPLATE = `🔥 *URGENT COURIER ESCALATION ~ AREA MANAGER ALERT*\n🔖 *Order #:* {order_ref}\n🚚 *Courier:* {courier}\n🔢 *Tracking #:* {tracking}\n⏳ *Ignored Duration:* {days_since_action} Days ({hours_since_action} Hours)\n👤 *Customer:* {customer_name} ({phone})\n📍 *City:* {city}\n💰 *COD Price:* {price}\n⚠️ *Current Status:* {courier_status}\n📝 *Previous Merchant Action:* {notes}\n\n🚨 *ATTENTION AREA MANAGER:* Merchant submitted action {days_since_action} days ago, but courier has NOT processed delivery or status movement. Please investigate and clear immediately!`

  const [customerTemplate, setCustomerTemplate] = useState(() => localStorage.getItem('shipper_template_customer') || DEFAULT_CUSTOMER_TEMPLATE)
  const [groupTemplate, setGroupTemplate] = useState(() => localStorage.getItem('shipper_template_group') || DEFAULT_GROUP_TEMPLATE)
  const [stuckTemplate, setStuckTemplate] = useState(() => localStorage.getItem('shipper_template_stuck') || DEFAULT_STUCK_TEMPLATE)
  const [escalateTemplate, setEscalateTemplate] = useState(() => localStorage.getItem('shipper_template_escalate') || DEFAULT_ESCALATE_TEMPLATE)

  const [templateEditModalOpen, setTemplateEditModalOpen] = useState(false)
  const [activeTemplateTab, setActiveTemplateTab] = useState('customer') // 'customer' | 'group' | 'stuck' | 'escalate'

  // Extract latest status from tracking_history JSON (fallback to courier_status)
  // Keys match PostEx/Instaworld history format (same as liveHistory modal at line ~719)
  const getLatestCourierStatus = (order) => {
    if (order.tracking_history) {
      try {
        const hist = typeof order.tracking_history === 'string' ? JSON.parse(order.tracking_history) : order.tracking_history
        if (Array.isArray(hist) && hist.length > 0) {
          const last = hist[hist.length - 1]
          const status = last.transactionStatusMessage || last.statusMessage || last.message ||
                         last.transactionStatus || last.status || last.activity ||
                         last.description || last.Description || last.remarks || ''
          if (status) return status
        }
      } catch (_) {}
    }
    return order.courier_status || order.delivery_status || 'Delivery Under Review'
  }

  // Apply Template Interpolation
  const applyTemplate = (templateStr, order) => {
    if (!templateStr || !order) return ''
    const rawStatus = getLatestCourierStatus(order)
    const fullAddr = order.address ? `${order.address}, ${order.city || ''}` : (order.city || 'N/A')

    return templateStr
      .replace(/{order_ref}/g, order.ref_number || order.id || '')
      .replace(/{tracking}/g, order.tracking_number || '')
      .replace(/{courier}/g, order.courier || 'PostEx')
      .replace(/{customer_name}/g, order.customer_name || 'N/A')
      .replace(/{phone}/g, order.phone || 'N/A')
      .replace(/{city}/g, order.city || 'N/A')
      .replace(/{address}/g, fullAddr)
      .replace(/{price}/g, `Rs ${parseInt(order.price || 0).toLocaleString()}`)
      .replace(/{courier_status}/g, rawStatus)
      .replace(/{days_stuck}/g, order.days_stuck || 0)
      .replace(/{days_since_action}/g, order.days_since_action || order.days_stuck || 0)
      .replace(/{hours_since_action}/g, order.hours_since_action || 0)
      .replace(/{notes}/g, order.notes || 'None')
      .replace(/{items}/g, order.product_titles || 'N/A')
  }

  // Save Templates Handler
  const handleSaveTemplates = () => {
    localStorage.setItem('shipper_template_customer', customerTemplate)
    localStorage.setItem('shipper_template_group', groupTemplate)
    localStorage.setItem('shipper_template_stuck', stuckTemplate)
    localStorage.setItem('shipper_template_escalate', escalateTemplate)
    addToast('✅ Shipper Message Templates saved successfully!', 'success')
    setTemplateEditModalOpen(false)
  }

  // Reset Templates Handler
  const handleResetTemplates = () => {
    setCustomerTemplate(DEFAULT_CUSTOMER_TEMPLATE)
    setGroupTemplate(DEFAULT_GROUP_TEMPLATE)
    setStuckTemplate(DEFAULT_STUCK_TEMPLATE)
    setEscalateTemplate(DEFAULT_ESCALATE_TEMPLATE)
    localStorage.removeItem('shipper_template_customer')
    localStorage.removeItem('shipper_template_group')
    localStorage.removeItem('shipper_template_stuck')
    localStorage.removeItem('shipper_template_escalate')
    addToast('🔄 Message templates reset to default presets!', 'info')
  }

  // WhatsApp Alert Builder for Customer
  const triggerWhatsAppAlert = (order) => {
    const msg = applyTemplate(customerTemplate, order)
    const useWeb = localStorage.getItem('trace_use_wa_web') === 'true'
    const baseUrl = useWeb ? 'https://web.whatsapp.com/send' : 'whatsapp://send'
    const phoneClean = (order.phone || '').replace(/[^0-9]/g, '')
    const targetPhone = phoneClean.length === 11 && phoneClean.startsWith('0') ? `92${phoneClean.slice(1)}` : phoneClean
    window.open(`${baseUrl}?phone=${targetPhone}&text=${encodeURIComponent(msg)}`, '_blank')
  }

  // Share to Courier CS Support Group via WhatsApp (Group Search & Share)
  const triggerGroupShare = (order) => {
    const msg = applyTemplate(groupTemplate, order)
    const useWeb = localStorage.getItem('trace_use_wa_web') === 'true'
    const baseUrl = useWeb ? 'https://api.whatsapp.com/send' : 'whatsapp://send'
    window.open(`${baseUrl}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  // Report Stuck Parcel via WhatsApp (Group / Contact Search & Share) & sync to Shopify Note
  const triggerStuckShare = async (order) => {
    const msg = applyTemplate(stuckTemplate, order)
    const useWeb = localStorage.getItem('trace_use_wa_web') === 'true'
    const baseUrl = useWeb ? 'https://api.whatsapp.com/send' : 'whatsapp://send'
    window.open(`${baseUrl}?text=${encodeURIComponent(msg)}`, '_blank')

    try {
      const res = await fetch('/api/shipper-advice/stuck-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: order.id, remarks: 'Stuck Report Sent to Courier' })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        addToast(`📦 Stuck report logged for #${order.ref_number || order.tracking_number} & synced to Shopify!`, 'success')
        fetchAdviceFeed()
      }
    } catch (err) {
      console.error('Failed to log stuck report:', err)
    }
  }

  // Urgent Area Manager Escalation via WhatsApp & sync note to Shopify
  const triggerEscalateShare = async (order) => {
    const msg = applyTemplate(escalateTemplate, order)
    const useWeb = localStorage.getItem('trace_use_wa_web') === 'true'
    const baseUrl = useWeb ? 'https://api.whatsapp.com/send' : 'whatsapp://send'
    window.open(`${baseUrl}?text=${encodeURIComponent(msg)}`, '_blank')

    try {
      const res = await fetch('/api/shipper-advice/re-escalate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: order.id, remarks: `Ignored ${order.days_since_action || 1} Days - Escalated to Area Manager` })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        addToast(`🔥 Urgent Escalation logged for #${order.ref_number || order.tracking_number} & synced to Shopify!`, 'success')
        fetchAdviceFeed()
      }
    } catch (err) {
      console.error('Failed to log escalation:', err)
    }
  }

  // Dynamic Category Stage Metadata Helper
  const getOrderCategoryMeta = (order) => {
    const cat = order.stage_badge ? null : (order.advice_category || activeTab)
    if (order.stage_badge === '🚨 Advice Required' || cat === 'advice_required') {
      return { label: '🚨 Advice Required', color: '#fb923c', bg: 'rgba(249, 115, 22, 0.15)', border: 'rgba(249, 115, 22, 0.35)' }
    } else if (order.stage_badge === '📦 Stuck Parcel' || cat === 'stuck_parcels') {
      return { label: '📦 Stuck Parcel', color: '#c084fc', bg: 'rgba(168, 85, 247, 0.15)', border: 'rgba(168, 85, 247, 0.35)' }
    } else if (order.stage_badge === '🔄 Reattempt Sent' || cat === 'reattempts') {
      return { label: '🔄 Reattempt Sent', color: '#818cf8', bg: 'rgba(99, 102, 241, 0.15)', border: 'rgba(99, 102, 241, 0.35)' }
    } else if (order.stage_badge === '📦 Return Requested' || cat === 'returns') {
      return { label: '📦 Return Requested', color: '#f87171', bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.35)' }
    } else if (order.stage_badge === '📜 Actioned History' || cat === 'history') {
      return { label: '📜 Actioned History', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)', border: 'rgba(56, 189, 248, 0.35)' }
    }
    return { label: '📦 Shipper Advice', color: 'var(--brand)', bg: 'rgba(99, 102, 241, 0.15)', border: 'rgba(99, 102, 241, 0.35)' }
  }

  // Filter Logic: Global Cross-Stage Search across all tabs
  const allCategorizedOrders = [
    ...adviceRequired.map(o => ({ ...o, stage_badge: '🚨 Advice Required' })),
    ...stuckParcels.map(o => ({ ...o, stage_badge: '📦 Stuck Parcel' })),
    ...reattemptsSent.map(o => ({ ...o, stage_badge: '🔄 Reattempt Sent' })),
    ...returnsRequested.map(o => ({ ...o, stage_badge: '📦 Return Requested' })),
    ...historyList.map(o => ({ ...o, stage_badge: '📜 Actioned History' }))
  ]

  let baseOrders = []
  if (searchQuery.trim().length > 0) {
    baseOrders = allCategorizedOrders
  } else if (activeTab === 'advice_required') {
    baseOrders = adviceRequired
  } else if (activeTab === 'stuck_parcels') {
    baseOrders = stuckParcels
  } else if (activeTab === 'reattempts') {
    baseOrders = reattemptsSent
  } else if (activeTab === 'returns') {
    baseOrders = returnsRequested
  } else if (activeTab === 'history') {
    if (historySubTab === 'ignored') {
      baseOrders = historyList.filter(o => o.action_status === 'ignored')
    } else if (historySubTab === 'pending') {
      baseOrders = historyList.filter(o => o.action_status === 'pending')
    } else if (historySubTab === 'resolved') {
      baseOrders = historyList.filter(o => o.action_status === 'resolved')
    } else {
      baseOrders = historyList
    }
  }

  const displayOrders = baseOrders.filter(o => {
    if (selectedCourier !== 'all') {
      const c = (o.courier || 'postex').toLowerCase()
      if (!c.includes(selectedCourier.toLowerCase())) return false
    }
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase().trim()
    return (
      (o.tracking_number || '').toLowerCase().includes(q) ||
      (o.ref_number || '').toLowerCase().includes(q) ||
      `#${o.ref_number || ''}`.toLowerCase().includes(q) ||
      (o.customer_name || '').toLowerCase().includes(q) ||
      (o.phone || '').toLowerCase().includes(q) ||
      (o.city || '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="shipper-advice-page" style={{ padding: '24px', maxWidth: '1440px', margin: '0 auto' }}>
      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
            🧠 Shipper Advice Engine
            <span style={{ fontSize: '0.75rem', padding: '3px 9px', borderRadius: 12, background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
              ⚡ 100% ERP-Status Independent
            </span>
          </h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            Real-time courier problem feed directly from PostEx & courier APIs
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => setTemplateEditModalOpen(true)}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: 6, borderColor: 'rgba(168,85,247,0.4)', color: '#c084fc', fontWeight: 600 }}
          >
            ⚙️ Edit Shipper Messages
          </button>
          <button onClick={fetchAdviceFeed} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            🔄 Refresh Feed
          </button>
        </div>
      </div>

      {/* 💥 Monthly Courier Damage & Risk Impact Banner */}
      <div style={{
        padding: '18px 24px',
        borderRadius: 16,
        background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.12), rgba(168, 85, 247, 0.08))',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        marginBottom: 20,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16
      }}>
        <div style={{ flex: '1 1 300px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: '1.1rem' }}>💥</span>
            <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Monthly Courier Damage & Financial Impact
            </h4>
            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: 10, background: 'rgba(239,68,68,0.2)', color: '#f87171', fontWeight: 700 }}>
              {selectedMonth === 'all' ? 'Active 45 Days' : (availableMonths.find(m => m.value === selectedMonth)?.label || selectedMonth)}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Audit metrics to present to courier account managers for SLA compliance & penalty negotiation.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ textAlign: 'center', background: 'var(--bg-surface)', padding: '10px 16px', borderRadius: 12, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Affected Parcels</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#fb923c' }}>{financialImpact.total_problem_parcels || 0}</div>
          </div>

          <div style={{ textAlign: 'center', background: 'var(--bg-surface)', padding: '10px 16px', borderRadius: 12, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>COD at Risk</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#f87171' }}>Rs. {(financialImpact.total_cod_at_risk || 0).toLocaleString()}</div>
          </div>

          <div style={{ textAlign: 'center', background: 'var(--bg-surface)', padding: '10px 16px', borderRadius: 12, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Courier Ignored / SLA Failed</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#c084fc' }}>{financialImpact.total_ignored_parcels || 0}</div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={{ padding: 18, borderRadius: 16, background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.15), rgba(251, 146, 60, 0.05))', border: '1px solid rgba(249, 115, 22, 0.3)' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fb923c', textTransform: 'uppercase', marginBottom: 6 }}>🚨 Advice Required</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--text-primary)' }}>{counts.advice_required} <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>parcels</span></div>
        </div>

        <div style={{ padding: 18, borderRadius: 16, background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.15), rgba(192, 132, 252, 0.05))', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#c084fc', textTransform: 'uppercase', marginBottom: 6 }}>📦 Stuck Parcels (≥ 2 Days)</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--text-primary)' }}>{counts.stuck_parcels || 0} <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>parcels</span></div>
        </div>

        <div style={{ padding: 18, borderRadius: 16, background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.05))', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', marginBottom: 6 }}>🔄 Reattempts Sent</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--text-primary)' }}>{counts.reattempts_sent} <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>tracked</span></div>
        </div>

        <div style={{ padding: 18, borderRadius: 16, background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(248, 113, 113, 0.05))', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f87171', textTransform: 'uppercase', marginBottom: 6 }}>📦 Returns Requested</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--text-primary)' }}>{counts.returns_requested} <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>parcels</span></div>
        </div>
      </div>

      {/* Controls Bar: Search, Month Filter & Courier Filter */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 280, position: 'relative' }}>
          <input
            type="text"
            placeholder="🔍 Global Search by Tracking Number, Order #, Name, Phone, City..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              fontSize: '0.92rem'
            }}
          />
        </div>
        <select
          value={selectedMonth}
          onChange={e => setSelectedMonth(e.target.value)}
          style={{
            padding: '12px 16px',
            borderRadius: 12,
            border: '1px solid rgba(168, 85, 247, 0.4)',
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            fontSize: '0.9rem',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          {availableMonths.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <select
          value={selectedCourier}
          onChange={e => setSelectedCourier(e.target.value)}
          style={{
            padding: '12px 16px',
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            fontSize: '0.9rem',
            fontWeight: 600
          }}
        >
          <option value="all">🚚 All Couriers</option>
          <option value="postex">PostEx</option>
          <option value="trax">Trax</option>
          <option value="leopard">Leopards</option>
        </select>
      </div>

      {/* Category Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 12, flexWrap: 'wrap' }}>
        <button
          onClick={() => setActiveTab('advice_required')}
          className={`btn ${activeTab === 'advice_required' && !searchQuery.trim() ? 'btn-primary' : 'btn-secondary'}`}
          style={{ borderRadius: 20, padding: '8px 18px', fontWeight: 700 }}
        >
          🚨 Shipper Advice Required ({counts.advice_required})
        </button>
        <button
          onClick={() => setActiveTab('stuck_parcels')}
          className={`btn ${activeTab === 'stuck_parcels' && !searchQuery.trim() ? 'btn-primary' : 'btn-secondary'}`}
          style={{ borderRadius: 20, padding: '8px 18px', fontWeight: 700, color: activeTab === 'stuck_parcels' ? '#fff' : '#c084fc' }}
        >
          📦 Stuck Parcels ({counts.stuck_parcels || 0})
        </button>
        <button
          onClick={() => setActiveTab('reattempts')}
          className={`btn ${activeTab === 'reattempts' && !searchQuery.trim() ? 'btn-primary' : 'btn-secondary'}`}
          style={{ borderRadius: 20, padding: '8px 18px', fontWeight: 700 }}
        >
          🔄 Reattempts Sent ({counts.reattempts_sent})
        </button>
        <button
          onClick={() => setActiveTab('returns')}
          className={`btn ${activeTab === 'returns' && !searchQuery.trim() ? 'btn-primary' : 'btn-secondary'}`}
          style={{ borderRadius: 20, padding: '8px 18px', fontWeight: 700 }}
        >
          📦 Returns Requested ({counts.returns_requested})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`btn ${activeTab === 'history' && !searchQuery.trim() ? 'btn-primary' : 'btn-secondary'}`}
          style={{ borderRadius: 20, padding: '8px 18px', fontWeight: 700, color: activeTab === 'history' ? '#fff' : '#38bdf8' }}
        >
          📜 Actioned History ({counts.history || 0})
        </button>
      </div>

      {/* Actioned History Sub-Filters Bar */}
      {activeTab === 'history' && !searchQuery.trim() && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, background: 'rgba(255,255,255,0.02)', padding: 10, borderRadius: 12, border: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginRight: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            🎯 Sub-Filter:
          </span>
          <button
            onClick={() => setHistorySubTab('all')}
            className={`btn btn-xs ${historySubTab === 'all' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: 12, padding: '4px 12px', fontWeight: 700 }}
          >
            All Actioned ({counts.history || 0})
          </button>
          <button
            onClick={() => setHistorySubTab('ignored')}
            className={`btn btn-xs ${historySubTab === 'ignored' ? 'btn-primary' : 'btn-secondary'}`}
            style={{
              borderRadius: 12,
              padding: '4px 12px',
              fontWeight: 800,
              color: historySubTab === 'ignored' ? '#fff' : '#ef4444',
              borderColor: 'rgba(239, 68, 68, 0.4)',
              background: historySubTab === 'ignored' ? '#ef4444' : 'rgba(239, 68, 68, 0.1)'
            }}
          >
            🚨 Courier Ignored ({counts.history_ignored || 0})
          </button>
          <button
            onClick={() => setHistorySubTab('pending')}
            className={`btn btn-xs ${historySubTab === 'pending' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: 12, padding: '4px 12px', fontWeight: 700, color: historySubTab === 'pending' ? '#fff' : '#38bdf8' }}
          >
            ⏳ SLA Pending (&lt;24h) ({counts.history_pending || 0})
          </button>
          <button
            onClick={() => setHistorySubTab('resolved')}
            className={`btn btn-xs ${historySubTab === 'resolved' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: 12, padding: '4px 12px', fontWeight: 700, color: historySubTab === 'resolved' ? '#fff' : '#10b981' }}
          >
            ✅ Delivered / Resolved ({counts.history_resolved || 0})
          </button>
        </div>
      )}

      {/* Main Data Table */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>⚡ Loading Shipper Advice Feed...</div>
      ) : displayOrders.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', background: 'var(--bg-surface)', borderRadius: 16, border: '1px dashed var(--border)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>✅</div>
          <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>No Parcels in This Stage</h3>
          <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: '0.88rem' }}>All parcels have been actioned or no courier problem feed is active.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', background: 'var(--bg-surface)', borderRadius: 16, border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '14px 16px' }}>ORDER / PARCEL</th>
                <th style={{ padding: '14px 16px' }}>CUSTOMER</th>
                <th style={{ padding: '14px 16px' }}>PRODUCT DETAILS</th>
                <th style={{ padding: '14px 16px' }}>RAW COURIER REMARK</th>
                <th style={{ padding: '14px 16px' }}>PRICE</th>
                <th style={{ padding: '14px 16px', textAlign: 'right' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {displayOrders.map(order => (
                <tr key={order.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  {/* Order / Parcel Column */}
                  <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, color: 'var(--brand)', fontSize: '0.95rem' }}>
                        #{order.ref_number || order.id}
                      </span>
                      {(() => {
                        const meta = getOrderCategoryMeta(order)
                        return (
                          <span style={{
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            padding: '2px 7px',
                            borderRadius: 6,
                            color: meta.color,
                            background: meta.bg,
                            border: `1px solid ${meta.border}`,
                            whiteSpace: 'nowrap'
                          }}>
                            {meta.label}
                          </span>
                        )
                      })()}
                    </div>
                    <div style={{ fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--text-primary)', marginTop: 2 }}>
                      {order.tracking_number}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span>{order.courier || 'PostEx'}</span>
                      {order.order_date && (
                        <span style={{
                          padding: '1px 6px',
                          borderRadius: 6,
                          background: 'rgba(255, 255, 255, 0.06)',
                          color: 'var(--text-secondary)',
                          border: '1px solid var(--border)',
                          fontSize: '0.71rem',
                          fontWeight: 600
                        }} title="Order Placement Date">
                          📅 {formatOrderDate(order.order_date)}
                        </span>
                      )}
                    </div>
                    {order.line_items_parsed && order.line_items_parsed.length > 0 && (
                      <button
                        onClick={() => setImageModalOrder(order)}
                        className="btn btn-xs btn-secondary"
                        style={{ marginTop: 8, padding: '3px 8px', borderRadius: 8, fontSize: '0.72rem' }}
                      >
                        🖼️ View Images ({order.line_items_parsed.length})
                      </button>
                    )}
                  </td>

                  {/* Customer Column */}
                  <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{order.customer_name || 'N/A'}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--brand)', marginTop: 2 }}>{order.phone || 'N/A'}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>📍 {order.city || 'N/A'}</div>
                  </td>

                  {/* Product Details Column */}
                  <td style={{ padding: '14px 16px', verticalAlign: 'top', maxWidth: 260 }}>
                    <div style={{ fontSize: '0.84rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>
                      {order.product_titles || 'N/A'}
                    </div>
                  </td>

                  {/* Raw Courier Remark Column */}
                  <td style={{ padding: '14px 16px', verticalAlign: 'top', minWidth: 260, maxWidth: 380, whiteSpace: 'normal' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: 8,
                        background: 'rgba(249, 115, 22, 0.15)',
                        color: '#fb923c',
                        border: '1px solid rgba(249, 115, 22, 0.3)',
                        fontSize: '0.78rem',
                        fontWeight: 700
                      }}>
                        ⚠️ {getLatestCourierStatus(order)}
                      </span>
                      {order.status_date && (
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: 8,
                          background: 'rgba(168, 85, 247, 0.12)',
                          color: '#c084fc',
                          border: '1px solid rgba(168, 85, 247, 0.3)',
                          fontSize: '0.73rem',
                          fontWeight: 700
                        }} title="Last Courier Status Scan/Update Date">
                          🕒 {formatOrderDate(order.status_date, true)}
                        </span>
                      )}
                      {order.action_status === 'ignored' && (
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: 8,
                          background: 'rgba(239, 68, 68, 0.2)',
                          color: '#ef4444',
                          border: '1px solid rgba(239, 68, 68, 0.4)',
                          fontSize: '0.74rem',
                          fontWeight: 800
                        }} title="Merchant took action >= 24h ago but courier has zero status movement or delivery">
                          🚨 Courier Ignored ({order.days_since_action} Days)
                        </span>
                      )}
                      {order.action_status === 'resolved' && (
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: 8,
                          background: 'rgba(16, 185, 129, 0.15)',
                          color: '#10b981',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          fontSize: '0.74rem',
                          fontWeight: 700
                        }}>
                          ✅ Delivered / Resolved
                        </span>
                      )}
                      {order.action_status === 'pending' && activeTab === 'history' && (
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: 8,
                          background: 'rgba(56, 189, 248, 0.15)',
                          color: '#38bdf8',
                          border: '1px solid rgba(56, 189, 248, 0.3)',
                          fontSize: '0.74rem',
                          fontWeight: 700
                        }}>
                          ⏳ SLA Pending (&lt;24h)
                        </span>
                      )}
                      {order.days_stuck >= 2 && activeTab !== 'history' && (
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: 8,
                          background: 'rgba(239, 68, 68, 0.15)',
                          color: '#f87171',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          fontSize: '0.72rem',
                          fontWeight: 700
                        }} title="No status update movement from courier for >= 2 days">
                          ⏳ Stuck {order.days_stuck} Days
                        </span>
                      )}
                    </div>
                    {order.notes && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                        {parseNoteBlocks(order.notes).map((noteSeg, idx) => (
                          <div
                            key={idx}
                            style={{
                              fontSize: '0.78rem',
                              color: 'var(--text-primary)',
                              background: 'var(--bg-elevated)',
                              border: '1px solid var(--border)',
                              padding: '6px 10px',
                              borderRadius: 8,
                              lineHeight: 1.45,
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                            }}
                          >
                            📝 <span style={{ fontWeight: 600 }}>{noteSeg}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>

                  {/* Price Column */}
                  <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                    <div style={{ fontWeight: 800, color: '#10b981' }}>
                      Rs {parseInt(order.price || 0).toLocaleString()}
                    </div>
                  </td>

                  {/* Actions Column */}
                  <td style={{ padding: '14px 16px', verticalAlign: 'top', textAlign: 'right' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end', minWidth: 200 }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => openHistoryModal(order)}
                          className="btn btn-sm btn-secondary"
                          style={{
                            padding: '6px 12px',
                            borderRadius: 8,
                            fontSize: '0.76rem',
                            fontWeight: 700,
                            color: 'var(--brand)',
                            borderColor: 'rgba(99,102,241,0.3)',
                            background: 'rgba(99,102,241,0.08)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                          title="Live fetch real-time courier status history log"
                        >
                          📜 History Log
                        </button>
                        <button
                          onClick={() => {
                            setReattemptModalOrder(order)
                            setReattemptRemark('Customer requested reattempt')
                          }}
                          className="btn btn-sm btn-primary"
                          style={{ padding: '6px 14px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          ⚡ Reattempt
                        </button>
                      </div>

                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {(order.action_status === 'ignored' || activeTab === 'history') && (
                          <button
                            onClick={() => triggerEscalateShare(order)}
                            className="btn btn-xs btn-secondary"
                            style={{ padding: '4px 8px', borderRadius: 6, fontSize: '0.72rem', color: '#ef4444', fontWeight: 800, borderColor: 'rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.12)' }}
                            title="Send Urgent Escalation Report to Courier Area Manager on WhatsApp & log note to Shopify Admin"
                          >
                            🔥 Re-Escalate
                          </button>
                        )}
                        <button
                          onClick={() => triggerWhatsAppAlert(order)}
                          className="btn btn-xs btn-secondary"
                          style={{ padding: '4px 8px', borderRadius: 6, fontSize: '0.72rem', color: '#25D366', fontWeight: 700 }}
                          title="Direct WhatsApp alert to customer phone number"
                        >
                          💬 WA Alert
                        </button>
                        <button
                          onClick={() => triggerGroupShare(order)}
                          className="btn btn-xs btn-secondary"
                          style={{ padding: '4px 8px', borderRadius: 6, fontSize: '0.72rem', color: '#38bdf8', fontWeight: 700 }}
                          title="Share full order & reattempt details to Courier CS Support Group on WhatsApp"
                        >
                          👥 Group
                        </button>
                        <button
                          onClick={() => triggerStuckShare(order)}
                          className="btn btn-xs btn-secondary"
                          style={{ padding: '4px 8px', borderRadius: 6, fontSize: '0.72rem', color: '#f59e0b', fontWeight: 700 }}
                          title="Share stuck parcel escalation report to WhatsApp"
                        >
                          📦 Report Stuck
                        </button>
                        <button
                          onClick={() => handleReturnSubmit(order)}
                          className="btn btn-xs btn-secondary"
                          style={{ padding: '4px 8px', borderRadius: 6, fontSize: '0.72rem', color: '#f87171', fontWeight: 700 }}
                          title="Request Return"
                        >
                          ↩️ Return
                        </button>
                        <button
                          onClick={() => handleIgnore(order)}
                          className="btn btn-xs btn-secondary"
                          style={{ padding: '4px 8px', borderRadius: 6, fontSize: '0.72rem', color: 'var(--text-muted)' }}
                          title="Hide parcel from feed"
                        >
                          🙈
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Reattempt Action Modal */}
      {reattemptModalOrder && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 500, padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '1.2rem', color: 'var(--text-primary)' }}>
              ⚡ Log Reattempt Instruction for #{reattemptModalOrder.ref_number || reattemptModalOrder.id}
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Tracking: {reattemptModalOrder.tracking_number} | Customer: {reattemptModalOrder.customer_name} ({reattemptModalOrder.phone})
            </p>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>
                REATTEMPT REMARK FOR COURIER RIDER:
              </label>
              <textarea
                rows={3}
                value={reattemptRemark}
                onChange={e => setReattemptRemark(e.target.value)}
                placeholder="e.g. Customer was out of city, reattempt on Thursday. Call before delivery."
                style={{ width: '100%', padding: '10px', borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '0.88rem' }}
              />
            </div>



            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setReattemptModalOrder(null)} className="btn btn-secondary">
                Cancel
              </button>
              <button onClick={handleReattemptSubmit} disabled={modalLoading} className="btn btn-primary" style={{ fontWeight: 700 }}>
                {modalLoading ? '⌛ Sending...' : 'Submit Reattempt Instruction →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Images Lightbox Modal */}
      {imageModalOrder && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 700, padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>
                🖼️ Product Images: Order #{imageModalOrder.ref_number || imageModalOrder.id}
              </h3>
              <button onClick={() => setImageModalOrder(null)} className="btn btn-secondary btn-sm">✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, maxHeight: '70vh', overflowY: 'auto' }}>
              {imageModalOrder.line_items_parsed.map((item, idx) => (
                <div key={idx} style={{ background: 'var(--bg-surface)', padding: 12, borderRadius: 12, border: '1px solid var(--border)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  {item.image ? (
                    <a href={item.image} target="_blank" rel="noopener noreferrer" title="Click to view full image in new tab" style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 6, marginBottom: 8 }}>
                      <img src={item.image} alt={item.title} style={{ maxWidth: '100%', maxHeight: 260, objectFit: 'contain', borderRadius: 6 }} />
                    </a>
                  ) : (
                    <div style={{ width: '100%', height: 160, background: 'rgba(255,255,255,0.05)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', marginBottom: 8 }}>🛍️</div>
                  )}
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{item.title || item.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Qty: {item.quantity || 1}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Order Journey & Live Status History Log Modal */}
      {historyModalOrder && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 650, padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
              <div>
                <h3 style={{ margin: '0 0 4px', color: 'var(--text-primary)', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  📜 Order Journey: #{historyModalOrder.ref_number || historyModalOrder.id}
                </h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Tracking: <code style={{ color: 'var(--brand)', fontWeight: 700 }}>{historyModalOrder.tracking_number}</code> ({historyModalOrder.courier || 'Courier'}) | Customer: <b>{historyModalOrder.customer_name}</b> ({historyModalOrder.phone})
                </div>
              </div>
              <button onClick={() => setHistoryModalOrder(null)} className="btn btn-secondary btn-sm">✕</button>
            </div>

            {/* Status Timeline Feed */}
            <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 6 }}>
              {/* Current Status Header Card */}
              <div style={{ background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.25)', borderRadius: 12, padding: 14, marginBottom: 16 }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
                  CURRENT LIVE COURIER REMARK (API)
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {historyModalOrder.courier_status || historyModalOrder.delivery_status || 'In Transit'}
                </div>
                {historyModalOrder.notes && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 8, background: 'var(--bg-surface)', padding: 8, borderRadius: 6, border: '1px solid var(--border)' }}>
                    <b>System Notes:</b> {historyModalOrder.notes}
                  </div>
                )}
              </div>

              {/* Real-time Live Tracking Timeline */}
              {liveHistoryLoading ? (
                <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  <span className="loading-spinner" style={{ marginRight: 8 }} /> Live fetching tracking logs directly from courier API...
                </div>
              ) : liveHistory.length === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center', opacity: 0.7, fontSize: '0.88rem' }}>
                  ℹ️ No granular tracking logs returned by courier API for parcel <b>{historyModalOrder.tracking_number}</b>.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'relative', paddingLeft: 14 }}>
                  <div style={{ position: 'absolute', top: 10, bottom: 10, left: 4, width: 2, background: 'var(--border)' }} />
                  {liveHistory.map((ev, i) => {
                    const titleText = ev.transactionStatusMessage || ev.statusMessage || ev.message || ev.transactionStatus || ev.status || ev.activity || 'Courier Remark';
                    const rawTime = ev.transactionStatusDate || ev.statusDate || ev.entryDate || ev.createdDate || ev.transactionDate || ev.dateTime || ev.date || ev.timestamp || ev.time || ev.createdAt || ev.updatedAt || '';
                    
                    let timeText = '';
                    if (rawTime) {
                      try {
                        const str = String(rawTime).trim();
                        const ddmmyyyyRegex = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i;
                        const match = str.match(ddmmyyyyRegex);
                        let d = null;
                        if (match) {
                          let [, day, month, year, hours, minutes, seconds, ampm] = match;
                          let hrs = hours ? parseInt(hours, 10) : 0;
                          if (ampm) {
                            const isPm = ampm.toUpperCase() === 'PM';
                            if (isPm && hrs < 12) hrs += 12;
                            if (!isPm && hrs === 12) hrs = 0;
                          }
                          d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10), hrs, minutes ? parseInt(minutes, 10) : 0, seconds ? parseInt(seconds, 10) : 0);
                        }
                        if (!d || isNaN(d.getTime())) {
                          d = new Date(str);
                        }

                        if (d && !isNaN(d.getTime())) {
                          timeText = d.toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true
                          });
                        } else {
                          timeText = String(rawTime);
                        }
                      } catch (_) {
                        timeText = String(rawTime);
                      }
                    }

                    const descText = [ev.remarks, ev.comment, ev.city, ev.location].filter(Boolean).join(' • ');

                    return (
                      <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', position: 'relative' }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: i === 0 ? 'var(--brand)' : 'var(--text-muted)', marginTop: 4, flexShrink: 0, zIndex: 1 }} />
                        <div style={{ flex: 1, background: 'var(--bg-surface)', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 12 }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                              {titleText}
                            </span>
                            <span style={{ fontSize: '0.72rem', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 6, color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap', border: '1px solid rgba(255,255,255,0.08)' }}>
                              {timeText || 'Date N/A'}
                            </span>
                          </div>
                          {descText && (
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                              {descText}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Shipper Message Templates Modal */}
      {templateEditModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 18, width: '100%', maxWidth: 780, padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  📝 Edit Shipper Message Templates
                </h3>
                <p style={{ margin: '3px 0 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  Customize message templates for Customer Alert, CS Group Escalation, and Stuck Parcel Reports.
                </p>
              </div>
              <button onClick={() => setTemplateEditModalOpen(false)} className="btn btn-secondary btn-sm">✕</button>
            </div>

            {/* Template Type Tabs */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 10, flexWrap: 'wrap' }}>
              <button
                onClick={() => setActiveTemplateTab('customer')}
                className={`btn btn-sm ${activeTemplateTab === 'customer' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ borderRadius: 10, fontWeight: 700, padding: '6px 14px' }}
              >
                💬 Customer WA Alert
              </button>
              <button
                onClick={() => setActiveTemplateTab('group')}
                className={`btn btn-sm ${activeTemplateTab === 'group' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ borderRadius: 10, fontWeight: 700, padding: '6px 14px', color: activeTemplateTab === 'group' ? '#fff' : '#38bdf8' }}
              >
                👥 CS Group Escalation
              </button>
              <button
                onClick={() => setActiveTemplateTab('stuck')}
                className={`btn btn-sm ${activeTemplateTab === 'stuck' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ borderRadius: 10, fontWeight: 700, padding: '6px 14px', color: activeTemplateTab === 'stuck' ? '#fff' : '#f59e0b' }}
              >
                📦 Report Stuck Escalation
              </button>
              <button
                onClick={() => setActiveTemplateTab('escalate')}
                className={`btn btn-sm ${activeTemplateTab === 'escalate' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ borderRadius: 10, fontWeight: 700, padding: '6px 14px', color: activeTemplateTab === 'escalate' ? '#fff' : '#ef4444' }}
              >
                🔥 Area Manager Escalation
              </button>
            </div>

            {/* Available Placeholders Chips */}
            <div style={{ marginBottom: 14, background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 12, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', marginBottom: 8 }}>
                💡 Click to insert dynamic placeholders into active template:
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  '{order_ref}', '{tracking}', '{courier}', '{customer_name}',
                  '{phone}', '{city}', '{address}', '{price}',
                  '{courier_status}', '{days_stuck}', '{days_since_action}', '{hours_since_action}', '{notes}', '{items}'
                ].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => {
                      if (activeTemplateTab === 'customer') setCustomerTemplate(prev => `${prev} ${chip}`)
                      else if (activeTemplateTab === 'group') setGroupTemplate(prev => `${prev} ${chip}`)
                      else if (activeTemplateTab === 'stuck') setStuckTemplate(prev => `${prev} ${chip}`)
                      else if (activeTemplateTab === 'escalate') setEscalateTemplate(prev => `${prev} ${chip}`)
                    }}
                    style={{
                      fontSize: '0.72rem',
                      fontFamily: 'monospace',
                      padding: '3px 8px',
                      borderRadius: 6,
                      background: 'rgba(168, 85, 247, 0.12)',
                      color: '#c084fc',
                      border: '1px solid rgba(168, 85, 247, 0.25)',
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                    title={`Click to add ${chip}`}
                  >
                    + {chip}
                  </button>
                ))}
              </div>
            </div>

            {/* Textarea Editor */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>
                {activeTemplateTab === 'customer' && '💬 CUSTOMER WA ALERT TEMPLATE:'}
                {activeTemplateTab === 'group' && '👥 CS GROUP ESCALATION TEMPLATE:'}
                {activeTemplateTab === 'stuck' && '📦 REPORT STUCK PARCEL TEMPLATE:'}
                {activeTemplateTab === 'escalate' && '🔥 AREA MANAGER ESCALATION TEMPLATE:'}
              </label>
              <textarea
                rows={7}
                value={
                  activeTemplateTab === 'customer' ? customerTemplate :
                  activeTemplateTab === 'group' ? groupTemplate :
                  activeTemplateTab === 'stuck' ? stuckTemplate : escalateTemplate
                }
                onChange={(e) => {
                  const val = e.target.value
                  if (activeTemplateTab === 'customer') setCustomerTemplate(val)
                  else if (activeTemplateTab === 'group') setGroupTemplate(val)
                  else if (activeTemplateTab === 'stuck') setStuckTemplate(val)
                  else if (activeTemplateTab === 'escalate') setEscalateTemplate(val)
                }}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: 12,
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  fontSize: '0.88rem',
                  fontFamily: 'monospace',
                  lineHeight: 1.5,
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Live Sample Preview */}
            <div style={{ marginBottom: 18, background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 12, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#10b981', textTransform: 'uppercase', marginBottom: 6 }}>
                👁️ Live Message Preview (Sample Order #TR33353):
              </div>
              <div style={{ fontSize: '0.82rem', whiteSpace: 'pre-wrap', color: 'var(--text-primary)', lineHeight: 1.4, fontFamily: 'sans-serif' }}>
                {applyTemplate(
                  activeTemplateTab === 'customer' ? customerTemplate :
                  activeTemplateTab === 'group' ? groupTemplate :
                  activeTemplateTab === 'stuck' ? stuckTemplate : escalateTemplate,
                  {
                    ref_number: 'TR33353',
                    tracking_number: '24120050025611',
                    courier: 'PostEx',
                    customer_name: 'Hazrat Shah',
                    phone: '03072060150',
                    city: 'Karachi',
                    address: 'Flat #2, Block B, North Nazimabad, Karachi',
                    price: 2098,
                    courier_status: 'Attempted',
                    days_stuck: 4,
                    days_since_action: 2,
                    hours_since_action: 52,
                    notes: 'confirm Order has been shipped via PostEx',
                    product_titles: 'Multi ref Pro-active - 4XL / White (x1)'
                  }
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button onClick={handleResetTemplates} className="btn btn-secondary btn-sm" style={{ color: '#f87171' }}>
                🔄 Reset to Defaults
              </button>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setTemplateEditModalOpen(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button onClick={handleSaveTemplates} className="btn btn-primary" style={{ fontWeight: 700 }}>
                  💾 Save Templates
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
