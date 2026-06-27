import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

export default function PreventionManager() {
  const { activeStoreId, token } = useApp();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [auditData, setAuditData] = useState({
    missingInRegistry: [],
    zeroCostInRegistry: [],
    pendingOrdersWithMissingCost: []
  });
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (activeStoreId) fetchAudit();
  }, [activeStoreId]);

  const fetchAudit = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/finance/prevention-audit?store_id=${activeStoreId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAuditData({
          missingInRegistry: Array.isArray(data?.missingInRegistry) ? data.missingInRegistry : [],
          zeroCostInRegistry: Array.isArray(data?.zeroCostInRegistry) ? data.zeroCostInRegistry : [],
          pendingOrdersWithMissingCost: Array.isArray(data?.pendingOrdersWithMissingCost) ? data.pendingOrdersWithMissingCost : []
        });
      } else {
        setAuditData({
          missingInRegistry: [],
          zeroCostInRegistry: [],
          pendingOrdersWithMissingCost: []
        });
      }
    } catch (e) {
      console.error('Failed to fetch prevention audit:', e);
      setAuditData({
        missingInRegistry: [],
        zeroCostInRegistry: [],
        pendingOrdersWithMissingCost: []
      });
    } finally {
      setLoading(false);
    }
  };

  const syncCosts = async () => {
    setLoading(true);
    try {
      await fetch(`/api/finance/sync-shopify-costs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ store_id: activeStoreId })
      });
      fetchAudit();
    } catch (e) {
      console.error('Sync failed:', e);
    } finally {
      setLoading(false);
    }
  };

  const totalIssues = auditData.missingInRegistry.length + auditData.zeroCostInRegistry.length + auditData.pendingOrdersWithMissingCost.length;
  const healthScore = totalIssues === 0 ? 100 : Math.max(0, 100 - (totalIssues * 5));

  const getFilteredRows = () => {
    const rows = [];
    if (filter === 'all' || filter === 'missing') {
      auditData.missingInRegistry.forEach((p, i) => rows.push({ ...p, _type: 'missing', _key: `m-${i}` }));
    }
    if (filter === 'all' || filter === 'zero') {
      auditData.zeroCostInRegistry.forEach((p, i) => rows.push({ ...p, _type: 'zero', _key: `z-${i}` }));
    }
    if (filter === 'all' || filter === 'orders') {
      auditData.pendingOrdersWithMissingCost.forEach((o, i) => rows.push({ ...o, _type: 'order', _key: `o-${i}` }));
    }
    return rows;
  };

  const filteredRows = getFilteredRows();

  const healthColor = healthScore === 100 ? 'var(--green)' : healthScore >= 70 ? 'var(--yellow)' : 'var(--red)';
  const healthBg = healthScore === 100 ? 'var(--green-dim)' : healthScore >= 70 ? 'var(--yellow-dim)' : 'var(--red-dim)';

  const tabs = [
    { id: 'all', label: 'All Alerts', count: totalIssues },
    { id: 'missing', label: 'Missing Mapping', count: auditData.missingInRegistry.length },
    { id: 'zero', label: '$0 Costs', count: auditData.zeroCostInRegistry.length },
    { id: 'orders', label: 'Order Risks', count: auditData.pendingOrdersWithMissingCost.length },
  ];

  return (
    <div className="page-container" style={{ maxWidth: 1300 }}>

      {/* ─── Header ─── */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 className="page-title">🛡️ Prevention & Cost Watchdog</h1>
          <p className="page-subtitle">Stop profit leaks before they happen by ensuring every variant has a cost entry.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn btn-secondary"
            onClick={fetchAudit}
            disabled={loading}
            style={{ padding: '10px 18px', fontWeight: 600 }}
          >
            {loading ? '🔄 Scanning...' : '🔍 Run Audit Scan'}
          </button>
          <button
            className="btn btn-primary"
            onClick={syncCosts}
            disabled={loading}
            style={{ padding: '10px 18px', fontWeight: 600 }}
          >
            ✨ Sync from Shopify
          </button>
        </div>
      </header>

      {/* ─── Top KPI Row ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 200px', gap: 16, marginBottom: 28 }}>
        
        {/* Not in Registry */}
        <div
          className="stat-card"
          onClick={() => setFilter('missing')}
          style={{
            cursor: 'pointer',
            border: filter === 'missing' ? '1px solid var(--red)' : '1px solid var(--border)',
            background: filter === 'missing' ? 'var(--red-dim)' : 'var(--bg-surface)',
            transition: 'all 0.2s ease',
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--red)', borderRadius: '4px 4px 0 0' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--red)', lineHeight: 1 }}>
              {auditData.missingInRegistry.length}
            </div>
            <div style={{ fontSize: 24, opacity: 0.4 }}>📦</div>
          </div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem', marginBottom: 4 }}>Not in Registry</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Variants never mapped</div>
        </div>

        {/* Zero Cost */}
        <div
          className="stat-card"
          onClick={() => setFilter('zero')}
          style={{
            cursor: 'pointer',
            border: filter === 'zero' ? '1px solid var(--orange)' : '1px solid var(--border)',
            background: filter === 'zero' ? 'var(--orange-dim)' : 'var(--bg-surface)',
            transition: 'all 0.2s ease',
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--orange)', borderRadius: '4px 4px 0 0' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--orange)', lineHeight: 1 }}>
              {auditData.zeroCostInRegistry.length}
            </div>
            <div style={{ fontSize: 24, opacity: 0.4 }}>⚠️</div>
          </div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem', marginBottom: 4 }}>Zero Cost Entry</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Mapped but cost is Rs. 0</div>
        </div>

        {/* At-Risk Orders */}
        <div
          className="stat-card"
          onClick={() => setFilter('orders')}
          style={{
            cursor: 'pointer',
            border: filter === 'orders' ? '1px solid var(--blue)' : '1px solid var(--border)',
            background: filter === 'orders' ? 'var(--blue-dim)' : 'var(--bg-surface)',
            transition: 'all 0.2s ease',
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--blue)', borderRadius: '4px 4px 0 0' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--blue)', lineHeight: 1 }}>
              {auditData.pendingOrdersWithMissingCost.length}
            </div>
            <div style={{ fontSize: 24, opacity: 0.4 }}>🔥</div>
          </div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem', marginBottom: 4 }}>At-Risk Orders</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Active orders with Rs. 0 cost</div>
        </div>

        {/* Health Score Card */}
        <div
          className="stat-card"
          style={{
            background: healthBg,
            border: `1px solid ${healthColor}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: healthColor }} />
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: healthColor, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
            Health Score
          </div>
          <div style={{ fontSize: 40, fontWeight: 900, color: healthColor, lineHeight: 1 }}>
            {healthScore}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
            {healthScore === 100 ? '✅ All Clear' : `${totalIssues} issue${totalIssues !== 1 ? 's' : ''} found`}
          </div>
          {/* Mini progress bar */}
          <div style={{ width: '100%', height: 4, background: 'var(--border)', borderRadius: 4, marginTop: 10, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${healthScore}%`, background: healthColor, borderRadius: 4, transition: 'width 0.5s ease' }} />
          </div>
        </div>
      </div>

      {/* ─── Priority Alert Panel ─── */}
      <div className="stat-card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border)' }}>

        {/* Panel Header */}
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--bg-elevated)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.1rem' }}>🚨</span>
            <h3 style={{ margin: 0, fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>Priority Prevention List</h3>
            {filteredRows.length > 0 && (
              <span style={{
                background: 'var(--red-dim)', color: 'var(--red)',
                border: '1px solid var(--red)', borderRadius: 12,
                padding: '2px 10px', fontSize: '0.72rem', fontWeight: 700
              }}>
                {filteredRows.length} alert{filteredRows.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Filter Tabs */}
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg-surface)', border: '1px solid var(--border)', padding: 4, borderRadius: 8 }}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: 'none',
                  background: filter === tab.id ? 'var(--bg-active)' : 'transparent',
                  color: filter === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontWeight: filter === tab.id ? 600 : 400,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span style={{
                    background: filter === tab.id ? 'var(--brand)' : 'var(--border)',
                    color: filter === tab.id ? '#fff' : 'var(--text-secondary)',
                    borderRadius: 10, padding: '1px 6px', fontSize: '0.68rem', fontWeight: 700
                  }}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)' }}>
                {['Product / Variant', 'Issue Type', 'Stock', 'Risk Level', 'Action'].map(col => (
                  <th key={col} style={{
                    padding: '12px 16px',
                    textAlign: 'left',
                    fontWeight: 600,
                    fontSize: '0.72rem',
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    borderBottom: '1px solid var(--border)',
                    whiteSpace: 'nowrap'
                  }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ padding: '60px 16px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: 'var(--text-muted)' }}>
                      <div style={{ fontSize: 36 }}>🔍</div>
                      <p style={{ margin: 0 }}>Scanning your store for potential profit leaks...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '60px 16px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: 'var(--green)' }}>
                      <div style={{ fontSize: 48 }}>✅</div>
                      <p style={{ margin: 0, fontWeight: 600 }}>Everything looks perfect! No cost issues detected.</p>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>All variants are properly mapped with non-zero costs.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, i) => {
                  const isMissing = row._type === 'missing';
                  const isZero = row._type === 'zero';
                  const isOrder = row._type === 'order';

                  const badgeColor = isMissing ? 'var(--red)' : isZero ? 'var(--orange)' : 'var(--purple)';
                  const badgeBg = isMissing ? 'var(--red-dim)' : isZero ? 'var(--orange-dim)' : 'var(--purple-dim)';
                  const badgeLabel = isMissing ? '🔴 Unmapped' : isZero ? '🟠 Zero Cost' : '🔥 Live Leak';

                  const riskLabel = isOrder ? '🔴 Critical' : isMissing ? '🟡 High' : '🟠 Medium';
                  const riskColor = isOrder ? 'var(--red)' : isMissing ? 'var(--yellow)' : 'var(--orange)';
                  const riskBg = isOrder ? 'var(--red-dim)' : isMissing ? 'var(--yellow-dim)' : 'var(--orange-dim)';

                  return (
                    <tr
                      key={row._key}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: i % 2 === 0 ? 'transparent' : 'var(--bg-hover)',
                        transition: 'background 0.15s ease'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'var(--bg-hover)'}
                    >
                      {/* Product / Variant */}
                      <td style={{ padding: '14px 16px', maxWidth: 280 }}>
                        {isOrder ? (
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{row.customer_name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>Order #{row.shopify_order_id}</div>
                          </div>
                        ) : (
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {row.parent_title}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {row.variant_title || 'Default Variant'}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Issue Type Badge */}
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{
                          display: 'inline-block', padding: '4px 12px', borderRadius: 20,
                          fontSize: '0.72rem', fontWeight: 700,
                          background: badgeBg, color: badgeColor,
                          border: `1px solid ${badgeColor}`
                        }}>
                          {badgeLabel}
                        </span>
                      </td>

                      {/* Stock */}
                      <td style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                        {isOrder ? (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        ) : (
                          <span style={{ color: (row.inventory_qty || 0) > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                            {row.inventory_qty || 0} units
                          </span>
                        )}
                      </td>

                      {/* Risk Level */}
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '3px 10px', borderRadius: 6,
                          fontSize: '0.75rem', fontWeight: 600,
                          background: riskBg, color: riskColor
                        }}>
                          {riskLabel}
                        </span>
                        {isOrder && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
                            {row.price} PKR
                          </div>
                        )}
                      </td>

                      {/* Action */}
                      <td style={{ padding: '14px 16px' }}>
                        {isOrder ? (
                          <button
                            onClick={() => navigate(`/search?order=${row.shopify_order_id}`)}
                            style={{
                              padding: '6px 14px', borderRadius: 6, border: 'none',
                              background: 'var(--red)', color: '#fff',
                              fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                              boxShadow: '0 2px 8px rgba(239,68,68,0.25)'
                            }}
                          >
                            ⚡ Heal Now
                          </button>
                        ) : isMissing ? (
                          <button
                            onClick={() => navigate(`/costing?search=${encodeURIComponent(row.parent_title)}`)}
                            style={{
                              padding: '6px 14px', borderRadius: 6,
                              background: 'transparent', color: 'var(--red)',
                              border: '1px solid var(--red)',
                              fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer'
                            }}
                          >
                            + Add Cost
                          </button>
                        ) : (
                          <button
                            onClick={() => navigate(`/costing?search=${encodeURIComponent(row.parent_title)}`)}
                            style={{
                              padding: '6px 14px', borderRadius: 6,
                              background: 'transparent', color: 'var(--orange)',
                              border: '1px solid var(--orange)',
                              fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer'
                            }}
                          >
                            ✏️ Update Cost
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {filteredRows.length > 0 && !loading && (
          <div style={{
            padding: '12px 24px',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-elevated)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Showing {filteredRows.length} alert{filteredRows.length !== 1 ? 's' : ''}
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Last scanned: just now · Click "Run Audit Scan" to refresh
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
