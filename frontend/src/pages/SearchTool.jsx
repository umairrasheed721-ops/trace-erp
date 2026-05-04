import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getDateRange, getStatusColor, formatYMD } from '../utils/orderUtils'
import SearchFilters from '../components/SearchFilters'
import OrderTable from '../components/OrderTable'
import BulkActions from '../components/BulkActions'
import EditOrderModal from '../components/EditOrderModal'
import CustomerHistoryModal from '../components/CustomerHistoryModal'
import { SaveViewModal, ColumnPickerModal, AgingConfigModal, NameRulesModal } from '../components/Modals'
import { AddressCell, PaidAmountCell, CourierFeeCell, CostCell, NoteCell } from '../components/OrderCells'
import OrderHistoryModal from '../components/OrderHistoryModal'
import ApiStatusBanner from '../components/ApiStatusBanner'

const DATE_PRESETS = ['Today','Yesterday','Last 7 Days','Last 30 Days','This Month','Last Month','This Year','Last Year','2025','2024','2023','All Time','Custom Range']
const SORT_OPTIONS = ['Default','Newest First','Oldest First','Highest Price','Lowest Price']
const SPECIAL_MODES = ['[ACTIVE PIPELINE]','[READY TO BOOK]','[GHOST PIPELINE]','[NEEDS ADJUSTMENT]','[MISSING COST]','[AUDIT: MISSING CHARGES]','[WATCHDOG FRAUD]','[NO TRACKING]','[UNPAID DELIVERED]']
const STATUS_OPTIONS = ['All Statuses',...SPECIAL_MODES,'Pending','Delivered','Return Received','Cancelled','Returned','Booked','Shipper Advice','Undelivered','Refused','Attempted']

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value)
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay])
  return debouncedValue
}

function matchesSearch(order, keyword) {
  if (!keyword) return true
  const kw = keyword.toLowerCase().trim().replace(/^#/, '')
  
  // 1. Handle Bulk OR Search (Comma, Newline, or Pasted Space-separated IDs)
  const spaceTokens = kw.split(/\s+/).filter(Boolean);
  const isBulkSpacePasted = spaceTokens.length > 1 && spaceTokens.every(t => /^[a-z0-9#-]{4,}$/.test(t) && /\d/.test(t));

  if (kw.includes(',') || kw.includes('\n') || isBulkSpacePasted) {
    const terms = kw.split(/[\n,\s]+/).map(t => t.trim()).filter(Boolean)
    const searchable = `${order.shopify_order_id||''} ${order.ref_number||''} ${order.tracking_number||''} ${order.phone||''}`.toLowerCase()
    return terms.some(t => searchable.includes(t))
  }

  // 2. Tokenize Advanced Query
  // Supports: city:karachi -tcs >5000 "exact phrase"
  const tokens = kw.match(/[^\s"']+|"([^"]*)"|'([^']*)'/g) || []
  const searchable = `${order.shopify_order_id||''} ${order.ref_number||''} ${order.customer_name||''} ${order.phone||''} ${order.city||''} ${order.tracking_number||''} ${order.courier||''} ${order.delivery_status||''} ${order.notes||''}`.toLowerCase()
  
  // Scan items safely
  let itemsText = (order.product_titles || '').toLowerCase()
  try {
    if (order.line_items) {
      const parsedItems = typeof order.line_items === 'string' ? JSON.parse(order.line_items) : order.line_items
      if (Array.isArray(parsedItems)) {
        itemsText += ' ' + parsedItems.map(li => `${li.title || ''} ${li.sku || ''}`).join(' ').toLowerCase()
      }
    }
  } catch (e) {
    // Fallback to product_titles if parse fails
  }
  const fullText = searchable + ' ' + itemsText

  for (let token of tokens) {
    token = token.replace(/['"]/g, '') // Remove quotes
    const isNegated = token.startsWith('-')
    const actualToken = isNegated ? token.slice(1) : token
    
    if (!actualToken) continue

    let match = false
    
    // Field Prefixes: city:, phone:, courier:, ref:, status:
    if (actualToken.includes(':')) {
      const [field, value] = actualToken.split(':')
      if (field === 'city') match = (order.city || '').toLowerCase().includes(value)
      else if (field === 'phone') match = (order.phone || '').includes(value)
      else if (field === 'courier') match = (order.courier || '').toLowerCase().includes(value)
      else if (field === 'ref') match = (order.ref_number || '').toLowerCase().includes(value) || (order.shopify_order_id || '').toLowerCase().includes(value)
      else if (field === 'status') match = (order.delivery_status || '').toLowerCase().includes(value)
      else if (field === 'item') match = itemsText.includes(value)
      else if (field === 'note') match = (order.notes || '').toLowerCase().includes(value)
      else match = fullText.includes(actualToken)
    } 
    // Numeric Ranges: >1000, <5000, 2000-4000
    else if (actualToken.startsWith('>') || actualToken.startsWith('<')) {
      const op = actualToken[0]
      const val = parseFloat(actualToken.slice(1))
      const price = parseFloat(order.price) || 0
      if (op === '>') match = price > val
      else match = price < val
    }
    else if (actualToken.includes('-') && /^\d+-\d+$/.test(actualToken)) {
      const [min, max] = actualToken.split('-').map(Number)
      const price = parseFloat(order.price) || 0
      match = price >= min && price <= max
    }
    // Global Search
    else {
      match = fullText.includes(actualToken)
    }

    if (isNegated && match) return false // Found a negated term
    if (!isNegated && !match) return false // Didn't find a required term
  }

  return true
}

function applySpecialMode(order, mode, today) {
  const s = (order.delivery_status || '').toLowerCase()
  const paid = parseFloat(order.paid_amount) || 0
  const price = parseFloat(order.price) || 0
  const statusDate = order.status_date ? new Date(order.status_date) : null
  const daysOld = statusDate ? Math.floor((today - statusDate) / 86400000) : 999

  if (mode === '[ACTIVE PIPELINE]') return !['delivered','return received','cancelled','returned','void','voided'].includes(s)
  if (mode === '[READY TO BOOK]') {
    const hasTracking = !!order.tracking_number && order.tracking_number.trim() !== '' && order.tracking_number !== '—'
    return s === 'confirmed' && !hasTracking
  }
  if (mode === '[GHOST PIPELINE]') return (s.includes('pending')||s===''||s.includes('unbooked')||s.includes('returned')) && daysOld > 3
  if (mode === '[NEEDS ADJUSTMENT]') {
    const delivered = s.includes('delivered')
    const returnedOrCancelled = s.includes('return') || s.includes('cancel')
    const diff = price - paid
    
    // Flag if:
    // 1. Delivered but essentially unpaid (balance > 1)
    // 2. Delivered but partially paid (balance > 1)
    // 3. Returned/Cancelled but has any significant payment (> 1)
    // 4. Significant overpayment (balance < -1)
    return (delivered && paid < 1 && price > 1) || 
           (delivered && diff > 1 && paid >= 1) || 
           (returnedOrCancelled && paid > 1) || 
           (diff < -1)
  }
  if (mode === '[WATCHDOG FRAUD]') {
    return true; 
  }
  if (mode === '[NO TRACKING]') {
    return (!order.tracking_number || order.tracking_number.trim() === '') && s !== 'cancelled'
  }
  if (mode === '[UNPAID DELIVERED]') {
    return s.includes('delivered') && paid < 1
  }
  if (mode === '[MISSING COST]') {
    return s.includes('delivered') && (!order.cost || parseFloat(order.cost) === 0) && (parseInt(order.items_count) > 0)
  }
  if (mode === '[AUDIT: MISSING CHARGES]') {
    const fee = parseFloat(order.courier_fee) || 0
    return fee < 1 && !['pending','cancelled'].includes(s) && !!order.tracking_number
  }
  return true
}

export default function SearchTool() {
  const { activeStoreId, addToast, user } = useApp()
  const canSeeFinancials = user?.role === 'admin'
  const location = useLocation()
  const [allOrders, setAllOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [debugWhere, setDebugWhere] = useState('')
  const missingCostCount = useMemo(() => {
    return allOrders.filter(o => (o.delivery_status||'').toLowerCase().includes('delivered') && (!o.cost || parseFloat(o.cost) === 0) && (parseInt(o.items_count) > 0)).length
  }, [allOrders])
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  // Explicit search trigger (mostly for the 'Run Search' button)
  const runSearch = () => {
    if (page === 1) {
      // Force a refresh even if page is already 1 by slightly changing a dependency or just relying on the user's intent
      // For now, let's just ensure page 1 is set which triggers the useEffect
      setPage(1); 
    } else {
      setPage(1);
    }
  }

  const [preset, setPreset] = useState('Last Month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [status, setStatus] = useState('[ACTIVE PIPELINE]')
  const [keyword, setKeyword] = useState('')
  const debouncedKeyword = useDebounce(keyword, 400)
  const [sort, setSort] = useState('Default')
  const [sortKey, setSortKey] = useState('order_date')
  const [sortDir, setSortDir] = useState('desc')

  const handleHeaderSort = (key) => {
    if (sortKey === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
    setSort('Custom')
  }

  const [colFilters, setColFilters] = useState({
    ref_number: '', customer_name: '', city: '', phone: '', status: '', courier: '', tracking_number: '', notes: ''
  })
  const debouncedColFilters = useDebounce(colFilters, 500)

  // Reset page to 1 when filters change
  useEffect(() => {
    setPage(1)
  }, [debouncedKeyword, debouncedColFilters, status, preset, customStart, customEnd])
  const [compactMode, setCompactMode] = useState(() => localStorage.getItem('search_compact') === 'true')
  const [editingOrder, setEditingOrder] = useState(null)
  const [editorLoading, setEditorLoading] = useState(false)
  const [bookingId, setBookingId] = useState(null)
  const [validCities, setValidCities] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [bulkActionLoading, setBulkActionLoading] = useState(false)
  const [customerHistoryPhone, setCustomerHistoryPhone] = useState(null)
  const [showWAQueue, setShowWAQueue] = useState(false)
  const [waQueueIndex, setWAQueueIndex] = useState(0)
  const [waQueueTemplate, setWAQueueTemplate] = useState('')
  const [waTemplates, setWATemplates] = useState([])
  const [historyOrder, setHistoryOrder] = useState(null)

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/templates', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
      })
      const data = await res.json()
      const activeTemplates = data.filter(t => t.status === 'active')
      setWATemplates(activeTemplates)
      if (activeTemplates.length > 0) setWAQueueTemplate(activeTemplates[0].id)
    } catch (err) {
      console.error('Failed to fetch templates', err)
    }
  }
  useEffect(() => {
    if (editingOrder) {
      fetch(`/api/orders/logistics/cities?courier=PostEx`)
        .then(res => res.json())
        .then(setValidCities)
        .catch(console.error)
    }
  }, [editingOrder])

  const isCityValid = editingOrder && validCities.length > 0 
    ? validCities.some(v => v.toLowerCase() === (editingOrder.city || '').toLowerCase())
    : true

  const fetchOrderDetails = async (orderId) => {
    setEditorLoading(true)
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${apiUrl}/api/orders/${orderId}/details`)
      const data = await res.json()
      setEditingOrder(data)
    } catch (e) {
      addToast('Failed to fetch order details', 'error')
    } finally {
      setEditorLoading(false)
    }
  }

  const handleConfirmOrder = async (orderId) => {
    const order = allOrders.find(o => o.id === orderId)
    if (order && (!order.cost || parseFloat(order.cost) <= 0)) {
      addToast('🛑 Zero Cost Block: Heal cost before confirming', 'error')
      return
    }
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${apiUrl}/api/orders/${orderId}/confirm`, { method: 'POST' })
      if (res.ok) {
        addToast('✅ Order Confirmed!', 'success')
        setAllOrders(prev => prev.map(o => o.id === orderId ? { ...o, delivery_status: 'Confirmed' } : o))
      }
    } catch { addToast('Network error', 'error') }
  }

  const handleRevertConfirm = async (orderId) => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${apiUrl}/api/orders/${orderId}/revert-confirm`, { method: 'POST' })
      if (res.ok) {
        addToast('↩️ Order reverted to Pending', 'info')
        setAllOrders(prev => prev.map(o => o.id === orderId ? { ...o, delivery_status: 'Pending' } : o))
      }
    } catch { addToast('Network error', 'error') }
  }

  const handleUpdateNotes = async (orderId, notes) => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${apiUrl}/api/orders/${orderId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes })
      })
      if (res.ok) {
        addToast('📝 Notes synced to Shopify', 'success')
        setAllOrders(prev => prev.map(o => o.id === orderId ? { ...o, notes } : o))
      }
    } catch { addToast('Sync error', 'error') }
  }

  const handleUpdateAddress = async (orderId, address) => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${apiUrl}/api/orders/${orderId}/address`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address })
      })
      if (res.ok) {
        addToast('🏠 Address synced to Shopify', 'success')
        setAllOrders(prev => prev.map(o => o.id === orderId ? { ...o, address } : o))
      }
    } catch { addToast('Sync error', 'error') }
  }

  const handleBulkUpdateStatus = async (newStatus) => {
    if (selectedIds.length === 0 || !newStatus) return
    
    // Zero Cost Check for dangerous statuses
    const dangerous = ['confirmed', 'booked', 'dispatched', 'delivered']
    if (dangerous.includes(newStatus.toLowerCase())) {
      const blocked = allOrders.filter(o => selectedIds.includes(o.id) && (!o.cost || parseFloat(o.cost) <= 0))
      if (blocked.length > 0) {
        addToast(`🛑 Blocked: ${blocked.length} orders have $0 cost and cannot be moved to ${newStatus}`, 'error')
        return
      }
    }

    if (!confirm(`📦 Mark ${selectedIds.length} orders as ${newStatus}?`)) return
    setBulkActionLoading(true)
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${apiUrl}/api/orders/bulk-update-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds, status: newStatus })
      })
      if (res.ok) {
        addToast(`✅ ${selectedIds.length} orders updated to ${newStatus}!`, 'success')
        setAllOrders(prev => prev.map(o => selectedIds.includes(o.id) ? { ...o, delivery_status: newStatus } : o))
        setSelectedIds([])
      }
    } catch { addToast('Bulk update error', 'error') }
    finally { setBulkActionLoading(false) }
  }

  const handleBulkConfirm = async () => {
    if (selectedIds.length === 0) return
    
    // Zero Cost Check
    const blocked = allOrders.filter(o => selectedIds.includes(o.id) && (!o.cost || parseFloat(o.cost) <= 0))
    if (blocked.length > 0) {
      addToast(`🛑 Blocked: ${blocked.length} orders have $0 cost. Heal them first.`, 'error')
      return
    }

    if (!confirm(`✅ Confirm ${selectedIds.length} orders?`)) return
    setBulkActionLoading(true)
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${apiUrl}/api/orders/bulk-confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds })
      })
      if (res.ok) {
        addToast(`✅ ${selectedIds.length} orders confirmed!`, 'success')
        setAllOrders(prev => prev.map(o => selectedIds.includes(o.id) ? { ...o, delivery_status: 'Confirmed' } : o))
        setSelectedIds([])
      }
    } catch { addToast('Bulk error', 'error') }
    finally { setBulkActionLoading(false) }
  }

  const handleBulkRevert = async () => {
    if (selectedIds.length === 0) return
    if (!confirm(`↩️ Revert ${selectedIds.length} orders to Pending?`)) return
    setBulkActionLoading(true)
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${apiUrl}/api/orders/bulk-revert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds })
      })
      if (res.ok) {
        addToast(`↩️ ${selectedIds.length} orders reverted!`, 'info')
        setAllOrders(prev => prev.map(o => selectedIds.includes(o.id) ? { ...o, delivery_status: 'Pending' } : o))
        setSelectedIds([])
      }
    } catch { addToast('Bulk error', 'error') }
    finally { setBulkActionLoading(false) }
  }

  const handleBulkSyncCourier = async () => {
    if (selectedIds.length === 0) return
    if (!confirm(`🚀 Sync tracking for ${selectedIds.length} orders from Couriers?`)) return
    setBulkActionLoading(true)
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${apiUrl}/api/orders/bulk-sync-courier`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds })
      })
      const data = await res.json()
      if (res.ok) {
        addToast(`✅ Courier Sync complete! ${data.count} orders updated. Refreshing...`, 'success')
        setSelectedIds([])
        window.location.reload()
      } else {
        addToast(`❌ Sync Failed: ${data.error}`, 'error')
      }
    } catch { addToast('Network error', 'error') }
    finally { setBulkActionLoading(false) }
  }

  const handleBulkSyncStatus = async () => {
    if (selectedIds.length === 0) return
    if (!confirm(`🔄 Sync status for ${selectedIds.length} orders from Shopify?`)) return
    setBulkActionLoading(true)
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${apiUrl}/api/orders/bulk-sync-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds })
      })
      const data = await res.json()
      if (res.ok) {
        addToast(`✅ Sync complete! ${data.count} orders updated. Refreshing...`, 'success')
        setSelectedIds([])
        // We could manually update local state, but a refresh is safer for bulk
        window.location.reload()
      } else {
        addToast(`❌ Sync Failed: ${data.error}`, 'error')
      }
    } catch { addToast('Network error', 'error') }
    finally { setBulkActionLoading(false) }
  }

  const handleBulkBookPostEx = async () => {
    if (selectedIds.length === 0) return

    // Zero Cost Check
    const blocked = allOrders.filter(o => selectedIds.includes(o.id) && (!o.cost || parseFloat(o.cost) <= 0))
    if (blocked.length > 0) {
      addToast(`🛑 Blocked: ${blocked.length} orders have $0 cost. Heal them first.`, 'error')
      return
    }

    if (!confirm(`🚀 Book ${selectedIds.length} orders with PostEx?`)) return
    setBulkActionLoading(true)
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${apiUrl}/api/orders/bulk-book-postex`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds })
      })
      const data = await res.json()
      addToast(`✅ Bulk Booking complete! Success: ${data.count}, Failed: ${data.failed}`, 'info')
      setSelectedIds([])
    } catch { addToast('Bulk booking error', 'error') }
    finally { setBulkActionLoading(false) }
  }

  const handleBulkBookInstaworld = async (courier) => {
    if (selectedIds.length === 0) return

    // Zero Cost Check
    const blocked = allOrders.filter(o => selectedIds.includes(o.id) && (!o.cost || parseFloat(o.cost) <= 0))
    if (blocked.length > 0) {
      addToast(`🛑 Blocked: ${blocked.length} orders have $0 cost. Heal them first.`, 'error')
      return
    }

    if (!confirm(`🌐 Book ${selectedIds.length} orders with ${courier}?`)) return
    setBulkActionLoading(true)
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${apiUrl}/api/orders/bulk-book-instaworld`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds, courier_name: courier })
      })
      const data = await res.json()
      addToast(`✅ Bulk Booking complete! Success: ${data.count}, Failed: ${data.failed}`, 'info')
      setSelectedIds([])
    } catch { addToast('Bulk booking error', 'error') }
    finally { setBulkActionLoading(false) }
  }

  const handleCancelBooking = async (orderId) => {
    if (!confirm('🛑 Cancel this courier booking?')) return
    setBookingId(orderId)
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${apiUrl}/api/orders/${orderId}/cancel-booking`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        addToast('✅ Booking Cancelled', 'info')
        setAllOrders(prev => prev.map(o => o.id === orderId ? { ...o, tracking_number: null, delivery_status: 'Confirmed' } : o))
      } else {
        addToast(`❌ Cancel Failed: ${data.error}`, 'error')
      }
    } catch { addToast('Network error', 'error') }
    finally { setBookingId(null) }
  }

  const handleBookInstaworld = async (orderId, courier = 'TCS') => {
    const order = allOrders.find(o => o.id === orderId)
    if (order && (!order.cost || parseFloat(order.cost) <= 0)) {
      addToast('🛑 Zero Cost Block: Heal cost before booking', 'error')
      return
    }
    if (!confirm(`🌐 Book this order with ${courier}?`)) return
    setBookingId(orderId)
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${apiUrl}/api/orders/${orderId}/book-instaworld`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courier_name: courier })
      })
      const data = await res.json()
      if (data.success) {
        addToast(`✅ Booked! Tracking: ${data.tracking_number}`, 'success')
        setAllOrders(prev => prev.map(o => o.id === orderId ? { ...o, tracking_number: data.tracking_number, courier: courier, delivery_status: 'Booked' } : o))
      } else {
        addToast(`❌ Booking Failed: ${data.error}`, 'error')
      }
    } catch { addToast('Network error', 'error') }
    finally { setBookingId(null) }
  }

  const handleBookPostEx = async (orderId) => {
    const order = allOrders.find(o => o.id === orderId)
    if (order && (!order.cost || parseFloat(order.cost) <= 0)) {
      addToast('🛑 Zero Cost Block: Heal cost before booking', 'error')
      return
    }
    if (!confirm('🚀 Book this order with PostEx? This will generate a real tracking number.')) return
    setBookingId(orderId)
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${apiUrl}/api/orders/${orderId}/book-postex`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        addToast(`✅ Booked! Tracking: ${data.tracking_number}`, 'success')
        setAllOrders(prev => prev.map(o => o.id === orderId ? { ...o, tracking_number: data.tracking_number, courier: 'PostEx', delivery_status: 'Booked' } : o))
      } else {
        addToast(`❌ Booking Failed: ${data.error}`, 'error')
      }
    } catch (e) {
      addToast('Network error while booking', 'error')
    } finally {
      setBookingId(null)
    }
  }

  const toggleCompact = () => {
    setCompactMode(prev => {
      localStorage.setItem('search_compact', !prev)
      return !prev
    })
  }

  const handleStartWAQueue = () => {
    if (selectedIds.length === 0) return;
    setWAQueueIndex(0);
    setShowWAQueue(true);
  }

  const sendNextWA = () => {
    const orderId = selectedIds[waQueueIndex];
    const o = allOrders.find(item => item.id === orderId);
    if (!o) return;

    const name = formatCustomerName(o.customer_name);
    const ref = o.ref_number || o.shopify_order_id;
    const price = Math.round(parseFloat(o.price)||0);
    const courier = o.courier || 'our courier';
    const tracking = o.tracking_number || '';
    
    const template = waTemplates.find(t => t.id === parseInt(waQueueTemplate));
    let msg = "";
    
    if (template) {
      msg = template.content
        .replace(/\[Name\]/g, name)
        .replace(/\[OrderID\]/g, ref)
        .replace(/\[Price\]/g, price)
        .replace(/\[Courier\]/g, courier)
        .replace(/\[Tracking\]/g, tracking);
      
      // Auto-Link if confirmation token exists
      if (o.confirmation_token) {
        const appUrl = window.location.origin;
        const link = `${appUrl}/api/public/confirm-order/${o.confirmation_token}`;
        msg = msg.replace(/\[Link\]/g, link);
      } else {
        msg = msg.replace(/\[Link\]/g, '(Confirm on call)');
      }
    }

    const waLink = `https://wa.me/${o.phone.replace(/\D/g,'').replace(/^0/,'92')}?text=${encodeURIComponent(msg)}`;
    window.open(waLink, '_blank');

    if (waQueueIndex < selectedIds.length - 1) {
      setWAQueueIndex(prev => prev + 1);
    } else {
      addToast('🎉 WhatsApp Queue Complete!', 'success');
      setShowWAQueue(false);
      setSelectedIds([]);
    }
  }

  // ─── Name Cleaning Logic ─────────────────
  const [nameSettings, setNameSettings] = useState(() => {
    const saved = localStorage.getItem('trace_name_settings')
    return saved ? JSON.parse(saved) : { shorten: true, stripWords: 'Mr, Ms, Dr, Malik, M.' }
  })
  const [showNameDialog, setShowNameDialog] = useState(false)

  const saveNameSettings = (newSettings) => {
    setNameSettings(newSettings)
    localStorage.setItem('trace_name_settings', JSON.stringify(newSettings))
    setShowNameDialog(false)
  }

  const formatCustomerName = (name) => {
    if (!name) return '—'
    let n = name.trim()
    
    // 1. Strip words
    const strip = nameSettings.stripWords.split(',').map(s => s.trim()).filter(Boolean)
    strip.forEach(s => {
      const reg = new RegExp(`\\b${s}\\b`, 'gi')
      n = n.replace(reg, '')
    })

    // 2. Clean extra spaces
    let words = n.split(/\s+/).filter(Boolean)
    
    // 3. Deduplicate (e.g. "John Doe John Doe")
    if (words.length >= 4 && words.length % 2 === 0) {
      const mid = words.length / 2
      const firstHalf = words.slice(0, mid).join(' ').toLowerCase()
      const secondHalf = words.slice(mid).join(' ').toLowerCase()
      if (firstHalf === secondHalf) words = words.slice(0, mid)
    }

    // 4. Shorten to max 2 words
    if (nameSettings.shorten && words.length > 2) {
      words = words.slice(0, 2)
    }

    return words.join(' ') || '—'
  }

  // ─── Aging Logic ─────────────────────────
  const [agingConfig, setAgingConfig] = useState(() => {
    const saved = localStorage.getItem('trace_aging_config')
    return saved ? JSON.parse(saved) : { criticalLevel: 8, span: 1 }
  })
  const [syncProgress, setSyncProgress] = useState(null) // { current, total, message }
  const [activeAgingBucket, setActiveAgingBucket] = useState(null)
  const [showAgingConfig, setShowAgingConfig] = useState(false)

  const getAgingBuckets = () => {
    const { criticalLevel, span } = agingConfig
    const buckets = [{ label: 'Day 0', min: 0, max: 0 }]
    
    for (let i = 1; i < criticalLevel; i += span) {
      const max = Math.min(i + span - 1, criticalLevel - 1)
      buckets.push({ 
        label: i === max ? `Day ${i}` : `Day ${i}-${max}`, 
        min: i, 
        max: max 
      })
    }
    buckets.push({ label: `Day ${criticalLevel}+`, min: criticalLevel, max: 9999 })
    return buckets
  }

  const agingBuckets = useMemo(() => getAgingBuckets(), [agingConfig])
  const today = new Date(); today.setHours(0,0,0,0)
  const [showAgingBar, setShowAgingBar] = useState(() => localStorage.getItem('trace_show_aging') !== 'false')

  const toggleAgingBar = () => {
    setShowAgingBar(prev => {
      localStorage.setItem('trace_show_aging', !prev)
      return !prev
    })
  }

  const isBacklogOrder = (o) => {
    const status = (o.delivery_status || '').toLowerCase()
    const hasTracking = !!o.tracking_number && o.tracking_number !== '—' && String(o.tracking_number).length > 3
    const hasCourier = !!o.courier && o.courier !== '—'
    
    // Statuses that imply it's NOT in the warehouse anymore
    const isOut = status.includes('booked') || 
                  status.includes('picked') || 
                  status.includes('transit') || 
                  status.includes('attempt') || 
                  status.includes('delivered') || 
                  status.includes('return') ||
                  status.includes('cancel') ||
                  status.includes('warehouse') ||
                  status.includes('available')

    // It's ONLY a backlog if it's Pending AND has no tracking/courier AND isn't already "Out"
    return status.includes('pending') && !hasTracking && !hasCourier && !isOut
  }

  const getAgingCounts = (orders) => {
    const counts = {}
    orders.forEach(o => {
      if (!o.order_date || !isBacklogOrder(o)) return
      
      const d = new Date(o.order_date); d.setHours(0,0,0,0)
      const diff = Math.floor((today - d) / 86400000)
      const b = agingBuckets.find(bucket => diff >= bucket.min && diff <= bucket.max)
      if (b) counts[b.label] = (counts[b.label] || 0) + 1
    })
    return counts
  }
  const agingCounts = getAgingCounts(allOrders)

  // ─── Drag & Drop Columns ─────────────────
  const DEFAULT_COLS = [
    { id: 'ref_number', label: 'Ref #' },
    { id: 'order_date', label: 'Date' },
    { id: 'customer_name', label: 'Customer' },
    { id: 'phone', label: 'Phone' },
    { id: 'address', label: 'Shipping Address' },
    { id: 'city', label: 'City' },
    { id: 'items', label: 'Line Items' },
    { id: 'tracking_number', label: 'Tracking #' },
    { id: 'courier', label: 'Courier' },
    { id: 'courier_fee', label: 'Actual Expense' },
    { id: 'delivery_status', label: 'Status' },
    { id: 'payment_status', label: 'Payment' },
    { id: 'paid_amount', label: 'Amount Paid' },
    { id: 'price', label: 'Price' },
    { id: 'cost', label: 'Cost' },
    { id: 'profit', label: 'Profit' },
    { id: 'order_source', label: 'Source' },
    { id: 'status_date', label: 'Last Update' },
    { id: 'payment_ref', label: 'Expense CPR Ref' },
    { id: 'payment_date', label: 'Payment Date' },
    { id: 'postex_weight', label: 'Weight (kg)' },
    { id: 'edit', label: 'Action' },
    { id: 'notes', label: 'Shopify Note' }
  ]
  const [cols, setCols] = useState(() => {
    const saved = localStorage.getItem('trace_search_cols')
    let baseCols = saved ? JSON.parse(saved) : DEFAULT_COLS
    if (user?.role !== 'admin') {
      baseCols = baseCols.filter(c => c.id !== 'cost' && c.id !== 'profit')
    }
    return baseCols
  })

  // Smart-inject missing essential columns without resetting the whole layout
  useEffect(() => {
    const currentIds = cols.map(c => c.id)
    const essentials = ['delivery_status', 'edit', 'tracking_number', 'profit', 'paid_amount', 'address']
    const missing = essentials.filter(id => !currentIds.includes(id))
    
    if (missing.length > 0) {
      const newCols = [...cols]
      missing.forEach(id => {
        const colDef = DEFAULT_COLS.find(c => c.id === id)
        if (colDef) newCols.push(colDef)
      })
      setCols(newCols)
      localStorage.setItem('trace_search_cols', JSON.stringify(newCols))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [draggedIdx, setDraggedIdx] = useState(null)

  const onDragStart = (idx) => setDraggedIdx(idx)
  const onDragOver = (e) => e.preventDefault()
  const onDrop = (targetIdx) => {
    if (draggedIdx === null) return
    const newCols = [...cols]
    const [removed] = newCols.splice(draggedIdx, 1)
    newCols.splice(targetIdx, 0, removed)
    setCols(newCols)
    localStorage.setItem('trace_search_cols', JSON.stringify(newCols))
    setDraggedIdx(null)
  }

  // Apply drill-down state from Reports page
  useEffect(() => {
    if (location.state) {
      const { preset: p, customStart: cs, customEnd: ce, status: s, keyword: k } = location.state
      if (p) setPreset(p)
      if (cs) setCustomStart(cs)
      if (ce) setCustomEnd(ce)
      if (s) setStatus(s)
      if (k) setKeyword(k)
      // Clear state after application so refreshes use defaults or current state
      window.history.replaceState({}, document.title)
    }
  }, [location.state])

  const [savedViews, setSavedViews] = useState([])
  const [selectedView, setSelectedView] = useState('')
  const [viewName, setViewName] = useState('')
  const [isViewLocked, setIsViewLocked] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showColPicker, setShowColPicker] = useState(false)

  const fetchViews = async () => {
    if (!activeStoreId) return
    try {
      const res = await fetch(`/api/stores/${activeStoreId}/views`)
      const data = await res.json()
      setSavedViews(data)
    } catch (e) { console.error('Failed to fetch views', e) }
  }

  useEffect(() => { fetchViews() }, [activeStoreId])

  // KPIs
  const [kpi, setKpi] = useState({ total: 0, sum: 0, delivered: 0, returned: 0, pending: 0 })

  // Load all orders for the active store (we filter client-side for instant search)
  useEffect(() => {
    if (!activeStoreId) return
    setLoading(true)
    
    // If it's a special mode (in brackets), we now pass it to backend for efficient filtering
    const queryStatus = status === 'All Statuses' ? '' : status
    
    const kw = debouncedKeyword ? debouncedKeyword.trim().replace(/^#/, '') : ''
    const dateRange = getDateRange(preset, customStart, customEnd)
    const startDate = dateRange?.start ? formatYMD(dateRange.start) : ''
    const endDate = dateRange?.end ? formatYMD(dateRange.end) : ''

    const limit = 250
    // Encode colFilters into query string
    const colFilterParams = Object.entries(debouncedColFilters)
      .filter(([_, v]) => v && v.trim())
      .map(([k, v]) => `&${k}=${encodeURIComponent(v.trim())}`)
      .join('')

    // Map sortKey to backend columns
    const backendSortMap = {
      'order_date': 'order_date',
      'cost': 'cost',
      'price': 'price',
      'customer_name': 'customer_name',
      'delivery_status': 'delivery_status'
    }
    const sCol = backendSortMap[sortKey] || 'created_timestamp'

    fetch(`/api/orders?store_id=${activeStoreId}&limit=${limit}&page=${page}&status=${encodeURIComponent(queryStatus||'')}&search=${encodeURIComponent(kw)}&start_date=${startDate}&end_date=${endDate}&sort=${sCol}&sort_dir=${sortDir}${colFilterParams}&t=${Date.now()}`)
      .then(r => r.json())
      .then(data => { 
        setAllOrders(data.orders || []); 
        setTotalCount(data.total || 0);
        setDebugWhere(data.debugWhere || '');
        setLoading(false) 
      })
      .catch(() => { addToast('Failed to load orders', 'error'); setLoading(false) })
  }, [activeStoreId, status, debouncedKeyword, preset, customStart, customEnd, page, debouncedColFilters, sortKey, sortDir])

  // Live Updates Connection (SSE)
  useEffect(() => {
    if (!activeStoreId) return;
    
    const token = localStorage.getItem('trace_token');
    if (!token) return;

    const source = new EventSource(`/api/live?token=${token}`);
    
    source.addEventListener('order_updated', async (e) => {
      try {
        const data = JSON.parse(e.data);
        if (String(data.storeId) === String(activeStoreId)) {
          // Fetch the specifically updated row silently
          const res = await fetch(`/api/orders/by-shopify/${data.shopifyOrderId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (!res.ok) return;
          const updatedOrder = await res.json();
          if (updatedOrder && updatedOrder.id) {
            setAllOrders(prev => {
              const idx = prev.findIndex(o => String(o.shopify_order_id) === String(data.shopifyOrderId));
              if (idx > -1) {
                const newOrders = [...prev];
                newOrders[idx] = updatedOrder;
                return newOrders;
              } else {
                return [updatedOrder, ...prev];
              }
            });
            console.log(`[Live UI] Silently updated order ${data.shopifyOrderId}`);
          }
        }
      } catch (err) { console.error('Live update failed', err) }
    });

    source.addEventListener('sync_progress', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (String(data.storeId) === String(activeStoreId)) {
          setSyncProgress(data);
          if (data.current === data.total) {
            setTimeout(() => setSyncProgress(null), 3000);
          }
        }
      } catch (err) { console.error('Sync progress parse failed', err) }
    });

    return () => source.close();
  }, [activeStoreId]);

  const filteredOrders = useMemo(() => {
    let result = [...allOrders];

    // Filter by Aging Bucket if one is selected
    if (activeAgingBucket) {
      const bucket = agingBuckets.find(b => b.label === activeAgingBucket);
      if (bucket) {
        result = result.filter(o => {
          if (!o.order_date || !isBacklogOrder(o)) return false;
          const d = new Date(o.order_date); d.setHours(0,0,0,0);
          const diff = Math.floor((today - d) / 86400000);
          return diff >= bucket.min && diff <= bucket.max;
        });
      }
    }

    // Client-side Sort (only if Default or specific relevance is needed)
    if (debouncedKeyword && debouncedKeyword.trim().length > 2) {
      const kwClean = debouncedKeyword.trim().toLowerCase().replace(/^#/, '');
      result.sort((a, b) => {
        const aRef = (a.ref_number || '').toLowerCase().replace(/^#/, '');
        const bRef = (b.ref_number || '').toLowerCase().replace(/^#/, '');
        const aID = (a.shopify_order_id || '').toString();
        const bID = (b.shopify_order_id || '').toString();
        
        const aExact = aRef === kwClean || aID === kwClean || aID.includes(kwClean);
        const bExact = bRef === kwClean || bID === kwClean || bID.includes(kwClean);
        
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        return 0;
      });
    }
    return result;
  }, [allOrders, debouncedKeyword, activeAgingBucket, agingBuckets, today]);

  useEffect(() => {
    let delivered=0, returned=0, pending=0, sum=0
    filteredOrders.forEach(o => {
      const s = (o.delivery_status||'').toLowerCase()
      sum += parseFloat(o.price)||0
      if (s.includes('delivered')) delivered++
      else if (s.includes('return')||s.includes('cancel')) returned++
      else pending++
    })
    setKpi({ total: totalCount, sum, delivered, returned, pending })
  }, [filteredOrders, totalCount])

  const saveView = async () => {
    if (!viewName.trim()) return
    try {
      const res = await fetch(`/api/stores/${activeStoreId}/views`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          view_name: viewName,
          column_config: cols,
          is_locked: isViewLocked
        })
      })
      if (res.ok) {
        addToast(`✅ View "${viewName}" saved`, 'success')
        fetchViews()
        setShowSaveDialog(false); setViewName('')
      }
    } catch (e) { addToast('Failed to save view', 'error') }
  }

  const loadView = (id) => {
    const v = savedViews.find(v => String(v.id) === String(id))
    if (!v) return
    try {
      const config = JSON.parse(v.column_config)
      setCols(config)
      localStorage.setItem('trace_search_cols', JSON.stringify(config))
      setSelectedView(id)
    } catch (e) { console.error('Failed to load view config', e) }
  }

  const deleteView = async () => {
    if (!selectedView) return
    if (!window.confirm('Are you sure you want to delete this view?')) return
    try {
      const res = await fetch(`/api/stores/${activeStoreId}/views/${selectedView}`, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok) {
        addToast(`View deleted`, 'info')
        fetchViews()
        setSelectedView('')
      } else {
        addToast(data.error || 'Failed to delete', 'error')
      }
    } catch (e) { addToast('Delete failed', 'error') }
  }

  const updateOrderField = async (orderId, field, value) => {
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value })
      })
      const data = await res.json()
      // Backend returns full updated row (includes auto-stamped payment_date, payment_status)
      if (data.order) {
        setAllOrders(prev => prev.map(o => o.id === orderId ? data.order : o))
      } else {
        setAllOrders(prev => prev.map(o => o.id === orderId ? { ...o, [field]: value } : o))
      }
      addToast('✅ Saved', 'success')
    } catch {
      addToast('❌ Failed to save', 'error')
    }
  }

  const deliveryRate = kpi.total > 0 ? ((kpi.delivered / kpi.total) * 100).toFixed(1) : 0
  return (
    <div className={compactMode ? 'ultra-compact' : ''}>
      <ApiStatusBanner />
      {/* REAL-TIME SYNC PROGRESS BAR */}
      {syncProgress && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(10px)',
          padding: '12px 24px', borderBottom: '1px solid var(--brand)',
          animation: 'slideDown 0.3s ease'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '1.2rem' }}>{syncProgress.current === syncProgress.total ? '✅' : '⚡'}</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                  {syncProgress.message || 'Processing Orders...'}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                  {syncProgress.current} of {syncProgress.total} orders synced
                </div>
              </div>
            </div>
            <div style={{ fontWeight: 900, fontSize: '1.1rem', color: 'var(--brand)' }}>
              {Math.round((syncProgress.current / syncProgress.total) * 100)}%
            </div>
          </div>
          <div style={{ height: 6, background: 'var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ 
              height: '100%', 
              background: 'linear-gradient(90deg, var(--brand) 0%, #fff 100%)', 
              width: `${(syncProgress.current / syncProgress.total) * 100}%`,
              transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: '0 0 15px var(--brand)'
            }}></div>
          </div>
        </div>
      )}

      {/* Main Page Header */}
      <div className="sticky-controls">
        <div className="page-header" style={{ marginBottom: compactMode ? 8 : 16 }}>
          <div>
            <h2 style={{ fontSize: compactMode ? '1.1rem' : '1.5rem', margin: 0 }}>🔍 Command Center</h2>
            {!compactMode && <p style={{ margin: '4px 0 0', opacity: 0.6 }}>Advanced search, filter, and logistics management</p>}
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary btn-sm" onClick={runSearch}>🔄 Run Search</button>
          </div>
        </div>

        <SearchFilters
          preset={preset} setPreset={setPreset}
          customStart={customStart} setCustomStart={setCustomStart}
          customEnd={customEnd} setCustomEnd={setCustomEnd}
          status={status} setStatus={setStatus}
          keyword={keyword} setKeyword={setKeyword}
          sort={sort} setSort={setSort}
          selectedView={selectedView} loadView={loadView}
          deleteView={deleteView}
          savedViews={savedViews}
          runSearch={runSearch}
          setColFilters={setColFilters}
          setActiveAgingBucket={setActiveAgingBucket}
          addToast={addToast}
          compactMode={compactMode}
          toggleCompact={toggleCompact}
          toggleAgingBar={toggleAgingBar}
          showAgingBar={showAgingBar}
          setShowAgingConfig={setShowAgingConfig}
          syncProgress={syncProgress}
          kpi={kpi}
          deliveryRate={deliveryRate}
          missingCostCount={missingCostCount}
          activeAgingBucket={activeAgingBucket}
          agingBuckets={agingBuckets}
          agingCounts={agingCounts}
          DATE_PRESETS={DATE_PRESETS}
          STATUS_OPTIONS={STATUS_OPTIONS}
          SORT_OPTIONS={SORT_OPTIONS}
          setShowSaveDialog={setShowSaveDialog}
          setShowColPicker={setShowColPicker}
          setShowNameDialog={setShowNameDialog}
        />
      </div>

      <BulkActions
        selectedIds={selectedIds}
        setSelectedIds={setSelectedIds}
        bulkActionLoading={bulkActionLoading}
        handleBulkConfirm={handleBulkConfirm}
        handleBulkSyncStatus={handleBulkSyncStatus}
        handleBulkSyncCourier={handleBulkSyncCourier}
        handleBulkRevert={handleBulkRevert}
        handleBulkUpdateStatus={handleBulkUpdateStatus}
        handleBulkBookPostEx={handleBulkBookPostEx}
        handleBulkBookInstaworld={handleBulkBookInstaworld}
        handleBulkWhatsApp={handleStartWAQueue}
      />

      {/* WhatsApp Queue Modal */}
      {showWAQueue && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel" style={{ width: '500px', textAlign: 'center', padding: '30px' }}>
            <div style={{ fontSize: '3rem', marginBottom: '10px' }}>📱</div>
            <h3 className="premium-title">WhatsApp Bulk Queue</h3>
            <p className="premium-subtitle">Sending {selectedIds.length} messages in sequence.</p>
            
            <div style={{ margin: '20px 0', background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '12px' }}>
              <label style={{ display: 'block', marginBottom: '10px', fontSize: '0.8rem', opacity: 0.7 }}>Select Template</label>
              <select 
                className="premium-input" 
                value={waQueueTemplate}
                onChange={e => setWAQueueTemplate(e.target.value)}
              >
                {waTemplates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div className="queue-progress" style={{ margin: '20px 0' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--brand)' }}>
                Message {waQueueIndex + 1} of {selectedIds.length}
              </div>
              <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', marginTop: '10px', overflow: 'hidden' }}>
                <div style={{ width: `${((waQueueIndex + 1) / selectedIds.length) * 100}%`, height: '100%', background: 'var(--brand)', transition: '0.3s ease' }}></div>
              </div>
            </div>

            <div className="modal-actions" style={{ display: 'flex', gap: '10px', marginTop: '30px' }}>
              <button className="btn btn-primary" style={{ flex: 2, padding: '12px' }} onClick={sendNextWA}>
                🚀 Send Next & Advance
              </button>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowWAQueue(false)}>
                Cancel
              </button>
            </div>
            <p style={{ marginTop: '15px', fontSize: '0.7rem', opacity: 0.5 }}>
              Tip: Keep this tab open while you hit 'Enter' in the new WhatsApp tabs.
            </p>
          </div>
        </div>
      )}

      <OrderTable
        loading={loading}
        filteredOrders={filteredOrders}
        allOrders={allOrders}
        totalCount={totalCount}
        debugWhere={debugWhere}
        cols={cols}
        selectedIds={selectedIds}
        setSelectedIds={setSelectedIds}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        handleHeaderSort={handleHeaderSort}
        sortKey={sortKey}
        sortDir={sortDir}
        colFilters={colFilters}
        setColFilters={setColFilters}
        formatCustomerName={formatCustomerName}
        fetchOrderDetails={fetchOrderDetails}
        bookingId={bookingId}
        handleConfirmOrder={handleConfirmOrder}
        handleRevertConfirm={handleRevertConfirm}
        handleBookPostEx={handleBookPostEx}
        handleCancelBooking={handleCancelBooking}
        handleBookInstaworld={handleBookInstaworld}
        updateOrderField={updateOrderField}
        setCustomerHistoryPhone={setCustomerHistoryPhone}
        setShowNameDialog={setShowNameDialog}
        setKeyword={setKeyword}
        setStatus={setStatus}
        page={page}
        setPage={setPage}
        onViewHistory={(o) => setHistoryOrder(o)}
      />

      {/* MODALS */}
      <EditOrderModal
        editingOrder={editingOrder}
        setEditingOrder={setEditingOrder}
        editorLoading={editorLoading}
        fetchOrderDetails={fetchOrderDetails}
        updateOrderField={updateOrderField}
        isCityValid={isCityValid}
        addToast={addToast}
      />

      {customerHistoryPhone && (
        <CustomerHistoryModal
          phone={customerHistoryPhone}
          allOrders={allOrders}
          onClose={() => setCustomerHistoryPhone(null)}
        />
      )}

      <SaveViewModal
        show={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        viewName={viewName}
        setViewName={setViewName}
        isViewLocked={isViewLocked}
        setIsViewLocked={setIsViewLocked}
        onSave={saveView}
      />

      <ColumnPickerModal
        show={showColPicker}
        onClose={() => setShowColPicker(false)}
        cols={cols}
        setCols={setCols}
        DEFAULT_COLS={DEFAULT_COLS}
      />

      <AgingConfigModal
        show={showAgingConfig}
        onClose={() => setShowAgingConfig(false)}
        agingConfig={agingConfig}
        setAgingConfig={setAgingConfig}
        onConfirm={() => { localStorage.setItem('trace_aging_config', JSON.stringify(agingConfig)); setShowAgingConfig(false); }}
      />

      <NameRulesModal
        show={showNameDialog}
        onClose={() => setShowNameDialog(false)}
        nameSettings={nameSettings}
        setNameSettings={setNameSettings}
        onSave={() => saveNameSettings(nameSettings)}
      />

      {historyOrder && (
        <OrderHistoryModal
          order={historyOrder}
          onClose={() => setHistoryOrder(null)}
        />
      )}
    </div>
  )
}

