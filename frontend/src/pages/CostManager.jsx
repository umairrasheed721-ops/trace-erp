import React, { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'

export default function CostManager() {
  const { activeStoreId, addToast } = useApp()
  const [costs, setCosts] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [activeTab, setActiveTab] = useState('pending')
  const [selectedParents, setSelectedParents] = useState(new Set())
  const [bulkProcessing, setBulkProcessing] = useState(false)
  const [expandedParents, setExpandedParents] = useState(new Set())
  
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

  useEffect(() => {
    if (activeStoreId) {
      fetchCosts()
      fetchGhosts()
    }
  }, [activeStoreId])

  const fetchCosts = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/finance/master-costs?store_id=${activeStoreId}`)
      const data = await res.json()
      setCosts(Array.isArray(data) ? data : [])
    } catch (e) {
      addToast('Failed to load cost registry', 'error')
    } finally {
      setLoading(false)
    }
  }

  const fetchGhosts = async () => {
    try {
      const res = await fetch(`/api/finance/missing-product-list?store_id=${activeStoreId}`)
      const data = await res.json()
      setGhosts(data)
    } catch (e) { console.error('Failed to fetch ghosts', e) }
  }

  const handleSyncShopify = async () => {
    setIsSyncing(true)
    try {
      const res = await fetch('/api/finance/sync-shopify-costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: activeStoreId })
      })
      const data = await res.json()
      if (data.success) {
        addToast(`Synced ${data.count} variants from Shopify`, 'success')
        fetchCosts()
      }
    } catch (e) { addToast('Sync error: ' + e.message, 'error') }
    finally { setIsSyncing(false) }
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
      const parent = grouped[parentTitle]
      for (const v of parent.variants) {
        if (v.shopify_cost > 0) {
          await fetch('/api/finance/accept-shopify-cost', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ store_id: activeStoreId, parent_title: v.parent_title, variant_title: v.variant_title })
          })
        }
      }
      addToast(`Accepted all costs for ${parentTitle}`, 'success')
      fetchCosts()
    } catch (e) { addToast('Bulk accept failed', 'error') }
  }

  const toggleParent = (name) => {
    const next = new Set(expandedParents)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setExpandedParents(next)
  }

  const totals = {
    acceptedValue: 0,
    acceptedQty: 0,
    pendingValue: 0,
    totalVariants: costs.length
  }

  const grouped = {}
  costs.forEach(c => {
    if (!grouped[c.parent_title]) grouped[c.parent_title] = { name: c.parent_title, variants: [], totalQty: 0, totalValue: 0 }
    grouped[c.parent_title].variants.push(c)
    grouped[c.parent_title].totalQty += (c.inventory_qty || 0)
    
    const landed = (c.unit_cost || 0) + (c.packaging_cost || 0)
    if (landed > 0) {
      totals.acceptedValue += landed * (c.inventory_qty || 0)
      totals.acceptedQty += (c.inventory_qty || 0)
    } else if (c.shopify_cost > 0) {
      totals.pendingValue += c.shopify_cost * (c.inventory_qty || 0)
    }
    
    grouped[c.parent_title].totalValue += landed * (c.inventory_qty || 0)
    if (landed > 0) grouped[c.parent_title].hasCost = true
    
    // Track Price Drift (Shopify Cost changed but we haven't accepted it)
    if (c.unit_cost > 0 && Math.abs(c.shopify_cost - c.unit_cost) > 1) {
      grouped[c.parent_title].hasDrift = true
    }

    // Track unique costs for the hint
    if (!grouped[c.parent_title].uniqueCosts) grouped[c.parent_title].uniqueCosts = new Set()
    grouped[c.parent_title].uniqueCosts.add(c.shopify_cost || 0)
  })

  const sorted = Object.values(grouped)
    .filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => b.totalValue - a.totalValue)

  const pendingItems = sorted.filter(p => !p.hasCost)
  const verifiedItems = sorted.filter(p => p.hasCost)

  const currentList = activeTab === 'pending' ? pendingItems : activeTab === 'verified' ? verifiedItems : []
  
  return (
    <div className="page-container cost-manager" style={{ padding: 30 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 }}>
        <div>
          <h1 style={{ margin: 0, color: '#00f2fe' }}>📈 Master Costing Registry</h1>
          <p style={{ margin: '5px 0 0', opacity: 0.6 }}>Manage product costs and fix historical ghost listings.</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn btn-secondary" onClick={handleSyncShopify} disabled={isSyncing}>
            {isSyncing ? '⌛ Syncing...' : '🔄 Sync from Shopify'}
          </button>
          <button className="btn btn-primary" onClick={() => { setEditingItem(null); setForm({ parent_title: '', variant_title: '', unit_cost: 0, packaging_cost: 0 }); setShowModal(true); }}>
            + Add Manual
          </button>
        </div>
      </header>

      {selectedParents.size > 0 && (
        <div style={{ 
          background: 'rgba(52, 211, 153, 0.1)', 
          border: '1px solid #34d399', 
          padding: '15px 25px', 
          borderRadius: 12, 
          marginBottom: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          animation: 'slideDown 0.3s ease'
        }}>
          <div style={{ color: '#34d399', fontWeight: 'bold' }}>
            ⚡ {selectedParents.size} Products Selected
          </div>
          <button 
            className="btn btn-primary" 
            style={{ background: '#34d399', color: '#000' }}
            onClick={handleBulkAcceptSelected}
            disabled={bulkProcessing}
          >
            {bulkProcessing ? '⌛ Processing...' : `✅ Accept All Selected Costs`}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 20, marginBottom: 30 }}>
        <div className="stat-card" style={{ flex: 1, background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)', color: '#000', padding: '20px', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0, 242, 254, 0.2)' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 'bold', textTransform: 'uppercase', opacity: 0.7 }}>💰 Total Inventory Value (Accepted)</div>
          <div style={{ fontSize: '2.2rem', fontWeight: 900, marginTop: 5 }}>Rs {totals.acceptedValue.toLocaleString()}</div>
          <div style={{ fontSize: '0.75rem', marginTop: 5, opacity: 0.8 }}>Asset worth of {totals.acceptedQty} items</div>
        </div>
        <div className="stat-card" style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', padding: '20px', borderRadius: '16px' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 'bold', textTransform: 'uppercase', opacity: 0.5 }}>⏳ Pending Acceptance</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, marginTop: 5, color: '#fcd34d' }}>Rs {totals.pendingValue.toLocaleString()}</div>
          <div style={{ fontSize: '0.75rem', marginTop: 5, opacity: 0.5 }}>Value waiting in Shopify drafts</div>
        </div>
        <div className="stat-card" style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', padding: '20px', borderRadius: '16px' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 'bold', textTransform: 'uppercase', opacity: 0.5 }}>📦 Total variants</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, marginTop: 5 }}>{totals.totalVariants}</div>
          <div style={{ fontSize: '0.75rem', marginTop: 5, opacity: 0.5 }}>Active SKUs in Registry</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 30, marginBottom: 30, borderBottom: '1px solid #333' }}>
        <button onClick={() => setActiveTab('pending')} style={{ padding: '15px 0', background: 'none', border: 'none', color: activeTab === 'pending' ? '#fcd34d' : '#666', borderBottom: activeTab === 'pending' ? '2px solid #fcd34d' : 'none', cursor: 'pointer', fontWeight: 'bold' }}>
          ⏳ Pending Registry ({pendingItems.length})
        </button>
        <button onClick={() => setActiveTab('verified')} style={{ padding: '15px 0', background: 'none', border: 'none', color: activeTab === 'verified' ? '#34d399' : '#666', borderBottom: activeTab === 'verified' ? '2px solid #34d399' : 'none', cursor: 'pointer', fontWeight: 'bold' }}>
          ✅ Verified Registry ({verifiedItems.length})
        </button>
        <button onClick={() => setActiveTab('ghosts')} style={{ padding: '15px 0', background: 'none', border: 'none', color: activeTab === 'ghosts' ? '#00f2fe' : '#666', borderBottom: activeTab === 'ghosts' ? '2px solid #00f2fe' : 'none', cursor: 'pointer', fontWeight: 'bold' }}>
          👻 Ghost Listings ({ghosts.length})
        </button>
      </div>

      {(activeTab === 'pending' || activeTab === 'verified') && (
        <>
          <div style={{ marginBottom: 20 }}>
            <input type="text" className="form-input" placeholder="🔍 Search products..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 400 }} />
          </div>
          <div className="table-container" style={{ background: '#111', borderRadius: 12, border: '1px solid #222' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', opacity: 0.5, fontSize: '0.8rem' }}>
                  <th style={{ width: 40, textAlign: 'center' }}>
                    <input 
                      type="checkbox" 
                      checked={selectedParents.size === currentList.length && currentList.length > 0}
                      onChange={() => toggleSelectAll(selectedParents.size === currentList.length)}
                    />
                  </th>
                  <th style={{ padding: 15 }}>Product / Variant</th>
                  <th style={{ textAlign: 'right' }}>Shopify Cost</th>
                  <th style={{ textAlign: 'right' }}>My Cost</th>
                  <th style={{ textAlign: 'right' }}>Stock</th>
                  <th style={{ textAlign: 'right', padding: 15 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentList.map(p => (
                  <React.Fragment key={p.name}>
                    <tr style={{ 
                      background: p.hasCost ? 'rgba(52, 211, 153, 0.05)' : 'rgba(255,255,255,0.02)', 
                      cursor: 'pointer',
                      borderLeft: p.hasCost ? '4px solid #34d399' : '4px solid transparent'
                    }} onClick={() => toggleParent(p.name)}>
                      <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <input 
                          type="checkbox" 
                          checked={selectedParents.has(p.name)}
                          onChange={() => toggleSelectParent(p.name)}
                        />
                      </td>
                      <td style={{ padding: 15, fontWeight: 'bold' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span>{expandedParents.has(p.name) ? '▼' : '▶'} {p.name}</span>
                          {p.hasCost && <span style={{ fontSize: '0.65rem', color: '#34d399', background: 'rgba(52, 211, 153, 0.1)', padding: '2px 6px', borderRadius: 4 }}>✅ VERIFIED</span>}
                          {p.hasDrift && <span style={{ fontSize: '0.65rem', color: '#fcd34d', background: 'rgba(252, 211, 77, 0.1)', padding: '2px 6px', borderRadius: 4 }}>⚠️ PRICE DRIFT</span>}
                        </div>
                        <div style={{ fontSize: '0.7rem', marginTop: 4, opacity: 0.6, fontWeight: 'normal' }}>
                          {(() => {
                            const costs = Array.from(p.uniqueCosts).sort((a,b) => a-b)
                            const hasZero = costs.includes(0)
                            return (
                              <span style={{ color: hasZero ? '#f87171' : 'inherit' }}>
                                {hasZero ? '⚠️ Needs Costing (Contains Rs. 0)' : `Price range: Rs ${costs.join(', Rs ')}`}
                              </span>
                            )
                          })()}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>—</td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: p.hasCost ? '#34d399' : 'inherit' }}>{p.hasCost ? (p.totalValue > 0 ? `Rs ${p.totalValue.toLocaleString()}` : 'Rs 0 (No Stock)') : '—'}</td>
                      <td style={{ textAlign: 'right' }}>{p.totalQty}</td>
                      <td style={{ textAlign: 'right', padding: 15 }}>
                        <button className="btn btn-icon" title="Accept All Shopify Costs" onClick={(e) => { e.stopPropagation(); handleBulkAccept(p.name); }}>✅</button>
                        <button className="btn btn-icon" title="Bulk Set Cost/Pkg" onClick={(e) => { e.stopPropagation(); setBulkItem(p); setBulkForm({ unit_cost: 0, packaging_cost: 0 }); setShowBulkModal(true); }}>⚡</button>
                        <button className="btn btn-icon" title="Delete Product" onClick={(e) => { e.stopPropagation(); handleDeleteParent(p.name); }}>🗑️</button>
                      </td>
                    </tr>
                    {expandedParents.has(p.name) && p.variants.map((v, i) => (
                      <tr key={i} style={{ 
                        borderBottom: '1px solid #222',
                        backgroundColor: (v.unit_cost + v.packaging_cost) > 0 ? 'rgba(52, 211, 153, 0.02)' : 'transparent'
                      }}>
                        <td></td>
                        <td style={{ padding: '12px 15px 12px 40px', opacity: 0.7 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {v.variant_title || 'Default'}
                            {(v.unit_cost + v.packaging_cost) > 0 && <span style={{ color: '#34d399' }}>✓</span>}
                            {v.unit_cost > 0 && Math.abs(v.shopify_cost - v.unit_cost) > 1 && (
                              <span style={{ fontSize: '0.6rem', color: '#fcd34d', background: 'rgba(252, 211, 77, 0.1)', padding: '1px 4px', borderRadius: 3 }}>DRIFT</span>
                            )}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right', color: '#00f2fe', fontSize: '0.85rem' }}>{v.shopify_cost > 0 ? `Rs ${v.shopify_cost.toLocaleString()}` : '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold', color: (v.unit_cost + v.packaging_cost) > 0 ? '#34d399' : '#666' }}>
                          {(v.unit_cost + v.packaging_cost) > 0 ? `Rs ${(v.unit_cost + v.packaging_cost).toLocaleString()}` : '—'}
                        </td>
                        <td style={{ textAlign: 'right', opacity: 0.8 }}>{v.inventory_qty}</td>
                        <td style={{ textAlign: 'right', padding: 15 }}>
                          {v.shopify_cost > 0 && Math.abs(v.shopify_cost - v.unit_cost) > 1 && (
                            <button className="btn btn-icon" title="Accept Shopify Cost" onClick={() => handleAcceptShopifyCost(v)}>✅</button>
                          )}
                          <button className="btn btn-icon" title="Edit" onClick={() => { setEditingItem(v); setForm(v); setShowModal(true); }}>✏️</button>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === 'ghosts' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 20 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Search ghost products..." 
                style={{ paddingLeft: 35, background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(0,242,254,0.2)' }}
                value={ghostSearch}
                onChange={e => setGhostSearch(e.target.value)}
              />
            </div>
            <div style={{ color: '#00f2fe', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
              <strong>{ghosts.length}</strong> items found
            </div>
          </div>

          <div style={{ background: 'rgba(0,242,254,0.05)', padding: 15, borderRadius: 8, marginBottom: 20, border: '1px solid rgba(0,242,254,0.2)' }}>
            <p style={{ margin: 0, color: '#00f2fe' }}>Found <strong>{ghosts.length}</strong> products in your history that are missing costs. Fill them in below to fix your P&L.</p>
          </div>
          
          <div className="table-container" style={{ background: '#111', borderRadius: 12, border: '1px solid #222' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', opacity: 0.5, fontSize: '0.8rem' }}>
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
                      style={{ cursor: 'pointer', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid #222' }} 
                      onClick={() => toggleParent(p.name)}
                    >
                      <td style={{ padding: 15, fontWeight: 'bold' }}>
                        <span style={{ marginRight: 10 }}>{expandedParents.has(p.name) ? '▼' : '▶'}</span>
                        {p.name}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="badge-warning">{p.count} Orders</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                          <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>Bulk:</span>
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
                      <tr key={i} style={{ borderBottom: '1px solid #222', background: 'rgba(0,0,0,0.2)' }}>
                        <td style={{ padding: '10px 15px 10px 45px', opacity: 0.8, fontSize: '0.9rem' }}>
                          └─ {v.name || 'Default Variant'}
                        </td>
                        <td style={{ textAlign: 'center', opacity: 0.6, fontSize: '0.85rem' }}>
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
            <h3>{editingItem ? 'Edit Cost' : 'Add Cost'}</h3>
            <form onSubmit={handleSave}>
              <div className="form-group"><label>Product Title</label><input type="text" className="form-input" value={form.parent_title} onChange={e => setForm({...form, parent_title: e.target.value})} disabled={!!editingItem} /></div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="form-group" style={{ flex: 1 }}><label>Unit Cost (Rs)</label><input type="number" className="form-input" value={form.unit_cost} onChange={e => setForm({...form, unit_cost: parseFloat(e.target.value)})} /></div>
                <div className="form-group" style={{ flex: 1 }}><label>Packaging (Rs)</label><input type="number" className="form-input" value={form.packaging_cost} onChange={e => setForm({...form, packaging_cost: parseFloat(e.target.value)})} /></div>
              </div>
              <div style={{ background: 'rgba(0,242,254,0.05)', padding: 10, borderRadius: 8, textAlign: 'center', marginBottom: 20 }}>
                <div style={{ fontSize: '0.7rem', opacity: 0.5 }}>Landed Cost</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#00f2fe' }}>Rs {(form.unit_cost + form.packaging_cost).toLocaleString()}</div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}><button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button><button type="submit" className="btn btn-primary">Save</button></div>
            </form>
          </div>
        </div>
      )}

      {showBulkModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Bulk Update: {bulkItem.name}</h3>
            <form onSubmit={handleBulkSync}>
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="form-group" style={{ flex: 1 }}><label>Unit Cost</label><input type="number" className="form-input" value={bulkForm.unit_cost} onChange={e => setBulkForm({...bulkForm, unit_cost: parseFloat(e.target.value)})} /></div>
                <div className="form-group" style={{ flex: 1 }}><label>Packaging</label><input type="number" className="form-input" value={bulkForm.packaging_cost} onChange={e => setBulkForm({...bulkForm, packaging_cost: parseFloat(e.target.value)})} /></div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}><button type="button" className="btn btn-secondary" onClick={() => setShowBulkModal(false)}>Cancel</button><button type="submit" className="btn btn-primary">Apply to All Variants</button></div>
            </form>
          </div>
        </div>
      )}

      {showGhostModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 800, width: '95%' }}>
            <h3>🔍 Order Verification: {inspectingGhost}</h3>
            <div style={{ maxHeight: 400, overflowY: 'auto', marginTop: 20 }}>
              {loadingGhostOrders ? <p>Loading history...</p> : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ textAlign: 'left', opacity: 0.5, fontSize: '0.8rem' }}><th>Date</th><th>Ref #</th><th>Customer</th><th style={{ textAlign: 'right' }}>Price</th></tr></thead>
                  <tbody>{ghostOrders.map((o,i) => (<tr key={i} style={{ borderBottom: '1px solid #222' }}><td style={{ padding: 10 }}>{o.order_date}</td><td style={{ padding: 10 }}>{o.ref_number}</td><td style={{ padding: 10 }}>{o.customer_name}</td><td style={{ textAlign: 'right', padding: 10 }}>Rs {o.price?.toLocaleString()}</td></tr>))}</tbody>
                </table>
              )}
            </div>
            <div style={{ marginTop: 20, textAlign: 'right' }}><button className="btn btn-secondary" onClick={() => setShowGhostModal(false)}>Close</button></div>
          </div>
        </div>
      )}

      <style>{`
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal-content { background: #111; padding: 30px; border-radius: 16px; border: 1px solid #333; width: 450px; }
        .form-group { margin-bottom: 15px; }
        .form-group label { display: block; margin-bottom: 5px; opacity: 0.6; font-size: 0.8rem; }
        .btn-icon { background: none; border: none; cursor: pointer; opacity: 0.5; padding: 5px; }
        .btn-icon:hover { opacity: 1; color: #00f2fe; }
        .badge-warning { background: rgba(255, 193, 7, 0.1); color: #ffc107; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; }
      `}</style>
    </div>
  )
}
