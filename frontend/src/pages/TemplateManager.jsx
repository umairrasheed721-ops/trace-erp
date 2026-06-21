import React, { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'

export default function TemplateManager() {
  const { addToast } = useApp()
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [showModal, setShowModal] = useState(false)

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/templates', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
      })
      const data = await res.json()
      setTemplates(data)
      setLoading(false)
    } catch (err) {
      addToast('Failed to load templates', 'error')
    }
  }

  useEffect(() => {
    fetchTemplates()
  }, [])

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
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('trace_token')}`
        },
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
      if (res.ok) {
        addToast('Template deleted', 'success')
        fetchTemplates()
      }
    } catch (err) {
      addToast('Delete failed', 'error')
    }
  }

  if (loading) return <div className="loading-overlay">⌛ Loading Templates...</div>

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h2>✍️ WhatsApp Templates</h2>
          <p>Manage your automated messaging strategy</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true) }}>
          ➕ New Template
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {templates.map(t => (
          <div key={t.id} className="card glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '1.1rem' }}>{t.name}</h4>
                <span className="badge" style={{ fontSize: '0.65rem', background: 'rgba(255,255,255,0.1)' }}>{t.type.toUpperCase()}</span>
                {t.status === 'draft' ? <span className="badge" style={{ marginLeft: 5, background: 'rgba(255,255,255,0.2)', color: 'white' }}>DRAFT</span> : <span className="badge" style={{ marginLeft: 5, background: 'rgba(0, 255, 0, 0.1)', color: '#4ade80', border: '1px solid rgba(74, 222, 128, 0.2)' }}>ACTIVE</span>}
                {t.is_default ? <span className="badge" style={{ marginLeft: 5, background: 'var(--brand)', color: 'black' }}>DEFAULT</span> : null}
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                <button className="btn-icon" onClick={() => { setEditing(t); setShowModal(true) }}>✏️</button>
                <button className="btn-icon" style={{ color: 'var(--red)' }} onClick={() => handleDelete(t.id)}>🗑️</button>
              </div>
            </div>
            
            <div style={{ 
              background: 'rgba(0,0,0,0.2)', 
              padding: 12, 
              borderRadius: 8, 
              fontSize: '0.85rem', 
              flex: 1,
              whiteSpace: 'pre-wrap',
              opacity: 0.8,
              border: '1px solid rgba(255,255,255,0.05)'
            }}>
              {t.content}
            </div>

            <div style={{ marginTop: 15, fontSize: '0.7rem', opacity: 0.5 }}>
              Created: {new Date(t.created_at).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <form className="modal-content glass-panel" style={{ width: '600px' }} onSubmit={handleSave}>
            <h3 className="premium-title">{editing ? 'Edit Template' : 'New Template'}</h3>
            
            <div className="form-group">
              <label>Template Name</label>
              <input name="name" className="premium-input" defaultValue={editing?.name} required placeholder="e.g. Order Confirmation v2" />
            </div>

            <div className="form-group">
              <label>Template Type</label>
              <select name="type" className="premium-input" defaultValue={editing?.type || 'custom'}>
                <option value="confirmation">✅ Confirmation</option>
                <option value="address">🏠 Address Query</option>
                <option value="shipping">🚚 Shipping Update</option>
                <option value="custom">✨ Custom</option>
              </select>
            </div>

            <div className="form-group">
              <label>Status</label>
              <select name="status" className="premium-input" defaultValue={editing?.status || 'active'}>
                <option value="active">🟢 Active</option>
                <option value="draft">🟡 Draft</option>
              </select>
            </div>

            <div className="form-group">
              <label>Message Content</label>
              <textarea 
                name="content" 
                className="premium-input" 
                rows={6} 
                defaultValue={editing?.content} 
                required 
                placeholder="Hi [Name], your order [OrderID] is ready..."
              />
              <div style={{ marginTop: 8, fontSize: '0.75rem', opacity: 0.6 }}>
                <b>Available Tags:</b> [Name], [OrderID], [Price], [Link], [Courier], [Tracking], [Address], [City], [Phone], [Products], [RefNumber], [ItemsCount]
              </div>
            </div>

            <div className="form-group flex items-center gap-2">
              <input type="checkbox" name="is_default" defaultChecked={editing?.is_default} />
              <label style={{ margin: 0 }}>Set as default for this type</label>
            </div>

            <div className="modal-actions" style={{ marginTop: 30 }}>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Save Template</button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card mt-10" style={{ background: 'var(--bg-active)', border: '1px dashed var(--brand)' }}>
        <h4 style={{ margin: '0 0 10px 0' }}>💡 Pro Tip: Placeholders</h4>
        <p style={{ fontSize: '0.9rem', opacity: 0.8 }}>
          Use the tags below to make your messages personal. The system will replace them with actual order data:
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 15 }}>
          <code style={{ background: 'black', padding: '4px 8px', borderRadius: 4 }}>[Name]</code>
          <code style={{ background: 'black', padding: '4px 8px', borderRadius: 4 }}>[OrderID]</code>
          <code style={{ background: 'black', padding: '4px 8px', borderRadius: 4 }}>[Price]</code>
          <code style={{ background: 'black', padding: '4px 8px', borderRadius: 4 }}>[Link]</code>
          <code style={{ background: 'black', padding: '4px 8px', borderRadius: 4 }}>[Courier]</code>
          <code style={{ background: 'black', padding: '4px 8px', borderRadius: 4 }}>[Tracking]</code>
          <code style={{ background: 'black', padding: '4px 8px', borderRadius: 4 }}>[Address]</code>
          <code style={{ background: 'black', padding: '4px 8px', borderRadius: 4 }}>[City]</code>
          <code style={{ background: 'black', padding: '4px 8px', borderRadius: 4 }}>[Phone]</code>
          <code style={{ background: 'black', padding: '4px 8px', borderRadius: 4 }}>[Products]</code>
          <code style={{ background: 'black', padding: '4px 8px', borderRadius: 4 }}>[RefNumber]</code>
          <code style={{ background: 'black', padding: '4px 8px', borderRadius: 4 }}>[ItemsCount]</code>
        </div>
      </div>
    </div>
  )
}
