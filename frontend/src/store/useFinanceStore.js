import { create } from 'zustand';

export const useFinanceStore = create((set, get) => ({
  pasteData: '',
  masterKey: 'Match by Tracking Number',
  syncToShopify: true,
  isProcessing: false,
  currentTaskId: null,
  sessionId: null,
  results: [],
  summary: null,
  history: [],
  loadingHistory: false,

  // Legacy Repair State
  couriers: [],
  selectedCourier: 'All Inactive',
  daysOld: 60,
  isRepairing: false,
  repairResult: null,
  forceUnpaidAsReturned: false,

  // Product Costs Recovery State
  ghostProducts: [],
  productCosts: {},
  isScanning: false,
  isHealing: false,

  // Recovery Alert
  interruptedSession: null,

  setPasteData: (val) => set({ pasteData: val }),
  setMasterKey: (val) => set({ masterKey: val }),
  setSyncToShopify: (val) => set({ syncToShopify: val }),
  setResults: (val) => set({ results: typeof val === 'function' ? val(get().results) : val }),
  setSummary: (val) => set({ summary: val }),
  setSelectedCourier: (val) => set({ selectedCourier: val }),
  setDaysOld: (val) => set({ daysOld: val }),
  setForceUnpaidAsReturned: (val) => set({ forceUnpaidAsReturned: val }),
  setProductCosts: (val) => set({ productCosts: typeof val === 'function' ? val(get().productCosts) : val }),
  setGhostProducts: (val) => set({ ghostProducts: val }),
  setInterruptedSession: (val) => set({ interruptedSession: val }),

  fetchHistory: async (activeStoreId) => {
    if (!activeStoreId) return;
    set({ loadingHistory: true });
    try {
      const res = await fetch(`/api/finance/reconciliation-history?store_id=${activeStoreId}`);
      const data = await res.json();
      set({ history: data });
    } catch (e) {
      console.error('Failed to fetch history', e);
    } finally {
      set({ loadingHistory: false });
    }
  },

  fetchCouriers: async (activeStoreId) => {
    if (!activeStoreId) return;
    try {
      const res = await fetch(`/api/finance/couriers?store_id=${activeStoreId}`);
      const data = await res.json();
      if (Array.isArray(data)) set({ couriers: data });
      else set({ couriers: [] });
    } catch (e) {
      console.error('Failed to fetch couriers', e);
      set({ couriers: [] });
    }
  },

  // Check if there is an interrupted (Pending) session in the database
  checkInterruptedSession: async (activeStoreId) => {
    if (!activeStoreId) return;
    try {
      const res = await fetch(`/api/finance/session/active?store_id=${activeStoreId}`);
      const data = await res.json();
      if (data.active) {
        set({ interruptedSession: data.session });
      } else {
        set({ interruptedSession: null });
      }
    } catch (e) {
      console.error('Failed to check interrupted session', e);
    }
  },

  // Discard the interrupted session
  discardInterruptedSession: async () => {
    const { interruptedSession } = get();
    if (!interruptedSession) return;
    try {
      await fetch('/api/finance/session/discard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: interruptedSession.id })
      });
      set({ interruptedSession: null });
    } catch (e) {
      console.error('Failed to discard session', e);
    }
  },

  // Resume interrupted session
  resumeSession: (activeStoreId, addToast) => {
    const { interruptedSession } = get();
    if (!interruptedSession) return;

    const rawData = interruptedSession.raw_data || '';
    const sid = interruptedSession.id;
    const processedRecords = interruptedSession.processed_records || [];

    // Load the raw pasted Excel data and sessionId into state
    set({
      pasteData: rawData,
      sessionId: sid,
      interruptedSession: null // Clear the alert
    });

    // Run handleProcess with the resumption data
    get().handleProcess(activeStoreId, addToast, sid, processedRecords);
  },

  handleProcess: async (activeStoreId, addToast, existingSessionId = null, processedRecords = []) => {
    if (!activeStoreId) return alert('No active store selected');
    
    // If we have an existing session, we use its paste data. Otherwise use current state
    const dataToParse = get().pasteData;
    const lines = dataToParse.split('\n').filter(l => l.trim());
    if (lines.length === 0) return alert('No data pasted');

    const parsedRows = [];
    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split('\t');
      if (parts.length < 5) continue;
      
      const orderIdStr = String(parts[0] || '').toLowerCase();
      if (orderIdStr.includes('order id') || orderIdStr.includes('tracking')) continue;

      parsedRows.push({
        orderId: parts[0] ? parts[0].trim() : '',
        trackingNumber: parts[1] ? parts[1].trim() : '',
        type: parts[2] ? parts[2].trim().charAt(0).toUpperCase() : '',
        codAmount: parseFloat(parts[3]) || 0,
        charges: parseFloat(parts[4]) || 0,
        ref: parts[5] ? parts[5].trim() : '',
        date: parts[6] ? parts[6].trim() : ''
      });
    }

    if (parsedRows.length === 0) {
      return alert('Could not parse any valid rows.');
    }

    // Determine which rows to process: if resuming, filter out already processed rows
    let rowsToProcess = [...parsedRows];
    let initialResults = [];
    let initialSummary = { processedCount: 0, ghostCount: 0, auditCount: 0 };

    if (existingSessionId && processedRecords.length > 0) {
      // Find rows that haven't been processed yet
      rowsToProcess = parsedRows.filter(row => {
        const isProcessed = processedRecords.some(pr => 
          (pr.trackingNumber && String(pr.trackingNumber).toLowerCase() === String(row.trackingNumber).toLowerCase()) ||
          (pr.orderId && String(pr.orderId) === String(row.orderId))
        );
        if (isProcessed) {
          // Add to initial results as completed
          initialResults.push({
            ...row,
            status: '✅ Done (Resumed)',
            recommendation: 'ERP Updated (Pre-resumption)',
            netPayout: (parseFloat(row.codAmount) || 0) - (parseFloat(row.charges) || 0),
            courierName: 'Resumed',
            balance: 0,
            chargesTrick: 0,
            taxAddOn: 0,
            finalCharges: parseFloat(row.charges) || 0
          });
          initialSummary.processedCount += 1;
        }
        return !isProcessed;
      });
    }

    const taskId = `task-finance-${Date.now()}`;
    set({
      isProcessing: true,
      currentTaskId: taskId,
      summary: existingSessionId ? initialSummary : null,
      results: existingSessionId ? initialResults : [],
      sessionId: existingSessionId
    });

    try {
      const CHUNK_SIZE = 10;
      const chunks = [];
      for (let i = 0; i < rowsToProcess.length; i += CHUNK_SIZE) {
        chunks.push(rowsToProcess.slice(i, i + CHUNK_SIZE));
      }

      let allResults = [...initialResults];
      let finalSummary = { ...initialSummary };
      let currentSessionId = existingSessionId;

      for (let i = 0; i < chunks.length; i++) {
        const payload = {
          store_id: activeStoreId,
          rows: chunks[i],
          masterKey: get().masterKey,
          syncToShopify: get().syncToShopify,
          filename: `Pasted Batch (${new Date().toLocaleTimeString()})`,
          total_rows: parsedRows.length,
          raw_data: dataToParse
        };

        if (currentSessionId) {
          payload.session_id = currentSessionId;
        }

        const res = await fetch(`/api/finance/bulk-update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        
        let data = await res.json();

        if (data.success) {
          currentSessionId = data.sessionId;
          allResults = [...allResults, ...data.results];
          finalSummary.processedCount = data.summary.processedCount;
          finalSummary.ghostCount = data.summary.ghostCount;
          finalSummary.auditCount = data.summary.auditCount;
          
          set({
            results: [...allResults],
            summary: { ...finalSummary },
            sessionId: currentSessionId
          });
        } else {
          throw new Error(`Batch ${i+1}/${chunks.length} Error: ${data.error || 'Unknown'}`);
        }
      }

      set({ pasteData: '' });
      get().fetchHistory(activeStoreId);
      if (addToast) addToast('Payment reconciliation session completed!', 'success');
    } catch (e) {
      alert('Processing Error: ' + e.message);
    } finally {
      set({ isProcessing: false, currentTaskId: null });
    }
  },

  handleUndo: async (sessionId, activeStoreId) => {
    if (!window.confirm('Are you sure? This will revert all ERP changes.')) return;
    set({ isProcessing: true });
    try {
      const res = await fetch(`/api/finance/reconciliation-undo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
      });
      const data = await res.json();
      if (data.success) {
        alert(`Undo Successful! Reverted ${data.count} orders.`);
        get().fetchHistory(activeStoreId);
      } else {
        alert('Undo Failed: ' + data.error);
      }
    } catch (e) {
      alert('Network Error: ' + e.message);
    } finally {
      set({ isProcessing: false });
    }
  },

  handleCreateGhost: async (row, activeStoreId) => {
    try {
      const res = await fetch(`/api/finance/create-ghost-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: activeStoreId,
          tracking_number: row.trackingNumber,
          order_id_ref: row.orderId,
          amount: row.codAmount,
          courier_fee: row.charges,
          date: row.date
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('Ghost Buster: Order created in ERP!');
        set({
          results: get().results.map(r => r.trackingNumber === row.trackingNumber ? { ...r, status: '✅ Done (Ghost Recovered)' } : r)
        });
      } else {
        alert('Error: ' + data.error);
      }
    } catch (e) {
      alert('Network Error: ' + e.message);
    }
  },

  handleRepair: async (activeStoreId, addToast) => {
    if (!activeStoreId) return;
    set({ isRepairing: true, repairResult: null });
    try {
      const res = await fetch('/api/finance/repair-legacy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: activeStoreId,
          courier: get().selectedCourier,
          daysOld: get().daysOld,
          forceUnpaidAsReturned: get().forceUnpaidAsReturned
        })
      });
      const data = await res.json();
      if (data.success) {
        set({ repairResult: data });
        if (addToast) addToast(`Repair complete! Healed ${data.count} orders.`, 'success');
      } else {
        if (addToast) addToast(data.error || 'Repair failed', 'error');
      }
    } catch (e) {
      if (addToast) addToast('Repair failed: ' + e.message, 'error');
    } finally {
      set({ isRepairing: false });
    }
  },

  fetchMissingProducts: async (activeStoreId, addToast) => {
    if (!activeStoreId) return;
    set({ isScanning: true });
    try {
      const res = await fetch(`/api/finance/missing-product-list?store_id=${activeStoreId}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        set({ ghostProducts: data });
        if (data.length === 0 && addToast) addToast('No products with missing costs found!', 'info');
      } else {
        set({ ghostProducts: [] });
        if (addToast) addToast(data.error || 'Failed to scan products', 'error');
      }
    } catch (e) {
      console.error('Failed to fetch missing products', e);
      if (addToast) addToast('Failed to fetch product list', 'error');
      set({ ghostProducts: [] });
    } finally {
      set({ isScanning: false });
    }
  },

  applyBulkCosts: async (activeStoreId, addToast) => {
    const { productCosts } = get();
    if (!activeStoreId || Object.keys(productCosts).length === 0) return;
    set({ isHealing: true });
    try {
      const res = await fetch('/api/finance/apply-bulk-product-costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: activeStoreId, mappings: productCosts })
      });
      const data = await res.json();
      if (data.success) {
        if (addToast) addToast(`Successfully healed ${data.count} orders!`, 'success');
        set({ ghostProducts: [], productCosts: {} });
      } else {
        if (addToast) addToast(data.error || 'Healing failed', 'error');
      }
    } catch (e) {
      if (addToast) addToast('Healing error: ' + e.message, 'error');
    } finally {
      set({ isHealing: false });
    }
  }
}));
