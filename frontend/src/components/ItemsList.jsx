import React, { useState, useEffect, useMemo } from 'react';
import { matchMasterProduct } from '@hooks/useOrderSave';

// Dedicated Sub-Component for Parent Product Card with Color Category Pills & Size Matrix
function ParentProductCard({ g, localItems, setLocalItems, setShowProductSearch, productSearchQuery }) {
  const colorKeys = Object.keys(g.colors);
  const [activeColor, setActiveColor] = useState(colorKeys[0] || 'Default');

  useEffect(() => {
    if (productSearchQuery.trim()) {
      const q = productSearchQuery.toLowerCase().trim();
      const matchedColor = colorKeys.find(c => c.toLowerCase().includes(q));
      if (matchedColor) setActiveColor(matchedColor);
    }
  }, [productSearchQuery, colorKeys]);

  const activeColorData = g.colors[activeColor] || g.colors[colorKeys[0]];
  if (!activeColorData) return null;

  return (
    <div className="eom-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{
          width: 52, height: 52, borderRadius: 12,
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0
        }}>
          {g.image_url ? <img src={g.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '1.1rem' }}>🏷️</span>}
        </div>
        <div style={{ minWidth: 0 }}>
          <h4 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {g.parent_title}
          </h4>
          <span style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}>
            {colorKeys.length} Color{colorKeys.length > 1 ? 's' : ''} • {g.all_skus.length} Variant{g.all_skus.length > 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {colorKeys.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: '10px 0' }}>
          {colorKeys.map(cName => {
            const isSelected = activeColor === cName;
            return (
              <button
                key={cName}
                type="button"
                onClick={() => setActiveColor(cName)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 999,
                  background: isSelected ? '#6366f1' : 'var(--bg-elevated)',
                  color: isSelected ? '#fff' : 'var(--text-secondary)',
                  border: `1px solid ${isSelected ? '#6366f1' : 'var(--border-bright)'}`,
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {cName}
              </button>
            );
          })}
        </div>
      )}

      <div>
        <div className="eom-label" style={{ marginBottom: 8 }}>
          Select Size for {activeColor}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(122px, 1fr))', gap: 8 }}>
          {activeColorData.sizes.map(sz => {
            const stockQty = Number(sz.inventory_qty ?? sz.stock ?? 0);
            const isOutOfStock = stockQty <= 0;
            const unitCost = Number(sz.unit_cost ?? sz.landed_cost ?? 0);
            const sellPrice = Number(sz.selling_price || 0);

            return (
              <button
                key={sz.id || sz.sku || sz.shopify_variant_id}
                type="button"
                onClick={() => {
                  setLocalItems(prev => [
                    ...prev,
                    {
                      id: Date.now() + Math.random(),
                      variant_id: sz.shopify_variant_id,
                      sku: sz.sku,
                      title: g.parent_title,
                      variant_title: sz.variant_title || `${sz.clean_size} / ${sz.clean_color}`,
                      quantity: 1,
                      price: sellPrice || 0,
                      image_url: sz.variant_image_url || sz.image_url || g.image_url
                    }
                  ]);
                  setShowProductSearch(false);
                }}
                style={{
                  background: isOutOfStock ? 'rgba(244,63,94,0.06)' : 'var(--bg-elevated)',
                  border: `1px solid ${isOutOfStock ? 'rgba(244,63,94,0.35)' : 'var(--border-bright)'}`,
                  borderRadius: 12,
                  padding: '9px 10px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 3,
                  cursor: 'pointer',
                  transition: 'border-color 0.15s ease'
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = isOutOfStock ? '#f43f5e' : '#6366f1'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = isOutOfStock ? 'rgba(244,63,94,0.35)' : 'var(--border-bright)'; }}
              >
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: isOutOfStock ? '#e11d48' : 'var(--text-primary)' }}>
                  {sz.clean_size}
                </div>
                <div style={{ fontSize: '0.69rem', color: isOutOfStock ? '#e11d48' : '#10b981', fontWeight: 700 }}>
                  {isOutOfStock ? '⚠️ Out of Stock' : `📦 Avail: ${stockQty}`}
                </div>
                {sellPrice > 0 && (
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 700 }}>
                    Rs {sellPrice.toLocaleString()}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const ItemsList = React.memo(({
  localItems,
  setLocalItems,
  masterProducts,
  showProductSearch,
  setShowProductSearch,
  productSearchQuery,
  setProductSearchQuery,
  filteredGroups
}) => {
  // Index sibling variants by normalized parent_title for instant 1-click inline size/color swaps
  const variantsByParent = useMemo(() => {
    const map = {};
    (masterProducts || []).forEach(mp => {
      const pKey = String(mp.parent_title || '').split(' - ')[0].trim().toLowerCase();
      if (!pKey) return;
      if (!map[pKey]) map[pKey] = [];
      map[pKey].push(mp);
    });
    return map;
  }, [masterProducts]);

  useEffect(() => {
    if (!showProductSearch) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setShowProductSearch(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showProductSearch, setShowProductSearch]);

  const updateItemAt = (idx, patch) => {
    setLocalItems(prev => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const handleVariantSwap = (idx, currentItem, newVariantId) => {
    if (!newVariantId) return;
    const target = masterProducts.find(mp => String(mp.shopify_variant_id || mp.id) === String(newVariantId));
    if (!target) return;
    updateItemAt(idx, {
      variant_id: target.shopify_variant_id,
      sku: target.sku || currentItem.sku,
      variant_title: target.variant_title || currentItem.variant_title,
      image_url: target.variant_image_url || target.image_url || currentItem.image_url,
      price: Number(target.selling_price) > 0 ? target.selling_price : currentItem.price
    });
  };

  const totalUnits = localItems.reduce((sum, it) => sum + (parseInt(it.quantity, 10) || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="eom-card" style={{ overflow: 'hidden' }}>
        <div className="eom-card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🛒 Order Contents</span>
            <span style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              color: 'var(--text-secondary)',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              padding: '2px 8px',
              borderRadius: 999
            }}>
              {localItems.length} SKU{localItems.length === 1 ? '' : 's'} · {totalUnits} unit{totalUnits === 1 ? '' : 's'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowProductSearch(true)}
            style={{
              background: '#4f46e5',
              color: '#fff',
              border: 'none',
              padding: '7px 14px',
              borderRadius: 10,
              fontSize: '0.76rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(79,70,229,0.28)'
            }}
          >
            + Smart Add Item
          </button>
        </div>

        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {localItems.map((item, idx) => {
            const matched = matchMasterProduct(item, masterProducts);
            const hasStockData = Boolean(matched);
            const stockQty = hasStockData ? Number(matched.inventory_qty ?? matched.stock ?? 0) : null;
            const committedQty = hasStockData ? Number(matched.committed_qty ?? 0) : 0;
            const unitCost = hasStockData ? Number(matched.unit_cost ?? matched.landed_cost ?? 0) : 0;
            const qty = parseInt(item.quantity, 10) || 1;
            const unitPrice = parseFloat(item.price) || 0;
            const itemRevenue = unitPrice * qty;

            const parentKey = String(matched?.parent_title || item.title || '').split(' - ')[0].trim().toLowerCase();
            const siblingVariants = variantsByParent[parentKey] || [];
            const canSwapVariant = siblingVariants.length > 1;
            const currentVarVal = String(matched?.shopify_variant_id || item.variant_id || '');

            return (
              <div
                key={item.id || `${item.sku || idx}-${idx}`}
                style={{
                  display: 'flex',
                  gap: 14,
                  paddingBottom: idx === localItems.length - 1 ? 0 : 16,
                  borderBottom: idx === localItems.length - 1 ? 'none' : '1px solid var(--border)',
                  alignItems: 'flex-start'
                }}
              >
                <div style={{
                  width: 64, height: 64, borderRadius: 12,
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0
                }}>
                  {item.image_url ? (
                    <img src={item.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-muted)' }}>
                      {(item.sku || item.title || 'SKU').slice(0, 3).toUpperCase()}
                    </span>
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.94rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                    {item.variant_title || 'Default'} • <span style={{ fontFamily: 'monospace' }}>SKU: {item.sku || '—'}</span>
                  </div>

                  {/* Real Stock + Unit Cost + Margin Badges */}
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {hasStockData ? (
                      <span style={{
                        background: stockQty > 5 ? 'rgba(16,185,129,0.14)' : stockQty > 0 ? 'rgba(245,158,11,0.14)' : 'rgba(239,68,68,0.14)',
                        color: stockQty > 5 ? '#059669' : stockQty > 0 ? '#d97706' : '#dc2626',
                        border: `1px solid ${stockQty > 5 ? 'rgba(16,185,129,0.3)' : stockQty > 0 ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)'}`,
                        padding: '2px 8px',
                        borderRadius: 999,
                        fontSize: '0.7rem',
                        fontWeight: 700
                      }}>
                        {stockQty > 5 ? `📦 Avail: ${stockQty}` : stockQty > 0 ? `⚠️ Low Stock (${stockQty})` : '🔴 Out of Stock (0)'}
                        {committedQty > 0 ? ` · Cmt: ${committedQty}` : ''}
                      </span>
                    ) : (
                      <span style={{
                        background: 'var(--bg-elevated)',
                        color: 'var(--text-muted)',
                        border: '1px solid var(--border)',
                        padding: '2px 8px',
                        borderRadius: 999,
                        fontSize: '0.7rem',
                        fontWeight: 600
                      }}>
                        ⚪ Unlinked SKU
                      </span>
                    )}

                    {unitCost <= 0 && (
                      <span
                        title="Item cost not set yet — ask Admin to update cost before booking"
                        style={{
                          background: 'rgba(239,68,68,0.13)',
                          color: '#dc2626',
                          border: '1px solid rgba(239,68,68,0.3)',
                          padding: '2px 8px',
                          borderRadius: 999,
                          fontSize: '0.7rem',
                          fontWeight: 700
                        }}
                      >
                        🛑 Cost Pending
                      </span>
                    )}
                  </div>

                  {/* Qty Stepper + Inline 1-Click Variant Swap + Remove */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                    <div style={{
                      display: 'inline-flex', alignItems: 'center',
                      background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)',
                      borderRadius: 9, overflow: 'hidden'
                    }}>
                      <button
                        type="button"
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', padding: '4px 10px', cursor: 'pointer', fontWeight: 800 }}
                        onClick={() => updateItemAt(idx, { quantity: Math.max(1, qty - 1) })}
                      >−</button>
                      <span style={{ padding: '0 10px', fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>{qty}</span>
                      <button
                        type="button"
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', padding: '4px 10px', cursor: 'pointer', fontWeight: 800 }}
                        onClick={() => updateItemAt(idx, { quantity: qty + 1 })}
                      >+</button>
                    </div>

                    {canSwapVariant && (
                      <select
                        aria-label="Swap size or variant"
                        value={currentVarVal}
                        onChange={(e) => handleVariantSwap(idx, item, e.target.value)}
                        title="1-Click Size / Color Swap"
                        style={{
                          background: 'var(--bg-elevated)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border-bright)',
                          borderRadius: 9,
                          padding: '4px 9px',
                          fontSize: '0.74rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          maxWidth: 210
                        }}
                      >
                        <option value="" disabled>🔄 Swap Variant...</option>
                        {siblingVariants.map(sv => {
                          const sQty = Number(sv.inventory_qty ?? sv.stock ?? 0);
                          return (
                            <option key={sv.shopify_variant_id || sv.id} value={String(sv.shopify_variant_id || sv.id)}>
                              🔄 {sv.variant_title || sv.sku} ({sQty > 0 ? `${sQty} avail` : 'OOS'})
                            </option>
                          );
                        })}
                      </select>
                    )}

                    <button
                      type="button"
                      style={{ background: 'transparent', border: 'none', color: '#e11d48', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', padding: '4px 6px' }}
                      onClick={() => setLocalItems(prev => prev.filter((_, i) => i !== idx))}
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {/* Unit Price Input & Line Total */}
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
                  <input
                    type="number"
                    min="0"
                    className="cs-update-input"
                    value={item.price}
                    onChange={(e) => updateItemAt(idx, { price: e.target.value })}
                  />
                  <div style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    Rs {Math.round(itemRevenue).toLocaleString()}
                  </div>
                </div>
              </div>
            );
          })}
          {!localItems.length && (
            <div style={{ textAlign: 'center', padding: 36, color: 'var(--text-muted)' }}>
              <p style={{ margin: 0, fontSize: '0.88rem' }}>No line items in this order. Click "+ Smart Add Item" to add products.</p>
            </div>
          )}
        </div>
      </div>

      {/* Hierarchical Product Selector Overlay */}
      {showProductSearch && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'var(--bg-base)',
          zIndex: 3000,
          display: 'flex', flexDirection: 'column',
          padding: 24
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 14, marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              🔍 Smart Hierarchical Product Selector
            </h3>
            <button
              type="button"
              onClick={() => setShowProductSearch(false)}
              style={{
                background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                border: '1px solid var(--border-bright)', padding: '6px 14px',
                borderRadius: 10, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer'
              }}
            >
              ✕ Close
            </button>
          </div>

          <input
            type="text"
            placeholder="Search by Product Name, Color, Size, or SKU..."
            value={productSearchQuery}
            onChange={e => setProductSearchQuery(e.target.value)}
            className="eom-input"
            style={{ border: '2px solid #6366f1', padding: '12px 16px', fontSize: '0.95rem', marginBottom: 18 }}
            autoFocus
          />

          <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {filteredGroups.map(g => (
              <ParentProductCard
                key={g.parent_title}
                g={g}
                localItems={localItems}
                setLocalItems={setLocalItems}
                setShowProductSearch={setShowProductSearch}
                productSearchQuery={productSearchQuery}
              />
            ))}
            {!filteredGroups.length && (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 50, color: 'var(--text-muted)' }}>
                <p style={{ margin: 0, fontSize: '0.98rem', fontWeight: 600 }}>No master products match your search criteria.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

ItemsList.displayName = 'ItemsList';

export default ItemsList;
