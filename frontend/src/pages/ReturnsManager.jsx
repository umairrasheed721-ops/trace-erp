import { useState, useRef, useEffect, useMemo } from 'react'
import { useApp } from '../context/AppContext'

export default function ReturnsManager() {
  const { activeStoreId, addToast } = useApp()
  const [trackingInput, setTrackingInput] = useState('')
  const [restockShopify, setRestockShopify] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [pendingReturns, setPendingReturns] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [results, setResults] = useState([])
  const inputRef = useRef(null)

  // Load pending returns
  const fetchPending = async () => {
    if (!activeStoreId) return
    try {
      const res = await fetch(`/api/finance/returns/pending?store_id=${activeStoreId}`)
      const data = await res.json()
      setPendingReturns(Array.isArray(data) ? data : [])
    } catch (e) {
      addToast('Failed to load pending returns', 'error')
    }
  }

  useEffect(() => {
    fetchPending()
    inputRef.current?.focus()
  }, [activeStoreId])

  // Filtered list
  const filteredPending = useMemo(() => {
    return pendingReturns.filter(r => 
      r.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.tracking_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.ref_number?.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [pendingReturns, searchTerm])

  const handleBulkVerify = async (idsToVerify) => {
    if (!activeStoreId || idsToVerify.length === 0) return
    setIsProcessing(true)
    try {
      const res = await fetch(`/api/finance/returns/bulk-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: activeStoreId,
          ids: idsToVerify,
          restockShopify
        })
      })
      const data = await res.json()
      if (data.success) {
        addToast(`✅ Successfully processed ${data.results.filter(r => r.status.includes('✅')).length} returns`, 'success')
        setResults(prev => [...data.results, ...prev])
        setSelectedIds([])
        fetchPending()
      }
    } catch (e) {
      addToast('Processing Error: ' + e.message, 'error')
    } finally {
      setIsProcessing(false)
    }
  }

  // Handle Scanning
  const handleScanInput = (val) => {
    setTrackingInput(val)
    const lines = val.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length > 0) {
      const lastScan = lines[lines.length - 1]
      // Check if this scan matches any pending return
      const match = pendingReturns.find(r => r.tracking_number === lastScan)
      if (match) {
        // Auto-verify if scanned
        handleBulkVerify([match.id])
        setTrackingInput('') // Clear to ready for next scan
      }
    }
  }

  return (
    <div className="page-container" style={{ maxWidth: '1600px', margin: '0 auto' }}>
      <header className="page-header" style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title" style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--brand)' }}>📦 Smart Returns Hub</h1>
          <p className="page-subtitle">Expected returns from couriers are listed below. Scan parcels to auto-verify.</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.05)', padding: '8px 16px', borderRadius: 12, cursor: 'pointer', border: '1px solid var(--border)' }}>
            <input type="checkbox" checked={restockShopify} onChange={e => setRestockShopify(e.target.checked)} />
            <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Restock & Refund in Shopify</span>
          </label>
          <button className="btn btn-secondary" onClick={fetchPending}>🔄 Refresh Queue</button>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: 24, alignItems: 'start' }}>
        
        {/* --- LEFT: SCANNER MODULE --- */}
        <div className="card" style={{ padding: 20, position: 'sticky', top: 20 }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 12, height: 12, background: 'var(--brand)', borderRadius: '50%', boxShadow: '0 0 10px var(--brand)' }}></div>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>Parcel Scanner</h3>
            </div>
            <textarea
              ref={inputRef}
              value={trackingInput}
              onChange={e => handleScanInput(e.target.value)}
              placeholder="Scan tracking barcode..."
              style={{
                width: '100%', height: 120, background: '#000', border: '2px solid var(--border)',
                color: 'var(--brand)', padding: 15, borderRadius: 12, fontSize: '1.1rem',
                fontFamily: 'monospace', outline: 'none', transition: 'border-color 0.3s'
              }}
              onFocus={(e) => e.target.style.borderColor = 'var(--brand)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
            />
            <p style={{ fontSize: '0.75rem', opacity: 0.5, marginTop: 8 }}>Scanner auto-detects and verifies orders from the queue.</p>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20 }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', opacity: 0.7 }}>Recent History</h4>
            <div style={{ maxHeight: 400, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {results.map((r, i) => (
                <div key={i} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, fontSize: '0.8rem', borderLeft: `3px solid ${r.status.includes('✅') ? 'var(--green)' : 'var(--red)'}` }}>
                  <div style={{ fontWeight: 700 }}>{r.tracking}</div>
                  <div style={{ opacity: 0.7 }}>{r.status} | {r.shopifyStatus}</div>
                </div>
              ))}
              {results.length === 0 && <div style={{ opacity: 0.3, fontSize: '0.8rem', textAlign: 'center' }}>No scans yet</div>}
            </div>
          </div>
        </div>

        {/* --- RIGHT: APPROVAL QUEUE --- */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Expected Returns <span style={{ opacity: 0.5, fontWeight: 400 }}>({pendingReturns.length})</span></h3>
              <input 
                type="text" 
                placeholder="Search queue..." 
                className="form-input" 
                style={{ width: 250, padding: '6px 12px' }}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            {selectedIds.length > 0 && (
              <button 
                className="btn btn-brand" 
                onClick={() => handleBulkVerify(selectedIds)}
                disabled={isProcessing}
              >
                🚀 Verify {selectedIds.length} Selected
              </button>
            )}
          </div>

          <div style={{ overflowX: 'auto', maxHeight: '75vh' }}>
            <table className="order-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: 40, padding: '12px 20px' }}>
                    <input 
                      type="checkbox" 
                      onChange={e => setSelectedIds(e.target.checked ? filteredPending.map(p => p.id) : [])}
                      checked={selectedIds.length > 0 && selectedIds.length === filteredPending.length}
                    />
                  </th>
                  <th>Order Info</th>
                  <th>Tracking</th>
                  <th>Courier Status</th>
                  <th>Days Since Order</th>
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
                      />
                    </td>
                    <td>
                      <div style={{ fontWeight: 700 }}>{row.ref_number || row.shopify_order_id}</div>
                      <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>{row.customer_name}</div>
                    </td>
                    <td style={{ fontFamily: 'monospace' }}>{row.tracking_number}</td>
                    <td>
                      <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--red)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                        {row.delivery_status}
                      </span>
                      <div style={{ fontSize: '0.65rem', opacity: 0.5, marginTop: 4 }}>{row.courier}</div>
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>
                       {Math.floor((new Date() - new Date(row.order_date)) / (1000 * 60 * 60 * 24))} Days
                    </td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => handleBulkVerify([row.id])}>
                        ✅ Verify
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredPending.length === 0 && (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '60px 0', opacity: 0.4 }}>
                      <div style={{ fontSize: '2rem' }}>🙌</div>
                      <div style={{ marginTop: 10 }}>No returns pending for this store.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}
