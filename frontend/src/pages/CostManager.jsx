import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'

export default function CostManager() {
  const { activeStoreId, addToast } = useApp()
  const [costs, setCosts] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [isHealing, setIsHealing] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  
  // Modal State
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [form, setForm] = useState({ parent_title: '', unit_cost: 0, packaging_cost: 0 })

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
        addToast(`Synced ${data.count} products from Shopify`, 'success')
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

  const handleAcceptCost = async (parentTitle) => {
    try {
      const res = await fetch('/api/finance/accept-shopify-cost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: activeStoreId, parent_title: parentTitle })
      })
      const data = await res.json()
      if (data.success) {
        addToast('Price accepted', 'success')
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

  const filteredCosts = costs.filter(c => 
    c.parent_title.toLowerCase().includes(search.toLowerCase())
  )

  const totalAssetValue = costs.reduce((sum, item) => sum + (item.landed_cost * (item.inventory_qty || 0)), 0)

  const openModal = (item = null) => {
    if (item) {
      setEditingItem(item)
      setForm({ parent_title: item.parent_title, unit_cost: item.unit_cost, packaging_cost: item.packaging_cost })
    } else {
      setEditingItem(null)
      setForm({ parent_title: '', unit_cost: 0, packaging_cost: 0 })
    }
    setShowModal(true)
  }

  return (
    <div className="page-container" style={{ maxWidth: 1400 }}>
      <header className="page-header" style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">💎 Master Cost Manager</h1>
          <p className="page-subtitle">Central registry for product costs and inventory asset valuation.</p>
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
              <p style={{ fontSize: '0.8rem', opacity: 0.7, margin: '4px 0 16px 0' }}>Fix all zero-cost historical orders using the registry below.</p>
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
          <div style={{ fontSize: '0.8rem', opacity: 0.5 }}>Landed Cost × In-Stock Qty</div>
        </div>

        <div className="stat-card" style={{ flex: 0.7 }}>
          <h3 style={{ margin: 0, opacity: 0.6, fontSize: '0.9rem' }}>Catalog Size</h3>
          <div style={{ fontSize: 28, fontWeight: 'bold', margin: '8px 0' }}>{costs.length}</div>
          <div style={{ fontSize: '0.8rem', opacity: 0.5 }}>Active Product Lines</div>
        </div>
      </div>

      <div className="stat-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <input 
            type="text" 
            className="form-input" 
            placeholder="🔍 Search product catalog..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ maxWidth: 400 }}
          />
          <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>
            💡 <span style={{ color: '#f59e0b' }}>Amber</span> landed costs indicate a conflict with Shopify prices.
          </div>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Parent Product Title</th>
                <th style={{ textAlign: 'right' }}>Shopify Price</th>
                <th style={{ textAlign: 'right' }}>Base Cost</th>
                <th style={{ textAlign: 'right' }}>Packaging</th>
                <th style={{ textAlign: 'right' }}>Landed Cost</th>
                <th style={{ textAlign: 'right' }}>Stock Qty</th>
                <th style={{ textAlign: 'right' }}>Stock Value</th>
                <th style={{ textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: 40, opacity: 0.5 }}>Loading registry...</td></tr>
              ) : filteredCosts.length === 0 ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: 40, opacity: 0.5 }}>No products found in catalog.</td></tr>
              ) : filteredCosts.map(item => {
                const hasConflict = item.shopify_cost > 0 && Math.abs(item.shopify_cost - item.unit_cost) > 1;
                return (
                  <tr key={item.id} style={hasConflict ? { backgroundColor: 'rgba(245, 158, 11, 0.03)' } : {}}>
                    <td style={{ fontWeight: 600 }}>{item.parent_title}</td>
                    <td style={{ textAlign: 'right', opacity: 0.6 }}>Rs. {item.shopify_cost?.toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>Rs. {item.unit_cost.toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>Rs. {item.packaging_cost.toLocaleString()}</td>
                    <td style={{ 
                      textAlign: 'right', 
                      color: hasConflict ? '#f59e0b' : '#10b981', 
                      fontWeight: 700 
                    }}>
                      Rs. {item.landed_cost.toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>{item.inventory_qty || 0}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      Rs. {(item.landed_cost * (item.inventory_qty || 0)).toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                        {hasConflict && (
                          <button 
                            className="btn btn-sm" 
                            style={{ background: '#f59e0b', color: '#000', border: 'none', padding: '2px 8px' }}
                            onClick={() => handleAcceptCost(item.parent_title)}
                            title="Accept Shopify Price"
                          >
                            Accept
                          </button>
                        )}
                        <button className="btn btn-sm btn-secondary" onClick={() => openModal(item)}>Edit</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal for Add/Edit */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 500 }}>
            <h2 style={{ marginBottom: 20 }}>{editingItem ? '✏️ Edit Product Cost' : '➕ Add New Product'}</h2>
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
                  placeholder="e.g. Cotton Lycra T-Shirt"
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
                <span style={{ fontWeight: 600 }}>Total Landed Cost:</span>
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
