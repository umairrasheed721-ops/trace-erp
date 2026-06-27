import React, { useState, useEffect } from 'react';

export default function OrderHistoryModal({ order, onClose }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, [order.id]);

  const fetchHistory = async () => {
    try {
      const res = await fetch(`/api/orders/${order.id}/history`);
      const data = await res.json();
      setHistory(data.history || []);
    } catch (err) {
      console.error('Failed to fetch history', err);
    } finally {
      setLoading(false);
    }
  };

  const getDiff = (oldVal, newVal) => {
    try {
      const oldObj = JSON.parse(oldVal);
      const newObj = JSON.parse(newVal);
      const changes = [];
      
      for (const key in newObj) {
        if (JSON.stringify(oldObj[key]) !== JSON.stringify(newObj[key])) {
          changes.push({
            key,
            old: oldObj[key],
            new: newObj[key]
          });
        }
      }
      return changes;
    } catch (e) {
      return [];
    }
  };

  const getChangeBadgeStyle = (type) => {
    const t = (type || '').toLowerCase();
    if (t.includes('create')) return { background: 'rgba(34,197,94,0.15)', color: 'var(--green)', border: '1px solid rgba(34,197,94,0.3)' };
    if (t.includes('edit')) return { background: 'rgba(59,130,246,0.15)', color: 'var(--blue)', border: '1px solid rgba(59,130,246,0.3)' };
    return { background: 'rgba(249,115,22,0.15)', color: 'var(--orange)', border: '1px solid rgba(249,115,22,0.3)' };
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div 
        className="modal-content glass-panel" 
        style={{ 
          width: '640px', 
          maxWidth: '95vw', 
          maxHeight: '85vh', 
          padding: '24px 28px', 
          display: 'flex', 
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
          borderRadius: '16px',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, borderBottom: '1px solid var(--border-bright)', paddingBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.4rem' }}>📜</span>
            <h3 className="premium-title" style={{ margin: 0, fontSize: '1.25rem', letterSpacing: '-0.02em' }}>
              Order History: #{order.ref_number || order.id}
            </h3>
          </div>
          <button 
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer',
              fontSize: '1.2rem', padding: '4px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '50%', transition: 'background 0.2s'
            }}
          >
            ✕
          </button>
        </div>
        
        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4, marginBottom: 10 }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span className="loading-spinner" style={{ width: 20, height: 20 }}></span> Loading timeline...
            </div>
          ) : history.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              ℹ️ No changes recorded for this order yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {history.map((item, idx) => {
                const diffs = getDiff(item.old_value, item.new_value);
                const badgeStyle = getChangeBadgeStyle(item.change_type);
                
                return (
                  <div 
                    key={idx} 
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-bright)',
                      borderRadius: 12,
                      padding: 16,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                    }}
                  >
                    {/* User and timestamp line */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '1rem' }}>👤</span>
                        <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                          {item.username || 'System Sync'}
                        </span>
                        <span style={{ 
                          fontSize: '0.65rem', 
                          fontWeight: 700, 
                          padding: '2px 8px', 
                          borderRadius: 6, 
                          textTransform: 'uppercase',
                          ...badgeStyle
                        }}>
                          {item.change_type || 'UPDATE'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {new Date(item.created_at).toLocaleString()}
                      </div>
                    </div>
                    
                    {/* Differences / Changelog values */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {diffs.map((diff, i) => (
                        <div 
                          key={i} 
                          style={{ 
                            background: 'rgba(0, 0, 0, 0.2)', 
                            border: '1px solid var(--border-bright)',
                            padding: '10px 12px', 
                            borderRadius: 8,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4
                          }}
                        >
                          <span style={{ 
                            fontWeight: 700, 
                            fontSize: '0.68rem', 
                            textTransform: 'uppercase', 
                            color: 'var(--text-muted)',
                            letterSpacing: '0.05em'
                          }}>
                            {diff.key.replace(/_/g, ' ')}
                          </span>
                          
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: '0.82rem' }}>
                            <span 
                              style={{ 
                                color: 'var(--red)', 
                                textDecoration: 'line-through', 
                                wordBreak: 'break-all',
                                opacity: 0.85
                              }}
                            >
                              {String(diff.old || 'N/A')}
                            </span>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>➡️</span>
                            <span 
                              style={{ 
                                color: 'var(--green)', 
                                fontWeight: 600,
                                wordBreak: 'break-all'
                              }}
                            >
                              {String(diff.new || 'N/A')}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
