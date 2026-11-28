import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

export default function ReadyTagCleanupModal({ show, onClose, onCleanupStarted }) {
  const { activeStore, addToast } = useApp();
  const [days, setDays] = useState(30);
  const [scope, setScope] = useState('current');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [running, setRunning] = useState(false);
  const [preview, setPreview] = useState(null);

  if (!show) return null;

  const getAuthHeaders = (withJson = false) => {
    const token = localStorage.getItem('trace_token') || localStorage.getItem('token') || '';
    const h = {};
    if (withJson) h['Content-Type'] = 'application/json';
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  };

  const handlePreview = async () => {
    setLoadingPreview(true);
    setPreview(null);
    try {
      const storeId = activeStore?.id || 1;
      const res = await fetch(
        `/api/orders/ready-tag/preview?days=${days}&scope=${scope}&store_id=${storeId}`,
        { headers: getAuthHeaders() }
      );
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Preview scan failed');
      setPreview(data);
    } catch (err) {
      addToast(`❌ ${err.message}`, 'error');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleRunCleanup = async () => {
    const totalRemove = (preview?.stores || []).reduce((s, r) => s + (r.to_remove || 0), 0);
    const totalConfirm = (preview?.stores || []).reduce((s, r) => s + (r.to_confirm || 0), 0);
    const targetLabel = scope === 'all' ? 'ALL Active Stores' : (activeStore?.store_name || activeStore?.shop_domain || 'Current Store');

    if (!window.confirm(`Run Ready to Book tag cleanup on ${targetLabel} (Last ${days} days)?\n\n• Remove stale "Ready to Book" tag on Shopify & ERP: ${totalRemove} fulfilled/tracked orders\n• Auto-confirm unfulfilled tagged orders in ERP: ${totalConfirm} orders`)) {
      return;
    }

    setRunning(true);
    try {
      const res = await fetch('/api/orders/ready-tag/cleanup', {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify({ days, scope, store_id: activeStore?.id || 1 })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Cleanup start failed');
      addToast(`🧹 ${data.message}`, 'success');
      if (onCleanupStarted) onCleanupStarted();
      onClose();
    } catch (err) {
      addToast(`❌ ${err.message}`, 'error');
    } finally {
      setRunning(false);
    }
  };

  const totalRemove = (preview?.stores || []).reduce((s, r) => s + (r.to_remove || 0), 0);
  const totalConfirm = (preview?.stores || []).reduce((s, r) => s + (r.to_confirm || 0), 0);

  return (
    <div
      className="eom-backdrop"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !running) onClose(); }}
    >
      <div
        className="eom-shell"
        style={{ maxWidth: 680, maxHeight: '86vh' }}
      >
        <div className="eom-header" style={{ paddingBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                🏷️ Clean Stale "Ready to Book" Tags
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                Removes leftover <code>Ready to Book</code> tags from already Fulfilled/Tracked Shopify orders &amp; auto-confirms unfulfilled tagged orders in ERP.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={running}
              style={{
                background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                border: '1px solid var(--border-bright)', padding: '6px 12px',
                borderRadius: 9, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer'
              }}
            >
              ✕ Close
            </button>
          </div>
        </div>

        <div className="eom-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="eom-label">Date Window</label>
              <select
                className="eom-select"
                value={days}
                onChange={(e) => { setDays(Number(e.target.value)); setPreview(null); }}
              >
                <option value={7}>Last 7 Days</option>
                <option value={14}>Last 14 Days</option>
                <option value={30}>Last 30 Days (Recommended)</option>
                <option value={60}>Last 60 Days</option>
              </select>
            </div>
            <div>
              <label className="eom-label">Store Scope</label>
              <select
                className="eom-select"
                value={scope}
                onChange={(e) => { setScope(e.target.value); setPreview(null); }}
              >
                <option value="current">Current Store ({activeStore?.store_name || activeStore?.shop_domain || 'Active'})</option>
                <option value="all">All Active Connected Stores</option>
              </select>
            </div>
          </div>

          <div style={{
            fontSize: '0.73rem',
            color: 'var(--text-secondary)',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '8px 12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap'
          }}>
            <span>🛡️ Frozen store (<code>1i7tnb-bb.myshopify.com</code>) is permanently excluded.</span>
            <button
              type="button"
              onClick={handlePreview}
              disabled={loadingPreview || running}
              style={{
                background: '#4f46e5', color: '#fff', border: 'none',
                padding: '7px 14px', borderRadius: 9, fontSize: '0.78rem',
                fontWeight: 700, cursor: 'pointer'
              }}
            >
              {loadingPreview ? '⏳ Scanning Shopify...' : '🔍 Scan & Preview (Dry Run)'}
            </button>
          </div>

          {preview && (
            <div className="eom-card" style={{ overflow: 'hidden' }}>
              <div className="eom-card-header" style={{ fontSize: '0.82rem' }}>
                <span>📊 Dry-Run Scan Results (Last {preview.days} Days)</span>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                  Remove: <strong style={{ color: '#e11d48' }}>{totalRemove}</strong> · Auto-Confirm: <strong style={{ color: '#059669' }}>{totalConfirm}</strong>
                </span>
              </div>
              <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(preview.stores || []).map(st => (
                  <div
                    key={st.store_id}
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      padding: '10px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <div>
                        <strong style={{ fontSize: '0.84rem', color: 'var(--text-primary)' }}>{st.store_name || st.shop_domain}</strong>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: 8 }}>{st.shop_domain}</span>
                      </div>
                      {st.error ? (
                        <span style={{ fontSize: '0.74rem', color: '#dc2626', fontWeight: 700 }}>❌ {st.error}</span>
                      ) : (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <span style={{ background: 'rgba(239,68,68,0.12)', color: '#dc2626', padding: '2px 8px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700 }}>
                            🧹 Remove Tag: {st.to_remove}
                          </span>
                          <span style={{ background: 'rgba(16,185,129,0.12)', color: '#059669', padding: '2px 8px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700 }}>
                            ✅ Auto-Confirm: {st.to_confirm}
                          </span>
                        </div>
                      )}
                    </div>
                    {st.sample_remove?.length > 0 && (
                      <div style={{ fontSize: '0.71rem', color: 'var(--text-secondary)' }}>
                        Fulfilled orders with stale tag: <code>{st.sample_remove.join(', ')}</code>{st.to_remove > st.sample_remove.length ? ` +${st.to_remove - st.sample_remove.length} more` : ''}
                      </div>
                    )}
                    {st.sample_confirm?.length > 0 && (
                      <div style={{ fontSize: '0.71rem', color: 'var(--text-secondary)' }}>
                        Unfulfilled orders to Confirm: <code>{st.sample_confirm.join(', ')}</code>{st.to_confirm > st.sample_confirm.length ? ` +${st.to_confirm - st.sample_confirm.length} more` : ''}
                      </div>
                    )}
                  </div>
                ))}
                {(preview.stores || []).length === 0 && (
                  <div style={{ textAlign: 'center', padding: 16, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    No eligible active stores found.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="eom-footer">
          <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
            New orders are auto-cleaned automatically via Shopify webhooks &amp; sync.
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={running}
              style={{
                background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                border: '1px solid var(--border-bright)', padding: '8px 14px',
                borderRadius: 9, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRunCleanup}
              disabled={!preview || running || (totalRemove === 0 && totalConfirm === 0)}
              style={{
                background: (!preview || (totalRemove === 0 && totalConfirm === 0)) ? 'var(--bg-elevated)' : '#e11d48',
                color: (!preview || (totalRemove === 0 && totalConfirm === 0)) ? 'var(--text-muted)' : '#fff',
                border: 'none',
                padding: '8px 16px',
                borderRadius: 9,
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: (!preview || (totalRemove === 0 && totalConfirm === 0)) ? 'not-allowed' : 'pointer'
              }}
            >
              {running ? '⏳ Starting...' : `🧹 Run Cleanup (${totalRemove + totalConfirm})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
