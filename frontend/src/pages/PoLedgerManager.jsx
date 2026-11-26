import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import GhostSkuGuide from '../components/GhostSkuGuide'

const API = import.meta.env.VITE_API_URL || ''

const fmtRs = (v) => `Rs. ${Math.round(Number(v) || 0).toLocaleString()}`

const SIZE_RANK_MAP = {
  xxxs: 1, '3xs': 1, xxs: 2, '2xs': 2, xs: 3, small: 4, s: 4,
  medium: 5, m: 5, large: 6, l: 6, xl: 7, '1xl': 7,
  xxl: 8, '2xl': 8, xxxl: 9, '3xl': 9, xxxxl: 10, '4xl': 10,
  '5xl': 11, '6xl': 12, '7xl': 13, free: 90, 'free size': 90, 'one size': 90, os: 90,
}

function getSizeRank(token) {
  const clean = String(token || '').trim().toLowerCase()
  if (!clean) return null
  if (SIZE_RANK_MAP[clean] !== undefined) return SIZE_RANK_MAP[clean]
  if (/^\d+(\.\d+)?(\s*(in|cm|yr|yrs|y|m))?$/i.test(clean)) return 100 + parseFloat(clean)
  return null
}

function parseVariantParts(variantTitle) {
  const parts = String(variantTitle || '').split('/').map(s => s.trim()).filter(Boolean)
  if (parts.length === 0) return { size: '', color: '', sizeRank: 9999 }
  if (parts.length === 1) {
    const r = getSizeRank(parts[0])
    return r !== null ? { size: parts[0], color: '', sizeRank: r } : { size: '', color: parts[0], sizeRank: 9999 }
  }
  const r0 = getSizeRank(parts[0])
  const r1 = getSizeRank(parts[1])
  if (r0 !== null && r1 === null) return { size: parts[0], color: parts.slice(1).join(' / '), sizeRank: r0 }
  if (r1 !== null && r0 === null) return { size: parts[1], color: parts[0], sizeRank: r1 }
  return { size: parts[0], color: parts.slice(1).join(' / '), sizeRank: r0 ?? 9999 }
}

function sortVariantsSmart(variants, mode = 'color') {
  return [...variants].sort((a, b) => {
    const pa = parseVariantParts(a.variant_title)
    const pb = parseVariantParts(b.variant_title)
    if (mode === 'size') {
      if (pa.sizeRank !== pb.sizeRank) return pa.sizeRank - pb.sizeRank
      const sCmp = pa.size.localeCompare(pb.size)
      if (sCmp !== 0) return sCmp
      return pa.color.localeCompare(pb.color)
    }
    const cCmp = pa.color.localeCompare(pb.color)
    if (cCmp !== 0) return cCmp
    if (pa.sizeRank !== pb.sizeRank) return pa.sizeRank - pb.sizeRank
    return (a.variant_title || '').localeCompare(b.variant_title || '')
  })
}

const Svg = {
  Box: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" />
    </svg>
  ),
  Users: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Wallet: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
      <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
    </svg>
  ),
  Layers: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" />
    </svg>
  ),
  Plus: ({ size = 13 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" /><path d="M12 5v14" />
    </svg>
  ),
  Refresh: ({ size = 13 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" />
    </svg>
  ),
  ArrowLR: ({ size = 13 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m17 2 4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="m7 22-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  ),
  Check: ({ size = 13 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
}

const PO_STATUS_BADGE = {
  ordered:   { bg: 'rgba(245,158,11,0.10)', color: '#b45309', border: 'rgba(245,158,11,0.28)', label: 'Ordered' },
  partial:   { bg: 'rgba(37,99,235,0.10)',  color: '#2563eb', border: 'rgba(37,99,235,0.28)',  label: 'Partial Received' },
  received:  { bg: 'rgba(16,185,129,0.10)', color: '#059669', border: 'rgba(16,185,129,0.26)', label: 'Received' },
  cancelled: { bg: 'rgba(239,68,68,0.10)',  color: '#dc2626', border: 'rgba(239,68,68,0.24)',  label: 'Cancelled' },
}

const ENTRY_TYPE_META = {
  cpr_deposit:      { label: 'CPR Payout (Auto)', color: '#059669', bg: 'rgba(16,185,129,0.10)' },
  expense:          { label: 'Expense (Auto)',    color: '#dc2626', bg: 'rgba(239,68,68,0.10)' },
  po_payment:       { label: 'PO Payment',        color: '#b45309', bg: 'rgba(245,158,11,0.10)' },
  supplier_advance: { label: 'Supplier Advance',  color: '#7c3aed', bg: 'rgba(124,58,237,0.10)' },
  supplier_return:  { label: 'Supplier Return',   color: '#0891b2', bg: 'rgba(8,145,178,0.10)' },
  transfer_out:     { label: 'Transfer Out',      color: '#475569', bg: 'rgba(100,116,139,0.12)' },
  transfer_in:      { label: 'Transfer In',       color: '#2563eb', bg: 'rgba(37,99,235,0.10)' },
  capital_in:       { label: 'Owner Capital In',  color: '#059669', bg: 'rgba(16,185,129,0.10)' },
  owner_drawing:    { label: 'Owner Drawing',     color: '#dc2626', bg: 'rgba(239,68,68,0.10)' },
  adjustment:       { label: 'Adjustment',        color: '#64748b', bg: 'rgba(100,116,139,0.12)' },
}

const ACCOUNT_TYPE_LABELS = {
  bank: 'Bank',
  cash: 'Cash',
  ad_wallet: 'Ad Card / Wallet',
  mobile_wallet: 'Mobile Wallet',
}

function Pill({ label, color, bg, border }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2.5px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700,
      background: bg, color, border: `1px solid ${border || 'transparent'}`, whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

function ModalShell({ title, subtitle, onClose, maxWidth = 640, children }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(15,23,42,0.58)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth, maxHeight: '90vh', overflowY: 'auto',
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 14, padding: 20, boxShadow: '0 24px 60px rgba(0,0,0,0.32)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, color: 'var(--text-primary)' }}>{title}</h3>
            {subtitle && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</div>}
          </div>
          <button
            type="button"
            data-close-modal="true"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, padding: 4 }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function PoLedgerManager() {
  const { token, addToast, activeStoreId } = useApp()
  const [activeTab, setActiveTab] = useState('pos') // 'pos' | 'suppliers' | 'ledger' | 'inventory'
  const [loading, setLoading] = useState(false)

  // Core state
  const [summary, setSummary] = useState(null)
  const [pos, setPos] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [accounts, setAccounts] = useState([])
  const [ledgerEntries, setLedgerEntries] = useState([])
  const [inventory, setInventory] = useState([])
  const [fullCatalog, setFullCatalog] = useState([])
  const [invLedger, setInvLedger] = useState([])

  // Filters
  const [invSearch, setInvSearch] = useState('')
  const [ledgerFilter, setLedgerFilter] = useState({ account_id: '', entry_type: 'all', includeVoid: false })
  const [showInvLog, setShowInvLog] = useState(false)

  // Busy flags
  const [busyKey, setBusyKey] = useState('')

  // Modals
  const [newPoOpen, setNewPoOpen] = useState(false)
  const [editingPo, setEditingPo] = useState(null) // null = creating new PO; object = editing existing PO
  const [poForm, setPoForm] = useState({ poType: 'shipment', supplier_id: '', order_date: new Date().toISOString().slice(0, 10), landing_cost: '', notes: '', items: [], receiveImmediately: false, shopifySyncMode: 'add_delta', pushEditToShopify: true })
  const [skuPickerSearch, setSkuPickerSearch] = useState('')
  // Shopify-style Add Products picker & bulk quickie states
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerSearchBy, setPickerSearchBy] = useState('all') // 'all' | 'title' | 'sku'
  const [pickerFilter, setPickerFilter] = useState('all') // 'all' | 'active' | 'draft' | 'backorder' | 'oos' | 'low'
  const [pickerGroupBy, setPickerGroupBy] = useState('color') // 'color' | 'size'
  const [pickerSelected, setPickerSelected] = useState(() => new Set())
  const [collapsedPickerParents, setCollapsedPickerParents] = useState(() => new Set())
  const [bulkQtyInput, setBulkQtyInput] = useState('')
  const [bulkCostInput, setBulkCostInput] = useState('')
  const [groupQuickFill, setGroupQuickFill] = useState({}) // { [parentTitle]: { qty: '', cost: '' } }

  const [receiveModal, setReceiveModal] = useState(null) // { po, qtys: {}, pushToShopify: true, closeShort: false, notes: '' }
  const [viewPoModal, setViewPoModal] = useState(null)
  const [reverseModal, setReverseModal] = useState(null) // { po, pushToShopify: false, reason: '' }

  const [supplierModal, setSupplierModal] = useState(null)
  const [statementModal, setStatementModal] = useState(null)
  const [supReturnModal, setSupReturnModal] = useState(null)

  const [accountModal, setAccountModal] = useState(null)
  const [ledgerModal, setLedgerModal] = useState(null) // { entry_type, amount, account_id, from_account_id, to_account_id, supplier_id, po_id, entry_date, description, ref_label, direction }

  const [adjustModal, setAdjustModal] = useState(null) // { item, qty_delta, movement_type, notes, pushToShopify }
  const [poolModal, setPoolModal] = useState(null)     // { item, shared_pool_key }
  const [guideOpen, setGuideOpen] = useState(false)

  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...(activeStoreId ? { 'x-active-store-id': String(activeStoreId) } : {}),
  }), [token, activeStoreId])

  const qs = activeStoreId ? `?store_id=${activeStoreId}` : ''

  const fetchCore = useCallback(async () => {
    setLoading(true)
    try {
      const [sumRes, posRes, supRes, accRes] = await Promise.all([
        fetch(`${API}/api/po-ledger/summary${qs}`, { headers }),
        fetch(`${API}/api/po-ledger/pos${qs}`, { headers }),
        fetch(`${API}/api/po-ledger/suppliers${qs}`, { headers }),
        fetch(`${API}/api/po-ledger/accounts${qs}`, { headers }),
      ])
      const [sumJ, posJ, supJ, accJ] = await Promise.all([sumRes.json(), posRes.json(), supRes.json(), accRes.json()])
      if (sumJ.success) setSummary(sumJ.data)
      if (posJ.success) setPos(posJ.data || [])
      if (supJ.success) setSuppliers(supJ.data || [])
      if (accJ.success) setAccounts(accJ.data || [])
    } catch (_) {
      addToast('Failed to load PO & Ledger data', 'error')
    } finally {
      setLoading(false)
    }
  }, [qs, headers, addToast])

  const fetchLedger = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (activeStoreId) params.set('store_id', activeStoreId)
      if (ledgerFilter.account_id) params.set('account_id', ledgerFilter.account_id)
      if (ledgerFilter.entry_type && ledgerFilter.entry_type !== 'all') params.set('entry_type', ledgerFilter.entry_type)
      if (ledgerFilter.includeVoid) params.set('includeVoid', '1')
      const res = await fetch(`${API}/api/po-ledger/ledger?${params}`, { headers })
      const j = await res.json()
      if (j.success) setLedgerEntries(j.data || [])
    } catch (_) {}
  }, [activeStoreId, ledgerFilter, headers])

  const fetchInventory = useCallback(async (searchText = invSearch) => {
    try {
      const params = new URLSearchParams()
      if (activeStoreId) params.set('store_id', activeStoreId)
      if (searchText.trim()) params.set('search', searchText.trim())
      const [invRes, logRes] = await Promise.all([
        fetch(`${API}/api/po-ledger/inventory?${params}`, { headers }),
        fetch(`${API}/api/po-ledger/inventory/ledger${qs}`, { headers }),
      ])
      const [invJ, logJ] = await Promise.all([invRes.json(), logRes.json()])
      if (invJ.success) {
        setInventory(invJ.data || [])
        if (!searchText.trim()) setFullCatalog(invJ.data || [])
      }
      if (logJ.success) setInvLedger(logJ.data || [])
    } catch (_) {}
  }, [activeStoreId, invSearch, qs, headers])

  useEffect(() => {
    fetchCore()
    fetchLedger()
    fetchInventory('')
  }, [activeStoreId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchLedger()
  }, [ledgerFilter, fetchLedger])

  useEffect(() => {
    const t = setTimeout(() => fetchInventory(invSearch), 260)
    return () => clearTimeout(t)
  }, [invSearch]) // eslint-disable-line react-hooks/exhaustive-deps

  const refreshAll = async () => {
    await Promise.all([fetchCore(), fetchLedger(), fetchInventory(invSearch)])
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleBaselinePo = async () => {
    if (!window.confirm('Create PO-INITIAL-BASELINE from your current Cost Manager catalog stock (Supplier Payable = Rs. 0)?')) return
    setBusyKey('baseline')
    try {
      const res = await fetch(`${API}/api/po-ledger/pos/baseline`, {
        method: 'POST', headers, body: JSON.stringify({ store_id: activeStoreId }),
      })
      const j = await res.json()
      if (j.success) {
        addToast(j.message, 'success')
        await refreshAll()
      } else {
        addToast(j.error || 'Baseline failed', 'error')
      }
    } finally {
      setBusyKey('')
    }
  }

  const openNewPoFromBackorders = async () => {
    setBusyKey('backorders')
    try {
      const res = await fetch(`${API}/api/po-ledger/pos/backorders${qs}`, { headers })
      const j = await res.json()
      const rows = j.success ? (j.data || []) : []
      if (rows.length === 0) {
        addToast('No negative-stock backorder SKUs right now', 'info')
        return
      }
      setEditingPo(null)
      setPoForm({
        poType: 'shipment',
        supplier_id: suppliers[0]?.id ? String(suppliers[0].id) : '',
        order_date: new Date().toISOString().slice(0, 10),
        landing_cost: '',
        notes: `Auto-generated from ${rows.length} Continue Selling backorder SKUs`,
        receiveImmediately: false,
        shopifySyncMode: 'add_delta',
        pushEditToShopify: true,
        items: rows.map(r => ({
          product_cost_id: r.id,
          shopify_variant_id: r.shopify_variant_id || '',
          sku: r.sku || '',
          parent_title: r.parent_title,
          variant_title: r.variant_title || '',
          variant_image_url: r.variant_image_url || '',
          inventory_qty: r.inventory_qty || 0,
          ordered_qty: r.needed_qty,
          unit_cost: r.suggested_cost || 0,
        })),
      })
      setNewPoOpen(true)
    } finally {
      setBusyKey('')
    }
  }

  const openBlankPo = () => {
    setEditingPo(null)
    setPoForm({
      poType: 'shipment',
      supplier_id: suppliers[0]?.id ? String(suppliers[0].id) : '',
      order_date: new Date().toISOString().slice(0, 10),
      landing_cost: '',
      notes: '',
      receiveImmediately: false,
      shopifySyncMode: 'add_delta',
      pushEditToShopify: true,
      items: [],
    })
    setSkuPickerSearch('')
    setBulkQtyInput('')
    setBulkCostInput('')
    setGroupQuickFill({})
    setNewPoOpen(true)
    if (fullCatalog.length === 0) fetchInventory('')
  }

  const openEditPo = async (poId) => {
    setBusyKey(`openEdit-${poId}`)
    try {
      const res = await fetch(`${API}/api/po-ledger/pos/${poId}${qs}`, { headers })
      const j = await res.json()
      if (!j.success || !j.data) return addToast(j.error || 'Failed to load PO for editing', 'error')
      const po = j.data
      if (po.is_baseline) return addToast('Baseline PO cannot be edited', 'warning')
      if (po.status === 'cancelled') return addToast('Cancelled PO cannot be edited', 'warning')

      const catalog = fullCatalog.length > 0 ? fullCatalog : inventory
      const byId = new Map(catalog.map(c => [c.id, c]))
      setEditingPo(po)
      setPoForm({
        poType: 'shipment',
        supplier_id: po.supplier_id ? String(po.supplier_id) : '',
        order_date: po.order_date || new Date().toISOString().slice(0, 10),
        landing_cost: po.landing_cost ? String(po.landing_cost) : '',
        notes: po.notes || '',
        receiveImmediately: false,
        shopifySyncMode: 'add_delta',
        pushEditToShopify: true,
        items: (po.items || []).map(it => {
          const cat = byId.get(it.product_cost_id)
          const recQty = Number(it.received_qty) || 0
          const remQty = Number(it.remaining_qty) || 0
          return {
            id: it.id,
            product_cost_id: it.product_cost_id,
            shopify_variant_id: it.shopify_variant_id || cat?.shopify_variant_id || '',
            sku: it.sku || cat?.sku || '',
            parent_title: it.parent_title,
            variant_title: it.variant_title || '',
            variant_image_url: cat?.variant_image_url || '',
            inventory_qty: cat?.inventory_qty ?? it.current_stock ?? 0,
            ordered_qty: it.ordered_qty ?? recQty,
            received_qty: recQty,
            remaining_qty: remQty,
            consumed_qty: Math.max(0, recQty - remQty),
            unit_cost: it.unit_cost || 0,
          }
        }),
      })
      setSkuPickerSearch('')
      setBulkQtyInput('')
      setBulkCostInput('')
      setGroupQuickFill({})
      setViewPoModal(null)
      setNewPoOpen(true)
      if (fullCatalog.length === 0) fetchInventory('')
    } finally {
      setBusyKey('')
    }
  }

  const switchPoType = (nextType) => {
    setPoForm(prev => {
      if (prev.poType === nextType) return prev
      if (nextType === 'recount') {
        return {
          ...prev,
          poType: 'recount',
          supplier_id: '', // Avoid accidental Supplier Khata billing on already-paid opening stock
          receiveImmediately: true,
          shopifySyncMode: 'set_exact_on_hand',
          items: prev.items.map(it => ({
            ...it,
            ordered_qty: Math.max(0, Number(it.inventory_qty) || 0),
          })),
        }
      }
      return {
        ...prev,
        poType: 'shipment',
        supplier_id: prev.supplier_id || (suppliers[0]?.id ? String(suppliers[0].id) : ''),
        receiveImmediately: false,
        shopifySyncMode: 'add_delta',
        items: prev.items.map(it => ({
          ...it,
          ordered_qty: (parseInt(it.ordered_qty, 10) || 0) <= 0 ? 10 : it.ordered_qty,
        })),
      }
    })
  }

  const fillCurrentStockForAll = () => {
    setPoForm(prev => ({
      ...prev,
      items: prev.items.map(it => ({
        ...it,
        ordered_qty: Math.max(0, Number(it.inventory_qty) || 0),
      })),
    }))
    addToast('Filled all rows with current Shopify stock — now edit only changed SKUs', 'info')
  }

  const makePoItemFromCatalog = (skuRow, defaultQty = null, isRecountMode = false) => {
    const curInv = Number(skuRow.inventory_qty) || 0
    const qty = defaultQty !== null
      ? defaultQty
      : (isRecountMode ? Math.max(0, curInv) : (curInv < 0 ? Math.abs(curInv) : 10))
    return {
      product_cost_id: skuRow.id,
      shopify_variant_id: skuRow.shopify_variant_id || '',
      sku: skuRow.sku || '',
      parent_title: skuRow.parent_title,
      variant_title: skuRow.variant_title || '',
      variant_image_url: skuRow.variant_image_url || '',
      inventory_qty: curInv,
      ordered_qty: qty,
      unit_cost: Number(skuRow.unit_cost) || Number(skuRow.avg_cost) || 0,
    }
  }

  const addSkuToPoForm = (skuRow) => {
    setPoForm(prev => {
      if (prev.items.some(i => i.product_cost_id === skuRow.id)) return prev
      return { ...prev, items: [...prev.items, makePoItemFromCatalog(skuRow, null, prev.poType === 'recount')] }
    })
  }

  const addMultipleSkusToPoForm = (rows, defaultQtyFn = null) => {
    if (!rows || rows.length === 0) return 0
    const currentExisting = new Set(poForm.items.map(i => i.product_cost_id))
    const newRows = rows.filter(r => !currentExisting.has(r.id))
    if (newRows.length === 0) return 0
    setPoForm(prev => {
      const isRec = prev.poType === 'recount'
      const existing = new Set(prev.items.map(i => i.product_cost_id))
      const next = [...prev.items]
      for (const r of newRows) {
        if (existing.has(r.id)) continue
        existing.add(r.id)
        const q = typeof defaultQtyFn === 'function' ? defaultQtyFn(r) : null
        next.push(makePoItemFromCatalog(r, q, isRec))
      }
      return { ...prev, items: next }
    })
    return newRows.length
  }

  const openShopifyProductPicker = (initialQuery = '') => {
    const preselected = new Set(poForm.items.map(i => i.product_cost_id))
    setPickerSelected(preselected)
    setPickerSearch(initialQuery || skuPickerSearch || '')
    setPickerSearchBy('all')
    setPickerFilter('all')
    setCollapsedPickerParents(new Set())
    setPickerOpen(true)
    if (fullCatalog.length === 0) fetchInventory('')
  }

  const commitPickerSelection = () => {
    const catalog = fullCatalog.length > 0 ? fullCatalog : inventory
    const catalogById = new Map(catalog.map(r => [r.id, r]))
    setPoForm(prev => {
      const isRec = prev.poType === 'recount'
      const existingById = new Map(prev.items.map(i => [i.product_cost_id, i]))
      const nextItems = []
      // Keep existing items still checked (preserving typed qtys & unit costs)
      for (const it of prev.items) {
        if (pickerSelected.has(it.product_cost_id)) nextItems.push(it)
      }
      // Append newly selected items (pre-filled with current stock in Recount mode!)
      for (const id of pickerSelected) {
        if (!existingById.has(id)) {
          const row = catalogById.get(id)
          if (row) nextItems.push(makePoItemFromCatalog(row, null, isRec))
        }
      }
      return { ...prev, items: nextItems }
    })
    setPickerOpen(false)
    setSkuPickerSearch('')
  }

  const handleCloneLastPo = async () => {
    const lastPo = pos.find(p => !p.is_baseline && p.status !== 'cancelled') || pos[0]
    if (!lastPo) return addToast('No previous Purchase Order to clone yet', 'info')
    setBusyKey('clonePo')
    try {
      const res = await fetch(`${API}/api/po-ledger/pos/${lastPo.id}${qs}`, { headers })
      const j = await res.json()
      if (!j.success || !j.data?.items?.length) return addToast('Could not load last PO items', 'error')
      const catalog = fullCatalog.length > 0 ? fullCatalog : inventory
      const byId = new Map(catalog.map(c => [c.id, c]))
      setPoForm(prev => ({
        ...prev,
        supplier_id: j.data.supplier_id ? String(j.data.supplier_id) : prev.supplier_id,
        landing_cost: j.data.landing_cost || prev.landing_cost,
        notes: `Cloned from ${lastPo.po_number}`,
        items: j.data.items.map(it => {
          const cat = byId.get(it.product_cost_id)
          return {
            product_cost_id: it.product_cost_id,
            shopify_variant_id: it.shopify_variant_id || cat?.shopify_variant_id || '',
            sku: it.sku || cat?.sku || '',
            parent_title: it.parent_title,
            variant_title: it.variant_title || '',
            variant_image_url: cat?.variant_image_url || '',
            inventory_qty: cat?.inventory_qty || 0,
            ordered_qty: it.ordered_qty || 10,
            unit_cost: it.unit_cost || 0,
          }
        }),
      }))
      addToast(`Cloned ${j.data.items.length} variants from ${lastPo.po_number}`, 'success')
    } finally {
      setBusyKey('')
    }
  }

  const applyAllQty = (qtyVal) => {
    const minQ = poForm.poType === 'recount' ? 0 : 1
    const q = Math.max(minQ, parseInt(qtyVal, 10) || 0)
    setPoForm(prev => ({ ...prev, items: prev.items.map(it => ({ ...it, ordered_qty: q })) }))
  }

  const applyAllCost = (costVal, onlyBlank = false) => {
    const c = Math.max(0, parseFloat(costVal) || 0)
    setPoForm(prev => ({
      ...prev,
      items: prev.items.map(it => {
        if (onlyBlank && (parseFloat(it.unit_cost) || 0) > 0) return it
        return { ...it, unit_cost: c }
      }),
    }))
  }

  const applyGroupQty = (parentTitle, qtyVal) => {
    const minQ = poForm.poType === 'recount' ? 0 : 1
    const q = Math.max(minQ, parseInt(qtyVal, 10) || 0)
    setPoForm(prev => ({
      ...prev,
      items: prev.items.map(it => it.parent_title === parentTitle ? { ...it, ordered_qty: q } : it),
    }))
  }

  const applyGroupCost = (parentTitle, costVal) => {
    const c = Math.max(0, parseFloat(costVal) || 0)
    setPoForm(prev => ({
      ...prev,
      items: prev.items.map(it => it.parent_title === parentTitle ? { ...it, unit_cost: c } : it),
    }))
  }

  const handleCreatePo = async (e) => {
    e.preventDefault()
    if (poForm.items.length === 0) {
      addToast('Add at least one SKU to the Purchase Order', 'error')
      return
    }

    // ── EDIT EXISTING PO MODE ──
    if (editingPo) {
      setBusyKey('createPo')
      try {
        const res = await fetch(`${API}/api/po-ledger/pos/${editingPo.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            store_id: activeStoreId,
            supplier_id: poForm.supplier_id ? Number(poForm.supplier_id) : null,
            order_date: poForm.order_date,
            landing_cost: parseFloat(poForm.landing_cost) || 0,
            notes: poForm.notes,
            pushToShopify: Boolean(poForm.pushEditToShopify),
            allowZeroQty: editingPo.status === 'received',
            items: poForm.items.map(it => ({
              id: it.id || undefined,
              product_cost_id: it.product_cost_id,
              shopify_variant_id: it.shopify_variant_id,
              sku: it.sku,
              parent_title: it.parent_title,
              variant_title: it.variant_title,
              ordered_qty: parseInt(it.ordered_qty, 10) || 0,
              unit_cost: parseFloat(it.unit_cost) || 0,
            })),
          }),
        })
        const j = await res.json()
        if (!j.success) {
          addToast(j.error || 'Failed to update PO', 'error')
          return
        }
        addToast(j.message || `${editingPo.po_number} updated`, 'success')
        setEditingPo(null)
        setNewPoOpen(false)
        await refreshAll()
      } finally {
        setBusyKey('')
      }
      return
    }

    const isRecount = poForm.poType === 'recount'
    setBusyKey('createPo')
    try {
      const res = await fetch(`${API}/api/po-ledger/pos`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          store_id: activeStoreId,
          supplier_id: poForm.supplier_id ? Number(poForm.supplier_id) : null,
          order_date: poForm.order_date,
          landing_cost: parseFloat(poForm.landing_cost) || 0,
          notes: poForm.notes || (isRecount ? 'Physical Stock Recount (Exact On-Hand)' : ''),
          allowZeroQty: isRecount,
          items: poForm.items,
        }),
      })
      const j = await res.json()
      if (!j.success) {
        addToast(j.error || 'Failed to create PO', 'error')
        return
      }

      // Immediately receive when in Recount mode OR Receive Immediately is checked
      const shouldReceiveNow = isRecount || poForm.receiveImmediately
      if (shouldReceiveNow && j.data?.id && Array.isArray(j.data?.items)) {
        const mode = isRecount
          ? (poForm.shopifySyncMode === 'erp_only' ? 'erp_only' : 'set_exact_on_hand')
          : (poForm.shopifySyncMode || 'add_delta')
        const recRes = await fetch(`${API}/api/po-ledger/pos/${j.data.id}/receive`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            store_id: activeStoreId,
            items: j.data.items.map(it => ({ itemId: it.id, receiveNowQty: Math.max(0, parseInt(it.ordered_qty, 10) || 0) })),
            shopifySyncMode: mode,
            pushToShopify: mode !== 'erp_only',
            closeShort: false,
            notes: mode === 'set_exact_on_hand'
              ? 'Recount PO received immediately (Set Exact On-Hand on Shopify)'
              : 'Received immediately on PO creation',
          }),
        })
        const recJ = await recRes.json()
        if (recJ.success) {
          addToast(recJ.message || `${j.data.po_number} created & received!`, 'success')
        } else {
          addToast(`${j.data.po_number} created, but auto-receive failed: ${recJ.error || 'Check Receive button'}`, 'warning')
        }
      } else {
        addToast(j.message, 'success')
      }

      setNewPoOpen(false)
      await refreshAll()
    } finally {
      setBusyKey('')
    }
  }

  const openReceiveModal = async (poId) => {
    setBusyKey(`openRec-${poId}`)
    try {
      const res = await fetch(`${API}/api/po-ledger/pos/${poId}${qs}`, { headers })
      const j = await res.json()
      if (!j.success) return addToast(j.error || 'Failed to load PO', 'error')
      const qtys = {}
      for (const it of j.data.items || []) {
        qtys[it.id] = Math.max(0, (it.ordered_qty || 0) - (it.received_qty || 0))
      }
      setReceiveModal({ po: j.data, qtys, shopifySyncMode: 'add_delta', pushToShopify: true, closeShort: false, notes: '' })
    } finally {
      setBusyKey('')
    }
  }

  const handleConfirmReceive = async (e) => {
    e.preventDefault()
    if (!receiveModal) return
    setBusyKey('confirmReceive')
    try {
      const mode = receiveModal.shopifySyncMode || (receiveModal.pushToShopify ? 'add_delta' : 'erp_only')
      const itemsPayload = (receiveModal.po.items || []).map(it => ({
        itemId: it.id,
        receiveNowQty: Math.max(0, parseInt(receiveModal.qtys[it.id], 10) || 0),
      }))
      const res = await fetch(`${API}/api/po-ledger/pos/${receiveModal.po.id}/receive`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          store_id: activeStoreId,
          items: itemsPayload,
          shopifySyncMode: mode,
          pushToShopify: mode !== 'erp_only',
          closeShort: receiveModal.closeShort,
          notes: receiveModal.notes,
        }),
      })
      const j = await res.json()
      if (j.success) {
        addToast(j.message, 'success')
        setReceiveModal(null)
        await refreshAll()
      } else {
        addToast(j.error || 'Failed to receive stock', 'error')
      }
    } finally {
      setBusyKey('')
    }
  }

  const openViewPo = async (poId) => {
    const res = await fetch(`${API}/api/po-ledger/pos/${poId}${qs}`, { headers })
    const j = await res.json()
    if (j.success) setViewPoModal(j.data)
  }

  const handleCancelPo = async (po) => {
    if (!window.confirm(`Cancel ${po.po_number}?`)) return
    const res = await fetch(`${API}/api/po-ledger/pos/${po.id}/cancel`, {
      method: 'PUT', headers, body: JSON.stringify({ store_id: activeStoreId }),
    })
    const j = await res.json()
    if (j.success) { addToast(j.message, 'success'); await refreshAll() }
    else addToast(j.error || 'Cannot cancel PO', 'error')
  }

  const openReverseModal = async (poId) => {
    setBusyKey(`openRev-${poId}`)
    try {
      const res = await fetch(`${API}/api/po-ledger/pos/${poId}${qs}`, { headers })
      const j = await res.json()
      if (!j.success || !j.data) return addToast(j.error || 'Failed to load PO', 'error')
      setReverseModal({ po: j.data, pushToShopify: false, reason: '' })
    } finally {
      setBusyKey('')
    }
  }

  const handleConfirmReverse = async (e) => {
    e.preventDefault()
    if (!reverseModal?.po) return
    setBusyKey('confirmReverse')
    try {
      const res = await fetch(`${API}/api/po-ledger/pos/${reverseModal.po.id}/reverse`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          store_id: activeStoreId,
          pushToShopify: Boolean(reverseModal.pushToShopify),
          reason: reverseModal.reason,
        }),
      })
      const j = await res.json()
      if (j.success) {
        addToast(j.message, 'success')
        setReverseModal(null)
        await refreshAll()
      } else {
        addToast(j.error || 'Cannot reverse PO', 'error')
      }
    } finally {
      setBusyKey('')
    }
  }

  const handleSaveSupplier = async (e) => {
    e.preventDefault()
    setBusyKey('saveSup')
    try {
      const res = await fetch(`${API}/api/po-ledger/suppliers`, {
        method: 'POST', headers, body: JSON.stringify({ store_id: activeStoreId, ...supplierModal }),
      })
      const j = await res.json()
      if (j.success) { addToast(j.message, 'success'); setSupplierModal(null); await refreshAll() }
      else addToast(j.error || 'Failed to save supplier', 'error')
    } finally {
      setBusyKey('')
    }
  }

  const openSupplierStatement = async (sup) => {
    const res = await fetch(`${API}/api/po-ledger/suppliers/${sup.id}/statement${qs}`, { headers })
    const j = await res.json()
    if (j.success) setStatementModal(j.data)
    else addToast(j.error || 'Failed to load statement', 'error')
  }

  const handleSupplierReturn = async (e) => {
    e.preventDefault()
    setBusyKey('supReturn')
    try {
      const res = await fetch(`${API}/api/po-ledger/suppliers/return`, {
        method: 'POST', headers, body: JSON.stringify({ store_id: activeStoreId, ...supReturnModal }),
      })
      const j = await res.json()
      if (j.success) { addToast(j.message, 'success'); setSupReturnModal(null); await refreshAll() }
      else addToast(j.error || 'Failed to record supplier return', 'error')
    } finally {
      setBusyKey('')
    }
  }

  const handleSaveAccount = async (e) => {
    e.preventDefault()
    setBusyKey('saveAcc')
    try {
      const res = await fetch(`${API}/api/po-ledger/accounts`, {
        method: 'POST', headers, body: JSON.stringify({ store_id: activeStoreId, ...accountModal }),
      })
      const j = await res.json()
      if (j.success) { addToast(j.message, 'success'); setAccountModal(null); await refreshAll() }
      else addToast(j.error || 'Failed to save account', 'error')
    } finally {
      setBusyKey('')
    }
  }

  const handleSaveLedgerEntry = async (e) => {
    e.preventDefault()
    setBusyKey('saveLedger')
    try {
      const res = await fetch(`${API}/api/po-ledger/ledger`, {
        method: 'POST', headers, body: JSON.stringify({ store_id: activeStoreId, ...ledgerModal }),
      })
      const j = await res.json()
      if (j.success) { addToast(j.message, 'success'); setLedgerModal(null); await refreshAll() }
      else addToast(j.error || 'Failed to post entry', 'error')
    } finally {
      setBusyKey('')
    }
  }

  const handleVoidEntry = async (entry) => {
    const reason = window.prompt(`Void "${entry.description}" (${fmtRs(entry.amount)})?\nEnter reason (preserved in audit log):`, 'Correction')
    if (reason === null) return
    const res = await fetch(`${API}/api/po-ledger/ledger/${entry.id}/void`, {
      method: 'PUT', headers, body: JSON.stringify({ store_id: activeStoreId, reason }),
    })
    const j = await res.json()
    if (j.success) { addToast(j.message, 'success'); await refreshAll() }
    else addToast(j.error || 'Void failed', 'error')
  }

  const handleManualAdjust = async (e) => {
    e.preventDefault()
    setBusyKey('adjust')
    try {
      const res = await fetch(`${API}/api/po-ledger/inventory/adjust`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          store_id: activeStoreId,
          product_cost_id: adjustModal.item.id,
          qty_delta: parseInt(adjustModal.qty_delta, 10),
          movement_type: adjustModal.movement_type,
          notes: adjustModal.notes,
          pushToShopify: adjustModal.pushToShopify,
        }),
      })
      const j = await res.json()
      if (j.success) { addToast(j.message, 'success'); setAdjustModal(null); await refreshAll() }
      else addToast(j.error || 'Adjustment failed', 'error')
    } finally {
      setBusyKey('')
    }
  }

  const handleToggleContinueSelling = async (item) => {
    const nextEnabled = String(item.inventory_policy || '').toLowerCase() !== 'continue'
    setBusyKey(`cs-${item.id}`)
    try {
      const res = await fetch(`${API}/api/po-ledger/inventory/${item.id}/continue-selling`, {
        method: 'PUT', headers, body: JSON.stringify({ store_id: activeStoreId, enabled: nextEnabled }),
      })
      const j = await res.json()
      if (j.success) { addToast(j.message, 'success'); await fetchInventory(invSearch) }
      else addToast(j.error || 'Policy update failed', 'error')
    } finally {
      setBusyKey('')
    }
  }

  const handleSaveSharedPool = async (e) => {
    e.preventDefault()
    setBusyKey('pool')
    try {
      const res = await fetch(`${API}/api/po-ledger/inventory/${poolModal.item.id}/shared-pool`, {
        method: 'PUT', headers, body: JSON.stringify({ store_id: activeStoreId, shared_pool_key: poolModal.shared_pool_key }),
      })
      const j = await res.json()
      if (j.success) { addToast(j.message, 'success'); setPoolModal(null); await fetchInventory(invSearch) }
      else addToast(j.error || 'Pool update failed', 'error')
    } finally {
      setBusyKey('')
    }
  }

  const openLedgerQuick = (presetType, extra = {}) => {
    const defAcc = accounts[0]?.id ? String(accounts[0].id) : ''
    const secondAcc = accounts[1]?.id ? String(accounts[1].id) : ''
    setLedgerModal({
      entry_type: presetType,
      entry_date: new Date().toISOString().slice(0, 10),
      amount: extra.amount || '',
      account_id: defAcc,
      from_account_id: defAcc,
      to_account_id: secondAcc,
      supplier_id: extra.supplier_id ? String(extra.supplier_id) : '',
      po_id: extra.po_id ? String(extra.po_id) : '',
      description: extra.description || '',
      ref_label: extra.ref_label || '',
      direction: presetType === 'capital_in' ? 'in' : 'out',
    })
  }

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '8px 11px', color: 'var(--text-primary)',
    fontSize: 13, outline: 'none', fontFamily: 'inherit',
  }

  const labelStyle = {
    display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5,
  }

  const poCatalogSource = fullCatalog.length > 0 ? fullCatalog : inventory

  // Group entire catalog by parent_title for Shopify-style Product/Variant picker & quick-adds
  const groupedCatalogForPo = useMemo(() => {
    const map = new Map()
    for (const row of poCatalogSource) {
      const key = row.parent_title || 'Untitled Product'
      let g = map.get(key)
      if (!g) {
        g = {
          parent_title: key,
          status: (row.status || 'active').toLowerCase(),
          image: row.variant_image_url || '',
          totalQty: 0,
          variants: [],
        }
        map.set(key, g)
      }
      if (!g.image && row.variant_image_url) g.image = row.variant_image_url
      g.totalQty += (Number(row.inventory_qty) || 0)
      g.variants.push(row)
    }
    return Array.from(map.values())
  }, [poCatalogSource])

  // Fast inline suggestions when typing directly in PO search box
  const quickInlineMatches = useMemo(() => {
    const q = skuPickerSearch.trim().toLowerCase()
    if (!q) return []
    return groupedCatalogForPo
      .map(g => {
        const titleHit = g.parent_title.toLowerCase().includes(q)
        const matchedVariants = titleHit
          ? g.variants
          : g.variants.filter(v => (v.variant_title || '').toLowerCase().includes(q) || (v.sku || '').toLowerCase().includes(q))
        return matchedVariants.length > 0 ? { ...g, matchedVariants } : null
      })
      .filter(Boolean)
      .slice(0, 8)
  }, [groupedCatalogForPo, skuPickerSearch])

  // Filtered products inside the Shopify-style "Add products" modal
  const pickerGroups = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase()
    return groupedCatalogForPo
      .map(g => {
        const filteredVars = g.variants.filter(v => {
          const qty = Number(v.inventory_qty) || 0
          const st = (v.status || 'active').toLowerCase()
          if (pickerFilter === 'active' && st !== 'active') return false
          if (pickerFilter === 'draft' && st !== 'draft') return false
          if (pickerFilter === 'backorder' && qty >= 0) return false
          if (pickerFilter === 'oos' && qty !== 0) return false
          if (pickerFilter === 'low' && (qty <= 0 || qty > 5)) return false
          if (!q) return true
          if (pickerSearchBy === 'sku') return (v.sku || '').toLowerCase().includes(q)
          if (pickerSearchBy === 'title') return g.parent_title.toLowerCase().includes(q) || (v.variant_title || '').toLowerCase().includes(q)
          return g.parent_title.toLowerCase().includes(q) || (v.variant_title || '').toLowerCase().includes(q) || (v.sku || '').toLowerCase().includes(q)
        })
        if (filteredVars.length === 0) return null
        const sortedVars = sortVariantsSmart(filteredVars, pickerGroupBy)
        // Build unique Colors & natural-ordered Sizes for 1-click chips
        const colorMap = new Map()
        const sizeMap = new Map()
        for (const v of sortedVars) {
          const p = parseVariantParts(v.variant_title)
          if (p.color) {
            if (!colorMap.has(p.color)) colorMap.set(p.color, [])
            colorMap.get(p.color).push(v.id)
          }
          if (p.size) {
            if (!sizeMap.has(p.size)) sizeMap.set(p.size, { rank: p.sizeRank, ids: [] })
            sizeMap.get(p.size).ids.push(v.id)
          }
        }
        const colors = Array.from(colorMap.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([label, ids]) => ({ label, ids }))
        const sizes = Array.from(sizeMap.entries())
          .sort((a, b) => a[1].rank - b[1].rank || a[0].localeCompare(b[0]))
          .map(([label, info]) => ({ label, ids: info.ids }))
        return { ...g, variants: sortedVars, colors, sizes }
      })
      .filter(Boolean)
  }, [groupedCatalogForPo, pickerSearch, pickerSearchBy, pickerFilter, pickerGroupBy])

  // Quick-add counts for 1-click toolbar buttons
  const quickAddCounts = useMemo(() => {
    let backorders = 0, lowStock = 0, outOfStock = 0
    for (const r of poCatalogSource) {
      const qty = Number(r.inventory_qty) || 0
      const st = (r.status || 'active').toLowerCase()
      if (qty < 0) backorders++
      if (st === 'active' && qty > 0 && qty <= 5) lowStock++
      if (st === 'active' && qty === 0) outOfStock++
    }
    return { backorders, lowStock, outOfStock }
  }, [poCatalogSource])

  // Group selected PO items by parent_title for per-product quick-fill bars
  const groupedPoItems = useMemo(() => {
    const map = new Map()
    poForm.items.forEach((it, idx) => {
      const key = it.parent_title || 'Untitled Product'
      let g = map.get(key)
      if (!g) {
        const catGroup = groupedCatalogForPo.find(cg => cg.parent_title === key)
        g = {
          parent_title: key,
          image: it.variant_image_url || catGroup?.image || '',
          allCatalogVariants: catGroup?.variants || [],
          entries: [],
          totalUnits: 0,
          subtotal: 0,
        }
        map.set(key, g)
      }
      const q = parseInt(it.ordered_qty, 10) || 0
      const c = parseFloat(it.unit_cost) || 0
      g.entries.push({ item: it, idx })
      g.totalUnits += q
      g.subtotal += q * c
    })
    return Array.from(map.values()).map(g => ({
      ...g,
      entries: [...g.entries].sort((a, b) => {
        const pa = parseVariantParts(a.item.variant_title)
        const pb = parseVariantParts(b.item.variant_title)
        const cCmp = pa.color.localeCompare(pb.color)
        if (cCmp !== 0) return cCmp
        if (pa.sizeRank !== pb.sizeRank) return pa.sizeRank - pb.sizeRank
        return (a.item.variant_title || '').localeCompare(b.item.variant_title || '')
      }),
    }))
  }, [poForm.items, groupedCatalogForPo])

  const poTotalUnits = poForm.items.reduce((s, i) => s + (parseInt(i.ordered_qty, 10) || 0), 0)
  const poSubtotalPreview = poForm.items.reduce((s, i) => s + (parseInt(i.ordered_qty, 10) || 0) * (parseFloat(i.unit_cost) || 0), 0)
  const poLandingPreview = parseFloat(poForm.landing_cost) || 0
  const poFreightPerUnit = poTotalUnits > 0 && poLandingPreview > 0 ? Math.round((poLandingPreview / poTotalUnits) * 100) / 100 : 0
  const poTotalPreview = poSubtotalPreview + poLandingPreview

  // Live Recount impact summary (Changed SKUs, Unchanged SKUs, Net Delta)
  const recountImpact = useMemo(() => {
    let changedSkus = 0, unchangedSkus = 0, netDelta = 0
    for (const it of poForm.items) {
      const cur = Number(it.inventory_qty) || 0
      const target = Math.max(0, parseInt(it.ordered_qty, 10) || 0)
      const diff = target - cur
      if (diff === 0) unchangedSkus++
      else {
        changedSkus++
        netDelta += diff
      }
    }
    return { changedSkus, unchangedSkus, netDelta }
  }, [poForm.items])

  return (
    <div style={{ padding: '20px 24px 40px', maxWidth: 1540, margin: '0 auto' }}>

      {/* ─── Header & Segmented Tabs ─── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14,
        marginBottom: 18, paddingBottom: 14, borderBottom: '1px solid var(--border)',
      }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
            Purchase Orders &amp; Store Ledger
          </h1>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 3 }}>
            Per-store isolated FIFO PO costing (Batch-by-Batch), Warehouse Stock &amp; Real Cashflow Khata
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
            background: 'var(--bg-elevated)', padding: 4, borderRadius: 10, border: '1px solid var(--border)',
          }}>
            {[
              { id: 'pos',       label: 'Purchase Orders', icon: <Svg.Box size={13.5} />, badge: pos.filter(p => ['ordered', 'partial'].includes(p.status)).length || null },
              { id: 'suppliers', label: 'Suppliers & Khata', icon: <Svg.Users size={13.5} /> },
              { id: 'ledger',    label: 'Cash & Bank Ledger', icon: <Svg.Wallet size={13.5} /> },
              { id: 'inventory', label: 'Warehouse Stock', icon: <Svg.Layers size={13.5} />, alertCount: summary?.backorderSkus || 0 },
            ].map(t => {
              const active = activeTab === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6.5px 13px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5,
                    fontWeight: active ? 700 : 600,
                    border: active ? '1px solid var(--border)' : '1px solid transparent',
                    background: active ? 'var(--bg-surface)' : 'transparent',
                    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                  }}
                >
                  {t.icon}
                  <span>{t.label}</span>
                  {t.badge != null && (
                    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: 'rgba(245,158,11,0.14)', color: '#b45309' }}>
                      {t.badge}
                    </span>
                  )}
                  {t.alertCount > 0 && (
                    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: 'rgba(239,68,68,0.12)', color: '#dc2626' }}>
                      -{t.alertCount}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 12px', borderRadius: 9,
              border: '1px solid rgba(37,99,235,0.32)',
              background: 'rgba(37,99,235,0.08)', color: '#2563eb',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            <span>? Ghost &amp; SKU Guide</span>
          </button>

          <button
            type="button"
            onClick={refreshAll}
            disabled={loading}
            title="Refresh all metrics"
            style={{
              width: 34, height: 34, borderRadius: 9, border: '1px solid var(--border)',
              background: 'var(--bg-surface)', color: 'var(--text-muted)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}
          >
            <Svg.Refresh size={14} />
          </button>
        </div>
      </div>

      {/* ─── "WHERE IS MY MONEY?" EXECUTIVE BALANCE STRIP ─── */}
      {summary && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))',
          gap: 12,
          marginBottom: 18,
        }}>
          {[
            {
              title: 'Cash & Bank',
              value: fmtRs(summary.cashBalance),
              sub: `${summary.accountsCount} active accounts`,
              accent: summary.cashBalance >= 0 ? '#059669' : '#dc2626',
            },
            {
              title: 'Shelf Stock Value',
              value: fmtRs(summary.shelfValue),
              sub: `${summary.shelfUnits.toLocaleString()} units on hand`,
              accent: '#2563eb',
            },
            {
              title: 'In-Transit Stock',
              value: fmtRs(summary.inTransitValue),
              sub: `${summary.inTransitOrders.toLocaleString()} parcels with couriers`,
              accent: '#7c3aed',
            },
            {
              title: 'Courier Pending COD',
              value: fmtRs(summary.courierReceivables),
              sub: `${summary.unpaidDeliveredOrders.toLocaleString()} unpaid delivered`,
              accent: '#0891b2',
            },
            {
              title: 'Supplier Payables',
              value: fmtRs(summary.supplierPayables),
              sub: summary.supplierAdvances > 0
                ? `Advances credit: ${fmtRs(summary.supplierAdvances)}`
                : `${summary.suppliersCount} suppliers`,
              accent: summary.supplierPayables > 0 ? '#dc2626' : '#059669',
            },
            {
              title: 'True Net Worth',
              value: fmtRs(summary.netWorth),
              sub: 'Cash + Stock + Transit + COD − Payables',
              accent: summary.netWorth >= 0 ? '#059669' : '#dc2626',
              highlight: true,
            },
          ].map((card, i) => (
            <div key={i} style={{
              background: card.highlight ? 'rgba(16,185,129,0.06)' : 'var(--bg-surface)',
              border: card.highlight ? '1px solid rgba(16,185,129,0.32)' : '1px solid var(--border)',
              borderRadius: 12, padding: '13px 15px',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
                {card.title}
              </div>
              <div style={{ fontSize: 19, fontWeight: 800, color: card.accent, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                {card.value}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 3 }}>
                {card.sub}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* TAB 1: PURCHASE ORDERS                                             */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'pos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
            background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '11px 14px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={openBlankPo}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7.5px 14px', borderRadius: 8, border: 'none',
                  background: '#2563eb', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                }}
              >
                <Svg.Plus size={13} /> New Purchase Order
              </button>

              {summary && !summary.hasBaseline ? (
                <button
                  type="button"
                  disabled={busyKey === 'baseline'}
                  onClick={handleBaselinePo}
                  style={{
                    padding: '7.5px 13px', borderRadius: 8,
                    border: '1px solid rgba(16,185,129,0.35)', background: 'rgba(16,185,129,0.09)',
                    color: '#059669', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  {busyKey === 'baseline' ? 'Creating Baseline...' : '1-Click Baseline PO (Opening Stock)'}
                </button>
              ) : (
                <Pill label="Baseline Initialized" color="#059669" bg="rgba(16,185,129,0.10)" border="rgba(16,185,129,0.25)" />
              )}

              {summary?.backorderSkus > 0 && (
                <button
                  type="button"
                  disabled={busyKey === 'backorders'}
                  onClick={openNewPoFromBackorders}
                  style={{
                    padding: '7.5px 13px', borderRadius: 8,
                    border: '1px solid rgba(239,68,68,0.32)', background: 'rgba(239,68,68,0.09)',
                    color: '#dc2626', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  Create PO from {summary.backorderSkus} Backorders ({summary.backorderUnits} pcs)
                </button>
              )}
            </div>

            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Partial receiving supported · Strict FIFO batch costing (oldest PO batch consumed first)
            </span>
          </div>

          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            {pos.length === 0 ? (
              <div style={{ padding: '38px 20px', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
                No Purchase Orders yet. Start with <strong>1-Click Baseline PO</strong> for existing shelf stock, then create normal POs for new supplier shipments.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                      <th style={{ padding: '9px 14px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>PO #</th>
                      <th style={{ padding: '9px 12px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Supplier</th>
                      <th style={{ padding: '9px 12px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Date</th>
                      <th style={{ padding: '9px 12px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Status</th>
                      <th style={{ padding: '9px 12px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Received / Qty</th>
                      <th style={{ padding: '9px 12px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Billed / Total</th>
                      <th style={{ padding: '9px 12px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Paid / Payable</th>
                      <th style={{ padding: '9px 14px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pos.map(p => {
                      const st = PO_STATUS_BADGE[p.status] || PO_STATUS_BADGE.ordered
                      const canReceive = !p.is_baseline && ['ordered', 'partial'].includes(p.status)
                      const canPay = !p.is_baseline && p.status !== 'cancelled' && p.remaining_payable > 0
                      return (
                        <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '11px 14px' }}>
                            <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{p.po_number}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.line_count} SKUs</div>
                          </td>
                          <td style={{ padding: '11px 12px', color: 'var(--text-primary)', fontWeight: 600 }}>
                            {p.is_baseline ? 'Opening Stock Snapshot' : (p.supplier_name || '—')}
                          </td>
                          <td style={{ padding: '11px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{p.order_date}</td>
                          <td style={{ padding: '11px 12px' }}>
                            <Pill label={p.is_baseline ? 'Baseline' : st.label} color={st.color} bg={st.bg} border={st.border} />
                          </td>
                          <td style={{ padding: '11px 12px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)', fontWeight: 700 }}>
                            {p.total_received_qty} / {p.total_ordered_qty}
                          </td>
                          <td style={{ padding: '11px 12px', fontVariantNumeric: 'tabular-nums' }}>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{fmtRs(p.is_baseline ? p.total_cost : p.billed_cost)}</div>
                            {!p.is_baseline && p.total_cost !== p.billed_cost && (
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Ordered: {fmtRs(p.total_cost)}</div>
                            )}
                          </td>
                          <td style={{ padding: '11px 12px', fontVariantNumeric: 'tabular-nums' }}>
                            {p.is_baseline ? (
                              <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Payable Rs. 0</span>
                            ) : p.status === 'cancelled' ? (
                              <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Cancelled</span>
                            ) : (Number(p.billed_cost) || 0) <= 0 ? (
                              <>
                                <div style={{ fontWeight: 700, color: '#b45309' }}>Pending Receipt</div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Paid: {fmtRs(p.paid_amount)}</div>
                              </>
                            ) : (
                              <>
                                <div style={{ fontWeight: 700, color: p.remaining_payable > 0 ? '#dc2626' : '#059669' }}>
                                  {p.remaining_payable > 0 ? `Due ${fmtRs(p.remaining_payable)}` : 'Paid'}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Paid: {fmtRs(p.paid_amount)}</div>
                              </>
                            )}
                          </td>
                          <td style={{ padding: '11px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', gap: 6 }}>
                              {canReceive && (
                                <button
                                  type="button"
                                  onClick={() => openReceiveModal(p.id)}
                                  style={{
                                    padding: '5px 10px', borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                                    background: 'rgba(16,185,129,0.11)', color: '#059669', border: '1px solid rgba(16,185,129,0.32)',
                                  }}
                                >
                                  Receive Stock
                                </button>
                              )}
                              {canPay && (
                                <button
                                  type="button"
                                  onClick={() => openLedgerQuick('po_payment', {
                                    po_id: p.id,
                                    supplier_id: p.supplier_id,
                                    amount: p.remaining_payable,
                                    ref_label: p.po_number,
                                    description: `Payment for ${p.po_number}`,
                                  })}
                                  style={{
                                    padding: '5px 10px', borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                                    background: 'rgba(37,99,235,0.10)', color: '#2563eb', border: '1px solid rgba(37,99,235,0.30)',
                                  }}
                                >
                                  Pay
                                </button>
                              )}
                                <button
                                  type="button"
                                  onClick={() => openViewPo(p.id)}
                                  style={{
                                    padding: '5px 9px', borderRadius: 7, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                                    background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)',
                                  }}
                                >
                                  View
                                </button>
                                {!p.is_baseline && p.status !== 'cancelled' && (
                                  <button
                                    type="button"
                                    disabled={busyKey === `openEdit-${p.id}`}
                                    onClick={() => openEditPo(p.id)}
                                    style={{
                                      padding: '5px 9px', borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                                      background: 'rgba(245,158,11,0.11)', color: '#b45309', border: '1px solid rgba(245,158,11,0.34)',
                                    }}
                                  >
                                    {busyKey === `openEdit-${p.id}` ? '...' : 'Edit'}
                                  </button>
                                )}
                                {!p.is_baseline && p.total_received_qty === 0 && p.status !== 'cancelled' && (
                                  <button
                                    type="button"
                                    onClick={() => handleCancelPo(p)}
                                    style={{
                                      padding: '5px 9px', borderRadius: 7, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                                      background: 'rgba(239,68,68,0.08)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.24)',
                                    }}
                                  >
                                    Cancel
                                  </button>
                                )}
                                {!p.is_baseline && p.total_received_qty > 0 && p.status !== 'cancelled' && (Number(p.paid_amount) || 0) <= 0.01 && (
                                  <button
                                    type="button"
                                    disabled={busyKey === `openRev-${p.id}`}
                                    onClick={() => openReverseModal(p.id)}
                                    title="Undo this received PO (reverses unconsumed stock & cancels bill)"
                                    style={{
                                      padding: '5px 9px', borderRadius: 7, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                                      background: 'rgba(239,68,68,0.08)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.24)',
                                    }}
                                  >
                                    Undo
                                  </button>
                                )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* TAB 2: SUPPLIERS & KHATA                                           */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'suppliers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
            background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '11px 14px',
          }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setSupplierModal({ name: '', phone: '', contact_person: '', city: '', opening_balance: 0, notes: '' })}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7.5px 14px', borderRadius: 8, border: 'none',
                  background: '#2563eb', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                }}
              >
                <Svg.Plus size={13} /> Add Supplier
              </button>
              <button
                type="button"
                disabled={suppliers.length === 0}
                onClick={() => setSupReturnModal({
                  supplier_id: String(suppliers[0]?.id || ''),
                  product_cost_id: '',
                  qty: 1,
                  unit_cost: '',
                  entry_date: new Date().toISOString().slice(0, 10),
                  notes: '',
                  pushToShopify: true,
                })}
                style={{
                  padding: '7.5px 13px', borderRadius: 8, border: '1px solid var(--border)',
                  background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                  fontSize: 12.5, fontWeight: 700, cursor: suppliers.length ? 'pointer' : 'not-allowed',
                  opacity: suppliers.length ? 1 : 0.5,
                }}
              >
                Record Defective Return to Supplier
              </button>
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Positive Opening Balance = Udhaar Payable · Negative Opening Balance = Advance (Peshgi)
            </span>
          </div>

          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            {suppliers.length === 0 ? (
              <div style={{ padding: '38px 20px', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
                No suppliers added for this store yet. Add your factories/vendors (with any existing udhaar or advance as Opening Balance).
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                      <th style={{ padding: '9px 14px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Supplier</th>
                      <th style={{ padding: '9px 12px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Opening</th>
                      <th style={{ padding: '9px 12px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>PO Bills</th>
                      <th style={{ padding: '9px 12px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Paid / Advances</th>
                      <th style={{ padding: '9px 12px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Returns</th>
                      <th style={{ padding: '9px 12px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Net Balance</th>
                      <th style={{ padding: '9px 14px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppliers.map(s => (
                      <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '11px 14px' }}>
                          <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{s.name}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                            {[s.contact_person, s.phone, s.city].filter(Boolean).join(' · ') || `${s.po_count} POs`}
                          </div>
                        </td>
                        <td style={{ padding: '11px 12px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{fmtRs(s.opening_balance)}</td>
                        <td style={{ padding: '11px 12px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)', fontWeight: 600 }}>{fmtRs(s.total_billed)}</td>
                        <td style={{ padding: '11px 12px', fontVariantNumeric: 'tabular-nums', color: '#059669', fontWeight: 600 }}>{fmtRs(s.total_paid)}</td>
                        <td style={{ padding: '11px 12px', fontVariantNumeric: 'tabular-nums', color: '#0891b2' }}>{fmtRs(s.total_returns)}</td>
                        <td style={{ padding: '11px 12px', fontVariantNumeric: 'tabular-nums' }}>
                          {s.net_balance > 0 ? (
                            <Pill label={`Payable ${fmtRs(s.net_balance)}`} color="#dc2626" bg="rgba(239,68,68,0.10)" border="rgba(239,68,68,0.24)" />
                          ) : s.net_balance < 0 ? (
                            <Pill label={`Advance ${fmtRs(Math.abs(s.net_balance))}`} color="#059669" bg="rgba(16,185,129,0.10)" border="rgba(16,185,129,0.25)" />
                          ) : (
                            <Pill label="Settled · Rs. 0" color="var(--text-muted)" bg="var(--bg-elevated)" border="var(--border)" />
                          )}
                        </td>
                        <td style={{ padding: '11px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            <button
                              type="button"
                              onClick={() => openLedgerQuick('supplier_advance', {
                                supplier_id: s.id,
                                amount: s.net_balance > 0 ? s.net_balance : '',
                                description: s.net_balance > 0 ? `Payment to ${s.name}` : `Advance / Peshgi to ${s.name}`,
                              })}
                              style={{
                                padding: '5px 10px', borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                                background: 'rgba(37,99,235,0.10)', color: '#2563eb', border: '1px solid rgba(37,99,235,0.28)',
                              }}
                            >
                              Pay / Advance
                            </button>
                            <button
                              type="button"
                              onClick={() => openSupplierStatement(s)}
                              style={{
                                padding: '5px 9px', borderRadius: 7, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                                background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)',
                              }}
                            >
                              Khata
                            </button>
                            <button
                              type="button"
                              onClick={() => setSupplierModal({ ...s })}
                              style={{
                                padding: '5px 9px', borderRadius: 7, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                                background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)',
                              }}
                            >
                              Edit
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* TAB 3: CASH & BANK LEDGER                                          */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'ledger' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Accounts Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {accounts.map(acc => (
              <div key={acc.id} style={{
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: 12, padding: '13px 15px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    {ACCOUNT_TYPE_LABELS[acc.account_type] || acc.account_type}{acc.is_default ? ' · Default' : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAccountModal({ ...acc })}
                    style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', padding: 0 }}
                  >
                    Edit
                  </button>
                </div>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>{acc.name}</div>
                  <div style={{ fontSize: 19, fontWeight: 800, color: acc.current_balance >= 0 ? '#059669' : '#dc2626', marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
                    {fmtRs(acc.current_balance)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    Opening: {fmtRs(acc.opening_balance)}
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={() => setAccountModal({ name: '', account_type: 'ad_wallet', opening_balance: 0, is_default: false, notes: '' })}
              style={{
                background: 'var(--bg-elevated)', border: '1.5px dashed var(--border)', borderRadius: 12,
                padding: 16, cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12.5, fontWeight: 700,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 105,
              }}
            >
              <Svg.Plus size={18} />
              <span>Add Bank / Cash / Ad Card</span>
            </button>
          </div>

          {/* Quick Actions & Filters Bar */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
            background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '11px 14px',
          }}>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => openLedgerQuick('transfer', { description: 'Bank to Ad Card / Account Transfer' })}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 12px', borderRadius: 8, border: 'none',
                  background: '#2563eb', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >
                <Svg.ArrowLR size={13} /> Transfer / Ad Card Top-Up
              </button>
              <button
                type="button"
                onClick={() => openLedgerQuick('capital_in', { description: 'Owner Capital Investment' })}
                style={{
                  padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: 'rgba(16,185,129,0.10)', color: '#059669', border: '1px solid rgba(16,185,129,0.30)',
                }}
              >
                + Capital In
              </button>
              <button
                type="button"
                onClick={() => openLedgerQuick('owner_drawing', { description: 'Owner Profit Withdrawal' })}
                style={{
                  padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: 'rgba(239,68,68,0.09)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.28)',
                }}
              >
                − Owner Drawing
              </button>
              <button
                type="button"
                onClick={() => openLedgerQuick('adjustment', { description: 'Balance Adjustment' })}
                style={{
                  padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)',
                }}
              >
                Adjustment
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <select
                value={ledgerFilter.account_id}
                onChange={e => setLedgerFilter(f => ({ ...f, account_id: e.target.value }))}
                style={{ ...inputStyle, width: 'auto', padding: '6px 10px', fontSize: 12 }}
              >
                <option value="">All Accounts</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <select
                value={ledgerFilter.entry_type}
                onChange={e => setLedgerFilter(f => ({ ...f, entry_type: e.target.value }))}
                style={{ ...inputStyle, width: 'auto', padding: '6px 10px', fontSize: 12 }}
              >
                <option value="all">All Entry Types</option>
                {Object.entries(ENTRY_TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={ledgerFilter.includeVoid}
                  onChange={e => setLedgerFilter(f => ({ ...f, includeVoid: e.target.checked }))}
                />
                Show Voided
              </label>
            </div>
          </div>

          {/* Ledger Table */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            {ledgerEntries.length === 0 ? (
              <div style={{ padding: '36px 20px', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
                No ledger entries yet. CPR settlements, Manual Expenses, PO payments, Transfers, and Capital entries will appear here automatically.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                      <th style={{ padding: '9px 14px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Date</th>
                      <th style={{ padding: '9px 12px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Type</th>
                      <th style={{ padding: '9px 12px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Account</th>
                      <th style={{ padding: '9px 12px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Description / Ref</th>
                      <th style={{ padding: '9px 12px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Staff</th>
                      <th style={{ padding: '9px 12px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'right' }}>Amount</th>
                      <th style={{ padding: '9px 14px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'right' }}>Audit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerEntries.map(e => {
                      const meta = ENTRY_TYPE_META[e.entry_type] || { label: e.entry_type, color: 'var(--text-muted)', bg: 'var(--bg-elevated)' }
                      const isIn = e.direction === 'in'
                      return (
                        <tr key={e.id} style={{ borderBottom: '1px solid var(--border)', opacity: e.is_void ? 0.5 : 1 }}>
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{e.entry_date}</td>
                          <td style={{ padding: '10px 12px' }}>
                            <Pill label={meta.label} color={meta.color} bg={meta.bg} />
                          </td>
                          <td style={{ padding: '10px 12px', color: 'var(--text-primary)', fontWeight: 600 }}>
                            {e.account_name || (e.entry_type === 'supplier_return' ? 'Supplier Khata' : '—')}
                          </td>
                          <td style={{ padding: '10px 12px', maxWidth: 340 }}>
                            <div style={{ color: 'var(--text-primary)', textDecoration: e.is_void ? 'line-through' : 'none' }}>
                              {e.description || '—'}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              {[e.supplier_name, e.ref_label, e.is_void ? `VOID: ${e.void_reason}` : ''].filter(Boolean).join(' · ')}
                            </div>
                          </td>
                          <td style={{ padding: '10px 12px', fontSize: 11.5, color: 'var(--text-muted)' }}>{e.created_by || 'Admin'}</td>
                          <td style={{
                            padding: '10px 12px', textAlign: 'right', fontWeight: 800, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
                            color: e.is_void ? 'var(--text-muted)' : (isIn ? '#059669' : '#dc2626'),
                            textDecoration: e.is_void ? 'line-through' : 'none',
                          }}>
                            {isIn ? '+' : '−'} {fmtRs(e.amount)}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                            {!e.is_void ? (
                              <button
                                type="button"
                                onClick={() => handleVoidEntry(e)}
                                style={{
                                  padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                  background: 'transparent', color: '#dc2626', border: '1px solid rgba(239,68,68,0.28)',
                                }}
                              >
                                Void
                              </button>
                            ) : (
                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Voided</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* TAB 4: WAREHOUSE STOCK, CONTINUE SELLING & SHARED POOLS            */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'inventory' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <GhostSkuGuide mode="inline" context="po" defaultOpen={false} />
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
            background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '11px 14px',
          }}>
            <input
              type="text"
              value={invSearch}
              onChange={e => setInvSearch(e.target.value)}
              placeholder="Search SKU, product title, or shared pool key..."
              style={{ ...inputStyle, maxWidth: 340 }}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setShowInvLog(s => !s)}
                style={{
                  padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: showInvLog ? 'rgba(37,99,235,0.10)' : 'var(--bg-elevated)',
                  color: showInvLog ? '#2563eb' : 'var(--text-primary)',
                  border: showInvLog ? '1px solid rgba(37,99,235,0.32)' : '1px solid var(--border)',
                }}
              >
                {showInvLog ? 'Hide Stock Movement Log' : `Stock Movement Log (${invLedger.length})`}
              </button>
            </div>
          </div>

          {showInvLog && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 12.5, fontWeight: 800, color: 'var(--text-primary)' }}>
                Recent Inventory Movements (Audit Log)
              </div>
              <div style={{ overflowX: 'auto', maxHeight: 280 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                      <th style={{ padding: '7px 12px', fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Time</th>
                      <th style={{ padding: '7px 12px', fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Type</th>
                      <th style={{ padding: '7px 12px', fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Product / SKU</th>
                      <th style={{ padding: '7px 12px', fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Delta</th>
                      <th style={{ padding: '7px 12px', fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Shopify Push</th>
                      <th style={{ padding: '7px 12px', fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase' }}>By / Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invLedger.map(l => (
                      <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{(l.created_at || '').slice(0, 16)}</td>
                        <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--text-primary)' }}>{l.movement_type}</td>
                        <td style={{ padding: '8px 12px', color: 'var(--text-primary)' }}>
                          {l.parent_title}{l.variant_title ? ` — ${l.variant_title}` : ''}
                        </td>
                        <td style={{ padding: '8px 12px', fontWeight: 800, color: l.qty_delta > 0 ? '#059669' : '#dc2626', fontVariantNumeric: 'tabular-nums' }}>
                          {l.qty_delta > 0 ? `+${l.qty_delta}` : l.qty_delta}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          {l.shopify_pushed ? (
                            <Pill label="Synced" color="#059669" bg="rgba(16,185,129,0.10)" />
                          ) : l.shopify_error ? (
                            <span title={l.shopify_error} style={{ fontSize: 11, color: '#dc2626' }}>Failed</span>
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Local only</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{l.created_by} · {l.notes || l.ref_label}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ padding: '9px 14px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Product / Variant</th>
                    <th style={{ padding: '9px 12px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Stock Qty</th>
                    <th style={{ padding: '9px 12px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Active FIFO Cost</th>
                    <th style={{ padding: '9px 12px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Stock Value</th>
                    <th style={{ padding: '9px 12px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Continue Selling</th>
                    <th style={{ padding: '9px 12px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Shared Pool</th>
                    <th style={{ padding: '9px 14px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.map(item => {
                    const isContinue = String(item.inventory_policy || '').toLowerCase() === 'continue'
                    const isBackorder = item.inventory_qty < 0
                    return (
                      <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{item.parent_title}</span>
                            {!item.sku && (
                              <Pill label={item.shopify_variant_id ? 'No SKU (Variant ID Only)' : 'Missing SKU & ID'} color="#b45309" bg="rgba(245,158,11,0.12)" border="rgba(245,158,11,0.30)" />
                            )}
                          </div>
                          <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                            {[item.variant_title, item.sku ? `SKU: ${item.sku}` : ''].filter(Boolean).join(' · ')}
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px', fontVariantNumeric: 'tabular-nums' }}>
                          <span style={{
                            fontWeight: 800, fontSize: 13,
                            color: isBackorder ? '#dc2626' : (item.inventory_qty === 0 ? '#b45309' : '#059669'),
                          }}>
                            {item.inventory_qty}
                          </span>
                          {isBackorder && <span style={{ marginLeft: 6, fontSize: 10.5, color: '#dc2626', fontWeight: 700 }}>BACKORDER</span>}
                        </td>
                        <td style={{ padding: '10px 12px', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                          {item.avg_cost > 0 ? (
                            <div>
                              <span style={{ color: 'var(--text-primary)' }}>{fmtRs(item.avg_cost)}</span>
                              {item.open_batches > 1 && (
                                <div style={{ fontSize: 10.5, color: '#2563eb', fontWeight: 700 }}>{item.open_batches} FIFO batches</div>
                              )}
                            </div>
                          ) : (
                            <Pill label="Rs. 0 · Cost Missing" color="#dc2626" bg="rgba(239,68,68,0.10)" border="rgba(239,68,68,0.28)" />
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>
                          {fmtRs(item.stock_value)}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <button
                            type="button"
                            disabled={busyKey === `cs-${item.id}`}
                            onClick={() => handleToggleContinueSelling(item)}
                            title="Toggle Shopify Continue Selling When Out of Stock"
                            style={{
                              padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                              background: isContinue ? 'rgba(37,99,235,0.12)' : 'var(--bg-elevated)',
                              color: isContinue ? '#2563eb' : 'var(--text-muted)',
                              border: `1px solid ${isContinue ? 'rgba(37,99,235,0.35)' : 'var(--border)'}`,
                            }}
                          >
                            {busyKey === `cs-${item.id}` ? '...' : (isContinue ? 'ON (Pre-Order)' : 'OFF')}
                          </button>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <button
                            type="button"
                            onClick={() => setPoolModal({ item, shared_pool_key: item.shared_pool_key || '' })}
                            style={{
                              padding: '3.5px 9px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                              background: item.shared_pool_key ? 'rgba(124,58,237,0.10)' : 'transparent',
                              color: item.shared_pool_key ? '#7c3aed' : 'var(--text-muted)',
                              border: `1px solid ${item.shared_pool_key ? 'rgba(124,58,237,0.30)' : 'var(--border)'}`,
                            }}
                          >
                            {item.shared_pool_key || 'Isolated (Link)'}
                          </button>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => setAdjustModal({ item, qty_delta: '', movement_type: 'MANUAL_ADJUST', notes: '', pushToShopify: true })}
                            style={{
                              padding: '5px 10px', borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                              background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)',
                            }}
                          >
                            ± Adjust
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MODALS                                                             */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      {/* 1. Create Purchase Order Modal (Top Mode Switcher + Shopify-Style Variant Picker + Live Delta Preview) */}
      {newPoOpen && (() => {
        const isEditing = Boolean(editingPo)
        const isEditingReceived = isEditing && editingPo.status !== 'ordered'
        const isRecount = !isEditing && poForm.poType === 'recount'

        // Compute live qty-change impact when editing an already received/partial PO
        let editChangedLines = 0
        let editNetDelta = 0
        if (isEditingReceived) {
          const currentIds = new Set()
          for (const it of poForm.items) {
            const q = parseInt(it.ordered_qty, 10) || 0
            if (it.id) {
              currentIds.add(Number(it.id))
              const prevRec = Number(it.received_qty) || 0
              const d = editingPo.status === 'received' ? (q - prevRec) : 0
              if (d !== 0) { editChangedLines++; editNetDelta += d }
            } else if (editingPo.status === 'received' && q > 0) {
              editChangedLines++
              editNetDelta += q
            }
          }
          for (const orig of editingPo.items || []) {
            if (!currentIds.has(Number(orig.id)) && (Number(orig.received_qty) || 0) > 0) {
              editChangedLines++
              editNetDelta -= Number(orig.received_qty) || 0
            }
          }
        }

        return (
        <ModalShell
          title={isEditing
            ? `✏️ Edit ${editingPo.po_number}`
            : (isRecount ? '🎯 Physical Stock Recount (Final Actual Qty)' : 'New Purchase Order')}
          subtitle={isEditing
            ? (isEditingReceived
                ? 'Received PO Safe Edit — updates Supplier Khata, FIFO batch costs & logs exact stock deltas'
                : 'Unreceived PO — edit supplier, date, freight, SKUs, quantities, or unit costs freely')
            : (isRecount
                ? 'Rows pre-fill from current stock — edit only changed SKUs to set exact Shopify On-Hand & clean FIFO batch'
                : 'Select supplier, browse products & variants like Shopify, and bulk-fill quantities or costs in seconds')}
          onClose={() => { setPickerOpen(false); setEditingPo(null); setNewPoOpen(false) }}
          maxWidth={980}
        >
          <form onSubmit={handleCreatePo} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            {/* TOP BANNER: Edit Mode Info OR New PO vs Physical Recount Switcher */}
            {isEditing ? (
              <div style={{
                padding: '9px 13px', borderRadius: 10, fontSize: 12, lineHeight: 1.45,
                background: isEditingReceived ? 'rgba(245,158,11,0.09)' : 'rgba(37,99,235,0.08)',
                border: `1px solid ${isEditingReceived ? 'rgba(245,158,11,0.34)' : 'rgba(37,99,235,0.28)'}`,
                color: 'var(--text-primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
              }}>
                <div>
                  <strong style={{ color: isEditingReceived ? '#b45309' : '#2563eb' }}>
                    {isEditingReceived ? `✏️ Editing ${editingPo.status.toUpperCase()} PO:` : '✏️ Editing Ordered PO:'}
                  </strong>{' '}
                  {isEditingReceived
                    ? 'Supplier, Date, Freight & Unit Costs auto-update Khata & FIFO cost. Any Qty change logs an exact (+/−) delta in Warehouse Ledger.'
                    : 'No stock received yet — you can freely change supplier, items, quantities & costs.'}
                </div>
                {isEditingReceived && (Number(editingPo.paid_amount) || 0) > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(16,185,129,0.12)', color: '#059669' }}>
                    Paid so far: {fmtRs(editingPo.paid_amount)}
                  </span>
                )}
              </div>
            ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
              {[
                {
                  id: 'shipment',
                  title: '📦 New Purchase Order (+Add Stock)',
                  desc: 'Buying new maal from supplier — adds +Qty on top of existing Shopify & ERP stock.',
                  color: '#2563eb',
                  bg: 'rgba(37,99,235,0.09)',
                  bd: 'rgba(37,99,235,0.45)',
                },
                {
                  id: 'recount',
                  title: '🎯 Physical Recount / Final Stock (Set Exact On-Hand)',
                  desc: 'Actual godown count — pre-fills current stock, shows live Before → After diff, and sets exact Shopify On-Hand.',
                  color: '#7c3aed',
                  bg: 'rgba(124,58,237,0.10)',
                  bd: 'rgba(124,58,237,0.48)',
                },
              ].map(m => {
                const active = poForm.poType === m.id
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => switchPoType(m.id)}
                    style={{
                      textAlign: 'left', padding: '10px 13px', borderRadius: 11, cursor: 'pointer',
                      background: active ? m.bg : 'var(--bg-elevated)',
                      border: `1.5px solid ${active ? m.bd : 'var(--border)'}`,
                      boxShadow: active ? `0 2px 10px ${m.bg}` : 'none',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: active ? m.color : 'var(--text-primary)' }}>
                      {active ? '● ' : '○ '}{m.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.35 }}>
                      {m.desc}
                    </div>
                  </button>
                )
              })}
            </div>
            )}

            {/* Top Supplier / Date / Landing Cost Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 0.85fr 0.9fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>
                  Supplier {isRecount && <span style={{ color: '#b45309', fontWeight: 700, textTransform: 'none' }}>(Leave blank for paid stock)</span>}
                </label>
                <select
                  value={poForm.supplier_id}
                  onChange={e => setPoForm(p => ({ ...p, supplier_id: e.target.value }))}
                  style={{
                    ...inputStyle,
                    borderColor: isRecount && poForm.supplier_id ? '#f59e0b' : 'var(--border)',
                  }}
                >
                  <option value="">{isRecount ? 'None — Already Paid Opening/Recount Stock (No Khata Bill)' : 'Select Supplier (Optional)'}</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {isRecount && poForm.supplier_id && (
                  <div style={{ fontSize: 10.5, color: '#b45309', fontWeight: 600, marginTop: 3 }}>
                    ⚠️ Supplier selected — {fmtRs(poTotalPreview)} will be billed to this supplier&apos;s Khata. Leave blank if already paid!
                  </div>
                )}
              </div>
              <div>
                <label style={labelStyle}>{isRecount ? 'Recount Date' : 'Order Date'}</label>
                <input type="date" value={poForm.order_date} onChange={e => setPoForm(p => ({ ...p, order_date: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Extra Landing / Freight (Rs.)</label>
                <input type="number" min="0" value={poForm.landing_cost} onChange={e => setPoForm(p => ({ ...p, landing_cost: e.target.value }))} placeholder="0" style={inputStyle} />
              </div>
            </div>

            {/* Shopify-Style Add Products Bar + 1-Click Quick-Add Chips */}
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>Add Products &amp; Variants</label>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {groupedCatalogForPo.length} products · {poCatalogSource.length} variants in catalog
                </span>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.6, fontSize: 13 }}>🔍</span>
                  <input
                    type="text"
                    value={skuPickerSearch}
                    onChange={e => setSkuPickerSearch(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        openShopifyProductPicker(skuPickerSearch)
                      }
                    }}
                    placeholder="Search products or SKU — or click Browse to pick multiple variants like Shopify..."
                    style={{ ...inputStyle, background: 'var(--bg-surface)', paddingLeft: 32 }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => openShopifyProductPicker(skuPickerSearch)}
                  style={{
                    padding: '8px 16px', borderRadius: 8, border: '1px solid #2563eb',
                    background: 'rgba(37,99,235,0.10)', color: '#2563eb', fontWeight: 700,
                    fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  🛍️ Browse Products
                </button>
              </div>

              {/* Instant Inline Match Dropdown when typing */}
              {quickInlineMatches.length > 0 && (
                <div style={{
                  marginTop: 8, background: 'var(--bg-surface)', border: '1px solid var(--border)',
                  borderRadius: 9, maxHeight: 200, overflowY: 'auto', boxShadow: '0 6px 18px rgba(0,0,0,0.08)',
                }}>
                  {quickInlineMatches.map(g => {
                    const alreadyIds = new Set(poForm.items.map(i => i.product_cost_id))
                    const remaining = g.matchedVariants.filter(v => !alreadyIds.has(v.id))
                    return (
                      <div key={g.parent_title} style={{ padding: '8px 11px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                          {g.image ? (
                            <img src={g.image} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', border: '1px solid var(--border)', flexShrink: 0 }} />
                          ) : (
                            <div style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>📦</div>
                          )}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {g.parent_title}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              {g.matchedVariants.length} variant{g.matchedVariants.length > 1 ? 's' : ''} matched · Stock: {g.totalQty}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button
                            type="button"
                            onClick={() => openShopifyProductPicker(g.parent_title)}
                            style={{ padding: '4px 9px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                          >
                            Pick Sizes
                          </button>
                          <button
                            type="button"
                            disabled={remaining.length === 0}
                            onClick={() => {
                              const n = addMultipleSkusToPoForm(remaining)
                              if (n > 0) addToast(`Added ${n} variants of "${g.parent_title}"`, 'success')
                              setSkuPickerSearch('')
                            }}
                            style={{
                              padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: remaining.length ? 'pointer' : 'default',
                              background: remaining.length ? '#2563eb' : 'var(--bg-elevated)',
                              color: remaining.length ? '#fff' : 'var(--text-muted)', border: 'none',
                            }}
                          >
                            {remaining.length > 0 ? `+ Add All (${remaining.length})` : '✓ All Added'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* 1-Click Quick-Add Power Chips */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 9 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>⚡ Quick Add:</span>
                <button
                  type="button"
                  disabled={quickAddCounts.backorders === 0}
                  onClick={() => {
                    const rows = poCatalogSource.filter(r => (Number(r.inventory_qty) || 0) < 0)
                    const n = addMultipleSkusToPoForm(rows, r => Math.abs(Number(r.inventory_qty) || 1))
                    addToast(n > 0 ? `Added ${n} backorder SKU(s) with exact needed qty` : 'All backorder SKUs already in PO', 'info')
                  }}
                  style={{
                    padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: quickAddCounts.backorders ? 'pointer' : 'not-allowed',
                    background: 'rgba(239,68,68,0.10)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.32)',
                    opacity: quickAddCounts.backorders ? 1 : 0.45,
                  }}
                >
                  🔴 All Backorders ({quickAddCounts.backorders})
                </button>
                <button
                  type="button"
                  disabled={quickAddCounts.lowStock === 0}
                  onClick={() => {
                    const rows = poCatalogSource.filter(r => (r.status || 'active').toLowerCase() === 'active' && (Number(r.inventory_qty) || 0) > 0 && (Number(r.inventory_qty) || 0) <= 5)
                    const n = addMultipleSkusToPoForm(rows, () => 10)
                    addToast(n > 0 ? `Added ${n} low-stock SKU(s)` : 'All low-stock SKUs already in PO', 'info')
                  }}
                  style={{
                    padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: quickAddCounts.lowStock ? 'pointer' : 'not-allowed',
                    background: 'rgba(245,158,11,0.10)', color: '#b45309', border: '1px solid rgba(245,158,11,0.32)',
                    opacity: quickAddCounts.lowStock ? 1 : 0.45,
                  }}
                >
                  ⚠️ Low Stock ≤5 ({quickAddCounts.lowStock})
                </button>
                <button
                  type="button"
                  disabled={quickAddCounts.outOfStock === 0}
                  onClick={() => {
                    const rows = poCatalogSource.filter(r => (r.status || 'active').toLowerCase() === 'active' && (Number(r.inventory_qty) || 0) === 0)
                    const n = addMultipleSkusToPoForm(rows, () => 10)
                    addToast(n > 0 ? `Added ${n} out-of-stock active SKU(s)` : 'All out-of-stock SKUs already in PO', 'info')
                  }}
                  style={{
                    padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: quickAddCounts.outOfStock ? 'pointer' : 'not-allowed',
                    background: 'rgba(100,116,139,0.10)', color: 'var(--text-secondary)', border: '1px solid var(--border)',
                    opacity: quickAddCounts.outOfStock ? 1 : 0.45,
                  }}
                >
                  🚫 Out of Stock ({quickAddCounts.outOfStock})
                </button>
                {pos.length > 0 && (
                  <button
                    type="button"
                    disabled={busyKey === 'clonePo'}
                    onClick={handleCloneLastPo}
                    style={{
                      padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      background: 'rgba(124,58,237,0.10)', color: '#7c3aed', border: '1px solid rgba(124,58,237,0.32)',
                    }}
                  >
                    {busyKey === 'clonePo' ? '⏳ Cloning...' : '🔁 Clone Last PO'}
                  </button>
                )}
              </div>
            </div>

            {/* Global Bulk Quickies Bar (When items exist) */}
            {poForm.items.length > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
                padding: '8px 12px', borderRadius: 10,
                background: isRecount ? 'rgba(124,58,237,0.06)' : 'rgba(37,99,235,0.06)',
                border: `1px solid ${isRecount ? 'rgba(124,58,237,0.25)' : 'rgba(37,99,235,0.22)'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                  {isRecount && (
                    <button
                      type="button"
                      onClick={fillCurrentStockForAll}
                      title="Reset all rows to current Shopify stock so you only edit changed SKUs"
                      style={{
                        padding: '3.5px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        background: 'rgba(124,58,237,0.14)', border: '1px solid rgba(124,58,237,0.40)', color: '#7c3aed',
                      }}
                    >
                      📋 Load Current Stock
                    </button>
                  )}
                  <span style={{ fontSize: 11, fontWeight: 800, color: isRecount ? '#7c3aed' : '#2563eb' }}>
                    ⚡ {isRecount ? 'Set All Shelf:' : 'All Qty:'}
                  </span>
                  {(isRecount ? [0, 5, 10, 20, 50] : [5, 10, 20, 50]).map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => applyAllQty(preset)}
                      style={{
                        padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)',
                      }}
                    >
                      {preset}
                    </button>
                  ))}
                  <input
                    type="number" min={isRecount ? '0' : '1'} placeholder="Qty"
                    value={bulkQtyInput}
                    onChange={e => setBulkQtyInput(e.target.value)}
                    style={{ width: 58, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-surface)', fontSize: 11.5, color: 'var(--text-primary)' }}
                  />
                  <button
                    type="button"
                    onClick={() => { if (bulkQtyInput !== '') applyAllQty(bulkQtyInput) }}
                    style={{ padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: isRecount ? '#7c3aed' : '#2563eb', color: '#fff', border: 'none' }}
                  >
                    Set All
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#059669' }}>💰 All Cost:</span>
                  <input
                    type="number" min="0" step="0.01" placeholder="Rs."
                    value={bulkCostInput}
                    onChange={e => setBulkCostInput(e.target.value)}
                    style={{ width: 78, padding: '3px 7px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-surface)', fontSize: 11.5, color: 'var(--text-primary)' }}
                  />
                  <button
                    type="button"
                    onClick={() => { if (bulkCostInput !== '') applyAllCost(bulkCostInput, false) }}
                    style={{ padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: '#059669', color: '#fff', border: 'none' }}
                  >
                    Apply All
                  </button>
                  <button
                    type="button"
                    title="Only fill variants whose Unit Cost is currently Rs. 0"
                    onClick={() => { if (bulkCostInput !== '') applyAllCost(bulkCostInput, true) }}
                    style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: 'var(--bg-surface)', color: '#059669', border: '1px solid rgba(5,150,105,0.35)' }}
                  >
                    Rs 0 Only
                  </button>
                  {!isEditingReceived && (
                    <button
                      type="button"
                      onClick={() => setPoForm(p => ({ ...p, items: [] }))}
                      style={{ marginLeft: 4, padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: 'rgba(239,68,68,0.10)', color: '#dc2626', border: 'none' }}
                    >
                      Clear All
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Selected Items — Product-Grouped with Per-Product Quickies */}
            {poForm.items.length > 0 ? (
              <div style={{ border: '1px solid var(--border)', borderRadius: 11, overflow: 'hidden', maxHeight: 330, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                    <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      <th style={{ padding: '8px 11px' }}>Product / Variant</th>
                      <th style={{ padding: '8px 8px', width: 150, textAlign: 'center', color: isRecount ? '#7c3aed' : 'var(--text-muted)' }}>
                        {isRecount ? '🎯 Final Shelf Qty' : 'Order Qty'}
                      </th>
                      <th style={{ padding: '8px 8px', width: 130 }}>Unit Cost (Rs.)</th>
                      <th style={{ padding: '8px 11px', textAlign: 'right', width: 105 }}>Line Total</th>
                      <th style={{ padding: '8px 8px', width: 32 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {groupedPoItems.map(group => {
                      const inGroupIds = new Set(group.entries.map(e => e.item.product_cost_id))
                      const missingVariants = group.allCatalogVariants.filter(v => !inGroupIds.has(v.id))
                      const gQuick = groupQuickFill[group.parent_title] || { qty: '', cost: '' }

                      return (
                        <React.Fragment key={group.parent_title}>
                          {/* Parent Group Header with Inline Group Quick-Fill */}
                          <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                            <td colSpan={5} style={{ padding: '7px 11px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  {group.image ? (
                                    <img src={group.image} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover', border: '1px solid var(--border)' }} />
                                  ) : (
                                    <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>📦</div>
                                  )}
                                  <div>
                                    <span style={{ fontWeight: 800, fontSize: 12.5, color: 'var(--text-primary)' }}>{group.parent_title}</span>
                                    <span style={{ marginLeft: 7, fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                                      {group.entries.length} variant{group.entries.length > 1 ? 's' : ''} · {group.totalUnits} pcs · {fmtRs(group.subtotal)}
                                    </span>
                                  </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                                  {/* Per-product Qty quickie */}
                                  <input
                                    type="number" min="1" placeholder="Grp Qty"
                                    value={gQuick.qty}
                                    onChange={e => setGroupQuickFill(prev => ({ ...prev, [group.parent_title]: { ...gQuick, qty: e.target.value } }))}
                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (gQuick.qty) applyGroupQty(group.parent_title, gQuick.qty) } }}
                                    style={{ width: 62, padding: '2.5px 6px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg-surface)', fontSize: 11, color: 'var(--text-primary)' }}
                                  />
                                  <button
                                    type="button"
                                    title="Apply Qty to all variants of this product"
                                    onClick={() => { if (gQuick.qty) applyGroupQty(group.parent_title, gQuick.qty) }}
                                    style={{ padding: '2.5px 7px', borderRadius: 5, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', background: 'rgba(37,99,235,0.12)', color: '#2563eb', border: '1px solid rgba(37,99,235,0.3)' }}
                                  >
                                    Set Qty
                                  </button>

                                  {/* Per-product Cost quickie */}
                                  <input
                                    type="number" min="0" step="0.01" placeholder="Grp Rs."
                                    value={gQuick.cost}
                                    onChange={e => setGroupQuickFill(prev => ({ ...prev, [group.parent_title]: { ...gQuick, cost: e.target.value } }))}
                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (gQuick.cost !== '') applyGroupCost(group.parent_title, gQuick.cost) } }}
                                    style={{ width: 68, padding: '2.5px 6px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg-surface)', fontSize: 11, color: 'var(--text-primary)' }}
                                  />
                                  <button
                                    type="button"
                                    title="Apply Unit Cost to all variants of this product"
                                    onClick={() => { if (gQuick.cost !== '') applyGroupCost(group.parent_title, gQuick.cost) }}
                                    style={{ padding: '2.5px 7px', borderRadius: 5, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', background: 'rgba(5,150,105,0.12)', color: '#059669', border: '1px solid rgba(5,150,105,0.3)' }}
                                  >
                                    Set Cost
                                  </button>

                                  {missingVariants.length > 0 && (
                                    <button
                                      type="button"
                                      title="Add all remaining unselected sizes/colors of this product"
                                      onClick={() => {
                                        const refCost = parseFloat(group.entries[0]?.item?.unit_cost) || 0
                                        const refQty = parseInt(group.entries[0]?.item?.ordered_qty, 10) || 10
                                        addMultipleSkusToPoForm(missingVariants, () => refQty)
                                        if (refCost > 0) {
                                          setPoForm(prev => ({
                                            ...prev,
                                            items: prev.items.map(x => x.parent_title === group.parent_title && (parseFloat(x.unit_cost) || 0) === 0 ? { ...x, unit_cost: refCost } : x),
                                          }))
                                        }
                                      }}
                                      style={{ padding: '2.5px 8px', borderRadius: 5, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', background: 'rgba(99,102,241,0.12)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.3)' }}
                                    >
                                      +{missingVariants.length} Remaining
                                    </button>
                                  )}

                                  {!group.entries.some(e => (e.item.consumed_qty || 0) > 0) && (
                                    <button
                                      type="button"
                                      title="Remove entire product group"
                                      onClick={() => setPoForm(p => ({ ...p, items: p.items.filter(x => x.parent_title !== group.parent_title) }))}
                                      style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontWeight: 800, fontSize: 12, padding: '2px 4px' }}
                                    >
                                      ✕
                                    </button>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>

                          {/* Variant Sub-Rows */}
                          {group.entries.map(({ item: it, idx }) => {
                            const qtyNum = parseInt(it.ordered_qty, 10) || 0
                            const costNum = parseFloat(it.unit_cost) || 0
                            const invNum = Number(it.inventory_qty) || 0
                            const consumedQty = isEditingReceived ? (Number(it.consumed_qty) || 0) : 0
                            const minAllowedQty = isEditingReceived
                              ? (editingPo.status === 'received' ? consumedQty : (Number(it.received_qty) || 0))
                              : (isRecount ? 0 : 1)
                            return (
                              <tr key={it.id || it.product_cost_id || idx} style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                                <td style={{ padding: '7px 11px 7px 34px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{it.variant_title || 'Default'}</span>
                                    {it.sku && (
                                      <span style={{ fontSize: 10, fontFamily: 'monospace', padding: '1px 5px', borderRadius: 4, background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                                        {it.sku}
                                      </span>
                                    )}
                                    <span style={{
                                      fontSize: 10, fontWeight: 700,
                                      color: invNum < 0 ? '#dc2626' : (invNum === 0 ? '#b45309' : 'var(--text-muted)'),
                                    }}>
                                      Avail: {invNum}
                                    </span>
                                    {consumedQty > 0 && (
                                      <span
                                        title={`${consumedQty} unit(s) from this PO batch were already consumed by dispatched orders`}
                                        style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'rgba(245,158,11,0.12)', color: '#b45309' }}
                                      >
                                        🔒 {consumedQty} sold
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td style={{ padding: '6px 8px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'center' }}>
                                    <button
                                      type="button"
                                      onClick={() => setPoForm(p => ({ ...p, items: p.items.map((x, i) => i === idx ? { ...x, ordered_qty: Math.max(minAllowedQty, (parseInt(x.ordered_qty, 10) || 0) - 1) } : x) }))}
                                      style={{ width: 24, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 800 }}
                                    >−</button>
                                    <input
                                      type="number" min={minAllowedQty} value={it.ordered_qty}
                                      onChange={e => setPoForm(p => ({ ...p, items: p.items.map((x, i) => i === idx ? { ...x, ordered_qty: e.target.value } : x) }))}
                                      style={{
                                        ...inputStyle, width: 56, padding: '4px 5px', textAlign: 'center', fontWeight: 800,
                                        borderColor: isRecount && qtyNum !== invNum ? (qtyNum < invNum ? '#ef4444' : '#10b981') : 'var(--border)',
                                      }}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setPoForm(p => ({ ...p, items: p.items.map((x, i) => i === idx ? { ...x, ordered_qty: (parseInt(x.ordered_qty, 10) || 0) + 1 } : x) }))}
                                      style={{ width: 24, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 800 }}
                                    >+</button>
                                  </div>
                                  {/* Live Before -> After Stock Preview Pill */}
                                  <div style={{ textAlign: 'center', marginTop: 3, fontSize: 10, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                    {isEditingReceived ? (() => {
                                      if (!it.id) return <span style={{ color: '#059669' }}>+ New ({editingPo.status === 'received' ? `+${qtyNum} stock` : 'pending'})</span>
                                      if (editingPo.status !== 'received') return <span style={{ color: 'var(--text-muted)' }}>Rec: {it.received_qty || 0} / Ord: {qtyNum}</span>
                                      const d = qtyNum - (Number(it.received_qty) || 0)
                                      if (d === 0) return <span style={{ color: 'var(--text-muted)' }}>= No qty change</span>
                                      if (d > 0) return <span style={{ color: '#059669' }}>Edit: +{d} ({invNum} → {invNum + d})</span>
                                      return <span style={{ color: '#dc2626' }}>Edit: −{Math.abs(d)} ({invNum} → {invNum + d})</span>
                                    })() : isRecount ? (() => {
                                      const diff = qtyNum - invNum
                                      if (diff === 0) return <span style={{ color: 'var(--text-muted)' }}>= Same ({invNum})</span>
                                      if (diff > 0) return <span style={{ color: '#059669' }}>{invNum} → {qtyNum} (+{diff})</span>
                                      return <span style={{ color: '#dc2626' }}>{invNum} → {qtyNum} (−{Math.abs(diff)})</span>
                                    })() : (
                                      <span style={{ color: '#059669' }}>{invNum} → {invNum + qtyNum} (+{qtyNum})</span>
                                    )}
                                  </div>
                                </td>
                                <td style={{ padding: '6px 8px' }}>
                                  <input
                                    type="number" min="0" step="0.01" value={it.unit_cost}
                                    onChange={e => setPoForm(p => ({ ...p, items: p.items.map((x, i) => i === idx ? { ...x, unit_cost: e.target.value } : x) }))}
                                    style={{ ...inputStyle, padding: '4.5px 7px', fontWeight: 700, borderColor: costNum <= 0 ? 'rgba(239,68,68,0.5)' : 'var(--border)' }}
                                  />
                                  {poFreightPerUnit > 0 && (
                                    <div style={{ fontSize: 10, color: '#6366f1', fontWeight: 600, marginTop: 2 }}>
                                      Landed: Rs {(costNum + poFreightPerUnit).toFixed(0)} (+{poFreightPerUnit})
                                    </div>
                                  )}
                                </td>
                                <td style={{ padding: '7px 11px', textAlign: 'right', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                                  {fmtRs(qtyNum * costNum)}
                                </td>
                                <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                  {consumedQty > 0 ? (
                                    <span title="Cannot remove — units already consumed by dispatched orders" style={{ fontSize: 11, opacity: 0.45 }}>🔒</span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setPoForm(p => ({ ...p, items: p.items.filter((_, i) => i !== idx) }))}
                                      style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontWeight: 700 }}
                                    >
                                      ✕
                                    </button>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div
                onClick={() => openShopifyProductPicker('')}
                style={{
                  border: '1.5px dashed var(--border)', borderRadius: 11, padding: '24px 16px',
                  textAlign: 'center', cursor: 'pointer', background: 'var(--bg-elevated)',
                }}
              >
                <div style={{ fontSize: 22, marginBottom: 4 }}>🛍️</div>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>No products added yet — click to Browse Products &amp; Variants</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>Select whole products or individual sizes/colors in one shot, or use the Quick Add chips above.</div>
              </div>
            )}

            {/* Notes + Clean Mode-Specific Shopify Sync Toggle */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end' }}>
              <div>
                <label style={labelStyle}>Notes (Optional)</label>
                <input
                  type="text"
                  value={poForm.notes}
                  onChange={e => setPoForm(p => ({ ...p, notes: e.target.value }))}
                  placeholder={isRecount ? 'e.g. Nov warehouse physical shelf recount' : 'e.g. Winter fabric batch #2'}
                  style={inputStyle}
                />
              </div>
              {isEditing ? (
                isEditingReceived ? (
                  <label style={{
                    display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    padding: '8px 12px', borderRadius: 8, whiteSpace: 'nowrap',
                    background: poForm.pushEditToShopify && editChangedLines > 0 ? 'rgba(245,158,11,0.12)' : 'var(--bg-elevated)',
                    border: `1px solid ${poForm.pushEditToShopify && editChangedLines > 0 ? 'rgba(245,158,11,0.45)' : 'var(--border)'}`,
                    color: poForm.pushEditToShopify && editChangedLines > 0 ? '#b45309' : 'var(--text-secondary)',
                  }} title="Push any (+/−) quantity difference from this edit directly to Shopify">
                    <input
                      type="checkbox"
                      checked={Boolean(poForm.pushEditToShopify)}
                      onChange={e => setPoForm(p => ({ ...p, pushEditToShopify: e.target.checked }))}
                    />
                    🔄 Sync Qty Delta (+/−) to Shopify
                  </label>
                ) : null
              ) : isRecount ? (
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  padding: '8px 12px', borderRadius: 8, whiteSpace: 'nowrap',
                  background: poForm.shopifySyncMode !== 'erp_only' ? 'rgba(124,58,237,0.12)' : 'var(--bg-elevated)',
                  border: `1px solid ${poForm.shopifySyncMode !== 'erp_only' ? 'rgba(124,58,237,0.45)' : 'var(--border)'}`,
                  color: poForm.shopifySyncMode !== 'erp_only' ? '#7c3aed' : 'var(--text-secondary)',
                }} title="Sets Shopify On-Hand = exact recounted shelf qty (keeps pending unfulfilled Committed orders safe!). Uncheck for ERP Only.">
                  <input
                    type="checkbox"
                    checked={poForm.shopifySyncMode !== 'erp_only'}
                    onChange={e => setPoForm(p => ({ ...p, shopifySyncMode: e.target.checked ? 'set_exact_on_hand' : 'erp_only' }))}
                  />
                  🎯 Push Exact On-Hand to Shopify
                </label>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{
                    display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    padding: '8px 12px', borderRadius: 8, whiteSpace: 'nowrap',
                    background: poForm.receiveImmediately ? 'rgba(16,185,129,0.12)' : 'var(--bg-elevated)',
                    border: `1px solid ${poForm.receiveImmediately ? 'rgba(16,185,129,0.45)' : 'var(--border)'}`,
                    color: poForm.receiveImmediately ? '#059669' : 'var(--text-secondary)',
                  }}>
                    <input
                      type="checkbox"
                      checked={Boolean(poForm.receiveImmediately)}
                      onChange={e => setPoForm(p => ({ ...p, receiveImmediately: e.target.checked, shopifySyncMode: e.target.checked ? 'add_delta' : p.shopifySyncMode }))}
                    />
                    ⚡ Receive Immediately
                  </label>
                  {poForm.receiveImmediately && (
                    <select
                      value={poForm.shopifySyncMode === 'erp_only' ? 'erp_only' : 'add_delta'}
                      onChange={e => setPoForm(p => ({ ...p, shopifySyncMode: e.target.value }))}
                      style={{ ...inputStyle, width: 'auto', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                    >
                      <option value="add_delta">➕ Add (+Qty) to Shopify</option>
                      <option value="erp_only">🔕 ERP Only (No Push)</option>
                    </select>
                  )}
                </div>
              )}
            </div>

            {/* Footer Totals, Live Recount/Edit Impact & Submit */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 12.5 }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
                  <strong>{poForm.items.length}</strong> variants · <strong>{poTotalUnits}</strong> units
                </span>
                {isEditingReceived && (
                  <span style={{
                    padding: '2.5px 9px', borderRadius: 20, fontSize: 11.5, fontWeight: 800,
                    background: editChangedLines > 0 ? 'rgba(245,158,11,0.13)' : 'var(--bg-elevated)',
                    color: editChangedLines > 0 ? '#b45309' : 'var(--text-muted)',
                  }}>
                    {editChangedLines > 0
                      ? `✏️ ${editChangedLines} qty edit(s) (${editNetDelta >= 0 ? `+${editNetDelta}` : `−${Math.abs(editNetDelta)}`} pcs)`
                      : 'Metadata / cost edit only (0 qty delta)'}
                  </span>
                )}
                {isRecount && poForm.items.length > 0 && (
                  <span style={{
                    padding: '2.5px 9px', borderRadius: 20, fontSize: 11.5, fontWeight: 800,
                    background: recountImpact.changedSkus > 0 ? 'rgba(124,58,237,0.12)' : 'var(--bg-elevated)',
                    color: recountImpact.changedSkus > 0 ? '#7c3aed' : 'var(--text-muted)',
                  }}>
                    🎯 {recountImpact.changedSkus} changed ({recountImpact.netDelta >= 0 ? `+${recountImpact.netDelta}` : `−${Math.abs(recountImpact.netDelta)}`} pcs) · {recountImpact.unchangedSkus} unchanged
                  </span>
                )}
                {poLandingPreview > 0 && (
                  <span style={{ color: '#6366f1', fontWeight: 700, fontSize: 12 }}>
                    Subtotal {fmtRs(poSubtotalPreview)} + Freight {fmtRs(poLandingPreview)}
                  </span>
                )}
                <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-primary)' }}>
                  {isRecount ? 'Stock Value:' : 'PO Total:'} {fmtRs(poTotalPreview)}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => { setPickerOpen(false); setEditingPo(null); setNewPoOpen(false) }} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                <button
                  type="submit"
                  disabled={busyKey === 'createPo' || poForm.items.length === 0}
                  style={{
                    padding: '8px 18px', borderRadius: 8, border: 'none',
                    background: isEditing ? '#d97706' : (isRecount ? '#7c3aed' : (poForm.receiveImmediately ? '#059669' : '#2563eb')),
                    color: '#fff', fontWeight: 700, cursor: poForm.items.length === 0 ? 'not-allowed' : 'pointer',
                    opacity: poForm.items.length === 0 ? 0.5 : 1,
                  }}
                >
                  {busyKey === 'createPo'
                    ? (isEditing ? 'Saving Changes...' : (isRecount ? 'Syncing Recount...' : (poForm.receiveImmediately ? 'Creating & Syncing...' : 'Creating...')))
                    : (isEditing
                        ? `💾 Save ${editingPo.po_number} Changes`
                        : (isRecount
                            ? (poForm.shopifySyncMode === 'erp_only' ? '🎯 Save Recount (ERP Only)' : '🎯 Save Recount & Set Exact On-Hand')
                            : (poForm.receiveImmediately
                                ? (poForm.shopifySyncMode === 'erp_only' ? '⚡ Create & Receive (ERP Only)' : '⚡ Create & Add Stock to Shopify')
                                : 'Create Purchase Order')))}
                </button>
              </div>
            </div>
          </form>
        </ModalShell>
        )
      })()}

      {/* 1b. Shopify-Style Nested "Add products" Multi-Variant Picker Modal */}
      {pickerOpen && (
        <div
          onClick={() => setPickerOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 10020,
            background: 'rgba(15,23,42,0.58)', backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 740, maxHeight: '86vh',
              display: 'flex', flexDirection: 'column',
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 16, boxShadow: '0 28px 70px rgba(0,0,0,0.38)', overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, color: 'var(--text-primary)' }}>Add products</h3>
              <button type="button" onClick={() => setPickerOpen(false)} style={{ background: 'none', border: 'none', fontSize: 17, color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>✕</button>
            </div>

            {/* Search + Search By + Quick Filter Chips */}
            <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 9, background: 'var(--bg-surface)' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.6 }}>🔍</span>
                  <input
                    type="text"
                    autoFocus
                    value={pickerSearch}
                    onChange={e => setPickerSearch(e.target.value)}
                    placeholder="Search products, variants, or SKUs..."
                    style={{ ...inputStyle, paddingLeft: 32, background: 'var(--bg-elevated)' }}
                  />
                </div>
                <select
                  value={pickerSearchBy}
                  onChange={e => setPickerSearchBy(e.target.value)}
                  style={{ ...inputStyle, width: 'auto', minWidth: 135, background: 'var(--bg-elevated)', cursor: 'pointer' }}
                >
                  <option value="all">Search by All</option>
                  <option value="title">Search by Title</option>
                  <option value="sku">Search by SKU</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'active', label: '🟢 Active' },
                    { id: 'draft', label: '📝 Draft' },
                    { id: 'backorder', label: '🔴 Backorder (<0)' },
                    { id: 'oos', label: '🚫 Out of Stock (0)' },
                    { id: 'low', label: '⚠️ Low Stock (≤5)' },
                  ].map(f => {
                    const active = pickerFilter === f.id
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setPickerFilter(f.id)}
                        style={{
                          padding: '3.5px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: active ? 700 : 600, cursor: 'pointer',
                          background: active ? 'rgba(37,99,235,0.14)' : 'var(--bg-elevated)',
                          color: active ? '#2563eb' : 'var(--text-secondary)',
                          border: `1px solid ${active ? '#2563eb' : 'var(--border)'}`,
                        }}
                      >
                        {f.label}
                      </button>
                    )
                  })}
                </div>

                {/* Group/Order Toggle: By Color vs By Size */}
                <div style={{ display: 'inline-flex', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: 2 }}>
                  {[
                    { id: 'color', label: '🎨 By Color' },
                    { id: 'size', label: '📏 By Size' },
                  ].map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPickerGroupBy(m.id)}
                      style={{
                        padding: '3px 9px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        background: pickerGroupBy === m.id ? 'var(--bg-surface)' : 'transparent',
                        color: pickerGroupBy === m.id ? '#2563eb' : 'var(--text-muted)',
                        boxShadow: pickerGroupBy === m.id ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Column Header */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 90px 82px', padding: '8px 18px',
              background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)',
              fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)',
            }}>
              <div>Product</div>
              <div style={{ textAlign: 'right' }}>Cost</div>
              <div style={{ textAlign: 'right' }}>Available</div>
            </div>

            {/* Scrollable Shopify-Style Product + Variant Tree */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {pickerGroups.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  No matching products found. Try clearing search or filter chips.
                </div>
              ) : (
                pickerGroups.map(g => {
                  const ids = g.variants.map(v => v.id)
                  const selectedCount = ids.filter(id => pickerSelected.has(id)).length
                  const allChecked = ids.length > 0 && selectedCount === ids.length
                  const someChecked = selectedCount > 0 && selectedCount < ids.length
                  const isCollapsed = collapsedPickerParents.has(g.parent_title)

                  const toggleParentCheck = () => {
                    setPickerSelected(prev => {
                      const next = new Set(prev)
                      if (allChecked) ids.forEach(id => next.delete(id))
                      else ids.forEach(id => next.add(id))
                      return next
                    })
                  }

                  const toggleVariantCheck = (id) => {
                    setPickerSelected(prev => {
                      const next = new Set(prev)
                      if (next.has(id)) next.delete(id)
                      else next.add(id)
                      return next
                    })
                  }

                  const stBadge = g.status === 'draft'
                    ? { label: 'Draft', bg: 'rgba(14,165,233,0.16)', color: '#0284c7' }
                    : g.status === 'unlisted'
                      ? { label: 'Unlisted', bg: 'rgba(219,39,119,0.14)', color: '#db2777' }
                      : null

                  return (
                    <div key={g.parent_title} style={{ borderBottom: '1px solid var(--border)' }}>
                      {/* Parent Row */}
                      <div
                        style={{
                          display: 'grid', gridTemplateColumns: '1fr 90px 82px', alignItems: 'center',
                          padding: '10px 18px', background: allChecked ? 'rgba(37,99,235,0.05)' : 'var(--bg-surface)',
                          cursor: 'pointer',
                        }}
                        onClick={toggleParentCheck}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                          <input
                            type="checkbox"
                            checked={allChecked}
                            ref={el => { if (el) el.indeterminate = someChecked }}
                            onChange={toggleParentCheck}
                            onClick={e => e.stopPropagation()}
                            style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#2563eb' }}
                          />
                          {g.image ? (
                            <img src={g.image} alt="" style={{ width: 38, height: 38, borderRadius: 7, objectFit: 'cover', border: '1px solid var(--border)', flexShrink: 0 }} />
                          ) : (
                            <div style={{ width: 38, height: 38, borderRadius: 7, background: 'var(--bg-elevated)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>📦</div>
                          )}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', minWidth: 0 }}>
                            <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-primary)' }}>{g.parent_title}</span>
                            {stBadge && (
                              <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: stBadge.bg, color: stBadge.color }}>
                                {stBadge.label}
                              </span>
                            )}
                            {selectedCount > 0 && (
                              <span style={{ fontSize: 10.5, fontWeight: 700, color: '#2563eb' }}>
                                ({selectedCount}/{ids.length})
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', fontSize: 11.5, color: 'var(--text-muted)' }}>
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation()
                              setCollapsedPickerParents(prev => {
                                const next = new Set(prev)
                                if (next.has(g.parent_title)) next.delete(g.parent_title)
                                else next.add(g.parent_title)
                                return next
                              })
                            }}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11.5, fontWeight: 600 }}
                          >
                            {isCollapsed ? `▸ ${g.variants.length} vars` : `▾ Hide`}
                          </button>
                        </div>
                        <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 12.5, fontVariantNumeric: 'tabular-nums', color: g.totalQty < 0 ? '#dc2626' : 'var(--text-muted)' }}>
                          {g.totalQty}
                        </div>
                      </div>

                      {/* 1-Click Color & Size Quick-Select Chips under Parent Row */}
                      {!isCollapsed && g.variants.length > 1 && (g.colors.length > 0 || g.sizes.length > 0) && (
                        <div style={{
                          padding: '7px 18px 8px 46px',
                          borderTop: '1px solid var(--border)',
                          background: 'rgba(37,99,235,0.03)',
                          display: 'flex', flexDirection: 'column', gap: 5,
                        }}>
                          {g.colors.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', minWidth: 46 }}>🎨 Color:</span>
                              {g.colors.map(col => {
                                const sel = col.ids.filter(id => pickerSelected.has(id)).length
                                const isAll = sel === col.ids.length
                                const isPart = sel > 0 && sel < col.ids.length
                                return (
                                  <button
                                    key={col.label}
                                    type="button"
                                    onClick={() => {
                                      setPickerSelected(prev => {
                                        const next = new Set(prev)
                                        if (isAll) col.ids.forEach(id => next.delete(id))
                                        else col.ids.forEach(id => next.add(id))
                                        return next
                                      })
                                    }}
                                    style={{
                                      padding: '2.5px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                      background: isAll ? '#2563eb' : (isPart ? 'rgba(37,99,235,0.14)' : 'var(--bg-surface)'),
                                      color: isAll ? '#fff' : (isPart ? '#2563eb' : 'var(--text-primary)'),
                                      border: `1px solid ${isAll || isPart ? '#2563eb' : 'var(--border)'}`,
                                    }}
                                  >
                                    {isAll ? '✓ ' : ''}{col.label} ({sel > 0 ? `${sel}/` : ''}{col.ids.length})
                                  </button>
                                )
                              })}
                            </div>
                          )}
                          {g.sizes.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', minWidth: 46 }}>📏 Size:</span>
                              {g.sizes.map(sz => {
                                const sel = sz.ids.filter(id => pickerSelected.has(id)).length
                                const isAll = sel === sz.ids.length
                                const isPart = sel > 0 && sel < sz.ids.length
                                return (
                                  <button
                                    key={sz.label}
                                    type="button"
                                    onClick={() => {
                                      setPickerSelected(prev => {
                                        const next = new Set(prev)
                                        if (isAll) sz.ids.forEach(id => next.delete(id))
                                        else sz.ids.forEach(id => next.add(id))
                                        return next
                                      })
                                    }}
                                    style={{
                                      padding: '2.5px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                      background: isAll ? '#059669' : (isPart ? 'rgba(5,150,105,0.14)' : 'var(--bg-surface)'),
                                      color: isAll ? '#fff' : (isPart ? '#059669' : 'var(--text-primary)'),
                                      border: `1px solid ${isAll || isPart ? '#059669' : 'var(--border)'}`,
                                    }}
                                  >
                                    {isAll ? '✓ ' : ''}{sz.label}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Indented Variant Sub-Rows Grouped Cleanly by Color or Size */}
                      {!isCollapsed && (() => {
                        let lastSubGroup = null
                        return g.variants.map(v => {
                          const checked = pickerSelected.has(v.id)
                          const qty = Number(v.inventory_qty) || 0
                          const costVal = Number(v.unit_cost) || Number(v.avg_cost) || 0
                          const parts = parseVariantParts(v.variant_title)
                          const subGroupLabel = pickerGroupBy === 'color' ? parts.color : parts.size
                          const showDivider = Boolean(subGroupLabel) && subGroupLabel !== lastSubGroup && (pickerGroupBy === 'color' ? g.colors.length > 1 : g.sizes.length > 1)
                          if (subGroupLabel) lastSubGroup = subGroupLabel

                          const subGroupIds = showDivider
                            ? (pickerGroupBy === 'color'
                                ? (g.colors.find(c => c.label === subGroupLabel)?.ids || [])
                                : (g.sizes.find(s => s.label === subGroupLabel)?.ids || []))
                            : []
                          const subAllChecked = subGroupIds.length > 0 && subGroupIds.every(id => pickerSelected.has(id))

                          return (
                            <React.Fragment key={v.id}>
                              {showDivider && (
                                <div
                                  onClick={() => {
                                    setPickerSelected(prev => {
                                      const next = new Set(prev)
                                      if (subAllChecked) subGroupIds.forEach(id => next.delete(id))
                                      else subGroupIds.forEach(id => next.add(id))
                                      return next
                                    })
                                  }}
                                  style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '5px 18px 5px 46px',
                                    borderTop: '1px solid var(--border)',
                                    background: 'rgba(100,116,139,0.08)',
                                    cursor: 'pointer',
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <input
                                      type="checkbox"
                                      checked={subAllChecked}
                                      onChange={() => {}}
                                      style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#2563eb' }}
                                    />
                                    <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)' }}>
                                      {pickerGroupBy === 'color' ? `🎨 ${subGroupLabel}` : `📏 Size ${subGroupLabel}`}
                                    </span>
                                    <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>({subGroupIds.length})</span>
                                  </div>
                                  <span style={{ fontSize: 10.5, fontWeight: 700, color: '#2563eb' }}>
                                    {subAllChecked ? 'Unselect all' : 'Select all'}
                                  </span>
                                </div>
                              )}
                              <div
                                onClick={() => toggleVariantCheck(v.id)}
                                style={{
                                  display: 'grid', gridTemplateColumns: '1fr 90px 82px', alignItems: 'center',
                                  padding: '7.5px 18px 7.5px 62px',
                                  borderTop: '1px solid var(--border)',
                                  background: checked ? 'rgba(37,99,235,0.06)' : 'var(--bg-elevated)',
                                  cursor: 'pointer',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleVariantCheck(v.id)}
                                    onClick={e => e.stopPropagation()}
                                    style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#2563eb' }}
                                  />
                                  <span style={{ fontSize: 13, fontWeight: checked ? 700 : 500, color: 'var(--text-primary)' }}>
                                    {v.variant_title || 'Default'}
                                  </span>
                                  {v.sku && (
                                    <span style={{ fontSize: 10.5, fontFamily: 'monospace', color: 'var(--text-muted)', background: 'var(--bg-surface)', padding: '1px 5px', borderRadius: 4, border: '1px solid var(--border)' }}>
                                      {v.sku}
                                    </span>
                                  )}
                                </div>
                                <div style={{ textAlign: 'right', fontSize: 12, color: costVal > 0 ? 'var(--text-secondary)' : '#dc2626', fontVariantNumeric: 'tabular-nums' }}>
                                  {costVal > 0 ? `Rs ${costVal.toLocaleString()}` : 'Rs 0'}
                                </div>
                                <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: qty < 0 ? '#dc2626' : (qty === 0 ? 'var(--text-muted)' : '#059669') }}>
                                  {qty}
                                </div>
                              </div>
                            </React.Fragment>
                          )
                        })
                      })()}
                    </div>
                  )
                })
              )}
            </div>

            {/* Sticky Footer */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
              padding: '12px 18px', borderTop: '1px solid var(--border)', background: 'var(--bg-surface)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  padding: '4px 11px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                  background: pickerSelected.size > 0 ? 'rgba(37,99,235,0.12)' : 'var(--bg-elevated)',
                  color: pickerSelected.size > 0 ? '#2563eb' : 'var(--text-muted)',
                }}>
                  {pickerSelected.size} variant{pickerSelected.size !== 1 ? 's' : ''} selected
                </span>
                {pickerGroups.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setPickerSelected(prev => {
                        const next = new Set(prev)
                        pickerGroups.forEach(g => g.variants.forEach(v => next.add(v.id)))
                        return next
                      })
                    }}
                    style={{ background: 'none', border: 'none', fontSize: 12, fontWeight: 700, color: '#2563eb', cursor: 'pointer' }}
                  >
                    Select All Shown
                  </button>
                )}
                {pickerSelected.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setPickerSelected(new Set())}
                    style={{ background: 'none', border: 'none', fontSize: 12, fontWeight: 600, color: '#dc2626', cursor: 'pointer' }}
                  >
                    Clear
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setPickerOpen(false)}
                  style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={commitPickerSelection}
                  style={{
                    padding: '7px 16px', borderRadius: 8, border: 'none',
                    background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
                  }}
                >
                  Add to purchase order
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Receive PO Modal (Partial Receiving + ☑ Push +Qty to Shopify) */}
      {receiveModal && (
        <ModalShell
          title={`Receive Stock · ${receiveModal.po.po_number}`}
          subtitle="Supports partial receiving · Only actually received units are billed to supplier"
          onClose={() => setReceiveModal(null)}
          maxWidth={700}
        >
          <form onSubmit={handleConfirmReceive} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ padding: '7px 10px' }}>Product</th>
                    <th style={{ padding: '7px 8px' }}>Ordered</th>
                    <th style={{ padding: '7px 8px' }}>Already Rec.</th>
                    <th style={{ padding: '7px 8px' }}>Landed Rate</th>
                    <th style={{ padding: '7px 10px', width: 110 }}>Receive Now</th>
                  </tr>
                </thead>
                <tbody>
                  {(receiveModal.po.items || []).map(it => {
                    const rem = Math.max(0, (it.ordered_qty || 0) - (it.received_qty || 0))
                    return (
                      <tr key={it.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '7px 10px' }}>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{it.parent_title}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {it.variant_title || it.sku} {it.shared_pool_key ? `· Pool: ${it.shared_pool_key}` : ''}
                          </div>
                        </td>
                        <td style={{ padding: '7px 8px' }}>{it.ordered_qty}</td>
                        <td style={{ padding: '7px 8px', color: '#059669', fontWeight: 700 }}>{it.received_qty}</td>
                        <td style={{ padding: '7px 8px' }}>{fmtRs(it.landed_unit_cost)}</td>
                        <td style={{ padding: '6px 10px' }}>
                          <input
                            type="number" min="0" max={rem + 500}
                            value={receiveModal.qtys[it.id] ?? 0}
                            onChange={e => setReceiveModal(m => ({ ...m, qtys: { ...m.qtys, [it.id]: e.target.value } }))}
                            style={{ ...inputStyle, padding: '5px 8px' }}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* 3-Mode Shopify Inventory Sync Selector */}
            <div>
              <label style={{ ...labelStyle, marginBottom: 6 }}>Shopify Inventory Sync Mode</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {[
                  {
                    id: 'add_delta',
                    title: '➕ Add to Existing Stock (+Qty Delta)',
                    desc: 'Standard new shipment — adds received qty on top of current Shopify & ERP stock (safe for negative Continue Selling backorders).',
                    color: '#059669',
                    bg: 'rgba(16,185,129,0.09)',
                    bd: 'rgba(16,185,129,0.42)',
                  },
                  {
                    id: 'set_exact_on_hand',
                    title: '🎯 Set Exact On-Hand (Physical Recount / Final Qty)',
                    desc: 'Sets Shopify On-Hand = exact PO qty (automatically preserves pending Committed orders so Available = On-Hand − Committed!) and replaces stale old FIFO batches — zero double-counting.',
                    color: '#7c3aed',
                    bg: 'rgba(124,58,237,0.09)',
                    bd: 'rgba(124,58,237,0.42)',
                  },
                  {
                    id: 'erp_only',
                    title: '🔕 ERP Only (Do Not Push to Shopify)',
                    desc: 'Records PO & FIFO cost inside TRACE ERP only — use when Shopify quantities are already 100% correct.',
                    color: '#64748b',
                    bg: 'rgba(100,116,139,0.08)',
                    bd: 'rgba(100,116,139,0.40)',
                  },
                ].map(opt => {
                  const active = (receiveModal.shopifySyncMode || 'add_delta') === opt.id
                  return (
                    <label
                      key={opt.id}
                      onClick={() => setReceiveModal(m => ({ ...m, shopifySyncMode: opt.id, pushToShopify: opt.id !== 'erp_only' }))}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 9, cursor: 'pointer',
                        padding: '9px 12px', borderRadius: 9,
                        background: active ? opt.bg : 'var(--bg-elevated)',
                        border: `1.5px solid ${active ? opt.bd : 'var(--border)'}`,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <input
                        type="radio"
                        name="receiveSyncMode"
                        checked={active}
                        onChange={() => setReceiveModal(m => ({ ...m, shopifySyncMode: opt.id, pushToShopify: opt.id !== 'erp_only' }))}
                        style={{ marginTop: 3, accentColor: opt.color }}
                      />
                      <span style={{ fontSize: 12.5, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                        <strong style={{ color: active ? opt.color : 'var(--text-primary)' }}>{opt.title}</strong>
                        <span style={{ display: 'block', fontSize: 11.2, color: 'var(--text-muted)', marginTop: 1 }}>{opt.desc}</span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)' }}>
              <input
                type="checkbox"
                checked={receiveModal.closeShort}
                onChange={e => setReceiveModal(m => ({ ...m, closeShort: e.target.checked }))}
              />
              Mark PO as Completed / Closed Short (no more shipments expected for remaining qty)
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
              <button type="button" onClick={() => setReceiveModal(null)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
              <button
                type="submit"
                disabled={busyKey === 'confirmReceive'}
                style={{
                  padding: '8px 18px', borderRadius: 8, border: 'none',
                  background: receiveModal.shopifySyncMode === 'set_exact_on_hand' ? '#7c3aed' : '#059669',
                  color: '#fff', fontWeight: 700, cursor: 'pointer',
                }}
              >
                {busyKey === 'confirmReceive'
                  ? 'Syncing...'
                  : (receiveModal.shopifySyncMode === 'set_exact_on_hand'
                      ? '🎯 Confirm & Set Exact On-Hand'
                      : (receiveModal.shopifySyncMode === 'erp_only' ? 'Confirm Receipt (ERP Only)' : 'Confirm & Add Stock to Shopify'))}
              </button>
            </div>
          </form>
        </ModalShell>
      )}

      {/* 3. View PO Details Modal */}
      {viewPoModal && (
        <ModalShell title={`${viewPoModal.po_number} · Details`} subtitle={`${viewPoModal.supplier_name || 'Baseline'} · ${viewPoModal.order_date}`} onClose={() => setViewPoModal(null)} maxWidth={680}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {viewPoModal.notes && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '8px 11px', borderRadius: 8 }}>
                {viewPoModal.notes}
              </div>
            )}
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ padding: '7px 10px' }}>Product</th>
                    <th style={{ padding: '7px 8px' }}>Ordered</th>
                    <th style={{ padding: '7px 8px' }}>Received</th>
                    <th style={{ padding: '7px 8px' }}>FIFO Left</th>
                    <th style={{ padding: '7px 8px' }}>Unit</th>
                    <th style={{ padding: '7px 8px' }}>Landed</th>
                    <th style={{ padding: '7px 10px', textAlign: 'right' }}>Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewPoModal.items || []).map(it => (
                    <tr key={it.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '7px 10px' }}>
                        <div style={{ fontWeight: 700 }}>{it.parent_title}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{it.variant_title || it.sku}</div>
                      </td>
                      <td style={{ padding: '7px 8px' }}>{it.ordered_qty}</td>
                      <td style={{ padding: '7px 8px', color: '#059669', fontWeight: 700 }}>{it.received_qty}</td>
                      <td style={{ padding: '7px 8px', fontWeight: 700, color: (it.remaining_qty || 0) > 0 ? '#2563eb' : 'var(--text-muted)' }}>
                        {it.received_qty > 0 ? ((it.remaining_qty || 0) > 0 ? `${it.remaining_qty} left` : '0 (Done)') : '—'}
                      </td>
                      <td style={{ padding: '7px 8px' }}>{fmtRs(it.unit_cost)}</td>
                      <td style={{ padding: '7px 8px' }}>{fmtRs(it.landed_unit_cost)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700 }}>{fmtRs(it.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, fontSize: 12.5, color: 'var(--text-primary)', fontWeight: 700, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
              <span>Landing Cost: {fmtRs(viewPoModal.landing_cost)}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span>Billed: {fmtRs(viewPoModal.billed_cost)} · Paid: {fmtRs(viewPoModal.paid_amount)}</span>
                {!viewPoModal.is_baseline && viewPoModal.status !== 'cancelled' && (
                  <button
                    type="button"
                    onClick={() => openEditPo(viewPoModal.id)}
                    style={{
                      padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      background: 'rgba(245,158,11,0.12)', color: '#b45309', border: '1px solid rgba(245,158,11,0.36)',
                    }}
                  >
                    ✏️ Edit PO
                  </button>
                )}
              </div>
            </div>
          </div>
        </ModalShell>
      )}

      {/* 3b. Undo / Reverse Received PO Confirmation Modal */}
      {reverseModal && (
        <ModalShell
          title={`Undo & Cancel ${reverseModal.po.po_number}`}
          subtitle={`${reverseModal.po.supplier_name || 'No Supplier'} · ${reverseModal.po.order_date}`}
          onClose={() => setReverseModal(null)}
          maxWidth={490}
        >
          <form onSubmit={handleConfirmReverse} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{
              padding: '10px 12px', borderRadius: 9, fontSize: 12, lineHeight: 1.5,
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.28)', color: 'var(--text-primary)',
            }}>
              <strong style={{ color: '#dc2626' }}>⚠️ Reversing this Received PO will:</strong>
              <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
                <li>Deduct <strong>{(reverseModal.po.items || []).reduce((s, i) => s + (Number(i.received_qty) || 0), 0)} received unit(s)</strong> back from Warehouse stock &amp; log <code>PO_REVERSE</code>.</li>
                <li>Cancel billed amount <strong>{fmtRs(reverseModal.po.billed_cost)}</strong> from Supplier Khata.</li>
                <li>Re-sync active FIFO SKU costs cleanly.</li>
              </ul>
            </div>

            <label style={{
              display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
              padding: '9px 12px', borderRadius: 8,
              background: reverseModal.pushToShopify ? 'rgba(239,68,68,0.09)' : 'var(--bg-elevated)',
              border: `1px solid ${reverseModal.pushToShopify ? 'rgba(239,68,68,0.38)' : 'var(--border)'}`,
              color: reverseModal.pushToShopify ? '#dc2626' : 'var(--text-primary)',
            }}>
              <input
                type="checkbox"
                checked={Boolean(reverseModal.pushToShopify)}
                onChange={e => setReverseModal(prev => ({ ...prev, pushToShopify: e.target.checked }))}
              />
              Also subtract (−Qty) from Shopify inventory
            </label>

            <div>
              <label style={labelStyle}>Reason (Optional)</label>
              <input
                type="text"
                value={reverseModal.reason}
                onChange={e => setReverseModal(prev => ({ ...prev, reason: e.target.value }))}
                placeholder="e.g. Duplicate test PO or wrong batch entry"
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
              <button type="button" onClick={() => setReverseModal(null)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600 }}>
                Keep PO
              </button>
              <button
                type="submit"
                disabled={busyKey === 'confirmReverse'}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
              >
                {busyKey === 'confirmReverse' ? 'Reversing...' : 'Undo & Cancel PO'}
              </button>
            </div>
          </form>
        </ModalShell>
      )}

      {/* 4. Add/Edit Supplier Modal */}
      {supplierModal && (
        <ModalShell title={supplierModal.id ? 'Edit Supplier' : 'Add Supplier'} onClose={() => setSupplierModal(null)} maxWidth={480}>
          <form onSubmit={handleSaveSupplier} style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div>
              <label style={labelStyle}>Supplier / Factory Name *</label>
              <input type="text" required value={supplierModal.name} onChange={e => setSupplierModal(s => ({ ...s, name: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>Contact Person</label>
                <input type="text" value={supplierModal.contact_person || ''} onChange={e => setSupplierModal(s => ({ ...s, contact_person: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Phone / WhatsApp</label>
                <input type="text" value={supplierModal.phone || ''} onChange={e => setSupplierModal(s => ({ ...s, phone: e.target.value }))} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>City</label>
                <input type="text" value={supplierModal.city || ''} onChange={e => setSupplierModal(s => ({ ...s, city: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Opening Balance (Rs.)</label>
                <input type="number" step="0.01" value={supplierModal.opening_balance ?? 0} onChange={e => setSupplierModal(s => ({ ...s, opening_balance: e.target.value }))} style={inputStyle} />
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 3 }}>+Ve = Udhaar payable · −Ve = Advance given</div>
              </div>
            </div>
            <div>
              <label style={labelStyle}>Notes</label>
              <input type="text" value={supplierModal.notes || ''} onChange={e => setSupplierModal(s => ({ ...s, notes: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
              <button type="button" onClick={() => setSupplierModal(null)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>Cancel</button>
              <button type="submit" disabled={busyKey === 'saveSup'} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Save Supplier</button>
            </div>
          </form>
        </ModalShell>
      )}

      {/* 5. Supplier Running Khata Statement Modal */}
      {statementModal && (
        <ModalShell
          title={`Khata Statement · ${statementModal.supplier.name}`}
          subtitle={`Opening: ${fmtRs(statementModal.openingBalance)} · Closing Balance: ${fmtRs(statementModal.closingBalance)}`}
          onClose={() => setStatementModal(null)}
          maxWidth={720}
        >
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 10px' }}>Date</th>
                  <th style={{ padding: '8px 10px' }}>Entry</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Bill (+)</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Paid / Return (−)</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Running Balance</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                  <td style={{ padding: '7px 10px', color: 'var(--text-muted)' }}>—</td>
                  <td style={{ padding: '7px 10px', fontWeight: 700 }}>Opening Balance</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800 }}>{fmtRs(statementModal.openingBalance)}</td>
                </tr>
                {(statementModal.rows || []).map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '7px 10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{r.date}</td>
                    <td style={{ padding: '7px 10px' }}>
                      <div style={{ fontWeight: 700 }}>{r.label}</div>
                      {r.description && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.description}</div>}
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: '#dc2626', fontWeight: 700 }}>{r.billAmount ? fmtRs(r.billAmount) : '—'}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: '#059669', fontWeight: 700 }}>{r.creditAmount ? fmtRs(r.creditAmount) : '—'}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, color: r.runningBalance > 0 ? '#dc2626' : '#059669' }}>
                      {fmtRs(r.runningBalance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ModalShell>
      )}

      {/* 6. Supplier Defective Return Modal */}
      {supReturnModal && (
        <ModalShell title="Record Defective Return to Supplier" subtitle="Reduces shelf stock (−Qty) and deducts amount from supplier payable" onClose={() => setSupReturnModal(null)} maxWidth={500}>
          <form onSubmit={handleSupplierReturn} style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div>
              <label style={labelStyle}>Supplier *</label>
              <select required value={supReturnModal.supplier_id} onChange={e => setSupReturnModal(s => ({ ...s, supplier_id: e.target.value }))} style={inputStyle}>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Product / SKU (Optional — selects stock to deduct)</label>
              <select
                value={supReturnModal.product_cost_id}
                onChange={e => {
                  const chosen = inventory.find(i => String(i.id) === e.target.value)
                  setSupReturnModal(s => ({ ...s, product_cost_id: e.target.value, unit_cost: chosen ? chosen.avg_cost : s.unit_cost }))
                }}
                style={inputStyle}
              >
                <option value="">Credit note only (no SKU deduct)</option>
                {inventory.map(i => <option key={i.id} value={i.id}>{i.parent_title}{i.variant_title ? ` (${i.variant_title})` : ''} [{i.inventory_qty}]</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>Qty Returned *</label>
                <input type="number" min="1" required value={supReturnModal.qty} onChange={e => setSupReturnModal(s => ({ ...s, qty: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Unit Rate (Rs.) *</label>
                <input type="number" min="1" step="0.01" required value={supReturnModal.unit_cost} onChange={e => setSupReturnModal(s => ({ ...s, unit_cost: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Date</label>
                <input type="date" value={supReturnModal.entry_date} onChange={e => setSupReturnModal(s => ({ ...s, entry_date: e.target.value }))} style={inputStyle} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Notes</label>
              <input type="text" value={supReturnModal.notes} onChange={e => setSupReturnModal(s => ({ ...s, notes: e.target.value }))} placeholder="e.g. Stitching defects returned" style={inputStyle} />
            </div>
            {supReturnModal.product_cost_id && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
                <input type="checkbox" checked={supReturnModal.pushToShopify} onChange={e => setSupReturnModal(s => ({ ...s, pushToShopify: e.target.checked }))} />
                Push −Qty delta to Shopify
              </label>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
              <button type="button" onClick={() => setSupReturnModal(null)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>Cancel</button>
              <button type="submit" disabled={busyKey === 'supReturn'} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#0891b2', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Record Return</button>
            </div>
          </form>
        </ModalShell>
      )}

      {/* 7. Add/Edit Financial Account Modal */}
      {accountModal && (
        <ModalShell title={accountModal.id ? 'Edit Financial Account' : 'Add Bank / Cash / Ad Card'} onClose={() => setAccountModal(null)} maxWidth={440}>
          <form onSubmit={handleSaveAccount} style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div>
              <label style={labelStyle}>Account Name *</label>
              <input type="text" required value={accountModal.name} onChange={e => setAccountModal(a => ({ ...a, name: e.target.value }))} placeholder="e.g. Meezan Bank, Meta Ad Card, Cash Drawer" style={inputStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>Account Type</label>
                <select value={accountModal.account_type} onChange={e => setAccountModal(a => ({ ...a, account_type: e.target.value }))} style={inputStyle}>
                  <option value="bank">Bank Account</option>
                  <option value="cash">Cash Drawer</option>
                  <option value="ad_wallet">Ad Card / Agency Wallet</option>
                  <option value="mobile_wallet">JazzCash / EasyPaisa / SadaPay</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Opening Balance (Rs.)</label>
                <input type="number" step="0.01" value={accountModal.opening_balance ?? 0} onChange={e => setAccountModal(a => ({ ...a, opening_balance: e.target.value }))} style={inputStyle} />
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={Boolean(accountModal.is_default)} onChange={e => setAccountModal(a => ({ ...a, is_default: e.target.checked }))} />
              Default bank account (receives auto-posted CPR courier deposits)
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
              <button type="button" onClick={() => setAccountModal(null)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>Cancel</button>
              <button type="submit" disabled={busyKey === 'saveAcc'} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Save Account</button>
            </div>
          </form>
        </ModalShell>
      )}

      {/* 8. Unified Ledger Entry / Payment / Transfer Modal */}
      {ledgerModal && (
        <ModalShell
          title={
            ledgerModal.entry_type === 'transfer' ? 'Account Transfer / Ad Card Top-Up'
              : ledgerModal.entry_type === 'po_payment' ? 'Record PO Supplier Payment'
              : ledgerModal.entry_type === 'supplier_advance' ? 'Record Supplier Payment / Advance'
              : ledgerModal.entry_type === 'capital_in' ? 'Owner Capital Investment (+)'
              : ledgerModal.entry_type === 'owner_drawing' ? 'Owner Profit Drawing (−)'
              : 'Manual Ledger Adjustment'
          }
          onClose={() => setLedgerModal(null)}
          maxWidth={480}
        >
          <form onSubmit={handleSaveLedgerEntry} style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>Amount (Rs.) *</label>
                <input type="number" min="1" step="0.01" required autoFocus value={ledgerModal.amount} onChange={e => setLedgerModal(m => ({ ...m, amount: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Date *</label>
                <input type="date" required value={ledgerModal.entry_date} onChange={e => setLedgerModal(m => ({ ...m, entry_date: e.target.value }))} style={inputStyle} />
              </div>
            </div>

            {ledgerModal.entry_type === 'transfer' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>From Account *</label>
                  <select required value={ledgerModal.from_account_id} onChange={e => setLedgerModal(m => ({ ...m, from_account_id: e.target.value }))} style={inputStyle}>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({fmtRs(a.current_balance)})</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>To Account *</label>
                  <select required value={ledgerModal.to_account_id} onChange={e => setLedgerModal(m => ({ ...m, to_account_id: e.target.value }))} style={inputStyle}>
                    <option value="">Select destination...</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>
            ) : (
              <div>
                <label style={labelStyle}>Account *</label>
                <select required value={ledgerModal.account_id} onChange={e => setLedgerModal(m => ({ ...m, account_id: e.target.value }))} style={inputStyle}>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({fmtRs(a.current_balance)})</option>)}
                </select>
              </div>
            )}

            {ledgerModal.entry_type === 'adjustment' && (
              <div>
                <label style={labelStyle}>Direction</label>
                <select value={ledgerModal.direction} onChange={e => setLedgerModal(m => ({ ...m, direction: e.target.value }))} style={inputStyle}>
                  <option value="in">Money IN (+)</option>
                  <option value="out">Money OUT (−)</option>
                </select>
              </div>
            )}

            {['po_payment', 'supplier_advance'].includes(ledgerModal.entry_type) && (
              <div>
                <label style={labelStyle}>Supplier</label>
                <select value={ledgerModal.supplier_id} onChange={e => setLedgerModal(m => ({ ...m, supplier_id: e.target.value }))} style={inputStyle}>
                  <option value="">Select Supplier</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}

            <div>
              <label style={labelStyle}>Description / Reference</label>
              <input type="text" value={ledgerModal.description} onChange={e => setLedgerModal(m => ({ ...m, description: e.target.value }))} placeholder="e.g. IBFT ref #44821" style={inputStyle} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
              <button type="button" onClick={() => setLedgerModal(null)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>Cancel</button>
              <button type="submit" disabled={busyKey === 'saveLedger'} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Save Entry</button>
            </div>
          </form>
        </ModalShell>
      )}

      {/* 9. Manual Stock Adjust Modal */}
      {adjustModal && (
        <ModalShell
          title={`Adjust Stock · ${adjustModal.item.parent_title}`}
          subtitle={`Current Qty: ${adjustModal.item.inventory_qty} · Enter +N to add or -N to deduct`}
          onClose={() => setAdjustModal(null)}
          maxWidth={440}
        >
          <form onSubmit={handleManualAdjust} style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>Qty Delta (+ / −) *</label>
                <input type="number" required autoFocus value={adjustModal.qty_delta} onChange={e => setAdjustModal(a => ({ ...a, qty_delta: e.target.value }))} placeholder="e.g. +5 or -2" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Reason Type</label>
                <select value={adjustModal.movement_type} onChange={e => setAdjustModal(a => ({ ...a, movement_type: e.target.value }))} style={inputStyle}>
                  <option value="MANUAL_ADJUST">Manual Audit / Adjust</option>
                  <option value="RETURN_RESTOCK">Return Restock (+)</option>
                  <option value="RETURN_DAMAGED">Damaged / Write-Off (−)</option>
                </select>
              </div>
            </div>
            <div>
              <label style={labelStyle}>Notes</label>
              <input type="text" value={adjustModal.notes} onChange={e => setAdjustModal(a => ({ ...a, notes: e.target.value }))} placeholder="e.g. Found 2 extra pieces on shelf" style={inputStyle} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={adjustModal.pushToShopify} onChange={e => setAdjustModal(a => ({ ...a, pushToShopify: e.target.checked }))} />
              Push delta to Shopify (+ linked Shared Pool stores)
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
              <button type="button" onClick={() => setAdjustModal(null)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>Cancel</button>
              <button type="submit" disabled={busyKey === 'adjust'} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Apply Adjustment</button>
            </div>
          </form>
        </ModalShell>
      )}

      {/* 10. Opt-In Shared SKU Pool Modal */}
      {poolModal && (
        <ModalShell
          title="Opt-In Shared Stock Pool"
          subtitle="Give the SAME Pool Key (e.g. MASTER-HOODIE-BLK-L) on 2 stores to mirror PO/stock deltas across both"
          onClose={() => setPoolModal(null)}
          maxWidth={440}
        >
          <form onSubmit={handleSaveSharedPool} style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>
              {poolModal.item.parent_title}{poolModal.item.variant_title ? ` — ${poolModal.item.variant_title}` : ''}
            </div>
            <div>
              <label style={labelStyle}>Shared Pool Key (Leave blank for Isolated Store SKU)</label>
              <input
                type="text"
                autoFocus
                value={poolModal.shared_pool_key}
                onChange={e => setPoolModal(p => ({ ...p, shared_pool_key: e.target.value.toUpperCase() }))}
                placeholder="e.g. MASTER-HD-BLK-L"
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
              <button type="button" onClick={() => setPoolModal(null)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>Cancel</button>
              <button type="submit" disabled={busyKey === 'pool'} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#7c3aed', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Save Pool Link</button>
            </div>
          </form>
        </ModalShell>
      )}
      {/* 11. Ghost & Strict SKU Quick Guide Modal */}
      {guideOpen && <GhostSkuGuide mode="modal" context="po" onClose={() => setGuideOpen(false)} />}
    </div>
  )
}
