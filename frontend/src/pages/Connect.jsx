import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'

export default function Connect() {
  const { stores, setStores, addToast, setActiveStoreId } = useApp()
  const [form, setForm] = useState({
    store_name: '', shop_domain: '', client_id: '', client_secret: '',
    postex_token: '', instaworld_key: '', instaworld_key_backup: '',
    sync_start_date: ''
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

  useEffect(() => {
    const anySyncing = stores.some(s => s.sync_status === 'syncing');
    if (anySyncing) {
      const timer = setInterval(refreshStores, 3000);
      return () => clearInterval(timer);
    }
  }, [stores]);

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
        postex_token: store.postex_token || '',
        instaworld_key: store.instaworld_key || '',
        instaworld_key_backup: store.instaworld_key_backup || '',
        sync_start_date: store.sync_start_date || '',
        postex_track_url: store.postex_track_url || '',
        instaworld_track_url: store.instaworld_track_url || ''
      })
    })
    if (res.ok) { addToast('✅ Credentials updated', 'success'); setEditingStore(null); refreshStores() }
    else addToast('❌ Failed to update', 'error')
  }

  const handleDeepSync = async (storeId, name) => {
    if (!confirm(`🚀 Start deep historical sync for "${name}"?\nThis will scan back to your chosen Start Date and fill any missing gaps.`)) return
    try {
      const res = await fetch(`/api/stores/${storeId}/deep-sync`, { method: 'POST' })
      if (res.ok) addToast('🔍 Historical sync started in background', 'success')
      else addToast('❌ Failed to start sync', 'error')
    } catch {
      addToast('Network error', 'error')
    }
  }

  return (
    <div className="animate-fade" style={{ maxWidth: 800 }}>
      <div className="page-header">
        <div>
          <h2>Integrations</h2>
          <p>Manage your Shopify stores and courier API connections</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={refreshStores}>🔄 Sync Status</button>
      </div>

      <div className="card mb-8">
        <h3 className="mb-4">Connect New Store</h3>
        <form onSubmit={handleConnect}>
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Store Identifier</label>
              <input className="form-input" placeholder="e.g. TRACE CLOTHING" value={form.store_name} onChange={set('store_name')} />
            </div>
            <div className="form-group">
              <label className="form-label">Shop Domain (.myshopify.com) *</label>
              <input className="form-input" placeholder="trace-demo.myshopify.com" value={form.shop_domain} onChange={set('shop_domain')} required />
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Shopify Client ID *</label>
              <input className="form-input font-mono" style={{ fontSize: '0.8rem' }} placeholder="76e82..." value={form.client_id} onChange={set('client_id')} required />
            </div>
            <div className="form-group">
              <label className="form-label">Shopify Client Secret *</label>
              <input className="form-input font-mono" style={{ fontSize: '0.8rem' }} type="password" placeholder="••••••••" value={form.client_secret} onChange={set('client_secret')} required />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Historical Authority Date</label>
            <input className="form-input" type="date" value={form.sync_start_date} onChange={set('sync_start_date')} />
            <small className="text-muted">Orders older than this will be ignored by TRACE.</small>
          </div>

          <div className="divider" />
          <h4 className="mb-4 text-secondary">Courier Gateway Configuration</h4>

          <div className="form-group">
            <label className="form-label">PostEx API Token</label>
            <input className="form-input font-mono" style={{ fontSize: '0.8rem' }} placeholder="Enter PostEx merchant token" value={form.postex_token} onChange={set('postex_token')} />
          </div>
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Instaworld Primary Key</label>
              <input className="form-input font-mono" style={{ fontSize: '0.8rem' }} placeholder="Primary key" value={form.instaworld_key} onChange={set('instaworld_key')} />
            </div>
            <div className="form-group">
              <label className="form-label">Instaworld Backup Key</label>
              <input className="form-input font-mono" style={{ fontSize: '0.8rem' }} placeholder="Backup key" value={form.instaworld_key_backup} onChange={set('instaworld_key_backup')} />
            </div>
          </div>

          <button className="btn btn-primary btn-lg mt-4" type="submit" disabled={loading}>
            {loading ? <><span className="loading-spinner"></span> Connecting...</> : '🚀 Connect Store'}
          </button>
        </form>
      </div>

      {stores.length > 0 && (
        <div className="card">
          <h3 className="mb-4">Active Connections ({stores.length})</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {stores.map(store => (
              <StoreCard
                key={store.id}
                store={store}
                editing={editingStore === store.id}
                onEdit={() => setEditingStore(store.id)}
                onCancel={() => setEditingStore(null)}
                onSave={handleUpdateCreds}
                onDeepSync={() => handleDeepSync(store.id, store.store_name || store.shop_domain)}
                onDisconnect={() => handleDisconnect(store.id, store.store_name || store.shop_domain)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StoreCard({ store, editing, onEdit, onCancel, onSave, onDeepSync, onDisconnect }) {
  const [local, setLocal] = useState({ ...store })
  const setL = (key) => (e) => setLocal(prev => ({ ...prev, [key]: e.target.value }))

  return (
    <div className="card bg-elevated animate-fade" style={{ padding: 20 }}>
      <div className="flex items-center gap-4">
        <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', border: '1px solid var(--border)' }}>🏪</div>
        <div style={{ flex: 1 }}>
          <div className="font-bold" style={{ fontSize: '1.1rem' }}>{store.store_name || store.shop_domain}</div>
          <div className="text-secondary" style={{ fontSize: '0.8rem' }}>{store.shop_domain}</div>
        </div>
        <div className="flex gap-2">
          {store.sync_status === 'syncing' ? (
            <span className="badge badge-pending">⏳ Syncing...</span>
          ) : (
            <span className="badge badge-delivered">● Connected</span>
          )}
          <button className="btn btn-secondary btn-sm" onClick={onDeepSync} disabled={store.sync_status === 'syncing'}>Historical Pull</button>
          <button className="btn btn-secondary btn-sm" onClick={editing ? onCancel : onEdit}>{editing ? 'Cancel' : 'Configure'}</button>
          <button className="btn btn-secondary btn-sm" style={{ color: 'var(--danger)' }} onClick={onDisconnect}>Remove</button>
        </div>
      </div>

      {store.sync_status === 'syncing' && (
        <div className="mt-8 animate-fade">
           <div className="flex justify-between mb-4">
              <span className="text-secondary font-bold" style={{ fontSize: '0.8rem' }}>Historical Sync: {store.sync_progress}</span>
              <span className="text-brand font-bold" style={{ fontSize: '0.8rem' }}>{store.sync_total ? `${Math.round((store.sync_processed / store.sync_total) * 100)}%` : 'Processing...'}</span>
           </div>
           <div className="progress-bar">
              <div className="progress-fill" style={{ width: store.sync_total ? `${Math.round((store.sync_processed / store.sync_total) * 100)}%` : '100%' }}></div>
           </div>
        </div>
      )}

      {editing && (
        <div className="mt-8 pt-8 border-t border-dashed animate-fade">
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Store Label</label>
              <input className="form-input" value={local.store_name} onChange={setL('store_name')} />
            </div>
            <div className="form-group">
              <label className="form-label">Sync Start Date</label>
              <input className="form-input" type="date" value={local.sync_start_date || ''} onChange={setL('sync_start_date')} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">PostEx Token</label>
            <input className="form-input font-mono" style={{ fontSize: '0.8rem' }} value={local.postex_token || ''} onChange={setL('postex_token')} />
          </div>
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Instaworld Key</label>
              <input className="form-input font-mono" style={{ fontSize: '0.8rem' }} value={local.instaworld_key || ''} onChange={setL('instaworld_key')} />
            </div>
            <div className="form-group">
              <label className="form-label">Backup Key</label>
              <input className="form-input font-mono" style={{ fontSize: '0.8rem' }} value={local.instaworld_key_backup || ''} onChange={setL('instaworld_key_backup')} />
            </div>
          </div>
          <button className="btn btn-primary btn-sm mt-4" onClick={() => onSave(local)}>💾 Save Configuration</button>
        </div>
      )}
    </div>
  )
}
