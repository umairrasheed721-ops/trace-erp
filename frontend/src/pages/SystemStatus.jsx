import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';

const LEVEL_COLOR = { INFO: '#6ee7b7', WARN: '#fcd34d', ERROR: '#f87171' };
const LEVEL_BG    = { INFO: 'rgba(110,231,183,0.08)', WARN: 'rgba(252,211,77,0.08)', ERROR: 'rgba(248,113,113,0.12)' };

function StatusBadge({ status }) {
  const colors = {
    OK: { bg: 'rgba(110,231,183,0.15)', text: '#6ee7b7', label: '✅ OK' },
    FAILED: { bg: 'rgba(248,113,113,0.15)', text: '#f87171', label: '❌ FAILED' },
    CONNECTED: { bg: 'rgba(110,231,183,0.15)', text: '#6ee7b7', label: '✅ CONNECTED' },
    QR_READY: { bg: 'rgba(252,211,77,0.15)', text: '#fcd34d', label: '🔲 QR_READY' },
    CONNECTING: { bg: 'rgba(147,197,253,0.15)', text: '#93c5fd', label: '🔄 CONNECTING' },
    DISCONNECTED: { bg: 'rgba(248,113,113,0.15)', text: '#f87171', label: '🔌 DISCONNECTED' },
    NOT_LOADED: { bg: 'rgba(156,163,175,0.15)', text: '#9ca3af', label: '⏸ NOT_LOADED' },
    UNKNOWN: { bg: 'rgba(156,163,175,0.15)', text: '#9ca3af', label: '❓ UNKNOWN' },
    FAILURE: { bg: 'rgba(248,113,113,0.15)', text: '#f87171', label: '💥 FAILURE' },
  };
  const c = colors[status] || colors.UNKNOWN;
  return (
    <span style={{ background: c.bg, color: c.text, padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {c.label}
    </span>
  );
}

export default function SystemStatus() {
  const { token } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const logEndRef = useRef(null);
  const intervalRef = useRef(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/admin/system-status', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error('Failed to fetch system status:', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchStatus, 5000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [autoRefresh, token]);

  const filteredLogs = (data?.recentLogs || [])
    .filter(l => filter === 'ALL' || l.level === filter)
    .slice().reverse(); // newest first

  const memPct = parseFloat(data?.memory?.percentUsed || 0);
  const memColor = memPct > 80 ? '#f87171' : memPct > 60 ? '#fcd34d' : '#6ee7b7';

  const failedModules = Object.entries(data?.modules || {}).filter(([, v]) => v.status === 'FAILED');
  const okModules = Object.entries(data?.modules || {}).filter(([, v]) => v.status === 'OK');

  return (
    <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-bright)' }}>
            🛡️ System Status
          </h2>
          <p style={{ margin: '4px 0 0', opacity: 0.5, fontSize: 13 }}>
            Live server diagnostics — no Railway agent needed
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 12, opacity: 0.5 }}>
            {autoRefresh ? '🟢 Auto-refresh (5s)' : '⏸ Paused'}
          </span>
          <button
            onClick={() => setAutoRefresh(a => !a)}
            className="btn btn-secondary"
            style={{ fontSize: 12, padding: '6px 14px' }}
          >
            {autoRefresh ? 'Pause' : '▶ Resume'}
          </button>
          <button onClick={fetchStatus} className="btn btn-primary" style={{ fontSize: 12, padding: '6px 14px' }}>
            🔄 Refresh Now
          </button>
        </div>
      </div>

      {loading && !data && (
        <div style={{ textAlign: 'center', padding: 60, opacity: 0.5 }}>Loading system status...</div>
      )}

      {data && (
        <>
          {/* Alert bar for failures */}
          {failedModules.length > 0 && (
            <div style={{ background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 12, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 20 }}>⚠️</span>
              <div>
                <div style={{ color: '#f87171', fontWeight: 700, fontSize: 14 }}>
                  {failedModules.length} module{failedModules.length > 1 ? 's' : ''} failed to load
                </div>
                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
                  {failedModules.map(([k]) => k).join(', ')} — those routes return 503, rest of ERP is fine
                </div>
              </div>
            </div>
          )}

          {/* Top Stats Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
            {[
              { label: 'Server Uptime', value: data.server?.uptimeHuman, icon: '⏱️', color: '#6ee7b7' },
              { label: 'Error Count', value: data.server?.errorCount, icon: '🚨', color: data.server?.errorCount > 0 ? '#f87171' : '#6ee7b7' },
              { label: 'Memory Used', value: `${data.memory?.rss}MB / ${data.memory?.limitMB}MB`, icon: '💾', color: memColor },
              { label: 'WhatsApp Bot', value: data.whatsappBot, icon: '🤖', color: data.whatsappBot === 'CONNECTED' ? '#6ee7b7' : '#fcd34d' },
            ].map(stat => (
              <div key={stat.label} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 20px' }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>{stat.icon}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                <div style={{ fontSize: 12, opacity: 0.5, marginTop: 4 }}>{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Memory Bar */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 20px', marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>💾 Memory Usage</span>
              <span style={{ color: memColor, fontWeight: 700 }}>{data.memory?.percentUsed}%</span>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, height: 10, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(memPct, 100)}%`, height: '100%', background: memColor, borderRadius: 8, transition: 'width 0.5s' }} />
            </div>
            <div style={{ display: 'flex', gap: 20, marginTop: 10, fontSize: 12, opacity: 0.6 }}>
              <span>RSS: {data.memory?.rss}MB</span>
              <span>Heap: {data.memory?.heapUsed}MB / {data.memory?.heapTotal}MB</span>
              <span>Node: {data.server?.nodeVersion}</span>
              <span>Started: {new Date(data.server?.startedAt).toLocaleTimeString()}</span>
            </div>
          </div>

          {/* Module Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            {/* OK Modules */}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 20px' }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700 }}>✅ Loaded Modules ({okModules.length})</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {okModules.map(([name, info]) => (
                  <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(110,231,183,0.05)', borderRadius: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{name}</span>
                    <StatusBadge status="OK" />
                  </div>
                ))}
              </div>
            </div>

            {/* Failed Modules */}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 20px' }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700 }}>
                {failedModules.length === 0 ? '🎉 All modules healthy' : `❌ Failed Modules (${failedModules.length})`}
              </h3>
              {failedModules.length === 0 ? (
                <div style={{ opacity: 0.5, fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No failures detected</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {failedModules.map(([name, info]) => (
                    <div key={name} style={{ padding: '10px 12px', background: 'rgba(248,113,113,0.08)', borderRadius: 8, border: '1px solid rgba(248,113,113,0.15)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#f87171' }}>{name}</span>
                        <StatusBadge status="FAILED" />
                      </div>
                      <code style={{ fontSize: 11, opacity: 0.7, wordBreak: 'break-all', display: 'block' }}>{info.error}</code>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent Errors */}
          {data.recentErrors?.length > 0 && (
            <div style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 14, padding: '16px 20px', marginBottom: 20 }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#f87171' }}>🚨 Recent Errors ({data.recentErrors.length})</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {data.recentErrors.map((log, i) => (
                  <div key={i} style={{ fontFamily: 'monospace', fontSize: 12, padding: '6px 10px', background: 'rgba(248,113,113,0.08)', borderRadius: 6 }}>
                    <span style={{ opacity: 0.5, marginRight: 8 }}>{new Date(log.ts).toLocaleTimeString()}</span>
                    <span style={{ color: '#f87171' }}>{log.msg}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Live Logs */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>📋 Server Logs ({data.recentLogs?.length} entries)</h3>
              <div style={{ display: 'flex', gap: 6 }}>
                {['ALL', 'INFO', 'WARN', 'ERROR'].map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    style={{
                      padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                      border: '1px solid var(--border)',
                      background: filter === f ? 'var(--accent)' : 'transparent',
                      color: filter === f ? 'white' : LEVEL_COLOR[f] || 'inherit',
                      cursor: 'pointer'
                    }}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: 12, maxHeight: 400, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {filteredLogs.length === 0 ? (
                <div style={{ opacity: 0.4, textAlign: 'center', padding: 20 }}>No {filter === 'ALL' ? '' : filter} logs</div>
              ) : filteredLogs.map((log, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '4px 8px', borderRadius: 4, background: LEVEL_BG[log.level] || 'transparent', alignItems: 'flex-start' }}>
                  <span style={{ opacity: 0.45, whiteSpace: 'nowrap', flexShrink: 0, fontSize: 11 }}>
                    {new Date(log.ts).toLocaleTimeString()}
                  </span>
                  <span style={{ color: LEVEL_COLOR[log.level] || '#fff', fontWeight: 600, flexShrink: 0, fontSize: 11, width: 36 }}>
                    {log.level}
                  </span>
                  <span style={{ opacity: 0.85, wordBreak: 'break-all' }}>{log.msg}</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
