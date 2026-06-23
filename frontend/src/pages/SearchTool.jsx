import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useRoutePersistence } from '../context/RoutePersistenceContext'
import { getDateRange, getStatusColor, formatYMD } from '../utils/orderUtils'
import CommandTable from '../components/CommandCenter/CommandTable'
import BulkActions from '../components/BulkActions'
import EditOrderModal from '../components/EditOrderModal'
import CustomerHistoryModal from '../components/CustomerHistoryModal'
import { SaveViewModal, ColumnPickerModal, AgingConfigModal, NameRulesModal } from '../components/Modals'
import OrderHistoryModal from '../components/OrderHistoryModal'
import ApiStatusBanner from '../components/ApiStatusBanner'
import ErrorBoundary from '../components/ErrorBoundary'
import CommandCenterHeader from '../components/CommandCenter/Layout/CommandCenterHeader'
import CommandCenterFilters from '../components/CommandCenter/Layout/CommandCenterFilters'
import useCommandCenterModals from '../hooks/useCommandCenterModals'
import useCommandCenterBulkActions from '../hooks/useCommandCenterBulkActions'
import usePersistentState from '../hooks/usePersistentState'

const DATE_PRESETS = ['Today','Yesterday','Last 7 Days','Last 30 Days','This Month','Last Month','This Year','Last Year','2025','2024','2023','All Time','Custom Range']
const SORT_OPTIONS = ['Default','Newest First','Oldest First','Highest Price','Lowest Price']
const SPECIAL_MODES = ['[ACTIVE PIPELINE]','[STUCK PIPELINE]','[RETURNED]','[PAID]','[READY TO BOOK]','[GHOST PIPELINE]','[NEEDS ADJUSTMENT]','[MISSING COST]','[AUDIT: MISSING CHARGES]','[WATCHDOG FRAUD]','[NO TRACKING]','[UNPAID DELIVERED]']
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

    if (isNegated && match) return false;
    if (!isNegated && !match) return false;
  }

  return true;
}

function applySpecialMode(order, mode, today) {
  const s = (order.delivery_status || '').toLowerCase()
  const paid = parseFloat(order.paid_amount) || 0
  const price = parseFloat(order.price) || 0
  const statusDate = order.status_date ? new Date(order.status_date) : null
  const daysOld = statusDate ? Math.floor((today - statusDate) / 86400000) : 999

  const hasTracking = !!order.tracking_number && order.tracking_number.trim() !== '' && order.tracking_number !== '—'
  
  if (mode === '[ACTIVE PIPELINE]') return hasTracking && !['delivered','return received','cancelled','returned','void','voided'].includes(s)
  if (mode === '[UNBOOKED]') return !hasTracking && !['delivered','return received','cancelled','returned','void','voided'].includes(s)
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
  const { activeStoreId, addToast, user, isFocusMode, setSidebarCollapsed } = useApp()
  const [activeRowId, setActiveRowId] = useState(null)
  const canSeeFinancials = user?.role === 'admin'
  const location = useLocation()
  const [allOrders, setAllOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [debugWhere, setDebugWhere] = useState('')
  const lastSearchRef = useRef('')
  const isProgrammaticRef = useRef(false)
  const isCustomerSearchRef = useRef(false)
  const searchInputRef = useRef(null)
  const lastFetchedUrlRef = useRef('')
  const lastRefreshRef = useRef(0)
  const isClearingRef = useRef(false)
  const isClearingStageRef = useRef(null)
  const missingCostCount = useMemo(() => {
    return allOrders.filter(o => (o.delivery_status||'').toLowerCase().includes('delivered') && (!o.cost || parseFloat(o.cost) === 0) && (parseInt(o.items_count) > 0)).length
  }, [allOrders])
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(() => parseInt(localStorage.getItem('trace_search_limit')) || 50)
  const [totalCount, setTotalCount] = useState(0)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const hasState = !!(location.state && Object.keys(location.state).length > 0);
  const [preset, setPreset] = usePersistentState('command_center_filters_v1_preset', location.state?.preset || 'This Month', { override: hasState })
  const [customStart, setCustomStart] = usePersistentState('command_center_filters_v1_custom_start', location.state?.customStart || '', { override: hasState })
  const [customEnd, setCustomEnd] = usePersistentState('command_center_filters_v1_custom_end', location.state?.customEnd || '', { override: hasState })
  const [status, setStatus] = usePersistentState('command_center_filters_v1_status', location.state?.status || 'Pending', { override: hasState })
  const [keyword, setKeyword] = usePersistentState('command_center_filters_v1_keyword', location.state?.keyword || '', { override: hasState })
  const debouncedKeyword = useDebounce(keyword, 400)
  const [sort, setSort] = useState('Default')
  const [sortKey, setSortKey] = useState(() => localStorage.getItem('sort_key') || 'order_date')
  const [sortDir, setSortDir] = useState(() => localStorage.getItem('sort_dir') || 'desc')
  const [sortMode, setSortMode] = useState(() => localStorage.getItem('sort_mode') || 'instant')

  useEffect(() => {
    localStorage.setItem('sort_key', sortKey)
    localStorage.setItem('sort_dir', sortDir)
    localStorage.setItem('sort_mode', sortMode)
  }, [sortKey, sortDir, sortMode])

  const handleHeaderSort = (key) => {
    if (sortKey === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
    setSort('Custom')
    if (sortMode === 'deep') setPage(1)
  }

  const displayedOrders = useMemo(() => {
    if (sortMode === 'deep') return allOrders;
    return [...allOrders].sort((a, b) => {
      let valA = a[sortKey], valB = b[sortKey];
      if (sortKey === 'price' || sortKey === 'cost') {
        valA = parseFloat(valA) || 0; valB = parseFloat(valB) || 0;
      }
      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      if (sortKey !== 'order_date') {
        return new Date(b.order_date) - new Date(a.order_date);
      }
      return 0;
    });
  }, [allOrders, sortKey, sortDir, sortMode]);

  const [colFilters, setColFilters] = useState({
    ref_number: '', customer_name: '', city: '', phone: '', status: '', courier: '', tracking_number: '', notes: ''
  })
  const debouncedColFilters = useDebounce(colFilters, 500)

  /**
   * Main data fetching function for SearchTool.
   * Fetches orders from the backend with current filters, keyword, pagination, and sorting.
   * Supports overrides for immediate clears/resets.
   */
  const fetchOrders = useCallback(async (options = {}) => {
    if (!activeStoreId) return;

    const wasProgrammatic = options.wasProgrammatic || false;
    const isRefresh = options.isRefresh || false;
    
    // Choose source of values (accept override parameters for immediate/clear runs)
    const presetVal = options.hasOwnProperty('preset') ? options.preset : preset;
    const statusVal = options.hasOwnProperty('status') ? options.status : status;
    const customStartVal = options.hasOwnProperty('customStart') ? options.customStart : customStart;
    const customEndVal = options.hasOwnProperty('customEnd') ? options.customEnd : customEnd;
    const keywordVal = options.hasOwnProperty('keyword') ? options.keyword : keyword;
    const colFiltersVal = options.hasOwnProperty('colFilters') ? options.colFilters : colFilters;

    const queryStatus = statusVal === 'All Statuses' ? '' : statusVal;
    
    // In clear mode, force-use keywordVal directly (which is '') to avoid debounced state delay
    const currentKeyword = (wasProgrammatic || isClearingRef.current || options.clearKeyword) ? keywordVal : debouncedKeyword;
    const kw = currentKeyword ? currentKeyword.trim().replace(/^#/, '') : '';
    
    const dateRange = getDateRange(presetVal, customStartVal, customEndVal);
    const startDate = dateRange?.start ? formatYMD(dateRange.start) : '';
    const endDate = dateRange?.end ? formatYMD(dateRange.end) : '';

    const activeColFilters = (isClearingRef.current || options.clearColFilters) ? colFiltersVal : debouncedColFilters;
    const colFilterParams = Object.entries(activeColFilters)
      .filter(([_, v]) => v && v.trim())
      .map(([k, v]) => `&${k}=${encodeURIComponent(v.trim())}`)
      .join('');

    const backendSortMap = {
      'order_date': 'order_date',
      'cost': 'cost',
      'price': 'price',
      'customer_name': 'customer_name',
      'delivery_status': 'delivery_status'
    };
    const sCol = backendSortMap[sortKey] || 'created_timestamp';

    const urlWithoutTimestamp = `/api/orders?store_id=${activeStoreId}&limit=${limit}&page=${page}&status=${encodeURIComponent(queryStatus||'')}&search=${encodeURIComponent(kw)}&start_date=${startDate}&end_date=${endDate}&sort=${sCol}&sort_dir=${sortDir}${colFilterParams}`;

    if (!isRefresh && !wasProgrammatic && urlWithoutTimestamp === lastFetchedUrlRef.current) {
      console.log('📡 [SearchTool] Skipping redundant fetch for URL:', urlWithoutTimestamp);
      return;
    }

    lastFetchedUrlRef.current = urlWithoutTimestamp;
    setLoading(true);

    const url = `/api/orders?store_id=${activeStoreId}&limit=${limit}&page=${page}&status=${encodeURIComponent(queryStatus||'')}&search=${encodeURIComponent(kw)}&start_date=${startDate}&end_date=${endDate}&sort=${sCol}&sort_dir=${sortDir}${colFilterParams}&t=${Date.now()}`;

    console.log('📡 [SearchTool] fetchOrders executing query. isRefresh:', isRefresh, 'wasProgrammatic:', wasProgrammatic, 'keyword:', kw);
    
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      setAllOrders(data.orders || []);
      setTotalCount(data.total || 0);
      setDebugWhere(data.debugWhere || '');
      
      if (isClearingRef.current) {
        console.log('🧹 [SearchTool] Clear fetch complete. Resetting clear flags.');
        isClearingRef.current = false;
        isClearingStageRef.current = null;
      }
    } catch (err) {
      if (isClearingRef.current) {
        isClearingRef.current = false;
        isClearingStageRef.current = null;
      }
      console.error('❌ [SearchTool] fetchOrders failed:', err.message);
      addToast('Failed to load orders', 'error');
    } finally {
      setLoading(false);
    }
  }, [
    activeStoreId, status, debouncedKeyword, preset, customStart, customEnd, colFilters, debouncedColFilters,
    sortKey, sortDir, limit, page, setAllOrders, setTotalCount, setDebugWhere, setLoading, addToast, keyword
  ]);

  const runSearch = useCallback(() => {
    setPage(1);
    fetchOrders({ isRefresh: true, wasProgrammatic: true });
  }, [fetchOrders]);

  // ─── Route Persistence ───────────────────────────────────────────
  const { registerModule, unregisterModule, persistModuleState, getModuleState } = useRoutePersistence()
  const pendingScrollRestoreRef = useRef(null)
  const ignoreFilterChangesRef = useRef(true)

  const saveState = useCallback(() => {
    const scrollY = window.scrollY || 0
    const tableWrapper = document.querySelector('.table-wrapper')
    const scrollLeft = tableWrapper ? tableWrapper.scrollLeft : 0

    persistModuleState('CommandCenter', {
      preset,
      customStart,
      customEnd,
      status,
      keyword,
      colFilters,
      page,
      sort,
      sortKey,
      sortDir,
      sortMode,
      activeRowId,
      scrollY,
      scrollLeft
    })
  }, [persistModuleState, preset, customStart, customEnd, status, keyword, colFilters, page, sort, sortKey, sortDir, sortMode, activeRowId])

  const restoreState = useCallback(() => {
    // If location.state is present, we are performing a drill-down. Skip restoring CommandCenter's cached state.
    if (location.state && Object.keys(location.state).length > 0) {
      ignoreFilterChangesRef.current = false
      return
    }
    const state = getModuleState('CommandCenter')
    if (state) {
      if (state.preset !== undefined) setPreset(state.preset)
      if (state.customStart !== undefined) setCustomStart(state.customStart)
      if (state.customEnd !== undefined) setCustomEnd(state.customEnd)
      if (state.status !== undefined) setStatus(state.status)
      if (state.keyword !== undefined) setKeyword(state.keyword)
      if (state.colFilters !== undefined) setColFilters(state.colFilters)
      if (state.page !== undefined) setPage(state.page)
      if (state.sort !== undefined) setSort(state.sort)
      if (state.sortKey !== undefined) setSortKey(state.sortKey)
      if (state.sortDir !== undefined) setSortDir(state.sortDir)
      if (state.sortMode !== undefined) setSortMode(state.sortMode)
      if (state.activeRowId !== undefined) setActiveRowId(state.activeRowId)

      pendingScrollRestoreRef.current = {
        scrollY: state.scrollY || 0,
        scrollLeft: state.scrollLeft || 0
      }
    }
  }, [getModuleState, location.state])

  // Register callbacks on mount/state updates
  useEffect(() => {
    registerModule('CommandCenter', { saveState, restoreState })
    return () => unregisterModule('CommandCenter')
  }, [registerModule, unregisterModule, saveState, restoreState])

  // Hydrate state from cache exactly once on initial mount
  useEffect(() => {
    restoreState()
  }, [])

  // Auto-collapse sidebar on mount and restore on unmount
  useEffect(() => {
    const originalCollapsed = localStorage.getItem('sidebar_collapsed') === 'true'
    setSidebarCollapsed(true)
    return () => {
      setSidebarCollapsed(originalCollapsed)
    }
  }, [setSidebarCollapsed])

  // Restore scroll positions once data loading is complete and component is rendered
  useEffect(() => {
    if (!loading) {
      ignoreFilterChangesRef.current = false

      if (pendingScrollRestoreRef.current) {
        const { scrollY, scrollLeft } = pendingScrollRestoreRef.current
        const timer = setTimeout(() => {
          window.scrollTo(0, scrollY)
          const tableWrapper = document.querySelector('.table-wrapper')
          if (tableWrapper) {
            tableWrapper.scrollLeft = scrollLeft
          }
        }, 50)
        pendingScrollRestoreRef.current = null
        return () => clearTimeout(timer)
      }
    }
  }, [loading])

  // Reset page to 1 when filters change, but skip during initial cache restoration
  useEffect(() => {
    if (ignoreFilterChangesRef.current) return
    setPage(1)
  }, [debouncedKeyword, debouncedColFilters, status, preset, customStart, customEnd])
  const [compactMode, setCompactMode] = useState(() => localStorage.getItem('search_compact') === 'true')
  const [showKPIs, setShowKPIs] = useState(() => localStorage.getItem('search_show_kpis') !== 'false')
  const toggleKPIs = () => setShowKPIs(prev => {
    localStorage.setItem('search_show_kpis', !prev)
    return !prev
  })
  const [bookingId, setBookingId] = useState(null)
  const [statusUpdatingId, setStatusUpdatingId] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])

  const {
    editingOrder, setEditingOrder,
    editorLoading,
    isCityValid,
    fetchOrderDetails,
    customerHistoryPhone, setCustomerHistoryPhone,
    showWAQueue, setShowWAQueue,
    waQueueIndex, setWAQueueIndex,
    waQueueTemplate, setWAQueueTemplate,
    waTemplates,
    historyOrder, setHistoryOrder,
    showNameDialog, setShowNameDialog,
    nameSettings, setNameSettings,
    saveNameSettings,
    showColPicker, setShowColPicker,
    showSaveDialog, setShowSaveDialog,
    viewName, setViewName,
    isViewLocked, setIsViewLocked,
    showAgingConfig, setShowAgingConfig,
  } = useCommandCenterModals()

  const {
    bulkActionLoading,
    confirmDialog, setConfirmDialog,
    handleBulkUpdateStatus,
    handleBulkConfirm,
    handleBulkRevert,
    handleBulkSyncCourier,
    handleBulkSyncStatus,
    handleExportTracking,
    handleBulkBookPostEx,
    handleBulkBookInstaworld,
    handleBulkCancel,
    handleSelectAllMatching,
  } = useCommandCenterBulkActions({
    allOrders,
    setAllOrders,
    selectedIds,
    setSelectedIds,
    runSearch,
    preset,
    customStart,
    customEnd,
    status,
    keyword,
    colFilters,
    activeStoreId,
  })

  const handleConfirmOrder = async (orderId) => {
    const order = allOrders.find(o => o.id === orderId)
    if (order && (!order.cost || parseFloat(order.cost) <= 0)) {
      addToast('🛑 Zero Cost Block: Heal cost before confirming', 'error')
      return
    }
    const previousOrders = [...allOrders];
    setAllOrders(prev => prev.map(o => o.id === orderId ? { ...o, delivery_status: 'Confirmed' } : o))
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${apiUrl}/api/orders/${orderId}/confirm`, { method: 'POST' })
      if (res.ok) {
        addToast('✅ Order Confirmed!', 'success')
      } else {
        throw new Error('Server rejected confirmation')
      }
    } catch {
      setAllOrders(previousOrders)
      addToast('Network error / Failed to confirm order', 'error')
    }
  }

  const handleRevertConfirm = async (orderId) => {
    const previousOrders = [...allOrders];
    setAllOrders(prev => prev.map(o => o.id === orderId ? { ...o, delivery_status: 'Pending' } : o))
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${apiUrl}/api/orders/${orderId}/revert-confirm`, { method: 'POST' })
      if (res.ok) {
        addToast('↩️ Order reverted to Pending', 'info')
      } else {
        throw new Error('Server rejected revert')
      }
    } catch {
      setAllOrders(previousOrders)
      addToast('Network error / Failed to revert order', 'error')
    }
  }

  const handleUpdateNotes = async (orderId, notes) => {
    const previousOrders = [...allOrders];
    setAllOrders(prev => prev.map(o => o.id === orderId ? { ...o, notes } : o))
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${apiUrl}/api/orders/${orderId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes })
      })
      if (res.ok) {
        addToast('📝 Notes synced to Shopify', 'success')
      } else {
        throw new Error('Server rejected note sync')
      }
    } catch {
      setAllOrders(previousOrders)
      addToast('Sync error / Failed to update notes', 'error')
    }
  }

  const handleUpdateAddress = async (orderId, address) => {
    const previousOrders = [...allOrders];
    setAllOrders(prev => prev.map(o => o.id === orderId ? { ...o, address } : o))
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${apiUrl}/api/orders/${orderId}/address`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address })
      })
      if (res.ok) {
        addToast('🏠 Address synced to Shopify', 'success')
      } else {
        throw new Error('Server rejected address sync')
      }
    } catch {
      setAllOrders(previousOrders)
      addToast('Sync error / Failed to update address', 'error')
    }
  }

  const handleManualStatusChange = async (orderId, newStatus) => {
    if (!newStatus) return
    const previousOrders = [...allOrders];
    setAllOrders(prev => prev.map(o => o.id === orderId ? { ...o, delivery_status: newStatus } : o))
    setStatusUpdatingId(orderId)
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${apiUrl}/api/orders/${orderId}/erp-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ erp_status: newStatus })
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 409 && data.protected) {
          if (confirm(`${data.error}\n\nDo you want to FORCE this change? (Admin Only)`)) {
            const forceRes = await fetch(`${apiUrl}/api/orders/${orderId}/erp-status`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ erp_status: newStatus, force: true })
            })
            if (!forceRes.ok) throw new Error((await forceRes.json()).error)
            addToast('Status updated successfully (Forced)', 'success')
          } else {
            setAllOrders(previousOrders)
          }
        } else {
          throw new Error(data.error || 'Failed to update status')
        }
      } else {
        addToast(`ERP Status updated to ${newStatus}`, 'success')
      }
    } catch (err) {
      setAllOrders(previousOrders)
      addToast(err.message, 'error')
    } finally {
      setStatusUpdatingId(null)
    }
  }



  const handleCancelBooking = async (orderId) => {
    if (!confirm('🛑 Cancel this courier booking?')) return
    const previousOrders = [...allOrders];
    setAllOrders(prev => prev.map(o => o.id === orderId ? { ...o, tracking_number: null, delivery_status: 'Confirmed' } : o))
    setBookingId(orderId)
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${apiUrl}/api/orders/${orderId}/cancel-booking`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        addToast('✅ Booking Cancelled', 'info')
      } else {
        throw new Error(data.error || 'Courier rejected cancellation')
      }
    } catch (err) {
      setAllOrders(previousOrders)
      addToast(`❌ Cancel Failed: ${err.message}`, 'error')
    } finally {
      setBookingId(null)
    }
  }

  const handleForceResync = async (orderId) => {
    setBookingId(orderId)
    try {
      const token = localStorage.getItem('trace_token');
      const res = await fetch(`/api/orders/${orderId}/resync`, { 
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) {
        try {
          const orderRes = await fetch(`/api/orders/${orderId}/details`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (orderRes.ok) {
            const updatedOrder = await orderRes.json();
            setAllOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updatedOrder } : o));
          }
        } catch (fetchErr) {
          console.warn('Silent refetch failed, relying on SSE:', fetchErr.message);
        }
        addToast('✅ Order synced successfully from Shopify', 'success')
      } else {
        throw new Error(data.error || 'Failed to resync order')
      }
    } catch (err) {
      addToast(`❌ Resync Failed: ${err.message}`, 'error')
    } finally {
      setBookingId(null)
    }
  }

  const handleBookInstaworld = async (orderId, courier = 'TCS') => {
    const order = allOrders.find(o => o.id === orderId)
    if (order && (!order.cost || parseFloat(order.cost) <= 0)) {
      addToast('🛑 Zero Cost Block: Heal cost before booking', 'error')
      return
    }
    if (!confirm(`🌐 Book this order with ${courier}?`)) return
    const previousOrders = [...allOrders];
    setAllOrders(prev => prev.map(o => o.id === orderId ? { ...o, courier: courier, delivery_status: 'Booked' } : o))
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
        throw new Error(data.error || 'Booking rejected')
      }
    } catch (err) {
      setAllOrders(previousOrders)
      addToast(`❌ Booking Failed: ${err.message}`, 'error')
    } finally {
      setBookingId(null)
    }
  }

  const handleBookPostEx = async (orderId) => {
    const order = allOrders.find(o => o.id === orderId)
    if (order && (!order.cost || parseFloat(order.cost) <= 0)) {
      addToast('🛑 Zero Cost Block: Heal cost before booking', 'error')
      return
    }
    if (!confirm('🚀 Book this order with PostEx? This will generate a real tracking number.')) return
    const previousOrders = [...allOrders];
    setAllOrders(prev => prev.map(o => o.id === orderId ? { ...o, courier: 'PostEx', delivery_status: 'Booked' } : o))
    setBookingId(orderId)
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${apiUrl}/api/orders/${orderId}/book-postex`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        addToast(`✅ Booked! Tracking: ${data.tracking_number}`, 'success')
        setAllOrders(prev => prev.map(o => o.id === orderId ? { ...o, tracking_number: data.tracking_number, courier: 'PostEx', delivery_status: 'Booked' } : o))
      } else {
        throw new Error(data.error || 'Booking rejected')
      }
    } catch (err) {
      setAllOrders(previousOrders)
      addToast(`❌ Booking Failed: ${err.message}`, 'error')
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
    const waPhone = o.phone.replace(/\D/g,'').replace(/^0/,'92');

    if (waQueueTemplate === 'send_images') {
      addToast(`⏳ Sending product images to ${name}...`, 'info');
      fetch('/api/whatsapp/send-order-images', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('trace_token') || localStorage.getItem('token') || ''}`
        },
        body: JSON.stringify({ orderId: o.id, phone: o.phone })
      })
      .then(async (res) => {
        const data = await res.json();
        if (res.ok && data.success) {
          addToast(`✅ Images sent to ${name}! (Sent ${data.sentCount} items)`, 'success');
        } else {
          addToast(`❌ Failed to send images to ${name}: ${data.error || 'Unknown error'}`, 'error');
        }
      })
      .catch((err) => {
        addToast(`❌ Failed to send images to ${name}: ${err.message || err}`, 'error');
      });
    } else {
      const template = waTemplates.find(t => t.id === parseInt(waQueueTemplate));
      let msg = "";
      
      if (template) {
        msg = template.content
          .replace(/\[Name\]/g, name)
          .replace(/\[OrderID\]/g, ref)
          .replace(/\[Price\]/g, price)
          .replace(/\[Courier\]/g, courier)
          .replace(/\[Tracking\]/g, tracking)
          .replace(/\[Address\]/g, o.address || 'N/A')
          .replace(/\[City\]/g, o.city || 'N/A')
          .replace(/\[Phone\]/g, o.phone || 'N/A')
          .replace(/\[Products\]/g, o.product_titles || 'N/A')
          .replace(/\[RefNumber\]/g, o.ref_number || 'N/A')
          .replace(/\[ItemsCount\]/g, o.items_count || '0');
        
        // Auto-Link if confirmation token exists
        if (o.confirmation_token) {
          const appUrl = window.location.origin;
          const link = `${appUrl}/api/public/confirm-order/${o.confirmation_token}`;
          msg = msg.replace(/\[Link\]/g, link);
        } else {
          msg = msg.replace(/\[Link\]/g, '(Confirm on call)');
        }
      }

      let imageUrls = [];
      try {
        const items = JSON.parse(o.line_items || '[]');
        imageUrls = items.map(i => i.image_url).filter(Boolean);
      } catch (e) {}

      const waBase = useWaWeb ? 'https://web.whatsapp.com/send' : 'whatsapp://send';
      let waLink = `${waBase}?phone=${waPhone}&text=${encodeURIComponent(msg)}`;
      if (imageUrls.length > 0) {
        waLink += `&autoImage=${encodeURIComponent(imageUrls.join(','))}`;
      }
      window.open(waLink, '_blank');

      if (useLocalHelper && imageUrls.length > 0) {
        setTimeout(async () => {
          try {
            await fetch('http://127.0.0.1:9099/paste-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ imageUrls })
            });
          } catch (err) {
            console.warn('Local helper not running:', err.message);
          }
        }, 1500);
      }
    }

    if (waQueueIndex < selectedIds.length - 1) {
      setWAQueueIndex(prev => prev + 1);
    } else {
      addToast('🎉 WhatsApp Queue Complete!', 'success');
      setShowWAQueue(false);
      setSelectedIds([]);
    }
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
  const [useLocalHelper, setUseLocalHelper] = useState(() => {
    return localStorage.getItem('trace_use_local_helper') === 'true';
  })
  const [useWaWeb, setUseWaWeb] = useState(() => {
    return localStorage.getItem('trace_use_wa_web') === 'true';
  })


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
  const [showAgingBar, setShowAgingBar] = useState(() => localStorage.getItem('trace_show_aging') !== 'false')

  const toggleAgingBar = () => {
    setShowAgingBar(prev => {
      localStorage.setItem('trace_show_aging', !prev)
      return !prev
    })
  }

  /**
   * Resets all search filters in the Command Center.
   * Clears custom dates, sets date preset to 'All Time', resets delivery status,
   * empties column-specific search inputs, and resets selected aging backlog buckets.
   * This provides a clean slate before executing search transitions.
   */
  const clearAllFilters = useCallback(() => {
    setPreset('All Time');
    setStatus('All Statuses');
    setCustomStart('');
    setCustomEnd('');
    setColFilters({
      ref_number: '', customer_name: '', city: '', phone: '', status: '', courier: '', tracking_number: '', notes: ''
    });
    setActiveAgingBucket(null);
  }, []);

  /**
   * Clears all filters and search keyword immediately, and triggers
   * a direct, immediate API call with default unfiltered parameters.
   */
  const handleClear = useCallback(() => {
    console.log('🧹 [SearchTool] handleClear execution started.');
    
    // Clear all filters state immediately
    setPreset('All Time');
    setStatus('All Statuses');
    setCustomStart('');
    setCustomEnd('');
    const emptyColFilters = {
      ref_number: '', customer_name: '', city: '', phone: '', status: '', courier: '', tracking_number: '', notes: ''
    };
    setColFilters(emptyColFilters);
    setActiveAgingBucket(null);
    setKeyword('');
    setPage(1);

    addToast('Filters cleared', 'info');

    // Trigger direct, immediate API call with cleared filters bypassing React state updates delay
    fetchOrders({
      preset: 'All Time',
      status: 'All Statuses',
      customStart: '',
      customEnd: '',
      keyword: '',
      colFilters: emptyColFilters,
      isRefresh: true,
      wasProgrammatic: true,
      clearKeyword: true,
      clearColFilters: true
    });
  }, [fetchOrders, addToast]);

  /**
   * Triggers a programmatic search for a customer's orders using their phone or email.
   * To ensure the search input is properly synchronized and React receives the update
   * as an active input event, this function:
   * 1. Programmatically focuses the search input via `searchInputRef`.
   * 2. Sets the input value using the browser's native HTMLInputElement prototype setter,
   *    bypassing React's virtual DOM interceptor.
   * 3. Dispatches a native 'input' event to trigger React's internal `onChange` handler.
   * 4. Updates the page to 1, sets the programmatic search flag, and triggers an imperative search.
   *
   * @param {string} newKeyword - Customer search keyword (phone number or email).
   */
  const triggerCustomerOrdersSearch = useCallback((newKeyword) => {
    setLoading(true);
    clearAllFilters();
    isCustomerSearchRef.current = true;
    
    const inputEl = searchInputRef.current;
    if (inputEl) {
      inputEl.focus();
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      nativeInputValueSetter.call(inputEl, newKeyword);
      const event = new Event('input', { bubbles: true });
      inputEl.dispatchEvent(event);
    } else {
      setKeyword(newKeyword);
    }
    console.log('📡 [SearchTool] Imperatively triggering search for customer keyword:', newKeyword);
    
    const emptyColFilters = {
      ref_number: '', customer_name: '', city: '', phone: '', status: '', courier: '', tracking_number: '', notes: ''
    };
    
    setPage(1);
    fetchOrders({
      preset: 'All Time',
      status: 'All Statuses',
      customStart: '',
      customEnd: '',
      keyword: newKeyword,
      colFilters: emptyColFilters,
      isRefresh: true,
      wasProgrammatic: true,
      clearKeyword: false,
      clearColFilters: true
    });

    setTimeout(() => {
      isCustomerSearchRef.current = false;
      console.log('📡 [SearchTool] Resetting isCustomerSearchRef after stabilization');
    }, 600);
  }, [clearAllFilters, fetchOrders]);

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

  const agingCounts = useMemo(() => {
    const counts = {}
    const todayVal = new Date(); todayVal.setHours(0,0,0,0)
    allOrders.forEach(o => {
      if (!o.order_date || !isBacklogOrder(o)) return
      
      const d = new Date(o.order_date); d.setHours(0,0,0,0)
      const diff = Math.floor((todayVal - d) / 86400000)
      const b = agingBuckets.find(bucket => diff >= bucket.min && diff <= bucket.max)
      if (b) counts[b.label] = (counts[b.label] || 0) + 1
    })
    return counts
  }, [allOrders, agingBuckets])

  // ─── Drag & Drop Columns ─────────────────
  const DEFAULT_COLS = [
    { id: 'ref_number', label: 'Ref #' },
    { id: 'order_date', label: 'Date' },
    { id: 'customer_name', label: 'Customer' },
    { id: 'customer_history', label: 'History' },
    { id: 'phone', label: 'Phone' },
    { id: 'address', label: 'Shipping Address' },
    { id: 'city', label: 'City' },
    { id: 'items', label: 'Line Items' },
    { id: 'tracking_number', label: 'Tracking #' },
    { id: 'courier', label: 'Courier' },
    { id: 'courier_status', label: 'Courier Status' },
    { id: 'delivery_status', label: 'ERP Status' },
    { id: 'wa_erp_status', label: '📱 COD Status' },
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
    const essentials = ['delivery_status', 'courier_status', 'edit', 'tracking_number', 'profit', 'paid_amount', 'address', 'customer_history', 'wa_erp_status']
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

  // ─── Live WA ERP Status Polling (every 5 seconds) ─────────────────────────
  // Batch-fetches wa_erp_status for all visible orders from the backend and
  // merges the results into allOrders state so the badge updates in real-time
  // without requiring a full page reload.
  useEffect(() => {
    const pollWAStatuses = async () => {
      if (!allOrders || allOrders.length === 0) return;
      try {
        const ids = allOrders.map(o => o.id).join(',');
        const token = localStorage.getItem('trace_token');
        const res = await fetch(`/api/whatsapp/poll-statuses?order_ids=${ids}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        const statuses = data.statuses || {};
        if (Object.keys(statuses).length === 0) return;
        setAllOrders(prev => prev.map(o => {
          const newStatus = statuses[o.id];
          // Only trigger re-render if the status actually changed
          if (newStatus !== undefined && (newStatus !== o.wa_erp_status || newStatus !== o.wa_status)) {
            return { ...o, wa_erp_status: newStatus, wa_status: newStatus };
          }
          return o;
        }));
      } catch (e) {
        // Silently ignore polling errors — do not disrupt the UI
      }
    };

    const intervalId = setInterval(pollWAStatuses, 5000);
    return () => clearInterval(intervalId);
  }, [allOrders.length, activeStoreId]);
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
      isProgrammaticRef.current = true
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

  const fetchViews = async () => {
    if (!activeStoreId) return
    try {
      const res = await fetch(`/api/stores/${activeStoreId}/views`)
      const data = await res.json()
      setSavedViews(data)
    } catch (e) { console.error('Failed to fetch views', e) }
  }

  useEffect(() => { fetchViews() }, [activeStoreId])

  // KPIs (defined below via useMemo)

  /**
   * Main side-effect hook to fetch orders from the database.
   * Handles local versus server-side sorting modes, cancels past requests with AbortController,
   * dynamically debounces execution by 300ms if isProgrammaticRef.current is true,
   * and skips redundant queries if the compiled request URL parameters haven't changed.
   *
   * @why Bypasses the 400ms debounce during programmatic triggers to fetch instantly,
   *      and implements a URL cache guard to prevent duplicate calls when debounce catches up.
   * @how Compiles the keyword dynamically (bypassing debounce if programmatic) and builds a timestamp-free
   *      URL query string. Skips the fetch if the query parameters match the last successful request.
   */
  useEffect(() => {
    if (!activeStoreId) return;

    // Skip trigger if clear sequence is pending
    if (isClearingStageRef.current === 'pending') {
      console.log('📡 [SearchTool] useEffect skipped: clear sequence is pending');
      return;
    }

    // Skip trigger if programmatic customer search is in progress
    if (isCustomerSearchRef.current) {
      console.log('📡 [SearchTool] useEffect skipped: programmatic customer search is in progress');
      return;
    }

    // Prevent Redundant Fetch during active clear operation
    const isClearingFetch = isClearingStageRef.current === 'fetch';
    if (isClearingRef.current && !isClearingFetch) {
      console.log('📡 [SearchTool] useEffect skipped: clear operation is active');
      return;
    }

    if (isClearingFetch) {
      isClearingStageRef.current = 'fetching';
    }

    // Hybrid Logic: Detect if ONLY sort changed
    const searchConfig = JSON.stringify({ activeStoreId, status, debouncedKeyword, preset, customStart, customEnd, page, debouncedColFilters });
    const isSortOnlyChange = lastSearchRef.current === searchConfig;
    lastSearchRef.current = searchConfig;

    if (sortMode === 'instant' && isSortOnlyChange) {
      return; // Skip server fetch, useMemo will handle local re-sort
    }

    let fetchTimeoutId;
    if (isClearingFetch) {
      fetchOrders({ wasProgrammatic: true });
    } else if (isProgrammaticRef.current) {
      fetchTimeoutId = setTimeout(() => {
        isProgrammaticRef.current = false;
        fetchOrders({ wasProgrammatic: true });
      }, 300);
    } else {
      fetchOrders({ wasProgrammatic: false });
    }

    return () => {
      if (fetchTimeoutId) clearTimeout(fetchTimeoutId);
    };
  }, [
    activeStoreId, status, debouncedKeyword, preset, customStart, customEnd, page, debouncedColFilters,
    sortMode, refreshTrigger, fetchOrders
  ]);

  // Live Updates Connection (SSE)
  useEffect(() => {
    if (!activeStoreId) return;
    
    const token = localStorage.getItem('trace_token');
    if (!token) return;

    const source = new EventSource(`/api/live?token=${token}`);
    
    let pendingUpdates = [];
    let flushTimeout = null;

    source.addEventListener('order_updated', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (String(data.storeId) === String(activeStoreId)) {
          pendingUpdates.push(data.shopifyOrderId);
          
          if (!flushTimeout) {
            flushTimeout = setTimeout(async () => {
              const idsToFetch = [...new Set(pendingUpdates)];
              pendingUpdates = [];
              flushTimeout = null;
              
              if (idsToFetch.length > 3) {
                // If there are many updates, just reload the page in a single query
                setRefreshTrigger(prev => prev + 1);
                console.log(`[Live UI] Batch updated ${idsToFetch.length} orders by refreshing page.`);
              } else {
                // Otherwise fetch silently
                const fetchedOrders = [];
                await Promise.all(idsToFetch.map(async (shopifyOrderId) => {
                  try {
                    const res = await fetch(`/api/orders/by-shopify/${shopifyOrderId}`, {
                      headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (res.ok) {
                      const updatedOrder = await res.json();
                      if (updatedOrder && updatedOrder.id) {
                        fetchedOrders.push(updatedOrder);
                      }
                    }
                  } catch (err) {
                    console.error('Failed to fetch silent order update', err);
                  }
                }));

                if (fetchedOrders.length > 0) {
                  setAllOrders(prev => {
                    const newOrders = [...prev];
                    fetchedOrders.forEach(updatedOrder => {
                      const idx = newOrders.findIndex(o => String(o.shopify_order_id) === String(updatedOrder.shopify_order_id));
                      if (idx > -1) {
                        newOrders[idx] = updatedOrder;
                      } else {
                        newOrders.unshift(updatedOrder);
                      }
                    });
                    return newOrders;
                  });
                  console.log(`[Live UI] Silently updated ${fetchedOrders.length} orders: ${fetchedOrders.map(o => o.shopify_order_id).join(', ')}`);
                }
              }
            }, 2000); // 2-second buffer window
          }
        }
      } catch (err) { console.error('Live update failed', err) }
    });

    source.addEventListener('sync_progress', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (String(data.storeId) === String(activeStoreId)) {
          // Normalize both old format {current/total/message} and new format {processed/total/status}
          const normalized = {
            current: data.current ?? data.processed ?? 0,
            total: data.total ?? 0,
            message: data.message || data.status || 'Processing Orders...'
          };
          setSyncProgress(normalized);
          if (normalized.current >= normalized.total && normalized.total > 0) {
            setTimeout(() => setSyncProgress(null), 3000);
          }
        }
      } catch (err) { console.error('Sync progress parse failed', err) }
    });

    return () => {
      source.close();
      if (flushTimeout) clearTimeout(flushTimeout);
    };
  }, [activeStoreId]);

  const filteredOrders = useMemo(() => {
    let result = [...displayedOrders];

    // Filter by Aging Bucket if one is selected
    if (activeAgingBucket) {
      const bucket = agingBuckets.find(b => b.label === activeAgingBucket);
      if (bucket) {
        const todayVal = new Date(); todayVal.setHours(0,0,0,0);
        result = result.filter(o => {
          if (!o.order_date || !isBacklogOrder(o)) return false;
          const d = new Date(o.order_date); d.setHours(0,0,0,0);
          const diff = Math.floor((todayVal - d) / 86400000);
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
  }, [displayedOrders, debouncedKeyword, activeAgingBucket, agingBuckets]);

  const kpi = useMemo(() => {
    let delivered=0, returned=0, pending=0, sum=0
    filteredOrders.forEach(o => {
      const s = (o.delivery_status||'').toLowerCase()
      sum += parseFloat(o.price)||0
      if (s.includes('delivered')) delivered++
      else if (s.includes('return')||s.includes('cancel')) returned++
      else pending++
    })
    return { total: totalCount, sum, delivered, returned, pending }
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
    const previousOrders = [...allOrders];
    const isMulti = typeof field === 'object' && field !== null;
    const payload = isMulti ? field : { [field]: value };
    
    setAllOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...payload } : o));
    try {
      console.log('📦 [updateOrderField] Sending payload:', payload, '→ PUT /api/orders/' + orderId);
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.order) {
        setAllOrders(prev => prev.map(o => o.id === orderId ? data.order : o));
        addToast('✅ Saved', 'success');
        return data.order;
      } else if (!res.ok) {
        throw new Error(data.error || 'Server error');
      }
    } catch (err) {
      setAllOrders(previousOrders);
      addToast(`❌ Failed to save: ${err.message}`, 'error');
    }
  };




  const deliveryRate = kpi.total > 0 ? ((kpi.delivered / kpi.total) * 100).toFixed(1) : 0
  return (
    <div className={compactMode ? 'ultra-compact' : ''}>
      <ApiStatusBanner />

      {/* Main Page Header + Filters */}
      {!isFocusMode && (
        <div className="sticky-controls">
          <CommandCenterHeader compactMode={compactMode} />

          <CommandCenterFilters
            preset={preset} setPreset={setPreset}
            customStart={customStart} setCustomStart={setCustomStart}
            customEnd={customEnd} setCustomEnd={setCustomEnd}
            status={status} setStatus={setStatus}
            keyword={keyword} setKeyword={setKeyword}
            searchInputRef={searchInputRef}
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
            sortMode={sortMode}
            setSortMode={setSortMode}
            showKPIs={showKPIs}
            toggleKPIs={toggleKPIs}
            onClear={handleClear}
            useWaWeb={useWaWeb}
            setUseWaWeb={setUseWaWeb}
          />
        </div>
      )}

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
        handleBulkCancel={handleBulkCancel}
        handleBulkWhatsApp={handleStartWAQueue}
        handleExportTracking={handleExportTracking}
        totalMatching={totalCount}
        handleSelectAllMatching={handleSelectAllMatching}
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
                <option value="send_images">🖼️ Send Product Images</option>
                {waTemplates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                  <input 
                    type="checkbox" 
                    id="useLocalHelper" 
                    checked={useLocalHelper} 
                    onChange={(e) => {
                      setUseLocalHelper(e.target.checked);
                      localStorage.setItem('trace_use_local_helper', e.target.checked);
                    }} 
                    style={{ width: '14px', height: '14px', cursor: 'pointer' }}
                  />
                  <label htmlFor="useLocalHelper" style={{ fontSize: '0.75rem', opacity: 0.8, cursor: 'pointer', userSelect: 'none' }}>
                    🔌 Use Local Helper (For Desktop App auto-paste)
                  </label>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                  <input 
                    type="checkbox" 
                    id="useWaWeb" 
                    checked={useWaWeb} 
                    onChange={(e) => {
                      setUseWaWeb(e.target.checked);
                      localStorage.setItem('trace_use_wa_web', e.target.checked);
                    }} 
                    style={{ width: '14px', height: '14px', cursor: 'pointer' }}
                  />
                  <label htmlFor="useWaWeb" style={{ fontSize: '0.75rem', opacity: 0.8, cursor: 'pointer', userSelect: 'none' }}>
                    🌐 Use WhatsApp Web (Chrome Extension mode)
                  </label>
                </div>
              </div>
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

      <CommandTable
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
        statusUpdatingId={statusUpdatingId}
        handleConfirmOrder={handleConfirmOrder}
        handleRevertConfirm={handleRevertConfirm}
        handleBookPostEx={handleBookPostEx}
        handleCancelBooking={handleCancelBooking}
        onForceResync={handleForceResync}
        handleBookInstaworld={handleBookInstaworld}
        handleManualStatusChange={handleManualStatusChange}
        updateOrderField={updateOrderField}
        setCustomerHistoryPhone={setCustomerHistoryPhone}
        setShowNameDialog={setShowNameDialog}
        setKeyword={setKeyword}
        setStatus={setStatus}
        page={page}
        setPage={setPage}
        limit={limit}
        setLimit={setLimit}
        onViewHistory={(o) => setHistoryOrder(o)}
        clearAllFilters={handleClear}
        activeRowId={activeRowId}
        setActiveRowId={setActiveRowId}
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
        <ErrorBoundary>
          <CustomerHistoryModal
            phone={customerHistoryPhone.phone}
            email={customerHistoryPhone.email}
            name={customerHistoryPhone.name}
            onClose={() => setCustomerHistoryPhone(null)}
            onOpenAllOrders={triggerCustomerOrdersSearch}
          />
        </ErrorBoundary>
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
      {/* Premium Confirm Modal */}
      {confirmDialog.isOpen && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel" style={{ width: '450px', textAlign: 'center', padding: '30px' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '15px' }}>⚡</div>
            <h3 className="premium-title">{confirmDialog.title}</h3>
            <p className="premium-subtitle">{confirmDialog.message}</p>
            
            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                className="btn btn-secondary" 
                style={{ flex: 1, padding: '12px 20px', fontWeight: 600, borderRadius: '8px', fontSize: '0.85rem', justifyContent: 'center' }}
                onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                disabled={bulkActionLoading}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                style={{ flex: 1, padding: '12px 20px', fontWeight: 600, borderRadius: '8px', fontSize: '0.85rem', justifyContent: 'center' }}
                onClick={confirmDialog.onConfirm}
                disabled={bulkActionLoading}
              >
                {bulkActionLoading ? '⌛ Processing...' : 'Confirm Action'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

