import React, { useState, useEffect, useContext } from 'react';
import { TenantContext } from '../context/TenantContext';
import { useApp } from '../context/AppContext';

export default function SettingsModal({ onClose }) {
  const { tenantId } = useContext(TenantContext);
  const { addToast } = useApp();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [wipeConfirm, setWipeConfirm] = useState('');
  const [wiping, setWiping] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    fetchStats();
  }, [tenantId]);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('trace_token') || '';
      const res = await fetch('/api/settings/system-health', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-tenant-id': tenantId
        }
      });
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
      } else {
        addToast(data.error || 'Failed to load system health stats', 'error');
      }
    } catch (err) {
      addToast(err.message || 'Error fetching system health', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleWipeChats = async () => {
    const expectedConfirm = `WIPE-${tenantId}`;
    if (wipeConfirm !== expectedConfirm) {
      addToast(`Please type "${expectedConfirm}" to confirm.`, 'error');
      return;
    }

    try {
      setWiping(true);
      const token = localStorage.getItem('trace_token') || '';
      const res = await fetch('/api/settings/wipe-chats', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-tenant-id': tenantId,
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      if (data.success) {
        addToast('Chat history and media wiped successfully!', 'success');
        setWipeConfirm('');
        fetchStats(); // Refresh stats
      } else {
        addToast(data.error || 'Failed to wipe chats', 'error');
      }
    } catch (err) {
      addToast(err.message || 'Error wiping chats', 'error');
    } finally {
      setWiping(false);
    }
  };

  const handleWhatsAppLogout = async () => {
    if (!window.confirm('Are you sure you want to log out the WhatsApp session? This will disconnect the bot.')) {
      return;
    }

    try {
      setLoggingOut(true);
      const token = localStorage.getItem('trace_token') || '';
      const res = await fetch('/api/settings/whatsapp-logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-tenant-id': tenantId,
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      if (data.success) {
        addToast('WhatsApp session logged out successfully!', 'success');
        // Refresh page to clean up WebSocket and reconnect loops
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        addToast(data.error || 'Failed to log out WhatsApp session', 'error');
      }
    } catch (err) {
      addToast(err.message || 'Error logging out WhatsApp session', 'error');
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="settings-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="settings-modal" role="dialog" aria-label="System Settings">
        <div className="settings-header">
          <h3>⚙️ System Settings</h3>
          <button className="settings-close-btn" onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </div>

        <div className="settings-content">
          <div>
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

          <div className="settings-danger-zone">
            <div className="settings-danger-title">⚠️ Danger Zone</div>

            {/* Action A: Wipe Chat History */}
            <div className="settings-danger-card">
              <div className="settings-danger-header">
                <div className="settings-danger-info">
                  <span className="settings-danger-name">Wipe Chat History & Media</span>
                  <span className="settings-danger-desc">
                    Permanently delete all whatsapp message records and media files for this tenant. This will not touch orders or customer profiles.
                  </span>
                </div>
              </div>
              <div className="settings-confirm-box">
                <span className="settings-confirm-label">
                  To confirm, type <strong style={{ color: 'var(--red)' }}>WIPE-{tenantId}</strong> below:
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    className="settings-confirm-input"
                    style={{ flex: 1 }}
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

            {/* Action B: WhatsApp Logout */}
            <div className="settings-danger-card">
              <div className="settings-danger-header">
                <div className="settings-danger-info">
                  <span className="settings-danger-name">WhatsApp Session Logout</span>
                  <span className="settings-danger-desc">
                    Disconnect the WhatsApp connection, wipe authentication files from disk/DB, and stop reconnect loops.
                  </span>
                </div>
                <button
                  className="btn btn-danger btn-sm"
                  disabled={loggingOut}
                  onClick={handleWhatsAppLogout}
                  style={{ alignSelf: 'center', whiteSpace: 'nowrap' }}
                >
                  {loggingOut ? 'Logging out...' : 'Disconnect Bot'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="settings-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
