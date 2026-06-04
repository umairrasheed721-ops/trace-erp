import React, { useState, useEffect } from 'react';
import ErrorBoundary from '../ErrorBoundary';
import { useApp } from '../../context/AppContext';

function SyncDashboard() {
  const { addToast, token } = useApp();
  const [metrics, setMetrics] = useState({ pending: 0, resolved: 0, failed: 0 });
  const [orphanedList, setOrphanedList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [message, setMessage] = useState('');
  const [collapsed, setCollapsed] = useState(true);

  const apiUrl = import.meta.env.VITE_API_URL || '';

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/sync/reconciliation/stats`, {
        headers: {
          'Authorization': `Bearer ${token || localStorage.getItem('trace_token')}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setMetrics(data.metrics);
          setOrphanedList(data.orphanedList);
        }
      } else {
        console.error(`Failed to fetch stats: HTTP ${res.status}`);
      }
    } catch (err) {
      console.error('Failed to fetch reconciliation stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token || localStorage.getItem('trace_token')) {
      fetchStats();
    }
  }, [token]);

  const triggerReconciliation = async () => {
    setIsReconciling(true);
    setMessage('Reconciliation running...');
    try {
      const res = await fetch(`${apiUrl}/api/sync/reconciliation/run`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token || localStorage.getItem('trace_token')}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          const successMsg = `Reconciliation finished! Resolved: ${data.results?.totalResolved || 0}, Failed: ${data.results?.totalFailed || 0}`;
          setMessage(`Success: Resolved: ${data.results?.totalResolved || 0}, Failed: ${data.results?.totalFailed || 0}`);
          addToast(successMsg, 'success');
          fetchStats();
        } else {
          const errMsg = `Reconciliation failed: ${data.message || 'Unknown error'}`;
          setMessage(errMsg);
          addToast(errMsg, 'error');
        }
      } else {
        const errMsg = `Reconciliation failed: HTTP ${res.status}`;
        setMessage(errMsg);
        addToast(errMsg, 'error');
      }
    } catch (err) {
      const errMsg = `Network Error: ${err.message}`;
      setMessage(errMsg);
      addToast(errMsg, 'error');
    } finally {
      setIsReconciling(false);
      setTimeout(() => setMessage(''), 10000);
    }
  };

  return (
    <div className="card glass-panel" style={{ padding: '16px', marginBottom: '16px', borderRadius: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setCollapsed(!collapsed)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1.2rem' }}>🔄</span>
          <h4 style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem' }}>Logistics Tracking Reconciliation Dashboard</h4>
          <span className="badge" style={{
            fontSize: '0.65rem',
            padding: '2px 8px',
            background: 'var(--brand-glow)',
            color: 'var(--brand)',
            borderRadius: '12px',
            border: '1px solid var(--brand)',
            marginLeft: '8px'
          }}>
            PostEx Sync Engine
          </span>
        </div>
        <button className="btn btn-secondary btn-sm" style={{ padding: '2px 8px', fontSize: '0.75rem' }}>
          {collapsed ? 'Expand Dashboard ▾' : 'Collapse Dashboard ▴'}
        </button>
      </div>

      {!collapsed && (
        <div style={{ marginTop: '16px', animation: 'fadeIn 0.3s ease-in-out' }}>
          {/* Status Metrics Cards Grid */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <div className="kpi-card blue" style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', padding: '12px', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.2)', background: 'rgba(59, 130, 246, 0.05)' }}>
              <span style={{ fontSize: '0.75rem', opacity: 0.7, fontWeight: 600 }}>Pending Syncs</span>
              <span style={{ fontSize: '1.5rem', fontWeight: 800, margin: '4px 0' }}>{metrics.pending}</span>
              <span style={{ fontSize: '0.65rem', opacity: 0.5 }}>Fulfilled in ERP, missing tracking</span>
            </div>
            <div className="kpi-card green" style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', padding: '12px', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.2)', background: 'rgba(16, 185, 129, 0.05)' }}>
              <span style={{ fontSize: '0.75rem', opacity: 0.7, fontWeight: 600 }}>Successfully Resolved</span>
              <span style={{ fontSize: '1.5rem', fontWeight: 800, margin: '4px 0', color: '#10B981' }}>{metrics.resolved}</span>
              <span style={{ fontSize: '0.65rem', opacity: 0.5 }}>Reconciled & synced to Shopify</span>
            </div>
            <div className="kpi-card red" style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', padding: '12px', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)', background: 'rgba(239, 68, 68, 0.05)' }}>
              <span style={{ fontSize: '0.75rem', opacity: 0.7, fontWeight: 600 }}>Failed Syncs</span>
              <span style={{ fontSize: '1.5rem', fontWeight: 800, margin: '4px 0', color: '#EF4444' }}>{metrics.failed}</span>
              <span style={{ fontSize: '0.65rem', opacity: 0.5 }}>Failed PostEx lookup / Shopify sync</span>
            </div>
          </div>

          {/* Action Row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', paddingBottom: '12px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                className="btn btn-primary"
                onClick={triggerReconciliation}
                disabled={isReconciling}
                style={{
                  padding: '8px 16px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'var(--brand)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: isReconciling ? 'not-allowed' : 'pointer',
                  opacity: isReconciling ? 0.7 : 1
                }}
              >
                {isReconciling ? (
                  <>
                    <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" style={{ width: '12px', height: '12px', border: '2px solid #fff', borderRightColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.75s linear infinite' }}></span>
                    Running...
                  </>
                ) : 'Run Reconciliation Now'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={fetchStats}
                disabled={loading}
                style={{ padding: '8px 12px', fontSize: '0.8rem' }}
              >
                🔄 Refresh Stats
              </button>
            </div>
            {message && (
              <span style={{
                fontSize: '0.75rem',
                color: message.startsWith('Success') ? '#10B981' : (message.startsWith('Network') || message.startsWith('Failed') ? '#EF4444' : 'var(--brand)'),
                fontWeight: 600
              }}>
                {message}
              </span>
            )}
          </div>

          {/* Orphaned List Section */}
          <div style={{ marginTop: '16px' }}>
            <h5 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', fontWeight: 600, opacity: 0.9 }}>Orphaned Orders (Failed Syncs)</h5>
            {orphanedList.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '6px', border: '1px dashed rgba(255, 255, 255, 0.1)' }}>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>No orphaned orders found. All fulfilled orders synced cleanly!</p>
              </div>
            ) : (
              <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '6px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255, 255, 255, 0.05)', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                      <th style={{ padding: '8px' }}>Order Ref</th>
                      <th style={{ padding: '8px' }}>Error Details</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Last Attempted At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orphanedList.map((item) => (
                      <tr key={item.order_id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <td style={{ padding: '8px', fontWeight: 600, color: 'var(--brand)' }}>{item.order_ref}</td>
                        <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{item.error_message || 'Unknown PostEx lookup error'}</td>
                        <td style={{ padding: '8px', textAlign: 'right', opacity: 0.7 }}>
                          {new Date(item.last_attempted_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SyncDashboardWithBoundary(props) {
  return (
    <ErrorBoundary>
      <SyncDashboard {...props} />
    </ErrorBoundary>
  );
}
