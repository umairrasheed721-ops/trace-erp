import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'

export default function CostManager() {
  const { activeStoreId, addToast } = useApp()
  const [costs, setCosts] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [isHealing, setIsHealing] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [expandedParents, setExpandedParents] = useState(new Set())
  
  // Modal State
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [form, setForm] = useState({ parent_title: '', variant_title: '', unit_cost: 0, packaging_cost: 0 })

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
        addToast(`Synced ${data.count} product variants from Shopify`, 'success')
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
        addToast(`Price accepted for ${variantTitle || 'parent'}`, 'success')
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
        addToast('Cost saved successfully', 'success')
        setShowModal(false)
        fetchCosts()
      } else {
        addToast(data.error || 'Failed to save', 'error')
      }
    } catch (e) {
      addToast('Save error: ' + e.message, 'error')
    }
  }

  const handleAutoHeal = async () => {
    if (!window.confirm('🚨 This will scan ALL historical zero-cost orders and apply the costs from this registry. Continue?')) return
    
    setIsHealing(true)
    try {
      const res = await fetch('/api/finance/auto-heal-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: activeStoreId })
      })
      const data = await res.json()
      if (data.success) {
        addToast(`Successfully healed ${data.count} orders!`, 'success')
      } else {
        addToast(data.error || 'Healing failed', 'error')
      }
    } catch (e) {
      addToast('Healing error: ' + e.message, 'error')
    } finally {
      setIsHealing(true)
      setTimeout(() => setIsHealing(false), 2000)
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
        avgLandedCost: 0
      }
    }
    acc[item.parent_title].variants.push(item)
    acc[item.parent_title].totalQty += item.inventory_qty
    acc[item.parent_title].totalAssetValue += item.landed_cost * item.inventory_qty
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

  return (
    <div className="page-container" style={{ maxWidth: 1400 }}>
      <header className="page-header" style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">💎 Master Cost Manager</h1>
          <p className="page-subtitle">Variant-aware registry for precision product costing and inventory valuation.</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button 
            className="btn btn-secondary" 
            onClick={handleSyncShopify}
            disabled={isSyncing}
          >
            {isSyncing ? '⌛ Syncing...' : '🔄 Sync from Shopify'}
          </button>
          <button className="btn btn-primary" onClick={() => openModal()}>+ Add New Product</button>
        </div>
      </header>

      <div style={{ display: 'flex', gap: 24, marginBottom: 24 }}>
        <div className="stat-card" style={{ flex: 1.5, backgroundColor: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0, color: '#10b981' }}>🚀 Global Auto-Healer</h3>
              <p style={{ fontSize: '0.8rem', opacity: 0.7, margin: '4px 0 16px 0' }}>Fix historical zero-cost orders using exact variant matches.</p>
            </div>
            <button 
              className="btn" 
              onClick={handleAutoHeal}
              disabled={isHealing || costs.length === 0}
              style={{ background: '#10b981', color: '#fff', border: 'none', padding: '12px 24px', fontWeight: 700 }}
            >
              {isHealing ? '⌛ Healing...' : '⚡ Heal All Orders'}
            </button>
          </div>
        </div>
        
        <div className="stat-card" style={{ flex: 1 }}>
          <h3 style={{ margin: 0, opacity: 0.6, fontSize: '0.9rem' }}>Total Asset Value</h3>
          <div style={{ fontSize: 28, fontWeight: 'bold', margin: '8px 0', color: '#10b981' }}>
            Rs. {totalAssetValue.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.8rem', opacity: 0.5 }}>Individual Landed Costs × Stock Qty</div>
        </div>

        <div className="stat-card" style={{ flex: 0.7 }}>
          <h3 style={{ margin: 0, opacity: 0.6, fontSize: '0.9rem' }}>Catalog Depth</h3>
          <div style={{ fontSize: 28, fontWeight: 'bold', margin: '8px 0' }}>{costs.length}</div>
          <div style={{ fontSize: '0.8rem', opacity: 0.5 }}>Unique Product Variants</div>
        </div>
      </div>

      <div className="stat-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <input 
            type="text" 
            className="form-input" 
            placeholder="🔍 Search products or parents..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ maxWidth: 400 }}
          />
          <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>
             💡 <span style={{ color: '#f59e0b' }}>Amber</span> parents contain variants with cost conflicts in Shopify.
          </div>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
                <th>Product Name</th>
                <th style={{ textAlign: 'right' }}>Total Qty</th>
                <th style={{ textAlign: 'right' }}>Asset Value</th>
                <th style={{ textAlign: 'right' }}>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: 40, opacity: 0.5 }}>Loading registry...</td></tr>
              ) : sortedParents.length === 0 ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: 40, opacity: 0.5 }}>No products found.</td></tr>
              ) : sortedParents.map(parent => (
                <React.Fragment key={parent.name}>
                  {/* Parent Row */}
                  <tr style={{ cursor: 'pointer', borderLeft: parent.hasConflict ? '4px solid #f59e0b' : 'none' }} onClick={() => toggleParent(parent.name)}>
                    <td style={{ textAlign: 'center', fontSize: 12 }}>{expandedParents.has(parent.name) ? '▼' : '▶'}</td>
                    <td style={{ fontWeight: 700 }}>{parent.name}</td>
                    <td style={{ textAlign: 'right' }}>{parent.totalQty.toLocaleString()} units</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#10b981' }}>Rs. {parent.totalAssetValue.toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>
                      {parent.hasConflict ? (
                        <span style={{ color: '#f59e0b', fontSize: '0.75rem', fontWeight: 600 }}>⚠️ MIXED COSTS</span>
                      ) : (
                        <span style={{ opacity: 0.5, fontSize: '0.75rem' }}>✅ ALL SYNCED</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-sm btn-secondary" onClick={(e) => { e.stopPropagation(); openModal(null, parent.name); }}>+ Add Variant</button>
                    </td>
                  </tr>

                  {/* Variant Rows (Hidden/Shown) */}
                  {expandedParents.has(parent.name) && parent.variants.map(v => {
                    const isConflicted = v.shopify_cost > 0 && Math.abs(v.shopify_cost - v.unit_cost) > 1;
                    return (
                      <tr key={v.id} style={{ backgroundColor: 'rgba(255,255,255,0.02)', fontSize: '0.85rem' }}>
                        <td></td>
                        <td style={{ paddingLeft: 20, opacity: 0.7 }}>↳ {v.variant_title || 'Generic / Default'}</td>
                        <td style={{ textAlign: 'right', opacity: 0.6 }}>{v.inventory_qty} units</td>
                        <td style={{ textAlign: 'right' }}>Rs. {(v.landed_cost * v.inventory_qty).toLocaleString()}</td>
                        <td style={{ textAlign: 'right' }}>
                          {isConflicted ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                              <span style={{ color: '#f59e0b', fontSize: 10 }}>Shopify: Rs. {v.shopify_cost}</span>
                              <button 
                                className="btn btn-sm" 
                                style={{ background: '#f59e0b', color: '#000', border: 'none', padding: '1px 6px', fontSize: 9, marginTop: 4 }}
                                onClick={(e) => { e.stopPropagation(); handleAcceptCost(v.parent_title, v.variant_title); }}
                              >
                                Accept Shopify Cost
                              </button>
                            </div>
                          ) : (
                            <span style={{ opacity: 0.4 }}>Synced (Rs. {v.unit_cost})</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn btn-sm" style={{ padding: '2px 8px', opacity: 0.6 }} onClick={(e) => { e.stopPropagation(); openModal(v); }}>Edit</button>
                        </td>
                      </tr>
                    )
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal for Add/Edit */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 500 }}>
            <h2 style={{ marginBottom: 20 }}>{editingItem ? '✏️ Edit Variant Cost' : '➕ Add New Variant'}</h2>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="form-label">Parent Product Title</label>
                <input 
                  type="text" 
                  className="form-input" 
                  required 
                  disabled={!!editingItem}
                  value={form.parent_title}
                  onChange={e => setForm({...form, parent_title: e.target.value})}
                />
              </div>

              <div>
                <label className="form-label">Variant Title (Size / Color)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={form.variant_title}
                  disabled={!!editingItem}
                  onChange={e => setForm({...form, variant_title: e.target.value})}
                  placeholder="e.g. XL / Blue"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label className="form-label">Base Unit Cost</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    required 
                    value={form.unit_cost}
                    onChange={e => setForm({...form, unit_cost: parseFloat(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="form-label">Packaging Cost</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    required 
                    value={form.packaging_cost}
                    onChange={e => setForm({...form, packaging_cost: parseFloat(e.target.value)})}
                  />
                </div>
              </div>

              <div style={{ 
                marginTop: 8, 
                padding: 16, 
                backgroundColor: 'rgba(16, 185, 129, 0.1)', 
                borderRadius: 8, 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                border: '1px solid rgba(16, 185, 129, 0.2)'
              }}>
                <span style={{ fontWeight: 600 }}>Landed Cost:</span>
                <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#10b981' }}>
                  Rs. {((form.unit_cost || 0) + (form.packaging_cost || 0)).toLocaleString()}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Save Cost</button>
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
          background: rgba(0,0,0,0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          backdrop-filter: blur(4px);
        }
        .modal-content {
          background: #1a1a1a;
          padding: 32px;
          border-radius: 16px;
          width: 90%;
          border: 1px solid rgba(255,255,255,0.1);
          box-shadow: 0 20px 50px rgba(0,0,0,0.5);
        }
      `}</style>
    </div>
  )
}
