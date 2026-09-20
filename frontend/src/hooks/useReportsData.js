import { useState, useEffect, useMemo, useCallback } from 'react';
import usePersistentState from './usePersistentState';

export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(amount || 0);
}

export function formatPercent(value) {
  return (value || 0).toFixed(2) + '%';
}

export function formatNumber(value) {
  return (value || 0).toFixed(2);
}

export function getColMinWidth(col) {
  if (col.id === 'date') return 120;
  if (col.group === 'income') return 120;
  if (col.group === 'expense') return 115;
  if (col.group === 'profit') return 120;
  if (col.group === 'kpi') return 110;
  return 100;
}

export default function useReportsData(activeStoreId, toast) {
  const [loading, setLoading] = useState(true);
  const [dailyData, setDailyData] = useState([]);
  const [snapshots24h, setSnapshots24h] = useState({});
  const [view, setView] = usePersistentState('reports_filters_v1_view', 'daily'); // 'daily' or 'monthly'

  // ─── Date Range Filter ───────────────────────────────────────────
  const getPresetRange = (preset) => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const pad = (n) => String(n).padStart(2, '0');
    const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    switch (preset) {
      case 'This Month':   return { start: `${y}-${pad(m+1)}-01`, end: fmt(now) };
      case 'Last Month': {
        const lm = new Date(y, m, 0);
        return { start: `${lm.getFullYear()}-${pad(lm.getMonth()+1)}-01`, end: fmt(lm) };
      }
      case 'This Quarter': {
        const qStart = new Date(y, Math.floor(m/3)*3, 1);
        return { start: fmt(qStart), end: fmt(now) };
      }
      case 'This Year':  return { start: `${y}-01-01`, end: fmt(now) };
      case 'Last Year':  return { start: `${y-1}-01-01`, end: `${y-1}-12-31` };
      case 'Current Tax Year': {
        const taxStartYear = m >= 6 ? y : y - 1;
        return { start: `${taxStartYear}-07-01`, end: fmt(now) };
      }
      case 'Last Tax Year': {
        const taxStartYear = m >= 6 ? y - 1 : y - 2;
        return { start: `${taxStartYear}-07-01`, end: `${taxStartYear + 1}-06-30` };
      }
      case 'All Time':   return { start: '2010-01-01', end: fmt(now) };
      default:           return { start: '', end: '' };
    }
  };

  const [datePreset, setDatePreset] = usePersistentState('reports_filters_v1_date_preset', 'This Year');
  const [customStart, setCustomStart] = usePersistentState('reports_filters_v1_custom_start', '');
  const [customEnd, setCustomEnd] = usePersistentState('reports_filters_v1_custom_end', '');
  const [showCustom, setShowCustom] = usePersistentState('reports_filters_v1_show_custom', false);

  const activeDateRange = useMemo(() => {
    return datePreset === 'Custom'
      ? { start: customStart, end: customEnd }
      : getPresetRange(datePreset);
  }, [datePreset, customStart, customEnd]);

  const isInRange = useCallback((dateStr) => {
    if (!activeDateRange.start && !activeDateRange.end) return true;
    if (activeDateRange.start && dateStr < activeDateRange.start) return false;
    if (activeDateRange.end && dateStr > activeDateRange.end) return false;
    return true;
  }, [activeDateRange]);

  const [hiddenColumns, setHiddenColumns] = useState(() => {
    const saved = localStorage.getItem('reports_hidden_columns');
    return saved ? JSON.parse(saved) : [];
  });
  const [sortConfig, setSortConfig] = useState(() => {
    const saved = localStorage.getItem('reports_sort_config');
    return saved ? JSON.parse(saved) : { key: 'date', direction: 'desc' };
  });
  const [showColPicker, setShowColPicker] = useState(false);
  const [tableLayout, setTableLayout] = useState(() => localStorage.getItem('reports_table_layout') || 'horizontal');

  const [savedViews, setSavedViews] = useState([]);
  const [selectedReportViewId, setSelectedReportViewId] = useState('');
  const [showSaveViewModal, setShowSaveViewModal] = useState(false);
  const [reportViewName, setReportViewName] = useState('');
  const [isReportViewLocked, setIsReportViewLocked] = useState(false);

  useEffect(() => {
    localStorage.setItem('reports_table_layout', tableLayout);
  }, [tableLayout]);

  // Sync active hidden columns to backend DB so prefs stay identical across all browsers/devices
  useEffect(() => {
    localStorage.setItem('reports_hidden_columns', JSON.stringify(hiddenColumns));
    if (!activeStoreId) return;
    const timer = setTimeout(() => {
      fetch('/api/reports/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('trace_token') || ''}`
        },
        body: JSON.stringify({ store_id: activeStoreId, hiddenColumns })
      }).catch(err => console.warn('Failed to sync report column preferences:', err));
    }, 1000);
    return () => clearTimeout(timer);
  }, [hiddenColumns, activeStoreId]);

  useEffect(() => {
    localStorage.setItem('reports_sort_config', JSON.stringify(sortConfig));
  }, [sortConfig]);

  // Fetch cross-browser user preferences & custom saved report views from DB
  const fetchReportPreferencesAndViews = useCallback(async () => {
    if (!activeStoreId) return;
    const token = localStorage.getItem('trace_token') || '';
    
    // 1. Fetch user preferences (for new browser auto-hydration)
    try {
      const prefRes = await fetch(`/api/reports/preferences?store_id=${activeStoreId}&t=${Date.now()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (prefRes.ok) {
        const prefData = await prefRes.json();
        if (Array.isArray(prefData.hiddenColumns)) {
          setHiddenColumns(prefData.hiddenColumns);
          localStorage.setItem('reports_hidden_columns', JSON.stringify(prefData.hiddenColumns));
        }
      }
    } catch (err) {
      console.warn('Failed to fetch DB report column preferences:', err);
    }

    // 2. Fetch saved report views
    try {
      const viewsRes = await fetch(`/api/stores/${activeStoreId}/views?type=reports&t=${Date.now()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (viewsRes.ok) {
        const viewsData = await viewsRes.json();
        setSavedViews(Array.isArray(viewsData) ? viewsData : []);
      }
    } catch (err) {
      console.warn('Failed to fetch saved report views:', err);
    }
  }, [activeStoreId]);

  useEffect(() => {
    fetchReportPreferencesAndViews();
  }, [fetchReportPreferencesAndViews]);

  const saveReportView = useCallback(async (nameParam, isDefaultParam = false) => {
    const viewName = (typeof nameParam === 'string' && nameParam.trim()) ? nameParam.trim() : reportViewName.trim();
    if (!viewName || !activeStoreId) {
      if (typeof toast === 'function') toast('Please enter a view name', 'warning');
      return;
    }
    const isLocked = typeof isDefaultParam === 'boolean' ? isDefaultParam : isReportViewLocked;

    try {
      const res = await fetch(`/api/stores/${activeStoreId}/views`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('trace_token') || ''}`
        },
        body: JSON.stringify({
          view_name: viewName,
          view_type: 'reports',
          column_config: hiddenColumns,
          is_locked: isLocked ? 1 : 0
        })
      });
      if (res.ok) {
        if (typeof toast === 'function') toast(`✅ Saved Custom View "${viewName}"`, 'success');
        setShowSaveViewModal(false);
        setReportViewName('');
        await fetchReportPreferencesAndViews();
      } else {
        const data = await res.json();
        if (typeof toast === 'function') toast(`❌ Failed to save view: ${data.error || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      if (typeof toast === 'function') toast('Failed to save custom view: ' + err.message, 'error');
    }
  }, [reportViewName, activeStoreId, hiddenColumns, isReportViewLocked, fetchReportPreferencesAndViews, toast]);

  const applyReportView = useCallback((target) => {
    if (!target) {
      setSelectedReportViewId('');
      return;
    }
    let viewObj = target;
    if (typeof target === 'number' || typeof target === 'string') {
      viewObj = savedViews.find(v => String(v.id) === String(target));
    }
    if (!viewObj) return;

    try {
      const cols = typeof viewObj.column_config === 'string' ? JSON.parse(viewObj.column_config) : viewObj.column_config;
      if (Array.isArray(cols)) {
        setHiddenColumns(cols);
        setSelectedReportViewId(String(viewObj.id));
        if (typeof toast === 'function') toast(`👁️ Applied Custom View "${viewObj.view_name}"`, 'info');
      }
    } catch (e) {
      if (typeof toast === 'function') toast('Error parsing view configuration', 'error');
    }
  }, [savedViews, toast]);

  const deleteReportView = useCallback(async (viewId) => {
    if (!viewId || !activeStoreId) return;
    if (!window.confirm('Delete this custom view?')) return;
    try {
      const res = await fetch(`/api/stores/${activeStoreId}/views/${viewId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('trace_token') || ''}`
        }
      });
      if (res.ok) {
        toast('🗑️ Custom view deleted', 'info');
        setSelectedReportViewId('');
        fetchReportPreferencesAndViews();
      } else {
        const data = await res.json();
        toast(`❌ Delete failed: ${data.error || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      toast('Delete failed: ' + err.message, 'error');
    }
  }, [activeStoreId, fetchReportPreferencesAndViews, toast]);

  const fetchData = useCallback(async () => {
    if (!activeStoreId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/daily?store_id=${activeStoreId}&t=${Date.now()}`);
      if (!res.ok) throw new Error('Failed to fetch data');
      const data = await res.json();
      setDailyData(data);
    } catch (e) {
      toast('Error loading reports: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [activeStoreId, toast]);

  const fetchSnapshots24h = useCallback(async () => {
    if (!activeStoreId) return;
    try {
      const res = await fetch(`/api/reports/snapshots-24h?store_id=${activeStoreId}&t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.snapshots) setSnapshots24h(data.snapshots);
      }
    } catch (_) {}
  }, [activeStoreId]);

  useEffect(() => {
    fetchData();
    fetchSnapshots24h();
  }, [fetchData, fetchSnapshots24h]);

  const handleMetricChange = async (date, field, value) => {
    const numValue = parseFloat(value) || 0;
    setDailyData(prev => prev.map(row => {
      if (row.date === date) {
        const updated = { ...row, [field]: numValue };
        const totalMarketing = (updated.marketingSpend || 0) + (updated.tiktokMarketing || 0);
        updated.pnl = updated.grossProfit - totalMarketing - updated.hybridCourier - (updated.actualExp || 0);
        
        const actualGrossProfit = (updated.paymentPaid || 0) - (updated.cgs || 0);
        updated.actualPnl = actualGrossProfit - totalMarketing - updated.hybridCourier - (updated.actualExp || 0);

        updated.marPercent = updated.deliveredSale > 0 ? (totalMarketing / updated.deliveredSale) * 100 : 0;
        const landedOrders = updated.landedOrders || 0;
        updated.cpaAvg = landedOrders > 0 ? (totalMarketing / landedOrders) : 0;
        const netOrders = landedOrders - (updated.cancelations || 0);
        updated.netCpaAvg = netOrders > 0 ? (totalMarketing / netOrders) : 0;
        return updated;
      }
      return row;
    }));

    try {
      const row = dailyData.find(r => r.date === date);
      const payload = {
        store_id: activeStoreId,
        date: date,
        marketing_spend: field === 'marketingSpend' ? numValue : (row.marketingSpend || 0),
        tiktok_marketing: field === 'tiktokMarketing' ? numValue : (row.tiktokMarketing || 0),
        actual_exp: field === 'actualExp' ? numValue : (row.actualExp || 0),
        diff_correction: field === 'diffCorrection' ? numValue : (row.diffCorrection || 0)
      };
      await fetch(`/api/reports/metrics?t=${Date.now()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      toast('Error saving: ' + e.message, 'error');
      fetchData();
    }
  };

  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkMetric, setBulkMetric] = useState('marketingSpend');
  const [bulkData, setBulkData] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);

  const handleBulkMetricUpdate = async (field, updates) => {
    const fieldMapping = {
      marketingSpend: 'marketing_spend',
      tiktokMarketing: 'tiktok_marketing',
      actualExp: 'actual_exp',
      diffCorrection: 'diff_correction'
    };

    const dbField = fieldMapping[field];
    if (!dbField) return;

    setDailyData(prev => prev.map(row => {
      const update = updates.find(u => u.date === row.date);
      if (update) {
        const numValue = parseFloat(update.value) || 0;
        const updated = { ...row, [field]: numValue };
        const totalMarketing = (updated.marketingSpend || 0) + (updated.tiktokMarketing || 0);
        updated.pnl = updated.grossProfit - totalMarketing - updated.hybridCourier - (updated.actualExp || 0);
        
        const actualGrossProfit = (updated.paymentPaid || 0) - (updated.cgs || 0);
        updated.actualPnl = actualGrossProfit - totalMarketing - updated.hybridCourier - (updated.actualExp || 0);

        updated.marPercent = updated.deliveredSale > 0 ? (totalMarketing / updated.deliveredSale) * 100 : 0;
        const landedOrders = updated.landedOrders || 0;
        updated.cpaAvg = landedOrders > 0 ? (totalMarketing / landedOrders) : 0;
        const netOrders = landedOrders - (updated.cancelations || 0);
        updated.netCpaAvg = netOrders > 0 ? (totalMarketing / netOrders) : 0;
        return updated;
      }
      return row;
    }));

    try {
      const res = await fetch(`/api/reports/bulk-metrics?t=${Date.now()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: activeStoreId, metric_field: dbField, updates })
      });
      if (!res.ok) throw new Error('Failed to save bulk');
      toast(`Successfully synced ${updates.length} rows`, 'success');
    } catch (e) {
      toast('Error saving bulk: ' + e.message, 'error');
      fetchData();
    }
  };

  const processBulkSync = async () => {
    const lines = bulkData.split(/\r?\n/).map(l => l.trim()).filter(l => l !== '');
    if (lines.length === 0) return toast("No data found", "error");

    setBulkLoading(true);
    const currentData = view === 'daily' ? filteredDaily : monthlyData;
    const updates = [];
    
    for (let i = 0; i < lines.length; i++) {
      if (i < currentData.length) {
        const rawVal = lines[i].replace(/[^0-9.]/g, '');
        const numValue = parseFloat(rawVal);
        if (!isNaN(numValue)) {
          updates.push({
            date: currentData[i].date,
            value: numValue
          });
        }
      }
    }

    if (updates.length > 0) {
      await handleBulkMetricUpdate(bulkMetric, updates);
      setShowBulkModal(false);
      setBulkData('');
    } else {
      toast("No valid numbers found", "error");
    }
    setBulkLoading(false);
  };

  const handlePaste = (e, startDate, field) => {
    const text = e.clipboardData.getData('text');
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l !== '');
    if (lines.length <= 1) return; 
    
    e.preventDefault();
    const currentData = view === 'daily' ? filteredDaily : monthlyData;
    const startIndex = currentData.findIndex(r => r.date === startDate);
    if (startIndex === -1) return toast("Error: Start date not found", "error");

    const updates = [];
    for (let i = 0; i < lines.length; i++) {
      const rowIndex = startIndex + i;
      if (rowIndex < currentData.length) {
        const rawVal = lines[i].replace(/[^0-9.]/g, '');
        const numValue = parseFloat(rawVal);
        if (!isNaN(numValue)) {
          updates.push({ date: currentData[rowIndex].date, value: numValue });
        }
      }
    }

    if (updates.length > 0) {
      toast(`Pasting ${updates.length} values...`, 'info');
      handleBulkMetricUpdate(field, updates);
    }
  };

  const sortData = (data, config) => {
    if (!config.key) return data;
    return [...data].sort((a, b) => {
      let valA = a[config.key];
      let valB = b[config.key];
      if (config.key === 'date' && !a.date && a.month) valA = a.month;
      if (config.key === 'date' && !b.date && b.month) valB = b.month;
      if (valA < valB) return config.direction === 'asc' ? -1 : 1;
      if (valA > valB) return config.direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const monthlyData = useMemo(() => {
    const sourceData = dailyData.filter(r => isInRange(r.date));
    const rawMonthly = Object.values(sourceData.reduce((acc, row) => {
      const month = row.date.substring(0, 7);
      if (!acc[month]) {
        acc[month] = {
          month, deliveredSale: 0, cgs: 0, marketingSpend: 0, tiktokMarketing: 0,
          estCourier: 0, actualCourier: 0, hybridCourier: 0, actualExp: 0, landedOrders: 0, cancelations: 0,
          pending: 0, booked: 0, totalDispatched: 0, delivered: 0, restock: 0, missingParcel: 0,
          intransit: 0, cashInTransit: 0, withoutTrackingId: 0,
          paymentPaid: 0, diffCorrection: 0, deliveredPaymentPending: 0, totalSale: 0, costGaps: 0, unpaidAmount: 0, overduePayoutCount: 0,
          zeroExpenseCount: 0, ordersWithFailedAttempts: 0, failedButDelivered: 0, prepaidOrders: 0, claimOrders: 0, whatsappOrders: 0,
          whatsappTotalSale: 0, whatsappDelivered: 0, whatsappReturned: 0, whatsappDeliveredSale: 0, whatsappCgs: 0, whatsappCourier: 0,
          surplusPayout: 0, surplusPayoutCount: 0
        };
      }
      const m = acc[month];
      m.deliveredSale += row.deliveredSale || 0;
      m.cgs += row.cgs || 0;
      m.marketingSpend += row.marketingSpend || 0;
      m.tiktokMarketing += row.tiktokMarketing || 0;
      m.estCourier += row.estCourier || 0;
      m.actualCourier += row.actualCourier || 0;
      m.hybridCourier += row.hybridCourier || 0;
      m.actualExp += row.actualExp || 0;
      m.landedOrders += row.landedOrders || 0;
      m.cancelations += row.cancelations || 0;
      m.pending += row.pending || 0;
      m.booked += row.booked || 0;
      m.totalDispatched += row.totalDispatched || 0;
      m.delivered += row.delivered || 0;
      m.restock += row.restock || 0;
      m.missingParcel += row.missingParcel || 0;
      m.intransit += row.intransit || 0;
      m.cashInTransit += row.cashInTransit || 0;
      m.withoutTrackingId += row.withoutTrackingId || 0;
      m.paymentPaid += row.paymentPaid || 0;
      m.diffCorrection += row.diffCorrection || 0;
      m.deliveredPaymentPending += row.deliveredPaymentPending || 0;
      m.costGaps += row.costGaps || 0;
      m.unpaidAmount += row.unpaidAmount || 0;
      m.overduePayoutCount += row.overduePayoutCount || 0;
      m.zeroExpenseCount += row.zeroExpenseCount || 0;
      m.ordersWithFailedAttempts += row.ordersWithFailedAttempts || 0;
      m.failedButDelivered += row.failedButDelivered || 0;
      m.prepaidOrders += row.prepaidOrders || 0;
      m.claimOrders += row.claimOrders || 0;
      m.whatsappOrders += row.whatsappOrders || 0;
      m.whatsappTotalSale += row.whatsappTotalSale || 0;
      m.whatsappDelivered += row.whatsappDelivered || 0;
      m.whatsappReturned += row.whatsappReturned || 0;
      m.whatsappDeliveredSale += row.whatsappDeliveredSale || 0;
      m.whatsappCgs += row.whatsappCgs || 0;
      m.whatsappCourier += row.whatsappCourier || 0;
      m.surplusPayout += row.surplusPayout || 0;
      m.surplusPayoutCount += row.surplusPayoutCount || 0;
      const totalMarketing = (row.marketingSpend || 0) + (row.tiktokMarketing || 0);
      m.totalSale += (row.roasMeta * totalMarketing);
      return acc;
    }, {})).map(m => {
      const totalMarketing = m.marketingSpend + m.tiktokMarketing;

      // 📊 TAX_PAID: 4% sales tax on monthly delivered sale. Source: m.deliveredSale
      const taxPaid = m.deliveredSale * 0.04; // TAX_RATE = 0.04

      // 📊 GROSS_PROFIT: Monthly delivered revenue minus CGS. Source: m.deliveredSale, m.cgs
      const grossProfit = m.deliveredSale - m.cgs;

      // 📊 FINAL_PNL: Estimated monthly net profit using hybrid courier.
      //    Formula: Gross Profit - Ad Spend - Hybrid Courier - Manual Expenses
      //    Source: grossProfit, totalMarketing, m.hybridCourier, m.actualExp
      const pnl = grossProfit - totalMarketing - m.hybridCourier - m.actualExp;

      // 📊 ACTUAL_PNL (CASH): Real cash monthly profit using bank payouts + actual courier fees.
      //    Formula: (Payouts Received - CGS) - Ad Spend - Actual Courier - Manual Expenses
      //    Source: m.paymentPaid, m.cgs, totalMarketing, m.actualCourier, m.actualExp
      //    ⚠️  Uses m.actualCourier (NOT m.hybridCourier) — reflects real reconciled cash out only
      const actualGrossProfit = m.paymentPaid - m.cgs;
      const actualPnl = actualGrossProfit - totalMarketing - m.actualCourier - m.actualExp;

      const landedOrders = m.landedOrders || 0;
      const netOrders = landedOrders - m.cancelations;
      const delPercent = m.totalDispatched > 0 ? (m.delivered / m.totalDispatched) * 100 : 0;
      const canPercent = landedOrders > 0 ? (m.cancelations / landedOrders) * 100 : 0;

      // 📊 PREPAID_PCT: Monthly percentage of dispatched orders that are prepaid. Source: m.prepaidOrders, m.totalDispatched
      const prepaidPercent = m.totalDispatched > 0 ? ((m.prepaidOrders || 0) / m.totalDispatched) * 100 : 0;
      // 📊 WHATSAPP_PCT: Monthly percentage of dispatched orders that are WhatsApp-tagged. Source: m.whatsappOrders, m.totalDispatched
      const whatsappPercent = m.totalDispatched > 0 ? ((m.whatsappOrders || 0) / m.totalDispatched) * 100 : 0;
      // 📊 WHATSAPP_DEL_PCT: Monthly delivery percentage of WhatsApp-tagged orders. Source: m.whatsappDelivered, m.whatsappOrders
      const whatsappDelPercent = (m.whatsappOrders || 0) > 0 ? (m.whatsappDelivered / m.whatsappOrders) * 100 : 0;
      // 📊 WHATSAPP_RET_PCT: Monthly return percentage of WhatsApp-tagged orders. Source: m.whatsappReturned, m.whatsappOrders
      const whatsappRetPercent = (m.whatsappOrders || 0) > 0 ? (m.whatsappReturned / m.whatsappOrders) * 100 : 0;
      // 📊 WHATSAPP_AOV: Monthly Average Order Value of delivered WhatsApp orders. Source: m.whatsappDeliveredSale, m.whatsappDelivered
      const whatsappAov = (m.whatsappDelivered || 0) > 0 ? (m.whatsappDeliveredSale / m.whatsappDelivered) : 0;
      // 📊 WHATSAPP_AVG_CGS: Monthly Average CGS per delivered WhatsApp order. Source: m.whatsappCgs, m.whatsappDelivered
      const whatsappAvgCgs = (m.whatsappDelivered || 0) > 0 ? (m.whatsappCgs / m.whatsappDelivered) : 0;
      // 📊 WHATSAPP_AVG_COURIER: Monthly Average courier fee per delivered WhatsApp order. Source: m.whatsappCourier, m.whatsappDelivered
      const whatsappAvgCourier = (m.whatsappDelivered || 0) > 0 ? (m.whatsappCourier / m.whatsappDelivered) : 0;

      const finalRow = { 
        ...m, date: m.month, 
        aov: m.delivered > 0 ? (m.deliveredSale / m.delivered) : 0,
        cgsPercent: m.deliveredSale > 0 ? (m.cgs / m.deliveredSale) * 100 : 0,
        taxPaid, grossProfit, 
        marPercent: m.deliveredSale > 0 ? (totalMarketing / m.deliveredSale) * 100 : 0,
        pnl, 
        actualPnl,
        canPercent,
        delPercent,
        prepaidPercent,
        whatsappPercent,
        whatsappDelPercent,
        whatsappRetPercent,
        whatsappTotalSale: m.whatsappTotalSale || 0,
        whatsappDeliveredSale: m.whatsappDeliveredSale || 0,
        whatsappAov,
        whatsappCgs: m.whatsappCgs || 0,
        whatsappAvgCgs,
        whatsappCourier: m.whatsappCourier || 0,
        whatsappAvgCourier,
        roasMeta: totalMarketing > 0 ? (m.totalSale / totalMarketing) : 0,
        deliveredRoas: totalMarketing > 0 ? (m.deliveredSale / totalMarketing) : 0,
        ndrRecoveryRate: m.ordersWithFailedAttempts > 0 ? (m.failedButDelivered / m.ordersWithFailedAttempts) * 100 : 0,
        cpaAvg: landedOrders > 0 ? (totalMarketing / landedOrders) : 0,
        netCpaAvg: netOrders > 0 ? (totalMarketing / netOrders) : 0,
        courierDiff: m.actualCourier - m.estCourier,
        mathCounter: landedOrders - ((m.cancelations || 0) + (m.pending || 0) + (m.booked || 0) + (m.delivered || 0) + (m.restock || 0) + (m.missingParcel || 0))
      };

      // 📊 24-HOUR DELTA COMPUTATION: Compare current monthly metrics against 24h baseline snapshot
      const prev24h = snapshots24h[m.month];
      const deltas24h = {};
      if (prev24h) {
        Object.keys(finalRow).forEach(k => {
          if (typeof finalRow[k] === 'number') {
            const curVal = finalRow[k] || 0;
            const prevVal = prev24h[k] !== undefined ? prev24h[k] : (prev24h[k === 'prepaidOrders' ? 'prepaid' : k] !== undefined ? prev24h[k === 'prepaidOrders' ? 'prepaid' : k] : curVal);
            const diff = curVal - prevVal;
            if (Math.abs(diff) >= (k.toLowerCase().includes('percent') ? 0.01 : 1)) {
              deltas24h[k] = { diff, prevVal, curVal };
            }
          }
        });
      }

      return { 
        ...finalRow,
        deltas24h
      };
    });
    return sortData(rawMonthly, sortConfig);
  }, [dailyData, isInRange, sortConfig, snapshots24h]);

  // Auto-post today's monthly snapshot to backend for future 24h comparisons
  useEffect(() => {
    if (monthlyData && monthlyData.length > 0 && activeStoreId) {
      fetch('/api/reports/snapshots-24h', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: activeStoreId, monthlyData })
      }).catch(() => {});
    }
  }, [monthlyData, activeStoreId]);

  const summaryRow = useMemo(() => {
    const dataset = view === 'daily' ? filteredDaily : monthlyData;
    if (!dataset || dataset.length === 0) return null;

    const totals = {
      date: '📊 TOTAL / AVERAGE',
      month: '📊 TOTAL / AVERAGE',
      isSummaryRow: true,
      deliveredSale: 0, cgs: 0, marketingSpend: 0, tiktokMarketing: 0,
      estCourier: 0, actualCourier: 0, hybridCourier: 0, actualExp: 0, landedOrders: 0, cancelations: 0,
      pending: 0, booked: 0, totalDispatched: 0, delivered: 0, restock: 0, missingParcel: 0,
      intransit: 0, cashInTransit: 0, withoutTrackingId: 0,
      paymentPaid: 0, diffCorrection: 0, deliveredPaymentPending: 0, totalSale: 0, costGaps: 0, unpaidAmount: 0, overduePayoutCount: 0,
      zeroExpenseCount: 0, ordersWithFailedAttempts: 0, failedButDelivered: 0, prepaidOrders: 0, claimOrders: 0, whatsappOrders: 0,
      whatsappTotalSale: 0, whatsappDelivered: 0, whatsappReturned: 0, whatsappDeliveredSale: 0, whatsappCgs: 0, whatsappCourier: 0,
      surplusPayout: 0, surplusPayoutCount: 0
    };

    dataset.forEach(row => {
      totals.deliveredSale += row.deliveredSale || 0;
      totals.cgs += row.cgs || 0;
      totals.marketingSpend += row.marketingSpend || 0;
      totals.tiktokMarketing += row.tiktokMarketing || 0;
      totals.estCourier += row.estCourier || 0;
      totals.actualCourier += row.actualCourier || 0;
      totals.hybridCourier += row.hybridCourier || 0;
      totals.actualExp += row.actualExp || 0;
      totals.landedOrders += row.landedOrders || 0;
      totals.cancelations += row.cancelations || 0;
      totals.pending += row.pending || 0;
      totals.booked += row.booked || 0;
      totals.totalDispatched += row.totalDispatched || 0;
      totals.delivered += row.delivered || 0;
      totals.restock += row.restock || 0;
      totals.missingParcel += row.missingParcel || 0;
      totals.intransit += row.intransit || 0;
      totals.cashInTransit += row.cashInTransit || 0;
      totals.withoutTrackingId += row.withoutTrackingId || 0;
      totals.paymentPaid += row.paymentPaid || 0;
      totals.diffCorrection += row.diffCorrection || 0;
      totals.deliveredPaymentPending += row.deliveredPaymentPending || 0;
      totals.totalSale += row.totalSale || 0;
      totals.costGaps += row.costGaps || 0;
      totals.unpaidAmount += row.unpaidAmount || 0;
      totals.overduePayoutCount += row.overduePayoutCount || 0;
      totals.zeroExpenseCount += row.zeroExpenseCount || 0;
      totals.ordersWithFailedAttempts += row.ordersWithFailedAttempts || 0;
      totals.failedButDelivered += row.failedButDelivered || 0;
      totals.prepaidOrders += row.prepaidOrders || 0;
      totals.claimOrders += row.claimOrders || 0;
      totals.whatsappOrders += row.whatsappOrders || 0;
      totals.whatsappTotalSale += row.whatsappTotalSale || 0;
      totals.whatsappDelivered += row.whatsappDelivered || 0;
      totals.whatsappReturned += row.whatsappReturned || 0;
      totals.whatsappDeliveredSale += row.whatsappDeliveredSale || 0;
      totals.whatsappCgs += row.whatsappCgs || 0;
      totals.whatsappCourier += row.whatsappCourier || 0;
      totals.surplusPayout += row.surplusPayout || 0;
      totals.surplusPayoutCount += row.surplusPayoutCount || 0;
    });

    const totalMarketing = totals.marketingSpend + totals.tiktokMarketing;
    const taxPaid = totals.deliveredSale * 0.04;
    const grossProfit = totals.deliveredSale - totals.cgs;
    const pnl = grossProfit - totalMarketing - totals.hybridCourier - totals.actualExp;
    const actualGrossProfit = totals.paymentPaid - totals.cgs;
    const actualPnl = actualGrossProfit - totalMarketing - totals.actualCourier - totals.actualExp;
    const landedOrders = totals.landedOrders || 0;
    const netOrders = landedOrders - totals.cancelations;

    return {
      ...totals,
      aov: totals.delivered > 0 ? (totals.deliveredSale / totals.delivered) : 0,
      cgsPercent: totals.deliveredSale > 0 ? (totals.cgs / totals.deliveredSale) * 100 : 0,
      taxPaid,
      grossProfit,
      marPercent: totals.deliveredSale > 0 ? (totalMarketing / totals.deliveredSale) * 100 : 0,
      pnl,
      actualPnl,
      canPercent: landedOrders > 0 ? (totals.cancelations / landedOrders) * 100 : 0,
      delPercent: totals.totalDispatched > 0 ? (totals.delivered / totals.totalDispatched) * 100 : 0,
      prepaidPercent: totals.totalDispatched > 0 ? ((totals.prepaidOrders || 0) / totals.totalDispatched) * 100 : 0,
      whatsappPercent: totals.totalDispatched > 0 ? ((totals.whatsappOrders || 0) / totals.totalDispatched) * 100 : 0,
      whatsappDelPercent: totals.whatsappOrders > 0 ? (totals.whatsappDelivered / totals.whatsappOrders) * 100 : 0,
      whatsappRetPercent: totals.whatsappOrders > 0 ? (totals.whatsappReturned / totals.whatsappOrders) * 100 : 0,
      whatsappAov: totals.whatsappDelivered > 0 ? (totals.whatsappDeliveredSale / totals.whatsappDelivered) : 0,
      whatsappAvgCgs: totals.whatsappDelivered > 0 ? (totals.whatsappCgs / totals.whatsappDelivered) : 0,
      whatsappAvgCourier: totals.whatsappDelivered > 0 ? (totals.whatsappCourier / totals.whatsappDelivered) : 0,
      roasMeta: totalMarketing > 0 ? (totals.totalSale / totalMarketing) : 0,
      deliveredRoas: totalMarketing > 0 ? (totals.deliveredSale / totalMarketing) : 0,
      ndrRecoveryRate: totals.ordersWithFailedAttempts > 0 ? (totals.failedButDelivered / totals.ordersWithFailedAttempts) * 100 : 0,
      cpaAvg: landedOrders > 0 ? (totalMarketing / landedOrders) : 0,
      netCpaAvg: netOrders > 0 ? (totalMarketing / netOrders) : 0,
      courierDiff: totals.actualCourier - totals.estCourier,
      mathCounter: landedOrders - ((totals.cancelations || 0) + (totals.pending || 0) + (totals.booked || 0) + (totals.delivered || 0) + (totals.restock || 0) + (totals.missingParcel || 0))
    };
  }, [view, filteredDaily, monthlyData]);

  const requestSort = (key) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') direction = 'asc';
    setSortConfig({ key, direction });
  };

  const toggleColumn = (colId) => {
    setHiddenColumns(prev => prev.includes(colId) ? prev.filter(c => c !== colId) : [...prev, colId]);
  };

  return {
    loading,
    view,
    setView,
    datePreset,
    setDatePreset,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    showCustom,
    setShowCustom,
    activeDateRange,
    hiddenColumns,
    setHiddenColumns,
    sortConfig,
    showColPicker,
    setShowColPicker,
    showBulkModal,
    setShowBulkModal,
    bulkMetric,
    setBulkMetric,
    bulkData,
    setBulkData,
    bulkLoading,
    processBulkSync,
    handleMetricChange,
    handlePaste,
    monthlyData,
    filteredDaily,
    summaryRow,
    requestSort,
    toggleColumn,
    fetchData,
    tableLayout,
    setTableLayout,
    savedViews,
    setSavedViews,
    selectedReportViewId,
    activeSavedView: selectedReportViewId,
    setSelectedReportViewId,
    showSaveViewModal,
    setShowSaveViewModal,
    reportViewName,
    setReportViewName,
    isReportViewLocked,
    setIsReportViewLocked,
    saveReportView,
    applyReportView,
    deleteReportView
  };
}
