import React, { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'

export default function CostManager() {
  const { activeStoreId, addToast } = useApp()
  const [costs, setCosts] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [isHealing, setIsHealing] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [expandedParents, setExpandedParents] = useState(new Set())
  
  // Modal States
  const [showModal, setShowModal] = useState(false)
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [bulkItem, setBulkItem] = useState(null)
  const [form, setForm] = useState({ parent_title: '', variant_title: '', unit_cost: 0, packaging_cost: 0 })
  const [bulkForm, setBulkForm] = useState({ unit_cost: 0, packaging_cost: 0 })

  useEffect(() => {
    if (activeStoreId) fetchCosts()
  }, [activeStoreId])

  const fetchCosts = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/finance/master-costs?store_id=${activeStoreId}`)
      const data = await res.json()
      setCosts(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error('Failed to fetch costs', e)
      addToast('Failed to load cost registry', 'error')
    } finally {
      setLoading(false)
    }
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
        addToast(`Synced ${data.count} product variants and prices from Shopify`, 'success')
        fetchCosts()
      } else {
        addToast(data.error || 'Sync failed', 'error')
      }
    } catch (e) {
      addToast('Sync error: ' + e.message, 'error')
    } finally {
      setIsSyncing(false)
    }
  }

  const handleAcceptCost = async (parentTitle, variantTitle) => {
    try {
      const res = await fetch('/api/finance/accept-shopify-cost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: activeStoreId, parent_title: parentTitle, variant_title: variantTitle })
      })
      const data = await res.json()
      if (data.success) {
        addToast(`Price accepted`, 'success')
        fetchCosts()
      }
    } catch (e) {
      addToast('Accept error: ' + e.message, 'error')
    }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    try {
      const res = await fetch('/api/finance/master-costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          store_id: activeStoreId, 
          ...form 
        })
      })
      const data = await res.json()
      if (data.success) {
        addToast('Variant cost saved', 'success')
        setShowModal(false)
        fetchCosts()
      }
    } catch (e) {
      addToast('Save error: ' + e.message, 'error')
    }
  }

  const handleBulkSync = async (e) => {
    e.preventDefault()
    try {
      const res = await fetch('/api/finance/bulk-sync-parent-costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          store_id: activeStoreId, 
          parent_title: bulkItem.name,
          ...bulkForm 
        })
      })
      const data = await res.json()
      if (data.success) {
        addToast(`Applied to all ${bulkItem.variants.length} variants!`, 'success')
        setShowBulkModal(false)
        fetchCosts()
      }
    } catch (e) {
      addToast('Bulk sync error: ' + e.message, 'error')
    }
  }

  const toggleParent = (parentName) => {
    const newExpanded = new Set(expandedParents)
    if (newExpanded.has(parentName)) {
      newExpanded.delete(parentName)
    } else {
      newExpanded.add(parentName)
    }
    setExpandedParents(newExpanded)
  }

  // Grouping Logic
  const groupedCosts = costs.reduce((acc, item) => {
    if (!acc[item.parent_title]) {
      acc[item.parent_title] = { 
        name: item.parent_title, 
        variants: [], 
        totalQty: 0, 
        totalAssetValue: 0,
        hasConflict: false,
        maxPrice: 0,
        minMargin: 100
      }
    }
    acc[item.parent_title].variants.push(item)
    acc[item.parent_title].totalQty += item.inventory_qty
    acc[item.parent_title].totalAssetValue += item.landed_cost * item.inventory_qty
    
    if (item.selling_price > acc[item.parent_title].maxPrice) {
      acc[item.parent_title].maxPrice = item.selling_price
    }

    const margin = item.selling_price > 0 ? ((item.selling_price - item.landed_cost) / item.selling_price) * 100 : 0
    if (margin < acc[item.parent_title].minMargin && item.selling_price > 0) {
      acc[item.parent_title].minMargin = margin
    }

    if (item.shopify_cost > 0 && Math.abs(item.shopify_cost - item.unit_cost) > 1) {
      acc[item.parent_title].hasConflict = true
    }
    return acc
  }, {})

  const sortedParents = Object.values(groupedCosts)
    .filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.totalAssetValue - a.totalAssetValue)

  const totalAssetValue = sortedParents.reduce((sum, p) => sum + p.totalAssetValue, 0)

  const openModal = (item = null, parentName = '') => {
    if (item) {
      setEditingItem(item)
      setForm({ parent_title: item.parent_title, variant_title: item.variant_title, unit_cost: item.unit_cost, packaging_cost: item.packaging_cost })
    } else {
      setEditingItem(null)
      setForm({ parent_title: parentName, variant_title: '', unit_cost: 0, packaging_cost: 0 })
    }
    setShowModal(true)
  }

  const openBulkModal = (parent) => {
    setBulkItem(parent)
    // Pre-fill with first variant's cost if available
    const first = parent.variants[0]
    setBulkForm({ unit_cost: first?.unit_cost || 0, packaging_cost: first?.packaging_cost || 0 })
    setShowBulkModal(true)
  }

  const getMarginColor = (margin) => {
    if (margin <= 0) return '#ef4444'
    if (margin < 20) return '#f97316'
    if (margin < 40) return '#f59e0b'
    return '#10b981'
  }

  return (
    <div className="page-container" style={{ maxWidth: 1400 }}>
      <header className="page-header" style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">📈 Pro Cost & Margin Manager</h1>
          <p className="page-subtitle">Variant-level profitability analysis with automated Shopify sync.</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button 
            className="btn btn-secondary" 
            onClick={handleSyncShopify}
            disabled={isSyncing}
          >
            {isSyncing ? '⌛ Syncing Prices...' : '🔄 Sync from Shopify'}
          </button>
          <button className="btn btn-primary" onClick={() => openModal()}>+ Add New Product</button>
        </div>
      </header>

      <div style={{ display: 'flex', gap: 24, marginBottom: 24 }}>
        <div className="stat-card" style={{ flex: 1.2 }}>
          <h3 style={{ margin: 0, opacity: 0.6, fontSize: '0.9rem' }}>Total Asset Value</h3>
          <div style={{ fontSize: 28, fontWeight: 'bold', margin: '8px 0', color: '#10b981' }}>
            Rs. {totalAssetValue.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.8rem', opacity: 0.5 }}>Landed Cost × In-Stock Units</div>
        </div>

        <div className="stat-card" style={{ flex: 1, backgroundColor: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
          <h3 style={{ margin: 0, opacity: 0.6, fontSize: '0.9rem', color: '#10b981' }}>Catalog Health</h3>
          <div style={{ fontSize: 28, fontWeight: 'bold', margin: '8px 0' }}>
            {sortedParents.filter(p => !p.hasConflict).length} / {sortedParents.length}
          </div>
          <div style={{ fontSize: '0.8rem', opacity: 0.5 }}>Synced Parent Products</div>
        </div>

        <div className="stat-card" style={{ flex: 1 }}>
          <h3 style={{ margin: 0, opacity: 0.6, fontSize: '0.9rem' }}>Profit Opportunity</h3>
          <div style={{ fontSize: 28, fontWeight: 'bold', margin: '8px 0', color: '#f59e0b' }}>
            {costs.filter(c => c.selling_price > 0 && ((c.selling_price - c.landed_cost) / c.selling_price) < 0.2).length}
          </div>
          <div style={{ fontSize: '0.8rem', opacity: 0.5 }}>Variants with Margin &lt; 20%</div>
        </div>
      </div>

      <div className="stat-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <input 
            type="text" 
            className="form-input" 
            placeholder="🔍 Search by product name..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ maxWidth: 400 }}
          />
          <div style={{ display: 'flex', gap: 16, fontSize: '0.75rem', opacity: 0.6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 8, height: 8, borderRadius: 2, background: '#ef4444' }}></div> Loss</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 8, height: 8, borderRadius: 2, background: '#f59e0b' }}></div> Low Margin</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 8, height: 8, borderRadius: 2, background: '#10b981' }}></div> Healthy</div>
          </div>
        </div>

        <div className="table-responsive">
          <table className="data-table" style={{ borderCollapse: 'separate', borderSpacing: '0 4px' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#111' }}>
              <tr>
                <th style={{ width: 40 }}></th>
                <th>Product / Variant</th>
                <th style={{ textAlign: 'right' }}>Price (Shopify)</th>
                <th style={{ textAlign: 'right' }}>Landed Cost</th>
                <th style={{ textAlign: 'right' }}>Profit/Unit</th>
                <th style={{ textAlign: 'right' }}>Margin %</th>
                <th style={{ textAlign: 'right' }}>Stock Qty</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: 40, opacity: 0.5 }}>Loading financials...</td></tr>
              ) : sortedParents.length === 0 ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: 40, opacity: 0.5 }}>No data found.</td></tr>
              ) : sortedParents.map(parent => {
                const isSingleDefault = parent.variants.length === 1 && (!parent.variants[0].variant_title || parent.variants[0].variant_title === 'Default Title');
                const mainVariant = parent.variants[0];
                
                return (
                  <React.Fragment key={parent.name}>
                    {/* Parent Row */}
                    <tr 
                      style={{ 
                        cursor: isSingleDefault ? 'default' : 'pointer', 
                        background: 'rgba(255,255,255,0.03)',
                        borderLeft: parent.hasConflict ? '4px solid #f59e0b' : 'none'
                      }} 
                      onClick={() => !isSingleDefault && toggleParent(parent.name)}
                    >
                      <td style={{ textAlign: 'center', fontSize: 10, opacity: 0.5 }}>
                        {!isSingleDefault && (expandedParents.has(parent.name) ? '▼' : '▶')}
                      </td>
                      <td style={{ fontWeight: 700, padding: '16px 8px' }}>{parent.name}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {isSingleDefault ? `Rs. ${mainVariant.selling_price.toLocaleString()}` : `Rs. ${parent.maxPrice.toLocaleString()}`}
                      </td>
                      <td style={{ textAlign: 'right', opacity: isSingleDefault ? 1 : 0.5 }}>
                        {isSingleDefault ? `Rs. ${mainVariant.landed_cost.toLocaleString()}` : '--'}
                      </td>
                      <td style={{ textAlign: 'right', opacity: isSingleDefault ? 1 : 0.5 }}>
                        {isSingleDefault ? (
                          <span style={{ color: (mainVariant.selling_price - mainVariant.landed_cost) > 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                            Rs. {(mainVariant.selling_price - mainVariant.landed_cost).toLocaleString()}
                          </span>
                        ) : '--'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span style={{ 
                          background: getMarginColor(parent.minMargin), 
                          color: '#000', 
                          padding: '2px 8px', 
                          borderRadius: 4, 
                          fontSize: '0.7rem', 
                          fontWeight: 700 
                        }}>
                          {parent.minMargin.toFixed(0)}% {isSingleDefault ? '' : 'Min'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{parent.totalQty.toLocaleString()} units</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          {isSingleDefault ? (
                            <>
                              {mainVariant.shopify_cost > 0 && Math.abs(mainVariant.shopify_cost - mainVariant.unit_cost) > 1 && (
                                <button 
                                  className="btn btn-sm" 
                                  style={{ background: '#f59e0b', color: '#000', border: 'none', fontSize: 10 }}
                                  onClick={(e) => { e.stopPropagation(); handleAcceptCost(mainVariant.parent_title, mainVariant.variant_title); }}
                                >
                                  Accept Rs. {mainVariant.shopify_cost}
                                </button>
                              )}
                              <button 
                                className="btn btn-sm" 
                                style={{ padding: '2px 8px', background: 'rgba(255,255,255,0.05)', color: '#fff' }} 
                                onClick={(e) => { e.stopPropagation(); openModal(mainVariant); }}
                              >
                                Edit
                              </button>
                            </>
                          ) : (
                            <button 
                              className="btn btn-sm" 
                              style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '4px 10px' }}
                              onClick={(e) => { e.stopPropagation(); openBulkModal(parent); }}
                            >
                              ⚡ Bulk Sync
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Variant Rows (Only for true multi-variant products) */}
                    {!isSingleDefault && expandedParents.has(parent.name) && parent.variants.map(v => {
                      const margin = v.selling_price > 0 ? ((v.selling_price - v.landed_cost) / v.selling_price) * 100 : 0
                      const profit = v.selling_price - v.landed_cost
                      const isConflicted = v.shopify_cost > 0 && Math.abs(v.shopify_cost - v.unit_cost) > 1;
                      
                      return (
                        <tr key={v.id} style={{ fontSize: '0.85rem', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                          <td></td>
                          <td style={{ paddingLeft: 20, opacity: 0.8 }}>
                            <span style={{ opacity: 0.4, marginRight: 8 }}>↳</span>
                            {v.variant_title || 'Default Variant'}
                          </td>
                          <td style={{ textAlign: 'right', opacity: 0.6 }}>Rs. {v.selling_price.toLocaleString()}</td>
                          <td style={{ textAlign: 'right', fontWeight: 500 }}>Rs. {v.landed_cost.toLocaleString()}</td>
                          <td style={{ textAlign: 'right', color: profit > 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                            Rs. {profit.toLocaleString()}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ 
                              display: 'inline-block', 
                              width: 50, 
                              textAlign: 'right', 
                              color: getMarginColor(margin),
                              fontWeight: 700
                            }}>
                              {margin.toFixed(1)}%
                            </div>
                          </td>
                          <td style={{ textAlign: 'right', opacity: 0.6 }}>{v.inventory_qty}</td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                              {isConflicted && (
                                <button 
                                  className="btn btn-sm" 
                                  style={{ background: '#f59e0b', color: '#000', border: 'none', fontSize: 10, padding: '2px 6px' }}
                                  onClick={() => handleAcceptCost(v.parent_title, v.variant_title)}
                                >
                                  Accept Rs. {v.shopify_cost}
                                </button>
                              )}
                              <button 
                                className="btn btn-sm" 
                                style={{ padding: '2px 8px', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }} 
                                onClick={() => openModal(v)}
                              >
                                Edit
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 🛠️ PRO VARIANT EDITOR MODAL */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 550, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '24px 32px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{editingItem ? '✏️ Edit Variant Intelligence' : '➕ Add New Variant'}</h2>
              <p style={{ margin: '4px 0 0 0', opacity: 0.5, fontSize: '0.8rem' }}>{form.parent_title} {form.variant_title && `• ${form.variant_title}`}</p>
            </div>
            
            <form onSubmit={handleSave} style={{ padding: 32 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
                <div>
                  <label className="form-label" style={{ opacity: 0.6, marginBottom: 8, display: 'block' }}>Base Unit Cost (Rs)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    style={{ fontSize: '1.1rem', padding: '12px 16px' }}
                    required 
                    value={form.unit_cost}
                    onChange={e => setForm({...form, unit_cost: parseFloat(e.target.value) || 0})}
                  />
                </div>
                <div>
                  <label className="form-label" style={{ opacity: 0.6, marginBottom: 8, display: 'block' }}>Packaging Cost (Rs)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    style={{ fontSize: '1.1rem', padding: '12px 16px' }}
                    required 
                    value={form.packaging_cost}
                    onChange={e => setForm({...form, packaging_cost: parseFloat(e.target.value) || 0})}
                  />
                </div>
              </div>

              <div style={{ 
                background: 'rgba(16, 185, 129, 0.05)', 
                border: '1px solid rgba(16, 185, 129, 0.1)', 
                borderRadius: 12, 
                padding: 20,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '0.75rem', opacity: 0.6, textTransform: 'uppercase', letterSpacing: 1 }}>Total Landed Cost</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#10b981' }}>Rs. {(form.unit_cost + form.packaging_cost).toLocaleString()}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {editingItem?.selling_price > 0 && (
                    <>
                      <div style={{ fontSize: '0.75rem', opacity: 0.6, textTransform: 'uppercase', letterSpacing: 1 }}>Est. Margin</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 700, color: getMarginColor(((editingItem.selling_price - (form.unit_cost + form.packaging_cost)) / editingItem.selling_price) * 100) }}>
                        {(((editingItem.selling_price - (form.unit_cost + form.packaging_cost)) / editingItem.selling_price) * 100).toFixed(1)}%
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 16, marginTop: 32 }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1, padding: 14 }} onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1, padding: 14, background: '#3b82f6' }}>Save Intelligence</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ⚡ BULK SYNC MODAL */}
      {showBulkModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 450 }}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 16px' }}>⚡</div>
              <h2 style={{ margin: 0 }}>Bulk Sync Variants</h2>
              <p style={{ opacity: 0.6, fontSize: '0.9rem', marginTop: 8 }}>Apply these costs to all <b>{bulkItem?.variants.length}</b> variants of "{bulkItem?.name}"</p>
            </div>

            <form onSubmit={handleBulkSync}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                <div>
                  <label className="form-label">Unit Cost (Rs)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    value={bulkForm.unit_cost}
                    onChange={e => setBulkForm({...bulkForm, unit_cost: parseFloat(e.target.value) || 0})}
                  />
                </div>
                <div>
                  <label className="form-label">Packaging (Rs)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    value={bulkForm.packaging_cost}
                    onChange={e => setBulkForm({...bulkForm, packaging_cost: parseFloat(e.target.value) || 0})}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowBulkModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1, background: '#3b82f6' }}>Sync All Variants</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.85);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          backdrop-filter: blur(8px);
        }
        .modal-content {
          background: #111;
          border-radius: 20px;
          width: 90%;
          border: 1px solid rgba(255,255,255,0.08);
          box-shadow: 0 30px 60px rgba(0,0,0,0.8);
          animation: modalSlide 0.3s ease-out;
        }
        @keyframes modalSlide {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .btn-sm { padding: 4px 12px; font-size: 0.75rem; border-radius: 6px; }
      `}</style>
    </div>
  )
}
