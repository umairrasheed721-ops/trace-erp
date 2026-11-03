import React, { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'

export default function LinkSkuModal({ isOpen, item, storeId, onClose, onSuccess }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [saving, setSaving] = useState(false)
  const searchTimeoutRef = useRef(null)
  const { addToast } = useApp()

  const itemTitle = item?.title || item?.name || item?.parent_title || ''
  const itemVariant = item?.variant || item?.variant_title || ''

  useEffect(() => {
    if (!isOpen || !item) return
    setSelectedItem(null)
    setResults([])

    // Suggested initial search query
    const initialQuery = item.sku || itemTitle.split(' ')[0] || ''
    setSearchQuery(initialQuery)
    fetchSkus(initialQuery)

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    }
  }, [isOpen, item, storeId])

  const fetchSkus = async (q) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/cost-manager/search-skus?store_id=${storeId || 1}&q=${encodeURIComponent(q || '')}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('trace_token')}` }
      })
      if (res.ok) {
        const data = await res.json()
        setResults(Array.isArray(data) ? data : [])
      }
    } catch (err) {
      console.error('Failed to search SKUs:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSearchChange = (e) => {
    const val = e.target.value
    setSearchQuery(val)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => {
      fetchSkus(val)
    }, 250)
  }

  const handleLink = async () => {
    if (!selectedItem) {
      addToast('Please select a Master SKU to link with.', 'warning')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/cost-manager/link-alias', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('trace_token')}`
        },
        body: JSON.stringify({
          store_id: storeId || 1,
          alias_title: itemTitle,
          alias_variant: itemVariant,
          target_master_cost_id: selectedItem.id,
          target_sku: selectedItem.sku,
          target_variant_id: selectedItem.shopify_variant_id
        })
      })

      const data = await res.json()
      if (data.success) {
        addToast(data.message || 'Linked successfully!', 'success')
        if (onSuccess) onSuccess(data)
        onClose()
      } else {
        addToast(data.error || 'Failed to link alias', 'error')
      }
    } catch (err) {
      addToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen || !item) return null

  return (
    <div 
      className="modal-overlay" 
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
    >
      <div 
        className="modal-content shadow-2xl" 
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-surface, #18181b)',
          border: '1px solid var(--border, rgba(255,255,255,0.15))',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '520px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🔗</span> Link to Master SKU
            </h3>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
              Map ghost/renamed item to catalog SKU for permanent cost sync & SKU resolution
            </div>
          </div>
          <button 
            onClick={onClose} 
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem', padding: '4px' }}
          >
            ✕
          </button>
        </div>

        {/* Target Item Card */}
        <div style={{ padding: '12px 20px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', fontWeight: 700, marginBottom: 4 }}>
            Unmapped / Ghost Item to Link:
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>
                {itemTitle} {itemVariant ? `(${itemVariant})` : ''}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#f87171', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <span>🛑 Current Cost: Rs {(item.landed_cost || 0).toLocaleString()}</span>
                <span>•</span>
                <span>{item.sku || 'No SKU'}</span>
              </div>
            </div>
            <span style={{ fontSize: '0.65rem', background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>
              NEEDS LINK
            </span>
          </div>
        </div>

        {/* Search Input */}
        <div style={{ padding: '14px 20px 8px' }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.5, fontSize: '0.85rem' }}>🔍</span>
            <input 
              type="text"
              className="form-input"
              style={{
                width: '100%',
                paddingLeft: 34,
                boxSizing: 'border-box',
                height: 38,
                fontSize: '0.82rem',
                borderRadius: 8,
                background: 'var(--bg-elevated, #27272a)'
              }}
              placeholder="Search by SKU, product name, or variant..."
              value={searchQuery}
              onChange={handleSearchChange}
              autoFocus
            />
          </div>
        </div>

        {/* Results List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px', minHeight: 200, maxHeight: 280 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              ⌛ Searching catalog SKUs...
            </div>
          ) : results.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              🔍 No matching catalog SKUs found. Try a different search term.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {results.map(prod => {
                const isSelected = selectedItem?.id === prod.id
                return (
                  <div 
                    key={prod.id}
                    onClick={() => setSelectedItem(prod)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: isSelected ? '1.5px solid var(--brand, #a855f7)' : '1px solid var(--border)',
                      background: isSelected ? 'rgba(168, 85, 247, 0.12)' : 'rgba(255,255,255,0.02)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        {prod.sku ? (
                          <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '1px 6px', borderRadius: 4, fontSize: '0.68rem', fontWeight: 800 }}>
                            🆔 {prod.sku}
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No SKU</span>
                        )}
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#fff' }}>
                          {prod.parent_title} {prod.variant_title ? `(${prod.variant_title})` : ''}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                        Unit Cost: Rs {Math.round(prod.unit_cost || 0)} | Packaging: Rs {Math.round(prod.packaging_cost || 0)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 800, color: prod.landed_cost > 0 ? 'var(--green, #22c55e)' : '#ef4444' }}>
                        Rs {Math.round(prod.landed_cost || 0).toLocaleString()}
                      </div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Landed Cost</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Selected Preview Banner */}
        {selectedItem && (
          <div style={{ padding: '10px 20px', background: 'rgba(34, 197, 94, 0.08)', borderTop: '1px solid rgba(34, 197, 94, 0.2)', fontSize: '0.72rem', color: '#22c55e', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>✅</span>
            <span>
              All past & future orders will inherit <strong>SKU: {selectedItem.sku || 'N/A'}</strong> and <strong>Landed Cost: Rs {Math.round(selectedItem.landed_cost || 0)}</strong>.
            </span>
          </div>
        )}

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'rgba(0,0,0,0.2)' }}>
          <button 
            type="button" 
            className="btn btn-secondary" 
            onClick={onClose}
            disabled={saving}
            style={{ fontSize: '0.8rem', padding: '6px 14px' }}
          >
            Cancel
          </button>
          <button 
            type="button" 
            className="btn btn-primary" 
            onClick={handleLink}
            disabled={!selectedItem || saving}
            style={{ fontSize: '0.8rem', padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
          >
            {saving ? '⌛ Linking & Healing...' : '🚀 Link & Auto-Heal Orders'}
          </button>
        </div>
      </div>
    </div>
  )
}
