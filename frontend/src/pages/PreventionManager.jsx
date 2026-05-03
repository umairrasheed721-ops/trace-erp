import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

export default function PreventionManager() {
  const { activeStoreId, token } = useApp();
  const [loading, setLoading] = useState(false);
  const [auditData, setAuditData] = useState({ missingInRegistry: [], zeroCostInRegistry: [], pendingOrdersWithMissingCost: [] });
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
      const data = await res.json();
      setAuditData(data);
    } catch (e) {
      console.error('Failed to fetch prevention audit:', e);
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

  return (
    <div className="finance-manager">
      <div className="manager-header">
        <div>
          <h2 className="premium-title">🛡️ Prevention & Cost Watchdog</h2>
          <p className="premium-subtitle">Stop profit leaks before they happen by ensuring every variant has a cost entry.</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={fetchAudit} disabled={loading}>
            {loading ? '🔄 Scanning...' : '🔍 Run Audit Scan'}
          </button>
          <button className="btn btn-primary" onClick={syncCosts} disabled={loading}>
            ✨ Sync from Shopify
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card" onClick={() => setFilter('missing')}>
          <div className="stat-value text-red">{auditData.missingInRegistry.length}</div>
          <div className="stat-label">Not in Registry</div>
          <div className="stat-trend">Variants never mapped</div>
        </div>
        <div className="stat-card" onClick={() => setFilter('zero')}>
          <div className="stat-value text-orange">{auditData.zeroCostInRegistry.length}</div>
          <div className="stat-label">Zero Cost Entry</div>
          <div className="stat-trend">Mapping exists but cost is $0</div>
        </div>
        <div className="stat-card" onClick={() => setFilter('orders')}>
          <div className="stat-value text-blue">{auditData.pendingOrdersWithMissingCost.length}</div>
          <div className="stat-label">At-Risk Orders</div>
          <div className="stat-trend">Active orders with $0 cost</div>
        </div>
      </div>

      <div className="glass-panel" style={{ marginTop: '24px' }}>
        <div className="panel-header">
          <h3>🚨 Priority Prevention List</h3>
          <div className="filter-tabs">
            <button className={`filter-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All Alerts</button>
            <button className={`filter-tab ${filter === 'missing' ? 'active' : ''}`} onClick={() => setFilter('missing')}>Missing Mapping</button>
            <button className={`filter-tab ${filter === 'zero' ? 'active' : ''}`} onClick={() => setFilter('zero')}>$0 Costs</button>
            <button className={`filter-tab ${filter === 'orders' ? 'active' : ''}`} onClick={() => setFilter('orders')}>Active Order Risks</button>
          </div>
        </div>

        <div className="table-container">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Product / Variant</th>
                <th>Status</th>
                <th>Stock</th>
                <th>Orders At Risk</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" className="text-center">Scanning your store for potential profit leaks...</td></tr>
              ) : (
                <>
                  {(filter === 'all' || filter === 'missing') && auditData.missingInRegistry.map((p, i) => (
                    <tr key={`m-${i}`} className="at-risk-row">
                      <td>
                        <div className="product-info">
                          <span className="product-name">{p.parent_title}</span>
                          <span className="variant-name">{p.variant_title || 'Default'}</span>
                        </div>
                      </td>
                      <td><span className="status-badge status-pending">New / Unmapped</span></td>
                      <td>{p.inventory_qty || 0}</td>
                      <td>-</td>
                      <td>
                        <button className="btn btn-sm btn-outline" onClick={() => window.location.hash = `/costing?search=${encodeURIComponent(p.parent_title)}`}>Add Cost</button>
                      </td>
                    </tr>
                  ))}
                  {(filter === 'all' || filter === 'zero') && auditData.zeroCostInRegistry.map((p, i) => (
                    <tr key={`z-${i}`} className="at-risk-row">
                      <td>
                        <div className="product-info">
                          <span className="product-name">{p.parent_title}</span>
                          <span className="variant-name">{p.variant_title || 'Default'}</span>
                        </div>
                      </td>
                      <td><span className="status-badge status-failed">$0 Cost Locked</span></td>
                      <td>{p.inventory_qty || 0}</td>
                      <td>-</td>
                      <td>
                        <button className="btn btn-sm btn-outline" onClick={() => window.location.hash = `/costing?search=${encodeURIComponent(p.parent_title)}`}>Update Cost</button>
                      </td>
                    </tr>
                  ))}
                  {filter === 'orders' && auditData.pendingOrdersWithMissingCost.map((o, i) => (
                    <tr key={`o-${i}`} className="at-risk-row">
                      <td>
                        <div className="product-info">
                          <span className="product-name">{o.customer_name}</span>
                          <span className="variant-name">Order #{o.shopify_order_id}</span>
                        </div>
                      </td>
                      <td><span className="status-badge status-critical">Live Profit Leak</span></td>
                      <td>-</td>
                      <td>{o.price} PKR</td>
                      <td>
                        <button className="btn btn-sm btn-primary" onClick={() => window.location.hash = `/search?order=${o.shopify_order_id}`}>Heal Now</button>
                      </td>
                    </tr>
                  ))}
                  {auditData.missingInRegistry.length === 0 && auditData.zeroCostInRegistry.length === 0 && auditData.pendingOrdersWithMissingCost.length === 0 && (
                    <tr><td colSpan="5" className="text-center text-green">✨ Everything looks perfect! No cost issues detected.</td></tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
