import React, { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'

const TYPE_META = {
  confirmation: { icon: '✅', label: 'Confirmation',    color: '#34d399', bg: 'rgba(52,211,153,0.12)',  border: 'rgba(52,211,153,0.25)'  },
  address:      { icon: '🏠', label: 'Address Query',   color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.25)'  },
  shipping:     { icon: '🚚', label: 'Shipping Update', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.25)'  },
  custom:       { icon: '✨', label: 'Custom',           color: '#a855f7', bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.25)' },
}

const TAGS = ['[Name]','[OrderID]','[Price]','[Link]','[Courier]','[Tracking]','[Address]','[City]','[Phone]','[Products]','[RefNumber]','[ItemsCount]']

export default function TemplateManager() {
  const { addToast } = useApp()
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [filterType, setFilterType] = useState('all')

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/templates', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
      })
      if (res.ok) {
        const data = await res.json()
        setTemplates(Array.isArray(data) ? data : [])
      } else {
        setTemplates([])
      }
      setLoading(false)
    } catch (err) {
      console.error('Failed to load templates:', err)
      setTemplates([])
      addToast('Failed to load templates', 'error')
    }
  }

  useEffect(() => { fetchTemplates() }, [])

  const handleSave = async (e) => {
    e.preventDefault()
    const formData = new FormData(e.target)
    const payload = {
      name: formData.get('name'),
      content: formData.get('content'),
      type: formData.get('type'),
      is_default: formData.get('is_default') === 'on' ? 1 : 0,
      status: formData.get('status')
    }
    const method = editing ? 'PUT' : 'POST'
    const url = editing ? `/api/templates/${editing.id}` : '/api/templates'
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` },
        body: JSON.stringify(payload)
      })
      if (res.ok) {
        addToast(editing ? 'Template updated!' : 'Template created!', 'success')
        setShowModal(false)
        setEditing(null)
        fetchTemplates()
      }
    } catch (err) {
      addToast('Save failed', 'error')
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this template?')) return
    try {
      const res = await fetch(`/api/templates/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
      })
      if (res.ok) { addToast('Template deleted', 'success'); fetchTemplates() }
    } catch (err) {
      addToast('Delete failed', 'error')
    }
  }

  const filtered = filterType === 'all' ? templates : templates.filter(t => t.type === filterType)

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 16 }}>
      <div style={{ width: 44, height: 44, border: '3px solid rgba(168,85,247,0.3)', borderTopColor: '#a855f7', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Loading Templates...</div>
    </div>
  )

  return (
    <div className="fade-in" style={{ maxWidth: 1100 }}>

      {/* ─── Page Header ─── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 16, flexShrink: 0,
            background: 'linear-gradient(135deg, rgba(37,211,102,0.25), rgba(168,85,247,0.2))',
            border: '1px solid rgba(37,211,102,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem'
          }}>✍️</div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>WhatsApp Templates</h2>
            <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Manage your automated messaging library</p>
          </div>
        </div>
        <button
          onClick={() => { setEditing(null); setShowModal(true) }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', borderRadius: 12, border: 'none',
            background: 'linear-gradient(135deg, #25d366, #128c7e)',
            color: '#fff', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(37,211,102,0.35)', transition: 'all 0.2s'
          }}
        >
          ➕ New Template
        </button>
      </div>

      {/* ─── Stats Row ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total', count: templates.length, icon: '📋', color: '#a855f7', bg: 'rgba(168,85,247,0.1)' },
          { label: 'Active',  count: templates.filter(t => t.status === 'active').length,  icon: '🟢', color: '#34d399', bg: 'rgba(52,211,153,0.1)' },
          { label: 'Drafts',  count: templates.filter(t => t.status === 'draft').length,   icon: '🟡', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)'  },
          { label: 'Default', count: templates.filter(t => t.is_default).length,           icon: '⭐', color: '#60a5fa', bg: 'rgba(96,165,250,0.1)'  },
        ].map(s => (
          <div key={s.label} style={{
            padding: '14px 18px', borderRadius: 14,
            background: s.bg, border: `1px solid ${s.bg.replace('0.1', '0.25')}`,
            display: 'flex', alignItems: 'center', gap: 12
          }}>
            <span style={{ fontSize: '1.3rem' }}>{s.icon}</span>
            <div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.count}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Filter Pills ─── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {['all', 'confirmation', 'address', 'shipping', 'custom'].map(f => {
          const meta = f === 'all' ? { icon: '📋', label: 'All Types' } : TYPE_META[f]
          const active = filterType === f
          return (
            <button
              key={f}
              onClick={() => setFilterType(f)}
              style={{
                padding: '6px 14px', borderRadius: 20, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
                background: active ? (f === 'all' ? 'rgba(168,85,247,0.2)' : TYPE_META[f]?.bg || 'rgba(168,85,247,0.2)') : 'var(--bg-elevated)',
                border: active ? `1px solid ${f === 'all' ? 'rgba(168,85,247,0.4)' : TYPE_META[f]?.border || 'rgba(168,85,247,0.4)'}` : '1px solid var(--border)',
                color: active ? (f === 'all' ? 'var(--brand)' : TYPE_META[f]?.color || 'var(--brand)') : 'var(--text-muted)',
              }}
            >
              <span>{meta.icon}</span> {meta.label}
              <span style={{
                fontSize: '0.65rem', fontWeight: 700,
                background: 'rgba(255,255,255,0.1)', padding: '1px 6px', borderRadius: 10
              }}>
                {f === 'all' ? templates.length : templates.filter(t => t.type === f).length}
              </span>
            </button>
          )
        })}
      </div>

      {/* ─── Templates Grid ─── */}
      {filtered.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          padding: '60px 0', color: 'var(--text-muted)'
        }}>
          <div style={{ fontSize: 48 }}>📭</div>
          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>No templates found</div>
          <div style={{ fontSize: '0.8rem' }}>Create your first template to get started</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, marginBottom: 28 }}>
          {filtered.map(t => {
            const meta = TYPE_META[t.type] || TYPE_META.custom
            return (
              <div key={t.id} style={{
                background: 'var(--bg-card)',
                border: `1px solid var(--border)`,
                borderRadius: 16, overflow: 'hidden',
                display: 'flex', flexDirection: 'column',
                boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
                transition: 'all 0.2s'
              }}>
                {/* Card Header */}
                <div style={{
                  padding: '14px 16px 12px',
                  background: `linear-gradient(90deg, ${meta.bg} 0%, transparent 100%)`,
                  borderBottom: '1px solid var(--border)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Type + Status badges */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                        background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`
                      }}>
                        {meta.icon} {meta.label.toUpperCase()}
                      </span>
                      {t.status === 'draft' ? (
                        <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>DRAFT</span>
                      ) : (
                        <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }}>ACTIVE</span>
                      )}
                      {t.is_default ? (
                        <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(168,85,247,0.2)', color: 'var(--brand)', border: '1px solid rgba(168,85,247,0.35)' }}>⭐ DEFAULT</span>
                      ) : null}
                    </div>
                    {/* Template name */}
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.name}
                    </div>
                  </div>
                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 6, marginLeft: 10 }}>
                    <button
                      onClick={() => { setEditing(t); setShowModal(true) }}
                      style={{
                        width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)',
                        background: 'var(--bg-elevated)', cursor: 'pointer', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem',
                        transition: 'all 0.15s'
                      }}
                    >✏️</button>
                    <button
                      onClick={() => handleDelete(t.id)}
                      style={{
                        width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(239,68,68,0.25)',
                        background: 'rgba(239,68,68,0.08)', cursor: 'pointer', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem',
                        transition: 'all 0.15s'
                      }}
                    >🗑️</button>
                  </div>
                </div>

                {/* WhatsApp-style message bubble preview */}
                <div style={{ padding: 14, flex: 1 }}>
                  <div style={{
                    background: 'rgba(37,211,102,0.06)',
                    border: '1px solid rgba(37,211,102,0.15)',
                    borderRadius: '0 12px 12px 12px',
                    padding: '10px 13px',
                    fontSize: '0.8rem', lineHeight: 1.55,
                    color: 'var(--text-secondary)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    maxHeight: 120, overflowY: 'auto',
                    position: 'relative'
                  }}>
                    <div style={{
                      position: 'absolute', top: 0, left: -6,
                      width: 0, height: 0,
                      borderTop: '6px solid rgba(37,211,102,0.15)',
                      borderLeft: '6px solid transparent',
                    }} />
                    {t.content}
                  </div>
                </div>

                {/* Footer */}
                <div style={{
                  padding: '10px 16px',
                  borderTop: '1px solid var(--border)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    🕐 {new Date(t.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    {t.content.length} chars
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ─── Placeholder Reference Card ─── */}
      <div style={{
        borderRadius: 16, overflow: 'hidden',
        border: '1px solid rgba(168,85,247,0.2)',
        background: 'linear-gradient(135deg, rgba(168,85,247,0.06) 0%, transparent 100%)'
      }}>
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid rgba(168,85,247,0.15)',
          display: 'flex', alignItems: 'center', gap: 10
        }}>
          <span style={{ fontSize: '1.1rem' }}>💡</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>Dynamic Placeholder Tags</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 1 }}>
              Use these in your message content — they'll be replaced with live order data at send time
            </div>
          </div>
        </div>
        <div style={{ padding: '14px 20px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {TAGS.map(tag => (
            <span
              key={tag}
              style={{
                padding: '4px 11px', borderRadius: 6, cursor: 'default',
                fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 600,
                background: 'rgba(168,85,247,0.12)', color: 'var(--brand)',
                border: '1px solid rgba(168,85,247,0.25)',
                transition: 'all 0.15s'
              }}
            >{tag}</span>
          ))}
        </div>
      </div>

      {/* ─── Modal ─── */}
      {showModal && (
        <TemplateModal
          editing={editing}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditing(null) }}
        />
      )}
    </div>
  )
}

function TemplateModal({ editing, onSave, onClose }) {
  const [content, setContent] = useState(editing?.content || '')
  const [selectedType, setSelectedType] = useState(editing?.type || 'custom')
  const meta = TYPE_META[selectedType] || TYPE_META.custom

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16
    }}>
      <form
        onSubmit={onSave}
        style={{
          width: '100%', maxWidth: 640,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: '0 24px 80px rgba(0,0,0,0.4)'
        }}
      >
        {/* Modal Header */}
        <div style={{
          padding: '18px 24px',
          background: 'linear-gradient(90deg, rgba(37,211,102,0.08) 0%, transparent 100%)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.2rem' }}>{editing ? '✏️' : '➕'}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
                {editing ? 'Edit Template' : 'New Template'}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 1 }}>
                {editing ? 'Update your message template' : 'Create a reusable WhatsApp message'}
              </div>
            </div>
          </div>
          <button
            type="button" onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              cursor: 'pointer', fontSize: '0.9rem', display: 'flex',
              alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)'
            }}
          >✕</button>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Name */}
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Template Name *
            </label>
            <input
              name="name"
              className="form-input"
              defaultValue={editing?.name}
              required
              placeholder="e.g. Order Confirmation v2"
            />
          </div>

          {/* Type + Status row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Template Type
              </label>
              <select
                name="type"
                className="form-input"
                value={selectedType}
                onChange={e => setSelectedType(e.target.value)}
              >
                <option value="confirmation">✅ Confirmation</option>
                <option value="address">🏠 Address Query</option>
                <option value="shipping">🚚 Shipping Update</option>
                <option value="custom">✨ Custom</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Status
              </label>
              <select name="status" className="form-input" defaultValue={editing?.status || 'active'}>
                <option value="active">🟢 Active</option>
                <option value="draft">🟡 Draft</option>
              </select>
            </div>
          </div>

          {/* Message Content + Live Preview */}
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Message Content *
            </label>
            <textarea
              name="content"
              className="form-input"
              rows={5}
              value={content}
              onChange={e => setContent(e.target.value)}
              required
              placeholder="Hi [Name], your order [OrderID] has been confirmed..."
              style={{ resize: 'vertical' }}
            />
            {/* Live preview bubble */}
            {content && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600 }}>
                  Preview
                </div>
                <div style={{
                  background: 'rgba(37,211,102,0.06)',
                  border: '1px solid rgba(37,211,102,0.15)',
                  borderRadius: '0 12px 12px 12px',
                  padding: '10px 14px',
                  fontSize: '0.8rem', lineHeight: 1.55,
                  color: 'var(--text-secondary)',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word'
                }}>
                  {content}
                </div>
              </div>
            )}
            <div style={{ marginTop: 8, fontSize: '0.68rem', color: 'var(--text-muted)' }}>
              {content.length} characters
            </div>
          </div>

          {/* Default checkbox */}
          <label style={{
            display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
            padding: '10px 14px', borderRadius: 10,
            background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.15)'
          }}>
            <input
              type="checkbox"
              name="is_default"
              defaultChecked={!!editing?.is_default}
              style={{ width: 16, height: 16, accentColor: 'var(--brand)', cursor: 'pointer' }}
            />
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>Set as default for this type</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>This template will be used automatically for {meta.label} messages</div>
            </div>
          </label>
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '16px 24px', borderTop: '1px solid var(--border)',
          display: 'flex', gap: 10
        }}>
          <button
            type="submit"
            style={{
              flex: 1, padding: '11px 20px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg, #25d366, #128c7e)',
              color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer',
              boxShadow: '0 3px 12px rgba(37,211,102,0.3)'
            }}
          >
            💾 Save Template
          </button>
          <button
            type="button" onClick={onClose}
            style={{
              padding: '11px 20px', borderRadius: 12,
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer'
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
