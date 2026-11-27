import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import LinkSkuModal from '../components/LinkSkuModal'
import GhostSkuGuide from '../components/GhostSkuGuide'
import CommittedOrdersModal from '../components/CommittedOrdersModal'

const isGhostMatch = (ghost, searchQuery) => {
  if (!searchQuery || !searchQuery.trim()) return true;
  const q = searchQuery.trim().toLowerCase();
  const name = (ghost.name || '').toLowerCase();

  // 1. Direct bidirectional inclusion on parent name
  if (name.includes(q) || q.includes(name)) return true;

  // 2. Check variants (supports both object map and array)
  const variantNames = Array.isArray(ghost.variants)
    ? ghost.variants.map(v => `${v.name || v.variant_title || ''} ${v.sku || ''}`)
    : (ghost.variants && typeof ghost.variants === 'object' ? Object.keys(ghost.variants) : []);

  for (const v of variantNames) {
    const fullVariantStr = `${name} ${v}`.toLowerCase();
    if (fullVariantStr.includes(q) || q.includes(fullVariantStr) || v.toLowerCase().includes(q)) return true;
  }

  // 3. Token-based matching
  const tokens = q.replace(/[()\/]/g, ' ').split(/\s+/).filter(Boolean);
  if (tokens.length > 0) {
    const nameAndVariants = `${name} ${variantNames.join(' ')}`.toLowerCase();
    if (tokens.every(token => nameAndVariants.includes(token))) return true;
  }

  return false;
};

const matchesVariantSearch = (v, parentName, searchQuery) => {
  if (!searchQuery || !searchQuery.trim()) return false;
  const q = searchQuery.trim().toLowerCase();
  const vTitle = (v.variant_title || v.name || '').toLowerCase();
  const sku = (v.sku || '').toLowerCase();
  const varId = String(v.shopify_variant_id || '').toLowerCase();
  const landed = (v.unit_cost || 0) + (v.packaging_cost || 0);
  const prices = `${v.shopify_cost || ''} ${v.unit_cost || ''} ${landed || ''} ${v.selling_price || ''}`;
  const fullStr = `${(parentName || '').toLowerCase()} ${vTitle} ${sku} ${varId} ${prices}`;

  if (vTitle.includes(q) || (sku && sku.includes(q)) || (varId && varId.includes(q))) return true;
  if (/^\d+(\.\d+)?$/.test(q)) {
    const num = Number(q);
    if (v.shopify_cost === num || v.unit_cost === num || landed === num || v.selling_price === num) return true;
  }
  const tokens = q.replace(/[()\/]/g, ' ').split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    // Only consider variant-specific match if at least one token matches variant title, sku, or price (not parent alone)
    const variantOnly = `${vTitle} ${sku} ${varId} ${prices}`;
    if (tokens.every(t => fullStr.includes(t)) && tokens.some(t => variantOnly.includes(t))) return true;
  }
  return false;
};

const matchesProductSearch = (product, searchQuery) => {
  if (!searchQuery || !searchQuery.trim()) return true;
  const q = searchQuery.trim().toLowerCase();
  const name = (product.name || '').toLowerCase();

  // 1. Direct bidirectional inclusion on parent name
  if (name.includes(q) || q.includes(name)) return true;

  // 2. Check variants inside product (title, SKU, variant ID, costs/prices)
  if (product.variants && Array.isArray(product.variants)) {
    for (const v of product.variants) {
      if (matchesVariantSearch(v, product.name, q)) return true;
      const vTitle = (v.variant_title || v.name || '').toLowerCase();
      const fullStr = `${name} ${vTitle}`;
      if (fullStr.includes(q) || q.includes(fullStr)) return true;
    }
  }

  // 3. Token-based matching across parent + all variants + SKUs + costs
  const tokens = q.replace(/[()\/]/g, ' ').split(/\s+/).filter(Boolean);
  if (tokens.length > 0) {
    const fullText = `${name} ${product.variants ? product.variants.map(v => `${v.variant_title || v.name || ''} ${v.sku || ''} ${v.shopify_variant_id || ''} ${v.shopify_cost || ''} ${v.unit_cost || ''}`).join(' ') : ''}`.toLowerCase();
    if (tokens.every(token => fullText.includes(token))) return true;
  }

  return false;
};

const matchesWatchdogRow = (row, searchQuery) => {
  if (!searchQuery || !searchQuery.trim()) return true;
  const q = searchQuery.trim().toLowerCase();
  const haystack = `${row.parent_title || ''} ${row.variant_title || ''} ${row.title || ''} ${row.sku || ''} ${row.order_number || ''} ${row.order_name || ''} ${row.customer_name || ''} ${row.shopify_variant_id || ''} ${row.shopify_cost ?? ''} ${row.unit_cost ?? ''}`.toLowerCase();
  if (haystack.includes(q)) return true;
  const tokens = q.replace(/[()\/]/g, ' ').split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.every(t => haystack.includes(t));
};

const matchesAliasRow = (a, searchQuery) => {
  if (!searchQuery || !searchQuery.trim()) return true;
  const q = searchQuery.trim().toLowerCase();
  const haystack = `${a.alias_title || ''} ${a.alias_variant || ''} ${a.target_sku || ''} ${a.target_parent_title || ''} ${a.target_variant_title || ''}`.toLowerCase();
  if (haystack.includes(q)) return true;
  const tokens = q.replace(/[()\/]/g, ' ').split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.every(t => haystack.includes(t));
};

export default function CostManager() {
  const { activeStoreId, token, addToast } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const [costs, setCosts] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [loadingGhosts, setLoadingGhosts] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState('')
  const [syncWarning, setSyncWarning] = useState('')
  const [isDiagnosing, setIsDiagnosing] = useState(false)
  const [diagnoseReport, setDiagnoseReport] = useState(null)
  const [lastCostSyncedAt, setLastCostSyncedAt] = useState(null)
  const [activeTab, setActiveTab] = useState('watchdog')
  const [selectedParents, setSelectedParents] = useState(new Set())
  const [selectedVariants, setSelectedVariants] = useState(new Set())
  const [bulkProcessing, setBulkProcessing] = useState(false)
  const [expandedParents, setExpandedParents] = useState(new Set())
  const [committedModal, setCommittedModal] = useState({ open: false, loading: false, data: null })
  const openCommittedModal = useCallback(async (productCostIds, titleLabel = '') => {
    const cleanIds = [...new Set((productCostIds || []).map(Number).filter(Boolean))]
    if (cleanIds.length === 0) return
    setCommittedModal({ open: true, loading: true, data: { title: titleLabel, orders: [] } })
    try {
      const params = new URLSearchParams()
      if (activeStoreId) params.set('store_id', activeStoreId)
      params.set('product_cost_ids', cleanIds.join(','))
      const res = await fetch(`/api/po-ledger/inventory/committed-orders?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          ...(activeStoreId ? { 'x-active-store-id': String(activeStoreId) } : {}),
        },
      })
      const j = await res.json()
      if (j.success) {
        setCommittedModal({ open: true, loading: false, data: { ...j.data, title: titleLabel || j.data?.title } })
      } else {
        addToast(j.error || 'Failed to load committed orders', 'error')
        setCommittedModal({ open: false, loading: false, data: null })
      }
    } catch (_) {
      addToast('Failed to fetch committed orders', 'error')
      setCommittedModal({ open: false, loading: false, data: null })
    }
  }, [activeStoreId, token, addToast])
  const [lastSelectedParentIndex, setLastSelectedParentIndex] = useState(null)
  const [lastSelectedGhostIndex, setLastSelectedGhostIndex] = useState(null)
  
  // Watchdog & Prevention States
  const [loadingAudit, setLoadingAudit] = useState(false)
  const [auditData, setAuditData] = useState({
    missingInRegistry: [],
    zeroCostInRegistry: [],
    pendingOrdersWithMissingCost: []
  })
  const [auditFilter, setAuditFilter] = useState('all')
  const [expandedWatchdogGroups, setExpandedWatchdogGroups] = useState(new Set())
  const toggleWatchdogGroup = useCallback((groupKey) => {
    setExpandedWatchdogGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupKey)) next.delete(groupKey)
      else next.add(groupKey)
      return next
    })
  }, [])
  
  // Modal States
  const [showModal, setShowModal] = useState(false)
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [bulkItem, setBulkItem] = useState(null)
  const [form, setForm] = useState({ parent_title: '', variant_title: '', unit_cost: 0, packaging_cost: 0 })
  const [bulkForm, setBulkForm] = useState({ unit_cost: 0, packaging_cost: 0 })

  // Ghost Listing States
  const [ghosts, setGhosts] = useState([])
  const [showGhostModal, setShowGhostModal] = useState(false)
  const [inspectingGhost, setInspectingGhost] = useState(null)
  const [ghostOrders, setGhostOrders] = useState([])
  const [loadingGhostOrders, setLoadingGhostOrders] = useState(false)
  const [ghostCosts, setGhostCosts] = useState({})
  const [ghostSearch, setGhostSearch] = useState('')
  const [selectedGhosts, setSelectedGhosts] = useState(new Set())

  // Alias States
  const [aliases, setAliases] = useState([])
  const [loadingAliases, setLoadingAliases] = useState(false)
  const [aliasSearch, setAliasSearch] = useState('')
  const [linkingGhost, setLinkingGhost] = useState(null)

  // UI Enhancement States
  const searchInputRef = useRef(null)
  const [sortBy, setSortBy] = useState('value')       // 'value' | 'margin' | 'stock' | 'name' | 'pending'
  const [filterStatus, setFilterStatus] = useState('all') // 'all' | 'active' | 'draft' | 'unlisted' | 'archived'
  const [filterMargin, setFilterMargin] = useState('all') // 'all' | 'low' | 'mid' | 'high'
  const [filterMissingSku, setFilterMissingSku] = useState(false)
  const [filterPartialOnly, setFilterPartialOnly] = useState(false)
  const [filterStock, setFilterStock] = useState('all') // 'all' | 'in_stock' | 'out_of_stock'
  const [filterZeroCost, setFilterZeroCost] = useState(false)
  const [inlineEdits, setInlineEdits] = useState({})  // { variantId: { unit_cost, packaging_cost } }
  const [savingInline, setSavingInline] = useState(null)
  const [skuSubTab, setSkuSubTab] = useState('duplicates')
  const [groupVariantsBy, setGroupVariantsBy] = useState('none') // 'none' | 'opt1' | 'opt2'
  const [expandedGroups, setExpandedGroups] = useState(new Set())

  // Global keyboard shortcuts: '/' or Cmd/Ctrl+K focuses search, Esc clears
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase()
      const isEditable = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      } else if (e.key === '/' && !isEditable) {
        e.preventDefault()
        searchInputRef.current?.focus()
      } else if (e.key === 'Escape' && document.activeElement === searchInputRef.current) {
        if (search) {
          setSearch('')
          setGhostSearch('')
          setAliasSearch('')
        } else {
          searchInputRef.current?.blur()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [search])

  const formatRelativeTime = (ts) => {
    if (!ts) return 'Auto-Active'
    try {
      const dateStr = ts.includes('T') ? ts : ts.replace(' ', 'T')
      const date = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z')
      const diffSec = Math.floor((Date.now() - date.getTime()) / 1000)
      if (isNaN(diffSec) || diffSec < 0) return 'Just now'
      if (diffSec < 60) return 'Just now'
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
      return `${Math.floor(diffSec / 86400)}d ago`
    } catch (_) {
      return 'Auto-Active'
    }
  }

  const fetchSyncStatus = useCallback(async () => {
    if (!activeStoreId) return
    try {
      const res = await fetch(`/api/cost-manager/sync-status?store_id=${activeStoreId}`)
      if (res.ok) {
        const data = await res.json()
        if (data.last_cost_sync_at) {
          setLastCostSyncedAt(data.last_cost_sync_at)
        }
      }
    } catch (_) {}
  }, [activeStoreId])

  useEffect(() => {
    if (activeStoreId) {
      fetchCosts()
      fetchGhosts()
      fetchAudit()
      fetchAliases()
      fetchSyncStatus()
    }
  }, [activeStoreId, fetchSyncStatus])

  // Live SSE listener for real-time Shopify cost updates & 30s status refresher
  useEffect(() => {
    const handleLiveCostUpdate = (e) => {
      const detail = e.detail
      if (!detail || !detail.storeId || String(detail.storeId) === String(activeStoreId)) {
        fetchCosts()
        fetchGhosts()
        fetchSyncStatus()
        fetchAudit()
        addToast('⚡ Live Shopify cost update synced automatically!', 'info')
      }
    }

    window.addEventListener('trace_cost_drift_updated', handleLiveCostUpdate)
    const interval = setInterval(fetchSyncStatus, 30000)

    return () => {
      window.removeEventListener('trace_cost_drift_updated', handleLiveCostUpdate)
      clearInterval(interval)
    }
  }, [activeStoreId, fetchSyncStatus])

  // Parse query parameters on mount & sync search queries across tabs
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const searchParam = params.get('search')
    const tabParam = params.get('tab')
    if (tabParam) {
      if (['active', 'draft', 'unlisted', 'archived'].includes(tabParam)) {
        setActiveTab('catalog')
        setFilterStatus(tabParam)
      } else {
        setActiveTab(tabParam)
      }
    }
    if (searchParam !== null && searchParam !== undefined) {
      setSearch(searchParam)
      setGhostSearch(searchParam)
    }
  }, [location.search])

  // Auto-expand matching parent products when search is active
  useEffect(() => {
    if (search.trim() && costs.length > 0) {
      const groupedNames = new Set()
      costs.forEach(c => {
        if (c.parent_title) {
          groupedNames.add(c.parent_title)
        }
      })
      const matchingNames = Array.from(groupedNames).filter(name => 
        name.toLowerCase().includes(search.toLowerCase())
      )
      if (matchingNames.length > 0) {
        setExpandedParents(new Set(matchingNames))
      }
    }
  }, [search, costs])

  const fetchAudit = async () => {
    setLoadingAudit(true)
    try {
      const res = await fetch(`/api/finance/prevention-audit?store_id=${activeStoreId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setAuditData({
          missingInRegistry: Array.isArray(data?.missingInRegistry) ? data.missingInRegistry : [],
          zeroCostInRegistry: Array.isArray(data?.zeroCostInRegistry) ? data.zeroCostInRegistry : [],
          pendingOrdersWithMissingCost: Array.isArray(data?.pendingOrdersWithMissingCost) ? data.pendingOrdersWithMissingCost : []
        })
      }
    } catch (e) {
      console.error('Failed to fetch prevention audit:', e)
    } finally {
      setLoadingAudit(false)
    }
  }

  const fetchCosts = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/finance/master-costs?store_id=${activeStoreId}`)
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data = await res.json()
      setCosts(Array.isArray(data) ? data : [])
      setSelectedVariants(new Set())
      fetchAudit()
      try { window.dispatchEvent(new CustomEvent('refresh-drift-count')) } catch (_) {}
    } catch (e) {
      setLoadError(e.message || 'Unknown error')
      addToast('Failed to load cost registry: ' + e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const fetchGhosts = async () => {
    setLoadingGhosts(true)
    try {
      const res = await fetch(`/api/finance/missing-product-list?store_id=${activeStoreId}`)
      const data = await res.json()
      setGhosts(Array.isArray(data) ? data : [])
    } catch (e) { console.error('Failed to fetch ghosts', e) }
    finally { setLoadingGhosts(false) }
  }

  const fetchAliases = async () => {
    setLoadingAliases(true)
    try {
      const res = await fetch(`/api/cost-manager/aliases?store_id=${activeStoreId}`)
      if (res.ok) {
        const data = await res.json()
        setAliases(Array.isArray(data) ? data : [])
      }
    } catch (e) {
      console.error('Failed to fetch aliases', e)
    } finally {
      setLoadingAliases(false)
    }
  }

  const handleDeleteAlias = async (id) => {
    if (!window.confirm('Are you sure you want to delete this alias?')) return
    try {
      const res = await fetch(`/api/cost-manager/aliases/${id}`, { method: 'DELETE' })
      if (res.ok) {
        addToast('Alias deleted & orders re-evaluated', 'info')
        fetchAliases()
        fetchGhosts()
        fetchCosts()
      }
    } catch (e) {
      addToast('Failed to delete alias: ' + e.message, 'error')
    }
  }

  // --- Derived Data ---
  const { totals, grouped } = useMemo(() => {
    const totals = {
      acceptedValue: 0,
      acceptedQty: 0,
      fifoUnits: 0,
      pendingValue: 0,
      uncostedSkus: 0,
      inStockSkus: 0,
      outOfStockSkus: 0,
      backorderSkus: 0,
      backorderUnits: 0,
      totalVariants: costs.length,
      totalMarginValue: 0,
      totalSellingValue: 0,
      atRiskCount: 0,
    }

    const grouped = {}
    costs.forEach(c => {
      if (!grouped[c.parent_title]) {
        grouped[c.parent_title] = {
          name: c.parent_title,
          variants: [],
          totalQty: 0,
          totalCommitted: 0,
          totalOnHand: 0,
          totalIncoming: 0,
          totalFifoQty: 0,
          inStockVariants: 0,
          outOfStockVariants: 0,
          backorderUnits: 0,
          totalValue: 0,
          totalSelling: 0,
          verifiedCount: 0,
          pendingCount: 0,
          activePoNumbers: new Set(),
          poBatchCount: 0,
          hasContinueSelling: false,
          uniqueCosts: new Set(),
          uniqueLanded: new Set(),
        }
      }
      const g = grouped[c.parent_title]
      g.variants.push(c)

      const qty = Number(c.inventory_qty) || 0
      const committed = Number(c.committed_qty) || 0
      const onHand = (c.on_hand_qty !== null && c.on_hand_qty !== undefined) ? Number(c.on_hand_qty) : (qty + committed)
      const incoming = Number(c.incoming_qty) || 0
      const posQty = Math.max(0, qty)
      const fifoRem = Number(c.fifo_remaining_qty) || 0
      g.totalQty += qty
      g.totalCommitted += committed
      g.totalOnHand += onHand
      g.totalIncoming += incoming
      g.totalFifoQty += fifoRem
      totals.fifoUnits += fifoRem

      if (qty > 0) {
        g.inStockVariants += 1
        totals.inStockSkus += 1
      } else if (qty < 0) {
        g.outOfStockVariants += 1
        g.backorderUnits += Math.abs(qty)
        totals.outOfStockSkus += 1
        totals.backorderSkus += 1
        totals.backorderUnits += Math.abs(qty)
      } else {
        g.outOfStockVariants += 1
        totals.outOfStockSkus += 1
      }

      if (c.active_po_number) g.activePoNumbers.add(c.active_po_number)
      if (c.fifo_batch_count) g.poBatchCount += Number(c.fifo_batch_count) || 0
      if (c.inventory_policy === 'continue') g.hasContinueSelling = true

      const landed = (c.unit_cost || 0) + (c.packaging_cost || 0)
      const selling = c.selling_price || 0
      if (landed > 0) {
        g.verifiedCount += 1
        g.uniqueLanded.add(landed)
        totals.acceptedValue += landed * posQty
        totals.acceptedQty += posQty
        if (selling > 0) {
          totals.totalMarginValue += (selling - landed) * posQty
          totals.totalSellingValue += selling * posQty
        }
      } else {
        g.pendingCount += 1
        totals.uncostedSkus += 1
        if (c.shopify_cost > 0) {
          totals.pendingValue += c.shopify_cost * posQty
        }
      }

      g.totalValue += landed * posQty
      g.totalSelling += selling * posQty
      if (landed > 0) g.hasCost = true

      // Track Price Drift
      if (c.unit_cost > 0 && c.shopify_cost > 0 && Math.abs(c.shopify_cost - c.unit_cost) >= 1) {
        g.hasDrift = true
      }

      g.uniqueCosts.add(c.shopify_cost || 0)
    })

    // Compute per-group margin, verification completeness, and at-risk
    Object.values(grouped).forEach(p => {
      p.totalVariants = p.variants.length
      p.isFullyVerified = p.totalVariants > 0 && p.verifiedCount === p.totalVariants
      p.isPartiallyVerified = p.verifiedCount > 0 && p.pendingCount > 0
      p.hasPending = p.pendingCount > 0
      p.poNumbersList = Array.from(p.activePoNumbers)

      if (p.totalSelling > 0 && p.totalValue > 0) {
        p.margin = Math.round(((p.totalSelling - p.totalValue) / p.totalSelling) * 100)
        if (p.margin < 20) totals.atRiskCount++
      } else {
        p.margin = null
      }
    })

    return { totals, grouped }
  }, [costs])

  const avgMargin = useMemo(() => {
    return totals.totalSellingValue > 0
      ? Math.round((totals.totalMarginValue / totals.totalSellingValue) * 100)
      : 0
  }, [totals])

  const ghostImpact = useMemo(() => {
    return ghosts.reduce((sum, g) => sum + (g.count * 500), 0) // rough estimate
  }, [ghosts])

  const hasActiveFilters = Boolean(
    search.trim() ||
    filterStatus !== 'all' ||
    filterMargin !== 'all' ||
    filterMissingSku ||
    filterPartialOnly ||
    filterStock !== 'all' ||
    filterZeroCost
  )

  const handleClearAllFilters = useCallback(() => {
    setSearch('')
    setGhostSearch('')
    setAliasSearch('')
    setFilterStatus('all')
    setFilterMargin('all')
    setFilterMissingSku(false)
    setFilterPartialOnly(false)
    setFilterStock('all')
    setFilterZeroCost(false)
  }, [])

  const allGrouped = useMemo(() => {
    return Object.values(grouped).filter(p => {
      if (!matchesProductSearch(p, search)) return false
      if (filterStatus !== 'all' && ((p.variants[0]?.status || 'active').toLowerCase() !== filterStatus)) return false
      if (filterMissingSku && !p.variants.some(v => !v.sku || !String(v.sku).trim())) return false
      if (filterPartialOnly && !p.isPartiallyVerified) return false
      if (filterStock === 'in_stock' && p.totalQty <= 0) return false
      if (filterStock === 'out_of_stock' && p.totalQty > 0) return false
      if (filterZeroCost && !p.variants.some(v => ((v.unit_cost || 0) + (v.packaging_cost || 0)) <= 0)) return false
      return true
    })
  }, [grouped, search, filterStatus, filterMissingSku, filterPartialOnly, filterStock, filterZeroCost])

  // Apply margin filter
  const marginFiltered = useMemo(() => {
    return filterMargin === 'all' ? allGrouped
      : filterMargin === 'low'  ? allGrouped.filter(p => p.margin !== null && p.margin < 20)
      : filterMargin === 'mid'  ? allGrouped.filter(p => p.margin !== null && p.margin >= 20 && p.margin < 40)
      : filterMargin === 'high' ? allGrouped.filter(p => p.margin !== null && p.margin >= 40)
      : allGrouped
  }, [allGrouped, filterMargin])

  // Apply sort
  const sorted = useMemo(() => {
    return [...marginFiltered].sort((a, b) => {
      if (sortBy === 'value')   return b.totalValue - a.totalValue
      if (sortBy === 'margin')  return (b.margin ?? -1) - (a.margin ?? -1)
      if (sortBy === 'stock')   return b.totalQty - a.totalQty
      if (sortBy === 'name')    return a.name.localeCompare(b.name)
      if (sortBy === 'pending') return (b.pendingCount - a.pendingCount) || (b.totalQty - a.totalQty)
      return 0
    })
  }, [marginFiltered, sortBy])

  const lists = useMemo(() => {
    return {
      catalog: sorted,
      pending: sorted.filter(p => p.hasPending),
      drift: sorted.filter(p => p.hasDrift || p.variants.some(v => v.unit_cost > 0 && v.shopify_cost > 0 && Math.abs(v.shopify_cost - v.unit_cost) >= 1)),
      verified: sorted.filter(p => p.isFullyVerified),
      continue_selling: sorted.filter(p => p.variants.some(v => v.inventory_policy === 'continue')),
    }
  }, [sorted])

  const currentList = useMemo(() => {
    return lists[activeTab] || []
  }, [lists, activeTab])

  // Auto-expand matching parents (up to 8) when user searches a specific SKU/variant or narrow query
  useEffect(() => {
    const q = search.trim()
    if (q.length < 2) return
    const toExpand = []
    for (const p of currentList) {
      const hasDirectVariantHit = p.variants.some(v => matchesVariantSearch(v, p.name, q))
      if (hasDirectVariantHit || currentList.length <= 4) {
        toExpand.push(p.name)
      }
      if (toExpand.length >= 8) break
    }
    if (toExpand.length > 0) {
      setExpandedParents(prev => {
        const next = new Set(prev)
        toExpand.forEach(name => next.add(name))
        return next
      })
    }
  }, [search, activeTab, currentList])

  // Global search filtering for Watchdog, Ghosts, Aliases, and SKU Checker
  const filteredWatchdog = useMemo(() => {
    const filterFn = (row) => {
      if (!matchesWatchdogRow(row, search)) return false
      if (filterStock === 'in_stock' && (row.inventory_qty ?? row.qty ?? 1) <= 0) return false
      if (filterStock === 'out_of_stock' && (row.inventory_qty ?? row.qty ?? 0) > 0) return false
      if (filterMissingSku && row.sku && String(row.sku).trim() !== '') return false
      return true
    }
    const missing = (auditData.missingInRegistry || []).filter(filterFn)
    const zero = (auditData.zeroCostInRegistry || []).filter(filterFn)
    const orders = (auditData.pendingOrdersWithMissingCost || []).filter(filterFn)
    return { missing, zero, orders, total: missing.length + zero.length + orders.length }
  }, [auditData, search, filterStock, filterMissingSku])

  // Fast thumbnail lookup by parent title for Watchdog parent rows
  const productImageByParent = useMemo(() => {
    const map = new Map()
    for (const c of costs) {
      if (c.parent_title && c.variant_image_url) {
        const key = c.parent_title.trim().toLowerCase()
        if (!map.has(key)) map.set(key, c.variant_image_url)
      }
    }
    return map
  }, [costs])

  // Parent-grouped Watchdog rows (groups Missing Mapping & $0 Costs by parent_title; keeps Orders as individual rows)
  const watchdogGroupedRows = useMemo(() => {
    const entries = []

    const pushProductGroups = (items, type) => {
      const groupMap = new Map()
      for (const item of items) {
        const pTitle = (item.parent_title || 'Unknown Product').trim()
        const normKey = `${type}::${pTitle.toLowerCase()}`
        if (!groupMap.has(normKey)) {
          groupMap.set(normKey, {
            _kind: 'group',
            _type: type,
            groupKey: normKey,
            parent_title: pTitle,
            variants: [],
            totalStock: 0,
            shopifyCosts: new Set(),
            imageUrl: productImageByParent.get(pTitle.toLowerCase()) || null
          })
        }
        const g = groupMap.get(normKey)
        g.variants.push(item)
        g.totalStock += (item.inventory_qty || 0)
        if ((item.shopify_cost || 0) > 0) g.shopifyCosts.add(Number(item.shopify_cost))
      }

      const list = Array.from(groupMap.values()).map(g => {
        const sortedCosts = Array.from(g.shopifyCosts).sort((a, b) => a - b)
        return {
          ...g,
          hasShopifyCost: sortedCosts.length > 0,
          shopifyCostHint: sortedCosts.length === 1
            ? `Shopify Cost: Rs ${sortedCosts[0].toLocaleString()}`
            : sortedCosts.length > 1
              ? `Shopify Cost: Rs ${sortedCosts[0].toLocaleString()} – Rs ${sortedCosts[sortedCosts.length - 1].toLocaleString()}`
              : null
        }
      })

      if (type === 'zero') {
        list.sort((a, b) => (b.totalStock - a.totalStock) || (b.variants.length - a.variants.length) || a.parent_title.localeCompare(b.parent_title))
      } else {
        list.sort((a, b) => (b.variants.length - a.variants.length) || a.parent_title.localeCompare(b.parent_title))
      }
      entries.push(...list)
    }

    if (auditFilter === 'all' || auditFilter === 'missing') {
      pushProductGroups(filteredWatchdog.missing, 'missing')
    }
    if (auditFilter === 'all' || auditFilter === 'zero') {
      pushProductGroups(filteredWatchdog.zero, 'zero')
    }
    if (auditFilter === 'all' || auditFilter === 'orders') {
      filteredWatchdog.orders.forEach((o, i) => {
        entries.push({ ...o, _kind: 'order', _type: 'order', groupKey: `order::${o.id || o.shopify_order_id || i}` })
      })
    }

    return entries
  }, [filteredWatchdog, auditFilter, productImageByParent])

  const filteredGhosts = useMemo(() => {
    const q = search || ghostSearch
    return ghosts.filter(g => isGhostMatch(g, q))
  }, [ghosts, search, ghostSearch])

  const filteredAliases = useMemo(() => {
    const q = search || aliasSearch
    return aliases.filter(a => matchesAliasRow(a, q))
  }, [aliases, search, aliasSearch])

  const skuCheckerData = useMemo(() => {
    const skuGroups = {}
    const missingSkus = []
    
    costs.forEach(c => {
      const sku = c.sku ? c.sku.trim() : '';
      if (!sku) {
        missingSkus.push(c);
      } else {
        if (!skuGroups[sku]) skuGroups[sku] = [];
        skuGroups[sku].push(c);
      }
    });

    const duplicates = [];
    Object.entries(skuGroups).forEach(([sku, variants]) => {
      if (variants.length > 1) {
        duplicates.push({
          sku,
          variants,
          hasCostMismatches: new Set(variants.map(v => (v.unit_cost || 0) + (v.packaging_cost || 0))).size > 1
        });
      }
    });

    const q = search.trim().toLowerCase()
    const matchVariantRow = (v) => {
      if (filterStock === 'in_stock' && (v.inventory_qty || 0) <= 0) return false
      if (filterStock === 'out_of_stock' && (v.inventory_qty || 0) > 0) return false
      if (filterZeroCost && ((v.unit_cost || 0) + (v.packaging_cost || 0)) > 0 && (v.shopify_cost || 0) > 0) return false
      if (!q) return true
      const hay = `${v.parent_title || ''} ${v.variant_title || ''} ${v.sku || ''} ${v.shopify_variant_id || ''} ${v.shopify_cost || ''} ${v.unit_cost || ''}`.toLowerCase()
      if (hay.includes(q)) return true
      const tokens = q.replace(/[()\/]/g, ' ').split(/\s+/).filter(Boolean)
      return tokens.length > 0 && tokens.every(t => hay.includes(t))
    }

    const filteredDuplicates = duplicates.filter(d => {
      if (filterMissingSku) return false
      if (!q && filterStock === 'all' && !filterZeroCost) return true
      if (q && d.sku.toLowerCase().includes(q) && filterStock === 'all' && !filterZeroCost) return true
      return d.variants.some(matchVariantRow)
    })

    const filteredMissingSkus = missingSkus.filter(matchVariantRow)

    return {
      duplicates: filteredDuplicates,
      missingSkus: filteredMissingSkus
    };
  }, [costs, search, filterMissingSku, filterStock, filterZeroCost]);

  // --- Handlers ---
  const handleSyncShopify = async () => {
    setIsSyncing(true)
    setSyncProgress('Connecting to Shopify...')
    setSyncWarning('')
    try {
      setSyncProgress('Fetching all product variants via GraphQL...')
      const res = await fetch('/api/finance/sync-shopify-costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: activeStoreId })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`)
      if (data.success) {
        if (data.count === 0) {
          setSyncProgress('')
          setSyncWarning(data.warning || 'Shopify returned 0 variants. Check your store connection.')
          addToast('Sync completed but 0 variants found — run Diagnose to identify the issue.', 'warning')
        } else {
          setSyncProgress(`✅ Successfully synced ${data.count} variants!`)
          addToast(`Synced ${data.count} variants from Shopify`, 'success')
          await fetchCosts()
          await fetchGhosts()
          await fetchSyncStatus()
        }
      } else {
        throw new Error(data.error || 'Sync failed')
      }
    } catch (e) {
      setSyncProgress('')
      addToast('Sync error: ' + e.message, 'error')
    }
    finally {
      setIsSyncing(false)
      setTimeout(() => setSyncProgress(''), 3000)
    }
  }

  const handleDiagnose = async () => {
    setIsDiagnosing(true)
    setDiagnoseReport(null)
    try {
      const res = await fetch(`/api/finance/diagnose-shopify-sync?store_id=${activeStoreId}`)
      const data = await res.json()
      setDiagnoseReport(data)
    } catch (e) {
      addToast('Diagnose failed: ' + e.message, 'error')
    } finally {
      setIsDiagnosing(false)
    }
  }

  const handleApplyGhostCosts = async () => {
    const mappings = {}
    Object.entries(ghostCosts).forEach(([key, cost]) => {
      if (parseFloat(cost) > 0) {
        // key is "Parent@@@Variant" or just "Name"
        const [pName, vName] = key.split('@@@');
        const finalKey = vName ? `${pName} - ${vName}` : pName;
        mappings[finalKey] = parseFloat(cost)
      }
    })
    if (Object.keys(mappings).length === 0) return addToast('Please enter at least one cost', 'warning')

    try {
      const res = await fetch('/api/finance/apply-bulk-product-costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: activeStoreId, mappings })
      })
      const data = await res.json()
      if (data.success) {
        addToast(`Healed ${data.count} orders!`, 'success')
        fetchGhosts()
        fetchCosts()
        setGhostCosts({})
      }
    } catch (e) { addToast('Failed to apply costs', 'error') }
  }

  const handleInspectGhost = async (name) => {
    setInspectingGhost(name)
    setShowGhostModal(true)
    setLoadingGhostOrders(true)
    try {
      const res = await fetch(`/api/finance/ghost-product-orders?store_id=${activeStoreId}&name=${encodeURIComponent(name)}`)
      if (res.ok) {
        const data = await res.json()
        setGhostOrders(Array.isArray(data) ? data : [])
      } else {
        setGhostOrders([])
      }
    } catch (e) {
      console.error(e)
      setGhostOrders([])
      addToast('Failed to load orders', 'error')
    }
    finally { setLoadingGhostOrders(false) }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    try {
      const payload = editingItem
        ? { store_id: activeStoreId, parent_title: form.parent_title, variant_title: form.variant_title, packaging_cost: parseFloat(form.packaging_cost) || 0, packaging_only: true }
        : { store_id: activeStoreId, ...form }
      const res = await fetch('/api/finance/master-costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (data.success) {
        addToast(editingItem ? 'Packaging cost updated (FIFO unit cost preserved)' : 'Saved successfully', 'success')
        setShowModal(false)
        fetchCosts()
      }
    } catch (e) { addToast('Save error: ' + e.message, 'error') }
  }

  const handleDeleteParent = async (title) => {
    if (!window.confirm(`Delete "${title}"?`)) return
    try {
      const res = await fetch('/api/finance/delete-master-cost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: activeStoreId, parent_title: title })
      })
      if (res.ok) {
        addToast('Deleted', 'success')
        fetchCosts()
      }
    } catch (e) { addToast('Delete failed', 'error') }
  }

  const handleDeleteVariant = async (parentTitle, variantTitle) => {
    const displayName = variantTitle ? `${parentTitle} (${variantTitle})` : parentTitle;
    if (!window.confirm(`Are you sure you want to delete "${displayName}" from the Cost Registry?`)) return
    try {
      const res = await fetch('/api/finance/delete-master-variant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: activeStoreId, parent_title: parentTitle, variant_title: variantTitle || '' })
      })
      if (res.ok) {
        addToast('Variant deleted from registry successfully', 'success')
        fetchCosts()
      }
    } catch (e) { addToast('Delete variant failed', 'error') }
  }

  const handleBulkAcceptSelected = async () => {
    if (selectedParents.size === 0) return
    setBulkProcessing(true)
    try {
      let totalUpdated = 0
      for (const parentTitle of selectedParents) {
        const res = await fetch('/api/finance/bulk-accept-shopify-costs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ store_id: activeStoreId, parent_title: parentTitle })
        })
        const data = await res.json()
        totalUpdated += (data.changes || 0)
      }
      addToast(`Successfully accepted costs for ${selectedParents.size} products!`, 'success')
      setSelectedParents(new Set())
      fetchCosts()
    } catch (e) {
      addToast('Bulk acceptance failed', 'error')
    } finally {
      setBulkProcessing(false)
    }
  }

  const toggleSelectParent = (name) => {
    const next = new Set(selectedParents)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setSelectedParents(next)
  }

  const handleBulkDeleteVariants = async () => {
    if (selectedVariants.size === 0) return
    if (!window.confirm(`Are you sure you want to delete the ${selectedVariants.size} selected variations from the Cost Registry?`)) return
    setBulkProcessing(true)
    try {
      const res = await fetch('/api/finance/bulk-delete-master-variants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: activeStoreId, ids: Array.from(selectedVariants) })
      })
      const data = await res.json()
      if (data.success) {
        addToast(`Successfully deleted ${data.count} variations!`, 'success')
        setSelectedVariants(new Set())
        fetchCosts()
      } else {
        throw new Error(data.error || 'Bulk delete failed')
      }
    } catch (e) {
      addToast('Bulk delete failed: ' + e.message, 'error')
    } finally {
      setBulkProcessing(false)
    }
  }

  const handleHealOrderCost = async (shopifyOrderId) => {
    try {
      const res = await fetch('/api/finance/heal-order-cost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: activeStoreId, shopify_order_id: shopifyOrderId })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast(`Successfully healed order cost to Rs ${data.landed_cost.toLocaleString()}!`, 'success');
        fetchAudit();
      } else {
        throw new Error(data.error || 'Failed to heal cost');
      }
    } catch (e) {
      addToast('Healing failed: ' + e.message, 'error');
    }
  }

  const toggleSelectAll = (isAll) => {
    if (isAll) {
      setSelectedParents(new Set())
    } else {
      const allNames = sorted.map(p => p.name)
      setSelectedParents(new Set(allNames))
    }
  }

  const handleBulkSync = async (e) => {
    e.preventDefault()
    try {
      const isCustomGroup = bulkItem.ids && bulkItem.ids.length > 0;
      const url = isCustomGroup ? '/api/finance/bulk-sync-variants-costs' : '/api/finance/bulk-sync-parent-costs';
      const pkgVal = parseFloat(bulkForm.packaging_cost) || 0;
      const body = isCustomGroup 
        ? { store_id: activeStoreId, ids: bulkItem.ids, packaging_cost: pkgVal, packaging_only: true }
        : { store_id: activeStoreId, parent_title: bulkItem.name, packaging_cost: pkgVal, packaging_only: true };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (res.ok) {
        addToast(isCustomGroup ? 'Packaging updated for selected group (FIFO unit costs preserved)' : 'Packaging updated for all variants (FIFO unit costs preserved)', 'success')
        setShowBulkModal(false)
        fetchCosts()
      }
    } catch (e) { addToast('Bulk error: ' + e.message, 'error') }
  }

  const handleAcceptShopifyCost = async (v) => {
    try {
      const res = await fetch('/api/finance/accept-shopify-cost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: activeStoreId, parent_title: v.parent_title, variant_title: v.variant_title })
      })
      if (res.ok) {
        addToast(`Accepted cost for ${v.variant_title || 'Default'}`, 'success')
        fetchCosts()
      }
    } catch (e) { addToast('Accept failed', 'error') }
  }

  const handleBulkAccept = async (parentTitle) => {
    if (!window.confirm(`Accept Shopify costs for ALL variants of "${parentTitle}"?`)) return
    try {
      const res = await fetch('/api/finance/bulk-accept-shopify-costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: activeStoreId, parent_title: parentTitle })
      })
      if (res.ok) {
        addToast(`Accepted all costs for ${parentTitle}`, 'success')
        fetchCosts()
      }
    } catch (e) { addToast('Bulk accept failed', 'error') }
  }

  const handleAcceptAllDrifts = async () => {
    const driftList = lists.drift || []
    if (driftList.length === 0) return
    if (!window.confirm(`Accept new Shopify costs for ALL ${driftList.length} products with price drift?`)) return
    setBulkProcessing(true)
    try {
      for (const p of driftList) {
        await fetch('/api/finance/bulk-accept-shopify-costs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ store_id: activeStoreId, parent_title: p.name })
        })
      }
      addToast(`Successfully accepted new costs for ${driftList.length} products!`, 'success')
      fetchCosts()
    } catch (e) {
      addToast('Bulk accept failed', 'error')
    } finally {
      setBulkProcessing(false)
    }
  }

  const handleInlineSave = async (v) => {
    const key = v.id || `${v.parent_title}@@@${v.variant_title}`
    const edit = inlineEdits[key]
    if (!edit) return
    setSavingInline(key)
    try {
      const res = await fetch('/api/finance/master-costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: activeStoreId,
          parent_title: v.parent_title,
          variant_title: v.variant_title,
          packaging_cost: parseFloat(edit.packaging_cost) || 0,
          packaging_only: true
        })
      })
      const data = await res.json()
      if (data.success) {
        addToast(`✅ Packaging saved for ${v.variant_title || v.parent_title}`, 'success')
        const next = { ...inlineEdits }
        delete next[key]
        setInlineEdits(next)
        fetchCosts()
      }
    } catch (e) { addToast('Save failed: ' + e.message, 'error') }
    finally { setSavingInline(null) }
  }

  const toggleParent = (name) => {
    const next = new Set(expandedParents)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setExpandedParents(next)
  }
  
  return (
    <div className="page-container cost-manager" style={{ padding: '18px 24px 32px' }}>
      {/* ── Compact Executive Header ── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.05) 55%, rgba(79,70,229,0.03) 100%)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '15px 20px',
        marginBottom: 14,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 38, height: 38,
            background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
            borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18,
            boxShadow: '0 3px 10px rgba(79,70,229,0.28)',
            flexShrink: 0
          }}>🛡️</div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.2 }}>Costing &amp; Watchdog</h1>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>PO-driven FIFO costs · live Shopify inventory · zero-leak margin watchdog</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, position: 'relative', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* High-Contrast Auto-Sync Status Badge */}
          <div 
            title="Hybrid Cost Sync: Real-time webhook micro-sync active + 6-hour background cron"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 9,
              background: 'rgba(5, 150, 105, 0.10)',
              border: '1px solid rgba(5, 150, 105, 0.32)',
              fontSize: '0.78rem', color: '#047857', fontWeight: 700
            }}
          >
            <span style={{ 
              width: 7, height: 7, borderRadius: '50%', background: '#10b981', 
              boxShadow: '0 0 6px #10b981', display: 'inline-block' 
            }} />
            <span>Auto-Sync: {formatRelativeTime(lastCostSyncedAt)}</span>
          </div>

          <button
            onClick={handleDiagnose}
            disabled={isDiagnosing || isSyncing}
            style={{
              padding: '7px 14px', borderRadius: 9, border: '1px solid rgba(234,88,12,0.35)',
              background: 'rgba(234,88,12,0.09)', color: '#c2410c',
              fontWeight: 700, fontSize: '0.79rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              transition: 'all 0.16s ease', opacity: isDiagnosing || isSyncing ? 0.6 : 1
            }}
          >
            {isDiagnosing ? '⏳ Diagnosing...' : '🔬 Diagnose'}
          </button>
          <button
            onClick={handleSyncShopify}
            disabled={isSyncing}
            style={{
              padding: '7px 15px', borderRadius: 9,
              border: '1px solid rgba(5, 150, 105, 0.42)',
              background: '#059669',
              color: '#ffffff', fontWeight: 700, fontSize: '0.79rem',
              cursor: isSyncing ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: '0 2px 8px rgba(5,150,105,0.22)',
              transition: 'all 0.16s ease', opacity: isSyncing ? 0.7 : 1
            }}
            title="Manually pull & sync all products, variants, SKUs, and live stock directly from Shopify"
          >
            <span style={{ fontSize: '0.88rem', display: 'inline-block', transform: isSyncing ? 'rotate(180deg)' : 'none', transition: 'transform 0.5s' }}>🔄</span>
            <span>{isSyncing ? 'Syncing...' : 'Manual Sync'}</span>
          </button>
        </div>
      </div>

      {/* ── Sync Progress Banner ── */}
      {isSyncing && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(79,70,229,0.08))',
          border: '1px solid rgba(99,102,241,0.4)',
          borderRadius: 12,
          padding: '16px 24px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          animation: 'slideDown 0.3s ease'
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            border: '3px solid var(--brand)',
            borderTopColor: 'transparent',
            animation: 'spin 0.8s linear infinite',
            flexShrink: 0
          }} />
          <div>
            <div style={{ fontWeight: 700, color: 'var(--brand)', fontSize: '0.95rem' }}>🔄 Syncing from Shopify...</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 3 }}>{syncProgress}</div>
          </div>
        </div>
      )}
      {!isSyncing && syncProgress && (
        <div style={{
          background: 'var(--green-dim)', border: '1px solid var(--green)',
          borderRadius: 12, padding: '12px 20px', marginBottom: 20,
          color: 'var(--green)', fontWeight: 600, fontSize: '0.9rem'
        }}>
          {syncProgress}
        </div>
      )}

      {/* ── Zero-Sync Warning Banner ── */}
      {syncWarning && (
        <div style={{
          background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.4)',
          borderRadius: 12, padding: '16px 20px', marginBottom: 20,
          animation: 'slideDown 0.3s ease'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--yellow)', marginBottom: 6, fontSize: '0.95rem' }}>
                ⚠️ Sync completed but 0 variants were imported
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>{syncWarning}</div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
              <button
                className="btn btn-secondary"
                style={{ whiteSpace: 'nowrap', borderColor: 'rgba(251,146,60,0.5)', color: 'var(--yellow)', fontSize: '0.82rem' }}
                onClick={handleDiagnose}
                disabled={isDiagnosing}
              >
                {isDiagnosing ? '⏳...' : '🔬 Run Diagnose'}
              </button>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.1rem' }} onClick={() => setSyncWarning('')}>×</button>
            </div>
          </div>
        </div>
      )}

      {selectedParents.size > 0 && (
        <div style={{ 
          background: 'var(--green-dim)', 
          border: '1px solid var(--green)', 
          padding: '15px 25px', 
          borderRadius: 12, 
          marginBottom: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          animation: 'slideDown 0.3s ease'
        }}>
          <div style={{ color: 'var(--green)', fontWeight: 'bold' }}>
            ⚡ {selectedParents.size} Products Selected
          </div>
          <button 
            className="btn btn-primary" 
            style={{ background: 'var(--green)', color: '#fff' }}
            onClick={handleBulkAcceptSelected}
            disabled={bulkProcessing}
          >
            {bulkProcessing ? '⌛ Processing...' : `✅ Accept All Selected Costs`}
          </button>
        </div>
      )}

      {selectedVariants.size > 0 && (
        <div style={{ 
          background: 'rgba(239,68,68,0.1)', 
          border: '1px solid rgba(239,68,68,0.4)', 
          padding: '15px 25px', 
          borderRadius: 12, 
          marginBottom: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          animation: 'slideDown 0.3s ease'
        }}>
          <div style={{ color: '#ef4444', fontWeight: 'bold' }}>
            ⚡ {selectedVariants.size} Variations Selected
          </div>
          <button 
            className="btn btn-secondary" 
            style={{ background: '#ef4444', color: '#fff', border: 'none' }}
            onClick={handleBulkDeleteVariants}
            disabled={bulkProcessing}
          >
            {bulkProcessing ? '⌛ Deleting...' : `🗑️ Delete Selected Variants`}
          </button>
        </div>
      )}

      {activeTab === 'watchdog' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 260px', gap: 12, marginBottom: 14 }}>
          {/* Compact Uniform Watchdog KPI Cards */}
          {[{
            key: 'missing',
            label: 'Not in Registry',
            sub: `${auditData.missingInRegistry.length} unmapped variant${auditData.missingInRegistry.length !== 1 ? 's' : ''}`,
            count: auditData.missingInRegistry.length,
            icon: '📦',
            color: '#dc2626',
            glow: 'rgba(220,38,38,0.12)',
            grad: 'linear-gradient(135deg, rgba(239,68,68,0.10), rgba(239,68,68,0.03))'
          },{
            key: 'zero',
            label: 'Zero Cost Variants',
            sub: `Rs. 0 across ${lists.pending.length} product${lists.pending.length !== 1 ? 's' : ''}`,
            count: auditData.zeroCostInRegistry.length,
            icon: '⚠️',
            color: '#d97706',
            glow: 'rgba(217,119,6,0.12)',
            grad: 'linear-gradient(135deg, rgba(245,158,11,0.10), rgba(245,158,11,0.03))'
          },{
            key: 'orders',
            label: 'At-Risk Orders',
            sub: 'Active orders with Rs. 0 cost',
            count: auditData.pendingOrdersWithMissingCost.length,
            icon: '🔥',
            color: '#2563eb',
            glow: 'rgba(37,99,235,0.12)',
            grad: 'linear-gradient(135deg, rgba(59,130,246,0.10), rgba(59,130,246,0.03))'
          }].map(card => (
            <div
              key={card.key}
              onClick={() => setAuditFilter(card.key)}
              style={{
                cursor: 'pointer',
                borderRadius: 12,
                border: auditFilter === card.key ? `1.5px solid ${card.color}` : '1px solid var(--border)',
                background: auditFilter === card.key ? card.grad : 'var(--bg-surface)',
                padding: '13px 16px',
                position: 'relative',
                overflow: 'hidden',
                transition: 'all 0.18s ease',
                boxShadow: auditFilter === card.key ? `0 3px 14px ${card.glow}` : '0 1px 3px rgba(0,0,0,0.02)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2.5, background: card.color, opacity: auditFilter === card.key ? 1 : 0.35 }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: card.color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                  {card.count}
                </div>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: `${card.color}18`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 15
                }}>{card.icon}</div>
              </div>
              <div style={{ marginTop: 8 }}>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.84rem', lineHeight: 1.2 }}>{card.label}</div>
                <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)', marginTop: 2 }}>{card.sub}</div>
              </div>
            </div>
          ))}

          {/* Percentage-Accurate Centered Health Score Ring Card */}
          {(() => {
            const totalIssues = auditData.missingInRegistry.length + auditData.zeroCostInRegistry.length + auditData.pendingOrdersWithMissingCost.length;
            const totalSkus = Math.max(costs.length, 1);
            const costedSkus = Math.max(0, costs.length - auditData.zeroCostInRegistry.length);
            const skuCoveragePct = costs.length > 0 ? (costedSkus / totalSkus) * 100 : 100;
            const orderPenalty = Math.min(25, auditData.pendingOrdersWithMissingCost.length * 3);
            const missingPenalty = Math.min(20, auditData.missingInRegistry.length * 1);
            const healthScore = totalIssues === 0 ? 100 : Math.max(1, Math.min(99, Math.round(skuCoveragePct - orderPenalty - missingPenalty)));
            const healthColor = healthScore >= 90 ? '#059669' : healthScore >= 65 ? '#d97706' : '#dc2626';
            const r = 26; const circ = 2 * Math.PI * r;
            const dash = (healthScore / 100) * circ;
            return (
              <div
                title={`SKU Cost Coverage: ${Math.round(skuCoveragePct)}% (${costedSkus}/${costs.length} variants) · ${totalIssues} active watchdog alerts`}
                style={{
                  borderRadius: 12,
                  border: `1.5px solid ${healthColor}44`,
                  background: `${healthColor}0c`,
                  padding: '12px 16px',
                  display: 'flex', alignItems: 'center', gap: 14,
                  position: 'relative', overflow: 'hidden'
                }}
              >
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2.5, background: healthColor }} />
                <div style={{ position: 'relative', width: 64, height: 64, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width={64} height={64} viewBox="0 0 64 64" style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx={32} cy={32} r={r} fill="none" stroke="var(--border)" strokeWidth={5.5} />
                    {healthScore > 0 && (
                      <circle cx={32} cy={32} r={r} fill="none" stroke={healthColor} strokeWidth={5.5}
                        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
                        style={{ transition: 'stroke-dasharray 0.7s ease' }} />
                    )}
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ fontSize: 17, fontWeight: 900, color: healthColor, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{healthScore}</div>
                    <div style={{ fontSize: '0.56rem', color: 'var(--text-muted)', fontWeight: 700, marginTop: 1 }}>/100</div>
                  </div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.84rem', color: 'var(--text-primary)', lineHeight: 1.2 }}>Health Score</div>
                  <div style={{ fontSize: '0.71rem', color: healthColor, fontWeight: 700, marginTop: 3 }}>
                    {healthScore === 100 ? '✅ All Clear' : `${totalIssues} alert${totalIssues !== 1 ? 's' : ''}`}
                  </div>
                  <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    {Math.round(skuCoveragePct)}% SKUs costed
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 14 }}>
          {[{
            label: '💰 Shelf Inventory Value', value: `Rs ${Math.round(totals.acceptedValue).toLocaleString()}`,
            sub: `${totals.acceptedQty.toLocaleString()} Shopify units · ${totals.fifoUnits.toLocaleString()} FIFO PO units`,
            grad: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)', color: '#fff', shadow: '0 4px 16px rgba(67,56,202,0.22)', dark: true
          },{
            label: '📈 Avg Gross Margin', value: `${avgMargin}%`, sub: `Across verified SKUs · ${totals.atRiskCount} low (<20%)`,
            vColor: avgMargin >= 40 ? '#059669' : avgMargin >= 20 ? '#d97706' : '#dc2626',
            bar: { width: Math.min(avgMargin, 100), color: avgMargin >= 40 ? '#10b981' : avgMargin >= 20 ? '#f59e0b' : '#ef4444' }
          },{
            label: '📦 Stock Health', value: `${totals.inStockSkus} In Stock`,
            sub: `${totals.outOfStockSkus} Out of Stock${totals.backorderUnits > 0 ? ` · -${totals.backorderUnits} Backorder` : ''}`,
            vColor: totals.backorderUnits > 0 ? '#7c3aed' : (totals.inStockSkus > 0 ? '#059669' : '#dc2626'),
            border: totals.backorderUnits > 0 ? 'rgba(124,58,237,0.35)' : 'var(--border)'
          },{
            label: '⏳ Uncosted SKUs (Rs 0)', value: `${totals.uncostedSkus} vars`,
            sub: totals.uncostedSkus > 0 ? `${lists.pending.length} products — needs PO / Baseline` : 'All SKUs have verified PO/Master cost',
            vColor: totals.uncostedSkus > 0 ? '#d97706' : '#059669',
            border: totals.uncostedSkus > 0 ? 'rgba(217,119,6,0.35)' : 'var(--border)',
            onClick: () => setActiveTab('pending')
          }].map((c, i) => (
            <div key={i} onClick={c.onClick} style={{
              background: c.grad || 'var(--bg-surface)',
              border: `1px solid ${c.border || 'var(--border)'}`,
              padding: '13px 16px', borderRadius: 12,
              boxShadow: c.shadow || '0 1px 3px rgba(0,0,0,0.02)',
              position: 'relative', overflow: 'hidden',
              color: c.dark ? '#fff' : 'var(--text-primary)',
              cursor: c.onClick ? 'pointer' : 'default',
              transition: 'transform 0.15s ease'
            }}>
              <div style={{ fontSize: '0.67rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.7, opacity: c.dark ? 0.88 : 0.65, marginBottom: 6 }}>{c.label}</div>
              <div style={{ fontSize: '1.45rem', fontWeight: 900, lineHeight: 1.05, fontVariantNumeric: 'tabular-nums', color: c.dark ? '#fff' : (c.vColor || 'var(--text-primary)') }}>{c.value}</div>
              <div style={{ fontSize: '0.71rem', marginTop: 5, opacity: c.dark ? 0.85 : 0.68 }}>{c.sub}</div>
              {c.bar && (
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: 'var(--border)' }}>
                  <div style={{ height: '100%', width: `${c.bar.width}%`, background: c.bar.color, transition: 'width 0.6s ease' }} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Global Advanced Search & Filter Command Bar (Tab-Aware!) ── */}
      {(() => {
        const isCatalogTab = ['catalog', 'pending', 'verified', 'drift', 'continue_selling'].includes(activeTab);
        const globalTabs = [
          { key: 'watchdog', label: 'Watchdog', count: filteredWatchdog.total, color: '#dc2626', icon: '🛡️', title: `${filteredWatchdog.total} total alerts across variants & orders` },
          { key: 'catalog',  label: 'Catalog',  count: lists.catalog.length,  color: '#2563eb', icon: '📦', title: `${lists.catalog.length} parent products` },
          { key: 'pending',  label: 'Pending (Rs 0)', count: lists.pending.length,  color: '#d97706', icon: '⏳', title: `${lists.pending.length} parent products (${totals.uncostedSkus} variants at Rs 0)` },
          { key: 'verified', label: 'Verified (FIFO)', count: lists.verified.length, color: '#059669', icon: '✅', title: `${lists.verified.length} fully costed parent products` },
          { key: 'drift',    label: 'Price Drift', count: lists.drift.length, color: '#b45309', icon: '⚡', title: 'Shopify cost vs ERP unit cost differences' },
          { key: 'continue_selling', label: 'Continue Selling', count: lists.continue_selling.length, color: '#7c3aed', icon: '🔄', title: 'Pre-order / Continue Selling products' },
          { key: 'ghosts',   label: 'Ghosts',   count: filteredGhosts.length, color: '#6d28d9', icon: '👻', title: 'Deleted or renamed products from historical orders' },
          { key: 'aliases',  label: 'Aliases',  count: filteredAliases.length, color: '#be185d', icon: '🔗', title: 'Explicit Ghost-to-SKU links' },
          { key: 'sku_checker', label: 'SKU Checker', count: skuCheckerData.duplicates.length + skuCheckerData.missingSkus.length, color: '#e11d48', icon: '🆔', title: 'Duplicate or missing SKU codes' },
        ];
        const matchingTabs = hasActiveFilters ? globalTabs.filter(t => t.count > 0) : [];
        const chipStyle = (active, color) => ({
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '4px 10px', borderRadius: 20, fontSize: '0.73rem', fontWeight: active ? 700 : 600,
          cursor: 'pointer', transition: 'all 0.15s ease', whiteSpace: 'nowrap',
          background: active ? `${color}1c` : 'var(--bg-elevated)',
          color: active ? color : 'var(--text-secondary)',
          border: `1px solid ${active ? color : 'var(--border)'}`,
          boxShadow: active ? `0 0 0 1px ${color}28` : 'none'
        });
        const compactSelectStyle = (active = false, activeColor = '#2563eb') => ({
          width: 'auto', minWidth: 0, height: 35, borderRadius: 9, fontSize: '0.79rem',
          padding: '0 26px 0 10px', cursor: 'pointer',
          background: active ? `${activeColor}14` : 'var(--bg-elevated)',
          borderColor: active ? activeColor : 'var(--border)',
          color: active ? activeColor : 'var(--text-primary)',
          fontWeight: active ? 700 : 500,
          flexShrink: 0
        });

        return (
          <>
            {/* ── Segmented Tab Bar (Directly below KPIs for clean navigation) ── */}
            <div style={{
              display: 'flex', gap: 3, marginBottom: 10,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 12, padding: 4,
              flexWrap: 'wrap'
            }}>
              {globalTabs.map(t => (
                <button
                  key={t.key}
                  title={t.title}
                  onClick={() => setActiveTab(t.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: activeTab === t.key ? 'var(--bg-surface)' : 'transparent',
                    color: activeTab === t.key ? t.color : 'var(--text-secondary)',
                    fontWeight: activeTab === t.key ? 700 : 600,
                    fontSize: '0.8rem',
                    boxShadow: activeTab === t.key ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
                    transition: 'all 0.15s ease',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <span style={{ fontSize: '0.85rem' }}>{t.icon}</span>
                  <span>{t.label}</span>
                  {t.count > 0 && (
                    <span style={{
                      background: activeTab === t.key ? t.color : 'var(--border)',
                      color: activeTab === t.key ? '#fff' : 'var(--text-secondary)',
                      borderRadius: 20, padding: '1px 6px', fontSize: '0.66rem', fontWeight: 700, minWidth: 18, textAlign: 'center'
                    }}>{t.count}</span>
                  )}
                </button>
              ))}
            </div>

            {/* ── Compact Tab-Aware Search & Filter Bar ── */}
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '10px 13px',
              marginBottom: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}>
              {/* Row 1: Search Input + Catalog-Only Compact Dropdowns */}
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: '1 1 260px', minWidth: 220 }}>
                  <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontSize: '0.88rem', opacity: 0.6, pointerEvents: 'none' }}>🔍</span>
                  <input
                    ref={searchInputRef}
                    type="text"
                    className="form-input"
                    placeholder={isCatalogTab
                      ? 'Search product, variant, SKU (AR-000275), cost...'
                      : 'Global search across alerts, products, SKUs, ghosts & aliases...'}
                    value={search}
                    onChange={e => {
                      setSearch(e.target.value)
                      setGhostSearch(e.target.value)
                      setAliasSearch(e.target.value)
                    }}
                    style={{
                      paddingLeft: 34,
                      paddingRight: search ? 34 : 66,
                      width: '100%',
                      height: 35,
                      borderRadius: 9,
                      fontSize: '0.82rem',
                      background: 'var(--bg-elevated)',
                      borderColor: search ? 'var(--brand)' : 'var(--border)'
                    }}
                  />
                  {search ? (
                    <button
                      type="button"
                      title="Clear search (Esc)"
                      onClick={() => { setSearch(''); setGhostSearch(''); setAliasSearch(''); searchInputRef.current?.focus(); }}
                      style={{
                        position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)',
                        border: 'none', background: 'var(--border)', color: 'var(--text-primary)',
                        borderRadius: '50%', width: 20, height: 20, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700
                      }}
                    >✕</button>
                  ) : (
                    <span style={{
                      position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                      fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)',
                      background: 'var(--bg-surface)', border: '1px solid var(--border)',
                      borderRadius: 5, padding: '1px 6px', pointerEvents: 'none'
                    }}>⌘K /</span>
                  )}
                </div>

                {isCatalogTab && (
                  <>
                    <select
                      className="form-input"
                      value={filterStatus}
                      onChange={e => setFilterStatus(e.target.value)}
                      style={compactSelectStyle(filterStatus !== 'all', '#2563eb')}
                      title="Filter by Shopify Product Status"
                    >
                      <option value="all">Status: All</option>
                      <option value="active">🟢 Active</option>
                      <option value="draft">📝 Draft</option>
                      <option value="unlisted">🚫 Unlisted</option>
                      <option value="archived">📦 Archived</option>
                    </select>

                    <select
                      className="form-input"
                      value={sortBy}
                      onChange={e => setSortBy(e.target.value)}
                      style={compactSelectStyle(false)}
                    >
                      <option value="value">Sort: Value</option>
                      <option value="stock">Sort: Stock</option>
                      <option value="margin">Sort: Margin</option>
                      <option value="pending">Sort: Uncosted</option>
                      <option value="name">Sort: A–Z</option>
                    </select>

                    <select
                      className="form-input"
                      value={filterMargin}
                      onChange={e => setFilterMargin(e.target.value)}
                      style={compactSelectStyle(filterMargin !== 'all', '#d97706')}
                    >
                      <option value="all">Margin: All</option>
                      <option value="high">High (&gt;40%)</option>
                      <option value="mid">Mid (20–40%)</option>
                      <option value="low">Low (&lt;20%) ⚠️</option>
                    </select>

                    <select
                      className="form-input"
                      value={groupVariantsBy}
                      onChange={e => setGroupVariantsBy(e.target.value)}
                      style={compactSelectStyle(groupVariantsBy !== 'none', '#7c3aed')}
                    >
                      <option value="none">Flat List</option>
                      <option value="opt1">By Size</option>
                      <option value="opt2">By Color</option>
                    </select>
                  </>
                )}

                {!isCatalogTab && hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleClearAllFilters}
                    style={{
                      padding: '6px 11px', borderRadius: 8, fontSize: '0.74rem', fontWeight: 700,
                      background: 'rgba(220, 38, 38, 0.10)', color: '#dc2626',
                      border: '1px solid rgba(220, 38, 38, 0.30)', cursor: 'pointer'
                    }}
                  >
                    ✕ Clear
                  </button>
                )}
              </div>

              {/* Row 2: 1-Click Quick Filter Chips (Catalog/Cost tabs only — never shown as dead controls on Watchdog!) */}
              {isCatalogTab && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginRight: 2 }}>
                      Filters:
                    </span>
                    <button type="button" onClick={() => setFilterMissingSku(v => !v)} style={chipStyle(filterMissingSku, '#dc2626')}>❌ Missing SKU</button>
                    <button type="button" onClick={() => setFilterPartialOnly(v => !v)} style={chipStyle(filterPartialOnly, '#d97706')}>⚠️ Partial Costed</button>
                    <button type="button" onClick={() => setFilterStock(s => s === 'in_stock' ? 'all' : 'in_stock')} style={chipStyle(filterStock === 'in_stock', '#059669')}>📦 In Stock</button>
                    <button type="button" onClick={() => setFilterStock(s => s === 'out_of_stock' ? 'all' : 'out_of_stock')} style={chipStyle(filterStock === 'out_of_stock', '#475569')}>🚫 Out of Stock</button>
                    <button type="button" onClick={() => setFilterZeroCost(v => !v)} style={chipStyle(filterZeroCost, '#ea580c')}>💸 Zero Cost (Rs 0)</button>
                  </div>

                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={handleClearAllFilters}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '4px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700,
                        background: 'rgba(220, 38, 38, 0.10)', color: '#dc2626',
                        border: '1px solid rgba(220, 38, 38, 0.32)', cursor: 'pointer'
                      }}
                    >
                      ✕ Clear All
                    </button>
                  )}
                </div>
              )}

              {/* Row 3: Live Cross-Tab Match Strip (Visible whenever Search or Quick Filters are active) */}
              {hasActiveFilters && (
                <div style={{
                  display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6,
                  paddingTop: 7, borderTop: '1px dashed var(--border)'
                }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', marginRight: 2 }}>
                    🔀 Matches:
                  </span>
                  {matchingTabs.length === 0 ? (
                    <span style={{ fontSize: '0.74rem', color: '#dc2626', fontWeight: 600 }}>
                      No matches found in any tab — try clearing filters.
                    </span>
                  ) : (
                    matchingTabs.map(t => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setActiveTab(t.key)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '2.5px 9px', borderRadius: 16, fontSize: '0.71rem', fontWeight: 700,
                          cursor: 'pointer', transition: 'all 0.15s ease',
                          background: activeTab === t.key ? t.color : `${t.color}16`,
                          color: activeTab === t.key ? '#fff' : t.color,
                          border: `1px solid ${activeTab === t.key ? t.color : `${t.color}48`}`
                        }}
                      >
                        <span>{t.icon}</span>
                        <span>{t.label}</span>
                        <span style={{ opacity: 0.9 }}>({t.count})</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </>
        );
      })()}

      {(activeTab === 'catalog' || activeTab === 'pending' || activeTab === 'drift' || activeTab === 'verified' || activeTab === 'continue_selling') && (
        <>
          {/* ── Loading State ── */}
          {loading && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              padding: '80px 20px', gap: 16
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                border: '4px solid var(--brand)',
                borderTopColor: 'transparent',
                animation: 'spin 0.8s linear infinite'
              }} />
              <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading cost registry...</div>
            </div>
          )}

          {/* ── Error State ── */}
          {!loading && loadError && (
            <div style={{
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 12, padding: '30px', textAlign: 'center'
            }}>
              <div style={{ fontSize: '2rem', marginBottom: 12 }}>⚠️</div>
              <div style={{ color: '#ef4444', fontWeight: 700, marginBottom: 6 }}>Failed to Load Registry</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 20 }}>{loadError}</div>
              <button className="btn btn-primary" onClick={fetchCosts}>🔄 Retry</button>
            </div>
          )}

          {/* ── Empty State (no data, no error) ── */}
          {!loading && !loadError && costs.length === 0 && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(79,70,229,0.03))',
              border: '1.5px dashed rgba(99,102,241,0.35)',
              borderRadius: 16, padding: '60px 30px', textAlign: 'center'
            }}>
              <div style={{ fontSize: '3.5rem', marginBottom: 16 }}>📦</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--brand)', marginBottom: 8 }}>
                Cost Registry Is Empty
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: 420, margin: '0 auto 24px' }}>
                No products found for this store. Click <strong>"Sync from Shopify"</strong> to import all products and their costs from your Shopify catalog.
              </div>
              <button
                className="btn btn-primary"
                style={{ padding: '12px 28px', fontSize: '1rem' }}
                onClick={handleSyncShopify}
                disabled={isSyncing}
              >
                {isSyncing ? '⌛ Syncing...' : '🔄 Sync from Shopify Now'}
              </button>
            </div>
          )}

          {/* ── Universal Cross-Tab Search Match Alert Banner ── */}
          {!loading && !loadError && search.trim() && (
            (() => {
              const q = search.toLowerCase().trim();
              const ghostMatches = ghosts.filter(g => isGhostMatch(g, search));
              const pendingMatches = lists.pending.length;
              const verifiedMatches = lists.verified.length;
              const activeMatches = lists.catalog.length;
              const watchdogMatches = (auditData.missingInRegistry || []).filter(a => (a.parent_title || '').toLowerCase().includes(q)).length;
              
              const currentMatches = currentList.length;

              if (currentMatches === 0 && (ghostMatches.length > 0 || pendingMatches > 0 || verifiedMatches > 0 || activeMatches > 0 || watchdogMatches > 0)) {
                return (
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(139,92,246,0.12) 0%, rgba(99,102,241,0.08) 100%)',
                    border: '1.5px solid var(--brand)',
                    borderRadius: 14,
                    padding: '20px 24px',
                    marginBottom: 20,
                    display: 'flex',
                    alignItems: 'center',
                    justify: 'space-between',
                    flexWrap: 'wrap',
                    gap: 16,
                    boxShadow: '0 8px 24px rgba(99,102,241,0.15)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: 12,
                        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 20, fontWeight: 900
                      }}>🔍</div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '0.98rem', color: 'var(--text-primary)' }}>
                          No matches in <strong>"{activeTab.toUpperCase()}"</strong> tab for <em>"{search}"</em>
                        </div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4 }}>
                          {ghostMatches.length > 0 && `Found ${ghostMatches.length} matching item(s) in 👻 Ghosts tab. `}
                          {pendingMatches > 0 && activeTab !== 'pending' && `Found ${pendingMatches} matching item(s) in ⏳ Pending tab. `}
                          {verifiedMatches > 0 && activeTab !== 'verified' && `Found ${verifiedMatches} matching item(s) in ✅ Verified tab. `}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {ghostMatches.length > 0 && activeTab !== 'ghosts' && (
                        <button
                          onClick={() => {
                            setActiveTab('ghosts');
                            setGhostSearch(search);
                          }}
                          className="btn btn-primary"
                          style={{ padding: '8px 16px', fontSize: '0.82rem', background: '#8b5cf6', borderColor: '#8b5cf6', fontWeight: 700 }}
                        >
                          👻 Jump to Ghosts Tab ({ghostMatches.length})
                        </button>
                      )}
                      {pendingMatches > 0 && activeTab !== 'pending' && (
                        <button
                          onClick={() => setActiveTab('pending')}
                          className="btn btn-primary"
                          style={{ padding: '8px 16px', fontSize: '0.82rem', background: '#f59e0b', borderColor: '#f59e0b', fontWeight: 700 }}
                        >
                          ⏳ Jump to Pending Tab ({pendingMatches})
                        </button>
                      )}
                      {verifiedMatches > 0 && activeTab !== 'verified' && (
                        <button
                          onClick={() => setActiveTab('verified')}
                          className="btn btn-primary"
                          style={{ padding: '8px 16px', fontSize: '0.82rem', background: '#22c55e', borderColor: '#22c55e', fontWeight: 700 }}
                        >
                          ✅ Jump to Verified Tab ({verifiedMatches})
                        </button>
                      )}
                    </div>
                  </div>
                );
              }
              return null;
            })()
          )}

          {/* ── Price Drift Action Banner ── */}
          {activeTab === 'drift' && !loading && !loadError && currentList.length > 0 && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.12) 0%, rgba(245, 158, 11, 0.08) 100%)',
              border: '1px solid rgba(234, 179, 8, 0.35)',
              borderRadius: 14,
              padding: '16px 22px',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
              boxShadow: '0 4px 16px rgba(234, 179, 8, 0.08)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 12,
                  background: 'rgba(234, 179, 8, 0.2)',
                  border: '1px solid rgba(234, 179, 8, 0.4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.4rem', flexShrink: 0
                }}>
                  ⚡
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.98rem', color: '#eab308', display: 'flex', alignItems: 'center', gap: 8 }}>
                    Price Drift Detected
                    <span style={{
                      background: 'rgba(234, 179, 8, 0.25)',
                      color: '#eab308',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: 20
                    }}>
                      {currentList.length} Product{currentList.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 3 }}>
                    In products ki cost Shopify par update hui hai lekin ERP ki accepted cost se mukhtalif hai. Nayi cost accept karne se aane wale naye orders ko nayi cost assign ho jayegi.
                  </div>
                </div>
              </div>
              <button
                className="btn btn-primary"
                style={{
                  background: 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)',
                  color: '#000',
                  fontWeight: 800,
                  fontSize: '0.82rem',
                  border: 'none',
                  padding: '9px 18px',
                  borderRadius: 10,
                  boxShadow: '0 4px 12px rgba(234, 179, 8, 0.3)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
                onClick={handleAcceptAllDrifts}
                disabled={bulkProcessing}
              >
                {bulkProcessing ? '⌛ Processing...' : `⚡ Accept All (${currentList.length}) Drifted Costs`}
              </button>
            </div>
          )}

          {/* ── PO-Aware Pending Banner ── */}
          {activeTab === 'pending' && !loading && !loadError && currentList.length > 0 && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.11) 0%, rgba(217, 119, 6, 0.06) 100%)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              borderRadius: 14,
              padding: '14px 20px',
              marginBottom: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 14,
              flexWrap: 'wrap'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10,
                  background: 'rgba(245, 158, 11, 0.18)', border: '1px solid rgba(245, 158, 11, 0.4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0
                }}>📦</div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#f59e0b' }}>
                    {currentList.length} Product{currentList.length > 1 ? 's' : ''} Missing PO / FIFO Cost (Rs 0)
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                    Unit cost is strictly PO-driven (FIFO). Receive a Purchase Order or Initial Baseline PO in <strong>PO &amp; Ledger</strong> to assign verified batch costs.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate('/po-ledger')}
                style={{
                  background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff',
                  fontWeight: 700, fontSize: '0.8rem', border: 'none',
                  padding: '8px 16px', borderRadius: 10, cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(99,102,241,0.28)', whiteSpace: 'nowrap'
                }}
              >
                📦 Open PO &amp; Ledger →
              </button>
            </div>
          )}

          {/* ── Current Tab Empty State ── */}
          {!loading && !loadError && costs.length > 0 && currentList.length === 0 && (
            <div style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 14, padding: '44px 30px', textAlign: 'center'
            }}>
              {hasActiveFilters ? (
                <>
                  <div style={{ fontSize: '2.4rem', marginBottom: 10 }}>🔍</div>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                    No matching products in this tab
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem', marginBottom: 16 }}>
                    Check the <strong>Matches across tabs</strong> bar above or clear your active search/filters.
                  </div>
                  <button type="button" className="btn btn-secondary" onClick={handleClearAllFilters}>
                    ✕ Clear All Filters
                  </button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '2.4rem', marginBottom: 10 }}>
                    {activeTab === 'pending' ? '✅' : activeTab === 'drift' ? '⚡' : activeTab === 'continue_selling' ? '🔄' : activeTab === 'catalog' ? '📦' : '⏳'}
                  </div>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                    {activeTab === 'pending'
                      ? 'All SKUs have verified PO/Master costs!'
                      : activeTab === 'drift'
                        ? 'No price drift detected!'
                        : activeTab === 'continue_selling'
                          ? 'No continue selling products'
                          : activeTab === 'catalog'
                            ? 'No products found in catalog'
                            : 'No verified products yet'}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                    {activeTab === 'pending'
                      ? 'Zero Rs 0 SKUs pending — every variant is ready for accurate FIFO PNL.'
                      : activeTab === 'drift'
                        ? 'All ERP unit costs match the latest costs on Shopify.'
                        : activeTab === 'continue_selling'
                          ? 'None of your variants are set to "Continue Selling when out of stock" on Shopify.'
                          : activeTab === 'catalog'
                            ? 'Try switching the Status dropdown or run Manual Sync.'
                            : 'Receive a Purchase Order in PO & Ledger to verify SKU costs.'}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Main Table (Clean Shopify + FIFO Layout) ── */}
          {!loading && !loadError && currentList.length > 0 && (
          <div className="table-container" style={{ background: 'var(--bg-surface)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', fontSize: '0.73rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ width: 38, textAlign: 'center', padding: '12px 0' }}>
                    <input 
                      type="checkbox" 
                      checked={selectedParents.size === currentList.length && currentList.length > 0}
                      onChange={() => toggleSelectAll(selectedParents.size === currentList.length)}
                    />
                  </th>
                  <th style={{ padding: '12px 14px' }}>Product / Variant &amp; FIFO Batch</th>
                  <th style={{ textAlign: 'right', padding: '12px 10px', whiteSpace: 'nowrap' }}>Shopify Cost</th>
                  <th style={{ textAlign: 'right', padding: '12px 10px', whiteSpace: 'nowrap' }}>FIFO Cost + Pkg</th>
                  <th style={{ textAlign: 'center', padding: '12px 14px', minWidth: 120 }}>Margin</th>
                  <th style={{ textAlign: 'left', padding: '12px 12px', minWidth: 165 }}>Inventory</th>
                  <th style={{ textAlign: 'right', padding: '12px 14px', whiteSpace: 'nowrap' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentList.map(p => {
                  const pStatus = (p.variants[0]?.status || 'active').toLowerCase();
                  const statusStyle = pStatus === 'active'
                    ? { color: '#10b981', bg: 'rgba(16,185,129,0.12)', bd: 'rgba(16,185,129,0.35)' }
                    : pStatus === 'draft'
                      ? { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', bd: 'rgba(245,158,11,0.35)' }
                      : pStatus === 'unlisted'
                        ? { color: '#db2777', bg: 'rgba(219,39,119,0.12)', bd: 'rgba(219,39,119,0.35)' }
                        : { color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', bd: 'rgba(148,163,184,0.35)' };

                  const invColor = p.backorderUnits > 0 ? '#a855f7' : (p.totalQty <= 0 ? '#ef4444' : (p.totalQty <= 10 ? '#f59e0b' : '#10b981'));
                  const landedRange = Array.from(p.uniqueLanded || []).sort((a, b) => a - b);
                  const shopCosts = Array.from(p.uniqueCosts || []).filter(c => c > 0).sort((a, b) => a - b);

                  return (
                  <React.Fragment key={p.name}>
                    <tr style={{ 
                      background: p.isFullyVerified ? 'rgba(16, 185, 129, 0.035)' : (p.isPartiallyVerified ? 'rgba(245, 158, 11, 0.055)' : 'transparent'), 
                      cursor: 'pointer',
                      borderLeft: p.isFullyVerified ? '3.5px solid #10b981' : (p.isPartiallyVerified ? '3.5px solid #f59e0b' : '3.5px solid #ef4444'),
                      borderBottom: '1px solid var(--border)',
                      transition: 'background 0.15s ease'
                    }} onClick={() => toggleParent(p.name)}>
                      <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <input 
                          type="checkbox" 
                          checked={selectedParents.has(p.name)}
                          onClick={(e) => {
                            const checked = e.target.checked;
                            const currentIndex = currentList.findIndex(item => item.name === p.name);
                            if (e.shiftKey && lastSelectedParentIndex !== null) {
                              const start = Math.min(currentIndex, lastSelectedParentIndex);
                              const end = Math.max(currentIndex, lastSelectedParentIndex);
                              const namesInRange = currentList.slice(start, end + 1).map(item => item.name);
                              const next = new Set(selectedParents);
                              if (checked) {
                                namesInRange.forEach(name => next.add(name));
                              } else {
                                namesInRange.forEach(name => next.delete(name));
                              }
                              setSelectedParents(next);
                            } else {
                              toggleSelectParent(p.name);
                            }
                            setLastSelectedParentIndex(currentIndex);
                          }}
                          readOnly
                        />
                      </td>
                      <td style={{ padding: '13px 14px', color: 'var(--text-primary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', width: 12, textAlign: 'center' }}>
                            {expandedParents.has(p.name) ? '▼' : '▶'}
                          </span>
                          
                          {(() => {
                            const firstImage = p.variants.find(v => v.variant_image_url)?.variant_image_url;
                            return firstImage ? (
                              <img 
                                src={firstImage} 
                                alt={p.name} 
                                style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--border)', flexShrink: 0 }} 
                              />
                            ) : (
                              <div style={{ width: 40, height: 40, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-elevated)', border: '1px solid var(--border)', fontSize: '1.1rem', flexShrink: 0 }}>
                                📦
                              </div>
                            );
                          })()}

                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>{p.name}</span>
                              <span style={{
                                fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em',
                                color: statusStyle.color, background: statusStyle.bg, border: `1px solid ${statusStyle.bd}`,
                                padding: '1px 6px', borderRadius: 20
                              }}>
                                {pStatus}
                              </span>
                              {p.isFullyVerified && (
                                <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#10b981', background: 'rgba(16,185,129,0.12)', padding: '1px 6px', borderRadius: 20 }}>✅ VERIFIED</span>
                              )}
                              {p.isPartiallyVerified && (
                                <span
                                  title={`${p.verifiedCount} of ${p.totalVariants} variants have cost — ${p.pendingCount} at Rs 0`}
                                  style={{ fontSize: '0.62rem', fontWeight: 700, color: '#d97706', background: 'rgba(245, 158, 11, 0.14)', border: '1px solid rgba(245, 158, 11, 0.35)', padding: '1px 6px', borderRadius: 20 }}
                                >
                                  ⚠️ PARTIAL ({p.verifiedCount}/{p.totalVariants})
                                </span>
                              )}
                              {p.hasDrift && (
                                <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#eab308', background: 'rgba(234,179,8,0.14)', padding: '1px 6px', borderRadius: 20 }}>⚡ DRIFT</span>
                              )}
                              {p.hasContinueSelling && (
                                <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#a855f7', background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.3)', padding: '1px 6px', borderRadius: 20 }}>🔄 CONTINUE</span>
                              )}
                            </div>

                            {/* Active FIFO PO Summary Line */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap', fontSize: '0.72rem' }}>
                              {p.poNumbersList && p.poNumbersList.length > 0 ? (
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                  padding: '1px 7px', borderRadius: 6, fontWeight: 700, fontSize: '0.68rem',
                                  background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1',
                                  border: '1px solid rgba(99, 102, 241, 0.28)'
                                }}>
                                  📦 {p.poNumbersList.length === 1 ? p.poNumbersList[0] : `${p.poNumbersList[0]} +${p.poNumbersList.length - 1} POs`} · {p.totalFifoQty} FIFO left
                                </span>
                              ) : p.hasPending ? (
                                <span style={{ color: '#ef4444', fontWeight: 600 }}>⚠️ Needs PO Cost ({p.pendingCount} variant{p.pendingCount > 1 ? 's' : ''} at Rs 0)</span>
                              ) : (
                                <span style={{ color: 'var(--text-muted)' }}>Master Cost · No open FIFO PO batch</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Shopify Cost Range */}
                      <td style={{ textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.82rem', padding: '0 10px', fontVariantNumeric: 'tabular-nums' }}>
                        {shopCosts.length > 0
                          ? (shopCosts.length === 1 ? `Rs ${shopCosts[0].toLocaleString()}` : `Rs ${shopCosts[0].toLocaleString()}–${shopCosts[shopCosts.length - 1].toLocaleString()}`)
                          : '—'}
                      </td>

                      {/* FIFO Landed Cost & Total Shelf Value */}
                      <td style={{ textAlign: 'right', padding: '0 10px', fontVariantNumeric: 'tabular-nums' }}>
                        <div style={{ fontWeight: 800, fontSize: '0.85rem', color: p.isFullyVerified ? '#10b981' : (p.isPartiallyVerified ? '#d97706' : '#ef4444') }}>
                          {landedRange.length > 0
                            ? (landedRange.length === 1 ? `Rs ${landedRange[0].toLocaleString()}` : `Rs ${landedRange[0].toLocaleString()}–${landedRange[landedRange.length - 1].toLocaleString()}`)
                            : 'Rs 0'}
                        </div>
                        {p.totalValue > 0 && (
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>
                            Val: Rs {Math.round(p.totalValue).toLocaleString()}
                          </div>
                        )}
                      </td>

                      {/* Margin Bar */}
                      <td style={{ padding: '0 14px' }}>
                        {p.margin !== null ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <div style={{ flex: 1, height: 6, background: 'var(--bg-elevated)', borderRadius: 4, overflow: 'hidden', minWidth: 56 }}>
                              <div style={{
                                height: '100%',
                                width: `${Math.min(Math.max(p.margin, 0), 100)}%`,
                                background: p.margin >= 40 ? '#10b981' : p.margin >= 20 ? '#f59e0b' : '#ef4444',
                                borderRadius: 4,
                                transition: 'width 0.4s ease'
                              }} />
                            </div>
                            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: p.margin >= 40 ? '#10b981' : p.margin >= 20 ? '#f59e0b' : '#ef4444', minWidth: 34, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                              {p.margin}%
                            </span>
                          </div>
                        ) : <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>}
                      </td>

                      {/* Shopify-Style Inventory Stats (Available / On Hand / Committed / Incoming) */}
                      <td style={{ padding: '10px 12px', fontVariantNumeric: 'tabular-nums' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', fontWeight: 700, color: invColor }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: invColor, flexShrink: 0 }} />
                          <span>{p.totalQty} avail</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', fontSize: '0.69rem', marginTop: 2.5 }}>
                          <span style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>On Hand: {p.totalOnHand}</span>
                          {p.totalCommitted > 0 && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); openCommittedModal(p.variants.map(v => v.id), p.name); }}
                              title="Click to view committed orders in Command Center"
                              style={{ padding: '1px 6px', borderRadius: 4, background: 'rgba(245,158,11,0.16)', color: '#b45309', border: '1px solid rgba(245,158,11,0.40)', fontWeight: 800, fontSize: '0.68rem', cursor: 'pointer' }}
                            >
                              Committed: {p.totalCommitted}
                            </button>
                          )}
                          {p.totalIncoming > 0 && (
                            <span
                              title="Pending stock incoming from open POs / Shopify transfers"
                              style={{ padding: '0.5px 5px', borderRadius: 4, background: 'rgba(37,99,235,0.11)', color: '#2563eb', fontWeight: 700 }}
                            >
                              +{p.totalIncoming} in
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 1.5 }}>
                          for {p.totalVariants} variant{p.totalVariants !== 1 ? 's' : ''}
                          {p.outOfStockVariants > 0 && p.inStockVariants > 0 && (
                            <span style={{ color: '#ef4444', fontWeight: 600 }}> · {p.outOfStockVariants} OOS</span>
                          )}
                          {p.backorderUnits > 0 && (
                            <span style={{ color: '#a855f7', fontWeight: 700 }}> · -{p.backorderUnits} BO</span>
                          )}
                        </div>
                      </td>

                      <td style={{ textAlign: 'right', padding: '10px 14px', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                        {activeTab === 'drift' && (
                          <button className="btn btn-icon" title="Accept All Shopify Costs (Price Drift)" onClick={() => handleBulkAccept(p.name)}>✅</button>
                        )}
                        <button
                          className="btn btn-icon"
                          title="Bulk Set Packaging Cost (FIFO unit costs preserved)"
                          onClick={() => {
                            const firstPkg = p.variants[0]?.packaging_cost || 0;
                            setBulkItem(p);
                            setBulkForm({ unit_cost: 0, packaging_cost: firstPkg });
                            setShowBulkModal(true);
                          }}
                        >📦</button>
                        <button className="btn btn-icon" title="Delete Product from Registry" onClick={() => handleDeleteParent(p.name)}>🗑️</button>
                      </td>
                    </tr>
                    {expandedParents.has(p.name) && (() => {
                      const renderVariantRow = (v, i, indentLeft = 44) => {
                        const isDirectHit = search.trim().length >= 2 && matchesVariantSearch(v, p.name, search);
                        const unitCost = Number(v.unit_cost) || 0;
                        const pkgCost = Number(v.packaging_cost) || 0;
                        const landed = unitCost + pkgCost;
                        const qty = Number(v.inventory_qty) || 0;
                        const vInvColor = qty < 0 ? '#a855f7' : (qty === 0 ? '#ef4444' : (qty <= 10 ? '#f59e0b' : '#10b981'));
                        const vInvLabel = qty < 0 ? `${qty} backorder` : (qty === 0 ? '0 out of stock' : (qty <= 10 ? `${qty} low stock` : `${qty} in stock`));
                        const key = v.id || `${v.parent_title}@@@${v.variant_title}`;
                        const edit = inlineEdits[key];
                        const isSaving = savingInline === key;
                        const batchesTooltip = (v.fifo_batches || []).map(b => `${b.po_number}: ${b.remaining_qty} left @ Rs ${b.batch_unit_cost}${b.received_date ? ` (${b.received_date})` : ''}`).join('\n');

                        return (
                          <tr key={v.id || i} style={{ 
                            borderBottom: '1px solid var(--border)',
                            backgroundColor: isDirectHit
                              ? 'rgba(99, 102, 241, 0.09)'
                              : (landed > 0 ? 'rgba(16, 185, 129, 0.02)' : 'rgba(239, 68, 68, 0.025)'),
                            boxShadow: isDirectHit ? 'inset 3px 0 0 var(--brand)' : 'none'
                          }}>
                            <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                              <input 
                                type="checkbox" 
                                checked={selectedVariants.has(v.id)}
                                onChange={() => {
                                  const next = new Set(selectedVariants);
                                  if (next.has(v.id)) next.delete(v.id);
                                  else next.add(v.id);
                                  setSelectedVariants(next);
                                }}
                              />
                            </td>
                            <td style={{ padding: `10px 14px 10px ${indentLeft}px`, color: 'var(--text-secondary)', fontWeight: 500 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                {v.variant_image_url ? (
                                  <img src={v.variant_image_url} alt={v.variant_title || 'Default'} style={{ width: 30, height: 30, borderRadius: 6, objectFit: 'cover', border: '1px solid var(--border)', flexShrink: 0 }} />
                                ) : (
                                  <div style={{ width: 30, height: 30, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-elevated)', border: '1px solid var(--border)', fontSize: '0.8rem', flexShrink: 0 }}>📷</div>
                                )}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: 600, fontSize: '0.84rem', color: 'var(--text-primary)' }}>{v.variant_title || 'Default'}</span>
                                    {v.sku ? (
                                      <span style={{ fontSize: '0.66rem', fontFamily: 'monospace', padding: '1px 5px', borderRadius: 4, background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                                        {v.sku}
                                      </span>
                                    ) : (
                                      <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>NO SKU</span>
                                    )}
                                    {isDirectHit && (
                                      <span style={{ fontSize: '0.6rem', color: 'var(--brand)', background: 'rgba(99,102,241,0.16)', border: '1px solid rgba(99,102,241,0.35)', padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>🎯 MATCH</span>
                                    )}
                                    {unitCost > 0 && v.shopify_cost > 0 && Math.abs(v.shopify_cost - unitCost) >= 1 && (
                                      <span style={{ fontSize: '0.6rem', color: '#eab308', background: 'rgba(234,179,8,0.15)', padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>⚡ DRIFT</span>
                                    )}
                                    {v.inventory_policy === 'continue' && (
                                      <span style={{ fontSize: '0.6rem', color: '#a855f7', background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.35)', padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>CONTINUE</span>
                                    )}
                                  </div>

                                  {/* Active FIFO PO Batch Chip */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                    {v.active_po_number ? (
                                      <span
                                        title={batchesTooltip || `Active FIFO PO: ${v.active_po_number}`}
                                        style={{
                                          display: 'inline-flex', alignItems: 'center', gap: 4,
                                          fontSize: '0.66rem', fontWeight: 700,
                                          color: '#6366f1', background: 'rgba(99,102,241,0.1)',
                                          border: '1px solid rgba(99,102,241,0.28)',
                                          padding: '1px 6px', borderRadius: 5
                                        }}
                                      >
                                        📦 {v.active_po_number} · {v.fifo_remaining_qty} left
                                        {v.fifo_batch_count > 1 && <span style={{ opacity: 0.75 }}>({v.fifo_batch_count} batches)</span>}
                                      </span>
                                    ) : landed > 0 ? (
                                      <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>🔒 Master Cost · No open FIFO PO</span>
                                    ) : (
                                      <span style={{ fontSize: '0.66rem', fontWeight: 700, color: '#ef4444' }}>⚠️ Rs 0 — Receive PO in PO &amp; Ledger</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Shopify Cost */}
                            <td style={{ textAlign: 'right', color: 'var(--brand)', fontSize: '0.82rem', padding: '0 10px', fontVariantNumeric: 'tabular-nums' }}>
                              {v.shopify_cost > 0 ? (
                                <div>
                                  <div>Rs {v.shopify_cost.toLocaleString()}</div>
                                  {unitCost > 0 && Math.abs(v.shopify_cost - unitCost) >= 1 && (
                                    <div style={{
                                      fontSize: '0.65rem', fontWeight: 700,
                                      color: v.shopify_cost > unitCost ? '#ef4444' : '#22c55e', marginTop: 1
                                    }}>
                                      {v.shopify_cost > unitCost
                                        ? `▲ +Rs ${(v.shopify_cost - unitCost).toLocaleString()}`
                                        : `▼ -Rs ${(unitCost - v.shopify_cost).toLocaleString()}`}
                                    </div>
                                  )}
                                </div>
                              ) : '—'}
                            </td>

                            {/* FIFO Cost + Packaging (Half-Locked Inline Edit) */}
                            <td style={{ textAlign: 'right', padding: '8px 10px', fontVariantNumeric: 'tabular-nums' }}>
                              {edit ? (
                                <div style={{ display: 'flex', gap: 5, alignItems: 'center', justifyContent: 'flex-end' }}>
                                  <span
                                    title="Unit Cost is PO/FIFO-driven (locked). Receive a Purchase Order in PO & Ledger to update unit cost."
                                    style={{
                                      display: 'inline-flex', alignItems: 'center', gap: 3,
                                      padding: '4px 7px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 700,
                                      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                                      color: 'var(--text-muted)', cursor: 'not-allowed'
                                    }}
                                  >
                                    🔒 Rs {unitCost.toLocaleString()}
                                  </span>
                                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 700 }}>+</span>
                                  <input
                                    type="number"
                                    className="form-input"
                                    placeholder="Pkg Rs"
                                    title="Packaging Cost (Rs)"
                                    value={edit.packaging_cost}
                                    onChange={e => setInlineEdits({ ...inlineEdits, [key]: { ...edit, packaging_cost: e.target.value } })}
                                    style={{ width: 64, height: 28, fontSize: '0.8rem', textAlign: 'right', padding: '0 6px', borderColor: '#6366f1' }}
                                    onClick={e => e.stopPropagation()}
                                    autoFocus
                                  />
                                </div>
                              ) : (
                                <div>
                                  <div style={{ fontWeight: 800, fontSize: '0.85rem', color: landed > 0 ? '#10b981' : '#ef4444' }}>
                                    {landed > 0 ? `Rs ${landed.toLocaleString()}` : 'Rs 0'}
                                  </div>
                                  {landed > 0 && (
                                    <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: 1 }}>
                                      🔒 {unitCost.toLocaleString()} + 📦 {pkgCost.toLocaleString()}
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* Margin */}
                            <td style={{ padding: '8px 14px' }}>
                              {(() => {
                                const selling = v.selling_price || 0;
                                if (landed > 0 && selling > 0) {
                                  const m = Math.round(((selling - landed) / selling) * 100);
                                  const mCol = m >= 40 ? '#10b981' : m >= 20 ? '#f59e0b' : '#ef4444';
                                  return (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <div style={{ width: 46, height: 5, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: `${Math.min(Math.max(m, 0), 100)}%`, background: mCol, borderRadius: 3 }} />
                                      </div>
                                      <span style={{ fontSize: '0.73rem', fontWeight: 700, color: mCol, fontVariantNumeric: 'tabular-nums' }}>{m}%</span>
                                    </div>
                                  );
                                }
                                return <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>;
                              })()}
                            </td>

                            {/* Shopify-Style Variant Inventory (Available / On Hand / Committed / Incoming) */}
                            <td style={{ padding: '8px 12px', fontVariantNumeric: 'tabular-nums' }}>
                              {(() => {
                                const vComm = Number(v.committed_qty) || 0;
                                const vOnHand = (v.on_hand_qty !== null && v.on_hand_qty !== undefined) ? Number(v.on_hand_qty) : (qty + vComm);
                                const vInc = Number(v.incoming_qty) || 0;
                                return (
                                  <>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.76rem', fontWeight: 700, color: vInvColor }}>
                                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: vInvColor }} />
                                      <span>{vInvLabel}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', fontSize: '0.67rem', marginTop: 2 }}>
                                      <span style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>On Hand: {vOnHand}</span>
                                      {vComm > 0 && (
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); openCommittedModal([v.id], `${v.parent_title} — ${v.variant_title || 'Default'}`); }}
                                          title="Click to view committed orders in Command Center"
                                          style={{ padding: '1px 5.5px', borderRadius: 4, background: 'rgba(245,158,11,0.16)', color: '#b45309', border: '1px solid rgba(245,158,11,0.40)', fontWeight: 800, fontSize: '0.66rem', cursor: 'pointer' }}
                                        >
                                          Comm: {vComm}
                                        </button>
                                      )}
                                      {vInc > 0 && (
                                        <span style={{ padding: '0.5px 4.5px', borderRadius: 4, background: 'rgba(37,99,235,0.11)', color: '#2563eb', fontWeight: 700 }}>
                                          +{vInc} in
                                        </span>
                                      )}
                                    </div>
                                    {v.fifo_remaining_qty > 0 && (
                                      <div style={{ fontSize: '0.65rem', color: '#6366f1', fontWeight: 600, marginTop: 1 }}>
                                        PO FIFO: {v.fifo_remaining_qty} left
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </td>

                            {/* Actions */}
                            <td style={{ textAlign: 'right', padding: '8px 14px', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                              {edit ? (
                                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                  <button className="btn btn-primary btn-sm" style={{ padding: '3px 10px', fontSize: '0.74rem', height: 28 }} onClick={() => handleInlineSave(v)} disabled={isSaving}>{isSaving ? '⌛' : '✓ Save'}</button>
                                  <button className="btn btn-secondary btn-sm" style={{ padding: '3px 8px', fontSize: '0.74rem', height: 28 }} onClick={() => { const n={...inlineEdits}; delete n[key]; setInlineEdits(n); }}>✕</button>
                                </div>
                              ) : (
                                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                  {activeTab === 'drift' && v.shopify_cost > 0 && Math.abs(v.shopify_cost - unitCost) >= 1 && (
                                    <button className="btn btn-icon" title="Accept Shopify Cost (Price Drift)" onClick={() => handleAcceptShopifyCost(v)}>✅</button>
                                  )}
                                  {landed <= 0 && (
                                    <button className="btn btn-icon" title="Receive PO in PO & Ledger" onClick={() => navigate('/po-ledger')}>📦</button>
                                  )}
                                  <button
                                    className="btn btn-icon"
                                    title="Edit Packaging Cost (Unit cost is PO-locked)"
                                    onClick={() => setInlineEdits({ ...inlineEdits, [key]: { unit_cost: unitCost, packaging_cost: pkgCost } })}
                                  >✏️</button>
                                  <button className="btn btn-icon" title="Delete variant from registry" style={{ color: '#ef4444' }} onClick={() => handleDeleteVariant(v.parent_title, v.variant_title)}>🗑️</button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      };

                      if (groupVariantsBy === 'none') {
                        return p.variants.map((v, i) => renderVariantRow(v, i, 44));
                      }

                      // Grouped variations rendering
                      const groups = {};
                      p.variants.forEach(v => {
                        const parts = (v.variant_title || '').split('/').map(s => s.trim());
                        const opt1 = parts[0] || 'Default';
                        const opt2 = parts[1] || '';
                        const groupKey = groupVariantsBy === 'opt1' ? opt1 : (opt2 || 'Default');
                        if (!groups[groupKey]) groups[groupKey] = [];
                        groups[groupKey].push(v);
                      });

                      return Object.entries(groups).map(([groupName, groupVariants]) => {
                        const groupPathKey = `${p.name}@@@${groupName}`;
                        const isGroupExpanded = expandedGroups.has(groupPathKey);
                        const groupIds = groupVariants.map(v => v.id);
                        const isAllSelected = groupIds.every(id => selectedVariants.has(id));
                        
                        const totalStock = groupVariants.reduce((acc, v) => acc + (Number(v.inventory_qty) || 0), 0);
                        const groupCommitted = groupVariants.reduce((acc, v) => acc + (Number(v.committed_qty) || 0), 0);
                        const groupOnHand = groupVariants.reduce((acc, v) => acc + ((v.on_hand_qty !== null && v.on_hand_qty !== undefined) ? Number(v.on_hand_qty) : ((Number(v.inventory_qty) || 0) + (Number(v.committed_qty) || 0))), 0);
                        const groupFifoQty = groupVariants.reduce((acc, v) => acc + (Number(v.fifo_remaining_qty) || 0), 0);
                        const shopifyCosts = groupVariants.map(v => v.shopify_cost || 0).filter(Boolean);
                        const shopifyMin = shopifyCosts.length ? Math.min(...shopifyCosts) : 0;
                        const shopifyMax = shopifyCosts.length ? Math.max(...shopifyCosts) : 0;
                        
                        const landedCosts = groupVariants.map(v => (v.unit_cost || 0) + (v.packaging_cost || 0));
                        const landedMin = Math.min(...landedCosts);
                        const landedMax = Math.max(...landedCosts);

                        const validMargins = groupVariants.map(v => {
                          const landed = (v.unit_cost || 0) + (v.packaging_cost || 0);
                          const selling = v.selling_price || 0;
                          return landed > 0 && selling > 0 ? Math.round(((selling - landed) / selling) * 100) : null;
                        }).filter(m => m !== null);
                        const avgGroupMargin = validMargins.length ? Math.round(validMargins.reduce((acc, m) => acc + m, 0) / validMargins.length) : null;
                        const gInvColor = totalStock < 0 ? '#a855f7' : (totalStock === 0 ? '#ef4444' : (totalStock <= 10 ? '#f59e0b' : '#10b981'));

                        return (
                          <React.Fragment key={groupName}>
                            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)', cursor: 'pointer' }}>
                              <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                                <input 
                                  type="checkbox"
                                  checked={isAllSelected && groupVariants.length > 0}
                                  onChange={() => {
                                    const next = new Set(selectedVariants);
                                    if (isAllSelected) groupIds.forEach(id => next.delete(id));
                                    else groupIds.forEach(id => next.add(id));
                                    setSelectedVariants(next);
                                  }}
                                />
                              </td>
                              <td style={{ padding: '10px 14px 10px 40px', fontWeight: 700, color: 'var(--text-primary)' }} onClick={() => {
                                const next = new Set(expandedGroups);
                                if (next.has(groupPathKey)) next.delete(groupPathKey);
                                else next.add(groupPathKey);
                                setExpandedGroups(next);
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{isGroupExpanded ? '▼' : '▶'}</span>
                                  {groupVariants[0]?.variant_image_url ? (
                                    <img src={groupVariants[0].variant_image_url} alt={groupName} style={{ width: 28, height: 28, borderRadius: 5, objectFit: 'cover' }} />
                                  ) : (
                                    <div style={{ width: 28, height: 28, borderRadius: 5, background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>📷</div>
                                  )}
                                  <div>
                                    <span>{groupName}</span>
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 'normal', marginLeft: 8 }}>({groupVariants.length} variants)</span>
                                  </div>
                                </div>
                              </td>
                              <td style={{ textAlign: 'right', padding: '0 10px', color: 'var(--text-secondary)', fontSize: '0.82rem', fontVariantNumeric: 'tabular-nums' }}>
                                {shopifyMin > 0 ? (shopifyMin === shopifyMax ? `Rs ${shopifyMin.toLocaleString()}` : `Rs ${shopifyMin.toLocaleString()}–${shopifyMax.toLocaleString()}`) : '—'}
                              </td>
                              <td style={{ textAlign: 'right', padding: '0 10px', fontWeight: 700, color: landedMax > 0 ? '#10b981' : 'var(--text-muted)', fontSize: '0.84rem', fontVariantNumeric: 'tabular-nums' }}>
                                {landedMax > 0 ? (landedMin === landedMax ? `Rs ${landedMin.toLocaleString()}` : `Rs ${landedMin.toLocaleString()}–${landedMax.toLocaleString()}`) : '—'}
                              </td>
                              <td style={{ padding: '0 14px' }}>
                                {avgGroupMargin !== null ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <div style={{ width: 46, height: 5, background: 'var(--bg-surface)', borderRadius: 3, overflow: 'hidden' }}>
                                      <div style={{ height: '100%', width: `${Math.min(Math.max(avgGroupMargin, 0), 100)}%`, background: avgGroupMargin >= 40 ? '#10b981' : avgGroupMargin >= 20 ? '#f59e0b' : '#ef4444', borderRadius: 3 }} />
                                    </div>
                                    <span style={{ fontSize: '0.73rem', fontWeight: 700, color: avgGroupMargin >= 40 ? '#10b981' : avgGroupMargin >= 20 ? '#f59e0b' : '#ef4444' }}>{avgGroupMargin}%</span>
                                  </div>
                                ) : '—'}
                              </td>
                              <td style={{ padding: '8px 12px', fontVariantNumeric: 'tabular-nums' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', fontWeight: 700, color: gInvColor }}>
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: gInvColor }} />
                                  <span>{totalStock} avail</span>
                                </div>
                                <div style={{ fontSize: '0.67rem', color: 'var(--text-secondary)', fontWeight: 700, marginTop: 1.5, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                                  <span>On Hand: {groupOnHand}</span>
                                  {groupCommitted > 0 && (
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); openCommittedModal(groupIds, `${p.name} — ${groupName}`); }}
                                      title="Click to view committed orders in Command Center"
                                      style={{ padding: '0.5px 5px', borderRadius: 4, background: 'rgba(245,158,11,0.16)', color: '#b45309', border: '1px solid rgba(245,158,11,0.40)', fontWeight: 800, fontSize: '0.65rem', cursor: 'pointer' }}
                                    >
                                      Comm: {groupCommitted}
                                    </button>
                                  )}
                                </div>
                                {groupFifoQty > 0 && <div style={{ fontSize: '0.65rem', color: '#6366f1', fontWeight: 600 }}>PO FIFO: {groupFifoQty} left</div>}
                              </td>
                              <td style={{ textAlign: 'right', padding: '10px 14px' }} onClick={e => e.stopPropagation()}>
                                <button className="btn btn-icon" title="Bulk Set Group Packaging Cost" onClick={() => {
                                  setBulkItem({ name: `${p.name} - ${groupName}`, ids: groupIds });
                                  setBulkForm({ unit_cost: 0, packaging_cost: groupVariants[0]?.packaging_cost || 0 });
                                  setShowBulkModal(true);
                                }}>📦</button>
                                <button className="btn btn-icon" title="Bulk Delete Group Variants" style={{ color: '#ef4444' }} onClick={async () => {
                                  if (!window.confirm(`Are you sure you want to delete all ${groupVariants.length} variants in group "${groupName}"?`)) return;
                                  try {
                                    const res = await fetch('/api/finance/bulk-delete-master-variants', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ store_id: activeStoreId, ids: groupIds })
                                    });
                                    if (res.ok) {
                                      addToast(`Deleted group "${groupName}" successfully`, 'success');
                                      fetchCosts();
                                    }
                                  } catch (e) { addToast('Group delete failed', 'error'); }
                                }}>🗑️</button>
                              </td>
                            </tr>

                            {isGroupExpanded && groupVariants.map((v, i) => renderVariantRow(v, i, 64))}
                          </React.Fragment>
                        );
                      });
                    })()}
                  </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          )} {/* end !loading && !loadError && currentList.length > 0 */}
        </>
      )}

      {activeTab === 'watchdog' && (
        <div className="stat-card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border)', borderRadius: 12 }}>
          {/* Compact Unified Panel Header */}
          <div style={{
            padding: '11px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
            background: 'var(--bg-elevated)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '1rem' }}>🚨</span>
              <h3 style={{ margin: 0, fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)' }}>Priority Prevention List</h3>
              {(() => {
                const totalAlerts = filteredWatchdog.total;
                const multiGroups = watchdogGroupedRows.filter(r => r._kind === 'group' && r.variants.length > 1);
                const allExpanded = multiGroups.length > 0 && multiGroups.every(g => expandedWatchdogGroups.has(g.groupKey));
                return (
                  <>
                    {totalAlerts > 0 && (
                      <span style={{
                        background: 'rgba(220,38,38,0.10)', color: '#dc2626',
                        border: '1px solid rgba(220,38,38,0.30)', borderRadius: 20,
                        padding: '2px 9px', fontSize: '0.7rem', fontWeight: 700
                      }}>
                        {watchdogGroupedRows.length} group{watchdogGroupedRows.length !== 1 ? 's' : ''} · {totalAlerts} alert{totalAlerts !== 1 ? 's' : ''}
                      </span>
                    )}
                    {multiGroups.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          if (allExpanded) setExpandedWatchdogGroups(new Set());
                          else setExpandedWatchdogGroups(new Set(multiGroups.map(g => g.groupKey)));
                        }}
                        style={{
                          padding: '3px 9px', borderRadius: 7, fontSize: '0.71rem', fontWeight: 600,
                          background: 'var(--bg-surface)', color: 'var(--text-secondary)',
                          border: '1px solid var(--border)', cursor: 'pointer'
                        }}
                      >
                        {allExpanded ? '▲ Collapse All' : `▼ Expand All (${multiGroups.length})`}
                      </button>
                    )}
                  </>
                )
              })()}
            </div>

            {/* Unified Filter Pills (Rs 0 Parity!) */}
            <div style={{ display: 'flex', gap: 3, background: 'var(--bg-surface)', border: '1px solid var(--border)', padding: 3, borderRadius: 8 }}>
              {[
                { id: 'all', label: 'All Alerts', count: filteredWatchdog.total },
                { id: 'missing', label: 'Missing Mapping', count: filteredWatchdog.missing.length },
                { id: 'zero', label: 'Rs 0 Costs', count: filteredWatchdog.zero.length },
                { id: 'orders', label: 'Order Risks', count: filteredWatchdog.orders.length },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setAuditFilter(tab.id)}
                  style={{
                    padding: '5px 11px',
                    borderRadius: 6,
                    border: 'none',
                    background: auditFilter === tab.id ? 'var(--bg-elevated)' : 'transparent',
                    color: auditFilter === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontWeight: auditFilter === tab.id ? 700 : 500,
                    fontSize: '0.76rem',
                    cursor: 'pointer',
                    transition: 'all 0.14s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5
                  }}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span style={{
                      background: auditFilter === tab.id ? '#dc2626' : 'var(--border)',
                      color: auditFilter === tab.id ? '#fff' : 'var(--text-secondary)',
                      borderRadius: 10, padding: '1px 6px', fontSize: '0.66rem', fontWeight: 700
                    }}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-elevated)' }}>
                  {['Product / Variant', 'Issue Type', 'Stock', 'Risk Level', 'Action'].map(col => (
                    <th key={col} style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontWeight: 600,
                      fontSize: '0.72rem',
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      borderBottom: '1px solid var(--border)',
                      whiteSpace: 'nowrap'
                    }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadingAudit ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '60px 16px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: 'var(--text-muted)' }}>
                        <div style={{ fontSize: 36 }}>🔍</div>
                        <p style={{ margin: 0 }}>Scanning your store for potential profit leaks...</p>
                      </div>
                    </td>
                  </tr>
                ) : (() => {
                  if (watchdogGroupedRows.length === 0) {
                    return (
                      <tr>
                        <td colSpan={5} style={{ padding: '60px 16px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: 'var(--green)' }}>
                            <div style={{ fontSize: 48 }}>✅</div>
                            <p style={{ margin: 0, fontWeight: 600 }}>Everything looks perfect! No cost issues detected.</p>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>All variants are properly mapped with non-zero costs.</p>
                          </div>
                        </td>
                      </tr>
                    )
                  }

                  return watchdogGroupedRows.map((entry, i) => {
                    const isOrder = entry._kind === 'order';
                    const isMissing = entry._type === 'missing';
                    const isZero = entry._type === 'zero';

                    const badgeColor = isMissing ? 'var(--red)' : isZero ? 'var(--orange)' : 'var(--purple)';
                    const badgeBg = isMissing ? 'var(--red-dim)' : isZero ? 'var(--orange-dim)' : 'var(--purple-dim)';
                    const badgeLabel = isMissing ? '🔴 Unmapped' : isZero ? '🟠 Zero Cost' : '🔥 Live Leak';

                    const riskLabel = isOrder ? '🔴 Critical' : isMissing ? '🟡 High' : '🟠 Medium';
                    const riskColor = isOrder ? 'var(--red)' : isMissing ? 'var(--yellow)' : 'var(--orange)';
                    const riskBg = isOrder ? 'var(--red-dim)' : isMissing ? 'var(--yellow-dim)' : 'var(--orange-dim)';

                    if (isOrder) {
                      return (
                        <tr
                          key={entry.groupKey}
                          style={{
                            borderBottom: '1px solid var(--border)',
                            background: i % 2 === 0 ? 'transparent' : 'var(--bg-hover)',
                            transition: 'background 0.15s ease'
                          }}
                        >
                          <td style={{ padding: '14px 16px', maxWidth: 320 }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{entry.customer_name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>Order #{entry.shopify_order_id}</div>
                          </td>
                          <td style={{ padding: '14px 16px' }}>
                            <span style={{
                              display: 'inline-block', padding: '4px 12px', borderRadius: 20,
                              fontSize: '0.72rem', fontWeight: 700,
                              background: badgeBg, color: badgeColor,
                              border: `1px solid ${badgeColor}`
                            }}>{badgeLabel}</span>
                          </td>
                          <td style={{ padding: '14px 16px', color: 'var(--text-muted)' }}>—</td>
                          <td style={{ padding: '14px 16px' }}>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              padding: '3px 10px', borderRadius: 6,
                              fontSize: '0.75rem', fontWeight: 600,
                              background: riskBg, color: riskColor
                            }}>{riskLabel}</span>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>{entry.price} PKR</div>
                          </td>
                          <td style={{ padding: '14px 16px' }}>
                            <button
                              onClick={() => handleHealOrderCost(entry.shopify_order_id)}
                              style={{
                                padding: '6px 14px', borderRadius: 6, border: 'none',
                                background: 'var(--red)', color: '#fff',
                                fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                                boxShadow: '0 2px 8px rgba(239,68,68,0.25)'
                              }}
                            >
                              ⚡ Heal Now
                            </button>
                          </td>
                        </tr>
                      )
                    }

                    const isMulti = entry.variants.length > 1;
                    const isExpanded = isMulti && expandedWatchdogGroups.has(entry.groupKey);
                    const singleVar = entry.variants[0];

                    return (
                      <React.Fragment key={entry.groupKey}>
                        {/* Parent Group Row */}
                        <tr
                          onClick={() => isMulti && toggleWatchdogGroup(entry.groupKey)}
                          style={{
                            borderBottom: '1px solid var(--border)',
                            borderLeft: `4px solid ${isMissing ? 'var(--red)' : 'var(--orange)'}`,
                            background: isExpanded ? 'var(--bg-elevated)' : (i % 2 === 0 ? 'transparent' : 'var(--bg-hover)'),
                            cursor: isMulti ? 'pointer' : 'default',
                            transition: 'background 0.15s ease'
                          }}
                        >
                          {/* Product / Variant Summary */}
                          <td style={{ padding: '13px 16px', maxWidth: 380 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                              <span style={{
                                width: 16, textAlign: 'center', fontSize: '0.8rem',
                                color: isMulti ? 'var(--text-primary)' : 'var(--text-muted)',
                                opacity: isMulti ? 1 : 0.35, flexShrink: 0
                              }}>
                                {isMulti ? (isExpanded ? '▼' : '▶') : '•'}
                              </span>
                              {entry.imageUrl ? (
                                <img
                                  src={entry.imageUrl}
                                  alt={entry.parent_title}
                                  style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', border: '1px solid var(--border)', flexShrink: 0 }}
                                />
                              ) : (
                                <div style={{
                                  width: 32, height: 32, borderRadius: 6, flexShrink: 0,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  background: 'var(--bg-elevated)', border: '1px solid var(--border)', fontSize: '0.95rem'
                                }}>📦</div>
                              )}
                              <div style={{ minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                                  <span style={{ fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis' }} title={entry.parent_title}>
                                    {entry.parent_title}
                                  </span>
                                  {isMulti && (
                                    <span style={{
                                      fontSize: '0.68rem', fontWeight: 700, padding: '1px 7px', borderRadius: 12,
                                      background: isMissing ? 'rgba(239,68,68,0.12)' : 'rgba(249,115,22,0.14)',
                                      color: isMissing ? 'var(--red)' : 'var(--orange)',
                                      whiteSpace: 'nowrap'
                                    }}>
                                      {entry.variants.length} variants
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  <span>{isMulti ? 'Click row to expand variants' : (singleVar?.variant_title || 'Default Variant')}</span>
                                  {entry.shopifyCostHint && (
                                    <span style={{ color: 'var(--brand)', fontWeight: 600 }}>• {entry.shopifyCostHint}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Issue Type Badge */}
                          <td style={{ padding: '13px 16px' }}>
                            <span style={{
                              display: 'inline-block', padding: '4px 12px', borderRadius: 20,
                              fontSize: '0.72rem', fontWeight: 700,
                              background: badgeBg, color: badgeColor,
                              border: `1px solid ${badgeColor}`, whiteSpace: 'nowrap'
                            }}>
                              {badgeLabel}
                            </span>
                          </td>

                          {/* Total Stock */}
                          <td style={{ padding: '13px 16px', fontWeight: 600 }}>
                            <span style={{ color: entry.totalStock > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                              {entry.totalStock} units
                            </span>
                          </td>

                          {/* Risk Level */}
                          <td style={{ padding: '13px 16px' }}>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              padding: '3px 10px', borderRadius: 6,
                              fontSize: '0.75rem', fontWeight: 600,
                              background: riskBg, color: riskColor, whiteSpace: 'nowrap'
                            }}>
                              {riskLabel}
                            </span>
                          </td>

                          {/* Parent Actions */}
                          <td style={{ padding: '13px 16px' }} onClick={(e) => e.stopPropagation()}>
                            {isMissing ? (
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                <button
                                  onClick={() => setLinkingGhost({ title: entry.parent_title, variant: isMulti ? '' : (singleVar?.variant_title || '') })}
                                  title={isMulti ? 'Link all variants of this product to an existing catalog SKU' : 'Link this renamed/old item to an existing catalog SKU'}
                                  style={{
                                    padding: '6px 12px', borderRadius: 6,
                                    background: 'rgba(236,72,153,0.12)', color: '#ec4899',
                                    border: '1px solid rgba(236,72,153,0.4)',
                                    fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap'
                                  }}
                                >
                                  🔗 {isMulti ? 'Link All' : 'Link SKU'}
                                </button>
                                {!isMulti && (
                                  <button
                                    onClick={() => {
                                      setEditingItem(null);
                                      setForm({
                                        parent_title: entry.parent_title || '',
                                        variant_title: singleVar?.variant_title || '',
                                        unit_cost: 0,
                                        packaging_cost: 0
                                      });
                                      setShowModal(true);
                                    }}
                                    title="Create a manual cost entry for this item"
                                    style={{
                                      padding: '6px 11px', borderRadius: 6,
                                      background: 'transparent', color: 'var(--red)',
                                      border: '1px solid var(--red)',
                                      fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap'
                                    }}
                                  >
                                    + Add Cost
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {entry.hasShopifyCost && (
                                  <button
                                    onClick={() => handleBulkAccept(entry.parent_title)}
                                    title="Accept Shopify Cost for all variants of this product"
                                    style={{
                                      padding: '6px 12px', borderRadius: 6,
                                      background: 'rgba(34,197,94,0.14)', color: 'var(--green)',
                                      border: '1px solid rgba(34,197,94,0.45)',
                                      fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap'
                                    }}
                                  >
                                    ✅ Accept {isMulti ? 'All' : 'Cost'}
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    setActiveTab('pending');
                                    setSearch(entry.parent_title);
                                  }}
                                  title="Open this product in Pending tab to edit costs"
                                  style={{
                                    padding: '6px 12px', borderRadius: 6,
                                    background: 'transparent', color: 'var(--orange)',
                                    border: '1px solid var(--orange)',
                                    fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap'
                                  }}
                                >
                                  ✏️ Update Cost
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>

                        {/* Expanded Child Variant Rows */}
                        {isExpanded && entry.variants.map((v, vi) => (
                          <tr
                            key={`${entry.groupKey}-v-${vi}`}
                            style={{
                              borderBottom: '1px solid var(--border)',
                              background: 'rgba(148, 163, 184, 0.04)'
                            }}
                          >
                            <td style={{ padding: '10px 16px 10px 60px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                  ↳ {v.variant_title || 'Default Variant'}
                                </div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                  {v.sku && <span>SKU: {v.sku}</span>}
                                  {(v.shopify_cost || 0) > 0 && (
                                    <span style={{ color: 'var(--brand)', fontWeight: 600 }}>Shopify Cost: Rs {Number(v.shopify_cost).toLocaleString()}</span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td style={{ padding: '10px 16px' }}>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                {isMissing ? 'Unmapped variant' : 'Pending verification'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 16px', fontSize: '0.82rem', color: (v.inventory_qty || 0) > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                              {v.inventory_qty || 0} units
                            </td>
                            <td style={{ padding: '10px 16px' }}>
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>—</span>
                            </td>
                            <td style={{ padding: '10px 16px' }}>
                              {isMissing ? (
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                  <button
                                    onClick={() => setLinkingGhost({ title: v.parent_title, variant: v.variant_title || '' })}
                                    style={{
                                      padding: '4px 10px', borderRadius: 6,
                                      background: 'rgba(236,72,153,0.1)', color: '#ec4899',
                                      border: '1px solid rgba(236,72,153,0.35)',
                                      fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap'
                                    }}
                                  >
                                    🔗 Link SKU
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingItem(null);
                                      setForm({
                                        parent_title: v.parent_title || '',
                                        variant_title: v.variant_title || '',
                                        unit_cost: 0,
                                        packaging_cost: 0
                                      });
                                      setShowModal(true);
                                    }}
                                    style={{
                                      padding: '4px 10px', borderRadius: 6,
                                      background: 'transparent', color: 'var(--red)',
                                      border: '1px solid rgba(239,68,68,0.5)',
                                      fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap'
                                    }}
                                  >
                                    + Add Cost
                                  </button>
                                </div>
                              ) : (
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                  {(v.shopify_cost || 0) > 0 && (
                                    <button
                                      onClick={() => handleAcceptShopifyCost(v)}
                                      style={{
                                        padding: '4px 10px', borderRadius: 6,
                                        background: 'rgba(34,197,94,0.12)', color: 'var(--green)',
                                        border: '1px solid rgba(34,197,94,0.4)',
                                        fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap'
                                      }}
                                    >
                                      ✅ Accept Rs {Number(v.shopify_cost).toLocaleString()}
                                    </button>
                                  )}
                                  <button
                                    onClick={() => {
                                      setEditingItem(v);
                                      setForm({
                                        parent_title: v.parent_title || '',
                                        variant_title: v.variant_title || '',
                                        unit_cost: v.unit_cost || v.shopify_cost || 0,
                                        packaging_cost: v.packaging_cost || 0
                                      });
                                      setShowModal(true);
                                    }}
                                    style={{
                                      padding: '4px 10px', borderRadius: 6,
                                      background: 'transparent', color: 'var(--orange)',
                                      border: '1px solid rgba(249,115,22,0.5)',
                                      fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap'
                                    }}
                                  >
                                    ✏️ Edit
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    )
                  })
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}


      {activeTab === 'ghosts' && (
        <div style={{ position: 'relative' }}>
          {selectedGhosts.size > 0 && (
            <div style={{ 
              position: 'sticky', top: 10, zIndex: 100, 
              background: 'var(--brand)', color: '#fff', 
              padding: '12px 20px', borderRadius: 12, 
              marginBottom: 20, display: 'flex', 
              justifyContent: 'space-between', alignItems: 'center',
              boxShadow: '0 8px 32px var(--brand-glow)'
            }}>
              <div style={{ fontWeight: 'bold' }}>⚡ {selectedGhosts.size} products selected</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input 
                  type="number" 
                  id="ghost-bulk-input"
                  placeholder="Enter Rs cost" 
                  className="form-input"
                  style={{ width: 140, background: 'var(--bg-surface)', color: 'var(--text-primary)', border: 'none', height: 35 }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = e.target.value;
                      if (!val) return;
                      const next = {...ghostCosts};
                      selectedGhosts.forEach(pName => {
                        const product = ghosts.find(g => g.name === pName);
                        if (product) {
                          product.variants.forEach(v => {
                            next[`${pName}@@@${v.name || ''}`] = val;
                          });
                        }
                      });
                      setGhostCosts(next);
                      setSelectedGhosts(new Set());
                      addToast(`Applied Rs ${val} to ${selectedGhosts.size} products`, 'success');
                    }
                  }}
                />
                <button 
                  className="btn btn-sm"
                  style={{ background: '#000', color: '#fff', fontWeight: 'bold' }}
                  onClick={() => {
                    const val = document.getElementById('ghost-bulk-input').value;
                    if (!val) return addToast('Please enter a cost first', 'warning');
                    const next = {...ghostCosts};
                    selectedGhosts.forEach(pName => {
                      const product = ghosts.find(g => g.name === pName);
                      if (product) {
                        product.variants.forEach(v => {
                          next[`${pName}@@@${v.name || ''}`] = val;
                        });
                      }
                    });
                    setGhostCosts(next);
                    setSelectedGhosts(new Set());
                    addToast(`Applied Rs ${val} to ${selectedGhosts.size} products`, 'success');
                  }}
                >Apply to Selected</button>
                <button 
                  className="btn btn-sm" 
                  style={{ background: 'transparent', color: '#fff', border: '1px solid #fff' }}
                  onClick={() => setSelectedGhosts(new Set())}
                >Cancel</button>
              </div>
            </div>
          )}
          <GhostSkuGuide mode="inline" context="costing" defaultOpen={true} />
          <div style={{ background: 'var(--brand-glow)', padding: 15, borderRadius: 8, marginBottom: 20, border: '1px solid var(--brand)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <p style={{ margin: 0, color: 'var(--brand)' }}>Found <strong>{filteredGhosts.length}</strong>{filteredGhosts.length !== ghosts.length ? ` of ${ghosts.length}` : ''} unmapped items (no matching SKU, Variant ID, or Alias). Link each ghost to a real Master SKU below to heal your P&amp;L.</p>
          </div>
          
          <div className="table-container" style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', opacity: 0.5, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  <th style={{ padding: 15, width: 40 }}>
                    <input 
                      type="checkbox" 
                      onChange={(e) => {
                        if (e.target.checked) {
                          const all = new Set(filteredGhosts.map(p => p.name));
                          setSelectedGhosts(all);
                        } else {
                          setSelectedGhosts(new Set());
                        }
                      }}
                      checked={selectedGhosts.size > 0 && selectedGhosts.size === filteredGhosts.length}
                    />
                  </th>
                  <th style={{ padding: 15 }}>Product / Variant</th>
                  <th style={{ textAlign: 'center' }}>Occurrences</th>
                  <th style={{ textAlign: 'right' }}>Target Cost</th>
                  <th style={{ textAlign: 'right', padding: 15 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredGhosts.map(p => (
                  <React.Fragment key={p.name}>
                    <tr 
                      style={{ cursor: 'pointer', background: selectedGhosts.has(p.name) ? 'var(--brand-glow)' : 'transparent', borderBottom: '1px solid var(--border)' }} 
                      onClick={() => toggleParent(p.name)}
                    >
                      <td style={{ padding: 15 }} onClick={(e) => e.stopPropagation()}>
                        <input 
                          type="checkbox" 
                          checked={selectedGhosts.has(p.name)} 
                          onClick={(e) => {
                            const checked = e.target.checked;
                            const currentIndex = filteredGhosts.findIndex(item => item.name === p.name);
                            
                            if (e.shiftKey && lastSelectedGhostIndex !== null) {
                              const start = Math.min(currentIndex, lastSelectedGhostIndex);
                              const end = Math.max(currentIndex, lastSelectedGhostIndex);
                              const namesInRange = filteredGhosts.slice(start, end + 1).map(item => item.name);
                              const next = new Set(selectedGhosts);
                              if (checked) {
                                namesInRange.forEach(name => next.add(name));
                              } else {
                                namesInRange.forEach(name => next.delete(name));
                              }
                              setSelectedGhosts(next);
                            } else {
                              const next = new Set(selectedGhosts);
                              if (next.has(p.name)) next.delete(p.name);
                              else next.add(p.name);
                              setSelectedGhosts(next);
                            }
                            setLastSelectedGhostIndex(currentIndex);
                          }}
                          readOnly
                        />
                      </td>
                      <td style={{ padding: 15, fontWeight: 'bold', color: 'var(--text-primary)' }}>
                        <span style={{ marginRight: 10 }}>{expandedParents.has(p.name) ? '▼' : '▶'}</span>
                        {p.name}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="badge-warning">{p.count} Orders</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                          <span style={{ fontSize: '0.7rem', opacity: 0.5, color: 'var(--text-muted)' }}>Bulk:</span>
                          <input 
                            type="number" 
                            className="form-input" 
                            style={{ width: 100, textAlign: 'right', height: 32 }} 
                            placeholder="Set All"
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const val = e.target.value;
                              const next = {...ghostCosts};
                              p.variants.forEach(v => {
                                // Ensure we use the exact variant name from the backend structure
                                next[`${p.name}@@@${v.name || ''}`] = val;
                              });
                              setGhostCosts(next);
                            }}
                          />
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', padding: 15 }}>
                         <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); handleInspectGhost(p.name); }}>🔍 Orders</button>
                         <button 
                           className="btn btn-secondary btn-sm" 
                           style={{ padding: '2px 8px', fontSize: '0.75rem', color: '#f472b6', borderColor: 'rgba(236,72,153,0.3)', background: 'rgba(236,72,153,0.1)', marginLeft: 6 }}
                           onClick={(e) => { e.stopPropagation(); setLinkingGhost({ title: p.name, variant: '' }); }}
                         >
                           🔗 Link SKU
                         </button>
                      </td>
                    </tr>
                    {expandedParents.has(p.name) && p.variants.map((v, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: selectedGhosts.has(p.name) ? 'var(--brand-glow)' : 'var(--bg-elevated)' }}>
                        <td></td>
                        <td style={{ padding: '10px 15px 10px 45px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                          └─ {v.name || 'Default Variant'}
                        </td>
                        <td style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          {v.count}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <input 
                            type="number" 
                            className="form-input" 
                            style={{ width: 100, textAlign: 'right', height: 30, fontSize: '0.85rem' }} 
                            value={ghostCosts[`${p.name}@@@${v.name}`] || ''} 
                            onChange={e => setGhostCosts({...ghostCosts, [`${p.name}@@@${v.name}`]: e.target.value})} 
                          />
                        </td>
                        <td style={{ textAlign: 'right', padding: 15 }}>
                           <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                             <button 
                              className="btn btn-primary btn-sm" 
                              style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                              onClick={() => {
                                setEditingItem({ parent_title: p.name, variant_title: v.name });
                                setForm({ 
                                  parent_title: p.name, 
                                  variant_title: v.name, 
                                  unit_cost: parseFloat(ghostCosts[`${p.name}@@@${v.name}`]) || 0, 
                                  packaging_cost: 0 
                                });
                                setShowModal(true);
                              }}
                             >Fix This</button>
                             <button 
                              className="btn btn-secondary btn-sm" 
                              style={{ padding: '2px 8px', fontSize: '0.75rem', color: '#f472b6', borderColor: 'rgba(236,72,153,0.3)', background: 'rgba(236,72,153,0.1)' }}
                              onClick={() => setLinkingGhost({ title: p.name, variant: v.name })}
                             >🔗 Link SKU</button>
                           </div>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ textAlign: 'right', marginTop: 20 }}>
            <button className="btn btn-success btn-lg" onClick={handleApplyGhostCosts}>🚀 Save & Apply All Ghost Costs</button>
          </div>
        </div>
      )}

      {activeTab === 'aliases' && (
        <div style={{ animation: 'slideDown 0.3s ease' }}>
          <GhostSkuGuide mode="inline" context="costing" defaultOpen={false} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                🔗 Product Ghost-to-SKU Aliases ({filteredAliases.length}{filteredAliases.length !== aliases.length ? ` / ${aliases.length}` : ''})
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Items below are mapped to real Master SKUs. All past and incoming orders automatically pull the linked SKU and landed cost.
              </p>
            </div>
          </div>

          <div className="table-responsive card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.75rem' }}>Ghost / Alias Title</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.75rem' }}>Variant</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.75rem' }}>Linked Master SKU</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.75rem' }}>Master Product Title</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: '0.75rem' }}>Landed Cost</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: '0.75rem' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredAliases.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      {loadingAliases ? '⌛ Loading aliases...' : 'No aliases found. Link ghost items to catalog SKUs to see them here.'}
                    </td>
                  </tr>
                ) : (
                  filteredAliases.map(a => (
                    <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: '#fff', fontSize: '0.82rem' }}>
                        {a.alias_title}
                      </td>
                      <td style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                        {a.alias_variant || '—'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '2px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 800 }}>
                          🆔 {a.target_sku || a.master_sku || 'N/A'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        {a.target_parent_title || '—'} {a.target_variant_title ? `(${a.target_variant_title})` : ''}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: 'var(--green)', fontSize: '0.82rem' }}>
                        Rs {Math.round(a.landed_cost || 0).toLocaleString()}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <button 
                          className="btn btn-secondary btn-sm"
                          style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)', padding: '3px 8px', fontSize: '0.7rem' }}
                          onClick={() => handleDeleteAlias(a.id)}
                          title="Unlink this alias"
                        >
                          🗑️ Unlink
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'sku_checker' && (
        <div style={{ animation: 'slideDown 0.3s ease' }}>
          {/* SKU Checker Header Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            <div 
              onClick={() => setSkuSubTab('duplicates')}
              style={{
                cursor: 'pointer', borderRadius: 16, padding: '20px 22px',
                border: skuSubTab === 'duplicates' ? '1.5px solid #f43f5e' : '1px solid var(--border)',
                background: skuSubTab === 'duplicates' ? 'rgba(244,63,94,0.08)' : 'var(--bg-surface)',
                boxShadow: skuSubTab === 'duplicates' ? '0 4px 20px rgba(244,63,94,0.12)' : 'none',
                transition: 'all 0.2s ease', position: 'relative'
              }}
            >
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#f43f5e', opacity: skuSubTab === 'duplicates' ? 1 : 0.3 }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#f43f5e' }}>{skuCheckerData.duplicates.length}</div>
                <div style={{ fontSize: '1.4rem' }}>⚠️</div>
              </div>
              <div style={{ marginTop: 8, fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Duplicate SKU Mappings</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 3 }}>SKUs assigned to multiple variants</div>
            </div>

            <div 
              onClick={() => setSkuSubTab('missing')}
              style={{
                cursor: 'pointer', borderRadius: 16, padding: '20px 22px',
                border: skuSubTab === 'missing' ? '1.5px solid #f59e0b' : '1px solid var(--border)',
                background: skuSubTab === 'missing' ? 'rgba(245,158,11,0.08)' : 'var(--bg-surface)',
                boxShadow: skuSubTab === 'missing' ? '0 4px 20px rgba(245,158,11,0.12)' : 'none',
                transition: 'all 0.2s ease', position: 'relative'
              }}
            >
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#f59e0b', opacity: skuSubTab === 'missing' ? 1 : 0.3 }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#f59e0b' }}>{skuCheckerData.missingSkus.length}</div>
                <div style={{ fontSize: '1.4rem' }}>❓</div>
              </div>
              <div style={{ marginTop: 8, fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Missing SKU Codes</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 3 }}>Variants without SKU in registry</div>
            </div>
          </div>

          {/* Tab Content */}
          {skuSubTab === 'duplicates' ? (
            <div className="table-container" style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
              {skuCheckerData.duplicates.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--green)' }}>
                  <div style={{ fontSize: '3rem', marginBottom: 12 }}>✅</div>
                  <h4 style={{ margin: 0 }}>No Duplicate SKUs!</h4>
                  <p style={{ margin: '5px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Each SKU in the registry maps to a single variant.</p>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', opacity: 0.5, fontSize: '0.8rem', color: 'var(--text-muted)', borderBottom: '2px solid var(--border)' }}>
                      <th style={{ padding: '12px 16px' }}>SKU Code</th>
                      <th style={{ padding: '12px 16px' }}>Shared By Products / Variants</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>Landed Cost</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>Stock</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center' }}>Status</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {skuCheckerData.duplicates.map((dup) => (
                      <React.Fragment key={dup.sku}>
                        {/* Group Header Row */}
                        <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                          <td colSpan={6} style={{ padding: '10px 16px', fontWeight: 'bold', color: '#f43f5e' }}>
                            <span style={{ marginRight: 10 }}>🆔 SKU: {dup.sku}</span>
                            {dup.hasCostMismatches && (
                              <span style={{
                                background: 'rgba(239,68,68,0.15)', color: '#ef4444',
                                fontSize: '0.68rem', padding: '2px 8px', borderRadius: 4, fontWeight: 700
                              }}>⚠️ COST MISMATCH DISCOVERED</span>
                            )}
                          </td>
                        </tr>
                        {/* Variants Rows */}
                        {dup.variants.map((v) => {
                          const landed = (v.unit_cost || 0) + (v.packaging_cost || 0);
                          return (
                            <tr key={v.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}>
                              <td style={{ padding: '12px 16px' }} />
                              <td style={{ padding: '12px 16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  {v.variant_image_url ? (
                                    <img src={v.variant_image_url} alt={v.parent_title} style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover' }} />
                                  ) : (
                                    <div style={{ width: 28, height: 28, borderRadius: 4, background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>📷</div>
                                  )}
                                  <div>
                                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{v.parent_title}</div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{v.variant_title || 'Default Title'}</div>
                                  </div>
                                </div>
                              </td>
                              <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 'bold', color: landed > 0 ? 'var(--green)' : 'var(--text-muted)' }}>
                                Rs {landed.toLocaleString()}
                              </td>
                              <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                                {v.inventory_qty || 0} units
                              </td>
                              <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                <span style={{
                                  fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                                  color: v.status === 'active' ? 'var(--green)' : v.status === 'draft' ? '#fb923c' : '#94a3b8',
                                  background: v.status === 'active' ? 'var(--green-dim)' : v.status === 'draft' ? 'rgba(251,146,60,0.1)' : 'rgba(148,163,184,0.1)',
                                  padding: '2px 6px', borderRadius: 4
                                }}>{v.status || 'active'}</span>
                              </td>
                              <td style={{ padding: '12px 16px', textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                <button 
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => {
                                    setEditingItem(v);
                                    setForm({ parent_title: v.parent_title, variant_title: v.variant_title, unit_cost: v.unit_cost || 0, packaging_cost: v.packaging_cost || 0 });
                                    setShowModal(true);
                                  }}
                                >✏️ Edit Cost</button>
                                <button 
                                  className="btn btn-secondary btn-sm"
                                  style={{ borderColor: '#ef4444', color: '#ef4444' }}
                                  onClick={() => handleDeleteVariant(v.parent_title, v.variant_title)}
                                >🗑️ Delete</button>
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : (
            <div className="table-container" style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
              {skuCheckerData.missingSkus.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--green)' }}>
                  <div style={{ fontSize: '3rem', marginBottom: 12 }}>✅</div>
                  <h4 style={{ margin: 0 }}>All SKUs Present!</h4>
                  <p style={{ margin: '5px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Every variant in the registry has a mapped SKU code.</p>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', opacity: 0.5, fontSize: '0.8rem', color: 'var(--text-muted)', borderBottom: '2px solid var(--border)' }}>
                      <th style={{ padding: '12px 16px' }}>Product / Variant</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>Landed Cost</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>Stock</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center' }}>Status</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>Shopify Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {skuCheckerData.missingSkus.map((v) => {
                      const landed = (v.unit_cost || 0) + (v.packaging_cost || 0);
                      return (
                        <tr key={v.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              {v.variant_image_url ? (
                                <img src={v.variant_image_url} alt={v.parent_title} style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover' }} />
                              ) : (
                                <div style={{ width: 28, height: 28, borderRadius: 4, background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>📷</div>
                              )}
                              <div>
                                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{v.parent_title}</div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{v.variant_title || 'Default Title'}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 'bold', color: landed > 0 ? 'var(--green)' : 'var(--text-muted)' }}>
                            Rs {landed.toLocaleString()}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                            {v.inventory_qty || 0} units
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <span style={{
                              fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                              color: v.status === 'active' ? 'var(--green)' : v.status === 'draft' ? '#fb923c' : '#94a3b8',
                              background: v.status === 'active' ? 'var(--green-dim)' : v.status === 'draft' ? 'rgba(251,146,60,0.1)' : 'rgba(148,163,184,0.1)',
                              padding: '2px 6px', borderRadius: 4
                            }}>{v.status || 'active'}</span>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'flex-end' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              Set SKU in Shopify & Sync.
                            </span>
                            <button 
                              className="btn btn-secondary btn-sm"
                              style={{ borderColor: '#ef4444', color: '#ef4444' }}
                              onClick={() => handleDeleteVariant(v.parent_title, v.variant_title)}
                            >🗑️ Delete</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 style={{ color: 'var(--text-primary)', marginTop: 0 }}>{editingItem ? 'Edit Packaging Cost' : 'Add Ghost Cost'}</h3>
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label style={{ color: 'var(--text-secondary)' }}>Product Title</label>
                <input type="text" className="form-input" value={form.parent_title} onChange={e => setForm({...form, parent_title: e.target.value})} disabled={!!editingItem} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    Unit Cost (Rs)
                    {editingItem && <span style={{ fontSize: '0.65rem', color: '#6366f1', fontWeight: 700 }}>🔒 PO / FIFO</span>}
                  </label>
                  <input
                    type="number"
                    className="form-input"
                    value={form.unit_cost}
                    disabled={!!editingItem}
                    title={editingItem ? 'Unit cost is driven by Purchase Orders (FIFO). Receive a PO in PO & Ledger to change it.' : ''}
                    onChange={e => setForm({...form, unit_cost: parseFloat(e.target.value) || 0})}
                    style={editingItem ? { opacity: 0.65, cursor: 'not-allowed', background: 'var(--bg-elevated)' } : undefined}
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label style={{ color: 'var(--text-secondary)' }}>Packaging (Rs)</label>
                  <input type="number" className="form-input" value={form.packaging_cost} onChange={e => setForm({...form, packaging_cost: parseFloat(e.target.value) || 0})} />
                </div>
              </div>
              {editingItem && (
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: 14, padding: '8px 10px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                  🔒 Unit cost stays locked to active FIFO Purchase Orders. Only Packaging Cost (box/flyer) is edited here.
                </div>
              )}
              <div style={{ background: 'var(--brand-glow)', padding: 10, borderRadius: 8, textAlign: 'center', marginBottom: 18 }}>
                <div style={{ fontSize: '0.7rem', opacity: 0.65, color: 'var(--text-muted)' }}>Total Landed Cost</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--brand)' }}>Rs {((Number(form.unit_cost) || 0) + (Number(form.packaging_cost) || 0)).toLocaleString()}</div>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Packaging</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showBulkModal && (
        <div className="modal-overlay" onClick={() => setShowBulkModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 style={{ color: 'var(--text-primary)', marginTop: 0 }}>📦 Bulk Packaging Cost: {bulkItem.name}</h3>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: 16, padding: '10px 12px', borderRadius: 8, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)' }}>
              🔒 Each variant&apos;s <strong>FIFO Unit Cost</strong> from Purchase Orders is strictly preserved. Only <strong>Packaging Cost (Rs)</strong> will be updated across variants.
            </div>
            <form onSubmit={handleBulkSync}>
              <div className="form-group">
                <label style={{ color: 'var(--text-secondary)' }}>Packaging Cost per Unit (Rs)</label>
                <input
                  type="number"
                  className="form-input"
                  value={bulkForm.packaging_cost}
                  onChange={e => setBulkForm({ ...bulkForm, packaging_cost: parseFloat(e.target.value) || 0 })}
                  placeholder="e.g. 45"
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowBulkModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Apply Packaging to Variants</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showGhostModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 800, width: '95%' }}>
            <h3 style={{ color: 'var(--text-primary)' }}>🔍 Order Verification: {inspectingGhost}</h3>
            <div style={{ maxHeight: 400, overflowY: 'auto', marginTop: 20 }}>
              {loadingGhostOrders ? <p style={{ color: 'var(--text-muted)' }}>Loading history...</p> : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ textAlign: 'left', opacity: 0.5, fontSize: '0.8rem', color: 'var(--text-muted)' }}><th>Date</th><th>Ref #</th><th>Customer</th><th style={{ textAlign: 'right' }}>Price</th></tr></thead>
                  <tbody>{ghostOrders.map((o,i) => (<tr key={i} style={{ borderBottom: '1px solid var(--border)' }}><td style={{ padding: 10, color: 'var(--text-primary)' }}>{o.order_date}</td><td style={{ padding: 10, color: 'var(--text-primary)' }}>{o.ref_number}</td><td style={{ padding: 10, color: 'var(--text-primary)' }}>{o.customer_name}</td><td style={{ textAlign: 'right', padding: 10, color: 'var(--text-primary)' }}>Rs {o.price?.toLocaleString()}</td></tr>))}</tbody>
                </table>
              )}
            </div>
            <div style={{ marginTop: 20, textAlign: 'right' }}><button className="btn btn-secondary" onClick={() => setShowGhostModal(false)}>Close</button></div>
          </div>
        </div>
      )}

      {/* ── Diagnose Report Modal ── */}
      {diagnoseReport && (
        <div className="modal-overlay" onClick={() => setDiagnoseReport(null)}>
          <div className="modal-content" style={{ maxWidth: 680, width: '95%', maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, color: diagnoseReport.passed ? 'var(--green)' : 'var(--yellow)' }}>
                {diagnoseReport.passed ? '✅ Shopify Connection Healthy' : '⚠️ Shopify Sync Diagnostic'}
              </h3>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.4rem' }} onClick={() => setDiagnoseReport(null)}>×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {diagnoseReport.steps.map((step, i) => (
                <div key={i} style={{
                  background: step.status.includes('✅') ? 'var(--green-dim)' : step.status.includes('⚠️') ? 'rgba(251,146,60,0.08)' : 'rgba(239,68,68,0.08)',
                  border: `1px solid ${step.status.includes('✅') ? 'var(--green)' : step.status.includes('⚠️') ? 'rgba(251,146,60,0.4)' : 'rgba(239,68,68,0.3)'}`,
                  borderRadius: 10, padding: '12px 16px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{step.step}</div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                      background: step.status.includes('✅') ? 'var(--green-dim)' : step.status.includes('⚠️') ? 'rgba(251,146,60,0.15)' : 'rgba(239,68,68,0.15)',
                      color: step.status.includes('✅') ? 'var(--green)' : step.status.includes('⚠️') ? '#fb923c' : '#ef4444'
                    }}>{step.status}</div>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{step.detail}</div>
                  {step.sample && step.sample.length > 0 && (
                    <div style={{ marginTop: 10, background: 'var(--bg-elevated)', borderRadius: 6, padding: 10 }}>
                      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>Sample Products Found:</div>
                      {step.sample.map((s, j) => (
                        <div key={j} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '4px 0', borderBottom: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                          <span>{s.product}{s.variant !== 'Default Title' ? ` — ${s.variant}` : ''}</span>
                          <span style={{ color: String(s.shopify_cost).includes('null') ? '#ef4444' : 'var(--green)', fontWeight: 600 }}>
                            {String(s.shopify_cost).includes('null') ? '❌ Cost not set in Shopify' : `Rs ${s.shopify_cost}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {!diagnoseReport.passed && (
              <div style={{ marginTop: 20, background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.3)', borderRadius: 10, padding: 16 }}>
                <div style={{ fontWeight: 700, color: 'var(--yellow)', marginBottom: 8 }}>🔧 How to Fix</div>
                <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.9 }}>
                  <li><strong>REST failed (401/403)</strong>: Token expired. Go to Settings → Stores and reconnect this store.</li>
                  <li><strong>GraphQL error</strong>: Token is missing read_products or read_inventory scope. Re-install the app.</li>
                  <li><strong>0 variants found</strong>: Check that Shopify store has active (non-archived) products.</li>
                </ul>
              </div>
            )}
            <div style={{ textAlign: 'right', marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={() => setDiagnoseReport(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Link SKU Modal ── */}
      {linkingGhost && (
        <LinkSkuModal
          isOpen={!!linkingGhost}
          item={linkingGhost}
          storeId={activeStoreId}
          onClose={() => setLinkingGhost(null)}
          onSuccess={() => {
            fetchGhosts();
            fetchAliases();
            fetchCosts();
            fetchAudit();
          }}
        />
      )}

      {/* ── Committed Orders Drilldown Modal ── */}
      <CommittedOrdersModal
        open={committedModal.open}
        loading={committedModal.loading}
        data={committedModal.data}
        onClose={() => setCommittedModal({ open: false, loading: false, data: null })}
      />

      <style>{`
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal-content { background: var(--bg-surface); padding: 30px; border-radius: 16px; border: 1px solid var(--border); width: 450px; }
        .form-group { margin-bottom: 15px; }
        .form-group label { display: block; margin-bottom: 5px; opacity: 0.6; font-size: 0.8rem; }
        .btn-icon { background: none; border: none; cursor: pointer; opacity: 0.5; padding: 5px; }
        .btn-icon:hover { opacity: 1; color: var(--brand); }
        .badge-warning { background: var(--yellow-dim); color: var(--yellow); padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  )
}
