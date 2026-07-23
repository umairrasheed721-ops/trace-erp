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

  useEffect(() => {
    localStorage.setItem('reports_table_layout', tableLayout);
  }, [tableLayout]);

  useEffect(() => {
    localStorage.setItem('reports_hidden_columns', JSON.stringify(hiddenColumns));
  }, [hiddenColumns]);

  useEffect(() => {
    localStorage.setItem('reports_sort_config', JSON.stringify(sortConfig));
  }, [sortConfig]);

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

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
          intransit: 0, cashInTransit: 0, fakeReturns: 0, withoutTrackingId: 0,
          paymentPaid: 0, diffCorrection: 0, deliveredPaymentPending: 0, totalSale: 0, costGaps: 0, unpaidAmount: 0, overduePayoutCount: 0,
          zeroExpenseCount: 0, ordersWithFailedAttempts: 0, failedButDelivered: 0
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
      m.fakeReturns += row.fakeReturns || 0;
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
      const totalMarketing = (row.marketingSpend || 0) + (row.tiktokMarketing || 0);
      m.totalSale += (row.roasMeta * totalMarketing);
      return acc;
    }, {})).map(m => {
      const totalMarketing = m.marketingSpend + m.tiktokMarketing;
      const taxPaid = m.deliveredSale * 0.04;
      const grossProfit = m.deliveredSale - m.cgs;
      const pnl = grossProfit - totalMarketing - m.hybridCourier - m.actualExp;
      
      const actualGrossProfit = m.paymentPaid - m.cgs;
      const actualPnl = actualGrossProfit - totalMarketing - m.hybridCourier - m.actualExp;

      const landedOrders = m.landedOrders || 0;
      const netOrders = landedOrders - m.cancelations;
      return { 
        ...m, date: m.month, 
        aov: m.delivered > 0 ? (m.deliveredSale / m.delivered) : 0,
        cgsPercent: m.deliveredSale > 0 ? (m.cgs / m.deliveredSale) * 100 : 0,
        taxPaid, grossProfit, 
        marPercent: m.deliveredSale > 0 ? (totalMarketing / m.deliveredSale) * 100 : 0,
        pnl, 
        actualPnl,
        canPercent: landedOrders > 0 ? (m.cancelations / landedOrders) * 100 : 0,
        delPercent: m.totalDispatched > 0 ? (m.delivered / m.totalDispatched) * 100 : 0,
        roasMeta: totalMarketing > 0 ? (m.totalSale / totalMarketing) : 0,
        deliveredRoas: totalMarketing > 0 ? (m.deliveredSale / totalMarketing) : 0,
        ndrRecoveryRate: m.ordersWithFailedAttempts > 0 ? (m.failedButDelivered / m.ordersWithFailedAttempts) * 100 : 0,
        cpaAvg: landedOrders > 0 ? (totalMarketing / landedOrders) : 0,
        netCpaAvg: netOrders > 0 ? (totalMarketing / netOrders) : 0,
        courierDiff: m.actualCourier - m.estCourier
      };
    });
    return sortData(rawMonthly, sortConfig);
  }, [dailyData, isInRange, sortConfig]);

  const filteredDaily = useMemo(() => {
    let data = dailyData.filter(r => isInRange(r.date));
    return sortData(data, sortConfig);
  }, [dailyData, isInRange, sortConfig]);

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
    requestSort,
    toggleColumn,
    fetchData,
    tableLayout,
    setTableLayout
  };
}
