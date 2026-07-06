import { useState, useRef, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useFinance } from '../context/FinanceContext'

function formatDateToUserFriendly(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const y = parts[0];
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    const shortY = y.slice(-2);
    return `${d}/${m}/${shortY}`;
  }
  return dateStr;
}

function parseDateString(inputStr) {
  if (!inputStr) return null;
  const cleaned = inputStr.trim();
  
  // 1. Try D/M/YY or D/M/YYYY (slash format)
  const slashParts = cleaned.split('/');
  if (slashParts.length === 3) {
    const d = parseInt(slashParts[0], 10);
    const m = parseInt(slashParts[1], 10) - 1;
    let yStr = slashParts[2].trim();
    let y = parseInt(yStr, 10);
    if (yStr.length === 2) {
      y = 2000 + y;
    }
    const testDate = new Date(y, m, d);
    if (!isNaN(testDate.getTime()) && testDate.getDate() === d && testDate.getMonth() === m) {
      const mm = String(m + 1).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      return `${y}-${mm}-${dd}`;
    }
  }

  // 2. Try D-M-YY or D-M-YYYY (dash format)
  const dashParts = cleaned.split('-');
  if (dashParts.length === 3) {
    if (dashParts[0].length === 4) {
      const y = parseInt(dashParts[0], 10);
      const m = parseInt(dashParts[1], 10) - 1;
      const d = parseInt(dashParts[2], 10);
      const testDate = new Date(y, m, d);
      if (!isNaN(testDate.getTime()) && testDate.getDate() === d && testDate.getMonth() === m) {
        const mm = String(m + 1).padStart(2, '0');
        const dd = String(d).padStart(2, '0');
        return `${y}-${mm}-${dd}`;
      }
    } else {
      const d = parseInt(dashParts[0], 10);
      const m = parseInt(dashParts[1], 10) - 1;
      let yStr = dashParts[2].trim();
      let y = parseInt(yStr, 10);
      if (yStr.length === 2) {
        y = 2000 + y;
      }
      const testDate = new Date(y, m, d);
      if (!isNaN(testDate.getTime()) && testDate.getDate() === d && testDate.getMonth() === m) {
        const mm = String(m + 1).padStart(2, '0');
        const dd = String(d).padStart(2, '0');
        return `${y}-${mm}-${dd}`;
      }
    }
  }

  // 3. Fallback: Try native Date parsing
  const native = new Date(cleaned);
  if (!isNaN(native.getTime())) {
    const y = native.getFullYear();
    const mm = String(native.getMonth() + 1).padStart(2, '0');
    const dd = String(native.getDate()).padStart(2, '0');
    return `${y}-${mm}-${dd}`;
  }

  return null;
}

export default function PayoutReconciler() {
  const { addToast, activeStoreId } = useApp()
  const { setPasteData, setMasterKey } = useFinance()
  const navigate = useNavigate()
  
  // Navigation & Modes
  const [activeTab, setActiveTab] = useState('manual') // 'manual' | 'api' | 'lookup'

  // Track & Lookup State
  const [lookupTracking, setLookupTracking] = useState('')
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupResult, setLookupResult] = useState(null)
  const [lookupError, setLookupError] = useState('')

  const handleTrackLookup = async () => {
    if (!lookupTracking.trim()) return
    setLookupLoading(true)
    setLookupResult(null)
    setLookupError('')
    try {
      const res = await fetch(`/api/finance/track-lookup?store_id=${activeStoreId}&tracking_number=${encodeURIComponent(lookupTracking.trim())}`)
      const data = await res.json()
      if (!res.ok || !data.success) {
        setLookupError(data.error || 'Something went wrong')
      } else {
        setLookupResult(data)
      }
    } catch (e) {
      setLookupError('Network error: ' + e.message)
    } finally {
      setLookupLoading(false)
    }
  }

  // Common Form State
  const [cprReference, setCprReference] = useState('')
  const [settlementDate, setSettlementDate] = useState(new Date().toISOString().split('T')[0])
  const [dateInputText, setDateInputText] = useState(formatDateToUserFriendly(new Date().toISOString().split('T')[0]))
  const [courier, setCourier] = useState('PostEx')

  // Sync dateInputText if settlementDate changes externally (e.g. reset or manual fetch)
  useEffect(() => {
    setDateInputText(formatDateToUserFriendly(settlementDate))
  }, [settlementDate])

  const handleDateChange = (val) => {
    setDateInputText(val);
    const parsed = parseDateString(val);
    if (parsed) {
      setSettlementDate(parsed);
      if (activeTab === 'manual') updateNormalizedData(cprReference, parsed);
    }
  };

  const handleDateBlur = () => {
    const parsed = parseDateString(dateInputText);
    if (parsed) {
      setDateInputText(formatDateToUserFriendly(parsed));
      setSettlementDate(parsed);
      if (activeTab === 'manual') updateNormalizedData(cprReference, parsed);
    } else {
      setDateInputText(formatDateToUserFriendly(settlementDate));
    }
  };
  
  // Manual Upload State
  const [rawData, setRawData] = useState([])
  const [normalizedData, setNormalizedData] = useState([])
  const [isProcessing, setIsProcessing] = useState(false)
  const fileInputRef = useRef(null)
  const workbookRef = useRef(null)

  // Live API State
  const [liveOrders, setLiveOrders] = useState([])
  const [isFetchingLive, setIsFetchingLive] = useState(false)
  const [liveSource, setLiveSource] = useState('')
  const [actualBankDeposit, setActualBankDeposit] = useState('')
  const [isLocking, setIsLocking] = useState(false)
  const [discrepancyReason, setDiscrepancyReason] = useState('Courier Overcharge / Disputed Fee')
  const [disputeNotes, setDisputeNotes] = useState('')

  // CPR Ledger State
  const [ledger, setLedger] = useState([])
  const [isLoadingLedger, setIsLoadingLedger] = useState(false)

  // Fetch initial data
  useEffect(() => {
    if (activeStoreId) {
      fetchLedger()
    }
  }, [activeStoreId])

  const fetchLedger = async () => {
    setIsLoadingLedger(true)
    try {
      const res = await fetch(`/api/finance/cpr-ledger?store_id=${activeStoreId}`)
      if (res.ok) {
        const data = await res.json()
        setLedger(data)
      }
    } catch (e) {
      console.error('Failed to fetch ledger', e)
    } finally {
      setIsLoadingLedger(false)
    }
  }



  // --- MANUAL UPLOAD LOGIC ---
  const processPostEx = (rows, cpr, date) => {
    return rows.map(row => {
      const ref = row.ORDER_REF_NUMBER || row.ORDER_REF || row.Order_Ref || row['Order Reference'] || ''
      const track = row.TRACKING_NUMBER || row.TRACKING_NUME || row.Tracking_Number || row['Tracking ID'] || ''
      const status = String(row.STATUS || row.Status || '').toLowerCase().includes('delivered') ? 'D' : 'R'
      
      const cod = parseFloat(row.COD_AMOUNT || 0)
      const reserve = parseFloat(row.RESERVE_AMOUNT || row.RESERVE_AM || row.RESERVE_AN || row.COD_AMOUNT || 0)
      
      const ship = parseFloat(row.SHIPPING_CHARGES || row.SHIPPING_CH || row.Shipping_Charges || 0)
      const gst = parseFloat(row.GST || row.GST_Amount || 0)
      const incomeTax = parseFloat(row['WH_INCOME_TAX (2%)'] || row.WH_INCOME_ || row.WH_INCOME_TAX || 0)
      const salesTax = parseFloat(row['WH_SALES_TAX (2%)'] || row.WH_SALES_1 || row.WH_SALES_TAX || 0)
      
      const rowCpr = row.PAYMENT_REFERENCE || row.CPR || row.CPR_Reference || row['Payment Reference'] || ''
      const totalExpense = ship + gst + incomeTax + salesTax

      return {
        'Order ID': String(ref).trim(),
        'Tracking Number': String(track).trim(),
        'Status': status,
        'Amount Collected': status === 'D' ? cod : 0,
        'Reserve Amount': reserve,
        'Total Expense': totalExpense.toFixed(2),
        'CPR Reference': (rowCpr || cpr).trim(),
        'Settlement Date': date
      }
    }).filter(r => r['Order ID'] && r['Order ID'] !== 'undefined')
  }

  const processInstaworld = (wb, cpr, date) => {
    const sheetNames = wb.SheetNames;
    const serviceChargesSheetName = sheetNames.find(name => name.toLowerCase().replace(/[\s\-_]+/g, '').includes('servicecharge'));
    const codPayableSheetName = sheetNames.find(name => name.toLowerCase().replace(/[\s\-_]+/g, '').includes('codpayable') || name.toLowerCase().includes('cod'));

    if (!serviceChargesSheetName && !codPayableSheetName) {
      throw new Error("Could not find either 'Service Charges' or 'COD Payable' sheet in the workbook.");
    }

    const serviceRows = serviceChargesSheetName ? XLSX.utils.sheet_to_json(wb.Sheets[serviceChargesSheetName]) : [];
    const codRows = codPayableSheetName ? XLSX.utils.sheet_to_json(wb.Sheets[codPayableSheetName]) : [];

    const trackingMap = {};

    const findVal = (row, keys) => {
      const rowKeys = Object.keys(row);
      for (const k of keys) {
        if (row[k] !== undefined) return row[k];
        const matchedKey = rowKeys.find(rk => rk.toLowerCase().replace(/[\s\-_]+/g, '') === k.toLowerCase().replace(/[\s\-_]+/g, ''));
        if (matchedKey !== undefined) return row[matchedKey];
      }
      return undefined;
    };

    serviceRows.forEach(row => {
      const track = findVal(row, ['Tracking Number', 'TrackingID', 'Tracking ID', 'TrackingNumber', 'awb', 'AWB', 'Tracking_Number', 'CN']);
      const ref = findVal(row, ['Reference Number', 'Reference_Number', 'ReferenceNumber', 'Ref No', 'Ref_No', 'Order Reference', 'Order ID', 'Order_ID', 'OrderId', 'Order ID / Ref No']);
      
      let dc = parseFloat(findVal(row, ['TotalAmount', 'Total Amount', 'Amount', 'Charges'])) || 0;
      if (!dc) {
        const sc = parseFloat(findVal(row, ['Service Charges', 'Service_Charges', 'ServiceCharges'])) || 0;
        const fc = parseFloat(findVal(row, ['Fuel Charges', 'FuelCharges'])) || 0;
        const gst = parseFloat(findVal(row, ['GST', 'Gst', 'Sales Tax'])) || 0;
        dc = sc + fc + gst;
      }

      if (track) {
        const cleanTrack = String(track).trim();
        trackingMap[cleanTrack] = {
          orderId: ref ? String(ref).trim() : '',
          trackingNumber: cleanTrack,
          dcFee: dc,
          codAmount: 0,
          isDelivered: false
        };
      }
    });

    codRows.forEach(row => {
      const track = findVal(row, ['Tracking Number', 'TrackingID', 'Tracking ID', 'TrackingNumber', 'awb', 'AWB', 'Tracking_Number', 'CN']);
      const ref = findVal(row, ['Reference Number', 'Reference_Number', 'ReferenceNumber', 'Ref No', 'Ref_No', 'Order Reference', 'Order ID', 'Order_ID', 'OrderId', 'Order ID / Ref No']);
      const cod = parseFloat(findVal(row, ['COD Amount', 'COD_Amount', 'CODAmount', 'Net Payable', 'NetPayable', 'COD', 'AmountCollected', 'Amount Collected'])) || 0;

      if (track) {
        const cleanTrack = String(track).trim();
        if (trackingMap[cleanTrack]) {
          trackingMap[cleanTrack].codAmount = cod;
          trackingMap[cleanTrack].isDelivered = true;
          if (ref && !trackingMap[cleanTrack].orderId) {
            trackingMap[cleanTrack].orderId = String(ref).trim();
          }
        } else {
          trackingMap[cleanTrack] = {
            orderId: ref ? String(ref).trim() : '',
            trackingNumber: cleanTrack,
            dcFee: 0,
            codAmount: cod,
            isDelivered: true
          };
        }
      }
    });

    return Object.values(trackingMap).map(item => {
      const calculatedTax = item.isDelivered ? Math.round((item.codAmount * 0.04) * 100) / 100 : 0;
      const totalExpense = item.dcFee + calculatedTax;
      const status = item.isDelivered ? 'D' : 'R';

      return {
        'Order ID': item.orderId,
        'Tracking Number': item.trackingNumber,
        'Status': status,
        'Amount Collected': item.isDelivered ? item.codAmount : 0,
        'Total Expense': totalExpense.toFixed(2),
        'CPR Reference': (cpr || '').trim(),
        'Settlement Date': date
      };
    }).filter(r => r['Order ID'] && r['Order ID'] !== 'undefined');
  };

  const updateNormalizedData = (cpr, date) => {
    if (courier.toLowerCase().includes('insta')) {
      if (workbookRef.current) {
        const normalized = processInstaworld(workbookRef.current, cpr, date);
        setNormalizedData(normalized);
      }
    } else {
      if (rawData.length > 0) {
        const normalized = courier === 'PostEx' ? processPostEx(rawData, cpr, date) : rawData;
        setNormalizedData(normalized);
      }
    }
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
        workbookRef.current = wb;
        
        let normalized = []
        if (courier.toLowerCase().includes('insta')) {
          normalized = processInstaworld(wb, cprReference, settlementDate)
          setRawData(normalized)
        } else {
          const wsname = wb.SheetNames[0]
          const ws = wb.Sheets[wsname]
          const data = XLSX.utils.sheet_to_json(ws)
          setRawData(data)
          normalized = courier === 'PostEx' ? processPostEx(data, cprReference, settlementDate) : data
        }
        
        setNormalizedData(normalized)

        if (normalized.length === 0) {
          addToast('⚠️ No valid Order IDs found in this file. Check headers.', 'warn')
        } else {
          addToast(`✅ Found ${normalized.length} valid orders.`, 'success')
        }
      } catch (err) {
        console.error(err)
        addToast(err.message || 'Error reading file.', 'error')
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

  const handleProceedToFinanceEngine = () => {
    if (normalizedData.length === 0) {
      addToast('No data to proceed with', 'error')
      return
    }

    const tsv = normalizedData.map(row => [
      row['Order ID'] || '',
      row['Tracking Number'] || '',
      row['Status'] || '',
      row['Amount Collected'] || 0,
      row['Total Expense'] || 0,
      row['CPR Reference'] || '',
      row['Settlement Date'] || ''
    ].join('\t')).join('\n')

    setPasteData(tsv)
    setMasterKey('Match by Order ID')
    addToast(`🚀 Transferred ${normalizedData.length} orders to Finance Engine!`, 'success')
    navigate('/finance')
  }

  // --- LIVE API LOGIC ---
  const handleFetchLive = async () => {
    if (!cprReference) {
      addToast('⚠️ Please enter a CPR Reference ID first', 'warn')
      return
    }

    setIsFetchingLive(true)
    try {
      const res = await fetch(`/api/finance/fetch-live-payouts?store_id=${activeStoreId}&courier=${courier}&cpr=${encodeURIComponent(cprReference)}`)
      const data = await res.json()
      if (data.success) {
        setLiveOrders(data.orders)
        setLiveSource(data.source)
        if (data.orders.length === 0) {
          addToast(`⚠️ No orders found for CPR ${cprReference}`, 'warn')
        } else {
          addToast(`✅ Fetched ${data.orders.length} orders via ${data.source}`, 'success')
        }
      } else {
        addToast(data.error || 'Failed to fetch live payouts', 'error')
      }
    } catch (e) {
      addToast('Error fetching live payouts', 'error')
    } finally {
      setIsFetchingLive(false)
    }
  }

  const calcLiveTotals = () => {
    let totalCod = 0
    let totalExpense = 0
    let totalReserve = 0
    liveOrders.forEach(ord => {
      totalCod += parseFloat(ord['Amount Collected']) || 0
      totalExpense += parseFloat(ord['Total Expense']) || 0
      const reserve = ord['Reserve Amount'] !== undefined ? parseFloat(ord['Reserve Amount']) : parseFloat(ord['Amount Collected'])
      totalReserve += isNaN(reserve) ? 0 : reserve
    })
    const netPayout = totalReserve - totalExpense
    return { totalCod, totalExpense, netPayout }
  }

  const { totalCod, totalExpense, netPayout } = calcLiveTotals()
  const discrepancyAmount = actualBankDeposit ? (parseFloat(actualBankDeposit) - parseFloat(netPayout.toFixed(2))).toFixed(2) : 0
  const hasDiscrepancy = actualBankDeposit && parseFloat(discrepancyAmount) !== 0
  const auditStatus = hasDiscrepancy ? 'DISPUTED' : 'CLEARED'

  const handleLockCpr = async () => {
    if (!actualBankDeposit) {
      addToast('⚠️ Please enter the Actual Bank Deposit amount before locking!', 'warn')
      return
    }

    setIsLocking(true)
    try {
      const res = await fetch('/api/finance/lock-cpr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: activeStoreId,
          courier,
          cpr: cprReference,
          settlementDate,
          totalOrders: liveOrders.length,
          totalCod,
          totalExpense,
          netPayout,
          actualBankDeposit,
          discrepancyAmount,
          discrepancyReason: hasDiscrepancy ? `${discrepancyReason} - ${disputeNotes}` : null,
          auditStatus,
          orders: liveOrders
        })
      })
      const data = await res.json()
      if (data.success) {
        addToast('🔒 ' + data.message, 'success')
        setLiveOrders([])
        setActualBankDeposit('')
        setDisputeNotes('')
        fetchLedger() // Refresh ledger
      } else {
        addToast(data.error || 'Failed to lock CPR', 'error')
      }
    } catch (e) {
      addToast('Error locking CPR', 'error')
    } finally {
      setIsLocking(false)
    }
  }

  const handleExportDispute = (batch) => {
    const wsData = [
      { 'Field': 'CPR Reference ID', 'Value': batch.cpr_reference },
      { 'Field': 'Courier', 'Value': batch.courier },
      { 'Field': 'Settlement Date', 'Value': batch.settlement_date },
      { 'Field': 'Expected Net Payout', 'Value': `Rs. ${parseFloat(batch.net_payout || 0).toLocaleString()}` },
      { 'Field': 'Actual Bank Deposit', 'Value': `Rs. ${parseFloat(batch.actual_bank_deposit || 0).toLocaleString()}` },
      { 'Field': 'Discrepancy Amount', 'Value': `Rs. ${parseFloat(batch.discrepancy_amount || 0).toLocaleString()}` },
      { 'Field': 'Dispute Reason & Notes', 'Value': batch.discrepancy_reason || 'N/A' },
      { 'Field': 'Audit Status', 'Value': batch.audit_status },
      { 'Field': 'Locked Timestamp', 'Value': new Date(batch.created_at).toLocaleString() }
    ]
    const ws = XLSX.utils.json_to_sheet(wsData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Dispute Summary")
    
    const fileName = `Dispute_Report_${batch.courier}_${batch.cpr_reference}.xlsx`
    XLSX.writeFile(wb, fileName)
    addToast('📥 Dispute Report downloaded successfully!', 'success')
  }

  return (
    <div className="page-container" style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: 60 }}>
      
      {/* --- HEADER --- */}
      <header className="page-header" style={{ marginBottom: 30, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title" style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--brand)', display: 'flex', alignItems: 'center', gap: 12 }}>
            💸 Payout Reconciler
            <span className="badge" style={{ fontSize: '0.8rem', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', padding: '4px 10px' }}>
              Phase 2: Zero-Trust Model
            </span>
          </h1>
          <p className="page-subtitle">Reconcile courier payouts with bank-level verification and zero-trust audit locking.</p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => navigate('/finance')}>
            💰 Go to Finance Engine
          </button>
        </div>
      </header>

      {/* --- MODE SWITCHER TABS --- */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 30, borderBottom: '1px solid var(--border)', paddingBottom: 15 }}>
        <button 
          className={`btn ${activeTab === 'api' ? 'btn-brand' : ''}`} 
          style={{ padding: '10px 20px', borderRadius: 8, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, background: activeTab === 'api' ? 'var(--brand)' : 'transparent', color: activeTab === 'api' ? '#fff' : 'var(--text)' }}
          onClick={() => setActiveTab('api')}
        >
          ⚡ Live API Mode (CPR-Driven)
        </button>
        <button 
          className={`btn ${activeTab === 'manual' ? 'btn-brand' : ''}`} 
          style={{ padding: '10px 20px', borderRadius: 8, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, background: activeTab === 'manual' ? 'var(--brand)' : 'transparent', color: activeTab === 'manual' ? '#fff' : 'var(--text)' }}
          onClick={() => setActiveTab('manual')}
        >
          📄 Manual Upload Mode (Fallback)
        </button>
        <button 
          className={`btn ${activeTab === 'lookup' ? 'btn-brand' : ''}`} 
          style={{ padding: '10px 20px', borderRadius: 8, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, background: activeTab === 'lookup' ? 'var(--brand)' : 'transparent', color: activeTab === 'lookup' ? '#fff' : 'var(--text)' }}
          onClick={() => setActiveTab('lookup')}
        >
          🔍 Track & Lookup
        </button>
      </div>

      {/* === TAB: TRACK & LOOKUP === */}
      {activeTab === 'lookup' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Search Box */}
          <div className="card" style={{ padding: 28 }}>
            <h3 style={{ margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: 8 }}>🔍 Track & Lookup</h3>
            <p style={{ fontSize: '0.85rem', opacity: 0.7, margin: '0 0 22px 0' }}>Enter a PostEx tracking number to find its CPR settlement details.</p>
            <div style={{ display: 'flex', gap: 12 }}>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. 20120050024566"
                value={lookupTracking}
                onChange={e => setLookupTracking(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleTrackLookup()}
                style={{ flex: 1, fontSize: '1rem', fontWeight: 600 }}
              />
              <button
                className="btn btn-brand"
                style={{ padding: '10px 28px', fontWeight: 700, fontSize: '1rem' }}
                onClick={handleTrackLookup}
                disabled={lookupLoading}
              >
                {lookupLoading ? '⏳ Searching...' : '🔍 Lookup'}
              </button>
            </div>
            {lookupError && (
              <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, color: 'var(--red)', fontWeight: 600 }}>
                ❌ {lookupError}
              </div>
            )}
          </div>

          {/* Result Card */}
          {lookupResult && (() => {
            const { order, matchedCpr } = lookupResult
            const isDelivered = (order.status || '').toLowerCase().includes('deliver')
            const netAmount = (order.reservePayment || order.invoicePayment || 0) - (order.transactionFee || 0) - (order.transactionTax || 0)
            return (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                {/* Order Details */}
                <div className="card" style={{ padding: 24, border: '2px solid var(--border)' }}>
                  <h4 style={{ margin: '0 0 18px 0', color: 'var(--brand)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    📦 Order Details
                    <span className="badge" style={{ background: isDelivered ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: isDelivered ? 'var(--green)' : 'var(--red)' }}>{order.status}</span>
                  </h4>
                  <table style={{ width: '100%', fontSize: '0.9rem', borderCollapse: 'collapse' }}>
                    <tbody>
                      {[
                        ['Tracking #', order.trackingNumber],
                        ['Order Ref', order.orderRef || '—'],
                        ['Customer', order.customerName || '—'],
                        ['City', order.cityName || '—'],
                        ['Delivery Date', order.orderDeliveryDate ? new Date(order.orderDeliveryDate).toLocaleDateString('en-PK') : '—'],
                        ['COD / Invoice', `Rs. ${parseFloat(order.invoicePayment || 0).toLocaleString()}`],
                        ['Reserve Amount', `Rs. ${parseFloat(order.reservePayment || 0).toLocaleString()}`],
                        ['Courier Fee', `Rs. ${parseFloat(order.transactionFee || 0).toLocaleString()}`],
                        ['GST (Tax)', `Rs. ${parseFloat(order.transactionTax || 0).toLocaleString()}`],
                        ['Net Payout (Est.)', `Rs. ${netAmount.toLocaleString('en-PK', { maximumFractionDigits: 2 })}`],
                      ].map(([label, val]) => (
                        <tr key={label} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px 0', opacity: 0.6, width: '45%' }}>{label}</td>
                          <td style={{ padding: '8px 0', fontWeight: 600 }}>{val}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* CPR / Settlement Details */}
                <div className="card" style={{ padding: 24, border: matchedCpr ? '2px solid rgba(34,197,94,0.4)' : '2px dashed var(--border)' }}>
                  <h4 style={{ margin: '0 0 18px 0', color: matchedCpr ? 'var(--green)' : 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    💸 Settlement / CPR Info
                    {matchedCpr
                      ? <span className="badge" style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--green)' }}>✅ Matched in Ledger</span>
                      : <span className="badge" style={{ background: 'rgba(250,204,21,0.1)', color: '#ca8a04' }}>⚠️ Not Locked Yet</span>
                    }
                  </h4>
                  <table style={{ width: '100%', fontSize: '0.9rem', borderCollapse: 'collapse' }}>
                    <tbody>
                      {[
                        ['Settlement Date', order.settlementDate ? order.settlementDate : '—'],
                        ['Reserve Payment Date', order.reservePaymentDate ? new Date(order.reservePaymentDate).toLocaleString('en-PK') : '—'],
                        matchedCpr && ['CPR Reference', matchedCpr.cpr_reference],
                        matchedCpr && ['Courier', matchedCpr.courier],
                        matchedCpr && ['Locked Net Payout', `Rs. ${parseFloat(matchedCpr.net_payout || 0).toLocaleString()}`],
                        matchedCpr && ['Actual Deposit', `Rs. ${parseFloat(matchedCpr.actual_bank_deposit || 0).toLocaleString()}`],
                        matchedCpr && ['Audit Status', matchedCpr.audit_status],
                      ].filter(Boolean).map(([label, val]) => (
                        <tr key={label} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px 0', opacity: 0.6, width: '45%' }}>{label}</td>
                          <td style={{ padding: '8px 0', fontWeight: 600 }}>{val}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!matchedCpr && order.settlementDate && (
                    <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(250,204,21,0.06)', border: '1px solid rgba(250,204,21,0.3)', borderRadius: 8, fontSize: '0.82rem', color: '#92400e' }}>
                      💡 Payment settled on <b>{order.settlementDate}</b> but this CPR has not been locked in the ledger yet. Use <b>Live API Mode</b> to reconcile it.
                    </div>
                  )}
                </div>
              </div>
            )
          })()}
        </div>
      )}

      <div style={{ display: activeTab === 'lookup' ? 'none' : 'grid', gridTemplateColumns: '1fr 350px', gap: 30 }}>
        
        {/* --- LEFT: MAIN WORKSPACE --- */}
        <div className="card" style={{ padding: 25, display: activeTab === 'lookup' ? 'none' : undefined }}>
          
          {/* COMMON CONFIG */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 30 }}>
            <div className="form-group">
              <label className="form-label">Courier</label>
              <select 
                className="form-input" 
                value={courier} 
                onChange={e => {
                  setCourier(e.target.value)
                  setRawData([])
                  setNormalizedData([])
                  workbookRef.current = null
                  if (fileInputRef.current) fileInputRef.current.value = ''
                }}
              >
                <option value="PostEx">PostEx</option>
                <option value="Instaworld (TCS & LCS)">Instaworld (TCS & LCS)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">CPR Reference ID</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="e.g. CPR-EP24789..." 
                value={cprReference} 
                onChange={e => {
                  setCprReference(e.target.value)
                  if (activeTab === 'manual') updateNormalizedData(e.target.value, settlementDate)
                }}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Settlement Date</label>
              <input 
                type="text" 
                className="form-input" 
                value={dateInputText} 
                onChange={e => handleDateChange(e.target.value)}
                onBlur={handleDateBlur}
                placeholder="d/m/yy (e.g. 6/5/26)"
              />
            </div>
          </div>

          {/* === TAB 1: LIVE API MODE === */}
          {activeTab === 'api' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30, background: 'rgba(59, 130, 246, 0.05)', padding: 20, borderRadius: 12, border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                <div>
                  <h3 style={{ margin: '0 0 5px 0', color: '#3b82f6', display: 'flex', alignItems: 'center', gap: 8 }}>
                    ⚡ Query Courier Settlement API
                  </h3>
                  <p style={{ fontSize: '0.85rem', margin: 0, opacity: 0.8 }}>
                    Pulls payout logs securely. If API token is missing, simulates batch from ERP database.
                  </p>
                </div>
                <button className="btn btn-brand" style={{ padding: '12px 24px', fontWeight: 700 }} onClick={handleFetchLive} disabled={isFetchingLive}>
                  {isFetchingLive ? 'Fetching...' : '⚡ Fetch Live Settlements'}
                </button>
              </div>

              {liveOrders.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
                  
                  {/* ZERO-TRUST AUDIT CARD */}
                  <div style={{ background: 'var(--surface)', border: '2px solid var(--border)', borderRadius: 16, padding: 25, boxShadow: '0 8px 30px rgba(0,0,0,0.1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 15, marginBottom: 20 }}>
                      <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                        🛡️ Zero-Trust Bank Deposit Audit
                      </h3>
                      <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                        Source: {liveSource}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 25 }}>
                      <div style={{ background: 'rgba(255,255,255,0.02)', padding: 15, borderRadius: 10, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: 5 }}>Total COD Collected</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>Rs. {totalCod.toLocaleString()}</div>
                      </div>
                      <div style={{ background: 'rgba(239, 68, 68, 0.05)', padding: 15, borderRadius: 10, border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--red)', marginBottom: 5 }}>Total Courier Expense (Taxes inc.)</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--red)' }}>Rs. {totalExpense.toLocaleString()}</div>
                      </div>
                      <div style={{ background: 'rgba(34, 197, 94, 0.05)', padding: 15, borderRadius: 10, border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--green)', marginBottom: 5 }}>Net Payout (Expected Deposit)</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--green)' }}>Rs. {netPayout.toLocaleString()}</div>
                      </div>
                    </div>

                    {/* BANK VERIFICATION STEP */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, background: 'rgba(255,255,255,0.03)', padding: 20, borderRadius: 12, border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                        <div style={{ flex: 1 }}>
                          <label className="form-label" style={{ fontWeight: 700 }}>Actual Bank Deposit Received (Rs.)</label>
                          <input 
                            type="number" 
                            className="form-input" 
                            placeholder="Enter exact amount from your bank statement..."
                            value={actualBankDeposit}
                            onChange={e => setActualBankDeposit(e.target.value)}
                            style={{ fontSize: '1.1rem', fontWeight: 700, borderColor: actualBankDeposit ? (hasDiscrepancy ? 'var(--red)' : 'var(--green)') : 'var(--border)' }}
                          />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: 180 }}>
                          {actualBankDeposit ? (
                            !hasDiscrepancy ? (
                              <span className="badge" style={{ background: 'rgba(34, 197, 94, 0.1)', color: 'var(--green)', fontSize: '0.9rem', padding: '8px 16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                                ✅ Bank Deposit Verified
                              </span>
                            ) : (
                              <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--red)', fontSize: '0.9rem', padding: '8px 16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                                ⚠️ Discrepancy: Rs. {parseFloat(discrepancyAmount).toLocaleString()}
                              </span>
                            )
                          ) : (
                            <span style={{ fontSize: '0.85rem', opacity: 0.5 }}>Awaiting bank input...</span>
                          )}
                        </div>

                        <button 
                          className="btn btn-brand" 
                          style={{ padding: '14px 28px', fontWeight: 700, background: actualBankDeposit ? (hasDiscrepancy ? 'var(--red)' : 'var(--green)') : 'var(--brand)', opacity: actualBankDeposit ? 1 : 0.5 }}
                          onClick={handleLockCpr}
                          disabled={!actualBankDeposit || isLocking}
                        >
                          {isLocking ? 'Locking...' : (hasDiscrepancy ? '⚠️ Lock Disputed CPR' : '🔒 Mark CPR Cleared & Lock')}
                        </button>
                      </div>

                      {/* DISCREPANCY REASON & NOTES WORKFLOW */}
                      {hasDiscrepancy && (
                        <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 10, padding: 20, display: 'flex', flexDirection: 'column', gap: 15 }}>
                          <h4 style={{ margin: 0, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span>⚠️</span> Difference in Payments Workflow
                          </h4>
                          <p style={{ fontSize: '0.85rem', margin: 0, opacity: 0.8 }}>
                            Your actual bank deposit differs from the courier payout calculation. Please categorize this difference for your permanent audit trail.
                          </p>
                          
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20 }}>
                            <div className="form-group">
                              <label className="form-label" style={{ fontSize: '0.8rem', color: 'var(--red)' }}>Discrepancy Reason</label>
                              <select className="form-input" value={discrepancyReason} onChange={e => setDiscrepancyReason(e.target.value)} style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                                <option value="Courier Overcharge / Disputed Fee">Courier Overcharge / Disputed Fee</option>
                                <option value="Missing COD Payout">Missing COD Payout</option>
                                <option value="Bank / Wire Transfer Fee Deduction">Bank / Wire Transfer Fee Deduction</option>
                                <option value="Other / Pending Audit">Other / Pending Audit</option>
                              </select>
                            </div>

                            <div className="form-group">
                              <label className="form-label" style={{ fontSize: '0.8rem', color: 'var(--red)' }}>Dispute Notes & Action Items (Optional)</label>
                              <input 
                                type="text" 
                                className="form-input" 
                                placeholder="e.g. Email sent to PostEx rep regarding order #1042 overcharge..." 
                                value={disputeNotes}
                                onChange={e => setDisputeNotes(e.target.value)}
                                style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                  </div>

                  {/* PREVIEW TABLE */}
                  <div>
                    <h3 style={{ margin: '0 0 15px 0' }}>Settlement Batch Preview ({liveOrders.length} Orders)</h3>
                    <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--border)', maxHeight: 400 }}>
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
                          {liveOrders.map((row, i) => (
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
                              <td>
                                {row['Amount Collected']}
                                {row['Reserve Amount'] !== undefined && row['Reserve Amount'] !== row['Amount Collected'] && (
                                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                    Reserve: {row['Reserve Amount']}
                                  </div>
                                )}
                              </td>
                              <td>{row['Total Expense']}</td>
                              <td style={{ fontSize: '0.75rem', opacity: 0.7 }}>{row['CPR Reference']}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>
              )}
            </div>
          )}

          {/* === TAB 2: MANUAL UPLOAD MODE === */}
          {activeTab === 'manual' && (
            <div>
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
                    <h3 style={{ margin: 0 }}>Preview ({normalizedData.length} rows)</h3>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button className="btn btn-brand" style={{ background: 'var(--green)', border: 'none', color: '#fff' }} onClick={handleProceedToFinanceEngine}>
                        🚀 Proceed in Finance Engine
                      </button>
                      <button className="btn btn-brand" onClick={handleExport}>
                        📥 Download Master Excel ({normalizedData.length} rows)
                      </button>
                    </div>
                  </div>
                  <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--border)', maxHeight: 400 }}>
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
                        {normalizedData.map((row, i) => (
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
                            <td>
                              {row['Amount Collected']}
                              {row['Reserve Amount'] !== undefined && row['Reserve Amount'] !== row['Amount Collected'] && (
                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                  Reserve: {row['Reserve Amount']}
                                </div>
                              )}
                            </td>
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
          )}

        </div>

        {/* --- RIGHT: INSTRUCTIONS & FORMULA --- */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card" style={{ padding: 20 }}>
            <h4 style={{ margin: '0 0 15px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '1.2rem' }}>ℹ️</span> Instructions
            </h4>
            <ul style={{ paddingLeft: 20, fontSize: '0.85rem', opacity: 0.8, lineHeight: 1.6 }}>
              <li><b>Live API Mode:</b> Enter CPR ID, fetch orders, audit against your bank statement, and lock records.</li>
              {courier.toLowerCase().includes('insta') ? (
                <li><b>Manual Mode:</b> Upload multi-tab Instaworld Excel (Service Charges + COD Payable). Calculates 4% tax on delivered COD amount.</li>
              ) : (
                <li><b>Manual Mode:</b> Upload raw PostEx Excel/CSV to calculate 4% taxes and export your Master Settlement sheet.</li>
              )}
            </ul>
          </div>

          {courier.toLowerCase().includes('insta') ? (
            <div className="card" style={{ padding: 20, background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
              <h4 style={{ margin: '0 0 10px 0', color: '#3b82f6' }}>Instaworld Formula:</h4>
              <p style={{ fontSize: '0.8rem', margin: '0 0 10px 0', opacity: 0.9 }}>
                <b>Expense:</b> Base Delivery Charges (DC) + 4% COD Tax.
              </p>
              <p style={{ fontSize: '0.8rem', margin: '0 0 10px 0', opacity: 0.9 }}>
                <b>Service Charges sheet:</b> DC read from <code>TotalAmount</code> or <code>Service Charges + Fuel Charges + GST</code>.
              </p>
              <p style={{ fontSize: '0.8rem', margin: 0, opacity: 0.9 }}>
                <b>COD Payable sheet:</b> COD amount is used to compute the 4% tax.
              </p>
            </div>
          ) : (
            <div className="card" style={{ padding: 20, background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
              <h4 style={{ margin: '0 0 10px 0', color: '#3b82f6' }}>PostEx Formula Used:</h4>
              <p style={{ fontSize: '0.8rem', margin: '0 0 10px 0', opacity: 0.9 }}>
                <b>Expense:</b> <code>SHIPPING_CH</code> + <code>GST</code> + <code>WH_INCOME_TAX (2%)</code> + <code>WH_SALES_TAX (2%)</code>
              </p>
              <p style={{ fontSize: '0.8rem', margin: 0, opacity: 0.9 }}>
                <b>CPR:</b> Auto-pulled from <code>PAYMENT_REFERENCE</code> or <code>CPR</code> column (falls back to manual input).
              </p>
            </div>
          )}
        </div>

      </div>

      {/* --- BOTTOM: CPR AUDIT LEDGER --- */}
      <div className="card" style={{ marginTop: 40, padding: 25 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: '0 0 5px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
              📜 Immutable CPR Audit Ledger
              <span className="badge" style={{ fontSize: '0.8rem', background: 'rgba(34, 197, 94, 0.1)', color: 'var(--green)' }}>
                {ledger.length} Batches Locked
              </span>
            </h2>
            <p style={{ fontSize: '0.85rem', margin: 0, opacity: 0.7 }}>Permanent audit trail of all verified courier bank deposits.</p>
          </div>

          <button className="btn btn-secondary" style={{ fontSize: '0.85rem', padding: '8px 16px' }} onClick={fetchLedger} disabled={isLoadingLedger}>
            {isLoadingLedger ? 'Refreshing...' : '🔄 Refresh Ledger'}
          </button>
        </div>

        {ledger.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', opacity: 0.5, border: '1px dashed var(--border)', borderRadius: 12 }}>
            No CPR batches locked yet. Use the Live API Mode above to audit and lock your first settlement!
          </div>
        ) : (
          <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--border)' }}>
            <table className="order-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>CPR Reference ID</th>
                  <th>Courier</th>
                  <th>Settlement Date</th>
                  <th>Total Orders</th>
                  <th>Expected Net Payout</th>
                  <th>Actual Bank Deposit</th>
                  <th>Difference</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((row, i) => {
                  const isDisputed = row.audit_status === 'DISPUTED' || parseFloat(row.discrepancy_amount || 0) !== 0
                  return (
                    <tr key={i} style={{ background: isDisputed ? 'rgba(239, 68, 68, 0.02)' : 'transparent' }}>
                      <td style={{ fontWeight: 700, color: 'var(--brand)' }}>{row.cpr_reference}</td>
                      <td>{row.courier}</td>
                      <td>{formatDateToUserFriendly(row.settlement_date)}</td>
                      <td style={{ fontWeight: 600 }}>{row.total_orders}</td>
                      <td>Rs. {parseFloat(row.net_payout || 0).toLocaleString()}</td>
                      <td style={{ fontWeight: 700, color: isDisputed ? 'var(--red)' : 'var(--green)' }}>
                        Rs. {parseFloat(row.actual_bank_deposit || row.net_payout || 0).toLocaleString()}
                      </td>
                      <td style={{ color: isDisputed ? 'var(--red)' : 'var(--text)', fontWeight: isDisputed ? 700 : 400 }}>
                        Rs. {parseFloat(row.discrepancy_amount || 0).toLocaleString()}
                      </td>
                      <td>
                        {isDisputed ? (
                          <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--red)', fontWeight: 700 }} title={row.discrepancy_reason}>
                            🔴 Disputed
                          </span>
                        ) : (
                          <span className="badge" style={{ background: 'rgba(34, 197, 94, 0.1)', color: 'var(--green)', fontWeight: 700 }}>
                            🟢 Cleared (Matched)
                          </span>
                        )}
                      </td>
                      <td>
                        {isDisputed ? (
                          <button className="btn btn-brand" style={{ fontSize: '0.75rem', padding: '4px 10px' }} onClick={() => handleExportDispute(row)}>
                            📥 Export Dispute
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>No Action Needed</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- MODAL: SECURE CREDENTIAL VAULT --- */}


    </div>
  )
}
