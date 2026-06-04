import React from 'react'

export default function BotAnalyticsPanel({
  activeSubTabC,
  setActiveSubTabC,
  status,
  statusColor,
  resetting,
  handleReset,
  isSleeping,
  isQrReady,
  isConnected,
  isFailed,
  testPhone,
  setTestPhone,
  testMsg,
  setTestMsg,
  sendingTest,
  handleSendTest,
  queueData,
  handleTogglePause,
  handleClearQueue,
  settings
}) {
  return (
    <div className="card glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: 24, animation: 'fadeIn 0.3s ease-in-out' }}>
      {/* Sub-Tabs Navigation */}
      <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid #334155', paddingBottom: 16, overflowX: 'auto' }}>
        {[
          { id: 'connection', label: '🔌 Connection Radar' },
          { id: 'metrics', label: '📊 Master Queue Metrics' },
          { id: 'audit', label: '📜 Live Delivery Audit' },
        ].map(sub => (
          <button
            key={sub.id}
            onClick={() => setActiveSubTabC(sub.id)}
            style={{
              padding: '10px 20px',
              borderRadius: 12,
              background: activeSubTabC === sub.id ? '#334155' : 'transparent',
              color: activeSubTabC === sub.id ? '#fff' : '#64748b',
              fontWeight: 700,
              fontSize: '0.85rem',
              border: activeSubTabC === sub.id ? '1px solid #475569' : '1px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap'
            }}
          >
            {sub.label}
          </button>
        ))}
      </div>

      {/* Sub-Tab C1: Connection Radar */}
      {activeSubTabC === 'connection' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <h4 style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 4 }}>🔌 Baileys WebSocket Connection Engine</h4>
              <p className="text-muted" style={{ fontSize: '0.85rem' }}>Monitor real-time socket health, QR pairing status, and session integrity.</p>
            </div>
            <button
              className="btn btn-danger"
              style={{ fontSize: '0.8rem', padding: '8px 18px', fontWeight: 700, opacity: resetting ? 0.6 : 1 }}
              disabled={resetting}
              onClick={handleReset}
            >
              {resetting ? '⌛ Resetting Session...' : '🔄 Reset Baileys Session'}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: 'var(--bg-active)', padding: 20, borderRadius: 16, border: '1px solid var(--border)' }}>
            <div style={{ width: 18, height: 18, borderRadius: '50%', background: statusColor, boxShadow: `0 0 15px ${statusColor}` }}></div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: 800, fontSize: '1.2rem' }}>{status?.status === 'SLEEPING' ? 'SLEEPING 💤 (Simulating Human Rest)' : (status?.status || 'DISCONNECTED')}</span>
              <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>Current Baileys Multi-Device Status {status?.reconnectAttempts > 0 && `(Reconnect attempt ${status.reconnectAttempts}/5)`}</span>
            </div>
          </div>

          {isSleeping && (
            <div className="info-banner" style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid #8b5cf6', color: '#a78bfa', padding: 20, borderRadius: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
               <span style={{ fontSize: '1.5rem' }}>💤</span> Bot is simulating human rest. Automated replies are temporarily paused to preserve Meta trust score.
            </div>
          )}

          {isQrReady && status?.qrCode && (
            <div style={{ textAlign: 'center', background: '#fff', padding: 28, borderRadius: 20, border: '2px dashed #cbd5e1', maxWidth: 400, margin: '0 auto' }}>
               <p style={{ color: '#0f172a', marginBottom: 16, fontWeight: 800, fontSize: '1.1rem' }}>📱 Scan QR Code with WhatsApp</p>
               <img src={status.qrCode} alt="WhatsApp QR" style={{ width: 260, height: 260, margin: '0 auto', borderRadius: 12, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
               <p style={{ color: '#475569', fontSize: '0.85rem', marginTop: 16, fontWeight: 600 }}>Open WhatsApp → Settings → Linked Devices → Link a Device</p>
            </div>
          )}

          {isConnected && (
            <div className="success-banner" style={{ background: 'var(--green-dim)', border: '1px solid var(--green)', color: 'var(--green)', padding: 20, borderRadius: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 12 }}>
               <span style={{ fontSize: '1.5rem' }}>✅</span> Bot is active, fully authenticated, and listening to live WebSockets.
            </div>
          )}

          {isFailed && (
            <div style={{ background: 'rgba(255,60,60,0.1)', border: '1px solid var(--red)', color: 'var(--red)', padding: 20, borderRadius: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 12 }}>
               <span style={{ fontSize: '1.5rem' }}>❌</span> Bot failed to connect. Click "Reset Baileys Session" above to clear corrupt auth state and scan a fresh QR.
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 24, marginTop: 12 }}>
            <h4 style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 16 }}>🛠️ Direct Diagnostic Test Messaging</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <input className="premium-input w-full" placeholder="Phone Number (e.g., 923...)" value={testPhone} onChange={e => setTestPhone(e.target.value)} />
              <input className="premium-input w-full" placeholder="Test Message Content" value={testMsg} onChange={e => setTestMsg(e.target.value)} />
            </div>
            <button className="btn btn-primary" disabled={sendingTest || !isConnected} onClick={handleSendTest} style={{ padding: '10px 24px', fontWeight: 700 }}>
              {sendingTest ? '⌛ Disptaching to Socket...' : '🚀 Dispatch Direct Test Message'}
            </button>
          </div>
        </div>
      )}

      {/* Sub-Tab C2: Master Queue Metrics */}
      {activeSubTabC === 'metrics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <h4 style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 4 }}>📊 Master Queue & Pacing Metrics</h4>
              <p className="text-muted" style={{ fontSize: '0.85rem' }}>Real-time oversight of pending dispatches, hourly caps, and emergency controls.</p>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button 
                className={`btn ${queueData?.isPaused ? 'btn-success' : 'btn-warning'}`}
                onClick={handleTogglePause}
                style={{ padding: '8px 18px', fontSize: '0.85rem', fontWeight: 700 }}
              >
                {queueData?.isPaused ? '▶️ Resume Master Queue' : '⏸️ Master Emergency Pause'}
              </button>
              <button 
                className="btn btn-danger"
                onClick={handleClearQueue}
                style={{ padding: '8px 18px', fontSize: '0.85rem', fontWeight: 700 }}
              >
                🗑️ Clear Pending Queue
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div style={{ background: 'var(--bg-active)', padding: 24, borderRadius: 20, textAlign: 'center', border: '1px solid var(--border)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
               <div style={{ fontSize: '0.85rem', opacity: 0.6, fontWeight: 800, marginBottom: 8 }}>PENDING QUEUE BUFFER</div>
               <div style={{ fontSize: '2.5rem', fontWeight: 800, color: queueData?.queueCount > 0 ? 'var(--orange)' : 'var(--text)' }}>
                 {queueData?.queueCount || 0}
               </div>
               <div style={{ fontSize: '0.75rem', opacity: 0.5, marginTop: 4 }}>Messages awaiting pacing delay</div>
            </div>
            <div style={{ background: 'var(--bg-active)', padding: 24, borderRadius: 20, textAlign: 'center', border: '1px solid var(--border)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
               <div style={{ fontSize: '0.85rem', opacity: 0.6, fontWeight: 800, marginBottom: 8 }}>SENT THIS HOUR</div>
               <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--green)' }}>
                 {queueData?.hourlyCount || 0} <span style={{ fontSize: '1.2rem', opacity: 0.5 }}>/ {settings.max_per_hour}</span>
               </div>
               <div style={{ fontSize: '0.75rem', opacity: 0.5, marginTop: 4 }}>Resets automatically every 60m</div>
            </div>
            <div style={{ background: 'var(--bg-active)', padding: 24, borderRadius: 20, textAlign: 'center', border: '1px solid var(--border)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
               <div style={{ fontSize: '0.85rem', opacity: 0.6, fontWeight: 800, marginBottom: 8 }}>QUEUE GOVERNANCE STATUS</div>
               <div style={{ fontSize: '1.8rem', fontWeight: 800, color: queueData?.isPaused ? 'var(--red)' : 'var(--green)', marginTop: 8 }}>
                 {queueData?.isPaused ? 'PAUSED ⏸️' : 'ACTIVE ▶️'}
               </div>
               <div style={{ fontSize: '0.75rem', opacity: 0.5, marginTop: 4 }}>{queueData?.isPaused ? 'All dispatches halted' : 'Pacing engine running smoothly'}</div>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Tab C3: Live Delivery Audit */}
      {activeSubTabC === 'audit' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h4 style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 4 }}>📜 Live Delivery Audit Radar</h4>
              <p className="text-muted" style={{ fontSize: '0.85rem' }}>Verifiable audit log of recent automated dispatches and socket delivery responses.</p>
            </div>
            <span style={{ fontSize: '0.8rem', background: '#334155', padding: '4px 12px', borderRadius: 12, color: '#94a3b8', fontWeight: 700 }}>Auto-updating (4s)</span>
          </div>

          <div style={{ maxHeight: 400, overflowY: 'auto', background: 'var(--bg-active)', borderRadius: 16, border: '1px solid var(--border)', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }}>
            {queueData?.auditLogs && queueData.auditLogs.length > 0 ? (
              <table className="w-full" style={{ fontSize: '0.85rem' }}>
                <thead style={{ background: 'var(--bg-header)', position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr>
                    <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 800 }}>Timestamp</th>
                    <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 800 }}>Customer Phone</th>
                    <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 800 }}>Dispatch Status</th>
                    <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 800 }}>Socket Diagnostic Response</th>
                  </tr>
                </thead>
                <tbody>
                  {queueData.auditLogs.map((log, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-dim)' }}>
                      <td style={{ padding: '14px 20px', opacity: 0.7 }}>{log.time}</td>
                      <td style={{ padding: '14px 20px', fontWeight: 800 }}>+{log.phone}</td>
                      <td style={{ padding: '14px 20px' }}>
                        <span style={{ 
                          padding: '6px 12px', 
                          borderRadius: 20, 
                          fontSize: '0.75rem', 
                          fontWeight: 800,
                          background: log.status === 'Sent' ? 'var(--green-dim)' : 'var(--red-dim)',
                          color: log.status === 'Sent' ? 'var(--green)' : 'var(--red)'
                        }}>
                          {log.status}
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px', opacity: 0.8, color: log.error ? 'var(--red)' : 'inherit', fontWeight: log.error ? 700 : 500 }}>
                        {log.error || 'OK — Delivered successfully to Baileys WebSocket buffer'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ padding: 40, textAlign: 'center', opacity: 0.5, fontSize: '0.9rem', fontWeight: 600 }}>
                No automated messages dispatched in this session yet. Outgoing dispatches will appear here instantly.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
