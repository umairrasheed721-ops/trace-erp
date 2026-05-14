import { useState, useRef, useEffect, useMemo } from 'react'
import { useApp } from '../context/AppContext'

export default function ReturnsManager() {
  const { activeStoreId, addToast } = useApp()
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
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
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
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
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
          'Authorization': `Bearer ${localStorage.getItem('token')}`
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

  // Handle Scanning
  const handleScanInput = (val) => {
    setTrackingInput(val)
    const lines = val.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length > 0) {
      const lastScan = lines[lines.length - 1]
      
      // Prevent duplicate processing of the same scan in a short window (3 seconds)
      const now = Date.now()
      if (lastScan === lastScanRef.current.code && (now - lastScanRef.current.time < 3000)) {
        return 
      }
      lastScanRef.current = { code: lastScan, time: now }

      const match = pendingReturns.find(r => r.tracking_number === lastScan)
      if (match) {
        handleBulkVerify([match.id])
        setTrackingInput('')
      }
    }
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
        <div className="card" style={{ padding: 20, position: 'sticky', top: 20 }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 12, height: 12, background: isProcessing ? 'var(--yellow)' : 'var(--brand)', borderRadius: '50%', boxShadow: isProcessing ? '0 0 10px var(--yellow)' : '0 0 10px var(--brand)', transition: 'all 0.3s' }}></div>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>{isProcessing ? 'Processing...' : 'Parcel Scanner'}</h3>
            </div>
            <textarea
              ref={inputRef}
              value={trackingInput}
              onChange={e => handleScanInput(e.target.value)}
              disabled={isProcessing}
              placeholder={isProcessing ? "Wait..." : "Scan tracking barcode..."}
              style={{
                width: '100%', height: 120, background: '#000', border: `2px solid ${isProcessing ? 'var(--yellow)' : 'var(--border)'}`,
                color: 'var(--brand)', padding: 15, borderRadius: 12, fontSize: '1.1rem',
                fontFamily: 'monospace', outline: 'none', transition: 'all 0.3s'
              }}
            />
            <p style={{ fontSize: '0.75rem', opacity: 0.5, marginTop: 8 }}>Auto-verifies orders found in the queue.</p>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20 }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', opacity: 0.7 }}>Last Actions</h4>
            <div style={{ maxHeight: 400, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {results.map((r, i) => {
                let borderColor = 'var(--red)'
                if (r.status.includes('✅')) borderColor = 'var(--green)'
                if (r.status.includes('⚠️')) borderColor = 'var(--yellow)'
                
                return (
                  <div key={i} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, fontSize: '0.8rem', borderLeft: `3px solid ${borderColor}` }}>
                    <div style={{ fontWeight: 700 }}>{r.tracking}</div>
                    <div style={{ opacity: 0.7 }}>{r.status} | {r.shopifyStatus}</div>
                  </div>
                )
              })}
              {results.length === 0 && <div style={{ opacity: 0.3, fontSize: '0.8rem', textAlign: 'center' }}>No recent scans</div>}
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
                      </td>
                      <td style={{ fontFamily: 'monospace' }}>{row.tracking_number}</td>
                      <td>
                        <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--red)' }}>{row.delivery_status}</span>
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
                      <td colSpan="5" style={{ textAlign: 'center', padding: '40px', opacity: 0.4 }}>No pending returns.</td>
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
                      </td>
                      <td style={{ fontFamily: 'monospace' }}>{row.tracking_number}</td>
                      <td style={{ fontWeight: 600 }}>{row.processed_by}</td>
                      <td>
                        <span className="badge" style={{ background: row.restocked_shopify ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: row.restocked_shopify ? 'var(--green)' : 'var(--red)' }}>
                          {row.restocked_shopify ? '✅ Yes' : '❌ No'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filteredHistory.length === 0 && (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', padding: '40px', opacity: 0.4 }}>No history records found.</td>
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
