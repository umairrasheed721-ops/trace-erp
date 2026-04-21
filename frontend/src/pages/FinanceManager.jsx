import { useState } from 'react'
import { useApp } from '../context/AppContext'

export default function FinanceManager() {
  const { activeStoreId } = useApp()
  const [pasteData, setPasteData] = useState('')
  const [masterKey, setMasterKey] = useState('Match by Tracking Number')
  const [syncToShopify, setSyncToShopify] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [results, setResults] = useState([])
  const [summary, setSummary] = useState(null)

  const handleProcess = async () => {
    if (!activeStoreId) return alert('No active store selected')
    const lines = pasteData.split('\n').filter(l => l.trim())
    if (lines.length === 0) return alert('No data pasted')

    // Parse pasted Excel data (tab-separated usually)
    const parsedRows = []
    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split('\t')
      // Simple heuristic: if row doesn't have at least 5 parts, or if it looks like a header, skip
      if (parts.length < 5) continue
      
      const orderIdStr = String(parts[0] || '').toLowerCase()
      if (orderIdStr.includes('order id') || orderIdStr.includes('tracking')) continue

      parsedRows.push({
        orderId: parts[0] ? parts[0].trim() : '',
        trackingNumber: parts[1] ? parts[1].trim() : '',
        type: parts[2] ? parts[2].trim().charAt(0).toUpperCase() : '', // 'D' or 'R'
        codAmount: parseFloat(parts[3]) || 0,
        charges: parseFloat(parts[4]) || 0,
        ref: parts[5] ? parts[5].trim() : '',
        date: parts[6] ? parts[6].trim() : ''
      })
    }

    if (parsedRows.length === 0) return alert('Could not parse any valid rows. Please ensure you paste columns: Order ID, Tracking, Type (D/R), COD Amount, Charges, Ref, Date.')

    setIsProcessing(true)
    setSummary(null)
    setResults([])

    try {
      // Chunking logic to prevent 503 timeouts and respect rate limits
      const CHUNK_SIZE = 10
      const chunks = []
      for (let i = 0; i < parsedRows.length; i += CHUNK_SIZE) {
        chunks.push(parsedRows.slice(i, i + CHUNK_SIZE))
      }

      let allResults = []
      let finalSummary = { processedCount: 0, ghostCount: 0, auditCount: 0 }

      for (let i = 0; i < chunks.length; i++) {
        const res = await fetch(`/api/finance/bulk-update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            store_id: activeStoreId,
            rows: chunks[i],
            masterKey,
            syncToShopify
          })
        })
        
        let data;
        try {
          data = await res.json()
        } catch (e) {
          throw new Error(`Batch ${i+1}/${chunks.length} failed: Invalid response (Status: ${res.status}).`)
        }

        if (data.success) {
          allResults = [...allResults, ...data.results]
          finalSummary.processedCount += data.summary.processedCount
          finalSummary.ghostCount += data.summary.ghostCount
          finalSummary.auditCount += data.summary.auditCount
          
          // Update partial results so user sees progress
          setResults([...allResults])
          setSummary({ ...finalSummary })
        } else {
          throw new Error(`Batch ${i+1}/${chunks.length} Error: ${data.error || 'Unknown'}`)
        }
      }

      setPasteData('')
    } catch (e) {
      alert('Processing Error: ' + e.message)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="page-container" style={{ maxWidth: 1400 }}>
      <header className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">💰 Finance & Payments Manager</h1>
          <p className="page-subtitle">Reconcile COD payouts and returned items from courier settlement sheets.</p>
        </div>
      </header>

      {summary && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
          <div className="stat-card" style={{ flex: 1, backgroundColor: 'rgba(52, 211, 153, 0.1)' }}>
            <h3 style={{ color: '#34d399', margin: '0 0 8px 0' }}>✅ Processed Successfully</h3>
            <div style={{ fontSize: 32, fontWeight: 'bold' }}>{summary.processedCount}</div>
          </div>
          <div className="stat-card" style={{ flex: 1, backgroundColor: 'rgba(239, 68, 68, 0.1)' }}>
            <h3 style={{ color: '#ef4444', margin: '0 0 8px 0' }}>🛑 Ghosts (Not Found)</h3>
            <div style={{ fontSize: 32, fontWeight: 'bold' }}>{summary.ghostCount}</div>
          </div>
          <div className="stat-card" style={{ flex: 1, backgroundColor: 'rgba(245, 158, 11, 0.1)' }}>
            <h3 style={{ color: '#f59e0b', margin: '0 0 8px 0' }}>⚠️ Tracking Mismatches</h3>
            <div style={{ fontSize: 32, fontWeight: 'bold' }}>{summary.auditCount}</div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 24 }}>
        <div style={{ flex: '0 0 350px' }}>
          <div className="stat-card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Master Key</label>
              <select 
                value={masterKey} 
                onChange={e => setMasterKey(e.target.value)}
                style={{
                  width: '100%',
                  padding: 12,
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff',
                  borderRadius: 8
                }}
              >
                <option value="Match by Tracking Number">Match by Tracking Number</option>
                <option value="Match by Order ID">Match by Order ID</option>
              </select>
            </div>

            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 12, 
              padding: '12px 16px',
              backgroundColor: syncToShopify ? 'rgba(52, 211, 153, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: `1px solid ${syncToShopify ? '#34d399' : '#ef4444'}`,
              borderRadius: 8,
              transition: 'all 0.3s ease'
            }}>
              <input 
                type="checkbox" 
                id="syncToShopify" 
                checked={syncToShopify} 
                onChange={e => setSyncToShopify(e.target.checked)} 
                style={{ width: 20, height: 20, cursor: 'pointer' }}
              />
              <label htmlFor="syncToShopify" style={{ 
                fontWeight: 600, 
                cursor: 'pointer',
                color: syncToShopify ? '#34d399' : '#ef4444'
              }}>
                {syncToShopify ? '✅ Sync Updates to Shopify' : '🚫 Update ERP ONLY (Skip Shopify)'}
              </label>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Paste Excel Data</label>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
                Expected columns (tab separated):<br/>
                1. Order ID<br/>
                2. Tracking Number<br/>
                3. Type (D for Delivered, R for Return)<br/>
                4. COD Amount<br/>
                5. Courier Charges<br/>
                6. Reference / CPR<br/>
                7. Date
              </div>
              <textarea
                value={pasteData}
                onChange={e => setPasteData(e.target.value)}
                placeholder="Paste from Excel or Google Sheets here..."
                style={{
                  width: '100%',
                  height: 250,
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff',
                  padding: 16,
                  borderRadius: 12,
                  resize: 'vertical',
                  fontFamily: 'monospace',
                  fontSize: 12,
                  whiteSpace: 'pre'
                }}
              />
            </div>

            <button 
              className="btn btn-primary" 
              onClick={handleProcess} 
              disabled={isProcessing}
              style={{ padding: '16px', fontSize: 16, fontWeight: 'bold', width: '100%' }}
            >
              {isProcessing ? '⏳ Processing Payments...' : '🚀 Process Payments'}
            </button>
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <div className="stat-card" style={{ height: '100%', minHeight: 500, display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ margin: '0 0 16px 0' }}>Detailed Results Log</h3>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {results.length === 0 ? (
                <div style={{ opacity: 0.5, textAlign: 'center', padding: '40px 0' }}>
                  Awaiting input...
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
                      <th style={{ padding: '12px 8px' }}>Order ID</th>
                      <th style={{ padding: '12px 8px' }}>Tracking</th>
                      <th style={{ padding: '12px 8px' }}>Type</th>
                      <th style={{ padding: '12px 8px', textAlign: 'right' }}>COD Amt</th>
                      <th style={{ padding: '12px 8px' }}>Courier</th>
                      <th style={{ padding: '12px 8px', textAlign: 'right' }}>Balance</th>
                      <th style={{ padding: '12px 8px' }}>Status</th>
                      <th style={{ padding: '12px 8px' }}>Rec.</th>
                      <th style={{ padding: '12px 8px', textAlign: 'right' }}>Net Pay</th>
                      <th style={{ padding: '12px 8px', textAlign: 'right' }}>Charges Trick</th>
                      <th style={{ padding: '12px 8px', textAlign: 'right' }}>4% TAX</th>
                      <th style={{ padding: '12px 8px', textAlign: 'right' }}>FINAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '12px 8px' }}>{r.orderId}</td>
                        <td style={{ padding: '12px 8px', fontFamily: 'monospace' }}>{r.trackingNumber}</td>
                        <td style={{ padding: '12px 8px', fontWeight: 'bold', color: r.type === 'D' ? '#34d399' : '#f87171' }}>{r.type}</td>
                        <td style={{ padding: '12px 8px', textAlign: 'right' }}>{r.codAmount}</td>
                        <td style={{ padding: '12px 8px', opacity: 0.8 }}>{r.courierName}</td>
                        <td style={{ padding: '12px 8px', textAlign: 'right', color: '#60a5fa' }}>{r.balance}</td>
                        <td style={{ padding: '12px 8px', fontWeight: 600 }}>
                          <span style={{ 
                            color: r.status.includes('✅') ? '#34d399' : 
                                   r.status.includes('❌') || r.status.includes('🛑') ? '#fca5a5' : '#fcd34d' 
                          }}>
                            {r.status}
                          </span>
                        </td>
                        <td style={{ padding: '12px 8px', opacity: 0.8 }}>{r.recommendation}</td>
                        <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 'bold', color: '#34d399' }}>
                          Rs. {r.netPayout}
                        </td>
                        <td style={{ padding: '12px 8px', textAlign: 'right', opacity: 0.6 }}>{r.chargesTrick}</td>
                        <td style={{ padding: '12px 8px', textAlign: 'right', opacity: 0.6 }}>{r.taxAddOn}</td>
                        <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 600 }}>{r.finalCharges}</td>
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
