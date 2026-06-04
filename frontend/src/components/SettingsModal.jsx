import React, { useState, useEffect, useContext } from 'react';
import { TenantContext } from '../context/TenantContext';
import { useApp } from '../context/AppContext';
import StoreSettings from './Settings/StoreSettings';
import WhatsAppSettings from './Settings/WhatsAppSettings';
import ApiKeysSettings from './Settings/ApiKeysSettings';

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
  const [newCategory, setNewCategory] = useState('General');
  const [newShortcode, setNewShortcode] = useState('');
  const [newMediaUrl, setNewMediaUrl] = useState('');
  const [newMediaType, setNewMediaType] = useState('image');
  
  // Interactive buttons configuration states
  const [buttonsMode, setButtonsMode] = useState('native');
  const [buttonsList, setButtonsList] = useState([]);
  const [btnLabel, setBtnLabel] = useState('');
  const [btnType, setBtnType] = useState('reply');
  const [btnValue, setBtnValue] = useState('');

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
      const cleanShortcode = newShortcode.trim() 
        ? '/' + newShortcode.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^\/|\/$)/g, '')
        : null;

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
          category: newCategory,
          shortcode: cleanShortcode,
          media_url: newMediaUrl.trim() || null,
          media_type: newMediaUrl.trim() ? newMediaType : null,
          buttons_mode: buttonsMode,
          buttons: buttonsList,
          quick: true
        })
      });
      const data = await res.json();
      if (data.success) {
        addToast('Template created successfully!', 'success');
        setNewTitle('');
        setNewText('');
        setNewCategory('General');
        setNewShortcode('');
        setNewMediaUrl('');
        setButtonsList([]);
        setBtnLabel('');
        setBtnValue('');
        setButtonsMode('native');
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
          <StoreSettings
            tenantId={tenantId}
            stats={stats}
            loading={loading}
          />

          <WhatsAppSettings
            templates={templates}
            loadingTemplates={loadingTemplates}
            newTitle={newTitle}
            setNewTitle={setNewTitle}
            newText={newText}
            setNewText={setNewText}
            newCategory={newCategory}
            setNewCategory={setNewCategory}
            newShortcode={newShortcode}
            setNewShortcode={setNewShortcode}
            newMediaUrl={newMediaUrl}
            setNewMediaUrl={setNewMediaUrl}
            newMediaType={newMediaType}
            setNewMediaType={setNewMediaType}
            buttonsMode={buttonsMode}
            setButtonsMode={setButtonsMode}
            buttonsList={buttonsList}
            setButtonsList={setButtonsList}
            btnLabel={btnLabel}
            setBtnLabel={setBtnLabel}
            btnType={btnType}
            setBtnType={setBtnType}
            btnValue={btnValue}
            setBtnValue={setBtnValue}
            handleAddTemplate={handleAddTemplate}
            handleDeleteTemplate={handleDeleteTemplate}
            loggingOut={loggingOut}
            handleWhatsAppLogout={handleWhatsAppLogout}
          />

          <ApiKeysSettings
            tenantId={tenantId}
            wipeConfirm={wipeConfirm}
            setWipeConfirm={setWipeConfirm}
            wiping={wiping}
            handleWipeChats={handleWipeChats}
          />
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
