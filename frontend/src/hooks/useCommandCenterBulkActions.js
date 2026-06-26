import { useState, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import { getDateRange, formatYMD } from '../utils/orderUtils'

/**
 * useCommandCenterBulkActions
 *
 * Owns all bulk-selection and bulk-action API logic for the Command Center.
 * Extracted from SearchTool.jsx to reduce its line count.
 *
 * Requires the following from the parent:
 *   - allOrders / setAllOrders  (live order list)
 *   - selectedIds / setSelectedIds
 *   - runSearch                  (triggers a refresh)
 *   - filter state              (preset, customStart, customEnd, status, keyword, colFilters, activeStoreId)
 */
export default function useCommandCenterBulkActions({
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
  fetchBacklogDates,
}) {
  const { addToast } = useApp()
  const [bulkActionLoading, setBulkActionLoading] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', onConfirm: null, loading: false })

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

    setConfirmDialog({
      isOpen: true,
      title: '📦 Update Status',
      message: `Mark ${selectedIds.length} orders as "${newStatus}"?`,
      onConfirm: async () => {
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
            if (typeof fetchBacklogDates === 'function') fetchBacklogDates();
          }
        } catch { addToast('Status update failed', 'error') }
        finally { setBulkActionLoading(false); setConfirmDialog(prev => ({ ...prev, isOpen: false })) }
      }
    })
  }

  const handleBulkConfirm = async () => {
    if (selectedIds.length === 0) return
    
    // Zero Cost Check
    const blocked = allOrders.filter(o => selectedIds.includes(o.id) && (!o.cost || parseFloat(o.cost) <= 0))
    if (blocked.length > 0) {
      addToast(`🛑 Blocked: ${blocked.length} orders have $0 cost. Heal them first.`, 'error')
      return
    }

    setConfirmDialog({
      isOpen: true,
      title: '✅ Confirm Orders',
      message: `Confirm ${selectedIds.length} orders?`,
      onConfirm: async () => {
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
            if (typeof fetchBacklogDates === 'function') fetchBacklogDates();
          }
        } catch { addToast('Bulk error', 'error') }
        finally { setBulkActionLoading(false); setConfirmDialog(prev => ({ ...prev, isOpen: false })) }
      }
    })
  }

  const handleBulkRevert = async () => {
    if (selectedIds.length === 0) return
    setConfirmDialog({
      isOpen: true,
      title: '↩️ Revert to Pending',
      message: `Revert ${selectedIds.length} orders to Pending?`,
      onConfirm: async () => {
        setBulkActionLoading(true)
        try {
          const apiUrl = import.meta.env.VITE_API_URL || '';
          const res = await fetch(`${apiUrl}/api/bulk/revert`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('trace_token')}`
            },
            body: JSON.stringify({ ids: selectedIds })
          })
          if (res.ok) {
            addToast(`↩️ ${selectedIds.length} orders reverted!`, 'info')
            setAllOrders(prev => prev.map(o => selectedIds.includes(o.id) ? { ...o, delivery_status: 'Pending', tracking_number: null, courier: null } : o))
            setSelectedIds([])
            if (typeof fetchBacklogDates === 'function') fetchBacklogDates();
          }
        } catch { addToast('Bulk error', 'error') }
        finally { setBulkActionLoading(false); setConfirmDialog(prev => ({ ...prev, isOpen: false })) }
      }
    })
  }

  const handleBulkSyncCourier = async () => {
    if (selectedIds.length === 0) return
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
        runSearch()
      } else {
        addToast(`❌ Sync Failed: ${data.error}`, 'error')
      }
    } catch { addToast('Network error', 'error') }
    finally { setBulkActionLoading(false) }
  }

  const handleBulkSyncStatus = async () => {
    if (selectedIds.length === 0) return
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
        runSearch()
      } else {
        addToast(`❌ Sync Failed: ${data.error}`, 'error')
      }
    } catch { addToast('Network error', 'error') }
  }

  const handleExportTracking = (filteredOrders) => {
    const targetOrders = selectedIds.length > 0 
      ? allOrders.filter(o => selectedIds.includes(o.id))
      : filteredOrders;

    if (targetOrders.length === 0) {
      addToast('No orders selected or found to export', 'warning');
      return;
    }

    const headers = [
      'Shopify ID', 'Ref Number', 'Date', 'Customer', 'Phone', 
      'City', 'Address', 'Tracking Number', 'Courier', 
      'Status', 'Price', 'Payment Status'
    ];

    const rows = targetOrders.map(o => [
      o.shopify_order_id || '',
      o.ref_number || '',
      o.created_at ? new Date(o.created_at).toLocaleDateString() : '',
      o.customer_name || '',
      o.phone || '',
      o.city || '',
      `"${(o.address || '').replace(/"/g, '""')}"`,
      o.tracking_number || '',
      o.courier || '',
      o.delivery_status || '',
      o.price || '',
      o.payment_status || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Trace_ERP_Export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    addToast(`📊 Exported ${targetOrders.length} orders to CSV!`, 'success');
  };

  const handleBulkBookPostEx = async () => {
    if (selectedIds.length === 0) return

    const blocked = allOrders.filter(o => selectedIds.includes(o.id) && (!o.cost || parseFloat(o.cost) <= 0))
    if (blocked.length > 0) {
      addToast(`🛑 Blocked: ${blocked.length} orders have $0 cost. Heal them first.`, 'error')
      return
    }

    setConfirmDialog({
      isOpen: true,
      title: '🚀 PostEx Booking',
      message: `Book ${selectedIds.length} orders with PostEx in background?`,
      onConfirm: async () => {
        setBulkActionLoading(true)
        try {
          const apiUrl = import.meta.env.VITE_API_URL || '';
          await fetch(`${apiUrl}/api/bulk/book`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('trace_token')}`
            },
            body: JSON.stringify({ ids: selectedIds, courier: 'PostEx' })
          })
          addToast(`🚀 Background Booking Started! Check Topbar.`, 'info')
          setSelectedIds([])
          if (typeof fetchBacklogDates === 'function') fetchBacklogDates();
        } catch { addToast('Bulk booking error', 'error') }
        finally { setBulkActionLoading(false); setConfirmDialog(prev => ({ ...prev, isOpen: false })) }
      }
    })
  }

  const handleBulkBookInstaworld = async (courier) => {
    if (selectedIds.length === 0) return

    const blocked = allOrders.filter(o => selectedIds.includes(o.id) && (!o.cost || parseFloat(o.cost) <= 0))
    if (blocked.length > 0) {
      addToast(`🛑 Blocked: ${blocked.length} orders have $0 cost. Heal them first.`, 'error')
      return
    }

    let label = 'Instaworld';
    if (courier === 'insta:primary') label = 'Instaworld API 1 (Primary)';
    else if (courier === 'insta:backup') label = 'Instaworld API 2 (Backup)';
    else if (courier === 'insta:key3') label = 'Instaworld API 3 (Optional)';

    setConfirmDialog({
      isOpen: true,
      title: `🌐 ${label} Booking`,
      message: `Book ${selectedIds.length} orders with ${label} in background?`,
      onConfirm: async () => {
        setBulkActionLoading(true)
        try {
          const apiUrl = import.meta.env.VITE_API_URL || '';
          await fetch(`${apiUrl}/api/bulk/book`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('trace_token')}`
            },
            body: JSON.stringify({ ids: selectedIds, courier })
          })
          addToast(`🚀 Background Booking Started! Check Topbar.`, 'info')
          setSelectedIds([])
          if (typeof fetchBacklogDates === 'function') fetchBacklogDates();
        } catch { addToast('Bulk booking error', 'error') }
        finally { setBulkActionLoading(false); setConfirmDialog(prev => ({ ...prev, isOpen: false })) }
      }
    })
  }

  const handleBulkCancel = async () => {
    if (selectedIds.length === 0) return
    setConfirmDialog({
      isOpen: true,
      title: '🛑 Cancel Booking',
      message: `Cancel ${selectedIds.length} bookings? This will attempt to void them in the courier portals.`,
      onConfirm: async () => {
        setBulkActionLoading(true)
        try {
          const apiUrl = import.meta.env.VITE_API_URL || '';
          await fetch(`${apiUrl}/api/bulk/cancel`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('trace_token')}`
            },
            body: JSON.stringify({ ids: selectedIds })
          })
          addToast(`🛑 Cancellation sequence started.`, 'info')
          setSelectedIds([])
          if (typeof fetchBacklogDates === 'function') fetchBacklogDates();
        } catch { addToast('Bulk cancel error', 'error') }
        finally { setBulkActionLoading(false); setConfirmDialog(prev => ({ ...prev, isOpen: false })) }
      }
    })
  }

  const handleSelectAllMatching = async () => {
    setBulkActionLoading(true)
    try {
      const dateRange = getDateRange(preset, customStart, customEnd)
      const startDate = dateRange?.start ? formatYMD(dateRange.start) : ''
      const endDate = dateRange?.end ? formatYMD(dateRange.end) : ''
      const queryStatus = status === 'All Statuses' ? '' : status
      const kw = keyword ? keyword.trim().replace(/^#/, '') : ''
      
      const colFilterParams = Object.entries(colFilters)
        .filter(([_, v]) => v && v.trim())
        .map(([k, v]) => `&${k}=${encodeURIComponent(v.trim())}`)
        .join('')

      const res = await fetch(`/api/orders/all-ids?store_id=${activeStoreId}&status=${encodeURIComponent(queryStatus||'')}&search=${encodeURIComponent(kw)}&start_date=${startDate}&end_date=${endDate}${colFilterParams}`)
      const data = await res.json()
      if (res.ok && data.ids) {
        setSelectedIds(data.ids)
        addToast(`✅ Selected all ${data.ids.length} matching orders`, 'success')
      }
    } catch (e) {
      addToast('Failed to select all orders', 'error')
    } finally {
      setBulkActionLoading(false)
    }
  }

  return {
    bulkActionLoading,
    confirmDialog,
    setConfirmDialog,
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
  }
}
