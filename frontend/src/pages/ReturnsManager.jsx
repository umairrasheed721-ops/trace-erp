import { useState, useRef, useEffect } from 'react'
import { useApp } from '../context/AppContext'

export default function ReturnsManager() {
  const { activeStoreId } = useApp()
  const [trackingInput, setTrackingInput] = useState('')
  const [updateERP, setUpdateERP] = useState(true)
  const [restockShopify, setRestockShopify] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [results, setResults] = useState([])
  const inputRef = useRef(null)

  useEffect(() => {
    // Auto-focus the input on load for barcode scanners
    inputRef.current?.focus()
  }, [])

  const handleProcess = async () => {
    if (!activeStoreId) return alert('No active store selected')
    const lines = trackingInput.split('\n').map(l => l.trim()).filter(l => l)
    if (lines.length === 0) return alert('No tracking numbers provided')

    setIsProcessing(true)
    
    try {
      const res = await fetch(`/api/finance/returns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: activeStoreId,
          trackingNumbers: lines,
          updateERP,
          restockShopify
        })
      })
      const data = await res.json()
      if (data.success) {
        setResults(data.results)
        setTrackingInput('') // Clear after successful processing
      } else {
        alert('Error: ' + data.error)
      }
    } catch (e) {
      alert('Network Error: ' + e.message)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="page-container">
      <header className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">📦 Unified Returns Manager</h1>
          <p className="page-subtitle">Scan tracking numbers to log RTOs and restock inventory.</p>
        </div>
      </header>

      <div style={{ display: 'flex', gap: 24 }}>
        <div style={{ flex: 1 }}>
          <div className="stat-card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Tracking Numbers (Scan Here)</label>
              <textarea
                ref={inputRef}
                value={trackingInput}
                onChange={e => setTrackingInput(e.target.value)}
                placeholder="Scan or paste tracking numbers here (one per line)..."
                style={{
                  width: '100%',
                  height: 300,
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff',
                  padding: 16,
                  borderRadius: 12,
                  resize: 'none',
                  fontFamily: 'monospace',
                  fontSize: 16
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 24, padding: 16, backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={updateERP} onChange={e => setUpdateERP(e.target.checked)} />
                <span style={{ fontWeight: 500 }}>Update Internal ERP (Mark Return Received)</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={restockShopify} onChange={e => setRestockShopify(e.target.checked)} />
                <span style={{ fontWeight: 500 }}>Restock & Refund 0.00 in Shopify</span>
              </label>
            </div>

            <button 
              className="btn btn-primary" 
              onClick={handleProcess} 
              disabled={isProcessing}
              style={{ padding: '16px', fontSize: 16, fontWeight: 'bold' }}
            >
              {isProcessing ? '⏳ Processing Returns...' : '🚀 Process Returns'}
            </button>
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <div className="stat-card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ margin: '0 0 16px 0' }}>Results Log</h3>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {results.length === 0 ? (
                <div style={{ opacity: 0.5, textAlign: 'center', padding: '40px 0' }}>
                  Awaiting input...
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      <th style={{ padding: '12px 8px' }}>Tracking</th>
                      <th style={{ padding: '12px 8px' }}>ERP Status</th>
                      <th style={{ padding: '12px 8px' }}>Shopify Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '12px 8px', fontFamily: 'monospace' }}>{r.tracking}</td>
                        <td style={{ padding: '12px 8px' }}>
                          <span style={{ color: r.erpStatus.includes('✅') ? '#a7f3d0' : r.erpStatus.includes('❌') ? '#fca5a5' : '#fef08a' }}>
                            {r.erpStatus}
                          </span>
                        </td>
                        <td style={{ padding: '12px 8px' }}>
                           <span style={{ color: r.shopifyStatus.includes('✅') ? '#a7f3d0' : r.shopifyStatus.includes('❌') ? '#fca5a5' : '#fef08a' }}>
                            {r.shopifyStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
