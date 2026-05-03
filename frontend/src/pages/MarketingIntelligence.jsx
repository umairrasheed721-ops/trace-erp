import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

export default function MarketingIntelligence() {
  const { activeStoreId, token } = useApp();
  const [showMetaModal, setShowMetaModal] = useState(false);
  const [metaConfig, setMetaConfig] = useState({ ad_account_id: '', access_token: '' });

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
      
      // Also fetch store config for Meta
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
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(metaConfig)
      });
      if (res.ok) {
        setShowMetaModal(false);
        fetchMetrics();
      }
    } catch (e) {
      console.error('Failed to save meta config:', e);
    } finally {
      setLoading(false);
    }
  };

  const stats = [
    { label: 'Total Ad Spend', value: '0 PKR', trend: 'Waiting for Sync', icon: '💸' },
    { label: 'Avg. CAC', value: '0 PKR', trend: 'N/A', icon: '👤' },
    { label: 'True ROAS', value: '0.0x', trend: 'N/A', icon: '📈' },
    { label: 'Net-Net Profit', value: '0 PKR', trend: 'After Ad Spend', icon: '💎' }
  ];

  return (
    <div className="finance-manager">
      {/* Meta Connection Modal */}
      {showMetaModal && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel" style={{ width: '450px' }}>
            <h3>🔗 Connect Meta Ads</h3>
            <p className="subtitle">Enter your Meta Marketing API credentials to sync ad spend.</p>
            
            <div className="form-group" style={{ marginTop: '20px' }}>
              <label>Ad Account ID (including 'act_')</label>
              <input 
                type="text" 
                className="premium-input" 
                placeholder="act_123456789"
                value={metaConfig.ad_account_id}
                onChange={e => setMetaConfig({...metaConfig, ad_account_id: e.target.value})}
              />
            </div>
            
            <div className="form-group" style={{ marginTop: '15px' }}>
              <label>System User / Long-Lived Access Token</label>
              <textarea 
                className="premium-input" 
                rows="4"
                placeholder="EAAB..."
                value={metaConfig.access_token}
                onChange={e => setMetaConfig({...metaConfig, access_token: e.target.value})}
              ></textarea>
            </div>
            
            <div className="modal-actions" style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={saveMetaConfig} disabled={loading}>
                {loading ? 'Saving...' : 'Save & Connect'}
              </button>
              <button className="btn btn-secondary" onClick={() => setShowMetaModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="manager-header">
        <div>
          <h2 className="premium-title">🧠 Marketing & Profitability Intelligence</h2>
          <p className="premium-subtitle">Connect your ad accounts to see your True Profit after marketing spend.</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary">📅 Last 30 Days</button>
          <button className="btn btn-primary">🔄 Sync All Platforms</button>
        </div>
      </div>

      <div className="stats-grid">
        {stats.map((s, i) => (
          <div key={i} className="stat-card">
            <div className="stat-icon">{s.icon}</div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
            <div className="stat-trend">{s.trend}</div>
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ marginTop: '24px' }}>
        <div className="glass-panel">
          <div className="panel-header">
            <h3>🔗 Ad Account Integrations</h3>
          </div>
          <div className="integrations-list">
            {platforms.map(p => (
              <div key={p.id} className="integration-item">
                <div className="platform-info">
                  <span className="platform-icon">{p.icon}</span>
                  <div>
                    <div className="platform-name">{p.name}</div>
                    <div className="platform-status">{p.connected ? '✅ Connected' : '❌ Disconnected'}</div>
                  </div>
                </div>
                <button 
                  className={`btn btn-sm ${p.connected ? 'btn-outline' : 'btn-primary'}`}
                  onClick={() => p.id === 'meta' ? setShowMetaModal(true) : null}
                >
                  {p.connected ? 'Configure' : 'Connect'}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel">
          <div className="panel-header">
            <h3>📉 True Profitability Chart</h3>
          </div>
          <div className="empty-state-container" style={{ height: '200px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
            <div style={{ fontSize: '40px' }}>📊</div>
            <p>Connect an Ad Account to unlock profitability charts</p>
          </div>
        </div>
      </div>

      <div className="glass-panel" style={{ marginTop: '24px' }}>
        <div className="panel-header">
          <h3>💰 Manual Daily Spend Adjustment</h3>
          <p className="subtitle">If you haven't connected APIs yet, you can enter daily spend manually here.</p>
        </div>
        <div className="table-container">
          <table className="premium-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Meta Spend (PKR)</th>
                <th>Google Spend (PKR)</th>
                <th>TikTok Spend (PKR)</th>
                <th>Total Marketing</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{new Date().toLocaleDateString()}</td>
                <td><input type="number" className="premium-input-sm" placeholder="0" /></td>
                <td><input type="number" className="premium-input-sm" placeholder="0" /></td>
                <td><input type="number" className="premium-input-sm" placeholder="0" /></td>
                <td>0 PKR</td>
                <td><button className="btn btn-sm btn-primary">Save</button></td>
              </tr>
              <tr><td colSpan="6" className="text-center" style={{ opacity: 0.3 }}>Showing last 7 days...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .grid-2 { display: grid; grid-template-columns: 1fr 1.5fr; gap: 24px; }
        .integration-item { 
          display: flex; 
          align-items: center; 
          justify-content: space-between; 
          padding: 16px; 
          background: rgba(255,255,255,0.03); 
          border-radius: 12px; 
          margin-bottom: 12px;
          border: 1px solid rgba(255,255,255,0.05);
        }
        .platform-info { display: flex; align-items: center; gap: 12px; }
        .platform-icon { fontSize: 24px; }
        .platform-name { font-weight: 600; color: var(--text-bright); }
        .platform-status { font-size: 11px; opacity: 0.6; }
        .premium-input-sm {
          background: rgba(0,0,0,0.2);
          border: 1px solid rgba(255,255,255,0.1);
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          width: 100px;
        }
      `}} />
    </div>
  );
}
