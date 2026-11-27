import React, { createContext, useContext, useState, useEffect, useRef } from 'react'
import { useApp } from './AppContext'
import { parsePastedSheet } from '../utils/financeParser'

const FinanceContext = createContext(null)

const EMPTY_SUMMARY = {
  processedCount: 0,
  ghostCount: 0,
  auditCount: 0,
  duplicateCount: 0,
  varianceCount: 0,
  errorCount: 0,
  totalCod: 0,
  totalCharges: 0,
  totalNetPayout: 0,
}

export function FinanceProvider({ children }) {
  const { activeStoreId, addToast } = useApp()

  const [pasteData, setPasteData] = useState('')
  const [uploadFilename, setUploadFilename] = useState('')
  const [masterKey, setMasterKey] = useState('Match by Tracking Number')
  const [syncToShopify, setSyncToShopify] = useState(true)
  const [allowDuplicates, setAllowDuplicates] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isDryRunResult, setIsDryRunResult] = useState(false)
  const [currentTaskId, setCurrentTaskId] = useState(null)
  const [results, setResults] = useState([])
  const [summary, setSummary] = useState(null)
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Store Financial Health Overview KPIs
  const [overview, setOverview] = useState(null)
  const [loadingOverview, setLoadingOverview] = useState(false)

  // Selected Upload History Session Drilldown
  const [sessionDetail, setSessionDetail] = useState(null)
  const [loadingSessionDetail, setLoadingSessionDetail] = useState(false)

  // Custom Sync Progress States
  const [syncTotal, setSyncTotal] = useState(0)
  const [syncProcessed, setSyncProcessed] = useState(0)
  const abortRef = useRef(false)

  // Clear stale task keys on reload
  useEffect(() => {
    localStorage.removeItem('ActiveSyncTaskID')
    localStorage.removeItem('sync_is_processing')
    localStorage.removeItem('sync_processed')
    localStorage.removeItem('sync_total')
    localStorage.removeItem('sync_results')
    localStorage.removeItem('sync_summary')
  }, [])

  // Legacy Repair State
  const [couriers, setCouriers] = useState([])
  const [selectedCourier, setSelectedCourier] = useState('All Inactive')
  const [daysOld, setDaysOld] = useState(60)
  const [isRepairing, setIsRepairing] = useState(false)
  const [repairResult, setRepairResult] = useState(null)
  const [forceUnpaidAsReturned, setForceUnpaidAsReturned] = useState(false)
  const [isCourierSyncing, setCourierSyncing] = useState(false)

  // Product Costs Recovery State
  const [ghostProducts, setGhostProducts] = useState([])
  const [productCosts, setProductCosts] = useState({})
  const [isScanning, setIsScanning] = useState(false)
  const [isHealing, setIsHealing] = useState(false)

  const notify = (msg, type = 'info') => {
    if (addToast) addToast(msg, type)
  }

  const fetchOverview = async () => {
    if (!activeStoreId) return
    setLoadingOverview(true)
    try {
      const res = await fetch(`/api/finance/overview?store_id=${activeStoreId}`)
      const data = await res.json()
      if (res.ok && data.success) setOverview(data)
    } catch (e) {
      console.error('Failed to fetch finance overview', e)
    } finally {
      setLoadingOverview(false)
    }
  }

  const fetchHistory = async () => {
    if (!activeStoreId) return
    setLoadingHistory(true)
    try {
      const res = await fetch(`/api/finance/reconciliation-history?store_id=${activeStoreId}`)
      const data = await res.json()
      setHistory(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error('Failed to fetch history', e)
    } finally {
      setLoadingHistory(false)
    }
  }

  const fetchSessionDetail = async (sessionId) => {
    if (!sessionId) { setSessionDetail(null); return }
    setLoadingSessionDetail(true)
    try {
      const res = await fetch(`/api/finance/reconciliation-session/${sessionId}`)
      const data = await res.json()
      if (res.ok && data.success) setSessionDetail(data)
      else notify(data.error || 'Failed to load session details', 'error')
    } catch (e) {
      notify('Network error loading session details', 'error')
    } finally {
      setLoadingSessionDetail(false)
    }
  }

  const fetchCouriers = async () => {
    if (!activeStoreId) return
    setCourierSyncing(true)
    try {
      const res = await fetch(`/api/finance/couriers?store_id=${activeStoreId}`)
      if (!res.ok) throw new Error('Courier sync failed')
      const data = await res.json()
      if (data && data.success && Array.isArray(data.data)) setCouriers(data.data)
      else if (Array.isArray(data)) setCouriers(data)
      else setCouriers([])
    } catch (e) {
      console.error('Failed to fetch couriers', e)
      setCouriers([])
    } finally {
      setCourierSyncing(false)
    }
  }

  useEffect(() => {
    if (activeStoreId) {
      fetchOverview()
      fetchHistory()
      fetchCouriers()
      setSessionDetail(null)
    }
  }, [activeStoreId])

  const executeRowsBatch = async (parsedRows, { dryRun = false, customFilename = null } = {}) => {
    if (!activeStoreId) { notify('No active store selected', 'error'); return }
    if (!parsedRows || parsedRows.length === 0) {
      notify('Could not parse any valid rows. Check 7 columns: Order ID, Tracking, Type (D/R), COD, Charges, CPR, Date.', 'error')
      return
    }

    abortRef.current = false
    const taskId = `${dryRun ? 'dryrun' : 'recon'}-${Date.now()}`
    setIsProcessing(true)
    setIsDryRunResult(dryRun)
    setCurrentTaskId(taskId)
    setSummary(null)
    setResults([])
    setSyncTotal(parsedRows.length)
    setSyncProcessed(0)

    try {
      const CHUNK_SIZE = dryRun ? 50 : 10
      const chunks = []
      for (let i = 0; i < parsedRows.length; i += CHUNK_SIZE) {
        chunks.push(parsedRows.slice(i, i + CHUNK_SIZE))
      }

      let allResults = []
      const finalSummary = { ...EMPTY_SUMMARY }
      let sessionId = null
      let wasAborted = false

      const labelName = customFilename || uploadFilename || `Pasted Batch (${new Date().toLocaleTimeString()})`

      for (let i = 0; i < chunks.length; i++) {
        if (abortRef.current) {
          wasAborted = true
          break
        }

        const payload = {
          store_id: activeStoreId,
          rows: chunks[i],
          masterKey,
          syncToShopify: dryRun ? false : syncToShopify,
          dryRun,
          allowDuplicates,
          filename: labelName,
          total_rows: parsedRows.length
        }
        if (sessionId) payload.session_id = sessionId

        const res = await fetch('/api/finance/bulk-update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })

        let data
        try {
          data = await res.json()
        } catch {
          throw new Error(`Batch ${i + 1}/${chunks.length} failed (HTTP ${res.status})`)
        }

        if (data.success) {
          sessionId = data.sessionId || sessionId
          allResults = [...allResults, ...data.results]
          finalSummary.processedCount += data.summary.processedCount || 0
          finalSummary.ghostCount += data.summary.ghostCount || 0
          finalSummary.auditCount += data.summary.auditCount || 0
          finalSummary.duplicateCount += data.summary.duplicateCount || 0
          finalSummary.varianceCount += data.summary.varianceCount || 0
          finalSummary.errorCount += data.summary.errorCount || 0
          finalSummary.totalCod = Math.round((finalSummary.totalCod + (data.summary.totalCod || 0)) * 100) / 100
          finalSummary.totalCharges = Math.round((finalSummary.totalCharges + (data.summary.totalCharges || 0)) * 100) / 100
          finalSummary.totalNetPayout = Math.round((finalSummary.totalNetPayout + (data.summary.totalNetPayout || 0)) * 100) / 100

          setResults([...allResults])
          setSummary({ ...finalSummary })
          setSyncProcessed(allResults.length)
        } else {
          throw new Error(`Batch ${i + 1}/${chunks.length} Error: ${data.error || 'Unknown'}`)
        }
      }

      if (wasAborted) {
        notify(`🛑 Batch aborted at ${allResults.length}/${parsedRows.length} rows`, 'info')
      } else if (dryRun) {
        notify(`🔍 Dry-Run complete! ${finalSummary.processedCount} ready · ${finalSummary.duplicateCount} duplicates · ${finalSummary.ghostCount} ghosts · ${finalSummary.varianceCount} variances`, 'info')
      } else {
        setPasteData('')
        setUploadFilename('')
        fetchHistory()
        fetchOverview()
        notify(`✅ Reconciliation complete! ${finalSummary.processedCount} processed, Net Rs. ${finalSummary.totalNetPayout.toLocaleString()}`, 'success')
      }
    } catch (e) {
      notify(`❌ Processing Error: ${e.message}`, 'error')
    } finally {
      setIsProcessing(false)
      setCurrentTaskId(null)
      setSyncTotal(0)
      setSyncProcessed(0)
    }
  }

  const handleProcess = async () => {
    const parsed = parsePastedSheet(pasteData)
    await executeRowsBatch(parsed.rows, { dryRun: false })
  }

  const handleDryRun = async () => {
    const parsed = parsePastedSheet(pasteData)
    await executeRowsBatch(parsed.rows, { dryRun: true })
  }

  const handleAbort = () => {
    abortRef.current = true
    notify('Stopping after current chunk...', 'info')
  }

  const handleRetryFailed = async () => {
    const failedRows = results.filter(r => String(r.status || '').includes('❌'))
    if (failedRows.length === 0) return notify('No failed rows to retry', 'info')
    await executeRowsBatch(failedRows, { dryRun: false, customFilename: `Retry Failed (${failedRows.length} rows)` })
  }

  const handleCreateGhost = async (row, silent = false) => {
    try {
      const res = await fetch('/api/finance/create-ghost-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: activeStoreId,
          tracking_number: row.trackingNumber,
          order_id_ref: row.orderId,
          amount: row.codAmount,
          courier_fee: row.charges,
          date: row.date,
          type: row.type,
          ref: row.ref,
        })
      })
      const data = await res.json()
      if (data.success) {
        setResults(prev => prev.map(r =>
          (r.trackingNumber === row.trackingNumber && r.orderId === row.orderId)
            ? { ...r, status: '✅ Done (Ghost Recovered)', recommendation: 'Created in ERP' }
            : r
        ))
        if (!silent) {
          notify(`✅ Ghost order ${row.orderId || row.trackingNumber} recovered in ERP!`, 'success')
          fetchOverview()
        }
        return true
      } else {
        if (!silent) notify(data.error || 'Failed to recover ghost order', 'error')
        return false
      }
    } catch (e) {
      if (!silent) notify('Network error: ' + e.message, 'error')
      return false
    }
  }

  const handleBulkFixGhosts = async () => {
    const ghosts = results.filter(r => String(r.status || '').includes('GHOST'))
    if (ghosts.length === 0) return notify('No ghost orders to recover', 'info')
    setIsProcessing(true)
    let ok = 0
    for (const g of ghosts) {
      const done = await handleCreateGhost(g, true)
      if (done) ok++
    }
    setIsProcessing(false)
    fetchOverview()
    notify(`👻 Recovered ${ok}/${ghosts.length} ghost orders into ERP!`, ok === ghosts.length ? 'success' : 'info')
  }

  const handleUndo = async (sessionId, skipConfirm = false) => {
    if (!skipConfirm && !window.confirm('Revert all ERP changes for this upload and clean up Shopify notes?')) return
    setIsProcessing(true)
    try {
      const res = await fetch('/api/finance/reconciliation-undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
      })
      const data = await res.json()
      if (data.success) {
        notify(`✅ Undo Successful! Reverted ${data.count} orders.`, 'success')
        if (sessionDetail?.session?.id === sessionId) setSessionDetail(null)
        fetchHistory()
        fetchOverview()
      } else {
        notify(`❌ Undo Failed: ${data.error}`, 'error')
      }
    } catch (e) {
      notify('Network Error: ' + e.message, 'error')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleRemoveHistory = async (sessionId, skipConfirm = false) => {
    if (!skipConfirm && !window.confirm('Remove this session from Upload History? Financial ledger entries remain intact.')) return
    try {
      const res = await fetch('/api/finance/reconciliation-clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
      })
      const data = await res.json()
      if (data.success) {
        notify('🗑️ Session entry cleared from history', 'info')
        if (sessionDetail?.session?.id === sessionId) setSessionDetail(null)
        fetchHistory()
      } else {
        notify('Clear failed: ' + data.error, 'error')
      }
    } catch (e) {
      notify('Network Error: ' + e.message, 'error')
    }
  }

  const handleResyncSessionNotes = async (sessionId) => {
    setIsProcessing(true)
    try {
      const res = await fetch('/api/finance/resync-session-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        notify(`✅ Shopify notes synced: ${data.synced} added, ${data.skipped} already synced${data.failed ? `, ${data.failed} failed` : ''}`, 'success')
        fetchSessionDetail(sessionId)
      } else {
        notify(data.error || 'Failed to sync Shopify notes', 'error')
      }
    } catch (e) {
      notify('Network error syncing notes: ' + e.message, 'error')
    } finally {
      setIsProcessing(false)
    }
  }

  const clearResults = () => {
    setResults([])
    setSummary(null)
    setIsDryRunResult(false)
  }

  const handleRepair = async () => {
    if (!activeStoreId) return
    setIsRepairing(true)
    setRepairResult(null)
    try {
      const res = await fetch('/api/finance/repair-legacy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: activeStoreId, courier: selectedCourier, daysOld, forceUnpaidAsReturned })
      })
      const data = await res.json()
      if (data.success) {
        const repairData = data.data !== undefined ? data.data : data
        setRepairResult(repairData)
        fetchOverview()
        notify(`✅ Repair complete! Healed ${repairData.count || 0} orders.`, 'success')
      } else {
        notify(data.message || data.error || 'Repair failed', 'error')
      }
    } catch (e) {
      notify('Repair failed: ' + e.message, 'error')
    } finally {
      setIsRepairing(false)
    }
  }

  const fetchMissingProducts = async () => {
    if (!activeStoreId) return
    setIsScanning(true)
    try {
      const res = await fetch(`/api/finance/missing-product-list?store_id=${activeStoreId}`)
      const data = await res.json()
      if (Array.isArray(data)) {
        setGhostProducts(data)
        if (data.length === 0) notify('✅ No products with missing costs found!', 'success')
        else notify(`Found ${data.length} product(s) with missing costs`, 'info')
      } else {
        setGhostProducts([])
        notify(data.error || 'Failed to scan products', 'error')
      }
    } catch (e) {
      console.error('Failed to fetch missing products', e)
      notify('Failed to fetch product list', 'error')
      setGhostProducts([])
    } finally {
      setIsScanning(false)
    }
  }

  const applyBulkCosts = async () => {
    if (!activeStoreId || Object.keys(productCosts).length === 0) return
    setIsHealing(true)
    try {
      const res = await fetch('/api/finance/apply-bulk-product-costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: activeStoreId, mappings: productCosts })
      })
      const data = await res.json()
      if (data.success) {
        notify(`✅ Successfully healed ${data.count} orders!`, 'success')
        setGhostProducts([])
        setProductCosts({})
      } else {
        notify(data.error || 'Healing failed', 'error')
      }
    } catch (e) {
      notify('Healing error: ' + e.message, 'error')
    } finally {
      setIsHealing(false)
    }
  }

  return (
    <FinanceContext.Provider value={{
      pasteData, setPasteData,
      uploadFilename, setUploadFilename,
      masterKey, setMasterKey,
      syncToShopify, setSyncToShopify,
      allowDuplicates, setAllowDuplicates,
      isProcessing, isDryRunResult, currentTaskId,
      results, setResults,
      summary, setSummary,
      history, setHistory,
      loadingHistory, fetchHistory,
      overview, loadingOverview, fetchOverview,
      sessionDetail, loadingSessionDetail, fetchSessionDetail, handleResyncSessionNotes,
      couriers, selectedCourier, setSelectedCourier,
      daysOld, setDaysOld,
      isRepairing, isCourierSyncing, repairResult, setRepairResult,
      forceUnpaidAsReturned, setForceUnpaidAsReturned,
      ghostProducts, setGhostProducts,
      productCosts, setProductCosts,
      isScanning, isHealing,
      handleProcess, handleDryRun, handleAbort, handleRetryFailed,
      handleUndo, handleCreateGhost, handleBulkFixGhosts, clearResults,
      handleRepair, fetchMissingProducts, applyBulkCosts,
      syncTotal, setSyncTotal,
      syncProcessed, setSyncProcessed,
      handleRemoveHistory
    }}>
      {children}
    </FinanceContext.Provider>
  )
}

export function useFinance() {
  const context = useContext(FinanceContext)
  if (!context) throw new Error('useFinance must be used within a FinanceProvider')
  return context
}
