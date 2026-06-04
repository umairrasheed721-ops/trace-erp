import React from 'react';

export default function ApiKeysSettings({
  tenantId,
  wipeConfirm,
  setWipeConfirm,
  wiping,
  handleWipeChats
}) {
  return (
    <div className="settings-danger-zone">
      <div className="settings-danger-title">⚠️ Danger Zone</div>

      {/* Action A: Wipe Chat History */}
      <div className="settings-danger-card" style={{ marginBottom: '20px' }}>
        <div className="settings-danger-header">
          <div className="settings-danger-info">
            <span className="settings-danger-name">Wipe Chat History & Media</span>
            <span className="settings-danger-desc">
              Permanently delete all whatsapp message records and media files for this tenant. This will not touch orders or customer profiles.
            </span>
          </div>
        </div>
        <div className="settings-confirm-box" style={{ padding: '10px 0' }}>
          <span className="settings-confirm-label" style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem' }}>
            To confirm, type <strong style={{ color: 'var(--red)' }}>WIPE-{tenantId}</strong> below:
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              className="settings-confirm-input"
              style={{ flex: 1, padding: '6px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px' }}
              placeholder={`WIPE-${tenantId}`}
              value={wipeConfirm}
              onChange={(e) => setWipeConfirm(e.target.value)}
            />
            <button
              className="btn btn-danger btn-sm"
              disabled={wipeConfirm !== `WIPE-${tenantId}` || wiping}
              onClick={handleWipeChats}
            >
              {wiping ? 'Wiping...' : 'Wipe Data'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
