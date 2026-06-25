import React, { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'

export default function CostManager() {
  const { activeStoreId, addToast } = useApp()
  const [costs, setCosts] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [loadingGhosts, setLoadingGhosts] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState('')
  const [syncWarning, setSyncWarning] = useState('')
  const [isDiagnosing, setIsDiagnosing] = useState(false)
  const [diagnoseReport, setDiagnoseReport] = useState(null)
  const [activeTab, setActiveTab] = useState('pending')
  const [selectedParents, setSelectedParents] = useState(new Set())
  const [bulkProcessing, setBulkProcessing] = useState(false)
  const [expandedParents, setExpandedParents] = useState(new Set())
  const [lastSelectedParentIndex, setLastSelectedParentIndex] = useState(null)
  const [lastSelectedGhostIndex, setLastSelectedGhostIndex] = useState(null)
  
  // Modal States
  const [showModal, setShowModal] = useState(false)
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [bulkItem, setBulkItem] = useState(null)
  const [form, setForm] = useState({ parent_title: '', variant_title: '', unit_cost: 0, packaging_cost: 0 })
  const [bulkForm, setBulkForm] = useState({ unit_cost: 0, packaging_cost: 0 })

  // Ghost Listing States
  const [ghosts, setGhosts] = useState([])
  const [showGhostModal, setShowGhostModal] = useState(false)
  const [inspectingGhost, setInspectingGhost] = useState(null)
  const [ghostOrders, setGhostOrders] = useState([])
  const [loadingGhostOrders, setLoadingGhostOrders] = useState(false)
  const [ghostCosts, setGhostCosts] = useState({})
  const [ghostSearch, setGhostSearch] = useState('')
  const [selectedGhosts, setSelectedGhosts] = useState(new Set())

  // UI Enhancement States
  const [sortBy, setSortBy] = useState('value')       // 'value' | 'margin' | 'stock' | 'name'
  const [filterMargin, setFilterMargin] = useState('all') // 'all' | 'low' | 'mid' | 'high'
  const [inlineEdits, setInlineEdits] = useState({})  // { variantId: { unit_cost, packaging_cost } }
  const [savingInline, setSavingInline] = useState(null)

  useEffect(() => {
    if (activeStoreId) {
      fetchCosts()
      fetchGhosts()
    }
  }, [activeStoreId])

  const fetchCosts = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/finance/master-costs?store_id=${activeStoreId}`)
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data = await res.json()
      setCosts(Array.isArray(data) ? data : [])
    } catch (e) {
      setLoadError(e.message || 'Unknown error')
      addToast('Failed to load cost registry: ' + e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const fetchGhosts = async () => {
    setLoadingGhosts(true)
    try {
      const res = await fetch(`/api/finance/missing-product-list?store_id=${activeStoreId}`)
      const data = await res.json()
      setGhosts(Array.isArray(data) ? data : [])
    } catch (e) { console.error('Failed to fetch ghosts', e) }
    finally { setLoadingGhosts(false) }
  }

  // --- Derived Data ---
  const totals = {
    acceptedValue: 0,
    acceptedQty: 0,
    pendingValue: 0,
    totalVariants: costs.length,
    totalMarginValue: 0,
    totalSellingValue: 0,
    atRiskCount: 0,
  }

  const grouped = {}
  costs.forEach(c => {
    if (!grouped[c.parent_title]) grouped[c.parent_title] = { name: c.parent_title, variants: [], totalQty: 0, totalValue: 0, totalSelling: 0 }
    grouped[c.parent_title].variants.push(c)
    grouped[c.parent_title].totalQty += (c.inventory_qty || 0)
    
    const landed = (c.unit_cost || 0) + (c.packaging_cost || 0)
    const selling = c.selling_price || 0
    if (landed > 0) {
      totals.acceptedValue += landed * (c.inventory_qty || 0)
      totals.acceptedQty += (c.inventory_qty || 0)
      if (selling > 0) {
        totals.totalMarginValue += (selling - landed) * (c.inventory_qty || 0)
        totals.totalSellingValue += selling * (c.inventory_qty || 0)
      }
    } else if (c.shopify_cost > 0) {
      totals.pendingValue += c.shopify_cost * (c.inventory_qty || 0)
    }
    
    grouped[c.parent_title].totalValue += landed * (c.inventory_qty || 0)
    grouped[c.parent_title].totalSelling += selling * (c.inventory_qty || 0)
    if (landed > 0) grouped[c.parent_title].hasCost = true
    
    // Track Price Drift
    if (c.unit_cost > 0 && Math.abs(c.shopify_cost - c.unit_cost) > 1) {
      grouped[c.parent_title].hasDrift = true
    }

    // Track unique costs
    if (!grouped[c.parent_title].uniqueCosts) grouped[c.parent_title].uniqueCosts = new Set()
    grouped[c.parent_title].uniqueCosts.add(c.shopify_cost || 0)
  })

  // Compute per-group margin and at-risk
  Object.values(grouped).forEach(p => {
    if (p.totalSelling > 0 && p.totalValue > 0) {
      p.margin = Math.round(((p.totalSelling - p.totalValue) / p.totalSelling) * 100)
      if (p.margin < 20) totals.atRiskCount++
    } else {
      p.margin = null
    }
  })

  const avgMargin = totals.totalSellingValue > 0
    ? Math.round((totals.totalMarginValue / totals.totalSellingValue) * 100)
    : 0

  const ghostImpact = ghosts.reduce((sum, g) => sum + (g.count * 500), 0) // rough estimate

  const allGrouped = Object.values(grouped)
    .filter(p => p.name.toLowerCase().includes(search.toLowerCase()))

  // Apply margin filter
  const marginFiltered = filterMargin === 'all' ? allGrouped
    : filterMargin === 'low'  ? allGrouped.filter(p => p.margin !== null && p.margin < 20)
    : filterMargin === 'mid'  ? allGrouped.filter(p => p.margin !== null && p.margin >= 20 && p.margin < 40)
    : filterMargin === 'high' ? allGrouped.filter(p => p.margin !== null && p.margin >= 40)
    : allGrouped

  // Apply sort
  const sorted = [...marginFiltered].sort((a, b) => {
    if (sortBy === 'value')  return b.totalValue - a.totalValue
    if (sortBy === 'margin') return (b.margin ?? -1) - (a.margin ?? -1)
    if (sortBy === 'stock')  return b.totalQty - a.totalQty
    if (sortBy === 'name')   return a.name.localeCompare(b.name)
    return 0
  })

  const pendingItems = sorted.filter(p => !p.hasCost)
  const verifiedItems = sorted.filter(p => p.hasCost)
  const continueSellingItems = sorted.filter(p => p.variants.some(v => v.inventory_policy === 'continue'))
  const currentList = activeTab === 'pending'
    ? pendingItems
    : activeTab === 'verified'
      ? verifiedItems
      : activeTab === 'continue_selling'
        ? continueSellingItems
        : []

  // --- Handlers ---
  const handleSyncShopify = async () => {
    setIsSyncing(true)
    setSyncProgress('Connecting to Shopify...')
    setSyncWarning('')
    try {
      setSyncProgress('Fetching all product variants via GraphQL...')
      const res = await fetch('/api/finance/sync-shopify-costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: activeStoreId })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`)
      if (data.success) {
        if (data.count === 0) {
          setSyncProgress('')
          setSyncWarning(data.warning || 'Shopify returned 0 variants. Check your store connection.')
          addToast('Sync completed but 0 variants found — run Diagnose to identify the issue.', 'warning')
        } else {
          setSyncProgress(`✅ Successfully synced ${data.count} variants!`)
          addToast(`Synced ${data.count} variants from Shopify`, 'success')
          await fetchCosts()
          await fetchGhosts()
        }
      } else {
        throw new Error(data.error || 'Sync failed')
      }
    } catch (e) {
      setSyncProgress('')
      addToast('Sync error: ' + e.message, 'error')
    }
    finally {
      setIsSyncing(false)
      setTimeout(() => setSyncProgress(''), 3000)
    }
  }

  const handleDiagnose = async () => {
    setIsDiagnosing(true)
    setDiagnoseReport(null)
    try {
      const res = await fetch(`/api/finance/diagnose-shopify-sync?store_id=${activeStoreId}`)
      const data = await res.json()
      setDiagnoseReport(data)
    } catch (e) {
      addToast('Diagnose failed: ' + e.message, 'error')
    } finally {
      setIsDiagnosing(false)
    }
  }

  const handleApplyGhostCosts = async () => {
    const mappings = {}
    Object.entries(ghostCosts).forEach(([key, cost]) => {
      if (parseFloat(cost) > 0) {
        // key is "Parent@@@Variant" or just "Name"
        const [pName, vName] = key.split('@@@');
        const finalKey = vName ? `${pName} - ${vName}` : pName;
        mappings[finalKey] = parseFloat(cost)
      }
    })
    if (Object.keys(mappings).length === 0) return addToast('Please enter at least one cost', 'warning')

    try {
      const res = await fetch('/api/finance/apply-bulk-product-costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: activeStoreId, mappings })
      })
      const data = await res.json()
      if (data.success) {
        addToast(`Healed ${data.count} orders!`, 'success')
        fetchGhosts()
        fetchCosts()
        setGhostCosts({})
      }
    } catch (e) { addToast('Failed to apply costs', 'error') }
  }

  const handleInspectGhost = async (name) => {
    setInspectingGhost(name)
    setShowGhostModal(true)
    setLoadingGhostOrders(true)
    try {
      const res = await fetch(`/api/finance/ghost-product-orders?store_id=${activeStoreId}&name=${encodeURIComponent(name)}`)
      const data = await res.json()
      setGhostOrders(data)
    } catch (e) { addToast('Failed to load orders', 'error') }
    finally { setLoadingGhostOrders(false) }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    try {
      const res = await fetch('/api/finance/master-costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: activeStoreId, ...form })
      })
      const data = await res.json()
      if (data.success) {
        addToast('Saved successfully', 'success')
        setShowModal(false)
        fetchCosts()
      }
    } catch (e) { addToast('Save error: ' + e.message, 'error') }
  }

  const handleDeleteParent = async (title) => {
    if (!window.confirm(`Delete "${title}"?`)) return
    try {
      const res = await fetch('/api/finance/delete-master-cost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: activeStoreId, parent_title: title })
      })
      if (res.ok) {
        addToast('Deleted', 'success')
        fetchCosts()
      }
    } catch (e) { addToast('Delete failed', 'error') }
  }

  const handleBulkAcceptSelected = async () => {
    if (selectedParents.size === 0) return
    setBulkProcessing(true)
    try {
      let totalUpdated = 0
      for (const parentTitle of selectedParents) {
        const res = await fetch('/api/finance/bulk-accept-shopify-costs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ store_id: activeStoreId, parent_title: parentTitle })
        })
        const data = await res.json()
        totalUpdated += (data.changes || 0)
      }
      addToast(`Successfully accepted costs for ${selectedParents.size} products!`, 'success')
      setSelectedParents(new Set())
      fetchCosts()
    } catch (e) {
      addToast('Bulk acceptance failed', 'error')
    } finally {
      setBulkProcessing(false)
    }
  }

  const toggleSelectParent = (name) => {
    const next = new Set(selectedParents)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setSelectedParents(next)
  }

  const toggleSelectAll = (isAll) => {
    if (isAll) {
      setSelectedParents(new Set())
    } else {
      const allNames = sorted.map(p => p.name)
      setSelectedParents(new Set(allNames))
    }
  }

  const handleBulkSync = async (e) => {
    e.preventDefault()
    try {
      const res = await fetch('/api/finance/bulk-sync-parent-costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: activeStoreId, parent_title: bulkItem.name, ...bulkForm })
      })
      if (res.ok) {
        addToast('Applied to all variants', 'success')
        setShowBulkModal(false)
        fetchCosts()
      }
    } catch (e) { addToast('Bulk error', 'error') }
  }

  const handleAcceptShopifyCost = async (v) => {
    try {
      const res = await fetch('/api/finance/accept-shopify-cost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: activeStoreId, parent_title: v.parent_title, variant_title: v.variant_title })
      })
      if (res.ok) {
        addToast(`Accepted cost for ${v.variant_title || 'Default'}`, 'success')
        fetchCosts()
      }
    } catch (e) { addToast('Accept failed', 'error') }
  }

  const handleBulkAccept = async (parentTitle) => {
    if (!window.confirm(`Accept Shopify costs for ALL variants of "${parentTitle}"?`)) return
    try {
      const res = await fetch('/api/finance/bulk-accept-shopify-costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: activeStoreId, parent_title: parentTitle })
      })
      if (res.ok) {
        addToast(`Accepted all costs for ${parentTitle}`, 'success')
        fetchCosts()
      }
    } catch (e) { addToast('Bulk accept failed', 'error') }
  }

  const handleInlineSave = async (v) => {
    const key = v.id || `${v.parent_title}@@@${v.variant_title}`
    const edit = inlineEdits[key]
    if (!edit) return
    setSavingInline(key)
    try {
      const res = await fetch('/api/finance/master-costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: activeStoreId,
          parent_title: v.parent_title,
          variant_title: v.variant_title,
          unit_cost: parseFloat(edit.unit_cost) || 0,
          packaging_cost: parseFloat(edit.packaging_cost) || 0
        })
      })
      const data = await res.json()
      if (data.success) {
        addToast(`✅ Saved ${v.variant_title || v.parent_title}`, 'success')
        const next = { ...inlineEdits }
        delete next[key]
        setInlineEdits(next)
        fetchCosts()
      }
    } catch (e) { addToast('Save failed: ' + e.message, 'error') }
    finally { setSavingInline(null) }
  }

  const toggleParent = (name) => {
    const next = new Set(expandedParents)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setExpandedParents(next)
  }
  
  return (
    <div className="page-container cost-manager" style={{ padding: 30 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 }}>
        <div>
          <h1 style={{ margin: 0, color: 'var(--brand)' }}>📈 Master Costing Registry</h1>
          <p style={{ margin: '5px 0 0', opacity: 0.6, color: 'var(--text-secondary)' }}>Manage product costs and fix historical ghost listings.</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            className="btn btn-secondary"
            onClick={handleDiagnose}
            disabled={isDiagnosing || isSyncing}
            style={{ borderColor: 'rgba(251,146,60,0.5)', color: 'var(--yellow)' }}
          >
            {isDiagnosing ? '⏳ Diagnosing...' : '🔬 Diagnose'}
          </button>
          <button className="btn btn-secondary" onClick={handleSyncShopify} disabled={isSyncing}>
            {isSyncing ? '⌛ Syncing...' : '🔄 Sync from Shopify'}
          </button>
          <button className="btn btn-primary" onClick={() => { setEditingItem(null); setForm({ parent_title: '', variant_title: '', unit_cost: 0, packaging_cost: 0 }); setShowModal(true); }}>
            + Add Manual
          </button>
        </div>
      </header>

      {/* ── Sync Progress Banner ── */}
      {isSyncing && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(79,70,229,0.08))',
          border: '1px solid rgba(99,102,241,0.4)',
          borderRadius: 12,
          padding: '16px 24px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          animation: 'slideDown 0.3s ease'
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            border: '3px solid var(--brand)',
            borderTopColor: 'transparent',
            animation: 'spin 0.8s linear infinite',
            flexShrink: 0
          }} />
          <div>
            <div style={{ fontWeight: 700, color: 'var(--brand)', fontSize: '0.95rem' }}>🔄 Syncing from Shopify...</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 3 }}>{syncProgress}</div>
          </div>
        </div>
      )}
      {!isSyncing && syncProgress && (
        <div style={{
          background: 'var(--green-dim)', border: '1px solid var(--green)',
          borderRadius: 12, padding: '12px 20px', marginBottom: 20,
          color: 'var(--green)', fontWeight: 600, fontSize: '0.9rem'
        }}>
          {syncProgress}
        </div>
      )}

      {/* ── Zero-Sync Warning Banner ── */}
      {syncWarning && (
        <div style={{
          background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.4)',
          borderRadius: 12, padding: '16px 20px', marginBottom: 20,
          animation: 'slideDown 0.3s ease'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--yellow)', marginBottom: 6, fontSize: '0.95rem' }}>
                ⚠️ Sync completed but 0 variants were imported
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>{syncWarning}</div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
              <button
                className="btn btn-secondary"
                style={{ whiteSpace: 'nowrap', borderColor: 'rgba(251,146,60,0.5)', color: 'var(--yellow)', fontSize: '0.82rem' }}
                onClick={handleDiagnose}
                disabled={isDiagnosing}
              >
                {isDiagnosing ? '⏳...' : '🔬 Run Diagnose'}
              </button>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.1rem' }} onClick={() => setSyncWarning('')}>×</button>
            </div>
          </div>
        </div>
      )}

      {selectedParents.size > 0 && (
        <div style={{ 
          background: 'var(--green-dim)', 
          border: '1px solid var(--green)', 
          padding: '15px 25px', 
          borderRadius: 12, 
          marginBottom: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          animation: 'slideDown 0.3s ease'
        }}>
          <div style={{ color: 'var(--green)', fontWeight: 'bold' }}>
            ⚡ {selectedParents.size} Products Selected
          </div>
          <button 
            className="btn btn-primary" 
            style={{ background: 'var(--green)', color: '#fff' }}
            onClick={handleBulkAcceptSelected}
            disabled={bulkProcessing}
          >
            {bulkProcessing ? '⌛ Processing...' : `✅ Accept All Selected Costs`}
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 30 }}>
        <div style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', color: '#fff', padding: '20px 24px', borderRadius: '16px', boxShadow: '0 10px 20px rgba(79,70,229,0.2)' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', opacity: 0.75, letterSpacing: 1 }}>💰 Inventory Value</div>
          <div style={{ fontSize: '2rem', fontWeight: 900, marginTop: 6 }}>Rs {totals.acceptedValue.toLocaleString()}</div>
          <div style={{ fontSize: '0.72rem', marginTop: 4, opacity: 0.8 }}>{totals.acceptedQty} units accepted</div>
        </div>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', padding: '20px 24px', borderRadius: '16px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', opacity: 0.5, color: 'var(--text-secondary)', letterSpacing: 1 }}>📈 Avg Profit Margin</div>
          <div style={{ fontSize: '2rem', fontWeight: 900, marginTop: 6, color: avgMargin >= 40 ? 'var(--green)' : avgMargin >= 20 ? 'var(--yellow)' : '#ef4444' }}>{avgMargin}%</div>
          <div style={{ fontSize: '0.72rem', marginTop: 4, opacity: 0.5, color: 'var(--text-muted)' }}>Across verified products</div>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: 'var(--border)', borderRadius: '0 0 16px 16px' }}>
            <div style={{ height: '100%', width: `${Math.min(avgMargin, 100)}%`, background: avgMargin >= 40 ? 'var(--green)' : avgMargin >= 20 ? 'var(--yellow)' : '#ef4444', borderRadius: '0 0 0 16px', transition: 'width 0.6s ease' }} />
          </div>
        </div>
        <div style={{ background: 'var(--bg-surface)', border: `1px solid ${totals.atRiskCount > 0 ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`, padding: '20px 24px', borderRadius: '16px' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', opacity: 0.5, color: 'var(--text-secondary)', letterSpacing: 1 }}>⚠️ At Risk SKUs</div>
          <div style={{ fontSize: '2rem', fontWeight: 900, marginTop: 6, color: totals.atRiskCount > 0 ? '#ef4444' : 'var(--green)' }}>{totals.atRiskCount}</div>
          <div style={{ fontSize: '0.72rem', marginTop: 4, opacity: 0.5, color: 'var(--text-muted)' }}>Products with margin &lt; 20%</div>
        </div>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', padding: '20px 24px', borderRadius: '16px' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', opacity: 0.5, color: 'var(--text-secondary)', letterSpacing: 1 }}>⏳ Pending Value</div>
          <div style={{ fontSize: '2rem', fontWeight: 900, marginTop: 6, color: 'var(--yellow)' }}>Rs {totals.pendingValue.toLocaleString()}</div>
          <div style={{ fontSize: '0.72rem', marginTop: 4, opacity: 0.5, color: 'var(--text-muted)' }}>Awaiting cost acceptance</div>
        </div>
      </div>

      {/* ── Pill Tabs ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 28, flexWrap: 'wrap' }}>
        {[
          { key: 'pending',  label: 'Pending',  count: pendingItems.length,  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: '⏳' },
          { key: 'verified', label: 'Verified', count: verifiedItems.length, color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   icon: '✅' },
          { key: 'continue_selling', label: 'Continue Selling', count: continueSellingItems.length, color: '#a855f7', bg: 'rgba(168,85,247,0.12)', icon: '🔄' },
          { key: 'ghosts',   label: 'Ghosts',   count: ghosts.length,        color: 'var(--brand)', bg: 'var(--brand-glow)',  icon: '👻' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 18px', borderRadius: 50, border: 'none', cursor: 'pointer',
              background: activeTab === t.key ? t.bg : 'var(--bg-surface)',
              color: activeTab === t.key ? t.color : 'var(--text-muted)',
              fontWeight: activeTab === t.key ? 700 : 500,
              fontSize: '0.88rem',
              boxShadow: activeTab === t.key ? `0 0 0 1.5px ${t.color}` : '0 0 0 1px var(--border)',
              transition: 'all 0.2s ease'
            }}
          >
            {t.icon} {t.label}
            <span style={{
              background: activeTab === t.key ? t.color : 'var(--bg-elevated)',
              color: activeTab === t.key ? '#fff' : 'var(--text-muted)',
              borderRadius: 50, padding: '1px 8px', fontSize: '0.72rem', fontWeight: 700, minWidth: 22, textAlign: 'center'
            }}>{t.count}</span>
          </button>
        ))}
      </div>

      {(activeTab === 'pending' || activeTab === 'verified' || activeTab === 'continue_selling') && (
        <>
          {/* ── Smart Toolbar ── */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }}>🔍</span>
              <input type="text" className="form-input" placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 36, width: '100%' }} />
            </div>
            <select
              className="form-input"
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              style={{ width: 'auto', cursor: 'pointer' }}
            >
              <option value="value">Sort: By Value</option>
              <option value="margin">Sort: By Margin</option>
              <option value="stock">Sort: By Stock</option>
              <option value="name">Sort: By Name</option>
            </select>
            <select
              className="form-input"
              value={filterMargin}
              onChange={e => setFilterMargin(e.target.value)}
              style={{ width: 'auto', cursor: 'pointer' }}
            >
              <option value="all">Margin: All</option>
              <option value="high">Margin: High (&gt;40%)</option>
              <option value="mid">Margin: Mid (20–40%)</option>
              <option value="low">Margin: Low (&lt;20%) ⚠️</option>
            </select>
            {(search || filterMargin !== 'all') && (
              <button
                className="btn btn-secondary"
                style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}
                onClick={() => { setSearch(''); setFilterMargin('all') }}
              >✕ Clear</button>
            )}
          </div>

          {/* ── Loading State ── */}
          {loading && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              padding: '80px 20px', gap: 16
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                border: '4px solid var(--brand)',
                borderTopColor: 'transparent',
                animation: 'spin 0.8s linear infinite'
              }} />
              <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading cost registry...</div>
            </div>
          )}

          {/* ── Error State ── */}
          {!loading && loadError && (
            <div style={{
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 12, padding: '30px', textAlign: 'center'
            }}>
              <div style={{ fontSize: '2rem', marginBottom: 12 }}>⚠️</div>
              <div style={{ color: '#ef4444', fontWeight: 700, marginBottom: 6 }}>Failed to Load Registry</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 20 }}>{loadError}</div>
              <button className="btn btn-primary" onClick={fetchCosts}>🔄 Retry</button>
            </div>
          )}

          {/* ── Empty State (no data, no error) ── */}
          {!loading && !loadError && costs.length === 0 && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(79,70,229,0.03))',
              border: '1.5px dashed rgba(99,102,241,0.35)',
              borderRadius: 16, padding: '60px 30px', textAlign: 'center'
            }}>
              <div style={{ fontSize: '3.5rem', marginBottom: 16 }}>📦</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--brand)', marginBottom: 8 }}>
                Cost Registry Is Empty
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: 420, margin: '0 auto 24px' }}>
                No products found for this store. Click <strong>"Sync from Shopify"</strong> to import all products and their costs from your Shopify catalog.
              </div>
              <button
                className="btn btn-primary"
                style={{ padding: '12px 28px', fontSize: '1rem' }}
                onClick={handleSyncShopify}
                disabled={isSyncing}
              >
                {isSyncing ? '⌛ Syncing...' : '🔄 Sync from Shopify Now'}
              </button>
            </div>
          )}

          {/* ── Current Tab Empty State ── */}
          {!loading && !loadError && costs.length > 0 && currentList.length === 0 && (
            <div style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '40px', textAlign: 'center'
            }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>
                {activeTab === 'pending' ? '✅' : activeTab === 'continue_selling' ? '🔄' : '⏳'}
              </div>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                {activeTab === 'pending'
                  ? 'All products are verified!'
                  : activeTab === 'continue_selling'
                    ? 'No continue selling products'
                    : 'No verified products yet'}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                {activeTab === 'pending'
                  ? 'Every product in your registry has an accepted cost.'
                  : activeTab === 'continue_selling'
                    ? 'None of your variants are set to "Continue Selling when out of stock" on Shopify.'
                    : 'Accept costs for your products to see them here.'}
              </div>
            </div>
          )}

          {/* ── Main Table (only when data exists) ── */}
          {!loading && !loadError && currentList.length > 0 && (
          <div className="table-container" style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', opacity: 0.5, fontSize: '0.8rem', color: 'var(--text-muted)', borderBottom: '2px solid var(--border)' }}>
                  <th style={{ width: 40, textAlign: 'center', padding: '12px 0' }}>
                    <input 
                      type="checkbox" 
                      checked={selectedParents.size === currentList.length && currentList.length > 0}
                      onChange={() => toggleSelectAll(selectedParents.size === currentList.length)}
                    />
                  </th>
                  <th style={{ padding: '12px 15px' }}>Product / Variant</th>
                  <th style={{ textAlign: 'right', padding: '12px 8px' }}>Shopify Cost</th>
                  <th style={{ textAlign: 'right', padding: '12px 8px' }}>My Cost</th>
                  <th style={{ textAlign: 'center', padding: '12px 16px', minWidth: 140 }}>Margin</th>
                  <th style={{ textAlign: 'right', padding: '12px 8px' }}>Stock</th>
                  <th style={{ textAlign: 'right', padding: '12px 15px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentList.map(p => (
                  <React.Fragment key={p.name}>
                    <tr style={{ 
                      background: p.hasCost ? 'var(--green-dim)' : 'transparent', 
                      cursor: 'pointer',
                      borderLeft: p.hasCost ? '4px solid var(--green)' : '4px solid transparent',
                      borderBottom: '1px solid var(--border)'
                    }} onClick={() => toggleParent(p.name)}>
                      <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <input 
                          type="checkbox" 
                          checked={selectedParents.has(p.name)}
                          onClick={(e) => {
                            const checked = e.target.checked;
                            const currentIndex = currentList.findIndex(item => item.name === p.name);
                            if (e.shiftKey && lastSelectedParentIndex !== null) {
                              const start = Math.min(currentIndex, lastSelectedParentIndex);
                              const end = Math.max(currentIndex, lastSelectedParentIndex);
                              const namesInRange = currentList.slice(start, end + 1).map(item => item.name);
                              const next = new Set(selectedParents);
                              if (checked) {
                                namesInRange.forEach(name => next.add(name));
                              } else {
                                namesInRange.forEach(name => next.delete(name));
                              }
                              setSelectedParents(next);
                            } else {
                              toggleSelectParent(p.name);
                            }
                            setLastSelectedParentIndex(currentIndex);
                          }}
                          readOnly
                        />
                      </td>
                      <td style={{ padding: 15, fontWeight: 'bold', color: 'var(--text-primary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{ color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.9rem' }}>
                            {expandedParents.has(p.name) ? '▼' : '▶'}
                          </span>
                          
                          {/* Representative Image Thumbnail */}
                          {(() => {
                            const firstImage = p.variants.find(v => v.variant_image_url)?.variant_image_url;
                            return firstImage ? (
                              <img 
                                src={firstImage} 
                                alt={p.name} 
                                style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', border: '1px solid var(--border)' }} 
                              />
                            ) : (
                              <div style={{ width: 36, height: 36, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-elevated)', border: '1px solid var(--border)', fontSize: '1.1rem' }}>
                                📦
                              </div>
                            );
                          })()}

                          <span style={{ color: 'var(--text-primary)' }}>{p.name}</span>
                           {(() => {
                             const status = p.variants[0]?.status || 'active';
                             if (status !== 'active') {
                               return (
                                 <span style={{ 
                                   fontSize: '0.65rem', 
                                   fontWeight: 700,
                                   textTransform: 'uppercase',
                                   color: status === 'draft' ? '#fb923c' : '#94a3b8', 
                                   background: status === 'draft' ? 'rgba(251,146,60,0.1)' : 'rgba(148,163,184,0.1)', 
                                   border: `1px solid ${status === 'draft' ? '#fb923c' : '#94a3b8'}`,
                                   padding: '2px 6px', 
                                   borderRadius: 4,
                                   marginLeft: 6
                                 }}>
                                   {status}
                                 </span>
                               );
                             }
                             return null;
                           })()}
                           {p.hasCost && <span style={{ fontSize: '0.65rem', color: 'var(--green)', background: 'var(--green-dim)', padding: '2px 6px', borderRadius: 4 }}>✅ VERIFIED</span>}
                           {p.hasDrift && <span style={{ fontSize: '0.65rem', color: 'var(--yellow)', background: 'var(--yellow-dim)', padding: '2px 6px', borderRadius: 4 }}>⚠️ PRICE DRIFT</span>}
                        </div>
                        <div style={{ fontSize: '0.7rem', marginTop: 4, marginLeft: 52, opacity: 0.6, fontWeight: 'normal', color: 'var(--text-secondary)' }}>
                          {(() => {
                            const costs = Array.from(p.uniqueCosts).sort((a,b) => a-b)
                            const hasZero = costs.includes(0)
                            return (
                              <span style={{ color: hasZero ? 'var(--red)' : 'inherit' }}>
                                {hasZero ? '⚠️ Needs Costing (Contains Rs. 0)' : `Price range: Rs ${costs.join(', Rs ')}`}
                              </span>
                            )
                          })()}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--text-muted)', padding: '0 8px' }}>—</td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: p.hasCost ? 'var(--green)' : 'var(--text-primary)', padding: '0 8px' }}>{p.hasCost ? (p.totalValue > 0 ? `Rs ${p.totalValue.toLocaleString()}` : 'Rs 0') : '—'}</td>
                      {/* Margin Bar */}
                      <td style={{ padding: '0 16px' }}>
                        {p.margin !== null ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, height: 6, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden', minWidth: 70 }}>
                              <div style={{
                                height: '100%',
                                width: `${Math.min(p.margin, 100)}%`,
                                background: p.margin >= 40 ? 'var(--green)' : p.margin >= 20 ? 'var(--yellow)' : '#ef4444',
                                borderRadius: 3,
                                transition: 'width 0.4s ease'
                              }} />
                            </div>
                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: p.margin >= 40 ? 'var(--green)' : p.margin >= 20 ? 'var(--yellow)' : '#ef4444', minWidth: 34, textAlign: 'right' }}>
                              {p.margin}%
                            </span>
                          </div>
                        ) : <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--text-primary)', padding: '0 8px' }}>{p.totalQty}</td>
                      <td style={{ textAlign: 'right', padding: 15 }}>
                        <button className="btn btn-icon" title="Accept All Shopify Costs" onClick={(e) => { e.stopPropagation(); handleBulkAccept(p.name); }}>✅</button>
                        <button className="btn btn-icon" title="Bulk Set Cost/Pkg" onClick={(e) => { e.stopPropagation(); setBulkItem(p); setBulkForm({ unit_cost: 0, packaging_cost: 0 }); setShowBulkModal(true); }}>⚡</button>
                        <button className="btn btn-icon" title="Delete Product" onClick={(e) => { e.stopPropagation(); handleDeleteParent(p.name); }}>🗑️</button>
                      </td>
                    </tr>
                    {expandedParents.has(p.name) && p.variants.map((v, i) => (
                      <tr key={i} style={{ 
                        borderBottom: '1px solid var(--border)',
                        backgroundColor: (v.unit_cost + v.packaging_cost) > 0 ? 'var(--green-dim)' : 'transparent'
                      }}>
                        <td></td>
                        <td style={{ padding: '10px 15px 10px 40px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            {/* Variant Specific Image */}
                            {v.variant_image_url ? (
                              <img 
                                src={v.variant_image_url} 
                                alt={v.variant_title || 'Default'} 
                                style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover', border: '1px solid var(--border)' }} 
                              />
                            ) : (
                              <div style={{ width: 28, height: 28, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-elevated)', border: '1px solid var(--border)', fontSize: '0.8rem' }}>
                                📷
                              </div>
                            )}
                            
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                {v.variant_title || 'Default'}
                                {(v.unit_cost + v.packaging_cost) > 0 && <span style={{ color: 'var(--green)' }}>✓</span>}
                                {v.unit_cost > 0 && Math.abs(v.shopify_cost - v.unit_cost) > 1 && (
                                  <span style={{ fontSize: '0.6rem', color: 'var(--yellow)', background: 'var(--yellow-dim)', padding: '1px 4px', borderRadius: 3, fontWeight: 700 }}>DRIFT</span>
                                )}
                                {v.inventory_policy === 'continue' && (
                                  <span style={{ fontSize: '0.6rem', color: '#a855f7', background: 'rgba(168,85,247,0.1)', border: '1px solid #a855f7', padding: '1px 4px', borderRadius: 3, fontWeight: 700 }}>CONTINUE SELLING</span>
                                )}
                              </div>
                              {v.sku && <div style={{ fontSize: '0.65rem', opacity: 0.5, marginTop: 2 }}>SKU: {v.sku}</div>}
                            </div>
                          </div>
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--brand)', fontSize: '0.85rem', padding: '0 8px' }}>{v.shopify_cost > 0 ? `Rs ${v.shopify_cost.toLocaleString()}` : '—'}</td>
                        {/* Inline Edit Cells */}
                        <td style={{ textAlign: 'right', padding: '8px' }}>
                          {(() => {
                            const key = v.id || `${v.parent_title}@@@${v.variant_title}`
                            const edit = inlineEdits[key]
                            const landed = (v.unit_cost || 0) + (v.packaging_cost || 0)
                            return edit ? (
                              <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'flex-end' }}>
                                <input
                                  type="number"
                                  className="form-input"
                                  placeholder="Unit"
                                  value={edit.unit_cost}
                                  onChange={e => setInlineEdits({ ...inlineEdits, [key]: { ...edit, unit_cost: e.target.value } })}
                                  style={{ width: 72, height: 30, fontSize: '0.8rem', textAlign: 'right', padding: '0 6px' }}
                                  onClick={e => e.stopPropagation()}
                                />
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>+</span>
                                <input
                                  type="number"
                                  className="form-input"
                                  placeholder="Pkg"
                                  value={edit.packaging_cost}
                                  onChange={e => setInlineEdits({ ...inlineEdits, [key]: { ...edit, packaging_cost: e.target.value } })}
                                  style={{ width: 56, height: 30, fontSize: '0.8rem', textAlign: 'right', padding: '0 6px' }}
                                  onClick={e => e.stopPropagation()}
                                />
                              </div>
                            ) : (
                              <span style={{ fontWeight: 700, color: landed > 0 ? 'var(--green)' : 'var(--text-muted)' }}>
                                {landed > 0 ? `Rs ${landed.toLocaleString()}` : '—'}
                              </span>
                            )
                          })()}
                        </td>
                        {/* Margin Bar for variant */}
                        <td style={{ padding: '8px 16px' }}>
                          {(() => {
                            const landed = (v.unit_cost || 0) + (v.packaging_cost || 0)
                            const selling = v.selling_price || 0
                            if (landed > 0 && selling > 0) {
                              const m = Math.round(((selling - landed) / selling) * 100)
                              return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <div style={{ width: 50, height: 4, background: 'var(--bg-elevated)', borderRadius: 2, overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${Math.min(m, 100)}%`, background: m >= 40 ? 'var(--green)' : m >= 20 ? 'var(--yellow)' : '#ef4444', borderRadius: 2 }} />
                                  </div>
                                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: m >= 40 ? 'var(--green)' : m >= 20 ? 'var(--yellow)' : '#ef4444' }}>{m}%</span>
                                </div>
                              )
                            }
                            return <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>
                          })()}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--text-primary)', padding: '0 8px' }}>{v.inventory_qty}</td>
                        <td style={{ textAlign: 'right', padding: '8px 15px' }} onClick={e => e.stopPropagation()}>
                          {(() => {
                            const key = v.id || `${v.parent_title}@@@${v.variant_title}`
                            const edit = inlineEdits[key]
                            const isSaving = savingInline === key
                            return edit ? (
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button
                                  className="btn btn-primary btn-sm"
                                  style={{ padding: '3px 10px', fontSize: '0.75rem', height: 30 }}
                                  onClick={() => handleInlineSave(v)}
                                  disabled={isSaving}
                                >{isSaving ? '⌛' : '✓ Save'}</button>
                                <button
                                  className="btn btn-secondary btn-sm"
                                  style={{ padding: '3px 8px', fontSize: '0.75rem', height: 30 }}
                                  onClick={() => { const n={...inlineEdits}; delete n[key]; setInlineEdits(n) }}
                                >✕</button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: 4 }}>
                                {v.shopify_cost > 0 && Math.abs(v.shopify_cost - v.unit_cost) > 1 && (
                                  <button className="btn btn-icon" title="Accept Shopify Cost" onClick={() => handleAcceptShopifyCost(v)}>✅</button>
                                )}
                                <button
                                  className="btn btn-icon"
                                  title="Edit inline"
                                  onClick={() => setInlineEdits({ ...inlineEdits, [key]: { unit_cost: v.unit_cost || 0, packaging_cost: v.packaging_cost || 0 } })}
                                >✏️</button>
                              </div>
                            )
                          })()}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          )} {/* end !loading && !loadError && currentList.length > 0 */}
        </>
      )}


      {activeTab === 'ghosts' && (
        <div style={{ position: 'relative' }}>
          {selectedGhosts.size > 0 && (
            <div style={{ 
              position: 'sticky', top: 10, zIndex: 100, 
              background: 'var(--brand)', color: '#fff', 
              padding: '12px 20px', borderRadius: 12, 
              marginBottom: 20, display: 'flex', 
              justifyContent: 'space-between', alignItems: 'center',
              boxShadow: '0 8px 32px var(--brand-glow)'
            }}>
              <div style={{ fontWeight: 'bold' }}>⚡ {selectedGhosts.size} products selected</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input 
                  type="number" 
                  id="ghost-bulk-input"
                  placeholder="Enter Rs cost" 
                  className="form-input"
                  style={{ width: 140, background: 'var(--bg-surface)', color: 'var(--text-primary)', border: 'none', height: 35 }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = e.target.value;
                      if (!val) return;
                      const next = {...ghostCosts};
                      selectedGhosts.forEach(pName => {
                        const product = ghosts.find(g => g.name === pName);
                        if (product) {
                          product.variants.forEach(v => {
                            next[`${pName}@@@${v.name || ''}`] = val;
                          });
                        }
                      });
                      setGhostCosts(next);
                      setSelectedGhosts(new Set());
                      addToast(`Applied Rs ${val} to ${selectedGhosts.size} products`, 'success');
                    }
                  }}
                />
                <button 
                  className="btn btn-sm"
                  style={{ background: '#000', color: '#fff', fontWeight: 'bold' }}
                  onClick={() => {
                    const val = document.getElementById('ghost-bulk-input').value;
                    if (!val) return addToast('Please enter a cost first', 'warning');
                    const next = {...ghostCosts};
                    selectedGhosts.forEach(pName => {
                      const product = ghosts.find(g => g.name === pName);
                      if (product) {
                        product.variants.forEach(v => {
                          next[`${pName}@@@${v.name || ''}`] = val;
                        });
                      }
                    });
                    setGhostCosts(next);
                    setSelectedGhosts(new Set());
                    addToast(`Applied Rs ${val} to ${selectedGhosts.size} products`, 'success');
                  }}
                >Apply to Selected</button>
                <button 
                  className="btn btn-sm" 
                  style={{ background: 'transparent', color: '#fff', border: '1px solid #fff' }}
                  onClick={() => setSelectedGhosts(new Set())}
                >Cancel</button>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 20 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.5, color: 'var(--text-muted)' }}>🔍</span>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Search ghost products..." 
                style={{ paddingLeft: 35, background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
                value={ghostSearch}
                onChange={e => setGhostSearch(e.target.value)}
              />
            </div>
            <div style={{ color: 'var(--brand)', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
              <strong>{ghosts.length}</strong> items found
            </div>
          </div>

          <div style={{ background: 'var(--brand-glow)', padding: 15, borderRadius: 8, marginBottom: 20, border: '1px solid var(--brand)' }}>
            <p style={{ margin: 0, color: 'var(--brand)' }}>Found <strong>{ghosts.length}</strong> products in your history that are missing costs. Fill them in below to fix your P&L.</p>
          </div>
          
          <div className="table-container" style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', opacity: 0.5, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  <th style={{ padding: 15, width: 40 }}>
                    <input 
                      type="checkbox" 
                      onChange={(e) => {
                        if (e.target.checked) {
                          const all = new Set(ghosts.filter(p => p.name.toLowerCase().includes(ghostSearch.toLowerCase())).map(p => p.name));
                          setSelectedGhosts(all);
                        } else {
                          setSelectedGhosts(new Set());
                        }
                      }}
                      checked={selectedGhosts.size > 0 && selectedGhosts.size === ghosts.filter(p => p.name.toLowerCase().includes(ghostSearch.toLowerCase())).length}
                    />
                  </th>
                  <th style={{ padding: 15 }}>Product / Variant</th>
                  <th style={{ textAlign: 'center' }}>Occurrences</th>
                  <th style={{ textAlign: 'right' }}>Target Cost</th>
                  <th style={{ textAlign: 'right', padding: 15 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {ghosts.filter(p => p.name.toLowerCase().includes(ghostSearch.toLowerCase())).map(p => (
                  <React.Fragment key={p.name}>
                    <tr 
                      style={{ cursor: 'pointer', background: selectedGhosts.has(p.name) ? 'var(--brand-glow)' : 'transparent', borderBottom: '1px solid var(--border)' }} 
                      onClick={() => toggleParent(p.name)}
                    >
                      <td style={{ padding: 15 }} onClick={(e) => e.stopPropagation()}>
                        <input 
                          type="checkbox" 
                          checked={selectedGhosts.has(p.name)} 
                          onClick={(e) => {
                            const checked = e.target.checked;
                            const filteredGhosts = ghosts.filter(g => g.name.toLowerCase().includes(ghostSearch.toLowerCase()));
                            const currentIndex = filteredGhosts.findIndex(item => item.name === p.name);
                            
                            if (e.shiftKey && lastSelectedGhostIndex !== null) {
                              const start = Math.min(currentIndex, lastSelectedGhostIndex);
                              const end = Math.max(currentIndex, lastSelectedGhostIndex);
                              const namesInRange = filteredGhosts.slice(start, end + 1).map(item => item.name);
                              const next = new Set(selectedGhosts);
                              if (checked) {
                                namesInRange.forEach(name => next.add(name));
                              } else {
                                namesInRange.forEach(name => next.delete(name));
                              }
                              setSelectedGhosts(next);
                            } else {
                              const next = new Set(selectedGhosts);
                              if (next.has(p.name)) next.delete(p.name);
                              else next.add(p.name);
                              setSelectedGhosts(next);
                            }
                            setLastSelectedGhostIndex(currentIndex);
                          }}
                          readOnly
                        />
                      </td>
                      <td style={{ padding: 15, fontWeight: 'bold', color: 'var(--text-primary)' }}>
                        <span style={{ marginRight: 10 }}>{expandedParents.has(p.name) ? '▼' : '▶'}</span>
                        {p.name}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="badge-warning">{p.count} Orders</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                          <span style={{ fontSize: '0.7rem', opacity: 0.5, color: 'var(--text-muted)' }}>Bulk:</span>
                          <input 
                            type="number" 
                            className="form-input" 
                            style={{ width: 100, textAlign: 'right', height: 32 }} 
                            placeholder="Set All"
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const val = e.target.value;
                              const next = {...ghostCosts};
                              p.variants.forEach(v => {
                                // Ensure we use the exact variant name from the backend structure
                                next[`${p.name}@@@${v.name || ''}`] = val;
                              });
                              setGhostCosts(next);
                            }}
                          />
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', padding: 15 }}>
                         <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); handleInspectGhost(p.name); }}>🔍 Orders</button>
                      </td>
                    </tr>
                    {expandedParents.has(p.name) && p.variants.map((v, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: selectedGhosts.has(p.name) ? 'var(--brand-glow)' : 'var(--bg-elevated)' }}>
                        <td></td>
                        <td style={{ padding: '10px 15px 10px 45px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                          └─ {v.name || 'Default Variant'}
                        </td>
                        <td style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          {v.count}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <input 
                            type="number" 
                            className="form-input" 
                            style={{ width: 100, textAlign: 'right', height: 30, fontSize: '0.85rem' }} 
                            value={ghostCosts[`${p.name}@@@${v.name}`] || ''} 
                            onChange={e => setGhostCosts({...ghostCosts, [`${p.name}@@@${v.name}`]: e.target.value})} 
                          />
                        </td>
                        <td style={{ textAlign: 'right', padding: 15 }}>
                           <button 
                            className="btn btn-primary btn-sm" 
                            style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                            onClick={() => {
                              setEditingItem({ parent_title: p.name, variant_title: v.name });
                              setForm({ 
                                parent_title: p.name, 
                                variant_title: v.name, 
                                unit_cost: parseFloat(ghostCosts[`${p.name}@@@${v.name}`]) || 0, 
                                packaging_cost: 0 
                              });
                              setShowModal(true);
                            }}
                           >Fix This</button>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ textAlign: 'right', marginTop: 20 }}>
            <button className="btn btn-success btn-lg" onClick={handleApplyGhostCosts}>🚀 Save & Apply All Ghost Costs</button>
          </div>
        </div>
      )}

      {/* Modals */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ color: 'var(--text-primary)' }}>{editingItem ? 'Edit Cost' : 'Add Cost'}</h3>
            <form onSubmit={handleSave}>
              <div className="form-group"><label style={{ color: 'var(--text-secondary)' }}>Product Title</label><input type="text" className="form-input" value={form.parent_title} onChange={e => setForm({...form, parent_title: e.target.value})} disabled={!!editingItem} /></div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="form-group" style={{ flex: 1 }}><label style={{ color: 'var(--text-secondary)' }}>Unit Cost (Rs)</label><input type="number" className="form-input" value={form.unit_cost} onChange={e => setForm({...form, unit_cost: parseFloat(e.target.value)})} /></div>
                <div className="form-group" style={{ flex: 1 }}><label style={{ color: 'var(--text-secondary)' }}>Packaging (Rs)</label><input type="number" className="form-input" value={form.packaging_cost} onChange={e => setForm({...form, packaging_cost: parseFloat(e.target.value)})} /></div>
              </div>
              <div style={{ background: 'var(--brand-glow)', padding: 10, borderRadius: 8, textAlign: 'center', marginBottom: 20 }}>
                <div style={{ fontSize: '0.7rem', opacity: 0.5, color: 'var(--text-muted)' }}>Landed Cost</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--brand)' }}>Rs {(form.unit_cost + form.packaging_cost).toLocaleString()}</div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}><button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button><button type="submit" className="btn btn-primary">Save</button></div>
            </form>
          </div>
        </div>
      )}

      {showBulkModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ color: 'var(--text-primary)' }}>Bulk Update: {bulkItem.name}</h3>
            <form onSubmit={handleBulkSync}>
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="form-group" style={{ flex: 1 }}><label style={{ color: 'var(--text-secondary)' }}>Unit Cost</label><input type="number" className="form-input" value={bulkForm.unit_cost} onChange={e => setBulkForm({...bulkForm, unit_cost: parseFloat(e.target.value)})} /></div>
                <div className="form-group" style={{ flex: 1 }}><label style={{ color: 'var(--text-secondary)' }}>Packaging</label><input type="number" className="form-input" value={bulkForm.packaging_cost} onChange={e => setBulkForm({...bulkForm, packaging_cost: parseFloat(e.target.value)})} /></div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}><button type="button" className="btn btn-secondary" onClick={() => setShowBulkModal(false)}>Cancel</button><button type="submit" className="btn btn-primary">Apply to All Variants</button></div>
            </form>
          </div>
        </div>
      )}

      {showGhostModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 800, width: '95%' }}>
            <h3 style={{ color: 'var(--text-primary)' }}>🔍 Order Verification: {inspectingGhost}</h3>
            <div style={{ maxHeight: 400, overflowY: 'auto', marginTop: 20 }}>
              {loadingGhostOrders ? <p style={{ color: 'var(--text-muted)' }}>Loading history...</p> : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ textAlign: 'left', opacity: 0.5, fontSize: '0.8rem', color: 'var(--text-muted)' }}><th>Date</th><th>Ref #</th><th>Customer</th><th style={{ textAlign: 'right' }}>Price</th></tr></thead>
                  <tbody>{ghostOrders.map((o,i) => (<tr key={i} style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: 10, color: 'var(--text-primary)' }}>{o.order_date}</td><td style={{ padding: 10, color: 'var(--text-primary)' }}>{o.ref_number}</td><td style={{ padding: 10, color: 'var(--text-primary)' }}>{o.customer_name}</td><td style={{ textAlign: 'right', padding: 10, color: 'var(--text-primary)' }}>Rs {o.price?.toLocaleString()}</td></tr>))}</tbody>
                </table>
              )}
            </div>
            <div style={{ marginTop: 20, textAlign: 'right' }}><button className="btn btn-secondary" onClick={() => setShowGhostModal(false)}>Close</button></div>
          </div>
        </div>
      )}

      {/* ── Diagnose Report Modal ── */}
      {diagnoseReport && (
        <div className="modal-overlay" onClick={() => setDiagnoseReport(null)}>
          <div className="modal-content" style={{ maxWidth: 680, width: '95%', maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, color: diagnoseReport.passed ? 'var(--green)' : 'var(--yellow)' }}>
                {diagnoseReport.passed ? '✅ Shopify Connection Healthy' : '⚠️ Shopify Sync Diagnostic'}
              </h3>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.4rem' }} onClick={() => setDiagnoseReport(null)}>×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {diagnoseReport.steps.map((step, i) => (
                <div key={i} style={{
                  background: step.status.includes('✅') ? 'var(--green-dim)' : step.status.includes('⚠️') ? 'rgba(251,146,60,0.08)' : 'rgba(239,68,68,0.08)',
                  border: `1px solid ${step.status.includes('✅') ? 'var(--green)' : step.status.includes('⚠️') ? 'rgba(251,146,60,0.4)' : 'rgba(239,68,68,0.3)'}`,
                  borderRadius: 10, padding: '12px 16px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{step.step}</div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                      background: step.status.includes('✅') ? 'var(--green-dim)' : step.status.includes('⚠️') ? 'rgba(251,146,60,0.15)' : 'rgba(239,68,68,0.15)',
                      color: step.status.includes('✅') ? 'var(--green)' : step.status.includes('⚠️') ? '#fb923c' : '#ef4444'
                    }}>{step.status}</div>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{step.detail}</div>
                  {step.sample && step.sample.length > 0 && (
                    <div style={{ marginTop: 10, background: 'var(--bg-elevated)', borderRadius: 6, padding: 10 }}>
                      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>Sample Products Found:</div>
                      {step.sample.map((s, j) => (
                        <div key={j} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '4px 0', borderBottom: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                          <span>{s.product}{s.variant !== 'Default Title' ? ` — ${s.variant}` : ''}</span>
                          <span style={{ color: String(s.shopify_cost).includes('null') ? '#ef4444' : 'var(--green)', fontWeight: 600 }}>
                            {String(s.shopify_cost).includes('null') ? '❌ Cost not set in Shopify' : `Rs ${s.shopify_cost}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {!diagnoseReport.passed && (
              <div style={{ marginTop: 20, background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.3)', borderRadius: 10, padding: 16 }}>
                <div style={{ fontWeight: 700, color: 'var(--yellow)', marginBottom: 8 }}>🔧 How to Fix</div>
                <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.9 }}>
                  <li><strong>REST failed (401/403)</strong>: Token expired. Go to Settings → Stores and reconnect this store.</li>
                  <li><strong>GraphQL error</strong>: Token is missing read_products or read_inventory scope. Re-install the app.</li>
                  <li><strong>0 variants found</strong>: Check that Shopify store has active (non-archived) products.</li>
                </ul>
              </div>
            )}
            <div style={{ textAlign: 'right', marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={() => setDiagnoseReport(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal-content { background: var(--bg-surface); padding: 30px; border-radius: 16px; border: 1px solid var(--border); width: 450px; }
        .form-group { margin-bottom: 15px; }
        .form-group label { display: block; margin-bottom: 5px; opacity: 0.6; font-size: 0.8rem; }
        .btn-icon { background: none; border: none; cursor: pointer; opacity: 0.5; padding: 5px; }
        .btn-icon:hover { opacity: 1; color: var(--brand); }
        .badge-warning { background: var(--yellow-dim); color: var(--yellow); padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  )
}
