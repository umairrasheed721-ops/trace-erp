import { useState, useEffect } from 'react'
import { useApp } from '../App'

export default function Connect() {
  const { stores, setStores, addToast, setActiveStoreId } = useApp()
  const [form, setForm] = useState({
    store_name: '', shop_domain: '', client_id: '', client_secret: '',
    postex_token: '', instaworld_key: '', instaworld_key_backup: ''
  })
  const [loading, setLoading] = useState(false)
  const [editingStore, setEditingStore] = useState(null)

  const set = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }))

  const handleConnect = async (e) => {
    e.preventDefault()
    if (!form.shop_domain || !form.client_id || !form.client_secret) {
      addToast('Please fill in Shop Domain, Client ID, and Client Secret', 'error')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const data = await res.json()
      if (data.auth_url) {
        window.open(data.auth_url, '_blank', 'width=700,height=600')
        addToast('🔗 Shopify auth page opened. Authorize the app, then click Refresh Stores below.', 'info', 8000)
      } else {
        addToast(data.error || 'Failed to generate auth URL', 'error')
      }
    } catch {
      addToast('Network error', 'error')
    }
    setLoading(false)
  }

  const refreshStores = async () => {
    const res = await fetch('/api/stores')
    const data = await res.json()
    const connected = data.filter(s => s.is_connected)
    setStores(connected)
    if (connected.length > 0) {
      setActiveStoreId(connected[0].id)
      addToast('✅ Stores refreshed!', 'success')
    }
  }

  const handleDisconnect = async (storeId, name) => {
    if (!confirm(`Disconnect "${name}"? This will delete all its data.`)) return
    await fetch(`/api/stores/${storeId}`, { method: 'DELETE' })
    await refreshStores()
    addToast(`Store "${name}" disconnected`, 'info')
  }

  const handleUpdateCreds = async (store) => {
    const res = await fetch(`/api/stores/${store.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store_name: store.store_name,
        postex_token: store.postex_token,
        instaworld_key: store.instaworld_key,
        instaworld_key_backup: store.instaworld_key_backup,
      })
    })
    if (res.ok) { addToast('✅ Credentials updated', 'success'); setEditingStore(null); refreshStores() }
    else addToast('❌ Failed to update', 'error')
  }

  return (
    <div style={{ maxWidth: 700 }}>
      <div className="page-header">
        <div>
          <h2>🔌 Connect Store</h2>
          <p>Add a new Shopify store to TRACE ERP</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={refreshStores}>🔄 Refresh Stores</button>
      </div>

      {/* Connect New Store */}
      <div className="card mb-4">
        <div className="card-title">Add New Shopify Store</div>
        <form onSubmit={handleConnect}>
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Store Name (Label)</label>
              <input className="form-input" placeholder="e.g. My Fashion Store" value={form.store_name} onChange={set('store_name')} />
            </div>
            <div className="form-group">
              <label className="form-label">Shop Domain *</label>
              <input className="form-input" placeholder="your-store.myshopify.com" value={form.shop_domain} onChange={set('shop_domain')} required />
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Shopify Client ID *</label>
              <input className="form-input font-mono" placeholder="From Shopify Partner Dashboard" value={form.client_id} onChange={set('client_id')} required />
            </div>
            <div className="form-group">
              <label className="form-label">Shopify Client Secret *</label>
              <input className="form-input font-mono" type="password" placeholder="From Shopify Partner Dashboard" value={form.client_secret} onChange={set('client_secret')} required />
            </div>
          </div>

          <div className="divider" />
          <div className="card-title">Courier API Keys (Optional — can add later)</div>

          <div className="form-group">
            <label className="form-label">PostEx Token</label>
            <input className="form-input font-mono" placeholder="PostEx API token for this store" value={form.postex_token} onChange={set('postex_token')} />
          </div>
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Instaworld Primary Key</label>
              <input className="form-input font-mono" placeholder="Primary API key" value={form.instaworld_key} onChange={set('instaworld_key')} />
            </div>
            <div className="form-group">
              <label className="form-label">Instaworld Backup Key</label>
              <input className="form-input font-mono" placeholder="Backup/fallback key" value={form.instaworld_key_backup} onChange={set('instaworld_key_backup')} />
            </div>
          </div>

          <button className="btn btn-primary btn-lg" type="submit" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? <><span className="loading-spinner"></span> Connecting...</> : '🚀 Generate Auth Link & Connect'}
          </button>
        </form>
      </div>

      {/* Connected Stores List */}
      {stores.length > 0 && (
        <div className="card">
          <div className="card-title">Connected Stores ({stores.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {stores.map(store => (
              <StoreCard
                key={store.id}
                store={store}
                editing={editingStore === store.id}
                onEdit={() => setEditingStore(store.id)}
                onCancel={() => setEditingStore(null)}
                onSave={handleUpdateCreds}
                onDisconnect={() => handleDisconnect(store.id, store.store_name || store.shop_domain)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StoreCard({ store, editing, onEdit, onCancel, onSave, onDisconnect }) {
  const [local, setLocal] = useState({ ...store })
  const setL = (key) => (e) => setLocal(prev => ({ ...prev, [key]: e.target.value }))

  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 14 }}>
      <div className="flex items-center gap-2" style={{ marginBottom: editing ? 14 : 0 }}>
        <span style={{ fontSize: '1.1rem' }}>🏪</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{store.store_name || store.shop_domain}</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{store.shop_domain}</div>
        </div>
        <span className="badge badge-delivered">● Connected</span>
        <button className="btn btn-secondary btn-sm" onClick={editing ? onCancel : onEdit}>{editing ? 'Cancel' : '✏️ Edit Keys'}</button>
        <button className="btn btn-danger btn-sm" onClick={onDisconnect}>Disconnect</button>
      </div>

      {editing && (
        <div style={{ marginTop: 12 }}>
          <div className="form-group">
            <label className="form-label">Store Name</label>
            <input className="form-input" value={local.store_name} onChange={setL('store_name')} />
          </div>
          <div className="form-group">
            <label className="form-label">PostEx Token</label>
            <input className="form-input font-mono" value={local.postex_token || ''} onChange={setL('postex_token')} placeholder="PostEx API token" />
          </div>
          <div className="form-group">
            <label className="form-label">PostEx Track URL <span style={{color:'var(--text-muted)',fontWeight:400}}>(paste exact URL from your GAS config.gs)</span></label>
            <input className="form-input font-mono" value={local.postex_track_url || ''} onChange={setL('postex_track_url')} placeholder="https://api.postex.pk/services/..." />
          </div>
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Instaworld Key</label>
              <input className="form-input font-mono" value={local.instaworld_key || ''} onChange={setL('instaworld_key')} />
            </div>
            <div className="form-group">
              <label className="form-label">Instaworld Backup</label>
              <input className="form-input font-mono" value={local.instaworld_key_backup || ''} onChange={setL('instaworld_key_backup')} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Instaworld Track URL <span style={{color:'var(--text-muted)',fontWeight:400}}>(optional, only if different from default)</span></label>
            <input className="form-input font-mono" value={local.instaworld_track_url || ''} onChange={setL('instaworld_track_url')} placeholder="https://app.instaworld.pk/api/track-order" />
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => onSave(local)}>💾 Save Changes</button>
        </div>
      )}
    </div>
  )
}
