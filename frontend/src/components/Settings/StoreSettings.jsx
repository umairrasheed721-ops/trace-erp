import React from 'react';

export default function StoreSettings({ tenantId, stats, loading }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <div className="settings-section-title">📊 System Health ({tenantId})</div>
      {loading ? (
        <div className="settings-stats-grid">
          {[1, 2, 3].map((i) => (
            <div key={i} className="settings-stat-card" style={{ opacity: 0.6 }}>
              <div className="settings-stat-value">...</div>
              <div className="settings-stat-label">Loading...</div>
            </div>
          ))}
        </div>
      ) : stats ? (
        <div className="settings-stats-grid">
          <div className="settings-stat-card">
            <div className="settings-stat-value">{stats.messagesCount}</div>
            <div className="settings-stat-label">Total Messages</div>
          </div>
          <div className="settings-stat-card">
            <div className="settings-stat-value">{stats.dbSizeMb} MB</div>
            <div className="settings-stat-label">DB File Size</div>
          </div>
          <div className="settings-stat-card">
            <div className="settings-stat-value">{stats.mediaSizeMb} MB</div>
            <div className="settings-stat-label">Media Disk Size</div>
          </div>
        </div>
      ) : (
        <div className="text-muted italic text-xs text-center py-4">
          Failed to load system health stats.
        </div>
      )}
    </div>
  );
}
