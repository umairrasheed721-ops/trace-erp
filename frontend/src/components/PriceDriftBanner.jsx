import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

export default function PriceDriftBanner() {
  const { activeStoreId, activeStore } = useApp();
  const location = useLocation();
  const navigate = useNavigate();

  const [driftData, setDriftData] = useState({ drift_count: 0, products_count: 0, store_name: '' });
  const [dismissed, setDismissed] = useState(false);

  const fetchDriftSummary = async () => {
    if (!activeStoreId) return;
    try {
      const res = await fetch(`/api/cost-manager/drift-summary?store_id=${activeStoreId}`);
      if (res.ok) {
        const data = await res.json();
        setDriftData({
          drift_count: data.drift_count || 0,
          products_count: data.products_count || 0,
          store_name: data.store_name || activeStore?.store_name || 'Active Store'
        });
      }
    } catch (e) {
      console.warn('Failed to fetch drift summary:', e.message);
    }
  };

  useEffect(() => {
    setDismissed(false);
    fetchDriftSummary();
    const interval = setInterval(fetchDriftSummary, 60000);

    const handleRefresh = () => fetchDriftSummary();
    window.addEventListener('refresh-drift-count', handleRefresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener('refresh-drift-count', handleRefresh);
    };
  }, [activeStoreId]);

  if (!driftData.drift_count || dismissed) return null;

  const isAlreadyOnDriftTab = location.pathname === '/costing' && location.search.includes('tab=drift');

  return (
    <div 
      className="price-drift-banner"
      style={{
        background: 'linear-gradient(90deg, rgba(245, 158, 11, 0.16) 0%, rgba(217, 119, 6, 0.22) 100%)',
        borderBottom: '1px solid rgba(245, 158, 11, 0.35)',
        padding: '8px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        zIndex: 900,
        fontSize: '0.82rem',
        color: 'var(--text-primary)',
        boxShadow: '0 2px 10px rgba(245, 158, 11, 0.1)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: 'rgba(245, 158, 11, 0.25)',
          color: '#f59e0b',
          fontSize: '0.9rem',
          fontWeight: 800,
          boxShadow: '0 0 8px rgba(245, 158, 11, 0.4)'
        }}>⚡</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <strong style={{ color: '#f59e0b', fontWeight: 800 }}>
            {driftData.store_name}:
          </strong>
          <span>
            <b>{driftData.drift_count} {driftData.drift_count === 1 ? 'variant' : 'variants'}</b> ({driftData.products_count} {driftData.products_count === 1 ? 'product' : 'products'}) me <b>Price Drift</b> detect hui hai — Shopify costs ERP cost registry se differ kar rahi hain.
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {!isAlreadyOnDriftTab && (
          <button
            onClick={() => navigate('/costing?tab=drift')}
            style={{
              background: '#f59e0b',
              color: '#000',
              border: 'none',
              padding: '5px 14px',
              borderRadius: 6,
              fontSize: '0.75rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)',
              transition: 'transform 0.15s ease'
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.03)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            ⚡ Review & Clear Drifts
          </button>
        )}
        <button
          onClick={() => setDismissed(true)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: '1rem',
            lineHeight: 1,
            cursor: 'pointer',
            padding: '4px 6px',
            borderRadius: 4
          }}
          title="Dismiss for current session"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
