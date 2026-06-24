import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

export default function MarketingIntelligence() {
  const { activeStoreId, token } = useApp();
  const [showMetaModal, setShowMetaModal] = useState(false);
  const [metaConfig, setMetaConfig] = useState({ ad_account_id: '', access_token: '' });
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState(null);
  const [dateRange, setDateRange] = useState('30');
  const [manualSpend, setManualSpend] = useState({ meta: '', google: '', tiktok: '' });
  const [platforms, setPlatforms] = useState([
    { id: 'meta', name: 'Meta Ads', icon: '📘', connected: false, color: 'var(--blue)', colorDim: 'var(--blue-dim)', badge: 'Facebook / Instagram' },
    { id: 'google', name: 'Google Ads', icon: '🔍', connected: false, color: 'var(--red)', colorDim: 'var(--red-dim)', badge: 'Search / Shopping / Display' },
    { id: 'tiktok', name: 'TikTok Ads', icon: '🎵', connected: false, color: 'var(--purple)', colorDim: 'var(--purple-dim)', badge: 'Short-form Video' },
  ]);

  useEffect(() => {
    if (activeStoreId) fetchMetrics();
  }, [activeStoreId]);

  const fetchMetrics = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/finance/marketing-metrics?store_id=${activeStoreId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setMetrics(data);

      const storeRes = await fetch(`/api/stores/${activeStoreId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const store = await storeRes.json();
      if (store.meta_ad_account_id) {
        setPlatforms(prev => prev.map(p => p.id === 'meta' ? { ...p, connected: true } : p));
        setMetaConfig({ ad_account_id: store.meta_ad_account_id, access_token: store.meta_access_token || '' });
      }
    } catch (e) {
      console.error('Failed to fetch metrics:', e);
    } finally {
      setLoading(false);
    }
  };

  const saveMetaConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/stores/${activeStoreId}/meta-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(metaConfig)
      });
      if (res.ok) { setShowMetaModal(false); fetchMetrics(); }
    } catch (e) {
      console.error('Failed to save meta config:', e);
    } finally {
      setLoading(false);
    }
  };

  const manualTotal = (parseFloat(manualSpend.meta) || 0) + (parseFloat(manualSpend.google) || 0) + (parseFloat(manualSpend.tiktok) || 0);
  const connectedCount = platforms.filter(p => p.connected).length;

  const kpis = [
    { label: 'Total Ad Spend', value: metrics?.totalSpend ? `${metrics.totalSpend.toLocaleString()} PKR` : '— PKR', sub: 'Last 30 days', icon: '💸', color: 'var(--orange)', bg: 'var(--orange-dim)' },
    { label: 'Avg. CAC', value: metrics?.cac ? `${metrics.cac.toLocaleString()} PKR` : '— PKR', sub: 'Cost per customer acquired', icon: '👤', color: 'var(--blue)', bg: 'var(--blue-dim)' },
    { label: 'True ROAS', value: metrics?.roas ? `${metrics.roas}x` : '—x', sub: 'Revenue per Rs. spent', icon: '📈', color: 'var(--green)', bg: 'var(--green-dim)' },
    { label: 'Net-Net Profit', value: metrics?.netProfit ? `${metrics.netProfit.toLocaleString()} PKR` : '— PKR', sub: 'After all costs & ad spend', icon: '💎', color: 'var(--purple)', bg: 'var(--purple-dim)' },
  ];

  return (
    <div className="page-container" style={{ maxWidth: 1300 }}>

      {/* ── Meta Connect Modal ── */}
      {showMetaModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            width: 460, background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)',
            borderRadius: 16, padding: 32, boxShadow: '0 24px 60px rgba(0,0,0,0.4)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <span style={{ fontSize: 28 }}>📘</span>
              <h3 style={{ margin: 0, fontWeight: 700, fontSize: '1.2rem', color: 'var(--text-primary)' }}>Connect Meta Ads</h3>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 24, marginTop: 4 }}>
              Enter your Meta Marketing API credentials to sync ad spend automatically.
            </p>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                Ad Account ID <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(including 'act_')</span>
              </label>
              <input
                type="text"
                placeholder="act_123456789"
                value={metaConfig.ad_account_id}
                onChange={e => setMetaConfig({ ...metaConfig, ad_account_id: e.target.value })}
                style={{
                  width: '100%', padding: '11px 14px', borderRadius: 8,
                  background: 'var(--bg-surface)', border: '1px solid var(--border-bright)',
                  color: 'var(--text-primary)', outline: 'none', fontSize: '0.9rem', boxSizing: 'border-box'
                }}
                onFocus={e => e.target.style.border = '1px solid var(--blue)'}
                onBlur={e => e.target.style.border = '1px solid var(--border-bright)'}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                System User / Long-Lived Access Token
              </label>
              <textarea
                rows={4}
                placeholder="EAAB..."
                value={metaConfig.access_token}
                onChange={e => setMetaConfig({ ...metaConfig, access_token: e.target.value })}
                style={{
                  width: '100%', padding: '11px 14px', borderRadius: 8,
                  background: 'var(--bg-surface)', border: '1px solid var(--border-bright)',
                  color: 'var(--text-primary)', outline: 'none', fontSize: '0.85rem',
                  resize: 'vertical', fontFamily: 'monospace', boxSizing: 'border-box'
                }}
                onFocus={e => e.target.style.border = '1px solid var(--blue)'}
                onBlur={e => e.target.style.border = '1px solid var(--border-bright)'}
              />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={saveMetaConfig}
                disabled={loading}
                style={{
                  flex: 1, padding: '12px', borderRadius: 8, border: 'none',
                  background: 'var(--blue)', color: '#fff', fontWeight: 700, cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(59,130,246,0.3)'
                }}
              >
                {loading ? 'Saving...' : '🔗 Save & Connect'}
              </button>
              <button
                onClick={() => setShowMetaModal(false)}
                style={{
                  padding: '12px 20px', borderRadius: 8, background: 'transparent',
                  border: '1px solid var(--border-bright)', color: 'var(--text-secondary)', cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 className="page-title">🧠 Marketing & Profitability Intelligence</h1>
          <p className="page-subtitle">Connect your ad accounts to see True Profit after marketing spend.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <select
            value={dateRange}
            onChange={e => setDateRange(e.target.value)}
            style={{
              padding: '10px 14px', borderRadius: 8, background: 'var(--bg-elevated)',
              border: '1px solid var(--border-bright)', color: 'var(--text-primary)',
              fontWeight: 500, cursor: 'pointer', outline: 'none'
            }}
          >
            <option value="7">📅 Last 7 Days</option>
            <option value="30">📅 Last 30 Days</option>
            <option value="90">📅 Last 90 Days</option>
          </select>
          <button
            onClick={fetchMetrics}
            disabled={loading}
            style={{
              padding: '10px 18px', borderRadius: 8, border: 'none',
              background: 'var(--blue)', color: '#fff', fontWeight: 600,
              cursor: 'pointer', boxShadow: '0 4px 12px rgba(59,130,246,0.25)'
            }}
          >
            {loading ? '🔄 Syncing...' : '🔄 Sync All Platforms'}
          </button>
        </div>
      </header>

      {/* ── KPI Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        {kpis.map((k, i) => (
          <div key={i} className="stat-card" style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            position: 'relative', overflow: 'hidden', transition: 'border 0.2s ease'
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: k.color }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10, background: k.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20
              }}>
                {k.icon}
              </div>
              {loading && (
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: k.color, opacity: 0.7, animation: 'pulse 1.5s infinite' }} />
              )}
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: k.color, lineHeight: 1, marginBottom: 4 }}>{k.value}</div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem', marginBottom: 2 }}>{k.label}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Two Column: Integrations + Chart Placeholder ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 20, marginBottom: 20 }}>

        {/* Ad Account Integrations */}
        <div className="stat-card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border)' }}>
          <div style={{
            padding: '16px 20px', borderBottom: '1px solid var(--border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: 'var(--bg-elevated)'
          }}>
            <h3 style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              🔗 Ad Account Integrations
            </h3>
            <span style={{
              fontSize: '0.72rem', padding: '3px 10px', borderRadius: 12, fontWeight: 600,
              background: connectedCount > 0 ? 'var(--green-dim)' : 'var(--red-dim)',
              color: connectedCount > 0 ? 'var(--green)' : 'var(--red)',
              border: `1px solid ${connectedCount > 0 ? 'var(--green)' : 'var(--red)'}`
            }}>
              {connectedCount}/{platforms.length} Connected
            </span>
          </div>

          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {platforms.map(p => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 16px', borderRadius: 10,
                background: p.connected ? p.colorDim : 'var(--bg-elevated)',
                border: `1px solid ${p.connected ? p.color : 'var(--border)'}`,
                transition: 'all 0.2s ease'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: 10, fontSize: 20,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: p.connected ? p.color + '33' : 'var(--bg-hover)'
                  }}>
                    {p.icon}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{p.name}</div>
                    <div style={{ fontSize: '0.7rem', color: p.connected ? p.color : 'var(--text-muted)', marginTop: 2 }}>
                      {p.connected ? '✅ Connected & Syncing' : p.badge}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => p.id === 'meta' ? setShowMetaModal(true) : null}
                  style={{
                    padding: '6px 14px', borderRadius: 6, fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer',
                    background: p.connected ? 'transparent' : p.color,
                    color: p.connected ? p.color : '#fff',
                    border: `1px solid ${p.color}`,
                    opacity: p.id !== 'meta' ? 0.4 : 1
                  }}
                >
                  {p.connected ? 'Configure' : 'Connect'}
                </button>
              </div>
            ))}

            <div style={{ padding: '12px', borderRadius: 8, background: 'var(--yellow-dim)', border: '1px solid var(--yellow)', marginTop: 4 }}>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--yellow)', lineHeight: 1.5 }}>
                <b>⚠️ Google & TikTok:</b> API integrations are coming soon. Use the manual spend table below to enter data manually.
              </p>
            </div>
          </div>
        </div>

        {/* True Profitability Chart Placeholder */}
        <div className="stat-card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border)' }}>
          <div style={{
            padding: '16px 20px', borderBottom: '1px solid var(--border)',
            background: 'var(--bg-elevated)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <h3 style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
              📉 True Profitability vs Ad Spend
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Last {dateRange} days</span>
          </div>
          <div style={{
            height: 260, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24
          }}>
            {connectedCount === 0 ? (
              <>
                <div style={{ fontSize: 52 }}>📊</div>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>No Data Yet</p>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Connect an Ad Account to unlock live profitability charts</p>
                </div>
                <button
                  onClick={() => setShowMetaModal(true)}
                  style={{
                    marginTop: 8, padding: '10px 24px', borderRadius: 8, border: 'none',
                    background: 'var(--blue)', color: '#fff', fontWeight: 600, cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(59,130,246,0.25)'
                  }}
                >
                  🔗 Connect Meta Ads
                </button>
              </>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>⏳</div>
                <p style={{ margin: 0 }}>Syncing data from connected platforms...</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Manual Daily Spend Table ── */}
      <div className="stat-card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border)' }}>
        <div style={{
          padding: '16px 24px', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-elevated)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div>
            <h3 style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              💰 Manual Daily Spend Entry
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              No API yet? Enter daily spend manually to track true profitability.
            </p>
          </div>
          {manualTotal > 0 && (
            <div style={{
              padding: '8px 16px', borderRadius: 8,
              background: 'var(--orange-dim)', border: '1px solid var(--orange)'
            }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--orange)', fontWeight: 600 }}>
                Total Today: Rs. {manualTotal.toLocaleString()}
              </span>
            </div>
          )}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)' }}>
                {['Date', 'Meta Spend (PKR)', 'Google Spend (PKR)', 'TikTok Spend (PKR)', 'Total Marketing', 'Action'].map(col => (
                  <th key={col} style={{
                    padding: '12px 16px', textAlign: 'left', fontWeight: 600,
                    fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase',
                    letterSpacing: '0.06em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap'
                  }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Today's Input Row */}
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--blue-dim)' }}>
                <td style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--blue)', whiteSpace: 'nowrap' }}>
                  📅 {new Date().toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}
                </td>
                {['meta', 'google', 'tiktok'].map(platform => (
                  <td key={platform} style={{ padding: '10px 16px' }}>
                    <input
                      type="number"
                      placeholder="0"
                      value={manualSpend[platform]}
                      onChange={e => setManualSpend(prev => ({ ...prev, [platform]: e.target.value }))}
                      style={{
                        width: 110, padding: '8px 10px', borderRadius: 6,
                        background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)',
                        color: 'var(--text-primary)', outline: 'none', fontSize: '0.85rem'
                      }}
                      onFocus={e => e.target.style.border = '1px solid var(--blue)'}
                      onBlur={e => e.target.style.border = '1px solid var(--border-bright)'}
                    />
                  </td>
                ))}
                <td style={{ padding: '14px 16px', fontWeight: 700, color: manualTotal > 0 ? 'var(--orange)' : 'var(--text-muted)' }}>
                  Rs. {manualTotal.toLocaleString()}
                </td>
                <td style={{ padding: '10px 16px' }}>
                  <button style={{
                    padding: '8px 16px', borderRadius: 6, border: 'none',
                    background: 'var(--blue)', color: '#fff', fontWeight: 600,
                    fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap'
                  }}>
                    Save Day
                  </button>
                </td>
              </tr>

              {/* Placeholder rows */}
              {[1, 2, 3].map(i => {
                const d = new Date();
                d.setDate(d.getDate() - i);
                return (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                      {d.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>—</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>—</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>—</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>—</td>
                    <td style={{ padding: '12px 16px' }}>
                      <button style={{
                        padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
                        background: 'transparent', border: '1px solid var(--border-bright)',
                        color: 'var(--text-secondary)', fontSize: '0.75rem'
                      }}>
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })}

              <tr>
                <td colSpan={6} style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                  Showing last 7 days · Connect an API to auto-populate
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
