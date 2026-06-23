import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useFinance } from '../context/FinanceContext'

export default function FinanceManager() {
  const { activeStoreId } = useApp()
  const navigate = useNavigate()
  const {
    pasteData, setPasteData,
    masterKey, setMasterKey,
    syncToShopify, setSyncToShopify,
    isProcessing, currentTaskId,
    results,
    summary,
    history,
    loadingHistory,
    couriers, selectedCourier, setSelectedCourier,
    daysOld, setDaysOld,
    isRepairing, repairResult,
    forceUnpaidAsReturned, setForceUnpaidAsReturned,
    ghostProducts, setGhostProducts,
    productCosts, setProductCosts,
    isScanning, isHealing,
    handleProcess, handleUndo, handleCreateGhost,
    handleRepair, fetchMissingProducts, applyBulkCosts,
    syncTotal, syncProcessed, handleRemoveHistory
  } = useFinance()

  const [activeTab, setActiveTab] = useState('reconcile') // 'reconcile', 'history', 'repair', 'ghosts'

  const TabButton = ({ id, label, icon }) => (
    <button
      onClick={() => setActiveTab(id)}
      style={{
        padding: '10px 20px',
        borderRadius: '30px',
        border: 'none',
        backgroundColor: activeTab === id ? 'var(--blue-dim)' : 'transparent',
        color: activeTab === id ? 'var(--blue)' : 'var(--text-secondary)',
        fontWeight: activeTab === id ? 700 : 500,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        border: `1px solid ${activeTab === id ? 'var(--blue)' : 'transparent'}`,
        boxShadow: activeTab === id ? '0 4px 12px rgba(59, 130, 246, 0.1)' : 'none'
      }}
    >
      <span>{icon}</span> {label}
    </button>
  )

  return (
    <div className="page-container" style={{ maxWidth: 1400 }}>
      <header className="page-header" style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">💰 Finance & Payments</h1>
          <p className="page-subtitle">Reconcile COD payouts, heal historical data, and recover missing costs.</p>
        </div>
        <button 
          className="btn" 
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 8, 
            background: 'var(--blue)',
            color: 'white',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '8px',
            fontWeight: 600,
            boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
          }} 
          onClick={() => navigate('/payout-reconciler')}
        >
          💸 Go to Payout Reconciler
        </button>
      </header>

      {/* Stats Summary Panel */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
          <div style={{ padding: 20, borderRadius: 12, background: 'var(--green-dim)', border: '1px solid var(--green)' }}>
            <h3 style={{ color: 'var(--green)', margin: '0 0 8px 0', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6 }}>✅ Processed Successfully</h3>
            <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--text-primary)' }}>{summary.processedCount}</div>
          </div>
          <div style={{ padding: 20, borderRadius: 12, background: 'var(--red-dim)', border: '1px solid var(--red)' }}>
            <h3 style={{ color: 'var(--red)', margin: '0 0 8px 0', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6 }}>🛑 Ghosts (Not Found)</h3>
            <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--text-primary)' }}>{summary.ghostCount}</div>
          </div>
          <div style={{ padding: 20, borderRadius: 12, background: 'var(--yellow-dim)', border: '1px solid var(--yellow)' }}>
            <h3 style={{ color: 'var(--yellow)', margin: '0 0 8px 0', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6 }}>⚠️ Tracking Mismatches</h3>
            <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--text-primary)' }}>{summary.auditCount}</div>
          </div>
        </div>
      )}

      {/* Pill Navigation */}
      <div style={{ 
        display: 'flex', 
        gap: 8, 
        padding: '8px', 
        background: 'var(--bg-surface)', 
        border: '1px solid var(--border)',
        borderRadius: '36px',
        marginBottom: 24,
        width: 'fit-content'
      }}>
        <TabButton id="reconcile" label="Reconciliation" icon="⚡" />
        <TabButton id="history" label="Upload History" icon="📜" />
        <TabButton id="ghosts" label="Ghost Recovery" icon="💰" />
        <TabButton id="repair" label="Legacy Repair" icon="🛠️" />
      </div>

      <div style={{ display: 'flex', gap: 24 }}>
        
        {/* Left Column: Command Centers based on Tab */}
        <div style={{ flex: '0 0 400px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          
          {/* TAB: RECONCILE */}
          {activeTab === 'reconcile' && (
            <div className="stat-card" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <h2 style={{ fontSize: '1.2rem', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)' }}>⚡ Quick Reconcile</h2>
              
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Master Match Key</label>
                <select 
                  value={masterKey} 
                  onChange={e => setMasterKey(e.target.value)}
                  style={{
                    width: '100%', padding: '12px 16px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-bright)', color: 'var(--text-primary)', borderRadius: 8, outline: 'none'
                  }}
                >
                  <option value="Match by Tracking Number">🔍 Match by Tracking Number</option>
                  <option value="Match by Order ID">🏷️ Match by Order ID</option>
                </select>
              </div>

              <div style={{ 
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', marginBottom: 16,
                backgroundColor: syncToShopify ? 'var(--green-dim)' : 'var(--red-dim)',
                border: `1px solid ${syncToShopify ? 'var(--green)' : 'var(--red)'}`,
                borderRadius: 8, transition: 'all 0.3s ease', cursor: 'pointer'
              }} onClick={() => setSyncToShopify(!syncToShopify)}>
                <div style={{
                  width: 20, height: 20, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: syncToShopify ? 'var(--green)' : 'transparent', border: `2px solid ${syncToShopify ? 'var(--green)' : 'var(--red)'}`
                }}>
                  {syncToShopify && <span style={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}>✓</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 600, color: syncToShopify ? 'var(--green)' : 'var(--red)', fontSize: '0.9rem' }}>
                    {syncToShopify ? 'Sync to Shopify: ON' : 'Sync to Shopify: OFF'}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {syncToShopify ? 'Status will update on ERP and Shopify.' : 'Status updates applied to ERP only.'}
                  </span>
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  <span>Paste Sheet Data</span>
                  <span style={{ color: 'var(--text-muted)' }}>7 Columns</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <textarea
                    value={pasteData}
                    onChange={e => setPasteData(e.target.value)}
                    placeholder="1. Order ID   2. Tracking   3. Type (D/R)   4. COD   5. Charges   6. CPR   7. Date"
                    style={{
                      width: '100%', height: 200, backgroundColor: 'var(--bg-surface)', border: '1px dashed var(--border-bright)', color: 'var(--text-primary)', padding: 16, borderRadius: 8, resize: 'vertical', fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'pre', outline: 'none', transition: 'border 0.2s ease'
                    }}
                    onFocus={e => e.target.style.border = '1px solid var(--blue)'}
                    onBlur={e => e.target.style.border = '1px dashed var(--border-bright)'}
                  />
                </div>
              </div>

              <button 
                className="btn" 
                onClick={handleProcess} 
                disabled={isProcessing || !pasteData.trim()}
                style={{ 
                  padding: '16px', fontSize: '1rem', fontWeight: 700, width: '100%', borderRadius: 8, border: 'none',
                  background: isProcessing ? 'var(--bg-hover)' : (!pasteData.trim() ? 'var(--bg-surface)' : 'var(--green)'),
                  color: isProcessing || !pasteData.trim() ? 'var(--text-muted)' : '#fff',
                  boxShadow: (!isProcessing && pasteData.trim()) ? '0 4px 15px rgba(16, 185, 129, 0.3)' : 'none',
                  cursor: isProcessing || !pasteData.trim() ? 'not-allowed' : 'pointer'
                }}
              >
                {isProcessing ? `⏳ Processing Task: ${currentTaskId || 'active'}` : '🚀 Run Reconciliation'}
              </button>
            </div>
          )}

          {/* TAB: HISTORY */}
          {activeTab === 'history' && (
            <div className="stat-card" style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%', maxHeight: 'calc(100vh - 200px)' }}>
               <h2 style={{ fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)' }}>📜 Upload History</h2>
               <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>Review past sessions. Undo accidental uploads here.</p>
               
               <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8, paddingRight: 4 }}>
                  {loadingHistory ? (
                    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading logs...</div>
                  ) : history.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No history found.</div>
                  ) : history.map(session => (
                    <div key={session.id} style={{ 
                      padding: '12px', backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 12
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{session.filename}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {new Date(session.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: 12, background: 'var(--bg-hover)', color: 'var(--text-primary)' }}>
                          {session.row_count} rows
                        </span>
                      </div>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', color: session.sync_to_shopify ? 'var(--green)' : 'var(--text-muted)' }}>
                          {session.sync_to_shopify ? '✓ Shopify Synced' : 'ERP Only'}
                        </span>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button 
                            onClick={() => handleUndo(session.id)}
                            disabled={isProcessing}
                            style={{ background: 'transparent', border: '1px solid var(--red)', color: 'var(--red)', padding: '4px 12px', borderRadius: 4, fontSize: '0.75rem', cursor: 'pointer' }}
                          >
                            Undo
                          </button>
                          <button 
                            onClick={() => handleRemoveHistory(session.id)}
                            disabled={isProcessing}
                            style={{ background: 'transparent', border: '1px solid var(--border-bright)', color: 'var(--text-secondary)', padding: '4px 12px', borderRadius: 4, fontSize: '0.75rem', cursor: 'pointer' }}
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
               </div>
            </div>
          )}

          {/* TAB: GHOST RECOVERY */}
          {activeTab === 'ghosts' && (
            <div className="stat-card" style={{ border: '1px solid var(--green)', background: 'var(--green-dim)' }}>
              <h2 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 8 }}>💰 Missing Costs Recovery</h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 20px 0' }}>Assign unit costs to historical "Ghost Products" (deleted from Shopify) to fix P&L.</p>

              {ghostProducts.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', padding: '40px 0' }}>
                  <div style={{ fontSize: 48 }}>👻</div>
                  <button 
                    className="btn" 
                    onClick={fetchMissingProducts} 
                    disabled={isScanning || isProcessing}
                    style={{ padding: '12px 24px', background: 'var(--green-dim)', color: 'var(--green)', border: '1px solid var(--green)', borderRadius: 8, fontWeight: 600 }}
                  >
                    {isScanning ? '🔍 Scanning Historical Orders...' : 'Scan Database for Ghosts'}
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ maxHeight: 400, overflowY: 'auto', background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                      <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', zIndex: 2 }}>
                        <tr>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Product Title</th>
                          <th style={{ padding: '12px', textAlign: 'center', width: 60, fontWeight: 600, color: 'var(--text-secondary)' }}>Qty</th>
                          <th style={{ padding: '12px', textAlign: 'right', width: 100, fontWeight: 600, color: 'var(--text-secondary)' }}>Unit Cost (Rs)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ghostProducts.map(p => (
                          <tr key={p.name} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '10px 12px', color: 'var(--text-primary)' }}>{p.name}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>{p.count}</td>
                            <td style={{ padding: '8px 12px' }}>
                              <input 
                                type="number" 
                                placeholder="0"
                                value={productCosts[p.name] ?? ''}
                                onChange={e => {
                                  const val = e.target.value;
                                  setProductCosts(prev => ({ ...prev, [p.name]: val === '' ? '' : parseFloat(val) }));
                                }}
                                style={{ width: '100%', padding: '6px 8px', background: 'var(--bg-active)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4, textAlign: 'right', outline: 'none' }}
                                onFocus={e => e.target.style.border = '1px solid var(--green)'}
                                onBlur={e => e.target.style.border = '1px solid var(--border)'}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ display: 'flex', gap: 12 }}>
                    <button onClick={() => setGhostProducts([])} style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid var(--border-bright)', color: 'var(--text-primary)', borderRadius: 8, cursor: 'pointer' }}>Cancel</button>
                    <button 
                      onClick={applyBulkCosts} 
                      disabled={isHealing || Object.keys(productCosts).length === 0}
                      style={{ flex: 2, padding: '12px', background: 'var(--green)', border: 'none', color: '#fff', borderRadius: 8, fontWeight: 700, cursor: isHealing || Object.keys(productCosts).length === 0 ? 'not-allowed' : 'pointer', opacity: Object.keys(productCosts).length === 0 ? 0.5 : 1 }}
                    >
                      {isHealing ? '⌛ Applying Costs...' : `🚀 Fix P&L for ${ghostProducts.length} items`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: LEGACY REPAIR */}
          {activeTab === 'repair' && (
            <div className="stat-card" style={{ border: '1px solid var(--blue)', background: 'var(--blue-dim)' }}>
               <h2 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', color: 'var(--blue)', display: 'flex', alignItems: 'center', gap: 8 }}>🛠️ Legacy Data Repair</h2>
               <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 20px 0' }}>
                 Heal statuses for orders from inactive courier accounts by cross-referencing Shopify records.
               </p>

               <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: 8, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Courier to Repair</label>
                    <select 
                      value={selectedCourier} 
                      onChange={e => setSelectedCourier(e.target.value)}
                      style={{ width: '100%', padding: '12px', backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 8, outline: 'none' }}
                    >
                      <option value="All Inactive">🌐 All Inactive Couriers</option>
                      {couriers.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: 8, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Order Age Threshold</label>
                    <select 
                      value={daysOld} 
                      onChange={e => setDaysOld(e.target.value)}
                      style={{ width: '100%', padding: '12px', backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 8, outline: 'none' }}
                    >
                      <option value="7">Older than 7 days</option>
                      <option value="30">Older than 30 days</option>
                      <option value="60">Older than 60 days</option>
                      <option value="90">Older than 90 days</option>
                      <option value="365">Older than 1 year</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px', background: 'var(--yellow-dim)', border: '1px solid var(--yellow)', borderRadius: 8 }}>
                    <input 
                      type="checkbox" 
                      id="forceRto"
                      checked={forceUnpaidAsReturned}
                      onChange={e => setForceUnpaidAsReturned(e.target.checked)}
                      style={{ width: 18, height: 18, marginTop: 2, cursor: 'pointer', accentColor: 'var(--yellow)' }}
                    />
                    <label htmlFor="forceRto" style={{ fontSize: '0.8rem', cursor: 'pointer', color: 'var(--yellow)', lineHeight: 1.4 }}>
                      <b>Aggressive Clean:</b> If Shopify shows unpaid, force mark ERP status as <b>Returned</b>. Use with caution!
                    </label>
                  </div>

                  <button 
                    className="btn" 
                    onClick={handleRepair} 
                    disabled={isRepairing || isProcessing}
                    style={{ padding: '16px', background: 'var(--blue-dim)', color: 'var(--blue)', border: '1px solid var(--blue)', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
                  >
                    {isRepairing ? '⏳ Healing Data in Background...' : '🚀 Execute Repair Run'}
                  </button>

                  {repairResult && (
                    <div style={{ padding: 16, backgroundColor: 'var(--green-dim)', borderRadius: 8, border: '1px solid var(--green)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, color: 'var(--green)' }}>✅ Repair Complete</span>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>Checked: <b>{repairResult.totalChecked}</b> | Healed: <b style={{ color: 'var(--green)' }}>{repairResult.count}</b></span>
                    </div>
                  )}
               </div>
            </div>
          )}

        </div>

        {/* Right Column: Detailed Results Log */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          
          {currentTaskId && (
            <div style={{
              padding: '16px 20px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 600, marginBottom: 12 }}>
                <span style={{ color: 'var(--blue)' }}>⏳ Reconciliation Task Running ({currentTaskId})</span>
                <span style={{ color: 'var(--text-primary)' }}>{syncProcessed} / {syncTotal}</span>
              </div>
              <div style={{ height: 8, background: 'var(--bg-hover)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${syncTotal > 0 ? (syncProcessed / syncTotal) * 100 : 0}%`,
                  background: 'var(--blue)', borderRadius: 4, transition: 'width 0.3s ease'
                }} />
              </div>
            </div>
          )}

          <div className="stat-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', border: '1px solid var(--border)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)' }}>Detailed Results Log</h3>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 400 }}>
              {results.length === 0 ? (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 64, marginBottom: 16 }}>📊</div>
                  <p>Paste data and click "Run Reconciliation" to view results here.</p>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-surface)', zIndex: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                    <tr style={{ color: 'var(--text-secondary)' }}>
                      <th style={{ padding: '16px 12px', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Order ID / Track</th>
                      <th style={{ padding: '16px 12px', fontWeight: 600, textAlign: 'center', borderBottom: '1px solid var(--border)' }}>Type</th>
                      <th style={{ padding: '16px 12px', fontWeight: 600, textAlign: 'right', borderBottom: '1px solid var(--border)' }}>COD / Bal</th>
                      <th style={{ padding: '16px 12px', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Status</th>
                      <th style={{ padding: '16px 12px', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Recommendation</th>
                      <th style={{ padding: '16px 12px', fontWeight: 600, textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Final Charge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-hover)' }}>
                        <td style={{ padding: '12px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.orderId}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{r.trackingNumber}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{r.courierName}</div>
                        </td>
                        
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <span style={{ 
                            padding: '4px 8px', borderRadius: 6, fontWeight: 700, fontSize: '0.75rem',
                            background: r.type === 'D' ? 'var(--green-dim)' : 'var(--red-dim)',
                            color: r.type === 'D' ? 'var(--green)' : 'var(--red)'
                          }}>
                            {r.type === 'D' ? 'DELIVERED' : 'RETURNED'}
                          </span>
                        </td>

                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          <div style={{ color: 'var(--text-primary)' }}>Rs. {r.codAmount}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--blue)' }}>Bal: {r.balance}</div>
                        </td>

                        <td style={{ padding: '12px' }}>
                          <div style={{ 
                            display: 'inline-block', padding: '4px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600,
                            background: r.status.includes('✅') ? 'var(--green-dim)' : 
                                        r.status.includes('❌') || r.status.includes('🛑') ? 'var(--red-dim)' : 'var(--yellow-dim)',
                            color: r.status.includes('✅') ? 'var(--green)' : 
                                   r.status.includes('❌') || r.status.includes('🛑') ? 'var(--red)' : 'var(--yellow)',
                            border: `1px solid ${r.status.includes('✅') ? 'var(--green)' : 
                                                 r.status.includes('❌') || r.status.includes('🛑') ? 'var(--red)' : 'var(--yellow)'}`
                          }}>
                            {r.status}
                          </div>
                          
                          {r.status.includes('GHOST') && (
                            <div style={{ marginTop: 8 }}>
                              <button 
                                onClick={() => handleCreateGhost(r)}
                                style={{ padding: '4px 12px', fontSize: '0.7rem', background: 'var(--blue-dim)', color: 'var(--blue)', border: '1px solid var(--blue)', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                              >
                                👻 Fix Ghost Order
                              </button>
                            </div>
                          )}
                        </td>

                        <td style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.4 }}>
                          {r.recommendation}
                        </td>

                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--green)' }}>Rs. {r.netPayout}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 4 }}>Fee: {r.finalCharges}</div>
                          {(r.chargesTrick || r.taxAddOn) && (
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>
                              {r.chargesTrick} {r.taxAddOn}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
