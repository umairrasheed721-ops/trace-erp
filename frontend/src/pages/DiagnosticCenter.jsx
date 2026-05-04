import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

export default function DiagnosticCenter() {
  const { user } = useApp();
  const [stats, setStats] = useState(null);
  const [auditResult, setAuditResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/diagnostics/stats', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch stats', err);
    }
  };

  const runAudit = async (type) => {
    setLoading(true);
    setAuditResult(null);
    try {
      const res = await fetch(`/api/diagnostics/audit/${type}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      setAuditResult({ type, data: data.results });
    } catch (err) {
      alert('Audit failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (user?.role !== 'admin' && user?.role !== 'owner') {
    return <div className="p-8">Access Denied. Admins only.</div>;
  }

  return (
    <div className="page-container p-6">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-2xl font-bold">🛠️ Diagnostic Command Center</h2>
        <button onClick={fetchStats} className="btn btn-secondary text-xs">Refresh Stats</button>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          <StatCard title="Orders" value={stats.orders} />
          <StatCard title="Stores" value={stats.stores} />
          <StatCard title="Audit Logs" value={stats.auditLogs} />
          <StatCard title="Users" value={stats.users} />
          <StatCard title="Memory" value={`${stats.memory.toFixed(1)} MB`} 
                    color={stats.memory > 400 ? 'text-red-500' : 'text-green-500'} />
        </div>
      )}

      <div className="bg-surface p-6 rounded-xl border border-border mb-8">
        <h3 className="text-lg font-bold mb-4">Health Audits</h3>
        <div className="flex gap-4">
          <button 
            disabled={loading}
            onClick={() => runAudit('zero-costs')}
            className="btn btn-primary"
          >
            🔍 Find 0-Cost Orders
          </button>
          <button 
            disabled={loading}
            onClick={() => runAudit('orphaned-costs')}
            className="btn btn-secondary"
          >
            🔍 Find Orphaned Costs
          </button>
        </div>
      </div>

      {loading && <div className="text-center p-8">Running deep audit... ⏳</div>}

      {auditResult && (
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <div className="p-4 bg-black/20 border-b border-border flex justify-between items-center">
            <h4 className="font-bold">Audit Results: {auditResult.type}</h4>
            <div className="flex items-center gap-4">
              <span className="text-xs">{auditResult.data.length} issues found</span>
              {auditResult.type === 'zero-costs' && auditResult.data.length > 0 && (
                <button 
                  onClick={async () => {
                    if (!confirm('✨ This will automatically fix costs using Master Cost data. Proceed?')) return;
                    setLoading(true);
                    try {
                      const res = await fetch('/api/diagnostics/heal/zero-costs', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
                      });
                      const data = await res.json();
                      alert(`✅ Successfully healed ${data.healedCount} orders!`);
                      runAudit('zero-costs');
                      fetchStats();
                    } catch (err) {
                      alert('Heal failed: ' + err.message);
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="btn btn-primary text-xs py-1"
                >
                  ✨ Heal All Issues
                </button>
              )}
            </div>
          </div>
          <div className="max-h-[400px] overflow-auto">
            {auditResult.data.length === 0 ? (
              <div className="p-8 text-center text-green-500">✅ No issues found! System is healthy.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-black/10">
                  <tr>
                    {Object.keys(auditResult.data[0]).map(key => (
                      <th key={key} className="p-3 text-left border-b border-border capitalize">{key.replace('_', ' ')}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {auditResult.data.map((row, i) => (
                    <tr key={i} className="hover:bg-white/5 border-b border-border/5">
                      {Object.values(row).map((val, j) => (
                        <td key={j} className="p-3">{val}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, color = '' }) {
  return (
    <div className="bg-surface p-4 rounded-xl border border-border text-center">
      <div className="text-xs text-muted mb-1 uppercase tracking-wider font-bold">{title}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
