import React, { useState, useEffect } from 'react';

// Dedicated Sub-Component for Parent Product Card with Color Category Pills & Size Matrix
function ParentProductCard({ g, localItems, setLocalItems, setShowProductSearch, productSearchQuery }) {
  const colorKeys = Object.keys(g.colors);
  const [activeColor, setActiveColor] = useState(colorKeys[0] || 'Default');

  // If search query matches a specific color, auto-select it!
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
    <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 20, padding: 20, display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)' }}>
      {/* Header: Title & Image */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: 12, background: '#0f172a', border: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
          {g.image_url ? <img src={g.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '1.2rem' }}>🏷️</span>}
        </div>
        <div>
          <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#fff' }}>{g.parent_title}</h4>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{colorKeys.length} Color{colorKeys.length > 1 ? 's' : ''} • {g.all_skus.length} Variant{g.all_skus.length > 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Color Category Pills */}
      {colorKeys.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid #334155', borderBottom: '1px solid #334155', padding: '12px 0' }}>
          {colorKeys.map(cName => {
            const isSelected = activeColor === cName;
            return (
              <button
                key={cName}
                type="button"
                onClick={() => setActiveColor(cName)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 20,
                  background: isSelected ? '#6366f1' : '#0f172a',
                  color: isSelected ? '#fff' : '#94a3b8',
                  border: `1px solid ${isSelected ? '#6366f1' : '#334155'}`,
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: isSelected ? '0 4px 12px rgba(99,102,241,0.3)' : 'none'
                }}
              >
                {cName}
              </button>
            );
          })}
        </div>
      )}

      {/* Size Matrix Buttons */}
      <div>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Select Size for {activeColor}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
          {activeColorData.sizes.map(sz => {
            const stockQty = sz.inventory_qty ?? sz.stock ?? 0;
            const isOutOfStock = stockQty <= 0;
            const unitCost = sz.unit_cost ?? sz.landed_cost ?? 0;

            return (
              <button
                key={sz.id || sz.sku}
                type="button"
                onClick={() => {
                  setLocalItems([
                    ...localItems,
                    {
                      id: Date.now() + Math.random(),
                      variant_id: sz.shopify_variant_id,
                      sku: sz.sku,
                      title: g.parent_title,
                      variant_title: sz.variant_title || `${sz.clean_size} / ${sz.clean_color}`,
                      quantity: 1,
                      price: sz.selling_price || sz.unit_cost || 1000,
                      image_url: sz.image_url || g.image_url
                    }
                  ]);
                  setShowProductSearch(false);
                }}
                style={{
                  background: isOutOfStock ? 'rgba(244,63,94,0.05)' : '#0f172a',
                  border: `1px solid ${isOutOfStock ? 'rgba(244,63,94,0.3)' : '#334155'}`,
                  borderRadius: 14,
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  position: 'relative',
                  overflow: 'hidden'
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = isOutOfStock ? '#f43f5e' : '#6366f1'}
                onMouseLeave={e => e.currentTarget.style.borderColor = isOutOfStock ? 'rgba(244,63,94,0.3)' : '#334155'}
              >
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: isOutOfStock ? '#f43f5e' : '#fff' }}>
                  {sz.clean_size}
                </div>
                <div style={{ fontSize: '0.7rem', color: isOutOfStock ? '#f43f5e' : '#10b981', fontWeight: 700 }}>
                  {isOutOfStock ? '⚠️ Out of Stock' : `📦 Stock: ${stockQty}`}
                </div>
                <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
                  Cost: Rs {parseFloat(unitCost).toLocaleString()}
                </div>
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
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 20, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #334155', display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff' }}>🛒 Order Contents</span>
          <button 
            type="button"
            onClick={() => setShowProductSearch(true)} 
            style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(79,70,229,0.3)' }}
          >
            + Smart Add Item
          </button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {localItems.map((item, idx) => {
            const matched = masterProducts.find(mp => mp.sku === item.sku || mp.parent_title === item.title);
            const stockQty = matched?.inventory_qty ?? matched?.stock ?? 10;
            const unitCost = matched?.unit_cost ?? matched?.landed_cost ?? 0;
            const itemRevenue = parseFloat(item.price) * parseInt(item.quantity);
            const itemCost = parseFloat(unitCost) * parseInt(item.quantity);
            const itemMargin = itemRevenue > 0 ? Math.round(((itemRevenue - itemCost) / itemRevenue) * 100) : 0;

            return (
              <div key={item.id || idx} style={{ display: 'flex', gap: 16, paddingBottom: 16, borderBottom: idx === localItems.length - 1 ? 'none' : '1px solid #334155' }}>
                <div style={{ width: 64, height: 64, borderRadius: 14, background: '#0f172a', border: '1px solid #334155', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                  {item.image_url ? <img src={item.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#64748b' }}>{item.sku?.slice(0,3)}</span>}
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>{item.title}</div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 2 }}>{item.variant_title} • SKU: {item.sku || '—'}</div>
                  
                  {/* Live Stock & Margin Badges */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    <span style={{ background: stockQty > 5 ? '#10b98120' : '#f59e0b20', color: stockQty > 5 ? '#10b981' : '#f59e0b', padding: '2px 8px', borderRadius: 10, fontSize: '0.7rem', fontWeight: 700 }}>
                      {stockQty > 5 ? `📦 In Stock (${stockQty})` : `⚠️ Low Stock (${stockQty})`}
                    </span>
                    <span style={{ background: '#6366f120', color: '#818cf8', padding: '2px 8px', borderRadius: 10, fontSize: '0.7rem', fontWeight: 700 }}>
                      Unit Cost: Rs {parseFloat(unitCost).toLocaleString()} | Margin: {itemMargin}%
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', background: '#0f172a', border: '1px solid #334155', borderRadius: 10, overflow: 'hidden' }}>
                      <button type="button" style={{ background: 'transparent', border: 'none', color: '#fff', padding: '4px 10px', cursor: 'pointer', fontWeight: 700 }} onClick={() => {
                        const newItems = [...localItems];
                        newItems[idx].quantity = Math.max(1, newItems[idx].quantity - 1);
                        setLocalItems(newItems);
                      }}>-</button>
                      <span style={{ padding: '0 10px', fontSize: '0.85rem', fontWeight: 700 }}>{item.quantity}</span>
                      <button type="button" style={{ background: 'transparent', border: 'none', color: '#fff', padding: '4px 10px', cursor: 'pointer', fontWeight: 700 }} onClick={() => {
                        const newItems = [...localItems];
                        newItems[idx].quantity += 1;
                        setLocalItems(newItems);
                      }}>+</button>
                    </div>
                    <button type="button" style={{ background: 'transparent', border: 'none', color: '#f43f5e', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }} onClick={() => {
                      setLocalItems(localItems.filter((_, i) => i !== idx));
                    }}>Remove</button>
                  </div>
                </div>

                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <input 
                    type="number"
                    style={{ width: 90, background: '#0f172a', border: '1px solid #334155', borderRadius: 10, padding: '6px 10px', color: '#fff', fontSize: '0.85rem', textAlign: 'right', fontWeight: 600, outline: 'none' }}
                    value={item.price}
                    onChange={(e) => {
                      const newItems = [...localItems];
                      newItems[idx].price = e.target.value;
                      setLocalItems(newItems);
                    }}
                  />
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: '#fff' }}>Rs {Math.round(item.price * item.quantity).toLocaleString()}</div>
                </div>
              </div>
            );
          })}
          {!localItems.length && (
            <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>No line items in this order.</p>
            </div>
          )}
        </div>
      </div>

      {/* Hierarchical Product Selector Popover */}
      {showProductSearch && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.98)', zIndex: 3000, display: 'flex', flexDirection: 'column', padding: 32, backdropFilter: 'blur(12px)' }}>
          <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', paddingBottom: 16, marginBottom: 20 }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#fff' }}>🔍 Smart Hierarchical Product Selector</h3>
            <button type="button" onClick={() => setShowProductSearch(false)} style={{ background: '#334155', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 10, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>✕ Close</button>
          </div>

          <input 
            type="text" 
            placeholder="Search by Parent Title, Color, Size, or SKU..." 
            value={productSearchQuery}
            onChange={e => setProductSearchQuery(e.target.value)}
            style={{ width: '100%', background: '#0f172a', border: '2px solid #6366f1', borderRadius: 16, padding: '14px 20px', color: '#fff', fontSize: '1rem', outline: 'none', marginBottom: 24, boxSizing: 'border-box' }}
            autoFocus
          />

          <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
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
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 60, color: '#64748b' }}>
                <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>No master products match your search criteria.</p>
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
