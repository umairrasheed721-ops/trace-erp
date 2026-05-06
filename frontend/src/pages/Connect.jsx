import { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'

export default function Connect() {
  const { stores, setStores, addToast, setActiveStoreId } = useApp()
  const [form, setForm] = useState({
    store_name: '', shop_domain: '', client_id: '', client_secret: '',
    postex_token: '', instaworld_key: '', instaworld_key_backup: '', instaworld_key_3: '',
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

  // Poll while any store is syncing
  useEffect(() => {
    const anySyncing = stores.some(s => s.sync_status === 'syncing')
    if (anySyncing) {
      const timer = setInterval(() => refreshStores(true), 2500)
      return () => clearInterval(timer)
    }
  }, [stores])

  const refreshStores = async (silent = false) => {
    const res = await fetch('/api/stores')
    const data = await res.json()
    const connected = data.filter(s => s.is_connected)
    setStores(connected)
    if (connected.length > 0) setActiveStoreId(connected[0].id)
    if (!silent) addToast('✅ Stores refreshed!', 'success')
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
        instaworld_key_3: store.instaworld_key_3 || '',
        sync_start_date: store.sync_start_date || '',
        postex_track_url: store.postex_track_url || '',
        instaworld_track_url: store.instaworld_track_url || ''
      })
    })
    if (res.ok) { addToast('✅ Credentials updated', 'success'); setEditingStore(null); refreshStores(true) }
    else addToast('❌ Failed to update', 'error')
  }

  const handleDeepSync = async (storeId, startDate, syncStatus, syncCosts) => {
    try {
      const res = await fetch(`/api/stores/${storeId}/deep-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, syncStatus, syncCosts })
      })
      if (res.ok) {
        addToast('🗄️ Historical sync started! Progress shown below.', 'success')
        refreshStores(true)
      } else {
        addToast('❌ Failed to start sync', 'error')
      }
    } catch {
      addToast('Network error', 'error')
    }
  }

  const handleEnableRealTimeSync = async (storeId, name) => {
    try {
      addToast(`Registering webhooks for ${name}...`, 'info')
      const res = await fetch(`/api/stores/${storeId}/register-webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appUrl: window.location.origin })
      })
      if (res.ok) addToast(`✅ Real-time sync enabled for ${name}!`, 'success')
      else addToast(`❌ Failed to enable real-time sync for ${name}.`, 'error')
    } catch {
      addToast('Network error', 'error')
    }
  }

  const handleSyncSingleOrder = async (storeId, orderName) => {
    if (!orderName) return
    try {
      addToast(`🎯 Sniper Tool: Fetching order ${orderName}...`, 'info')
      const res = await fetch(`/api/stores/${storeId}/sync-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderName })
      })
      const data = await res.json()
      if (res.ok) {
        addToast(`✅ ${data.message}`, 'success')
      } else {
        addToast(`❌ ${data.error}`, 'error')
      }
    } catch {
      addToast('Network error', 'error')
    }
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="page-header">
        <div>
          <h2>🔌 Connect Store</h2>
          <p>Add a new Shopify store to TRACE ERP</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => refreshStores()}>🔄 Refresh Stores</button>
      </div>

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

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label className="form-label" style={{ margin: 0 }}>Initial Sync Start Date (Authority)</label>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => set('sync_start_date')({ target: { value: '2010-01-01' } })} style={{ padding: '2px 8px', fontSize: '0.65rem' }}>📅 All Time</button>
            </div>
            <input className="form-input" type="date" value={form.sync_start_date} onChange={set('sync_start_date')} />
            <small style={{ color: 'var(--text-muted)' }}>Orders before this date will never be pulled.</small>
          </div>

          <div className="divider" />
          <div className="card-title">Courier API Keys (Optional)</div>

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
          <div className="form-group" style={{ marginTop: 8 }}>
            <label className="form-label">Instaworld Key 3 (Optional)</label>
            <input className="form-input font-mono" placeholder="3rd API Key" value={form.instaworld_key_3} onChange={set('instaworld_key_3')} />
          </div>

          <button className="btn btn-primary btn-lg" type="submit" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? <><span className="loading-spinner"></span> Connecting...</> : '🚀 Generate Auth Link & Connect'}
          </button>
        </form>
      </div>

      {stores.length > 0 && (
        <div className="card">
          <div className="card-title">Connected Stores ({stores.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {stores.map(store => (
              <StoreCard
                key={store.id}
                store={store}
                editing={editingStore === store.id}
                onEdit={() => setEditingStore(store.id)}
                onCancel={() => setEditingStore(null)}
                onSave={handleUpdateCreds}
                onDeepSync={handleDeepSync}
                onSyncSingleOrder={handleSyncSingleOrder}
                onDisconnect={() => handleDisconnect(store.id, store.store_name || store.shop_domain)}
                onEnableRealTime={() => handleEnableRealTimeSync(store.id, store.store_name || store.shop_domain)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StoreCard({ store, editing, onEdit, onCancel, onSave, onDeepSync, onSyncSingleOrder, onDisconnect, onEnableRealTime }) {
  const [local, setLocal] = useState({ ...store })
  const setL = (key) => (e) => setLocal(prev => ({ ...prev, [key]: e.target.value }))

  const [showSyncPanel, setShowSyncPanel] = useState(false)
  const [syncStartDate, setSyncStartDate] = useState(store.sync_start_date || '2023-01-01')
  const [syncStatus, setSyncStatus] = useState(true)
  const [syncCosts, setSyncCosts] = useState(false)
  const [singleOrderNum, setSingleOrderNum] = useState('')

  const isSyncing = store.sync_status === 'syncing'
  const progressPct = store.sync_total > 0
    ? Math.min(Math.round((store.sync_processed / store.sync_total) * 100), 99)
    : null

  const handleStartSync = () => {
    if (!syncStartDate) return alert('Please select a start date.')
    if (!confirm(`⚠️ This will pull ALL orders from ${syncStartDate}. Start Historical Sync?`)) return
    setShowSyncPanel(false)
    onDeepSync(store.id, syncStartDate, syncStatus, syncCosts)
  }

  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 16 }}>
      
      <div className="flex items-center gap-2" style={{ flexWrap: 'wrap', rowGap: 8 }}>
        <span style={{ fontSize: '1.2rem' }}>🏪</span>
        <div style={{ flex: 1, minWidth: 120 }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{store.store_name || store.shop_domain}</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{store.shop_domain}</div>
        </div>

        {isSyncing ? (
          <span className="badge badge-pending">⏳ Syncing...</span>
        ) : (
          <span className="badge badge-delivered">● Connected</span>
        )}

        <button className="btn btn-primary btn-sm" onClick={onEnableRealTime}>⚡ Real-Time Sync</button>
        <button className="btn btn-secondary btn-sm" onClick={editing ? onCancel : onEdit}>
          {editing ? 'Cancel' : '✏️ Edit Keys'}
        </button>
        <button className="btn btn-danger btn-sm" onClick={onDisconnect}>Disconnect</button>
      </div>

      {isSyncing ? (
        <div style={{ marginTop: 14, background: 'rgba(99,102,241,0.05)', borderRadius: 10, padding: 14 }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--brand)', marginBottom: 8 }}>Historical Sync In Progress</div>
          <div style={{ fontSize: '0.72rem', color: '#60a5fa', marginBottom: 10 }}>{store.sync_progress || 'Processing...'}</div>
          {progressPct !== null && (
            <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 6, overflow: 'hidden', height: 6 }}>
              <div style={{ height: '100%', background: 'var(--brand)', width: `${progressPct}%` }} />
            </div>
          )}
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          {!showSyncPanel ? (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowSyncPanel(true)} style={{ width: '100%', border: '1px dashed var(--border)' }}>
              🗄️ Sync All Historical Orders
            </button>
          ) : (
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 12 }}>🗄️ Historical Sync Options</div>
              
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>📅 Sync From Date</label>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSyncStartDate('2010-01-01')} style={{ padding: '2px 6px', fontSize: '0.6rem' }}>All Time</button>
                </div>
                <input type="date" className="form-input" value={syncStartDate} onChange={e => setSyncStartDate(e.target.value)} style={{ height: 36 }} />
              </div>

              <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                 <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={syncStatus} onChange={e => setSyncStatus(e.target.checked)} /> Status (Fast)
                 </label>
                 <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={syncCosts} onChange={e => setSyncCosts(e.target.checked)} /> Costs (Slow)
                 </label>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={handleStartSync} style={{ flex: 1 }}>🚀 Start Sync</button>
                <button className="btn btn-secondary" onClick={() => setShowSyncPanel(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 12, padding: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 8 }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>🎯 Sniper Tool: Sync Specific Order</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="form-input" placeholder="Order # (e.g. #16374)" value={singleOrderNum} onChange={e => setSingleOrderNum(e.target.value)} style={{ height: 32, fontSize: '0.8rem', flex: 1 }} />
          <button className="btn btn-primary btn-sm" onClick={() => { onSyncSingleOrder(store.id, singleOrderNum); setSingleOrderNum(''); }}>Sync Now</button>
        </div>
      </div>

      {editing && (
        <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <div className="form-grid-2">
            <div className="form-group"><label className="form-label">Store Name</label><input className="form-input" value={local.store_name} onChange={setL('store_name')} /></div>
            <div className="form-group"><label className="form-label">Start Date</label><input className="form-input" type="date" value={local.sync_start_date || ''} onChange={setL('sync_start_date')} /></div>
          </div>
          <div className="form-group"><label className="form-label">PostEx Token</label><input className="form-input font-mono" value={local.postex_token || ''} onChange={setL('postex_token')} /></div>
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Instaworld Primary Key</label>
              <input className="form-input font-mono" placeholder="Primary API key" value={local.instaworld_key || ''} onChange={setL('instaworld_key')} />
            </div>
            <div className="form-group">
              <label className="form-label">Instaworld Backup Key</label>
              <input className="form-input font-mono" placeholder="Backup/fallback key" value={local.instaworld_key_backup || ''} onChange={setL('instaworld_key_backup')} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Instaworld Key 3 (Optional)</label>
            <input className="form-input font-mono" placeholder="3rd API Key" value={local.instaworld_key_3 || ''} onChange={setL('instaworld_key_3')} />
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => onSave(local)}>💾 Save Changes</button>
        </div>
      )}
    </div>
  )
}
