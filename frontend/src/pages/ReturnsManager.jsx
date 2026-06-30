import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'

const formatItems = (row) => {
  if (row.line_items) {
    try {
      const items = typeof row.line_items === 'string' ? JSON.parse(row.line_items) : row.line_items;
      if (Array.isArray(items) && items.length > 0) {
        return items.map(item => {
          const name = item.title || item.name || '';
          const variant = item.variant_title && item.variant_title !== 'Default Title' ? ` - ${item.variant_title}` : '';
          const qty = item.quantity || item.qty || 1;
          return `${name}${variant} (x${qty})`;
        }).join(', ');
      }
    } catch (e) {
      // ignore
    }
  }
  return row.product_titles || '';
};

export default function ReturnsManager() {
  const { activeStoreId, addToast } = useApp()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('queue') // 'queue' or 'history'
  const [trackingInput, setTrackingInput] = useState('')
  const [restockShopify, setRestockShopify] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [pendingReturns, setPendingReturns] = useState([])
  const [returnHistory, setReturnHistory] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [results, setResults] = useState([])
  const inputRef = useRef(null)
  const lastScanRef = useRef({ code: '', time: 0 })

  // Load data
  const fetchPending = async () => {
    if (!activeStoreId) return
    try {
      const res = await fetch(`/api/finance/returns/pending?store_id=${activeStoreId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
      })
      const data = await res.json()
      setPendingReturns(Array.isArray(data) ? data : [])
    } catch (e) {
      addToast('Failed to load pending returns', 'error')
    }
  }

  const fetchHistory = async () => {
    if (!activeStoreId) return
    try {
      const res = await fetch(`/api/finance/returns/history?store_id=${activeStoreId}&days=7`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
      })
      const data = await res.json()
      setReturnHistory(Array.isArray(data) ? data : [])
    } catch (e) {
      addToast('Failed to load history', 'error')
    }
  }

  useEffect(() => {
    fetchPending()
    fetchHistory()
    inputRef.current?.focus()
  }, [activeStoreId])

  // Filtered lists
  const filteredPending = useMemo(() => {
    return pendingReturns.filter(r => 
      r.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.tracking_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.ref_number?.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [pendingReturns, searchTerm])

  const filteredHistory = useMemo(() => {
    return returnHistory.filter(r => 
      r.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.tracking_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.ref_number?.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [returnHistory, searchTerm])

  const handleBulkVerify = async (idsToVerify) => {
    if (!activeStoreId || idsToVerify.length === 0 || isProcessing) return
    setIsProcessing(true)
    try {
      const res = await fetch(`/api/finance/returns/bulk-verify`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('trace_token')}`
        },
        body: JSON.stringify({
          store_id: activeStoreId,
          ids: idsToVerify,
          restockShopify
        })
      })
      const data = await res.json()
      if (data.success) {
        const verifiedCount = data.results.filter(r => r.status.includes('✅')).length
        const alreadyCount = data.results.filter(r => r.status.includes('⚠️')).length
        
        if (verifiedCount > 0) addToast(`✅ Processed ${verifiedCount} returns`, 'success')
        if (alreadyCount > 0 && idsToVerify.length === 1) addToast(`⚠️ Already Verified`, 'info')

        setResults(prev => [...data.results, ...prev])
        setSelectedIds([])
        fetchPending()
        fetchHistory()
      }
    } catch (e) {
      addToast('Processing Error: ' + e.message, 'error')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleExport = () => {
    const url = `/api/finance/returns/export-csv?store_id=${activeStoreId}&days=7`
    window.open(url, '_blank')
  }

  const verifyTracking = async (trackNum) => {
    if (!activeStoreId || isProcessing) return
    setIsProcessing(true)
    try {
      const res = await fetch(`/api/finance/returns/verify-by-tracking`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('trace_token')}`
        },
        body: JSON.stringify({
          store_id: activeStoreId,
          tracking_number: trackNum,
          restockShopify
        })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        const r = data.result
        if (r.status.includes('Re-Processed')) {
          addToast(`🔄 Shopify re-processed for order ${r.ref_number}`, 'success')
        } else if (r.status.includes('Already')) {
          addToast(`⚠️ Order ${r.ref_number} already verified`, 'info')
        } else {
          addToast(`✅ Return processed for order ${r.ref_number}`, 'success')
        }
        setResults(prev => [r, ...prev])
        fetchPending()
        fetchHistory()
      } else {
        const errMsg = data.error || 'Failed to verify tracking barcode'
        addToast(`❌ Error: ${errMsg}`, 'error')
        setResults(prev => [{
          tracking: trackNum,
          status: '❌ Error: ' + errMsg,
          shopifyStatus: '❌ Failed'
        }, ...prev])
      }
    } catch (e) {
      addToast('Network error: ' + e.message, 'error')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleBulkVerifyTracking = async (trackNums) => {
    if (!activeStoreId || trackNums.length === 0 || isProcessing) return
    setIsProcessing(true)
    let successCount = 0

    for (const trackNum of trackNums) {
      try {
        const res = await fetch(`/api/finance/returns/verify-by-tracking`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('trace_token')}`
          },
          body: JSON.stringify({
            store_id: activeStoreId,
            tracking_number: trackNum,
            restockShopify
          })
        })
        const data = await res.json()
        if (res.ok && data.success) {
          const r = data.result
          setResults(prev => [r, ...prev])
          successCount++
        } else {
          const errMsg = data.error || 'Error'
          setResults(prev => [{
            tracking: trackNum,
            status: '❌ ' + errMsg,
            shopifyStatus: '❌ Failed'
          }, ...prev])
        }
      } catch (e) {
        setResults(prev => [{
          tracking: trackNum,
          status: '❌ Network Error',
          shopifyStatus: '❌ Failed'
        }, ...prev])
      }
    }

    if (successCount > 0) {
      addToast(`Processed ${successCount} tracking codes`, 'success')
      fetchPending()
      fetchHistory()
    }
    setIsProcessing(false)
  }

  // Handle Scanning
  const handleScanInput = (val) => {
    setTrackingInput(val)
    const lines = val.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length > 0) {
      const lastScan = lines[lines.length - 1]
      
      if (val.endsWith('\n')) {
        // Prevent duplicate processing of the same scan in a short window
        const now = Date.now()
        if (lastScan === lastScanRef.current.code && (now - lastScanRef.current.time < 2000)) {
          return 
        }
        lastScanRef.current = { code: lastScan, time: now }
        
        verifyTracking(lastScan)
        setTrackingInput('')
      }
    }
  }

  const handleBulkAction = () => {
    const lines = trackingInput.split(/[\n,]+/).map(l => l.trim()).filter(Boolean)
    if (lines.length === 0) return
    handleBulkVerifyTracking(lines)
    setTrackingInput('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleBulkAction()
    }
  }

  const handleOpenInCommandCenter = () => {
    const currentList = activeTab === 'queue' ? pendingReturns : returnHistory;
    const filteredList = activeTab === 'queue' ? filteredPending : filteredHistory;

    const targetOrders = selectedIds.length > 0 
      ? currentList.filter(r => selectedIds.includes(r.id))
      : filteredList;

    if (targetOrders.length === 0) {
      addToast('No returns to open in Command Center', 'warning');
      return;
    }

    const refs = targetOrders.map(o => o.ref_number || o.shopify_order_id).filter(Boolean).join(' ');
    
    navigate('/search', { 
      state: { 
        preset: 'All Time',
        status: 'All Statuses',
        keyword: refs
      } 
    });
  }

  return (
    <div className="page-container" style={{ maxWidth: '1600px', margin: '0 auto' }}>
      <header className="page-header" style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title" style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--brand)' }}>📦 Smart Returns Hub</h1>
          <p className="page-subtitle">Track, verify, and audit incoming returns with high-precision logs.</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.05)', padding: '8px 16px', borderRadius: 12, cursor: 'pointer', border: '1px solid var(--border)' }}>
            <input type="checkbox" checked={restockShopify} onChange={e => setRestockShopify(e.target.checked)} />
            <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Restock & Refund in Shopify</span>
          </label>
          <button className="btn btn-secondary" onClick={handleExport}>📊 Export History (7d)</button>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: 24, alignItems: 'start' }}>
        
        {/* --- LEFT: SCANNER MODULE --- */}
        <div className="scanner-card">
          <style>{`
            @keyframes scanline-anim {
              0% { transform: translateY(-100%); }
              100% { transform: translateY(100%); }
            }
            .scanner-card {
              padding: 20px;
              position: sticky;
              top: 20px;
              background: rgba(15, 12, 28, 0.95);
              border: 1px solid rgba(168, 85, 247, 0.2);
              box-shadow: 0 8px 32px 0 rgba(168, 85, 247, 0.05);
              backdrop-filter: blur(10px);
              border-radius: var(--radius);
              transition: all 0.3s ease;
            }
            [data-theme='light'] .scanner-card {
              background: rgba(245, 243, 255, 0.9);
              border-color: rgba(168, 85, 247, 0.25);
              box-shadow: 0 8px 32px 0 rgba(168, 85, 247, 0.08);
            }
            .scanner-console-wrapper {
              position: relative;
              overflow: hidden;
              border-radius: 12px;
              border: 1px solid rgba(168, 85, 247, 0.2);
              box-shadow: 0 0 15px rgba(168, 85, 247, 0.05);
              transition: all 0.3s ease;
            }
            [data-theme='light'] .scanner-console-wrapper {
              border-color: rgba(168, 85, 247, 0.3);
            }
            .scanner-console-wrapper:focus-within {
              border-color: rgba(168, 85, 247, 0.8);
              box-shadow: 0 0 25px rgba(168, 85, 247, 0.25);
            }
            .scanner-scanline {
              position: absolute;
              top: 0; left: 0; right: 0;
              height: 4px;
              background: linear-gradient(90deg, transparent, rgba(168, 85, 247, 0.6), transparent);
              animation: scanline-anim 2.5s linear infinite;
              pointer-events: none;
              z-index: 10;
            }
            [data-theme='light'] .scanner-scanline {
              background: linear-gradient(90deg, transparent, rgba(168, 85, 247, 0.8), transparent);
            }
            .scanner-textarea {
              width: 100%; 
              height: 130px; 
              background: rgba(10, 8, 20, 0.95); 
              border: none;
              color: #e9d5ff; 
              padding: 16px; 
              fontSize: 1.05rem;
              font-family: "Share Tech Mono", monospace; 
              outline: none; 
              resize: none;
              line-height: 1.4;
              letter-spacing: 1px;
              transition: all 0.3s ease;
            }
            [data-theme='light'] .scanner-textarea {
              background: rgba(255, 255, 255, 0.95);
              color: #581c87;
              border: 1px solid rgba(168, 85, 247, 0.15);
            }
            .scanner-glow-text {
              text-shadow: 0 0 8px rgba(168, 85, 247, 0.5);
            }
            [data-theme='light'] .scanner-glow-text {
              text-shadow: none;
            }
            .scanner-log-item {
              padding: 10px 12px; 
              border: 1px solid rgba(255,255,255,0.03);
              border-radius: 8px; 
              font-size: 0.78rem; 
              font-family: monospace;
              transition: all 0.3s ease;
            }
            [data-theme='light'] .scanner-log-item {
              border: 1px solid rgba(168, 85, 247, 0.08);
              background: rgba(255, 255, 255, 0.6) !important;
            }
          `}</style>

          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ 
                  width: 12, 
                  height: 12, 
                  background: isProcessing ? '#fbbf24' : '#a855f7', 
                  borderRadius: '50%', 
                  boxShadow: isProcessing ? '0 0 10px #fbbf24' : '0 0 10px #a855f7', 
                  transition: 'all 0.3s' 
                }}></div>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>
                  {isProcessing ? 'Processing Scan...' : 'Console Scanner'}
                </h3>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <span className="badge" style={{ background: 'rgba(168, 85, 247, 0.1)', color: '#a855f7', padding: '2px 8px', fontSize: '0.7rem' }}>
                  Scans: {results.length}
                </span>
                <span className="badge" style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', padding: '2px 8px', fontSize: '0.7rem' }}>
                  OK: {results.filter(r => r.status.includes('✅')).length}
                </span>
              </div>
            </div>

            <div className="scanner-console-wrapper">
              <div className="scanner-scanline"></div>
              <textarea
                ref={inputRef}
                value={trackingInput}
                onChange={e => handleScanInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isProcessing}
                placeholder={isProcessing ? "INITIALIZING SECURE LINK..." : "SCAN BARCODE / ENTER TRACKING ID..."}
                className="scanner-textarea scanner-glow-text"
              />
            </div>

            <button
              className="btn"
              onClick={handleBulkAction}
              disabled={isProcessing || !trackingInput.trim()}
              style={{ 
                width: '100%', 
                marginTop: 12, 
                fontWeight: 700,
                background: 'linear-gradient(135deg, #a855f7, #6366f1)',
                color: '#fff',
                border: 'none',
                padding: '10px',
                borderRadius: '8px',
                transition: 'all 0.2s',
                cursor: 'pointer'
              }}
            >
              {isProcessing ? '⚡ EXECUTING...' : '⚙️ RUN BULK ACTION'}
            </button>
            <p style={{ fontSize: '0.72rem', opacity: 0.5, marginTop: 8, textAlign: 'center' }}>
              Bypasses ERP restrictions. Processes any scanned tracking ID.
            </p>
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h4 style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, opacity: 0.7 }}>Last Actions Log</h4>
              {results.length > 0 && (
                <button 
                  onClick={() => setResults([])} 
                  style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 600 }}
                >
                  Clear Logs
                </button>
              )}
            </div>
            <div style={{ maxHeight: 350, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {results.map((r, i) => {
                let borderColor = '#ef4444'
                let bg = 'rgba(239, 68, 68, 0.03)'
                if (r.status.includes('✅')) {
                  borderColor = '#22c55e'
                  bg = 'rgba(34, 197, 94, 0.03)'
                }
                if (r.status.includes('⚠️')) {
                  borderColor = '#eab308'
                  bg = 'rgba(234, 179, 8, 0.03)'
                }
                
                return (
                  <div key={i} className="scanner-log-item" style={{ 
                    background: bg, 
                    borderLeft: `4px solid ${borderColor}`,
                  }}>
                    <div style={{ fontWeight: 700 }}>{r.tracking}</div>
                    <div style={{ opacity: 0.8, marginTop: 2, display: 'flex', justifyContent: 'space-between' }}>
                      <span>{r.status}</span>
                      <span style={{ opacity: 0.6 }}>{r.shopifyStatus}</span>
                    </div>
                  </div>
                )
              })}
              {results.length === 0 && <div style={{ opacity: 0.3, fontSize: '0.78rem', textAlign: 'center', padding: '20px 0' }}>No scans recorded in session.</div>}
            </div>
          </div>
        </div>

        {/* --- RIGHT: TABS SECTION --- */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '0 20px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex' }}>
              <button 
                onClick={() => setActiveTab('queue')}
                style={{ 
                  padding: '16px 20px', background: 'none', border: 'none', 
                  borderBottom: activeTab === 'queue' ? '2px solid var(--brand)' : 'none',
                  color: activeTab === 'queue' ? 'var(--brand)' : 'inherit',
                  fontWeight: 700, cursor: 'pointer'
                }}
              >
                Approval Queue ({pendingReturns.length})
              </button>
              <button 
                onClick={() => setActiveTab('history')}
                style={{ 
                  padding: '16px 20px', background: 'none', border: 'none', 
                  borderBottom: activeTab === 'history' ? '2px solid var(--brand)' : 'none',
                  color: activeTab === 'history' ? 'var(--brand)' : 'inherit',
                  fontWeight: 700, cursor: 'pointer'
                }}
              >
                Returns History (7d)
              </button>
            </div>
            <div style={{ padding: '10px 0', display: 'flex', gap: 10 }}>
              <input 
                type="text" 
                placeholder="Search..." 
                className="form-input" 
                style={{ width: 200, padding: '4px 10px' }}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
              <button 
                className="btn btn-secondary btn-sm" 
                onClick={handleOpenInCommandCenter}
              >
                🔍 Open in Command Center {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}
              </button>
              {activeTab === 'queue' && selectedIds.length > 0 && (
                <button 
                  className="btn btn-brand btn-sm" 
                  onClick={() => handleBulkVerify(selectedIds)}
                  disabled={isProcessing}
                >
                  {isProcessing ? 'Processing...' : 'Verify Selected'}
                </button>
              )}
            </div>
          </div>

          <div style={{ overflowX: 'auto', maxHeight: '75vh' }}>
            {activeTab === 'queue' ? (
              <table className="order-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: 40, padding: '12px 20px' }}>
                      <input 
                        type="checkbox" 
                        onChange={e => setSelectedIds(e.target.checked ? filteredPending.map(p => p.id) : [])}
                        checked={selectedIds.length > 0 && selectedIds.length === filteredPending.length}
                        disabled={isProcessing}
                      />
                    </th>
                    <th>Order</th>
                    <th>Tracking</th>
                    <th>Dates</th>
                    <th>Courier Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPending.map(row => (
                    <tr key={row.id}>
                      <td style={{ padding: '12px 20px' }}>
                        <input 
                          type="checkbox" 
                          checked={selectedIds.includes(row.id)}
                          onChange={e => setSelectedIds(prev => e.target.checked ? [...prev, row.id] : prev.filter(id => id !== row.id))}
                          disabled={isProcessing}
                        />
                      </td>
                      <td>
                        <div style={{ fontWeight: 700 }}>{row.ref_number || row.shopify_order_id}</div>
                        <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>{row.customer_name}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ 
                              fontSize: '0.7rem', 
                              fontWeight: 700, 
                              color: '#16a34a',
                              background: 'rgba(22, 163, 74, 0.08)', 
                              padding: '1px 5px',
                              borderRadius: '4px',
                              display: 'inline-block'
                            }}>
                              Rs. {Math.round(parseFloat(row.price || 0)).toLocaleString()}
                            </span>
                          </div>
                          {formatItems(row) && (
                            <div style={{ 
                              fontSize: '0.7rem', 
                              opacity: 0.7,
                              color: 'var(--text-secondary)',
                              lineHeight: '1.3',
                              maxWidth: '260px',
                              wordBreak: 'break-word',
                              whiteSpace: 'normal'
                            }}>
                              📦 {formatItems(row)}
                            </div>
                          )}
                        </div>
                        {row.notes && (
                          <div style={{ 
                            fontSize: '0.72rem', 
                            color: 'var(--brand)', 
                            background: 'var(--brand-glow)', 
                            padding: '3px 8px', 
                            borderRadius: '6px', 
                            marginTop: '6px', 
                            display: 'inline-block', 
                            border: '1px solid rgba(168, 85, 247, 0.2)',
                            maxWidth: '240px',
                            wordBreak: 'break-word',
                            whiteSpace: 'normal',
                            textAlign: 'left'
                          }}>
                            📝 {row.notes}
                          </div>
                        )}
                      </td>
                      <td style={{ fontFamily: 'monospace' }}>{row.tracking_number}</td>
                      <td>
                        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          Order: <span style={{ fontWeight: 400, opacity: 0.8 }}>{row.order_date ? row.order_date.substring(0, 10) : '—'}</span>
                        </div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                          Courier: <span style={{ fontWeight: 400, opacity: 0.8 }}>{row.status_date ? row.status_date.substring(0, 10) : '—'}</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                          <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--red)', display: 'inline-block' }}>{row.delivery_status}</span>
                          {row.courier_status && row.courier_status.toLowerCase() !== row.delivery_status.toLowerCase() && (
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                              ({row.courier_status})
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <button 
                          className="btn btn-secondary btn-sm" 
                          onClick={() => handleBulkVerify([row.id])}
                          disabled={isProcessing}
                        >
                          Verify
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredPending.length === 0 && (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '40px', opacity: 0.4 }}>No pending returns.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <table className="order-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '12px 20px' }}>Verified At</th>
                    <th>Order</th>
                    <th>Tracking</th>
                    <th>Verified By</th>
                    <th>Shopify Restock</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map(row => (
                    <tr key={row.id}>
                      <td style={{ padding: '12px 20px', fontSize: '0.8rem' }}>
                        {new Date(row.created_at).toLocaleString()}
                      </td>
                      <td>
                        <div style={{ fontWeight: 700 }}>{row.ref_number}</div>
                        <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>{row.customer_name}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ 
                              fontSize: '0.7rem', 
                              fontWeight: 700, 
                              color: '#16a34a',
                              background: 'rgba(22, 163, 74, 0.08)', 
                              padding: '1px 5px',
                              borderRadius: '4px',
                              display: 'inline-block'
                            }}>
                              Rs. {Math.round(parseFloat(row.price || 0)).toLocaleString()}
                            </span>
                          </div>
                          {formatItems(row) && (
                            <div style={{ 
                              fontSize: '0.7rem', 
                              opacity: 0.7,
                              color: 'var(--text-secondary)',
                              lineHeight: '1.3',
                              maxWidth: '260px',
                              wordBreak: 'break-word',
                              whiteSpace: 'normal'
                            }}>
                              📦 {formatItems(row)}
                            </div>
                          )}
                        </div>
                        {row.notes && (
                          <div style={{ 
                            fontSize: '0.72rem', 
                            color: 'var(--brand)', 
                            background: 'var(--brand-glow)', 
                            padding: '3px 8px', 
                            borderRadius: '6px', 
                            marginTop: '6px', 
                            display: 'inline-block', 
                            border: '1px solid rgba(168, 85, 247, 0.2)',
                            maxWidth: '240px',
                            wordBreak: 'break-word',
                            whiteSpace: 'normal',
                            textAlign: 'left'
                          }}>
                            📝 {row.notes}
                          </div>
                        )}
                      </td>
                      <td style={{ fontFamily: 'monospace' }}>{row.tracking_number}</td>
                      <td style={{ fontWeight: 600 }}>{row.processed_by}</td>
                      <td>
                        <span className="badge" style={{ background: row.restocked_shopify ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: row.restocked_shopify ? 'var(--green)' : 'var(--red)' }}>
                          {row.restocked_shopify ? '✅ Yes' : '❌ No'}
                        </span>
                      </td>
                      <td>
                        <button 
                          className="btn btn-secondary btn-sm" 
                          onClick={() => handleBulkVerify([row.order_id || row.id])}
                          disabled={isProcessing}
                        >
                          Verify Again
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredHistory.length === 0 && (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '40px', opacity: 0.4 }}>No history records found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
