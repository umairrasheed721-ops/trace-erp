import { useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useFinance } from '../context/FinanceContext'
import {
  parsePastedSheet,
  parseSpreadsheetFile,
  downloadSampleTemplate,
  exportRowsToCsv,
} from '../utils/financeParser'
import {
  HistoryDrilldownPanel,
  MissingCostsPanel,
  ConfirmActionModal,
} from '../components/Finance/FinanceSubPanels'

export default function FinanceManager() {
  const { addToast } = useApp()
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  const {
    pasteData, setPasteData,
    uploadFilename, setUploadFilename,
    masterKey, setMasterKey,
    syncToShopify, setSyncToShopify,
    allowDuplicates, setAllowDuplicates,
    isProcessing, isDryRunResult, currentTaskId,
    results,
    summary,
    history,
    loadingHistory,
    overview, fetchOverview,
    sessionDetail, loadingSessionDetail, fetchSessionDetail, handleResyncSessionNotes,
    couriers, selectedCourier, setSelectedCourier,
    daysOld, setDaysOld,
    isRepairing, repairResult,
    forceUnpaidAsReturned, setForceUnpaidAsReturned,
    ghostProducts,
    productCosts, setProductCosts,
    isScanning, isHealing,
    handleProcess, handleDryRun, handleAbort, handleRetryFailed,
    handleUndo, handleCreateGhost, handleBulkFixGhosts, clearResults,
    handleRepair, fetchMissingProducts, applyBulkCosts,
    syncTotal, syncProcessed, handleRemoveHistory,
  } = useFinance()

  const [activeTab, setActiveTab] = useState('reconcile') // reconcile | history | repair | ghosts
  const [resultFilter, setResultFilter] = useState('all') // all | done | variance | duplicates | ghosts | mismatches | errors
  const [resultSearch, setResultSearch] = useState('')
  const [historySearch, setHistorySearch] = useState('')
  const [selectedSessionId, setSelectedSessionId] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const [confirmModal, setConfirmModal] = useState(null)

  // Instant Pre-Run Preview Parser
  const preview = useMemo(() => parsePastedSheet(pasteData), [pasteData])

  // Filtered Results Log
  const filteredResults = useMemo(() => {
    const q = resultSearch.trim().toLowerCase()
    return results.filter(r => {
      const st = String(r.status || '')
      if (resultFilter === 'done' && !st.includes('✅') && !st.includes('🔍')) return false
      if (resultFilter === 'variance' && !r.hasVariance) return false
      if (resultFilter === 'duplicates' && !r.isDuplicate) return false
      if (resultFilter === 'ghosts' && !st.includes('GHOST')) return false
      if (resultFilter === 'mismatches' && !r.trackingMismatch) return false
      if (resultFilter === 'errors' && !st.includes('❌') && !st.includes('Invalid')) return false
      if (q) {
        const hay = `${r.orderId || ''} ${r.orderRef || ''} ${r.trackingNumber || ''} ${r.ref || ''} ${r.courierName || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [results, resultFilter, resultSearch])

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase()
    if (!q) return history
    return history.filter(s =>
      (s.filename || '').toLowerCase().includes(q) ||
      (s.cpr_references || '').toLowerCase().includes(q) ||
      String(s.id).includes(q)
    )
  }, [history, historySearch])

  const handleFilePicked = async (file) => {
    if (!file) return
    try {
      const tsv = await parseSpreadsheetFile(file)
      const parsed = parsePastedSheet(tsv)
      setPasteData(tsv)
      setUploadFilename(file.name)
      addToast(`📄 Loaded "${file.name}" — ${parsed.stats.totalRows} valid row(s) ready`, 'success')
    } catch (e) {
      addToast(`❌ Could not read file: ${e.message}`, 'error')
    }
  }

  const openInCommandCenter = (orderQuery) => {
    if (!orderQuery) return
    navigate(`/search?q=${encodeURIComponent(String(orderQuery).trim())}`)
  }

  const handleExportResults = () => {
    if (filteredResults.length === 0) return
    const headers = ['Order ID', 'ERP Ref', 'Tracking (Sheet)', 'Tracking (DB)', 'Type', 'Order Price', 'Paid COD', 'Variance', 'Charges', 'Net Payout', 'CPR Ref', 'Date', 'Status', 'Recommendation']
    const rows = filteredResults.map(r => [
      r.orderId || '',
      r.orderRef || '',
      r.trackingNumber || '',
      r.dbTracking || '',
      r.type || '',
      r.orderPrice || 0,
      r.codAmount || 0,
      r.variance || 0,
      r.charges || 0,
      r.netPayout || 0,
      r.ref || '',
      r.date || '',
      r.status || '',
      r.recommendation || '',
    ])
    exportRowsToCsv(headers, rows, `TRACE_Recon_Audit_${new Date().toISOString().slice(0, 10)}.csv`)
  }

  const counts = useMemo(() => ({
    ghosts: results.filter(r => String(r.status || '').includes('GHOST')).length,
    errors: results.filter(r => String(r.status || '').includes('❌') || String(r.status || '').includes('Invalid')).length,
    variances: results.filter(r => r.hasVariance).length,
    duplicates: results.filter(r => r.isDuplicate).length,
    mismatches: results.filter(r => r.trackingMismatch).length,
  }), [results])

  const TABS = [
    { id: 'reconcile', label: 'Quick Reconcile', icon: '⚡' },
    { id: 'history', label: `Upload History (${history.length})`, icon: '📜' },
    { id: 'repair', label: 'Legacy Repair', icon: '🛠️' },
    { id: 'ghosts', label: `Missing Costs${ghostProducts.length ? ` (${ghostProducts.length})` : ''}`, icon: '👻' },
  ]

  return (
    <div style={{ maxWidth: 1440, width: '100%', margin: '0 auto', paddingBottom: 32 }}>
      {/* ─── Header ─── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 13,
            background: 'linear-gradient(135deg, rgba(16,185,129,0.16), rgba(37,99,235,0.16))',
            border: '1px solid rgba(16,185,129,0.28)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem'
          }}>💰</div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 900, color: 'var(--text-primary)' }}>Finance &amp; Payments</h1>
            <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Reconcile COD payouts with duplicate guard, variance audit, upload drilldown &amp; missing cost recovery.
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={fetchOverview}
            style={{
              padding: '9px 13px', borderRadius: 10, cursor: 'pointer',
              background: 'var(--bg-surface)', border: '1px solid var(--border-bright)',
              color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.78rem',
            }}
          >🔄 Refresh KPIs</button>
          <button
            type="button"
            onClick={() => navigate('/payout-reconciler')}
            style={{
              padding: '9px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #2563eb, #4f46e5)',
              color: '#fff', fontWeight: 800, fontSize: '0.8rem',
              boxShadow: '0 4px 12px rgba(37,99,235,0.28)',
            }}
          >💸 Go to Payout Reconciler</button>
        </div>
      </div>

      {/* ─── Store Financial Health KPI Strip (Always Visible) ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, marginBottom: 18 }}>
        <HealthKpi
          icon="⏳"
          label="Unpaid Delivered Orders"
          value={overview ? `${overview.unpaid_delivered_count.toLocaleString()} orders` : '—'}
          sub={overview ? `Pending Rs. ${overview.unpaid_delivered_value.toLocaleString()}` : 'Loading...'}
          accent="#f59e0b"
          onClick={() => navigate('/search')}
        />
        <HealthKpi
          icon="⚠️"
          label="Payment Variances (>0.9 PKR)"
          value={overview ? `${overview.variance_count.toLocaleString()} orders` : '—'}
          sub={overview ? `Net Diff: Rs. ${overview.variance_net_diff.toLocaleString()}` : 'Rule 22 tolerance'}
          accent={overview?.variance_count > 0 ? '#ef4444' : '#10b981'}
          onClick={() => navigate('/search')}
        />
        <HealthKpi
          icon="🏦"
          label="30-Day Reconciled COD"
          value={overview ? `Rs. ${overview.reconciled_30d_cod.toLocaleString()}` : '—'}
          sub={overview ? `Fees: Rs. ${overview.reconciled_30d_fees.toLocaleString()} (${overview.reconciled_30d_orders} orders)` : 'Last 30 days'}
          accent="#10b981"
        />
        <HealthKpi
          icon="📜"
          label="Reconciliation Sessions"
          value={overview ? `${overview.total_sessions} batches` : `${history.length} batches`}
          sub={overview?.last_reconciled_at ? `Last: ${new Date(overview.last_reconciled_at).toLocaleDateString()}` : 'No uploads yet'}
          accent="#6366f1"
          onClick={() => setActiveTab('history')}
        />
      </div>

      {/* ─── Pill Navigation ─── */}
      <div style={{
        display: 'flex', gap: 6, flexWrap: 'wrap', padding: 6,
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 14, marginBottom: 18, width: 'fit-content'
      }}>
        {TABS.map(t => {
          const active = activeTab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: '8px 16px', borderRadius: 10, cursor: 'pointer',
                background: active ? 'rgba(37,99,235,0.12)' : 'transparent',
                color: active ? '#1d4ed8' : 'var(--text-secondary)',
                border: active ? '1px solid rgba(37,99,235,0.35)' : '1px solid transparent',
                fontWeight: active ? 800 : 600, fontSize: '0.82rem',
                display: 'inline-flex', alignItems: 'center', gap: 7,
              }}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          )
        })}
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* TAB 1: QUICK RECONCILE                                  */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeTab === 'reconcile' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 430px) minmax(0, 1fr)', gap: 20, alignItems: 'start' }}>
          {/* Left Panel: Upload / Paste & Controls */}
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 14,
            boxShadow: '0 2px 12px rgba(15,23,42,0.04)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>⚡ Quick Reconcile</h2>
              <button
                type="button"
                onClick={downloadSampleTemplate}
                style={{
                  padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                  color: 'var(--text-primary)', fontSize: '0.72rem', fontWeight: 700,
                }}
              >📥 Sample Excel</button>
            </div>

            {/* Match Key */}
            <div>
              <label style={labelStyle}>Master Match Key</label>
              <select
                value={masterKey}
                onChange={e => setMasterKey(e.target.value)}
                className="form-select"
                style={{ width: '100%' }}
              >
                <option value="Match by Tracking Number">🔍 Match by Tracking Number (Fallback: Order ID)</option>
                <option value="Match by Order ID">🏷️ Match by Order ID</option>
              </select>
            </div>

            {/* Toggles */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <ToggleCard
                active={syncToShopify}
                onClick={() => setSyncToShopify(!syncToShopify)}
                title={syncToShopify ? 'Sync to Shopify: ON' : 'Sync to Shopify: OFF'}
                subtitle={syncToShopify ? 'Captures payment, marks Delivered & appends Rule 23 note.' : 'ERP database updates only.'}
                activeColor="#059669"
              />
              <ToggleCard
                active={!allowDuplicates}
                onClick={() => setAllowDuplicates(!allowDuplicates)}
                title={!allowDuplicates ? 'Duplicate CPR Guard: ON (Safe)' : 'Duplicate CPR Guard: OFF (Force Overwrite)'}
                subtitle={!allowDuplicates ? 'Blocks re-reconciling the same CPR / order (Rule 25).' : 'Warning: Will allow re-processing existing CPR entries.'}
                activeColor="#2563eb"
              />
            </div>

            {/* Drag & Drop Excel / CSV File Upload */}
            <div
              onDragOver={e => { e.preventDefault(); setDragActive(true) }}
              onDragLeave={() => setDragActive(false)}
              onDrop={e => {
                e.preventDefault()
                setDragActive(false)
                handleFilePicked(e.dataTransfer.files?.[0])
              }}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `1.5px dashed ${dragActive ? '#2563eb' : 'var(--border-bright)'}`,
                background: dragActive ? 'rgba(37,99,235,0.06)' : 'var(--bg-elevated)',
                borderRadius: 10, padding: '11px 14px', cursor: 'pointer', textAlign: 'center',
                transition: 'all 0.15s'
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.tsv,.txt"
                style={{ display: 'none' }}
                onChange={e => { handleFilePicked(e.target.files?.[0]); e.target.value = '' }}
              />
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                📂 Drop `.xlsx` / `.csv` courier sheet here or <span style={{ color: '#2563eb', textDecoration: 'underline' }}>Browse</span>
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>
                {uploadFilename ? `Loaded: ${uploadFilename}` : 'Auto-cleans Rs., commas (3,500), TSV & CSV'}
              </div>
            </div>

            {/* Paste Sheet Data */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>Paste Sheet Data (TSV or CSV)</label>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700 }}>7 Columns</span>
              </div>
              <textarea
                value={pasteData}
                onChange={e => setPasteData(e.target.value)}
                placeholder={'1. Order ID\t2. Tracking\t3. Type (D/R)\t4. COD\t5. Charges\t6. CPR\t7. Date'}
                style={{
                  width: '100%', height: 155, background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-bright)', color: 'var(--text-primary)',
                  padding: 12, borderRadius: 10, resize: 'vertical',
                  fontFamily: 'monospace', fontSize: '0.75rem', whiteSpace: 'pre', outline: 'none'
                }}
              />
            </div>

            {/* Live Pre-Run Preview Strip */}
            {(preview.stats.totalRows > 0 || preview.badLines.length > 0) && (
              <div style={{
                padding: '10px 12px', borderRadius: 10,
                background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.22)',
                fontSize: '0.74rem', display: 'flex', flexDirection: 'column', gap: 6
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, color: '#1d4ed8' }}>
                  <span>📋 Live Preview: {preview.stats.totalRows} rows</span>
                  <span>D: {preview.stats.deliveredCount} · R: {preview.stats.returnedCount}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, fontSize: '0.71rem' }}>
                  <div><span style={{ color: 'var(--text-muted)' }}>COD:</span> <strong>Rs. {preview.stats.totalCod.toLocaleString()}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Fees:</span> <strong>Rs. {preview.stats.totalCharges.toLocaleString()}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Net:</span> <strong style={{ color: '#059669' }}>Rs. {preview.stats.netPayout.toLocaleString()}</strong></div>
                </div>
                {preview.badLines.length > 0 && (
                  <div style={{ color: '#dc2626', fontWeight: 700, fontSize: '0.7rem' }}>
                    ⚠️ {preview.badLines.length} malformed line(s) skipped (e.g. Line {preview.badLines[0].lineNumber}: {preview.badLines[0].reason})
                  </div>
                )}
                {preview.stats.invalidTypeCount > 0 && (
                  <div style={{ color: '#b45309', fontWeight: 700, fontSize: '0.7rem' }}>
                    ⚠️ {preview.stats.invalidTypeCount} row(s) have invalid Type (must be D or R)
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={handleDryRun}
                disabled={isProcessing || preview.stats.totalRows === 0}
                style={{
                  flex: 1, padding: '11px 12px', borderRadius: 10, cursor: isProcessing || preview.stats.totalRows === 0 ? 'not-allowed' : 'pointer',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)',
                  color: 'var(--text-primary)', fontWeight: 800, fontSize: '0.8rem',
                  opacity: isProcessing || preview.stats.totalRows === 0 ? 0.55 : 1
                }}
              >🔍 Dry-Run Validate</button>

              <button
                type="button"
                onClick={handleProcess}
                disabled={isProcessing || preview.stats.totalRows === 0}
                style={{
                  flex: 1.35, padding: '11px 14px', borderRadius: 10, border: 'none',
                  cursor: isProcessing || preview.stats.totalRows === 0 ? 'not-allowed' : 'pointer',
                  background: isProcessing || preview.stats.totalRows === 0 ? 'var(--bg-elevated)' : 'linear-gradient(135deg, #10b981, #059669)',
                  color: isProcessing || preview.stats.totalRows === 0 ? 'var(--text-muted)' : '#fff',
                  fontWeight: 800, fontSize: '0.84rem',
                  boxShadow: !isProcessing && preview.stats.totalRows > 0 ? '0 4px 14px rgba(16,185,129,0.3)' : 'none',
                }}
              >{isProcessing ? `⏳ ${syncProcessed}/${syncTotal}` : '🚀 Run Reconciliation'}</button>
            </div>

            {isProcessing && (
              <button
                type="button"
                onClick={handleAbort}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 9, cursor: 'pointer',
                  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)',
                  color: '#dc2626', fontWeight: 800, fontSize: '0.78rem',
                }}
              >🛑 Stop / Abort Batch</button>
            )}
          </div>

          {/* Right Panel: Detailed Results Log */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            {/* Active Progress Bar */}
            {currentTaskId && (
              <div style={{
                padding: '12px 16px', borderRadius: 12,
                background: 'var(--bg-surface)', border: '1px solid rgba(37,99,235,0.3)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 700, marginBottom: 6 }}>
                  <span style={{ color: '#2563eb' }}>⏳ {isDryRunResult ? 'Validating (Dry-Run)...' : 'Reconciling Batch...'}</span>
                  <span>{syncProcessed} / {syncTotal}</span>
                </div>
                <div style={{ height: 6, background: 'var(--bg-elevated)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${syncTotal > 0 ? (syncProcessed / syncTotal) * 100 : 0}%`, background: '#2563eb', transition: 'width 0.25s ease' }} />
                </div>
              </div>
            )}

            {/* Financial Totals Summary Strip (After Dry-Run or Run) */}
            {summary && (
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 10
              }}>
                <BatchStat label={isDryRunResult ? 'Preview Ready' : 'Processed'} value={summary.processedCount} color="#059669" />
                <BatchStat label="Total COD" value={`Rs. ${Number(summary.totalCod || 0).toLocaleString()}`} color="#2563eb" />
                <BatchStat label="Total Charges" value={`Rs. ${Number(summary.totalCharges || 0).toLocaleString()}`} color="#d97706" />
                <BatchStat label="Net Bank Payout" value={`Rs. ${Number(summary.totalNetPayout || 0).toLocaleString()}`} color="#059669" />
                <BatchStat label="Ghosts / Dup / Var" value={`${summary.ghostCount} / ${summary.duplicateCount || 0} / ${summary.varianceCount || 0}`} color={(summary.ghostCount || summary.varianceCount) ? '#dc2626' : '#64748b'} />
              </div>
            )}

            {/* Results Card */}
            <div style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 500
            }}>
              {/* Toolbar */}
              <div style={{
                padding: '14px 18px', borderBottom: '1px solid var(--border)',
                background: 'var(--bg-elevated)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {isDryRunResult ? '🔍 Dry-Run Preview Log (Nothing Saved Yet)' : 'Detailed Results Log'}
                  </h3>
                  {results.length > 0 && (
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '2px 8px', borderRadius: 99, background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                      {filteredResults.length}/{results.length}
                    </span>
                  )}
                </div>

                {results.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {counts.ghosts > 0 && !isDryRunResult && (
                      <button type="button" disabled={isProcessing} onClick={handleBulkFixGhosts} style={miniActionBtn('#2563eb')}>
                        👻 Bulk Fix Ghosts ({counts.ghosts})
                      </button>
                    )}
                    {counts.errors > 0 && !isDryRunResult && (
                      <button type="button" disabled={isProcessing} onClick={handleRetryFailed} style={miniActionBtn('#d97706')}>
                        🔄 Retry Failed ({counts.errors})
                      </button>
                    )}
                    <button type="button" onClick={handleExportResults} style={miniActionBtn('#059669')}>
                      📥 Export CSV
                    </button>
                    <button type="button" onClick={clearResults} style={miniActionBtn('#64748b')}>
                      🧹 Clear
                    </button>
                  </div>
                )}
              </div>

              {/* Filter Pills + Search */}
              {results.length > 0 && (
                <div style={{
                  padding: '10px 18px', borderBottom: '1px solid var(--border)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8
                }}>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {[
                      { id: 'all', label: `All (${results.length})` },
                      { id: 'done', label: `✅ OK` },
                      { id: 'variance', label: `⚠️ Variance (${counts.variances})` },
                      { id: 'duplicates', label: `🔁 Dup (${counts.duplicates})` },
                      { id: 'ghosts', label: `🛑 Ghosts (${counts.ghosts})` },
                      { id: 'mismatches', label: `🔀 Track Diff (${counts.mismatches})` },
                      { id: 'errors', label: `❌ Errors (${counts.errors})` },
                    ].map(f => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setResultFilter(f.id)}
                        style={{
                          padding: '4px 10px', borderRadius: 99, cursor: 'pointer', fontSize: '0.71rem', fontWeight: 700,
                          border: resultFilter === f.id ? '1px solid #2563eb' : '1px solid var(--border)',
                          background: resultFilter === f.id ? 'rgba(37,99,235,0.12)' : 'var(--bg-elevated)',
                          color: resultFilter === f.id ? '#1d4ed8' : 'var(--text-secondary)'
                        }}
                      >{f.label}</button>
                    ))}
                  </div>
                  <input
                    className="form-input"
                    placeholder="🔍 Filter order, tracking, CPR..."
                    value={resultSearch}
                    onChange={e => setResultSearch(e.target.value)}
                    style={{ height: 30, fontSize: '0.75rem', width: 210 }}
                  />
                </div>
              )}

              {/* Results Table */}
              <div style={{ flex: 1, overflowY: 'auto', maxHeight: 540 }}>
                {results.length === 0 ? (
                  <div style={{ height: 420, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', padding: 24, textAlign: 'center' }}>
                    <div style={{ fontSize: 52, marginBottom: 12 }}>📊</div>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Ready to Reconcile</div>
                    <div style={{ fontSize: '0.82rem', maxWidth: 420 }}>
                      Drop an Excel/CSV file or paste your 7-column payout sheet on the left, click <strong>Dry-Run Validate</strong> to preview safely, then run reconciliation.
                    </div>
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                    <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-elevated)', zIndex: 2 }}>
                      <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                        <th style={thStyle}>Order # / Tracking</th>
                        <th style={{ ...thStyle, textAlign: 'center' }}>Type</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Order vs COD</th>
                        <th style={thStyle}>Status &amp; Audit</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Net Payout &amp; Fees</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredResults.map((r, i) => {
                        const st = String(r.status || '')
                        const isOk = st.includes('✅') || st.includes('🔍')
                        const isErr = st.includes('❌') || st.includes('🛑')
                        const badgeColor = isOk ? '#059669' : (isErr ? '#dc2626' : '#d97706')
                        const badgeBg = isOk ? 'rgba(16,185,129,0.12)' : (isErr ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.14)')
                        const clickableRef = r.orderRef || r.orderId
                        return (
                          <tr key={`${r.orderId}-${r.trackingNumber}-${i}`} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={tdStyle}>
                              <button
                                type="button"
                                onClick={() => openInCommandCenter(clickableRef)}
                                style={{
                                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                                  fontWeight: 800, color: '#2563eb', fontSize: '0.82rem', textDecoration: 'underline'
                                }}
                                title="Open in Command Center"
                              >{clickableRef || '—'}</button>
                              <div className="font-mono" style={{ fontSize: '0.71rem', color: 'var(--text-secondary)' }}>{r.trackingNumber || '—'}</div>
                              {r.trackingMismatch && (
                                <div style={{ fontSize: '0.67rem', color: '#d97706', fontWeight: 700, marginTop: 2 }}>
                                  🔀 DB Track: {r.dbTracking}
                                </div>
                              )}
                              <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)' }}>
                                {r.courierName || '—'}{r.ref ? ` · ${r.ref}` : ''}
                              </div>
                            </td>

                            <td style={{ ...tdStyle, textAlign: 'center' }}>
                              <span style={{
                                padding: '3px 8px', borderRadius: 6, fontWeight: 800, fontSize: '0.68rem',
                                background: r.type === 'D' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                                color: r.type === 'D' ? '#059669' : '#dc2626'
                              }}>{r.type === 'D' ? 'DELIVERED' : (r.type === 'R' ? 'RETURNED' : r.type || '?')}</span>
                            </td>

                            <td style={{ ...tdStyle, textAlign: 'right' }}>
                              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                                Rs. {Number(r.codAmount || 0).toLocaleString()}
                              </div>
                              {r.orderPrice > 0 && (
                                <div style={{ fontSize: '0.69rem', color: 'var(--text-muted)' }}>
                                  Order: Rs. {Number(r.orderPrice).toLocaleString()}
                                </div>
                              )}
                              {r.hasVariance && (
                                <span style={{
                                  display: 'inline-block', marginTop: 3, padding: '1px 6px', borderRadius: 5,
                                  fontSize: '0.66rem', fontWeight: 800,
                                  background: 'rgba(239,68,68,0.12)', color: '#dc2626'
                                }}>
                                  {r.variance < 0 ? `Short -Rs. ${Math.abs(r.variance).toLocaleString()}` : `Surplus +Rs. ${r.variance.toLocaleString()}`}
                                </span>
                              )}
                            </td>

                            <td style={tdStyle}>
                              <span style={{
                                display: 'inline-block', padding: '3px 9px', borderRadius: 99,
                                fontSize: '0.71rem', fontWeight: 700,
                                background: badgeBg, color: badgeColor
                              }}>{st}</span>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.35 }}>
                                {r.recommendation}
                              </div>
                              {st.includes('GHOST') && !isDryRunResult && (
                                <button
                                  type="button"
                                  onClick={() => handleCreateGhost(r)}
                                  style={{ ...miniActionBtn('#2563eb'), marginTop: 6 }}
                                >👻 Fix Ghost Order</button>
                              )}
                            </td>

                            <td style={{ ...tdStyle, textAlign: 'right', verticalAlign: 'top' }}>
                              <div style={{ fontWeight: 800, fontSize: '0.88rem', color: Number(r.netPayout || 0) >= 0 ? '#059669' : '#dc2626' }}>
                                Rs. {Number(r.netPayout || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.4 }}>
                                <div>Fee: Rs. {Number(r.charges || 0).toLocaleString()}</div>
                                {r.type === 'D' && r.freightBreakdown > 0 && (
                                  <div>Frt {r.freightBreakdown} · GST {r.gstBreakdown} · WHT {r.whtBreakdown}</div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* TAB 2: UPLOAD HISTORY (FULL MASTER-DETAIL DRILLDOWN)    */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeTab === 'history' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 390px) minmax(0, 1fr)', gap: 20, alignItems: 'start' }}>
          {/* Left Rail: Sessions List */}
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 10,
            maxHeight: 680
          }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>📜 Upload Sessions</h2>
              <p style={{ margin: '2px 0 10px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Click any session to inspect its reconciled orders or undo.
              </p>
              <input
                className="form-input"
                placeholder="🔍 Search by CPR ref or filename..."
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                style={{ height: 34, fontSize: '0.78rem' }}
              />
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 2 }}>
              {loadingHistory ? (
                <div style={{ padding: 36, textAlign: 'center', color: 'var(--text-muted)' }}>Loading sessions...</div>
              ) : filteredHistory.length === 0 ? (
                <div style={{ padding: 36, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>No reconciliation sessions found.</div>
              ) : filteredHistory.map(session => {
                const isSelected = selectedSessionId === session.id
                const net = Math.round(((Number(session.total_cod) || 0) - (Number(session.total_fees) || 0)) * 100) / 100
                return (
                  <div
                    key={session.id}
                    onClick={() => { setSelectedSessionId(session.id); fetchSessionDetail(session.id) }}
                    style={{
                      padding: 12, borderRadius: 11, cursor: 'pointer',
                      background: isSelected ? 'rgba(37,99,235,0.08)' : 'var(--bg-elevated)',
                      border: isSelected ? '1.5px solid #2563eb' : '1px solid var(--border)',
                      display: 'flex', flexDirection: 'column', gap: 8, transition: 'all 0.15s'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: '0.84rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {session.filename}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {new Date(session.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                        </div>
                      </div>
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: 'var(--bg-surface)', border: '1px solid var(--border)', flexShrink: 0 }}>
                        {session.log_count ?? session.row_count} rows
                      </span>
                    </div>

                    {/* Session Financial Summary */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.71rem', padding: '5px 8px', borderRadius: 7, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                      <span>COD: <strong>Rs. {Number(session.total_cod || 0).toLocaleString()}</strong></span>
                      <span>Net: <strong style={{ color: net >= 0 ? '#059669' : '#dc2626' }}>Rs. {net.toLocaleString()}</strong></span>
                    </div>

                    {session.cpr_references && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {session.cpr_references.split(',').slice(0, 4).map(cpr => (
                          <span key={cpr} className="font-mono" style={{
                            fontSize: '0.64rem', padding: '1px 6px', borderRadius: 4,
                            background: 'rgba(139,92,246,0.1)', color: '#7c3aed', fontWeight: 700
                          }}>📄 {cpr}</span>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: session.sync_to_shopify ? '#059669' : 'var(--text-muted)' }}>
                        {session.sync_to_shopify ? '✓ Shopify Synced' : 'ERP Only'}
                      </span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => setConfirmModal({
                            title: '↩️ Undo Reconciliation Session?',
                            message: `This will revert all ERP order updates from "${session.filename}" and attempt to clean up Shopify notes.`,
                            confirmLabel: 'Confirm Undo',
                            variant: 'danger',
                            onConfirm: () => handleUndo(session.id, true)
                          })}
                          style={miniActionBtn('#dc2626')}
                        >Undo</button>
                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => setConfirmModal({
                            title: '🗑️ Clear History Entry?',
                            message: `Remove "${session.filename}" from Upload History? All reconciled order payments in the ledger remain intact.`,
                            confirmLabel: 'Clear Entry',
                            variant: 'primary',
                            onConfirm: () => handleRemoveHistory(session.id, true)
                          })}
                          style={miniActionBtn('#64748b')}
                        >Clear</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Right Panel: Session Order Drilldown */}
          <HistoryDrilldownPanel
            sessionDetail={sessionDetail}
            loading={loadingSessionDetail}
            isProcessing={isProcessing}
            onResyncNotes={handleResyncSessionNotes}
            onUndo={(id, name) => setConfirmModal({
              title: '↩️ Undo Reconciliation Session?',
              message: `Revert all ERP order changes from "${name}" and remove added Shopify notes?`,
              confirmLabel: 'Confirm Undo',
              variant: 'danger',
              onConfirm: () => handleUndo(id, true)
            })}
            onOpenOrder={openInCommandCenter}
          />
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* TAB 3: LEGACY REPAIR                                    */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeTab === 'repair' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 460px) minmax(0, 1fr)', gap: 20, alignItems: 'start' }}>
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 16
          }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 800, color: '#2563eb' }}>🛠️ Legacy Data Repair</h2>
              <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Heal statuses for older orders from inactive courier accounts by cross-referencing live Shopify payment &amp; fulfillment records.
              </p>
            </div>

            <div>
              <label style={labelStyle}>Courier to Repair</label>
              <select value={selectedCourier} onChange={e => setSelectedCourier(e.target.value)} className="form-select" style={{ width: '100%' }}>
                <option value="All Inactive">🌐 All Inactive Couriers</option>
                {couriers.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Order Age Threshold</label>
              <select value={daysOld} onChange={e => setDaysOld(e.target.value)} className="form-select" style={{ width: '100%' }}>
                <option value="7">Older than 7 days</option>
                <option value="30">Older than 30 days</option>
                <option value="60">Older than 60 days</option>
                <option value="90">Older than 90 days</option>
                <option value="365">Older than 1 year</option>
              </select>
            </div>

            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, padding: 12,
              background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 10
            }}>
              <input
                type="checkbox"
                id="forceRto"
                checked={forceUnpaidAsReturned}
                onChange={e => setForceUnpaidAsReturned(e.target.checked)}
                style={{ width: 17, height: 17, marginTop: 2, cursor: 'pointer' }}
              />
              <label htmlFor="forceRto" style={{ fontSize: '0.78rem', cursor: 'pointer', color: '#b45309', lineHeight: 1.45 }}>
                <strong>Aggressive Clean:</strong> If Shopify still shows unpaid after {daysOld} days, force-mark ERP status as <strong>Returned</strong>. Use with caution!
              </label>
            </div>

            <button
              type="button"
              disabled={isRepairing || isProcessing}
              onClick={() => {
                if (forceUnpaidAsReturned) {
                  setConfirmModal({
                    title: '⚠️ Confirm Aggressive Legacy Repair',
                    message: `Unpaid orders older than ${daysOld} days for "${selectedCourier}" will be force-marked Returned. Continue?`,
                    confirmLabel: 'Execute Repair',
                    variant: 'danger',
                    onConfirm: handleRepair
                  })
                } else {
                  handleRepair()
                }
              }}
              style={{
                padding: '12px 16px', borderRadius: 10, border: 'none', cursor: isRepairing ? 'wait' : 'pointer',
                background: 'linear-gradient(135deg, #2563eb, #4f46e5)', color: '#fff',
                fontWeight: 800, fontSize: '0.86rem'
              }}
            >{isRepairing ? '⏳ Healing Data in Background...' : '🚀 Execute Repair Run'}</button>
          </div>

          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 14, padding: 22
          }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '0.96rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              📋 Repair Audit &amp; Safety Rules
            </h3>
            {repairResult ? (
              <div style={{
                padding: 18, borderRadius: 12,
                background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.32)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16
              }}>
                <div>
                  <div style={{ fontWeight: 800, color: '#059669', fontSize: '0.95rem' }}>✅ Legacy Repair Complete</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                    Orders cross-referenced against Shopify financial status.
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#059669' }}>{repairResult.count} Healed</div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>out of {repairResult.totalChecked} checked</div>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.65 }}>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  <li>Never touches orders already locked at <strong>Return Received</strong> or <strong>Cancelled</strong>.</li>
                  <li>Cross-checks Shopify `financial_status === &apos;paid&apos;` to safely promote stuck in-transit orders to <strong>Delivered</strong>.</li>
                  <li>Only enable <strong>Aggressive Clean</strong> when cleaning old deactivated courier accounts (e.g. 60+ days old).</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* TAB 4: MISSING COSTS RECOVERY (RESTORED!)               */}
      {/* ═══════════════════════════════════════════════════════ */}
      {activeTab === 'ghosts' && (
        <MissingCostsPanel
          ghostProducts={ghostProducts}
          productCosts={productCosts}
          setProductCosts={setProductCosts}
          isScanning={isScanning}
          isHealing={isHealing}
          onScan={fetchMissingProducts}
          onApply={applyBulkCosts}
        />
      )}

      {/* Clean Custom Confirmation Modal (No browser window.confirm) */}
      <ConfirmActionModal modal={confirmModal} onClose={() => setConfirmModal(null)} />
    </div>
  )
}

/* ─── Small Presentational Helpers ─── */

function HealthKpi({ icon, label, value, sub, accent, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 13,
        padding: '13px 15px',
        display: 'flex', alignItems: 'center', gap: 12,
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: '0 2px 10px rgba(15,23,42,0.03)',
        transition: 'border-color 0.15s'
      }}
    >
      <div style={{
        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
        background: `${accent}16`, border: `1px solid ${accent}33`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem'
      }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.67rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {label}
        </div>
        <div style={{ fontSize: '1.05rem', fontWeight: 900, color: 'var(--text-primary)', marginTop: 1 }}>{value}</div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>
      </div>
    </div>
  )
}

function BatchStat({ label, value, color }) {
  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderTop: `3px solid ${color}`, borderRadius: 11, padding: '10px 13px'
    }}>
      <div style={{ fontSize: '0.67rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '1.05rem', fontWeight: 900, color: 'var(--text-primary)', marginTop: 2 }}>{value}</div>
    </div>
  )
}

function ToggleCard({ active, onClick, title, subtitle, activeColor }) {
  const color = active ? activeColor : '#dc2626'
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
        borderRadius: 10, cursor: 'pointer',
        background: `${color}12`, border: `1px solid ${color}40`,
      }}
    >
      <div style={{
        width: 18, height: 18, borderRadius: 5, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: active ? color : 'transparent', border: `2px solid ${color}`,
        color: '#fff', fontSize: '0.72rem', fontWeight: 900
      }}>{active ? '✓' : ''}</div>
      <div>
        <div style={{ fontWeight: 800, fontSize: '0.8rem', color }}>{title}</div>
        <div style={{ fontSize: '0.69rem', color: 'var(--text-muted)' }}>{subtitle}</div>
      </div>
    </div>
  )
}

const labelStyle = { display: 'block', marginBottom: 6, fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-secondary)' }
const thStyle = { padding: '10px 12px', fontSize: '0.69rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }
const tdStyle = { padding: '10px 12px', verticalAlign: 'middle' }
const miniActionBtn = (color) => ({
  padding: '4px 10px', borderRadius: 7, cursor: 'pointer',
  background: `${color}14`, border: `1px solid ${color}38`,
  color, fontSize: '0.71rem', fontWeight: 700,
})
