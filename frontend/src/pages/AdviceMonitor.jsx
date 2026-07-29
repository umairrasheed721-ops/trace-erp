import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'

export default function AdviceMonitor() {
  const { activeStoreId, addToast, setBadgeCounts } = useApp()
  const [activeTab, setActiveTab] = useState('advice_required') // 'advice_required' | 'first_attempt' | 'immediate_return' | 'reattempts'
  const [orders, setOrders] = useState([])
  const [reattemptOrders, setReattemptOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [actionStates, setActionStates] = useState({})
  
  // Retry Note Modal State
  const [retryModalOrder, setRetryModalOrder] = useState(null)
  const [retryNote, setRetryNote] = useState('')

  // History Timeline Modal State
  const [historyModalOrder, setHistoryModalOrder] = useState(null)
  const [historyData, setHistoryData] = useState([])
  const [historyMeta, setHistoryMeta] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  const load = () => {
    if (!activeStoreId) return
    setLoading(true)
    Promise.all([
      fetch(`/api/monitors/advice?store_id=${activeStoreId}`).then(r => r.json()),
      fetch(`/api/monitors/reattempts?store_id=${activeStoreId}`).then(r => r.json())
    ]).then(([adviceData, reattemptData]) => {
      setOrders(Array.isArray(adviceData) ? adviceData : [])
      setReattemptOrders(Array.isArray(reattemptData) ? reattemptData : [])
      setBadgeCounts(prev => ({ ...prev, advice: Array.isArray(adviceData) ? adviceData.length : 0 }))
      setLoading(false)
    }).catch(() => { addToast('Failed to load advice orders', 'error'); setLoading(false) })
  }

  useEffect(() => { load() }, [activeStoreId])

  const sendAction = async (order, action, customNote = '') => {
    setActionStates(prev => ({ ...prev, [order.id]: 'loading' }))
    try {
      const res = await fetch('/api/monitors/courier-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: activeStoreId,
          tracking_number: order.tracking_number,
          action,
          note: customNote || ''
        })
      })
      const data = await res.json()
      if (data.success) {
        addToast(data.message || `✅ ${action} sent to ${order.courier || 'Courier'}`, 'success')
        setActionStates(prev => ({ ...prev, [order.id]: 'done' }))
        load()
      } else {
        addToast(`❌ ${data.error}`, 'error')
        setActionStates(prev => ({ ...prev, [order.id]: null }))
      }
    } catch {
      addToast('Network error', 'error')
      setActionStates(prev => ({ ...prev, [order.id]: null }))
    } finally {
      setRetryModalOrder(null)
      setRetryNote('')
    }
  }

  const handleOpenRetryModal = (order) => {
    setRetryModalOrder(order)
    setRetryNote('')
  }

  const handleOpenHistory = async (order) => {
    setHistoryModalOrder(order)
    setHistoryData([])
    setHistoryMeta(null)
    setHistoryLoading(true)
    try {
      const res = await fetch(`/api/monitors/tracking-history?store_id=${activeStoreId}&tracking_number=${order.tracking_number}`)
      const data = await res.json()
      if (data.success && Array.isArray(data.history)) {
        setHistoryData(data.history)
        setHistoryMeta({
          transactionNotes: data.transactionNotes,
          currentStatus: data.currentStatus,
          orderNotes: order.notes
        })
      } else {
        addToast('No tracking history available', 'info')
      }
    } catch {
      addToast('Failed to fetch tracking history', 'error')
    } finally {
      setHistoryLoading(false)
    }
  }

  const handleIgnore = async (order) => {
    await fetch('/api/monitors/blacklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_id: activeStoreId, tracking_number: order.tracking_number })
    })
    addToast(`🚫 ${order.tracking_number} ignored`, 'info')
    load()
  }

  const getCustomerWaLink = (order) => {
    let phone = (order.phone || '').trim().replace(/[^0-9]/g, '');
    if (phone.startsWith('0')) {
      phone = '92' + phone.substring(1);
    } else if (phone.length === 10 && !phone.startsWith('92')) {
      phone = '92' + phone;
    }
    const msg = `Assalam-o-Alaikum ${order.customer_name || 'Customer'}, aap ke order #${order.tracking_number} (${order.courier || 'PostEx'}) ke hawale se delivery update ke liye contact kar rahe hain. Kya aap delivery re-attempt confirm karna chahte hain? Shukriya!`;
    
    const useWeb = localStorage.getItem('trace_use_wa_web') === 'true';
    const baseUrl = useWeb ? 'https://web.whatsapp.com/send' : 'whatsapp://send';
    return `${baseUrl}?phone=${phone}&text=${encodeURIComponent(msg)}`;
  };

  const getGroupWaLink = (order) => {
    const rawStatus = order.courier_status || order.delivery_status || 'Shipper Advice Required';
    const cleanNote = order.notes ? order.notes.replace(/Order has been shipped via [^.]+\.?/gi, '').replace(/\[Shipper Advice - [^\]]+\]/g, '').trim() : '';

    const msg = `📢 *SHIPPER ADVICE ALERT ~ TRACE ERP*\n📦 *Tracking:* ${order.tracking_number}\n🛍️ *Customer:* ${order.customer_name || 'N/A'} (${order.phone || 'N/A'})\n💬 *Status:* ${rawStatus}\n💰 *Price:* Rs ${parseInt(order.price || 0).toLocaleString()}\n🚚 *Courier:* ${order.courier || 'PostEx'}${cleanNote ? `\n📝 *Note:* ${cleanNote}` : ''}`;
    
    const useWeb = localStorage.getItem('trace_use_wa_web') === 'true';
    const baseUrl = useWeb ? 'https://web.whatsapp.com/send' : 'whatsapp://send';
    return `${baseUrl}?text=${encodeURIComponent(msg)}`;
  };

  // State to toggle SLA Expired (>48h) orders
  const [showExpired, setShowExpired] = useState(false)

  // Categorize & filter advice orders strictly by category tag & SLA status (<48h by default)
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

  const adviceRequiredOrders = filterBySla(orders.filter(o => o.advice_category === 'advice_required'))
  const firstAttemptOrders = filterBySla(orders.filter(o => o.advice_category === 'first_attempt' || (!o.advice_category && parseInt(o.failed_attempts || 0, 10) <= 1)))
  const immediateReturnOrders = filterBySla(orders.filter(o => o.advice_category === 'immediate_return'))

  let displayOrders = []
  if (activeTab === 'advice_required') displayOrders = adviceRequiredOrders
  else if (activeTab === 'first_attempt') displayOrders = firstAttemptOrders
  else if (activeTab === 'immediate_return') displayOrders = immediateReturnOrders
  else if (activeTab === 'reattempts') displayOrders = reattemptOrders

  // Bulk WhatsApp Modal State
  const [showBulkWaModal, setShowBulkWaModal] = useState(false)

  const getSlaBadge = (order) => {
    const rawDate = order.status_date || order.order_date
    if (!rawDate) return null

    let elapsedHours = 0
    try {
      const dateStr = rawDate.includes('T') ? rawDate : rawDate.replace(' ', 'T') + '+05:00'
      const parsedMs = Date.parse(dateStr)
      if (!isNaN(parsedMs)) {
        elapsedHours = (Date.now() - parsedMs) / 3600000
      }
    } catch (_) {}

    const remainingSla = Math.max(0, Math.floor(24 - elapsedHours))
    
    if (remainingSla > 0) {
      return (
        <span
          className="badge"
          style={{
            background: 'rgba(245, 158, 11, 0.15)',
            color: '#f59e0b',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            fontSize: '0.68rem',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            marginTop: 4
          }}
          title={`${Math.round(elapsedHours)}h elapsed since status update`}
        >
          ⏳ {remainingSla}h SLA Left
        </span>
      )
    }

    return (
      <span
        className="badge"
        style={{
          background: 'rgba(239, 68, 68, 0.15)',
          color: '#ef4444',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          fontSize: '0.68rem',
          fontWeight: 800,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 3,
          marginTop: 4
        }}
        title="More than 24h elapsed - Return risk!"
      >
        🚨 SLA Expired
      </span>
    )
  }

  const exportViolationReport = () => {
    const listToExport = immediateReturnOrders.length > 0 ? immediateReturnOrders : orders.filter(o => o.advice_category === 'immediate_return')
    if (listToExport.length === 0) {
      addToast('No violation orders to export', 'info')
      return
    }

    const headers = ['Tracking Number', 'Customer Name', 'Phone', 'Courier', 'Courier Raw Status', 'Status Date', 'Violation Details']
    const rows = listToExport.map(o => [
      `"${o.tracking_number}"`,
      `"${(o.customer_name || '').replace(/"/g, '""')}"`,
      `"${o.phone || ''}"`,
      `"${o.courier || ''}"`,
      `"${(o.courier_status || o.delivery_status || '').replace(/"/g, '""')}"`,
      `"${o.status_date || o.order_date || ''}"`,
      `"Direct Return Initiated on 1st Attempt without Shipper Advice Notice"`
    ])

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Courier_Violation_Escalation_${new Date().toISOString().slice(0,10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    addToast(`📄 Exported ${listToExport.length} violation orders to CSV`, 'success')
  }

  const formatCleanNote = (notes) => {
    if (!notes) return null;
    let cleaned = notes.replace(/Order has been shipped via [^.]+\.?/gi, '').trim();
    cleaned = cleaned.replace(/\[Shipper Advice - [^\]]+\]/g, '').trim();
    cleaned = cleaned.replace(/^\|+|\|+$/g, '').trim();
    return cleaned || null;
  };

  const getAdviceRemark = (notes) => {
    if (!notes) return null;
    const match = notes.match(/\[Shipper Advice - ([^\]]+)\]/);
    return match ? match[1] : null;
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>🧠 Advice Monitor</h2>
          <p>Real-time Shipper Advice tracking & 1st attempt failure alerts</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {activeTab === 'immediate_return' && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={exportViolationReport}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderColor: 'rgba(239, 68, 68, 0.4)', color: '#ef4444' }}
              title="Export CSV for Courier Account Manager Penalty Waiver"
            >
              📄 Export Dispute Sheet (.csv)
            </button>
          )}

          {displayOrders.length > 0 && activeTab !== 'reattempts' && (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setShowBulkWaModal(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#25D366', borderColor: '#25D366', color: '#fff' }}
            >
              📱 Bulk WhatsApp ({displayOrders.length})
            </button>
          )}

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none', background: 'var(--bg-card)', padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)' }}>
            <input
              type="checkbox"
              checked={showExpired}
              onChange={(e) => setShowExpired(e.target.checked)}
              style={{ cursor: 'pointer', accentColor: 'var(--brand)' }}
            />
            Show Expired (&gt;48h)
          </label>

          <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
            {loading ? <span className="loading-spinner"></span> : '🔄'} Refresh
          </button>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 12, flexWrap: 'wrap' }}>
        <button
          className={`btn ${activeTab === 'advice_required' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('advice_required')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8, padding: '8px 14px', fontWeight: 600, fontSize: '0.88rem' }}
        >
          🚨 Shipper Advice Required ({adviceRequiredOrders.length})
        </button>

        <button
          className={`btn ${activeTab === 'first_attempt' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('first_attempt')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8, padding: '8px 14px', fontWeight: 600, fontSize: '0.88rem' }}
        >
          🔴 1st Attempt Failed ({firstAttemptOrders.length})
        </button>

        <button
          className={`btn ${activeTab === 'immediate_return' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('immediate_return')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            borderRadius: 8,
            padding: '8px 14px',
            fontWeight: 700,
            fontSize: '0.88rem',
            background: activeTab === 'immediate_return' ? '#ef4444' : 'rgba(239,68,68,0.12)',
            color: activeTab === 'immediate_return' ? '#fff' : '#ef4444',
            border: '1px solid rgba(239,68,68,0.3)'
          }}
        >
          ⚡ 1st Attempt Immediate Return ({immediateReturnOrders.length})
        </button>

        <button
          className={`btn ${activeTab === 'reattempts' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('reattempts')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8, padding: '8px 14px', fontWeight: 600, fontSize: '0.88rem' }}
        >
          🔁 Reattempts Sent (Last 60 Days) ({reattemptOrders.length})
        </button>
      </div>

      {loading ? (
        <div className="loading-overlay"><span className="loading-spinner"></span> Scanning...</div>
      ) : displayOrders.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">✅</div>
          <h3>{activeTab === 'advice' ? 'No Orders Need Action' : 'No Reattempts Sent Yet'}</h3>
          <p>{activeTab === 'advice' ? 'No shipper advice statuses detected' : 'Parcels with reattempt requests will appear here'}</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Tracking #</th>
                <th>Customer</th>
                <th>ERP Status</th>
                <th>Courier Raw Status</th>
                <th>Order Notes</th>
                <th>Price</th>
                <th>Product</th>
                <th>Courier Action</th>
                <th>Share</th>
                <th>Ignore</th>
              </tr>
            </thead>
            <tbody>
              {displayOrders.map(o => {
                const state = actionStates[o.id]
                const isDone = state === 'done'
                const isLoading = state === 'loading'

                return (
                  <tr key={o.id}>
                    <td className="font-mono" style={{ fontSize: '0.75rem' }}>
                      <div style={{ color: 'var(--brand)', fontWeight: 600, fontSize: '0.78rem' }}>{o.tracking_number}</div>
                      <Link
                        to={`/search?q=${encodeURIComponent(o.tracking_number)}`}
                        className="btn btn-secondary btn-xs"
                        title="Open this order in Command Center"
                        style={{
                          marginTop: 4,
                          padding: '2px 7px',
                          fontSize: '0.65rem',
                          background: 'rgba(99,102,241,0.12)',
                          color: '#818cf8',
                          border: '1px solid rgba(99,102,241,0.3)',
                          borderRadius: 4,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          textDecoration: 'none'
                        }}
                      >
                        ⚡ Command Center ↗
                      </Link>
                    </td>
                    <td>{o.customer_name}</td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                        <span className="badge badge-advice">{o.delivery_status}</span>
                        {getSlaBadge(o)}
                      </div>
                    </td>
                    <td style={{ minWidth: 210 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span className="badge" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)', border: '1px solid var(--border)', fontSize: '0.74rem', fontWeight: 600 }}>
                            {o.courier_status || '—'}
                          </span>
                          <button
                            className="btn btn-secondary btn-xs"
                            title="Click to view full PostEx remarks & milestone timeline"
                            onClick={() => handleOpenHistory(o)}
                            style={{ padding: '3px 8px', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, fontWeight: 600, background: 'rgba(99,102,241,0.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 6, cursor: 'pointer' }}
                          >
                            📜 History
                          </button>
                        </div>
                        {getAdviceRemark(o.notes) && (
                          <div style={{ fontSize: '0.72rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '3px 7px', borderRadius: 6, border: '1px solid rgba(16, 185, 129, 0.2)', width: '100%', wordBreak: 'break-word', lineHeight: 1.3 }}>
                            💬 <strong>CS Remark:</strong> {getAdviceRemark(o.notes)}
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-primary)', fontSize: '0.78rem', minWidth: 160, maxWidth: 220, whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.4 }}>
                      {formatCleanNote(o.notes) ? (
                        <span style={{ background: 'rgba(99,102,241,0.08)', padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(99,102,241,0.2)', display: 'inline-block' }}>
                          📝 {formatCleanNote(o.notes)}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ fontWeight: 600 }}>Rs {parseInt(o.price || 0).toLocaleString()}</td>
                    <td style={{ fontSize: '0.72rem', color: 'var(--text-muted)', maxWidth: 160 }} className="truncate">{o.product_titles || '—'}</td>
                    <td>
                      {isDone ? (
                        <span className="text-success" style={{ fontSize: '0.8rem', fontWeight: 600 }}>✅ Sent</span>
                      ) : (
                        <div className="flex gap-2">
                          <button className="btn btn-success btn-sm" disabled={isLoading} onClick={() => handleOpenRetryModal(o)}>
                            {isLoading ? <span className="loading-spinner"></span> : '🔁 Retry'}
                          </button>
                          <button className="btn btn-danger btn-sm" disabled={isLoading} onClick={() => sendAction(o, 'Return')}>
                            ↩ Return
                          </button>
                        </div>
                      )}
                    </td>
                    <td style={{ minWidth: 150 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <a
                          href={getCustomerWaLink(o)}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-secondary btn-xs"
                          title="Direct 1-on-1 Chat with Customer via WhatsApp"
                          style={{ padding: '3px 8px', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(37,211,102,0.12)', color: '#25D366', border: '1px solid rgba(37,211,102,0.3)', borderRadius: 6, cursor: 'pointer', textDecoration: 'none' }}
                        >
                          📱 Customer
                        </a>
                        <a
                          href={getGroupWaLink(o)}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-secondary btn-xs"
                          title="Share Formatted Alert to Team / Courier WhatsApp Group"
                          style={{ padding: '3px 8px', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 6, cursor: 'pointer', textDecoration: 'none' }}
                        >
                          👥 Group
                        </a>
                      </div>
                    </td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => handleIgnore(o)}>🚫</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Bulk WhatsApp Dispatch Modal */}
      {showBulkWaModal && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="modal-content" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 650, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: 8, color: '#25D366' }}>
                📱 Bulk WhatsApp Dispatcher ({displayOrders.length} Customers)
              </h3>
              <button className="btn btn-secondary btn-xs" onClick={() => setShowBulkWaModal(false)}>✕</button>
            </div>
            
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 16 }}>
              Click any customer line to open WhatsApp Web/App pre-filled message instantly:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {displayOrders.map((o, idx) => (
                <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                      #{idx + 1}. {o.customer_name} <span style={{ opacity: 0.6, fontSize: '0.78rem' }}>({o.phone})</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      📦 {o.tracking_number} • Status: {o.delivery_status} • Price: Rs {parseInt(o.price || 0).toLocaleString()}
                    </div>
                  </div>
                  <a
                    href={getWhatsAppLink(o)}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-sm"
                    style={{ background: '#25D366', color: '#fff', border: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    📱 Send WA ↗
                  </a>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 20, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  const links = displayOrders.map(o => `${o.customer_name} (${o.phone}): ${getWhatsAppLink(o)}`).join('\n\n')
                  navigator.clipboard.writeText(links)
                  addToast('📋 All WhatsApp links copied to clipboard!', 'success')
                }}
              >
                📋 Copy All WA Links
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowBulkWaModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Retry Action Note Modal */}
      {retryModalOrder && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="modal-content" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 440, boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem', color: 'var(--text-primary)' }}>🔁 Reattempt Delivery</h3>
            <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Add an optional remark for <strong>{retryModalOrder.tracking_number}</strong> ({retryModalOrder.customer_name}) before sending to {retryModalOrder.courier || 'Courier'}.
            </p>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Instructions / Remarks for Courier:
              </label>
              <textarea
                className="input"
                rows={3}
                placeholder="e.g., Customer confirmed available tomorrow after 2 PM / Call before delivery"
                value={retryNote}
                onChange={e => setRetryNote(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', fontSize: '0.85rem', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', resize: 'vertical' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-secondary" onClick={() => setRetryModalOrder(null)}>
                Cancel
              </button>
              <button
                className="btn btn-success"
                onClick={() => sendAction(retryModalOrder, 'Reattempt', retryNote)}
              >
                🚀 Confirm & Send Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Courier Tracking Milestone Timeline Modal */}
      {historyModalOrder && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="modal-content" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 540, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>📜 Courier Milestone Timeline</h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Tracking: <strong style={{ color: 'var(--brand)' }}>{historyModalOrder.tracking_number}</strong> ({historyModalOrder.customer_name})
                </p>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setHistoryModalOrder(null)}>✕</button>
            </div>

            {/* Remarks & Instructions Banner inside Modal */}
            {historyMeta && (historyMeta.transactionNotes || historyMeta.orderNotes) && (
              <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, padding: '12px 14px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {historyMeta.transactionNotes && (
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                    📌 <strong>PostEx Delivery Instructions:</strong> {historyMeta.transactionNotes}
                  </div>
                )}
                {historyMeta.orderNotes && (
                  <div style={{ fontSize: '0.82rem', color: '#10b981' }}>
                    💬 <strong>CS Remarks & Notes:</strong> {historyMeta.orderNotes}
                  </div>
                )}
              </div>
            )}

            <div style={{ overflowY: 'auto', flex: 1, paddingRight: 6 }}>
              {historyLoading ? (
                <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
                  <span className="loading-spinner"></span> Fetching courier tracking history...
                </div>
              ) : historyData.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
                  No detailed tracking events found for this parcel.
                </div>
              ) : (
                <div style={{ position: 'relative', paddingLeft: 24 }}>
                  {/* Vertical Timeline Bar */}
                  <div style={{ position: 'absolute', left: 8, top: 10, bottom: 10, width: 2, background: 'var(--border)' }} />

                  {historyData.map((item, idx) => {
                    const msg = item.message || '';
                    const msgLower = msg.toLowerCase();
                    const isAttempt = msgLower.includes('attempt') || msgLower.includes('rfd') || msgLower.includes('refused');
                    const isReview = msgLower.includes('review') || msgLower.includes('advice');
                    const isReattempt = msgLower.includes('reattempt') || msgLower.includes('merchant request');
                    const isLatest = idx === historyData.length - 1;

                    let dotBg = isReattempt ? '#3b82f6' : isLatest ? '#6366f1' : isReview ? '#f59e0b' : isAttempt ? '#ef4444' : '#10b981';

                    return (
                      <div key={idx} style={{ position: 'relative', marginBottom: 18 }}>
                        {/* Timeline Circle Node */}
                        <div style={{
                          position: 'absolute',
                          left: -20,
                          top: 4,
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: dotBg,
                          boxShadow: isLatest ? `0 0 10px ${dotBg}` : 'none'
                        }} />

                        <div style={{ background: isLatest ? 'rgba(99,102,241,0.08)' : 'var(--bg-card)', border: isLatest ? '1px solid rgba(99,102,241,0.3)' : '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: isLatest ? 700 : 500, color: isAttempt ? '#f87171' : isReview ? '#fbbf24' : 'var(--text-primary)' }}>
                              {item.message}
                            </span>
                            {item.dateTime && (
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                {new Date(item.dateTime).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div style={{ marginTop: 16, pt: 12, borderTop: '1px solid var(--border)', textAlign: 'right' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setHistoryModalOrder(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


