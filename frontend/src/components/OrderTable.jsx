import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { getStatusColor, ERP_STATUSES } from '../utils/orderUtils'
import { useApp } from '../context/AppContext'
import { TABLE_CONSTANTS } from '../config/uiConstants'

// Subcomponents
import TableHeader from './OrderTableParts/TableHeader'
import TableRow from './OrderTableParts/TableRow'
import TablePagination from './OrderTableParts/TablePagination'

// Explicit column width map to support table-layout: fixed and prevent columns from shifting/jittering
const COLUMN_WIDTHS = {
  ref_number: 160,
  order_date: 125,
  customer_name: 140,
  customer_history: 100,
  phone: 150,
  address: 240,
  city: 90,
  items: 220,
  tracking_number: 130,
  courier: 90,
  courier_status: 120,
  delivery_status: 120,
  payment_status: 90,
  paid_amount: 100,
  price: 90,
  cost: 95,
  profit: 95,
  order_source: 90,
  status_date: 120,
  payment_ref: 140,
  payment_date: 110,
  postex_weight: 90,
  edit: 80,
  notes: 180
}

// Cost breakdown helper component moved to file level
const CostBreakdownTooltip = ({ loadingBreakdown, breakdown, onClose }) => {
  if (loadingBreakdown) return <div className="cost-tooltip">⌛ Loading items...</div>
  if (!breakdown || breakdown.length === 0) return <div className="cost-tooltip">⚠️ No item data found</div>

  const totalLanded = breakdown.reduce((acc, item) => acc + (item.landed_cost * item.quantity), 0)
  const totalPkg = breakdown.reduce((acc, item) => acc + (item.packaging_cost * item.quantity), 0)

  return (
    <div className="cost-tooltip shadow-xl">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', borderRadius: '8px 8px 0 0' }}>
        <h4 style={{ margin: 0, fontSize: '0.8rem', color: 'var(--brand)' }}>📦 Itemized Costing</h4>
        <button 
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '0.9rem', padding: '0 4px', opacity: 0.6 }}
        >
          ✖
        </button>
      </div>
      <div style={{ maxHeight: 250, overflowY: 'auto', padding: '8px 0' }}>
        {breakdown.map((item, i) => (
          <div key={i} style={{ padding: '6px 12px', borderBottom: i === breakdown.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#fff', marginBottom: 2 }}>{item.title}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', opacity: 0.7 }}>
              <span>{item.quantity} x Rs {item.landed_cost.toLocaleString()}</span>
              <span style={{ fontWeight: 'bold', color: 'var(--green)' }}>Rs {(item.landed_cost * item.quantity).toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: '10px 12px', background: 'rgba(0,0,0,0.3)', borderRadius: '0 0 8px 8px', fontSize: '0.7rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
          <span>Landed Total:</span>
          <span style={{ color: 'var(--green)' }}>Rs {totalLanded.toLocaleString()}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', opacity: 0.7 }}>
          <span>Pkg Total:</span>
          <span>Rs {totalPkg.toLocaleString()}</span>
        </div>
      </div>
    </div>
  )
}

// Wrapper component to handle React Portal positioning and boundary checking dynamically via fixed positioning
const TooltipPortalWrapper = ({ triggerEl, loadingBreakdown, breakdown, onClose }) => {
  const [coords, setCoords] = useState({ top: 0, left: 0, visible: false })
  const tooltipRef = useRef(null)

  const updatePosition = useCallback(() => {
    if (!triggerEl || !tooltipRef.current) return
    
    const triggerRect = triggerEl.getBoundingClientRect()
    const tooltipHeight = tooltipRef.current.offsetHeight
    const tooltipWidth = 260
    
    const viewportHeight = window.innerHeight
    const viewportWidth = window.innerWidth
    
    // Default to positioning above the button
    let top = triggerRect.top - tooltipHeight - 8
    
    // If it overflows the top of the viewport, position it below the button
    if (top < 10) {
      top = triggerRect.bottom + 8
      
      // If it also overflows the bottom of the viewport, constrain it
      if (top + tooltipHeight > viewportHeight - 10) {
        const spaceAbove = triggerRect.top
        const spaceBelow = viewportHeight - triggerRect.bottom
        if (spaceAbove > spaceBelow) {
          top = Math.max(10, triggerRect.top - tooltipHeight - 8)
        } else {
          top = Math.min(viewportHeight - tooltipHeight - 10, triggerRect.bottom + 8)
        }
      }
    }

    // Align right edge of tooltip with right edge of button
    let left = triggerRect.right - tooltipWidth
    
    // Ensure the tooltip doesn't overflow the screen boundaries horizontally
    if (left < 10) left = 10
    if (left + tooltipWidth > viewportWidth - 10) {
      left = viewportWidth - tooltipWidth - 10
    }

    setCoords({ top, left, visible: true })
  }, [triggerEl])

  useLayoutEffect(() => {
    updatePosition()
    
    window.addEventListener('resize', updatePosition, { passive: true })
    window.addEventListener('scroll', updatePosition, { capture: true, passive: true })
    
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, { capture: true })
    }
  }, [updatePosition, loadingBreakdown, breakdown])

  return (
    <div 
      ref={tooltipRef}
      style={{
        position: 'fixed',
        top: coords.top,
        left: coords.left,
        width: 260,
        zIndex: 999999,
        visibility: coords.visible ? 'visible' : 'hidden',
        opacity: coords.visible ? 1 : 0,
        transition: 'opacity 0.15s ease',
        pointerEvents: 'auto'
      }}
    >
      <CostBreakdownTooltip 
        loadingBreakdown={loadingBreakdown}
        breakdown={breakdown}
        onClose={onClose}
      />
    </div>
  )
}

export default function OrderTable({
  loading,
  filteredOrders,
  allOrders,
  totalCount,
  debugWhere,
  cols,
  selectedIds,
  setSelectedIds,
  onDragStart,
  onDragOver,
  onDrop,
  handleHeaderSort,
  sortKey,
  sortDir,
  colFilters,
  setColFilters,
  formatCustomerName,
  fetchOrderDetails,
  bookingId,
  statusUpdatingId,
  handleConfirmOrder,
  handleRevertConfirm,
  handleBookPostEx,
  handleCancelBooking,
  handleBookInstaworld,
  handleManualStatusChange,
  updateOrderField,
  setCustomerHistoryPhone,
  setShowNameDialog,
  setKeyword,
  setStatus,
  page,
  setPage,
  limit,
  setLimit,
  keyword,
  status,
  onViewHistory,
  clearAllFilters,
  onForceResync
}) {
  const { user } = useApp()
  const canSeeFinancials = user?.role === 'admin'

  const [localFilters, setLocalFilters] = useState({})

  useEffect(() => {
    setLocalFilters(colFilters || {})
  }, [colFilters])

  const tableRef = useRef(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight)

  const handleScroll = useCallback(() => {
    if (tableRef.current) {
      const rect = tableRef.current.getBoundingClientRect()
      const offset = rect.top < 0 ? -rect.top : 0
      setScrollTop(offset)
    }
  }, [])

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll)
    handleScroll()
    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [handleScroll, filteredOrders])

  const rowHeight = 44
  const buffer = 10

  const { startIndex, endIndex, topPadding, bottomPadding, visibleOrders } = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - buffer)
    const end = Math.min(filteredOrders.length, Math.ceil((scrollTop + viewportHeight) / rowHeight) + buffer)
    const topPad = start * rowHeight
    const bottomPad = (filteredOrders.length - end) * rowHeight
    const visible = filteredOrders.slice(start, end)
    return {
      startIndex: start,
      endIndex: end,
      topPadding: topPad,
      bottomPadding: bottomPad,
      visibleOrders: visible
    }
  }, [scrollTop, viewportHeight, filteredOrders])
  const [lastSelectedIndex, setLastSelectedIndex] = useState(null)
  const [activeTooltipOrderId, setActiveTooltipOrderId] = useState(null)
  const [breakdown, setBreakdown] = useState(null)
  const [loadingBreakdown, setLoadingBreakdown] = useState(false)
  const [tooltipTriggerEl, setTooltipTriggerEl] = useState(null)

  const filteredOrdersIds = useMemo(() => filteredOrders.map(x => x.id), [filteredOrders])
  const getCustomerOrderCount = useCallback((phone, email) => {
    if (!phone && !email) return 0;
    const cleanPhone = phone ? phone.replace(/\D/g, '').slice(-10) : '';
    return allOrders.filter(o => {
      let phoneMatch = false;
      if (cleanPhone && o.phone) {
        const oCleanPhone = o.phone.replace(/\D/g, '').slice(-10);
        phoneMatch = oCleanPhone && oCleanPhone === cleanPhone;
      }
      const emailMatch = email && o.email && o.email === email;
      return phoneMatch || emailMatch;
    }).length;
  }, [allOrders])

  const totalTableWidth = useMemo(() => {
    const checkboxWidth = 40;
    const colsWidth = cols.reduce((sum, col) => sum + (COLUMN_WIDTHS[col.id] || 120), 0);
    return checkboxWidth + colsWidth;
  }, [cols]);

  const fetchBreakdown = async (orderId) => {
    setLoadingBreakdown(true)
    try {
      const res = await fetch(`/api/cost-manager/breakdown/${orderId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
      })
      const data = await res.json()
      setBreakdown(data)
    } catch (e) { console.error(e) }
    finally { setLoadingBreakdown(false) }
  }

  const [waTemplates, setWATemplates] = useState([])

  useEffect(() => {
    fetch('/api/templates', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
    })
    .then(res => res.json())
    .then(setWATemplates)
    .catch(err => console.error('Failed to fetch WA templates', err))
  }, [])

  if (loading) {
    return <div className="loading-overlay"><span className="loading-spinner"></span> Searching...</div>
  }

  return (
    <>
      <div className="table-wrapper" style={{ minWidth: '100%', width: '100%', overflowX: 'auto' }}>
        <div style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', padding: '8px 24px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>
            💡 <b>Showing {allOrders.length.toLocaleString()} of {totalCount.toLocaleString()} matching orders.</b>
            {debugWhere && <span style={{ marginLeft: 10, color: 'var(--text-muted)', fontSize: '0.65rem', fontStyle: 'italic' }}>SQL: {debugWhere}</span>}
          </span>
          {(keyword || status !== 'All Statuses') && (
            <button 
              onClick={clearAllFilters || (() => { setKeyword(''); setColFilters({}); setStatus('All Statuses'); })}
              className="btn btn-primary btn-sm"
              style={{ padding: '2px 8px', borderRadius: 4, fontWeight: 'bold', fontSize: '0.7rem' }}
            >
              CLEAR ALL FILTERS
            </button>
          )}
        </div>
        
        <table 
          ref={tableRef} 
          className="draggable-table" 
          style={{ 
            tableLayout: 'fixed', 
            width: '100%', 
            minWidth: totalTableWidth 
          }}
        >
          <TableHeader
            cols={cols}
            filteredOrders={filteredOrders}
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            handleHeaderSort={handleHeaderSort}
            sortKey={sortKey}
            sortDir={sortDir}
            setShowNameDialog={setShowNameDialog}
            localFilters={localFilters}
            setLocalFilters={setLocalFilters}
            colFilters={colFilters}
            setColFilters={setColFilters}
            COLUMN_WIDTHS={COLUMN_WIDTHS}
            TABLE_CONSTANTS={TABLE_CONSTANTS}
          />
          <tbody>
            {filteredOrders.length === 0 && (
              <tr>
                <td colSpan={cols.length + 1} style={{ padding: 0 }}>
                  <div className="empty-state">
                    <div className="empty-icon">🔍</div>
                    <h3>No Results</h3>
                    <p>Adjust your filters and try again</p>
                  </div>
                </td>
              </tr>
            )}
            {topPadding > 0 && (
              <tr style={{ height: topPadding }}>
                <td colSpan={cols.length + 1} style={{ padding: 0, height: topPadding, border: 'none' }} />
              </tr>
            )}
            {visibleOrders.map((o, index) => {
              const actualIndex = startIndex + index;
              return (
                <TableRow 
                  key={o.id} o={o} cols={cols}
                  isSelected={selectedIds.includes(o.id)}
                  currentIndex={actualIndex}
                  lastSelectedIndex={lastSelectedIndex} setSelectedIds={setSelectedIds} setLastSelectedIndex={setLastSelectedIndex}
                  filteredOrdersLength={filteredOrders.length}
                  filteredOrdersIds={filteredOrdersIds}
                  fetchOrderDetails={fetchOrderDetails} onViewHistory={onViewHistory} bookingId={bookingId}
                  handleConfirmOrder={handleConfirmOrder} handleRevertConfirm={handleRevertConfirm}
                  handleBookPostEx={handleBookPostEx} handleCancelBooking={handleCancelBooking} handleBookInstaworld={handleBookInstaworld}
                  formatCustomerName={formatCustomerName} waTemplates={waTemplates} allOrdersCount={allOrders.length}
                  getCustomerOrderCount={getCustomerOrderCount}
                  setCustomerHistoryPhone={setCustomerHistoryPhone} updateOrderField={updateOrderField}
                  canSeeFinancials={canSeeFinancials} activeTooltipOrderId={activeTooltipOrderId}
                  setActiveTooltipOrderId={setActiveTooltipOrderId} fetchBreakdown={fetchBreakdown}
                  user={user} statusUpdatingId={statusUpdatingId} handleManualStatusChange={handleManualStatusChange}
                  ERP_STATUSES={ERP_STATUSES} getStatusColor={getStatusColor}
                  activeShopDomain={localStorage.getItem('trace_active_shop')}
                  setTooltipTriggerEl={setTooltipTriggerEl}
                  onForceResync={onForceResync}
                />
              )
            })}
            {bottomPadding > 0 && (
              <tr style={{ height: bottomPadding }}>
                <td colSpan={cols.length + 1} style={{ padding: 0, height: bottomPadding, border: 'none' }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <TablePagination
        totalCount={totalCount}
        limit={limit}
        setLimit={setLimit}
        page={page}
        setPage={setPage}
        loading={loading}
      />
      
      {/* Cost Breakdown Tooltip Portal */}
      {activeTooltipOrderId && tooltipTriggerEl && createPortal(
        <TooltipPortalWrapper
          triggerEl={tooltipTriggerEl}
          loadingBreakdown={loadingBreakdown}
          breakdown={breakdown}
          onClose={() => { setActiveTooltipOrderId(null); setBreakdown(null); setTooltipTriggerEl(null); }}
        />,
        document.body
      )}

      <style>{`
        .cost-tooltip {
          background: #1a1a1a;
          border: 1px solid rgba(255,255,255,0.15);
          width: 260px;
          border-radius: 10px;
          box-shadow: 0 12px 30px rgba(0,0,0,0.5);
          animation: tooltipFade 0.2s ease;
          overflow: hidden;
        }
        @keyframes tooltipFade {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .cod-cancelled-row {
          background: rgba(239, 68, 68, 0.08) !important;
        }
        .cod-cancelled-row:hover {
          background: rgba(239, 68, 68, 0.15) !important;
        }
      `}</style>
    </>
  )
}
