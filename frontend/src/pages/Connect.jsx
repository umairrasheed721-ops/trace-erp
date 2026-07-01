import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'

export default function Connect() {
  const { stores, setStores, addToast, setActiveStoreId } = useApp()
  const [form, setForm] = useState({
    store_name: '', shop_domain: '', client_id: '', client_secret: '',
    postex_token: '', instaworld_key: '', instaworld_key_backup: '', instaworld_key_3: '',
    google_maps_key: '',
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
        google_maps_key: store.google_maps_key || '',
        sync_start_date: store.sync_start_date || '',
        postex_track_url: store.postex_track_url || '',
        instaworld_track_url: store.instaworld_track_url || '',
        gas_proxy_url: store.gas_proxy_url || ''
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
    <div style={{ maxWidth: 820 }}>
      {/* ─── Page Header ─── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 14,
              background: 'linear-gradient(135deg, rgba(168,85,247,0.25) 0%, rgba(99,102,241,0.25) 100%)',
              border: '1px solid rgba(168,85,247,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.4rem', flexShrink: 0
            }}>🔌</div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>Connect Store</h2>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Link your Shopify store and configure courier integrations</p>
            </div>
          </div>
        </div>
        <button
          onClick={() => refreshStores()}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 10,
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
            transition: 'all 0.2s'
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.color = 'var(--brand)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
        >
          🔄 Refresh Stores
        </button>
      </div>

      {/* ─── Add New Store Form ─── */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 18,
        overflow: 'hidden',
        marginBottom: 24,
        boxShadow: '0 4px 24px rgba(0,0,0,0.15)'
      }}>
        {/* Card Header */}
        <div style={{
          padding: '18px 24px',
          background: 'linear-gradient(90deg, rgba(99,102,241,0.08) 0%, transparent 100%)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10
        }}>
          <span style={{ fontSize: '1rem' }}>🏪</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>Add New Shopify Store</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 1 }}>Enter your store credentials to generate an OAuth link</div>
          </div>
        </div>

        <form onSubmit={handleConnect} style={{ padding: 24 }}>
          {/* Section: Store Identity */}
          <SectionLabel icon="🏷️" label="Store Identity" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <FieldGroup label="Store Name (Label)" hint="A friendly name for your reference">
              <input className="form-input" placeholder="e.g. My Fashion Store" value={form.store_name} onChange={set('store_name')} />
            </FieldGroup>
            <FieldGroup label="Shop Domain *" hint="Your Shopify myshopify.com URL">
              <input className="form-input" placeholder="your-store.myshopify.com" value={form.shop_domain} onChange={set('shop_domain')} required />
            </FieldGroup>
          </div>

          {/* Section: OAuth Credentials */}
          <SectionLabel icon="🔑" label="OAuth Credentials" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <FieldGroup label="Shopify Client ID *" hint="From Shopify Partner Dashboard">
              <input className="form-input font-mono" placeholder="shpca_xxxxxxxxxxxxxxxx" value={form.client_id} onChange={set('client_id')} required />
            </FieldGroup>
            <FieldGroup label="Shopify Client Secret *" hint="Keep this confidential">
              <input className="form-input font-mono" type="password" placeholder="••••••••••••••••" value={form.client_secret} onChange={set('client_secret')} required />
            </FieldGroup>
          </div>

          {/* Section: Sync Settings */}
          <SectionLabel icon="📅" label="Sync Settings" />
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Initial Sync Start Date
              </label>
              <button
                type="button"
                onClick={() => set('sync_start_date')({ target: { value: '2010-01-01' } })}
                style={{
                  padding: '3px 10px', fontSize: '0.65rem', fontWeight: 700,
                  borderRadius: 6, border: '1px solid var(--border)',
                  background: 'var(--bg-elevated)', color: 'var(--text-muted)', cursor: 'pointer'
                }}
              >
                📅 All Time
              </button>
            </div>
            <input className="form-input" type="date" value={form.sync_start_date} onChange={set('sync_start_date')} />
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>Orders before this date will never be pulled.</div>
          </div>

          {/* Section: Courier API Keys */}
          <div style={{
            borderTop: '1px solid var(--border)',
            paddingTop: 20, marginTop: 4, marginBottom: 20
          }}>
            <SectionLabel icon="🚚" label="Courier API Keys" badge="Optional" />
            <div style={{ marginBottom: 16 }}>
              <FieldGroup label="PostEx Token" hint="PostEx API token for this store">
                <input className="form-input font-mono" placeholder="Your PostEx API token" value={form.postex_token} onChange={set('postex_token')} />
              </FieldGroup>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 12 }}>
              <FieldGroup label="Instaworld Primary Key">
                <input className="form-input font-mono" placeholder="Primary API key" value={form.instaworld_key} onChange={set('instaworld_key')} />
              </FieldGroup>
              <FieldGroup label="Instaworld Backup Key">
                <input className="form-input font-mono" placeholder="Backup / fallback key" value={form.instaworld_key_backup} onChange={set('instaworld_key_backup')} />
              </FieldGroup>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <FieldGroup label="Instaworld Key 3" badge="Optional">
                <input className="form-input font-mono" placeholder="3rd API key" value={form.instaworld_key_3} onChange={set('instaworld_key_3')} />
              </FieldGroup>
              <FieldGroup label="Google Maps API Key" badge="Optional">
                <input className="form-input font-mono" placeholder="GCP key for address verification" value={form.google_maps_key} onChange={set('google_maps_key')} />
              </FieldGroup>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '13px 24px', borderRadius: 12, border: 'none',
              background: loading ? 'var(--bg-elevated)' : 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
              color: '#fff', fontWeight: 700, fontSize: '0.95rem', cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: loading ? 'none' : '0 4px 16px rgba(99,102,241,0.35)',
              transition: 'all 0.2s'
            }}
          >
            {loading ? (
              <><span className="loading-spinner" /> Connecting...</>
            ) : (
              <>🚀 Generate Auth Link &amp; Connect</>
            )}
          </button>
        </form>
      </div>

      {/* ─── Connected Stores ─── */}
      {stores.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>CONNECTED STORES</div>
            <div style={{
              background: 'rgba(16,185,129,0.15)', color: '#34d399',
              padding: '2px 10px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700,
              border: '1px solid rgba(16,185,129,0.2)'
            }}>{stores.length} Active</div>
          </div>
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

function SectionLabel({ icon, label, badge }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span style={{ fontSize: '0.9rem' }}>{icon}</span>
      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
      {badge && (
        <span style={{
          fontSize: '0.6rem', fontWeight: 700, padding: '1px 7px', borderRadius: 20,
          background: 'rgba(156,163,175,0.12)', color: 'var(--text-muted)', border: '1px solid var(--border)'
        }}>{badge}</span>
      )}
    </div>
  )
}

function FieldGroup({ label, hint, badge, children }) {
  return (
    <div className="form-group">
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
        <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>{label}</label>
        {badge && (
          <span style={{
            fontSize: '0.58rem', fontWeight: 700, padding: '1px 6px', borderRadius: 20,
            background: 'rgba(156,163,175,0.1)', color: 'var(--text-muted)', border: '1px solid var(--border)'
          }}>{badge}</span>
        )}
      </div>
      {children}
      {hint && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 4 }}>{hint}</div>}
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
    <div style={{
      background: 'var(--bg-card)',
      border: isSyncing ? '1px solid rgba(99,102,241,0.4)' : '1px solid var(--border)',
      borderRadius: 16,
      overflow: 'hidden',
      boxShadow: isSyncing ? '0 0 24px rgba(99,102,241,0.12)' : '0 2px 12px rgba(0,0,0,0.1)',
      transition: 'all 0.3s'
    }}>

      {/* ─── Store Header ─── */}
      <div style={{
        padding: '16px 20px',
        background: isSyncing
          ? 'linear-gradient(90deg, rgba(99,102,241,0.1) 0%, transparent 100%)'
          : 'linear-gradient(90deg, rgba(255,255,255,0.02) 0%, transparent 100%)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap'
      }}>
        {/* Store Avatar */}
        <div style={{
          width: 42, height: 42, borderRadius: 12, flexShrink: 0,
          background: 'linear-gradient(135deg, rgba(168,85,247,0.2), rgba(99,102,241,0.2))',
          border: '1px solid rgba(168,85,247,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem'
        }}>🏪</div>

        {/* Store Info */}
        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
            {store.store_name || store.shop_domain}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 1 }}>{store.shop_domain}</div>
        </div>

        {/* Status Badge */}
        {isSyncing ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 20,
            background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
            color: '#818cf8', fontSize: '0.75rem', fontWeight: 700
          }}>
            <span className="loading-spinner" style={{ width: 10, height: 10 }} />
            Syncing...
          </div>
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 20,
            background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)',
            color: '#34d399', fontSize: '0.75rem', fontWeight: 700
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', display: 'inline-block' }} />
            Connected
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <ActionButton
            onClick={onEnableRealTime}
            icon="⚡"
            label="Real-Time Sync"
            variant="brand"
          />
          <ActionButton
            onClick={editing ? onCancel : onEdit}
            icon={editing ? '✕' : '✏️'}
            label={editing ? 'Cancel' : 'Edit Keys'}
            variant="secondary"
          />
          <ActionButton
            onClick={onDisconnect}
            icon="⚡"
            label="Disconnect"
            variant="danger"
          />
        </div>
      </div>

      {/* ─── Sync Progress (when syncing) ─── */}
      {isSyncing && (
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'rgba(99,102,241,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#818cf8' }}>📡 Historical Sync In Progress</div>
            {progressPct !== null && (
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6366f1' }}>{progressPct}%</div>
            )}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#60a5fa', marginBottom: 10, opacity: 0.9 }}>
            {store.sync_progress || 'Processing...'}
          </div>
          {progressPct !== null && (
            <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 100, overflow: 'hidden', height: 5 }}>
              <div style={{
                height: '100%',
                background: 'linear-gradient(90deg, #6366f1, #a855f7)',
                width: `${progressPct}%`,
                transition: 'width 0.5s ease',
                borderRadius: 100
              }} />
            </div>
          )}
        </div>
      )}

      {/* ─── Actions Panel ─── */}
      {!isSyncing && (
        <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Historical Sync */}
          {!showSyncPanel ? (
            <button
              onClick={() => setShowSyncPanel(true)}
              style={{
                width: '100%', padding: '9px 16px', borderRadius: 10,
                background: 'transparent', border: '1px dashed var(--border)',
                color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem',
                fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.color = 'var(--brand)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
            >
              🗄️ Sync All Historical Orders
            </button>
          ) : (
            <div style={{
              background: 'rgba(99,102,241,0.05)',
              border: '1px solid rgba(99,102,241,0.2)',
              borderRadius: 12, padding: 16
            }}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--brand)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                🗄️ Historical Sync Options
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>📅 Sync From Date</label>
                  <button
                    type="button"
                    onClick={() => setSyncStartDate('2010-01-01')}
                    style={{
                      padding: '2px 8px', fontSize: '0.62rem', fontWeight: 700,
                      borderRadius: 6, border: '1px solid var(--border)',
                      background: 'var(--bg-elevated)', color: 'var(--text-muted)', cursor: 'pointer'
                    }}
                  >All Time</button>
                </div>
                <input type="date" className="form-input" value={syncStartDate} onChange={e => setSyncStartDate(e.target.value)} style={{ height: 36 }} />
              </div>

              <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                  <input type="checkbox" checked={syncStatus} onChange={e => setSyncStatus(e.target.checked)} /> Status (Fast)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                  <input type="checkbox" checked={syncCosts} onChange={e => setSyncCosts(e.target.checked)} /> Costs (Slow)
                </label>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleStartSync}
                  style={{
                    flex: 1, padding: '9px 16px', borderRadius: 10, border: 'none',
                    background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                    color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
                    boxShadow: '0 3px 12px rgba(99,102,241,0.3)'
                  }}
                >🚀 Start Sync</button>
                <button
                  onClick={() => setShowSyncPanel(false)}
                  style={{
                    padding: '9px 16px', borderRadius: 10,
                    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                    color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer'
                  }}
                >Cancel</button>
              </div>
            </div>
          )}

          {/* Sniper Tool */}
          <div style={{
            background: 'rgba(245,158,11,0.05)',
            border: '1px solid rgba(245,158,11,0.15)',
            borderRadius: 10, padding: '12px 14px',
            display: 'flex', alignItems: 'center', gap: 10
          }}>
            <span style={{ fontSize: '1rem', flexShrink: 0 }}>🎯</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#f59e0b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                Sniper Tool — Sync Specific Order
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="form-input"
                  placeholder="Order # (e.g. #16374)"
                  value={singleOrderNum}
                  onChange={e => setSingleOrderNum(e.target.value)}
                  style={{ height: 32, fontSize: '0.8rem', flex: 1 }}
                />
                <button
                  onClick={() => { onSyncSingleOrder(store.id, singleOrderNum); setSingleOrderNum('') }}
                  style={{
                    padding: '0 14px', height: 32, borderRadius: 8,
                    background: 'rgba(245,158,11,0.2)', color: '#f59e0b',
                    fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer',
                    border: '1px solid rgba(245,158,11,0.3)', flexShrink: 0
                  }}
                >Sync Now</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Edit Keys Panel ─── */}
      {editing && (
        <div style={{ padding: '0 20px 20px', borderTop: '1px solid var(--border)', marginTop: -1 }}>
          <div style={{
            background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.15)',
            borderRadius: 12, padding: 20, marginTop: 16
          }}>
            <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--brand)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              ✏️ Edit Store Configuration
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <FieldGroup label="Store Name">
                <input className="form-input" value={local.store_name} onChange={setL('store_name')} />
              </FieldGroup>
              <FieldGroup label="Start Date">
                <input className="form-input" type="date" value={local.sync_start_date || ''} onChange={setL('sync_start_date')} />
              </FieldGroup>
            </div>

            <FieldGroup label="PostEx Token">
              <input className="form-input font-mono" value={local.postex_token || ''} onChange={setL('postex_token')} style={{ marginBottom: 14 }} />
            </FieldGroup>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <FieldGroup label="Instaworld Primary Key">
                <input className="form-input font-mono" placeholder="Primary API key" value={local.instaworld_key || ''} onChange={setL('instaworld_key')} />
              </FieldGroup>
              <FieldGroup label="Instaworld Backup Key">
                <input className="form-input font-mono" placeholder="Backup/fallback key" value={local.instaworld_key_backup || ''} onChange={setL('instaworld_key_backup')} />
              </FieldGroup>
            </div>

            <FieldGroup label="Google Maps API Key">
              <input className="form-input font-mono" placeholder="API Key for Geocoding / Address verification" value={local.google_maps_key || ''} onChange={setL('google_maps_key')} style={{ marginBottom: 14 }} />
            </FieldGroup>

            <FieldGroup label="Instaworld Proxy (Google Apps Script URL)">
              <input className="form-input font-mono" placeholder="Optional — or set INSTAWORLD_PROXY_URL on server" value={local.gas_proxy_url || ''} onChange={setL('gas_proxy_url')} />
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 4 }}>
                Use when Instaworld blocks your hosting IP (e.g. Railway). Per-store overrides server env.
              </div>
            </FieldGroup>

            <button
              onClick={() => onSave(local)}
              style={{
                marginTop: 16, padding: '9px 20px', borderRadius: 10, border: 'none',
                background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
                boxShadow: '0 3px 12px rgba(99,102,241,0.3)'
              }}
            >💾 Save Changes</button>
          </div>
        </div>
      )}
    </div>
  )
}

function ActionButton({ onClick, icon, label, variant }) {
  const styles = {
    brand: {
      background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(168,85,247,0.2))',
      border: '1px solid rgba(99,102,241,0.3)',
      color: '#818cf8'
    },
    secondary: {
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      color: 'var(--text-secondary)'
    },
    danger: {
      background: 'rgba(239,68,68,0.08)',
      border: '1px solid rgba(239,68,68,0.25)',
      color: '#f87171'
    }
  }
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 13px', borderRadius: 8, cursor: 'pointer',
        fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5,
        transition: 'all 0.15s', ...styles[variant]
      }}
    >
      {variant !== 'danger' && <span>{icon}</span>}
      {label}
    </button>
  )
}
