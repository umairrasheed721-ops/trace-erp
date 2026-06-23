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
        backgroundColor: activeTab === id ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
        color: activeTab === id ? '#60a5fa' : 'rgba(255,255,255,0.6)',
        fontWeight: activeTab === id ? 700 : 500,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        border: `1px solid ${activeTab === id ? 'rgba(59, 130, 246, 0.3)' : 'transparent'}`,
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
            background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
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
          <div style={{ padding: 20, borderRadius: 12, background: 'linear-gradient(135deg, rgba(52, 211, 153, 0.1) 0%, rgba(16, 185, 129, 0.05) 100%)', border: '1px solid rgba(52, 211, 153, 0.2)' }}>
            <h3 style={{ color: '#34d399', margin: '0 0 8px 0', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6 }}>✅ Processed Successfully</h3>
            <div style={{ fontSize: 36, fontWeight: 800, color: '#fff' }}>{summary.processedCount}</div>
          </div>
          <div style={{ padding: 20, borderRadius: 12, background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(220, 38, 38, 0.05) 100%)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
            <h3 style={{ color: '#ef4444', margin: '0 0 8px 0', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6 }}>🛑 Ghosts (Not Found)</h3>
            <div style={{ fontSize: 36, fontWeight: 800, color: '#fff' }}>{summary.ghostCount}</div>
          </div>
          <div style={{ padding: 20, borderRadius: 12, background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(217, 119, 6, 0.05) 100%)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
            <h3 style={{ color: '#f59e0b', margin: '0 0 8px 0', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6 }}>⚠️ Tracking Mismatches</h3>
            <div style={{ fontSize: 36, fontWeight: 800, color: '#fff' }}>{summary.auditCount}</div>
          </div>
        </div>
      )}

      {/* Pill Navigation */}
      <div style={{ 
        display: 'flex', 
        gap: 8, 
        padding: '8px', 
        background: 'rgba(0,0,0,0.2)', 
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
            <div className="stat-card" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
              <h2 style={{ fontSize: '1.2rem', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>⚡ Quick Reconcile</h2>
              
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, fontSize: '0.85rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>Master Match Key</label>
                <select 
                  value={masterKey} 
                  onChange={e => setMasterKey(e.target.value)}
                  style={{
                    width: '100%', padding: '12px 16px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, outline: 'none'
                  }}
                >
                  <option value="Match by Tracking Number">🔍 Match by Tracking Number</option>
                  <option value="Match by Order ID">🏷️ Match by Order ID</option>
                </select>
              </div>

              <div style={{ 
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', marginBottom: 16,
                backgroundColor: syncToShopify ? 'rgba(52, 211, 153, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                border: `1px solid ${syncToShopify ? 'rgba(52, 211, 153, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                borderRadius: 8, transition: 'all 0.3s ease', cursor: 'pointer'
              }} onClick={() => setSyncToShopify(!syncToShopify)}>
                <div style={{
                  width: 20, height: 20, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: syncToShopify ? '#34d399' : 'transparent', border: `2px solid ${syncToShopify ? '#34d399' : '#ef4444'}`
                }}>
                  {syncToShopify && <span style={{ color: '#000', fontSize: '12px', fontWeight: 'bold' }}>✓</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 600, color: syncToShopify ? '#34d399' : '#ef4444', fontSize: '0.9rem' }}>
                    {syncToShopify ? 'Sync to Shopify: ON' : 'Sync to Shopify: OFF'}
                  </span>
                  <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                    {syncToShopify ? 'Status will update on ERP and Shopify.' : 'Status updates applied to ERP only.'}
                  </span>
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.85rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>
                  <span>Paste Sheet Data</span>
                  <span style={{ opacity: 0.5 }}>7 Columns</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <textarea
                    value={pasteData}
                    onChange={e => setPasteData(e.target.value)}
                    placeholder="1. Order ID   2. Tracking   3. Type (D/R)   4. COD   5. Charges   6. CPR   7. Date"
                    style={{
                      width: '100%', height: 200, backgroundColor: 'rgba(0,0,0,0.3)', border: '1px dashed rgba(255,255,255,0.2)', color: '#fff', padding: 16, borderRadius: 8, resize: 'vertical', fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'pre', outline: 'none', transition: 'border 0.2s ease'
                    }}
                    onFocus={e => e.target.style.border = '1px solid #60a5fa'}
                    onBlur={e => e.target.style.border = '1px dashed rgba(255,255,255,0.2)'}
                  />
                </div>
              </div>

              <button 
                className="btn" 
                onClick={handleProcess} 
                disabled={isProcessing || !pasteData.trim()}
                style={{ 
                  padding: '16px', fontSize: '1rem', fontWeight: 700, width: '100%', borderRadius: 8, border: 'none',
                  background: isProcessing ? 'rgba(255,255,255,0.1)' : (!pasteData.trim() ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)'),
                  color: isProcessing || !pasteData.trim() ? 'rgba(255,255,255,0.4)' : '#fff',
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
               <h2 style={{ fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>📜 Upload History</h2>
               <p style={{ fontSize: '0.8rem', opacity: 0.6, margin: 0 }}>Review past sessions. Undo accidental uploads here.</p>
               
               <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8, paddingRight: 4 }}>
                  {loadingHistory ? (
                    <div style={{ textAlign: 'center', padding: 40, opacity: 0.5 }}>Loading logs...</div>
                  ) : history.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 40, opacity: 0.3 }}>No history found.</div>
                  ) : history.map(session => (
                    <div key={session.id} style={{ 
                      padding: '12px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 12
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#e5e7eb' }}>{session.filename}</span>
                          <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>
                            {new Date(session.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: 12, background: 'rgba(255,255,255,0.1)', color: '#fff' }}>
                          {session.row_count} rows
                        </span>
                      </div>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', color: session.sync_to_shopify ? '#34d399' : '#9ca3af' }}>
                          {session.sync_to_shopify ? '✓ Shopify Synced' : 'ERP Only'}
                        </span>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button 
                            onClick={() => handleUndo(session.id)}
                            disabled={isProcessing}
                            style={{ background: 'transparent', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#fca5a5', padding: '4px 12px', borderRadius: 4, fontSize: '0.75rem', cursor: 'pointer' }}
                          >
                            Undo
                          </button>
                          <button 
                            onClick={() => handleRemoveHistory(session.id)}
                            disabled={isProcessing}
                            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#9ca3af', padding: '4px 12px', borderRadius: 4, fontSize: '0.75rem', cursor: 'pointer' }}
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
            <div className="stat-card" style={{ border: '1px solid rgba(16, 185, 129, 0.3)', background: 'linear-gradient(180deg, rgba(16, 185, 129, 0.05) 0%, rgba(0,0,0,0) 100%)' }}>
              <h2 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: 8 }}>💰 Missing Costs Recovery</h2>
              <p style={{ fontSize: '0.8rem', opacity: 0.7, margin: '0 0 20px 0' }}>Assign unit costs to historical "Ghost Products" (deleted from Shopify) to fix P&L.</p>

              {ghostProducts.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', padding: '40px 0' }}>
                  <div style={{ fontSize: 48 }}>👻</div>
                  <button 
                    className="btn" 
                    onClick={fetchMissingProducts} 
                    disabled={isScanning || isProcessing}
                    style={{ padding: '12px 24px', background: 'rgba(16, 185, 129, 0.1)', color: '#34d399', border: '1px solid #10b981', borderRadius: 8, fontWeight: 600 }}
                  >
                    {isScanning ? '🔍 Scanning Historical Orders...' : 'Scan Database for Ghosts'}
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ maxHeight: 400, overflowY: 'auto', background: 'rgba(0,0,0,0.2)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
                    <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                      <thead style={{ position: 'sticky', top: 0, background: '#111827', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <tr>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600 }}>Product Title</th>
                          <th style={{ padding: '12px', textAlign: 'center', width: 60, fontWeight: 600 }}>Qty</th>
                          <th style={{ padding: '12px', textAlign: 'right', width: 100, fontWeight: 600 }}>Unit Cost (Rs)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ghostProducts.map(p => (
                          <tr key={p.name} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '10px 12px', color: '#e5e7eb' }}>{p.name}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'center', opacity: 0.6 }}>{p.count}</td>
                            <td style={{ padding: '8px 12px' }}>
                              <input 
                                type="number" 
                                placeholder="0"
                                value={productCosts[p.name] ?? ''}
                                onChange={e => {
                                  const val = e.target.value;
                                  setProductCosts(prev => ({ ...prev, [p.name]: val === '' ? '' : parseFloat(val) }));
                                }}
                                style={{ width: '100%', padding: '6px 8px', background: 'rgba(0,0,0,0.4)', color: '#fff', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 4, textAlign: 'right', outline: 'none' }}
                                onFocus={e => e.target.style.border = '1px solid #10b981'}
                                onBlur={e => e.target.style.border = '1px solid rgba(16, 185, 129, 0.3)'}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ display: 'flex', gap: 12 }}>
                    <button onClick={() => setGhostProducts([])} style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: 8, cursor: 'pointer' }}>Cancel</button>
                    <button 
                      onClick={applyBulkCosts} 
                      disabled={isHealing || Object.keys(productCosts).length === 0}
                      style={{ flex: 2, padding: '12px', background: '#10b981', border: 'none', color: '#fff', borderRadius: 8, fontWeight: 700, cursor: isHealing || Object.keys(productCosts).length === 0 ? 'not-allowed' : 'pointer', opacity: Object.keys(productCosts).length === 0 ? 0.5 : 1 }}
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
            <div className="stat-card" style={{ border: '1px solid rgba(96, 165, 250, 0.3)', background: 'linear-gradient(180deg, rgba(96, 165, 250, 0.05) 0%, rgba(0,0,0,0) 100%)' }}>
               <h2 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: 8 }}>🛠️ Legacy Data Repair</h2>
               <p style={{ fontSize: '0.8rem', opacity: 0.7, margin: '0 0 20px 0' }}>
                 Heal statuses for orders from inactive courier accounts by cross-referencing Shopify records.
               </p>

               <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: 8, fontSize: '0.85rem', fontWeight: 600 }}>Courier to Repair</label>
                    <select 
                      value={selectedCourier} 
                      onChange={e => setSelectedCourier(e.target.value)}
                      style={{ width: '100%', padding: '12px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, outline: 'none' }}
                    >
                      <option value="All Inactive">🌐 All Inactive Couriers</option>
                      {couriers.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: 8, fontSize: '0.85rem', fontWeight: 600 }}>Order Age Threshold</label>
                    <select 
                      value={daysOld} 
                      onChange={e => setDaysOld(e.target.value)}
                      style={{ width: '100%', padding: '12px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, outline: 'none' }}
                    >
                      <option value="7">Older than 7 days</option>
                      <option value="30">Older than 30 days</option>
                      <option value="60">Older than 60 days</option>
                      <option value="90">Older than 90 days</option>
                      <option value="365">Older than 1 year</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: 8 }}>
                    <input 
                      type="checkbox" 
                      id="forceRto"
                      checked={forceUnpaidAsReturned}
                      onChange={e => setForceUnpaidAsReturned(e.target.checked)}
                      style={{ width: 18, height: 18, marginTop: 2, cursor: 'pointer', accentColor: '#f59e0b' }}
                    />
                    <label htmlFor="forceRto" style={{ fontSize: '0.8rem', cursor: 'pointer', color: '#fcd34d', lineHeight: 1.4 }}>
                      <b>Aggressive Clean:</b> If Shopify shows unpaid, force mark ERP status as <b>Returned</b>. Use with caution!
                    </label>
                  </div>

                  <button 
                    className="btn" 
                    onClick={handleRepair} 
                    disabled={isRepairing || isProcessing}
                    style={{ padding: '16px', background: 'rgba(96, 165, 250, 0.1)', color: '#60a5fa', border: '1px solid #3b82f6', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
                  >
                    {isRepairing ? '⏳ Healing Data in Background...' : '🚀 Execute Repair Run'}
                  </button>

                  {repairResult && (
                    <div style={{ padding: 16, backgroundColor: 'rgba(52, 211, 153, 0.1)', borderRadius: 8, border: '1px solid #34d399', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, color: '#34d399' }}>✅ Repair Complete</span>
                      <span style={{ fontSize: '0.85rem' }}>Checked: <b>{repairResult.totalChecked}</b> | Healed: <b style={{ color: '#34d399' }}>{repairResult.count}</b></span>
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
              padding: '16px 20px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 600, marginBottom: 12 }}>
                <span style={{ color: '#60a5fa' }}>⏳ Reconciliation Task Running ({currentTaskId})</span>
                <span>{syncProcessed} / {syncTotal}</span>
              </div>
              <div style={{ height: 8, background: 'rgba(0,0,0,0.5)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${syncTotal > 0 ? (syncProcessed / syncTotal) * 100 : 0}%`,
                  background: 'linear-gradient(90deg, #3b82f6, #60a5fa)', borderRadius: 4, transition: 'width 0.3s ease'
                }} />
              </div>
            </div>
          )}

          <div className="stat-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', border: '1px solid var(--border)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Detailed Results Log</h3>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 400 }}>
              {results.length === 0 ? (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.4 }}>
                  <div style={{ fontSize: 64, marginBottom: 16 }}>📊</div>
                  <p>Paste data and click "Run Reconciliation" to view results here.</p>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#111827', zIndex: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
                    <tr style={{ color: 'rgba(255,255,255,0.6)' }}>
                      <th style={{ padding: '16px 12px', fontWeight: 600 }}>Order ID / Track</th>
                      <th style={{ padding: '16px 12px', fontWeight: 600, textAlign: 'center' }}>Type</th>
                      <th style={{ padding: '16px 12px', fontWeight: 600, textAlign: 'right' }}>COD / Bal</th>
                      <th style={{ padding: '16px 12px', fontWeight: 600 }}>Status</th>
                      <th style={{ padding: '16px 12px', fontWeight: 600 }}>Recommendation</th>
                      <th style={{ padding: '16px 12px', fontWeight: 600, textAlign: 'right' }}>Final Charge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                        <td style={{ padding: '12px' }}>
                          <div style={{ fontWeight: 600, color: '#e5e7eb' }}>{r.orderId}</div>
                          <div style={{ fontSize: '0.75rem', color: '#9ca3af', fontFamily: 'monospace' }}>{r.trackingNumber}</div>
                          <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>{r.courierName}</div>
                        </td>
                        
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <span style={{ 
                            padding: '4px 8px', borderRadius: 6, fontWeight: 700, fontSize: '0.75rem',
                            background: r.type === 'D' ? 'rgba(52, 211, 153, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: r.type === 'D' ? '#34d399' : '#f87171'
                          }}>
                            {r.type === 'D' ? 'DELIVERED' : 'RETURNED'}
                          </span>
                        </td>

                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          <div style={{ color: '#e5e7eb' }}>Rs. {r.codAmount}</div>
                          <div style={{ fontSize: '0.75rem', color: '#60a5fa' }}>Bal: {r.balance}</div>
                        </td>

                        <td style={{ padding: '12px' }}>
                          <div style={{ 
                            display: 'inline-block', padding: '4px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600,
                            background: r.status.includes('✅') ? 'rgba(52, 211, 153, 0.1)' : 
                                        r.status.includes('❌') || r.status.includes('🛑') ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                            color: r.status.includes('✅') ? '#34d399' : 
                                   r.status.includes('❌') || r.status.includes('🛑') ? '#fca5a5' : '#fcd34d',
                            border: `1px solid ${r.status.includes('✅') ? 'rgba(52, 211, 153, 0.2)' : 
                                                 r.status.includes('❌') || r.status.includes('🛑') ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)'}`
                          }}>
                            {r.status}
                          </div>
                          
                          {r.status.includes('GHOST') && (
                            <div style={{ marginTop: 8 }}>
                              <button 
                                onClick={() => handleCreateGhost(r)}
                                style={{ padding: '4px 12px', fontSize: '0.7rem', background: 'rgba(96, 165, 250, 0.1)', color: '#60a5fa', border: '1px solid rgba(96, 165, 250, 0.4)', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                              >
                                👻 Fix Ghost Order
                              </button>
                            </div>
                          )}
                        </td>

                        <td style={{ padding: '12px', color: '#9ca3af', fontSize: '0.8rem', lineHeight: 1.4 }}>
                          {r.recommendation}
                        </td>

                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#34d399' }}>Rs. {r.netPayout}</div>
                          <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: 4 }}>Fee: {r.finalCharges}</div>
                          {(r.chargesTrick || r.taxAddOn) && (
                            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
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
