import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'

/**
 * useCommandCenterModals
 *
 * Owns all modal-related state and handlers for the Command Center.
 * Extracted from SearchTool.jsx to reduce its line count.
 *
 * Modals managed:
 *   - EditOrderModal   (editingOrder, editorLoading, fetchOrderDetails, updateOrderField)
 *   - CustomerHistory  (customerHistoryPhone)
 *   - WA Queue        (showWAQueue, waQueueIndex, waQueueTemplate, waTemplates)
 *   - OrderHistory    (historyOrder)
 *   - NameRules       (showNameDialog, nameSettings)
 *   - ColPicker       (showColPicker)
 *   - SaveView        (showSaveDialog, viewName, isViewLocked)
 *   - AgingConfig     (showAgingConfig)
 */
export default function useCommandCenterModals() {
  const { addToast } = useApp()

  // ── Edit Order Modal ──────────────────────────────────────────────────
  const [editingOrder, setEditingOrder] = useState(null)
  const [editorLoading, setEditorLoading] = useState(false)
  const [validCities, setValidCities] = useState([])

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

  // ── Customer History Modal ────────────────────────────────────────────
  const [customerHistoryPhone, setCustomerHistoryPhone] = useState(null)

  // ── WhatsApp Queue Modal ──────────────────────────────────────────────
  const [showWAQueue, setShowWAQueue] = useState(false)
  const [waQueueIndex, setWAQueueIndex] = useState(0)
  const [waQueueTemplate, setWAQueueTemplate] = useState('')
  const [waTemplates, setWATemplates] = useState([])

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

  // ── Order History Modal ───────────────────────────────────────────────
  const [historyOrder, setHistoryOrder] = useState(null)

  // ── Name Rules Modal ─────────────────────────────────────────────────
  const [showNameDialog, setShowNameDialog] = useState(false)
  const [nameSettings, setNameSettings] = useState(() => {
    const saved = localStorage.getItem('trace_name_settings')
    return saved ? JSON.parse(saved) : { shorten: true, stripWords: 'Mr, Ms, Dr, Malik, M.' }
  })

  const saveNameSettings = (newSettings) => {
    setNameSettings(newSettings)
    localStorage.setItem('trace_name_settings', JSON.stringify(newSettings))
    setShowNameDialog(false)
  }

  // ── Column Picker Modal ───────────────────────────────────────────────
  const [showColPicker, setShowColPicker] = useState(false)

  // ── Save View Modal ───────────────────────────────────────────────────
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [viewName, setViewName] = useState('')
  const [isViewLocked, setIsViewLocked] = useState(false)

  // ── Aging Config Modal ────────────────────────────────────────────────
  const [showAgingConfig, setShowAgingConfig] = useState(false)

  return {
    // Edit Order
    editingOrder, setEditingOrder,
    editorLoading,
    isCityValid,
    fetchOrderDetails,
    // Customer History
    customerHistoryPhone, setCustomerHistoryPhone,
    // WA Queue
    showWAQueue, setShowWAQueue,
    waQueueIndex, setWAQueueIndex,
    waQueueTemplate, setWAQueueTemplate,
    waTemplates,
    // Order History
    historyOrder, setHistoryOrder,
    // Name Rules
    showNameDialog, setShowNameDialog,
    nameSettings, setNameSettings,
    saveNameSettings,
    // Col Picker
    showColPicker, setShowColPicker,
    // Save View
    showSaveDialog, setShowSaveDialog,
    viewName, setViewName,
    isViewLocked, setIsViewLocked,
    // Aging Config
    showAgingConfig, setShowAgingConfig,
  }
}
