import React, { useState, useEffect, useContext } from 'react';
import { TenantContext } from '../context/TenantContext';

/**
 * QuickReplyPanel — decoupled Module 8 component.
 * Renders the Quick Reply Templates drawer that slides up above the input bar.
 * Dynamically fetches templates from `/api/whatsapp-governance/quick-replies` using tenant_id.
 *
 * Props:
 *  - sendingReply: null | string — tracks in-flight action key for debounce UI
 *  - onSend: (reply) => void
 *  - onClose: () => void
 */
export default function QuickReplyPanel({ sendingReply, onSend, onClose }) {
  const { tenantId } = useContext(TenantContext);
  const [quickReplies, setQuickReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Advanced States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  useEffect(() => {
    let active = true;
    async function loadTemplates() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/templates?quick=true&tenant_id=${encodeURIComponent(tenantId)}`, {
          headers: {
            'x-tenant-id': tenantId,
            'Authorization': `Bearer ${localStorage.getItem('trace_token')}`
          }
        });
        const data = await res.json();
        if (active) {
          if (data.success) {
            setQuickReplies(data.templates || []);
          } else {
            setError(data.error || 'Failed to fetch templates');
          }
        }
      } catch (err) {
        if (active) {
          setError(err.message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadTemplates();

    // Listen for template updates (e.g. from Settings Manager)
    const handleUpdate = () => {
      loadTemplates();
    };
    window.addEventListener('whatsapp_templates_updated', handleUpdate);

    return () => {
      active = false;
      window.removeEventListener('whatsapp_templates_updated', handleUpdate);
    };
  }, [tenantId]);

  const categories = ['All', 'General', 'Shipping', 'Billing', 'Support', 'Refunds'];

  const filteredReplies = quickReplies.filter(r => {
    const matchesSearch = 
      r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.text || r.caption || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.shortcode || '').toLowerCase().includes(searchQuery.toLowerCase());
      
    const matchesCategory = 
      selectedCategory === 'All' || 
      (r.category || 'General').toLowerCase() === selectedCategory.toLowerCase();

    return matchesSearch && matchesCategory;
  });

  return (
    <div className="quick-replies-drawer" role="dialog" aria-label="Quick Reply Templates" style={{ maxHeight: '420px', display: 'flex', flexDirection: 'column' }}>
      <div className="quick-replies-drawer-header" style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 15px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontWeight: '600' }}>⚡ Quick Reply Templates</span>
        <button
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem' }}
          onClick={onClose}
          aria-label="Close quick replies"
        >
          ✕
        </button>
      </div>

      {/* Search Input */}
      <div style={{ padding: '8px 15px' }}>
        <input
          type="text"
          placeholder="🔍 Search templates by title, body, or shortcode..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
        />
      </div>

      {/* Category Tabs */}
      <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', padding: '4px 15px 8px 15px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }} className="scrollbar-none">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            style={{
              padding: '4px 10px',
              borderRadius: '20px',
              border: selectedCategory === cat ? '1px solid var(--brand-color, #a855f7)' : '1px solid var(--border)',
              background: selectedCategory === cat ? 'var(--brand-color, #a855f7)' : 'transparent',
              color: selectedCategory === cat ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: '500',
              transition: 'all 0.15s ease'
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="quick-replies-drawer-list" style={{ flex: 1, overflowY: 'auto', padding: '10px 15px' }}>
        {loading ? (
          <div className="p-4 text-center text-muted italic text-xs" style={{ padding: '1rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Loading templates...
          </div>
        ) : error ? (
          <div className="p-4 text-center text-red italic text-xs" style={{ padding: '1rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--red)', fontStyle: 'italic' }}>
            Error: {error}
          </div>
        ) : filteredReplies.length === 0 ? (
          <div className="p-4 text-center text-muted italic text-xs" style={{ padding: '1rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            No matching templates found.
          </div>
        ) : (
          filteredReplies.map(r => {
            const actionKey = `qr:${r.id}`;
            const isBusy = sendingReply === actionKey;
            return (
              <div
                key={r.id}
                className="quick-replies-drawer-item"
                onClick={() => !isBusy && onSend(r)}
                style={{
                  opacity: isBusy ? 0.5 : 1,
                  cursor: isBusy ? 'not-allowed' : 'pointer',
                  pointerEvents: isBusy ? 'none' : 'auto',
                  transition: 'opacity 0.2s ease',
                  padding: '10px',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && !isBusy && onSend(r)}
                aria-busy={isBusy}
                aria-label={`Send quick reply: ${r.title}`}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span className="quick-replies-drawer-item-title" style={{ fontWeight: '600', fontSize: '0.85rem' }}>
                    {isBusy ? '⏳ Sending...' : r.title}
                  </span>
                  <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: 'var(--border-bright)', color: 'var(--text-secondary)' }}>
                    {r.category || 'General'}
                  </span>
                  {r.shortcode && (
                    <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
                      {r.shortcode}
                    </span>
                  )}
                  {r.media_url && (
                    <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' }}>
                      📎 {r.media_type || 'Media'}
                    </span>
                  )}
                  {r.buttons && r.buttons.length > 0 && (
                    <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc' }}>
                      🔘 {r.buttons.length} Btn
                    </span>
                  )}
                  {r.usage_count > 0 && (
                    <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(234, 179, 8, 0.15)', color: '#eab308', marginLeft: 'auto' }}>
                      🔥 {r.usage_count}
                    </span>
                  )}
                </div>
                <span className="quick-replies-drawer-item-caption" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {r.text || r.caption}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
