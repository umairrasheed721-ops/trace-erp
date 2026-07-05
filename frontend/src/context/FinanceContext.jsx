import React, { createContext, useContext, useState, useEffect } from 'react'
import { useApp } from './AppContext'

const FinanceContext = createContext(null)

export function FinanceProvider({ children }) {
  const { activeStoreId, addToast } = useApp()

  const [pasteData, setPasteData] = useState('')
  const [masterKey, setMasterKey] = useState('Match by Tracking Number')
  const [syncToShopify, setSyncToShopify] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [currentTaskId, setCurrentTaskId] = useState(null)
  const [results, setResults] = useState([])
  const [summary, setSummary] = useState(null)
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  
  // Custom Sync Progress States for Persistence
  const [syncTotal, setSyncTotal] = useState(0)
  const [syncProcessed, setSyncProcessed] = useState(0)

  // Clear sync state from localStorage on mount/refresh because the frontend-driven
  // loop is terminated when the page is reloaded.
  useEffect(() => {
    localStorage.removeItem('ActiveSyncTaskID')
    localStorage.removeItem('sync_is_processing')
    localStorage.removeItem('sync_processed')
    localStorage.removeItem('sync_total')
    localStorage.removeItem('sync_results')
    localStorage.removeItem('sync_summary')
  }, [])

  // Persist sync state to localStorage when active
  useEffect(() => {
    if (currentTaskId) {
      localStorage.setItem('ActiveSyncTaskID', currentTaskId)
      localStorage.setItem('sync_is_processing', String(isProcessing))
      localStorage.setItem('sync_processed', String(syncProcessed))
      localStorage.setItem('sync_total', String(syncTotal))
      localStorage.setItem('sync_results', JSON.stringify(results))
      localStorage.setItem('sync_summary', JSON.stringify(summary))
    } else {
      localStorage.removeItem('ActiveSyncTaskID')
      localStorage.removeItem('sync_is_processing')
      localStorage.removeItem('sync_processed')
      localStorage.removeItem('sync_total')
      localStorage.removeItem('sync_results')
      localStorage.removeItem('sync_summary')
    }
  }, [currentTaskId, isProcessing, syncProcessed, syncTotal, results, summary])

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

  const fetchHistory = async () => {
    if (!activeStoreId) return
    setLoadingHistory(true)
    try {
      const res = await fetch(`/api/finance/reconciliation-history?store_id=${activeStoreId}`)
      const data = await res.json()
      setHistory(data)
    } catch (e) {
      console.error('Failed to fetch history', e)
    } finally {
      setLoadingHistory(false)
    }
  }

  const fetchCouriers = async () => {
    if (!activeStoreId) return
    setCourierSyncing(true)
    try {
      const res = await fetch(`/api/finance/couriers?store_id=${activeStoreId}`)
      if (!res.ok) {
        throw new Error('Courier sync failed')
      }
      const data = await res.json()
      if (data && data.success && Array.isArray(data.data)) {
        setCouriers(data.data)
      } else if (Array.isArray(data)) {
        setCouriers(data)
      } else {
        setCouriers([])
      }
    } catch (e) {
      console.error('Failed to fetch couriers', e)
      setCouriers([])
      if (addToast) {
        addToast('Courier sync failed', 'error')
      }
    } finally {
      setCourierSyncing(false)
    }
  }

  useEffect(() => {
    if (activeStoreId) {
      fetchHistory()
      fetchCouriers()
    }
  }, [activeStoreId])

  const handleProcess = async () => {
    if (!activeStoreId) return alert('No active store selected')
    const lines = pasteData.split('\n').filter(l => l.trim())
    if (lines.length === 0) return alert('No data pasted')

    const parsedRows = []
    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split('\t')
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

    if (parsedRows.length === 0) {
      return alert('Could not parse any valid rows. Please ensure you paste columns: Order ID, Tracking, Type (D/R), COD Amount, Charges, Ref, Date.')
    }

    const taskId = `task-finance-${Date.now()}`
    setIsProcessing(true)
    setCurrentTaskId(taskId)
    setSummary(null)
    setResults([])
    setSyncTotal(parsedRows.length)
    setSyncProcessed(0)

    try {
      const CHUNK_SIZE = 10
      const chunks = []
      for (let i = 0; i < parsedRows.length; i += CHUNK_SIZE) {
        chunks.push(parsedRows.slice(i, i + CHUNK_SIZE))
      }

      let allResults = []
      let finalSummary = { processedCount: 0, ghostCount: 0, auditCount: 0 }
      let sessionId = null

      for (let i = 0; i < chunks.length; i++) {
        const payload = {
          store_id: activeStoreId,
          rows: chunks[i],
          masterKey,
          syncToShopify,
          filename: `Pasted Batch (${new Date().toLocaleTimeString()})`,
          total_rows: parsedRows.length
        }
        if (sessionId) {
          payload.session_id = sessionId
        }

        const res = await fetch(`/api/finance/bulk-update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        
        let data
        try {
          data = await res.json()
        } catch (e) {
          throw new Error(`Batch ${i+1}/${chunks.length} failed: Invalid response (Status: ${res.status}).`)
        }

        if (data.success) {
          sessionId = data.sessionId
          allResults = [...allResults, ...data.results]
          finalSummary.processedCount += data.summary.processedCount
          finalSummary.ghostCount += data.summary.ghostCount
          finalSummary.auditCount += data.summary.auditCount
          
          setResults([...allResults])
          setSummary({ ...finalSummary })
          setSyncProcessed(allResults.length)
        } else {
          throw new Error(`Batch ${i+1}/${chunks.length} Error: ${data.error || 'Unknown'}`)
        }
      }

      setPasteData('')
      fetchHistory()
      if (addToast) addToast('Payment processing completed!', 'success')
    } catch (e) {
      alert('Processing Error: ' + e.message)
    } finally {
      setIsProcessing(false)
      setCurrentTaskId(null)
      setSyncTotal(0)
      setSyncProcessed(0)
    }
  }

  const handleUndo = async (sessionId) => {
    if (!window.confirm('🚨 Are you sure? This will revert all ERP changes for this upload and attempt to CLEAN UP any notes added to Shopify.')) return
    
    setIsProcessing(true)
    try {
      const res = await fetch(`/api/finance/reconciliation-undo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
      })
      const data = await res.json()
      if (data.success) {
        alert(`✅ Undo Successful! Reverted ${data.count} orders.`)
        fetchHistory()
      } else {
        alert('❌ Undo Failed: ' + data.error)
      }
    } catch (e) { 
      alert('Network Error: ' + e.message) 
    } finally { 
      setIsProcessing(false) 
    }
  }

  const handleCreateGhost = async (row) => {
    try {
      const res = await fetch(`/api/finance/create-ghost-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: activeStoreId,
          tracking_number: row.trackingNumber,
          order_id_ref: row.orderId,
          amount: row.codAmount,
          courier_fee: row.charges,
          date: row.date
        })
      })
      const data = await res.json()
      if (data.success) {
        alert('✅ Ghost Buster: Order created in ERP!')
        setResults(prev => prev.map(r => r.trackingNumber === row.trackingNumber ? { ...r, status: '✅ Done (Ghost Recovered)' } : r))
      } else {
        alert('Error: ' + data.error)
      }
    } catch (e) { 
      alert('Network Error: ' + e.message) 
    }
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
        const repairData = data.data !== undefined ? data.data : data;
        setRepairResult(repairData)
        if (addToast) addToast(`Repair complete! Healed ${repairData.count || 0} orders.`, 'success')
      } else {
        if (addToast) addToast(data.message || data.error || 'Repair failed', 'error')
      }
    } catch (e) {
      if (addToast) addToast('Repair failed: ' + e.message, 'error')
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
        if (data.length === 0 && addToast) addToast('No products with missing costs found!', 'info')
      } else {
        setGhostProducts([])
        if (addToast) addToast(data.error || 'Failed to scan products', 'error')
      }
    } catch (e) {
      console.error('Failed to fetch missing products', e)
      if (addToast) addToast('Failed to fetch product list', 'error')
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
        if (addToast) addToast(`Successfully healed ${data.count} orders!`, 'success')
        setGhostProducts([])
        setProductCosts({})
      } else {
        if (addToast) addToast(data.error || 'Healing failed', 'error')
      }
    } catch (e) {
      if (addToast) addToast('Healing error: ' + e.message, 'error')
    } finally {
      setIsHealing(false)
    }
  }

  const handleRemoveHistory = async (sessionId) => {
    if (!window.confirm('Are you sure you want to remove this session log? This will only remove the entry from this history list; all financial updates in the ledger remain completely intact.')) return
    
    try {
      const res = await fetch(`/api/finance/reconciliation-clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
      })
      const data = await res.json()
      if (data.success) {
        fetchHistory()
      } else {
        alert('Clear failed: ' + data.error)
      }
    } catch (e) {
      alert('Network Error: ' + e.message)
    }
  }

  return (
    <FinanceContext.Provider value={{
      pasteData, setPasteData,
      masterKey, setMasterKey,
      syncToShopify, setSyncToShopify,
      isProcessing, currentTaskId,
      results, setResults,
      summary, setSummary,
      history, setHistory,
      loadingHistory, fetchHistory,
      couriers, selectedCourier, setSelectedCourier,
      daysOld, setDaysOld,
      isRepairing, isCourierSyncing, repairResult, setRepairResult,
      forceUnpaidAsReturned, setForceUnpaidAsReturned,
      ghostProducts, setGhostProducts,
      productCosts, setProductCosts,
      isScanning, isHealing,
      handleProcess, handleUndo, handleCreateGhost,
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
