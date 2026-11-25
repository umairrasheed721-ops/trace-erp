import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useApp } from '../context/AppContext'

const API = import.meta.env.VITE_API_URL || ''

const fmtRs = (v) => `Rs. ${Math.round(Number(v) || 0).toLocaleString()}`

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
  const [invLedger, setInvLedger] = useState([])

  // Filters
  const [invSearch, setInvSearch] = useState('')
  const [ledgerFilter, setLedgerFilter] = useState({ account_id: '', entry_type: 'all', includeVoid: false })
  const [showInvLog, setShowInvLog] = useState(false)

  // Busy flags
  const [busyKey, setBusyKey] = useState('')

  // Modals
  const [newPoOpen, setNewPoOpen] = useState(false)
  const [poForm, setPoForm] = useState({ supplier_id: '', order_date: new Date().toISOString().slice(0, 10), landing_cost: '', notes: '', items: [] })
  const [skuPickerSearch, setSkuPickerSearch] = useState('')

  const [receiveModal, setReceiveModal] = useState(null) // { po, qtys: {}, pushToShopify: true, closeShort: false, notes: '' }
  const [viewPoModal, setViewPoModal] = useState(null)

  const [supplierModal, setSupplierModal] = useState(null)
  const [statementModal, setStatementModal] = useState(null)
  const [supReturnModal, setSupReturnModal] = useState(null)

  const [accountModal, setAccountModal] = useState(null)
  const [ledgerModal, setLedgerModal] = useState(null) // { entry_type, amount, account_id, from_account_id, to_account_id, supplier_id, po_id, entry_date, description, ref_label, direction }

  const [adjustModal, setAdjustModal] = useState(null) // { item, qty_delta, movement_type, notes, pushToShopify }
  const [poolModal, setPoolModal] = useState(null)     // { item, shared_pool_key }

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
      if (invJ.success) setInventory(invJ.data || [])
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
      setPoForm({
        supplier_id: suppliers[0]?.id ? String(suppliers[0].id) : '',
        order_date: new Date().toISOString().slice(0, 10),
        landing_cost: '',
        notes: `Auto-generated from ${rows.length} Continue Selling backorder SKUs`,
        items: rows.map(r => ({
          product_cost_id: r.id,
          shopify_variant_id: r.shopify_variant_id || '',
          sku: r.sku || '',
          parent_title: r.parent_title,
          variant_title: r.variant_title || '',
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
    setPoForm({
      supplier_id: suppliers[0]?.id ? String(suppliers[0].id) : '',
      order_date: new Date().toISOString().slice(0, 10),
      landing_cost: '',
      notes: '',
      items: [],
    })
    setSkuPickerSearch('')
    setNewPoOpen(true)
  }

  const addSkuToPoForm = (skuRow) => {
    setPoForm(prev => {
      if (prev.items.some(i => i.product_cost_id === skuRow.id)) return prev
      return {
        ...prev,
        items: [
          ...prev.items,
          {
            product_cost_id: skuRow.id,
            shopify_variant_id: skuRow.shopify_variant_id || '',
            sku: skuRow.sku || '',
            parent_title: skuRow.parent_title,
            variant_title: skuRow.variant_title || '',
            ordered_qty: skuRow.inventory_qty < 0 ? Math.abs(skuRow.inventory_qty) : 10,
            unit_cost: skuRow.avg_cost || 0,
          },
        ],
      }
    })
  }

  const handleCreatePo = async (e) => {
    e.preventDefault()
    if (poForm.items.length === 0) {
      addToast('Add at least one SKU to the Purchase Order', 'error')
      return
    }
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
          notes: poForm.notes,
          items: poForm.items,
        }),
      })
      const j = await res.json()
      if (j.success) {
        addToast(j.message, 'success')
        setNewPoOpen(false)
        await refreshAll()
      } else {
        addToast(j.error || 'Failed to create PO', 'error')
      }
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
      setReceiveModal({ po: j.data, qtys, pushToShopify: true, closeShort: false, notes: '' })
    } finally {
      setBusyKey('')
    }
  }

  const handleConfirmReceive = async (e) => {
    e.preventDefault()
    if (!receiveModal) return
    setBusyKey('confirmReceive')
    try {
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
          pushToShopify: receiveModal.pushToShopify,
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

  const filteredCatalogForPo = useMemo(() => {
    const q = skuPickerSearch.trim().toLowerCase()
    if (!q) return inventory.slice(0, 12)
    return inventory.filter(i =>
      (i.parent_title || '').toLowerCase().includes(q)
      || (i.variant_title || '').toLowerCase().includes(q)
      || (i.sku || '').toLowerCase().includes(q)
    ).slice(0, 15)
  }, [inventory, skuPickerSearch])

  const poSubtotalPreview = poForm.items.reduce((s, i) => s + (parseInt(i.ordered_qty, 10) || 0) * (parseFloat(i.unit_cost) || 0), 0)
  const poTotalPreview = poSubtotalPreview + (parseFloat(poForm.landing_cost) || 0)

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
            Per-store isolated PO costing (Moving Weighted Avg), Warehouse Stock &amp; Real Cashflow Khata
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
              Partial receiving supported · Moving Weighted Average updates automatically on receive
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
                    <th style={{ padding: '9px 12px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Avg Landed Cost</th>
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
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{item.parent_title}</div>
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
                        <td style={{ padding: '10px 12px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)', fontWeight: 600 }}>
                          {fmtRs(item.avg_cost)}
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

      {/* 1. Create Purchase Order Modal */}
      {newPoOpen && (
        <ModalShell title="New Purchase Order" subtitle="Select supplier, add SKUs & optional freight/stitching landing cost" onClose={() => setNewPoOpen(false)} maxWidth={780}>
          <form onSubmit={handleCreatePo} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.9fr 0.9fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>Supplier</label>
                <select
                  value={poForm.supplier_id}
                  onChange={e => setPoForm(p => ({ ...p, supplier_id: e.target.value }))}
                  style={inputStyle}
                >
                  <option value="">Select Supplier (Optional)</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Order Date</label>
                <input type="date" value={poForm.order_date} onChange={e => setPoForm(p => ({ ...p, order_date: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Extra Landing / Freight (Rs.)</label>
                <input type="number" min="0" value={poForm.landing_cost} onChange={e => setPoForm(p => ({ ...p, landing_cost: e.target.value }))} placeholder="0" style={inputStyle} />
              </div>
            </div>

            {/* SKU Picker */}
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 11 }}>
              <label style={labelStyle}>Add SKUs from Catalog</label>
              <input
                type="text"
                value={skuPickerSearch}
                onChange={e => setSkuPickerSearch(e.target.value)}
                placeholder="Type product title or SKU to add..."
                style={{ ...inputStyle, background: 'var(--bg-surface)', marginBottom: 8 }}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 110, overflowY: 'auto' }}>
                {filteredCatalogForPo.map(row => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => addSkuToPoForm(row)}
                    style={{
                      padding: '4.5px 9px', borderRadius: 7, fontSize: 11.5, cursor: 'pointer',
                      background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)',
                    }}
                  >
                    + {row.parent_title}{row.variant_title ? ` (${row.variant_title})` : ''} [{row.inventory_qty}]
                  </button>
                ))}
              </div>
            </div>

            {/* Selected Items */}
            {poForm.items.length > 0 && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                      <th style={{ padding: '7px 10px' }}>Product</th>
                      <th style={{ padding: '7px 8px', width: 90 }}>Qty</th>
                      <th style={{ padding: '7px 8px', width: 115 }}>Unit Cost (Rs.)</th>
                      <th style={{ padding: '7px 10px', textAlign: 'right' }}>Total</th>
                      <th style={{ padding: '7px 8px', width: 32 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {poForm.items.map((it, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '7px 10px' }}>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{it.parent_title}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{it.variant_title || it.sku}</div>
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <input
                            type="number" min="1" value={it.ordered_qty}
                            onChange={e => setPoForm(p => ({ ...p, items: p.items.map((x, i) => i === idx ? { ...x, ordered_qty: e.target.value } : x) }))}
                            style={{ ...inputStyle, padding: '5px 7px' }}
                          />
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <input
                            type="number" min="0" step="0.01" value={it.unit_cost}
                            onChange={e => setPoForm(p => ({ ...p, items: p.items.map((x, i) => i === idx ? { ...x, unit_cost: e.target.value } : x) }))}
                            style={{ ...inputStyle, padding: '5px 7px' }}
                          />
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                          {fmtRs((parseInt(it.ordered_qty, 10) || 0) * (parseFloat(it.unit_cost) || 0))}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => setPoForm(p => ({ ...p, items: p.items.filter((_, i) => i !== idx) }))}
                            style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontWeight: 700 }}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div>
              <label style={labelStyle}>Notes (Optional)</label>
              <input type="text" value={poForm.notes} onChange={e => setPoForm(p => ({ ...p, notes: e.target.value }))} placeholder="e.g. Winter fabric batch #2" style={inputStyle} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
                PO Total: {fmtRs(poTotalPreview)}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => setNewPoOpen(false)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                <button type="submit" disabled={busyKey === 'createPo'} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                  {busyKey === 'createPo' ? 'Creating...' : 'Create Purchase Order'}
                </button>
              </div>
            </div>
          </form>
        </ModalShell>
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

            <label style={{
              display: 'flex', alignItems: 'flex-start', gap: 9, cursor: 'pointer',
              padding: '10px 12px', borderRadius: 9,
              background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.30)',
            }}>
              <input
                type="checkbox"
                checked={receiveModal.pushToShopify}
                onChange={e => setReceiveModal(m => ({ ...m, pushToShopify: e.target.checked }))}
                style={{ marginTop: 2, accentColor: '#059669' }}
              />
              <span style={{ fontSize: 12.5, color: 'var(--text-primary)', lineHeight: 1.45 }}>
                <strong>Push +Qty Delta to Shopify</strong>
                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)' }}>
                  Adds exact delta (+Qty) to Shopify (safe for negative Continue Selling backorders &amp; linked Shared Pools). Uncheck if stock is already entered on Shopify.
                </span>
              </span>
            </label>

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
              <button type="submit" disabled={busyKey === 'confirmReceive'} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#059669', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                {busyKey === 'confirmReceive' ? 'Receiving...' : 'Confirm Stock Receipt'}
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
                      <td style={{ padding: '7px 8px' }}>{fmtRs(it.unit_cost)}</td>
                      <td style={{ padding: '7px 8px' }}>{fmtRs(it.landed_unit_cost)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700 }}>{fmtRs(it.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--text-primary)', fontWeight: 700 }}>
              <span>Landing Cost: {fmtRs(viewPoModal.landing_cost)}</span>
              <span>Billed: {fmtRs(viewPoModal.billed_cost)} · Paid: {fmtRs(viewPoModal.paid_amount)}</span>
            </div>
          </div>
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
    </div>
  )
}
