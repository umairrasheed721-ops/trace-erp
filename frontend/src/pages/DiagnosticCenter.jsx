import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';

export default function DiagnosticCenter() {
  const { user, activeStoreId } = useApp();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeAudit, setActiveAudit] = useState(null); // which audit button is running
  const [auditResult, setAuditResult] = useState(null);
  const [smokeStatus, setSmokeStatus] = useState(null);
  const [smokeLoading, setSmokeLoading] = useState(false);
  const [remoteLogs, setRemoteLogs] = useState([]);
  const [healingImages, setHealingImages] = useState(false);
  const [healResult, setHealResult] = useState(null);
  const logEndRef = useRef(null);

  const fetchStats = async () => {
    try {
      if (!activeStoreId) return;
      const res = await fetch(`/api/diagnostics/stats?store_id=${activeStoreId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
      });
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch stats', err);
    }
  };

  const runSmokeTest = async () => {
    setSmokeLoading(true);
    setSmokeStatus(null);
    try {
      if (!activeStoreId) return;
      const res = await fetch(`/api/diagnostics/smoke-test?store_id=${activeStoreId}`);
      const data = await res.json();
      setSmokeStatus(data.results);
    } catch (err) {
      alert('Smoke test failed');
    } finally {
      setSmokeLoading(false);
    }
  };

  const runAudit = async (type) => {
    setActiveAudit(type);
    setAuditResult(null);
    try {
      if (!activeStoreId) return;
      const res = await fetch(`/api/diagnostics/audit/${type}?store_id=${activeStoreId}`);
      const data = await res.json();
      setAuditResult({ type, data: data.results });
    } catch (err) {
      alert('Audit failed: ' + err.message);
    } finally {
      setActiveAudit(null);
    }
  };

  const healImages = async () => {
    setHealingImages(true);
    setHealResult(null);
    try {
      let totalHealed = 0;
      let hasMore = true;
      while (hasMore) {
        const res = await fetch('/api/diagnostics/heal/line-items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ store_id: activeStoreId })
        });
        const data = await res.json();
        totalHealed += data.healedCount;
        hasMore = data.remaining;
        if (data.healedCount === 0) break;
      }
      setHealResult({ type: 'images', count: totalHealed });
      fetchStats();
    } catch (err) { alert('Mass-Restore failed: ' + err.message); }
    finally { setHealingImages(false); }
  };

  useEffect(() => {
    if (activeStoreId) fetchStats();
  }, [activeStoreId]);

  useEffect(() => {
    const fetchInitialLogs = async () => {
      try {
        const res = await fetch('/api/diagnostics/logs');
        const data = await res.json();
        const formatted = data.map(log => ({
          ts: log.created_at,
          msg: `[${log.module.toUpperCase()}] ${log.message}`
        }));
        setRemoteLogs(formatted.reverse());
      } catch (err) {
        console.error('Failed to fetch initial logs', err);
      }
    };
    fetchInitialLogs();

    const token = localStorage.getItem('trace_token');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}?token=${encodeURIComponent(token)}`;
    let socket;
    try {
      socket = new WebSocket(wsUrl);
      socket.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.event === 'error_logged') {
            setRemoteLogs(prev => [...prev.slice(-99), { ts: parsed.data.ts, msg: parsed.data.msg }]);
          }
        } catch (e) {}
      };
    } catch (err) { console.error(err); }

    return () => { if (socket) socket.close(); };
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [remoteLogs]);

  const handleDownloadLogs = () => window.open('/api/diagnostics/remote-logs', '_blank');
  const handleClearLogs = async () => {
    if (!confirm('Clear all remote logs?')) return;
    try {
      await fetch('/api/diagnostics/remote-logs/clear', { method: 'POST' });
      setRemoteLogs([]);
    } catch (err) { alert('Failed to clear logs: ' + err.message); }
  };

  if (user?.role !== 'admin' && user?.role !== 'owner') {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--red)' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <h2 style={{ color: 'var(--text-primary)' }}>Access Denied</h2>
        <p style={{ color: 'var(--text-muted)' }}>This area is restricted to Admins & Owners only.</p>
      </div>
    );
  }

  const auditTools = [
    {
      id: 'orphaned-costs', label: 'Find Orphaned Costs', icon: '🔗', color: 'var(--orange)', bg: 'var(--orange-dim)',
      tip: 'Finds cost entries in your registry that no longer match any active Shopify product variant. Safe to clean up these stale records.'
    },
    {
      id: 'duplicates', label: 'Duplicate Watchdog', icon: '🕵️', color: 'var(--yellow)', bg: 'var(--yellow-dim)',
      tip: 'Detects orders that have been processed or reconciled more than once. Critical to catch before payout calculations are finalized.'
    },
    {
      id: 'missing-master-costs', label: 'Inventory Leak Audit', icon: '📦', color: 'var(--blue)', bg: 'var(--blue-dim)',
      tip: 'Finds variants in Shopify with stock but no cost mapping in the Master Registry. These are invisible profit leaks waiting to happen.'
    },
    {
      id: 'profit-anomalies', label: 'Profit Anomalies', icon: '📉', color: 'var(--purple)', bg: 'var(--purple-dim)',
      tip: 'Highlights orders where margin is suspiciously high (>90%) or negative — usually caused by wrong cost data or courier fee errors.'
    },
  ];

  return (
    <div className="page-container" style={{ maxWidth: 1300 }}>

      {/* ── Header ── */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 className="page-title">🛠️ Diagnostic Command Center</h1>
          <p className="page-subtitle">Deep system audits, real-time error monitoring, and one-click data healing.</p>
        </div>
        <button
          onClick={fetchStats}
          style={{
            padding: '10px 18px', borderRadius: 8, border: '1px solid var(--border-bright)',
            background: 'var(--bg-elevated)', color: 'var(--text-primary)',
            fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8
          }}
        >
          🔄 Refresh Stats
        </button>
      </header>

      {/* ── KPI Stats ── */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          {[
            { label: 'Total Orders', value: stats.orders, icon: '📦', color: 'var(--blue)', bg: 'var(--blue-dim)' },
            { label: 'Audit Logs', value: stats.auditLogs, icon: '📋', color: 'var(--purple)', bg: 'var(--purple-dim)' },
            { label: 'Fragmentation', value: stats.missingItems, icon: '⚠️', color: stats.missingItems > 0 ? 'var(--yellow)' : 'var(--green)', bg: stats.missingItems > 0 ? 'var(--yellow-dim)' : 'var(--green-dim)' },
            { label: 'Memory Usage', value: `${stats.memory?.toFixed(1)} MB`, icon: '🧠', color: stats.memory > 400 ? 'var(--red)' : 'var(--green)', bg: stats.memory > 400 ? 'var(--red-dim)' : 'var(--green-dim)' },
          ].map((s, i) => (
            <div key={i} className="stat-card" style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              position: 'relative', overflow: 'hidden'
            }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: s.color }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: 8, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                  {s.icon}
                </div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: s.color, lineHeight: 1, marginBottom: 4 }}>{s.value ?? '—'}</div>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Two-column: Smoke Test + Audit Tools ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

        {/* Connectivity / Smoke Test */}
        <div className="stat-card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border)' }}>
          <div style={{
            padding: '16px 20px', borderBottom: '1px solid var(--border)',
            background: 'var(--bg-elevated)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <h3 style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              🚀 Connectivity Status
            </h3>
            <button
              onClick={runSmokeTest}
              disabled={smokeLoading}
              style={{
                padding: '7px 14px', borderRadius: 7, border: '1px solid var(--border-bright)',
                background: 'var(--bg-surface)', color: 'var(--text-primary)',
                fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer'
              }}
            >
              {smokeLoading ? '⌛ Checking...' : '▶ Run Smoke Test'}
            </button>
          </div>
          <div style={{ padding: 20 }}>
            {smokeLoading ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
                <p style={{ margin: 0, fontSize: '0.85rem' }}>Running pre-flight checks...</p>
              </div>
            ) : smokeStatus ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <ServiceRow label="Database Health" status={smokeStatus.database} />
                {smokeStatus.shopify?.map((s, i) => (
                  <ServiceRow key={i} label={s.domain} status={s.status} />
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>🔌</div>
                <p style={{ margin: 0, fontSize: '0.85rem' }}>Click "Run Smoke Test" to verify API health across all services.</p>
              </div>
            )}
          </div>
        </div>

        {/* Health Audits */}
        <div className="stat-card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border)' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
            <h3 style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>🔬 Health Audits</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Run targeted scans to detect data issues.</p>
          </div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {auditTools.map(tool => (
              <button
                key={tool.id}
                onClick={() => runAudit(tool.id)}
                disabled={activeAudit !== null}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', borderRadius: 8,
                  border: `1px solid ${activeAudit === tool.id ? tool.color : 'var(--border)'}`,
                  background: activeAudit === tool.id ? tool.bg : 'var(--bg-elevated)',
                  color: 'var(--text-primary)', cursor: activeAudit !== null ? 'not-allowed' : 'pointer',
                  textAlign: 'left', transition: 'all 0.2s ease',
                  opacity: activeAudit !== null && activeAudit !== tool.id ? 0.5 : 1,
                  width: '100%'
                }}
                onMouseEnter={e => { if (!activeAudit) { e.currentTarget.style.background = tool.bg; e.currentTarget.style.border = `1px solid ${tool.color}`; } }}
                onMouseLeave={e => { if (activeAudit !== tool.id) { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.border = '1px solid var(--border)'; } }}
              >
                {/* Icon */}
                <span style={{
                  fontSize: 20, width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: activeAudit === tool.id ? tool.color + '33' : 'var(--bg-hover)'
                }}>
                  {activeAudit === tool.id ? '⏳' : tool.icon}
                </span>

                {/* Label + Tip */}
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                  <span style={{ fontWeight: 600, fontSize: '0.88rem', color: activeAudit === tool.id ? tool.color : 'var(--text-primary)' }}>
                    {activeAudit === tool.id ? `Running ${tool.label}...` : tool.label}
                  </span>
                  {activeAudit !== tool.id && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400, lineHeight: 1.4 }}>
                      {tool.tip}
                    </span>
                  )}
                </span>

                {/* Arrow */}
                <span style={{ fontSize: 16, opacity: 0.3, flexShrink: 0 }}>›</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Audit Results ── */}
      {auditResult && (
        <div className="stat-card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 20 }}>
          <div style={{
            padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h4 style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                Audit Results: <span style={{ color: 'var(--blue)' }}>{auditResult.type}</span>
              </h4>
              <span style={{
                padding: '3px 10px', borderRadius: 12, fontSize: '0.72rem', fontWeight: 700,
                background: auditResult.data.length > 0 ? 'var(--red-dim)' : 'var(--green-dim)',
                color: auditResult.data.length > 0 ? 'var(--red)' : 'var(--green)',
                border: `1px solid ${auditResult.data.length > 0 ? 'var(--red)' : 'var(--green)'}`
              }}>
                {auditResult.data.length > 0 ? `${auditResult.data.length} issues found` : '✅ All Clear'}
              </span>
            </div>

          </div>
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {auditResult.data.length === 0 ? (
              <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--green)' }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
                <p style={{ margin: 0, fontWeight: 600 }}>No issues found! System is healthy.</p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-elevated)', zIndex: 5 }}>
                  <tr>
                    {Object.keys(auditResult.data[0]).map(key => (
                      <th key={key} style={{
                        padding: '10px 14px', textAlign: 'left', fontWeight: 600,
                        fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase',
                        letterSpacing: '0.06em', borderBottom: '1px solid var(--border)'
                      }}>
                        {key.replace(/_/g, ' ')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {auditResult.data.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-hover)' }}>
                      {Object.values(row).map((val, j) => (
                        <td key={j} style={{ padding: '10px 14px', color: 'var(--text-primary)' }}>{String(val)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── God-Tier Repair ── */}
      <div className="stat-card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--purple)', background: 'var(--purple-dim)', marginBottom: 20 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(168,85,247,0.2)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>✨</span>
          <div>
            <h3 style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: 'var(--purple)' }}>Automated Repair — God Mode</h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>One-click solutions to repair common data fragmentation issues.</p>
          </div>
        </div>
        <div style={{ padding: 20, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={healImages}
            disabled={healingImages}
            style={{
              padding: '12px 22px', borderRadius: 8, border: 'none',
              background: 'linear-gradient(135deg, #10b981, #0d9488)',
              color: '#fff', fontWeight: 700, cursor: healingImages ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 16px rgba(16,185,129,0.3)', display: 'flex', alignItems: 'center', gap: 8
            }}
          >
            {healingImages ? '⏳ Restoring...' : '🖼️ Mass-Restore Missing Images'}
          </button>

          {healResult && (
            <div style={{
              marginLeft: 'auto', padding: '10px 16px', borderRadius: 8,
              background: 'var(--green-dim)', border: '1px solid var(--green)',
              display: 'flex', alignItems: 'center', gap: 8
            }}>
              <span style={{ color: 'var(--green)', fontWeight: 700, fontSize: '0.85rem' }}>
                ✅ Restored items for {healResult.count} orders
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Real-Time Error Console ── */}
      <div className="stat-card" style={{ padding: 0, overflow: 'hidden', border: '1px solid rgba(239,68,68,0.3)' }}>
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid rgba(239,68,68,0.2)',
          background: 'rgba(239,68,68,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <h3 style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 8, height: 8, background: 'var(--red)', borderRadius: '50%',
              boxShadow: '0 0 0 0 rgba(239,68,68,0.4)',
              animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite',
              display: 'inline-block'
            }} />
            Real-Time Remote Error Stream
            {remoteLogs.length > 0 && (
              <span style={{ fontSize: '0.72rem', background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid var(--red)', borderRadius: 10, padding: '2px 8px', fontWeight: 700 }}>
                {remoteLogs.length}
              </span>
            )}
          </h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleDownloadLogs}
              style={{
                padding: '6px 12px', borderRadius: 6, background: 'transparent',
                border: '1px solid var(--border-bright)', color: 'var(--text-secondary)',
                fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer'
              }}
            >
              📥 Download
            </button>
            <button
              onClick={handleClearLogs}
              style={{
                padding: '6px 12px', borderRadius: 6, background: 'transparent',
                border: '1px solid rgba(239,68,68,0.4)', color: 'var(--red)',
                fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer'
              }}
            >
              🗑️ Clear
            </button>
          </div>
        </div>

        {/* Terminal */}
        <div style={{
          background: '#0d0e12', fontFamily: 'monospace', fontSize: '0.78rem',
          color: '#f87171', padding: '16px', height: 280, overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 2
        }}>
          {remoteLogs.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.4 }}>
              <span style={{ fontSize: 28, marginBottom: 8 }}>👁️</span>
              <span>Monitoring live error stream... No events yet.</span>
            </div>
          ) : (
            remoteLogs.map((log, index) => (
              <div key={index} style={{
                display: 'flex', gap: 12, padding: '2px 0',
                borderBottom: '1px solid rgba(255,255,255,0.03)'
              }}>
                <span style={{ color: '#6b7280', flexShrink: 0, fontSize: '0.72rem' }}>
                  [{new Date(log.ts).toLocaleTimeString()}]
                </span>
                <span style={{ wordBreak: 'break-all', color: log.msg.includes('ERROR') ? '#f87171' : '#a3a3a3' }}>
                  {log.msg}
                </span>
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      </div>

      <style>{`
        @keyframes ping {
          75%, 100% { transform: scale(2); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function ServiceRow({ label, status }) {
  const isOk = status === 'OK' || status === 'connected';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 14px', borderRadius: 8,
      background: isOk ? 'var(--green-dim)' : 'var(--red-dim)',
      border: `1px solid ${isOk ? 'var(--green)' : 'var(--red)'}`
    }}>
      <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <span style={{
        padding: '3px 10px', borderRadius: 12, fontSize: '0.7rem', fontWeight: 700,
        background: isOk ? 'var(--green)' : 'var(--red)', color: '#fff'
      }}>
        {isOk ? '✓ OK' : '✗ FAIL'}
      </span>
    </div>
  );
}
