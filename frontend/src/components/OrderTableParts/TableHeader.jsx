import React from 'react'

export default function TableHeader({
  cols,
  filteredOrders,
  selectedIds,
  setSelectedIds,
  onDragStart,
  onDragOver,
  onDrop,
  handleHeaderSort,
  sortKey,
  sortDir,
  setShowNameDialog,
  localFilters,
  setLocalFilters,
  colFilters,
  setColFilters,
  COLUMN_WIDTHS,
  TABLE_CONSTANTS
}) {
  return (
    <thead>
      <tr>
        <th style={{ width: 40, minWidth: 40, maxWidth: 40, textAlign: 'center' }}>
          <input 
            type="checkbox" 
            checked={filteredOrders.length > 0 && selectedIds.length === filteredOrders.length}
            onChange={(e) => {
              if (e.target.checked) setSelectedIds(filteredOrders.map(o => o.id))
              else setSelectedIds([])
            }}
          />
        </th>
        {cols.map((col, idx) => (
          <th 
            key={col.id}
            draggable
            onDragStart={() => onDragStart(idx)}
            onDragOver={onDragOver}
            onDrop={() => onDrop(idx)}
            onClick={col.id === 'ref_number' ? undefined : () => handleHeaderSort(col.id)}
            className={col.id === 'phone' ? 'min-w-[250px] whitespace-nowrap shrink-0' : (col.id === 'address' ? 'break-words whitespace-normal' : '')}
            style={{ 
              cursor: col.id === 'ref_number' ? 'default' : 'pointer', 
              userSelect: 'none',
              width: COLUMN_WIDTHS[col.id] || 120,
              minWidth: col.id === 'phone' ? 250 : (COLUMN_WIDTHS[col.id] || 120),
              maxWidth: COLUMN_WIDTHS[col.id] || 120,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: col.id === 'address' ? 'normal' : 'nowrap'
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              minWidth: 0,
              position: 'relative'
            }}>
              <span style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flexGrow: 1,
                minWidth: 0
              }}>
                {col.id === 'cost' ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {col.label}
                    <span style={{ fontSize: '0.65rem', opacity: 0.5, flexShrink: 0 }}>ℹ️</span>
                  </span>
                ) : col.id === 'ref_number' ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                    <span 
                      onClick={(e) => { e.stopPropagation(); handleHeaderSort('ref_number'); }}
                      style={{
                        cursor: 'pointer',
                        fontWeight: sortKey === 'ref_number' ? 700 : 400,
                        color: sortKey === 'ref_number' ? 'var(--brand)' : 'inherit',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 2
                      }}
                      title="Sort by Ref #"
                    >
                      Ref #
                      {sortKey === 'ref_number' && (
                        <span style={{ fontSize: '0.65rem', flexShrink: 0 }}>
                          {sortDir === 'asc' ? '▲' : '▼'}
                        </span>
                      )}
                    </span>
                    <span style={{ opacity: 0.4 }}>/</span>
                    <span 
                      onClick={(e) => { e.stopPropagation(); handleHeaderSort('order_date'); }}
                      style={{
                        cursor: 'pointer',
                        fontWeight: sortKey === 'order_date' ? 700 : 400,
                        color: sortKey === 'order_date' ? 'var(--brand)' : 'inherit',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 2
                      }}
                      title="Sort by Date"
                    >
                      Date
                      {sortKey === 'order_date' && (
                        <span style={{ fontSize: '0.65rem', flexShrink: 0 }}>
                          {sortDir === 'asc' ? '▲' : '▼'}
                        </span>
                      )}
                    </span>
                  </span>
                ) : col.id === 'tracking_number' ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }} onClick={(e) => e.stopPropagation()}>
                    <span 
                      onClick={(e) => { e.stopPropagation(); handleHeaderSort('tracking_number'); }}
                      style={{
                        cursor: 'pointer',
                        fontWeight: sortKey === 'tracking_number' ? 700 : 400,
                        color: sortKey === 'tracking_number' ? 'var(--brand)' : 'inherit',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 2
                      }}
                      title="Sort by Tracking #"
                    >
                      Tracking
                      {sortKey === 'tracking_number' && (
                        <span style={{ fontSize: '0.65rem', flexShrink: 0 }}>
                          {sortDir === 'asc' ? '▲' : '▼'}
                        </span>
                      )}
                    </span>
                    <span style={{ opacity: 0.4 }}>/</span>
                    <span 
                      onClick={(e) => { e.stopPropagation(); handleHeaderSort('courier'); }}
                      style={{
                        cursor: 'pointer',
                        fontWeight: sortKey === 'courier' ? 700 : 400,
                        color: sortKey === 'courier' ? 'var(--brand)' : 'inherit',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 2
                      }}
                      title="Sort by Courier"
                    >
                      Courier
                      {sortKey === 'courier' && (
                        <span style={{ fontSize: '0.65rem', flexShrink: 0 }}>
                          {sortDir === 'asc' ? '▲' : '▼'}
                        </span>
                      )}
                    </span>
                  </span>
                ) : col.label}
              </span>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                flexShrink: 0,
                marginLeft: 6,
                zIndex: TABLE_CONSTANTS.Z_INDEX.TABLE_HEADER
              }}>
                {sortKey === col.id && col.id !== 'ref_number' && col.id !== 'tracking_number' && (
                  <span style={{ fontSize: '0.65rem', color: 'var(--brand)', flexShrink: 0 }}>
                    {sortDir === 'asc' ? '▲' : '▼'}
                  </span>
                )}
                {col.id === 'customer_name' && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); setShowNameDialog(true); }} 
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', opacity: 0.6, flexShrink: 0, padding: 0 }}
                    title="Edit Name Rules"
                  >
                    🖊️
                  </button>
                )}
              </span>
            </div>
          </th>
        ))}
      </tr>
      <tr className="header-search-row">
        <th style={{ width: 40, minWidth: 40, maxWidth: 40, padding: '4px 8px' }}></th>
        {cols.map(col => {
          const isFiltered = ['ref_number','customer_name','phone','city','courier','tracking_number','notes'].includes(col.id);
          return (
            <th 
              key={col.id} 
              className={col.id === 'phone' ? 'min-w-[250px] whitespace-nowrap shrink-0' : (col.id === 'address' ? 'break-words whitespace-normal' : '')}
              style={{ 
                padding: '4px 8px',
                width: COLUMN_WIDTHS[col.id] || 120,
                minWidth: col.id === 'phone' ? 250 : (COLUMN_WIDTHS[col.id] || 120),
                maxWidth: COLUMN_WIDTHS[col.id] || 120,
              }}
            >
              {isFiltered && (
                ['ref_number', 'customer_name', 'phone', 'city', 'tracking_number', 'notes'].includes(col.id) ? (
                  <input 
                    className="header-search-input"
                    placeholder="Search..."
                    value={localFilters[col.id] || ''}
                    onChange={e => {
                      const val = e.target.value;
                      setLocalFilters(prev => ({ ...prev, [col.id]: val }));
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        setColFilters(prev => ({ ...prev, ...localFilters }));
                      }
                    }}
                  />
                ) : (
                  <input 
                    className="header-search-input"
                    placeholder="Search..."
                    value={colFilters[col.id] || ''}
                    onChange={e => setColFilters(prev => ({ ...prev, [col.id]: e.target.value }))}
                  />
                )
              )}
            </th>
          )
        })}
      </tr>
    </thead>
  )
}
