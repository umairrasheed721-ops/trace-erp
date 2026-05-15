import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { useApp } from '../context/AppContext'

export default function PayoutReconciler() {
  const { addToast, activeStoreId } = useApp()
  const [cprReference, setCprReference] = useState('')
  const [settlementDate, setSettlementDate] = useState(new Date().toISOString().split('T')[0])
  const [courier, setCourier] = useState('PostEx')
  const [rawData, setRawData] = useState([])
  const [normalizedData, setNormalizedData] = useState([])
  const [isProcessing, setIsProcessing] = useState(false)
  const fileInputRef = useRef(null)

  // Mapping Logic for PostEx
  const processPostEx = (rows) => {
    return rows.map(row => {
      // Find columns by name (PostEx headers can vary slightly)
      const ref = row.ORDER_REF || row.Order_Ref || ''
      const track = row.TRACKING_NUME || row.Tracking_Number || ''
      const status = String(row.STATUS || '').toLowerCase().includes('delivered') ? 'D' : 'R'
      
      const cod = parseFloat(row.RESERVE_AN || row.COD_AMOUNT || 0)
      const ship = parseFloat(row.SHIPPING_CH || row.Shipping_Charges || 0)
      const gst = parseFloat(row.GST || 0)
      const incomeTax = parseFloat(row.WH_INCOME_ || row.WH_INCOME_TAX || 0)
      const salesTax = parseFloat(row.WH_SALES_1 || row.WH_SALES_TAX || 0)
      
      // The Formula: Shipping + GST + both 2% Taxes
      const totalExpense = ship + gst + incomeTax + salesTax

      return {
        'Order ID': ref,
        'Tracking Number': track,
        'Status': status,
        'Amount Collected': status === 'D' ? cod : 0,
        'Total Expense': totalExpense.toFixed(2),
        'CPR Reference': cprReference,
        'Settlement Date': settlementDate
      }
    }).filter(r => r['Order ID'] || r['Tracking Number'])
  }

  const handleFileUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return

    setIsProcessing(true)
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result
        const wb = XLSX.read(bstr, { type: 'binary' })
        const wsname = wb.SheetNames[0]
        const ws = wb.Sheets[wsname]
        const data = XLSX.utils.sheet_to_json(ws)
        
        setRawData(data)
        const normalized = courier === 'PostEx' ? processPostEx(data) : data
        setNormalizedData(normalized)
        addToast(`✅ Loaded ${data.length} rows. Ready to convert.`, 'success')
      } catch (err) {
        addToast('Error reading file. Ensure it is a valid CSV or Excel.', 'error')
      } finally {
        setIsProcessing(false)
      }
    }
    reader.readAsBinaryString(file)
  }

  const handleExport = () => {
    if (normalizedData.length === 0) {
      addToast('No data to export', 'error')
      return
    }

    const ws = XLSX.utils.json_to_sheet(normalizedData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Master Settlement")
    
    const fileName = `${courier}_Settlement_${cprReference || 'Export'}_${settlementDate}.xlsx`
    XLSX.writeFile(wb, fileName)
    addToast('📊 Master Excel downloaded!', 'success')
  }

  return (
    <div className="page-container" style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <header className="page-header" style={{ marginBottom: 30 }}>
        <div>
          <h1 className="page-title" style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--brand)' }}>💸 Payout Reconciler</h1>
          <p className="page-subtitle">Convert raw courier payouts into your Master Settlement format instantly.</p>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: 30 }}>
        
        {/* --- LEFT: CONFIG & PREVIEW --- */}
        <div className="card" style={{ padding: 25 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 30 }}>
            <div className="form-group">
              <label className="form-label">Courier</label>
              <select className="form-input" value={courier} onChange={e => setCourier(e.target.value)}>
                <option value="PostEx">PostEx</option>
                <option value="Leopards">Leopards (Coming Soon)</option>
                <option value="TCS">TCS (Coming Soon)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">CPR Reference</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="e.g. CPR-EP24789..." 
                value={cprReference} 
                onChange={e => setCprReference(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Settlement Date</label>
              <input 
                type="date" 
                className="form-input" 
                value={settlementDate} 
                onChange={e => setSettlementDate(e.target.value)}
              />
            </div>
          </div>

          <div 
            style={{ 
              border: '2px dashed var(--border)', 
              borderRadius: 16, 
              padding: 40, 
              textAlign: 'center', 
              background: 'rgba(255,255,255,0.02)',
              cursor: 'pointer',
              transition: 'all 0.3s'
            }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
            onClick={() => fileInputRef.current.click()}
          >
            <div style={{ fontSize: '3rem', marginBottom: 15 }}>📄</div>
            <h3 style={{ margin: 0 }}>{rawData.length > 0 ? 'Change File' : 'Upload Courier CSV / Excel'}</h3>
            <p style={{ opacity: 0.5, marginTop: 10 }}>Drag and drop your raw payout sheet here</p>
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              onChange={handleFileUpload}
              accept=".csv, .xlsx, .xls"
            />
          </div>

          {normalizedData.length > 0 && (
            <div style={{ marginTop: 40 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ margin: 0 }}>Preview (First 10 rows)</h3>
                <button className="btn btn-brand" onClick={handleExport}>
                  📥 Download Master Excel ({normalizedData.length} rows)
                </button>
              </div>
              <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--border)' }}>
                <table className="order-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Ref</th>
                      <th>Tracking</th>
                      <th>Status</th>
                      <th>Amount</th>
                      <th>Expense</th>
                      <th>CPR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {normalizedData.slice(0, 10).map((row, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 700 }}>{row['Order ID']}</td>
                        <td style={{ fontFamily: 'monospace' }}>{row['Tracking Number']}</td>
                        <td>
                          <span className="badge" style={{ 
                            background: row.Status === 'D' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            color: row.Status === 'D' ? 'var(--green)' : 'var(--red)'
                          }}>
                            {row.Status}
                          </span>
                        </td>
                        <td>{row['Amount Collected']}</td>
                        <td>{row['Total Expense']}</td>
                        <td style={{ fontSize: '0.75rem', opacity: 0.7 }}>{row['CPR Reference']}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* --- RIGHT: INSTRUCTIONS --- */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card" style={{ padding: 20 }}>
            <h4 style={{ margin: '0 0 15px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '1.2rem' }}>ℹ️</span> Instructions
            </h4>
            <ul style={{ paddingLeft: 20, fontSize: '0.85rem', opacity: 0.8, lineHeight: 1.6 }}>
              <li>Download the raw settlement sheet from PostEx portal.</li>
              <li>Type the <b>CPR Reference</b> and <b>Date</b> above.</li>
              <li>Upload the file—the tool will automatically calculate the 4% taxes.</li>
              <li>Download your <b>Master Excel</b> and save it to your records.</li>
            </ul>
          </div>

          <div className="card" style={{ padding: 20, background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#3b82f6' }}>PostEx Formula Used:</h4>
            <p style={{ fontSize: '0.8rem', margin: 0, opacity: 0.9 }}>
              Expense = <code>SHIPPING_CH</code> + <code>GST</code> + <code>WH_INCOME_TAX (2%)</code> + <code>WH_SALES_TAX (2%)</code>
            </p>
          </div>
        </div>

      </div>
    </div>
  )
}
