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

  return (
    <div className="modal-overlay" style={{ zIndex: 10000 }}>
      <div className="modal-content" style={{ width: '600px', maxWidth: '90%' }}>
        <div className="modal-header">
          <h2 className="text-xl font-bold">📜 Order History: #{order.ref_number || order.id}</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        
        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {loading ? (
            <div className="p-8 text-center">⏳ Loading timeline...</div>
          ) : history.length === 0 ? (
            <div className="p-8 text-center text-muted">No changes recorded for this order.</div>
          ) : (
            <div className="timeline">
              {history.map((item, idx) => {
                const diffs = getDiff(item.old_value, item.new_value);
                return (
                  <div key={idx} className="timeline-item mb-6 pb-6 border-b border-border/50">
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-bold text-sm">
                        👤 {item.username || 'System Sync'} 
                        <span className="ml-2 px-2 py-0.5 bg-primary/20 text-primary rounded text-[10px] uppercase">
                          {item.change_type}
                        </span>
                      </div>
                      <div className="text-xs text-muted">
                        {new Date(item.created_at).toLocaleString()}
                      </div>
                    </div>
                    
                    <div className="space-y-1">
                      {diffs.map((diff, i) => (
                        <div key={i} className="text-sm bg-black/10 p-2 rounded">
                          <span className="font-bold text-xs uppercase text-muted block mb-1">{diff.key.replace('_', ' ')}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-red-400 line-through truncate max-w-[200px]">{String(diff.old)}</span>
                            <span>➡️</span>
                            <span className="text-green-400 font-bold">{String(diff.new)}</span>
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
