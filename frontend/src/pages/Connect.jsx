import { useState, useEffect, useRef } from 'react'
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
        sync_start_date: store.sync_start_date || '',
        postex_track_url: store.postex_track_url || '',
        instaworld_track_url: store.instaworld_track_url || ''
      })
    })
    if (res.ok) { addToast('✅ Credentials updated', 'success'); setEditingStore(null); refreshStores(true) }
    else addToast('❌ Failed to update', 'error')
  }

  const handleDeepSync = async (storeId, startDate) => {
    try {
      const res = await fetch(`/api/stores/${storeId}/deep-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate })
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

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="page-header">
        <div>
          <h2>🔌 Connect Store</h2>
          <p>Add a new Shopify store to TRACE ERP</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => refreshStores()}>🔄 Refresh Stores</button>
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

          <div className="form-group">
            <label className="form-label">Initial Sync Start Date (Authority)</label>
            <input className="form-input" type="date" value={form.sync_start_date} onChange={set('sync_start_date')} />
            <small style={{ color: 'var(--text-muted)' }}>Orders before this date will never be pulled.</small>
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

function StoreCard({ store, editing, onEdit, onCancel, onSave, onDeepSync, onDisconnect, onEnableRealTime }) {
  const [local, setLocal] = useState({ ...store })
  const setL = (key) => (e) => setLocal(prev => ({ ...prev, [key]: e.target.value }))

  // Historical sync state
  const [showSyncPanel, setShowSyncPanel] = useState(false)
  const [syncStartDate, setSyncStartDate] = useState(store.sync_start_date || '2023-01-01')

  const isSyncing = store.sync_status === 'syncing'
  const progressPct = store.sync_total > 0
    ? Math.min(Math.round((store.sync_processed / store.sync_total) * 100), 99)
    : null

  const handleStartSync = async () => {
    if (!syncStartDate) {
      alert('Please select a start date.')
      return
    }
    const orderCount = confirm(
      `⚠️ This will pull ALL orders from ${syncStartDate} to today.\n\nDepending on how many orders you have, this can take 5–30 minutes.\n\nStart Historical Sync?`
    )
    if (!orderCount) return
    setShowSyncPanel(false)
    onDeepSync(store.id, syncStartDate)
  }

  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 16 }}>

      {/* Store Header Row */}
      <div className="flex items-center gap-2" style={{ flexWrap: 'wrap', rowGap: 8 }}>
        <span style={{ fontSize: '1.2rem' }}>🏪</span>
        <div style={{ flex: 1, minWidth: 120 }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{store.store_name || store.shop_domain}</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{store.shop_domain}</div>
          {store.last_synced_at && (
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>
              Last synced: {new Date(store.last_synced_at).toLocaleString()}
            </div>
          )}
        </div>

        {/* Status badge */}
        {isSyncing ? (
          <span className="badge badge-pending">⏳ Syncing...</span>
        ) : store.sync_status === 'error' ? (
          <span className="badge badge-danger" title={store.sync_progress}>❌ Error</span>
        ) : (
          <span className="badge badge-delivered">● Connected</span>
        )}

        <button
          className="btn btn-primary btn-sm"
          style={{ backgroundColor: 'var(--brand)', color: 'black', fontWeight: 700 }}
          onClick={onEnableRealTime}
          title="Register Shopify webhooks for real-time order creation/updates"
        >
          ⚡ Real-Time Sync
        </button>
        <button className="btn btn-secondary btn-sm" onClick={editing ? onCancel : onEdit}>
          {editing ? 'Cancel' : '✏️ Edit Keys'}
        </button>
        <button className="btn btn-danger btn-sm" onClick={onDisconnect}>Disconnect</button>
      </div>

      {/* ─── Historical Sync Section ─────────────────────────────── */}
      {isSyncing ? (
        /* Active sync progress bar */
        <div style={{
          marginTop: 14,
          background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(99,102,241,0.03))',
          border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: 10,
          padding: '14px 16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: '0.8rem' }}>🗄️</span>
            <span style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--brand)' }}>Historical Sync In Progress</span>
            <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              {store.sync_processed > 0 && `${store.sync_processed.toLocaleString()} scanned`}
            </span>
          </div>

          {/* Animated message */}
          <div style={{ fontSize: '0.72rem', color: '#60a5fa', marginBottom: 8, minHeight: 16 }}>
            {store.sync_progress || 'Initializing...'}
          </div>

          {/* Progress bar */}
          <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 6, overflow: 'hidden', height: 10 }}>
            <div style={{
              height: '100%',
              background: 'linear-gradient(90deg, var(--brand), #818cf8)',
              borderRadius: 6,
              width: progressPct !== null ? `${progressPct}%` : '100%',
              transition: 'width 0.5s ease',
              animation: progressPct === null ? 'progressPulse 1.5s infinite' : 'none'
            }} />
          </div>

          {progressPct !== null && (
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>
              {progressPct}% complete
            </div>
          )}
        </div>
      ) : (
        /* Sync trigger panel */
        <div style={{ marginTop: 12 }}>
          {!showSyncPanel ? (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowSyncPanel(true)}
              style={{ width: '100%', justifyContent: 'center', padding: '9px 16px', border: '1px dashed var(--border)', borderRadius: 8, fontSize: '0.82rem' }}
            >
              🗄️ Sync All Historical Orders
            </button>
          ) : (
            <div style={{
              background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(99,102,241,0.03))',
              border: '1px solid rgba(99,102,241,0.25)',
              borderRadius: 10,
              padding: '16px',
              animation: 'slideUp 0.2s ease-out'
            }}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 4 }}>🗄️ Historical Order Sync</div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 14 }}>
                Pull ALL orders from Shopify from your selected date to today. This runs in the background and may take 5–30 minutes depending on order volume.
              </p>

              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                    📅 Sync From Date
                  </label>
                  <input
                    type="date"
                    className="form-input"
                    value={syncStartDate}
                    onChange={e => setSyncStartDate(e.target.value)}
                    style={{ height: 36, fontSize: '0.82rem' }}
                  />
                </div>

                {/* Quick preset buttons */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[
                    { label: '1 Year', date: new Date(Date.now() - 365*86400000).toISOString().split('T')[0] },
                    { label: '2 Years', date: new Date(Date.now() - 2*365*86400000).toISOString().split('T')[0] },
                    { label: '3 Years', date: new Date(Date.now() - 3*365*86400000).toISOString().split('T')[0] },
                    { label: 'All Time', date: '2020-01-01' },
                  ].map(p => (
                    <button
                      key={p.label}
                      onClick={() => setSyncStartDate(p.date)}
                      className="btn btn-sm"
                      style={{
                        padding: '4px 10px',
                        fontSize: '0.7rem',
                        background: syncStartDate === p.date ? 'var(--brand)' : 'var(--bg-elevated)',
                        color: syncStartDate === p.date ? 'black' : 'var(--text-muted)',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Warning note */}
              <div style={{
                marginTop: 12,
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.2)',
                borderRadius: 6,
                padding: '8px 12px',
                fontSize: '0.72rem',
                color: 'var(--orange)'
              }}>
                ⚠️ Existing orders will <strong>not</strong> be overwritten. Only missing orders will be added. Safe to run at any time.
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button
                  className="btn btn-primary"
                  onClick={handleStartSync}
                  style={{ flex: 1, justifyContent: 'center', fontWeight: 700 }}
                >
                  🚀 Start Historical Sync from {syncStartDate}
                </button>
                <button className="btn btn-secondary" onClick={() => setShowSyncPanel(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit Credentials Panel */}
      {editing && (
        <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Store Name</label>
              <input className="form-input" value={local.store_name} onChange={setL('store_name')} />
            </div>
            <div className="form-group">
              <label className="form-label">Default Sync Start Date</label>
              <input className="form-input" type="date" value={local.sync_start_date || ''} onChange={setL('sync_start_date')} />
            </div>
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
            <label className="form-label">Instaworld Track URL <span style={{color:'var(--text-muted)',fontWeight:400}}>(optional)</span></label>
            <input className="form-input font-mono" value={local.instaworld_track_url || ''} onChange={setL('instaworld_track_url')} placeholder="https://app.instaworld.pk/api/track-order" />
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => onSave(local)}>💾 Save Changes</button>
        </div>
      )}
    </div>
  )
}
