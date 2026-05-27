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

  const [activeTab, setActiveTab] = useState('general'); // 'general' | 'quick_replies'
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newText, setNewText] = useState('');

  useEffect(() => {
    fetchStats();
    fetchTemplates();
  }, [tenantId]);

  useEffect(() => {
    if (activeTab === 'quick_replies') {
      fetchTemplates();
    }
  }, [activeTab, tenantId]);

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

  const fetchTemplates = async () => {
    try {
      setLoadingTemplates(true);
      const token = localStorage.getItem('trace_token') || '';
      const res = await fetch(`/api/templates?quick=true&tenant_id=${encodeURIComponent(tenantId)}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-tenant-id': tenantId
        }
      });
      const data = await res.json();
      if (data.success) {
        setTemplates(data.templates || []);
      } else {
        addToast(data.error || 'Failed to load templates', 'error');
      }
    } catch (err) {
      addToast(err.message || 'Error loading templates', 'error');
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleAddTemplate = async (e) => {
    e.preventDefault();
    if (!newTitle.trim() || !newText.trim()) {
      addToast('Title and text are required', 'warning');
      return;
    }

    try {
      const token = localStorage.getItem('trace_token') || '';
      const res = await fetch('/api/templates?quick=true', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-tenant-id': tenantId,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: newTitle,
          text: newText,
          quick: true
        })
      });
      const data = await res.json();
      if (data.success) {
        addToast('Template created successfully!', 'success');
        setNewTitle('');
        setNewText('');
        fetchTemplates();
        window.dispatchEvent(new Event('whatsapp_templates_updated'));
      } else {
        addToast(data.error || 'Failed to create template', 'error');
      }
    } catch (err) {
      addToast(err.message || 'Error creating template', 'error');
    }
  };

  const handleDeleteTemplate = async (id) => {
    if (!window.confirm('Are you sure you want to delete this template?')) {
      return;
    }

    try {
      const token = localStorage.getItem('trace_token') || '';
      const res = await fetch(`/api/templates/${id}?quick=true`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-tenant-id': tenantId
        }
      });
      const data = await res.json();
      if (data.success) {
        addToast('Template deleted successfully!', 'success');
        fetchTemplates();
        window.dispatchEvent(new Event('whatsapp_templates_updated'));
      } else {
        addToast(data.error || 'Failed to delete template', 'error');
      }
    } catch (err) {
      addToast(err.message || 'Error deleting template', 'error');
    }
  };

  return (
    <div className="settings-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="settings-modal" role="dialog" aria-label="System Settings" style={{ maxWidth: '900px', width: '90%' }}>
        <div className="settings-header">
          <h3>⚙️ System Settings</h3>
          <button className="settings-close-btn" onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </div>

        <div className="settings-content" style={{ padding: '20px', maxHeight: '80vh', overflowY: 'auto' }}>
          {/* System Health Block */}
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

          {/* Quick Replies Section */}
          <div className="quick-replies-section" style={{ border: '1px solid #333', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
            <h3 style={{ color: '#fff', marginBottom: '10px' }}>⚡ Quick Reply Templates</h3>
            
            {/* Form to Add Template */}
            <form onSubmit={handleAddTemplate} className="template-form-card" style={{ marginBottom: '20px' }}>
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label className="premium-label" style={{ fontSize: '0.8rem', opacity: 0.8, color: '#aaa', display: 'block', marginBottom: '4px' }}>Template Title</label>
                <input
                  type="text"
                  className="premium-input"
                  placeholder="e.g. Return Policy"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #444', background: '#222', color: '#fff' }}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label className="premium-label" style={{ fontSize: '0.8rem', opacity: 0.8, color: '#aaa', display: 'block', marginBottom: '4px' }}>Message Body</label>
                <textarea
                  className="premium-input"
                  placeholder="Type the quick reply message text..."
                  rows={4}
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #444', background: '#222', color: '#fff', fontFamily: 'inherit' }}
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '10px', borderRadius: '4px', cursor: 'pointer' }}>
                Save Template
              </button>
            </form>

            {/* Saved Templates List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontWeight: '600', color: '#fff', fontSize: '0.9rem' }}>📋 Saved Templates ({templates.length})</div>
              
              {loadingTemplates ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#888', fontStyle: 'italic', fontSize: '0.8rem' }}>Loading saved templates...</div>
              ) : templates.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#888', fontStyle: 'italic', fontSize: '0.8rem' }}>No templates configured yet.</div>
              ) : (
                <div className="template-list-container" style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '300px', overflowY: 'auto' }}>
                  {templates.map((t) => (
                    <div key={t.id} className="template-item-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px', background: '#222', border: '1px solid #444', borderRadius: '6px' }}>
                      <div className="template-item-details" style={{ flex: 1, minWidth: 0, paddingRight: '10px' }}>
                        <div className="template-item-title" style={{ fontWeight: '600', color: '#fff', marginBottom: '4px', fontSize: '0.85rem' }}>{t.title}</div>
                        <div className="template-item-text" style={{ color: '#ccc', fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{t.text}</div>
                      </div>
                      <button
                        type="button"
                        className="template-item-delete-btn"
                        title="Delete Template"
                        onClick={() => handleDeleteTemplate(t.id)}
                        style={{ background: 'none', border: 'none', color: '#ff4d4d', cursor: 'pointer', fontSize: '1.1rem' }}
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Danger Zone Block */}
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
