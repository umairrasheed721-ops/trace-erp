import { useState, useEffect, useMemo } from 'react'

const FROZEN_DOMAIN = '1i7tnb-bb.myshopify.com'

export default function StoreDetailWorkspace({
  store,
  isActiveWorkspace,
  onSetActiveWorkspace,
  onRefreshFleet,
  onDisconnect,
  onOpenGuide,
  addToast,
}) {
  const [tab, setTab] = useState('overview') // overview | couriers | webhooks | sync | integrations
  const [stats, setStats] = useState(null)
  const [health, setHealth] = useState(null)
  const [healthLoading, setHealthLoading] = useState(false)

  // Editable credentials & settings state
  const [form, setForm] = useState({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reveal, setReveal] = useState({})
  const [testResults, setTestResults] = useState({})
  const [testingCourier, setTestingCourier] = useState('')

  // Webhooks & Re-auth
  const [registeringWh, setRegisteringWh] = useState(false)
  const [deletingWhId, setDeletingWhId] = useState(null)
  const [showReauthCreds, setShowReauthCreds] = useState(false)
  const [reauthForm, setReauthForm] = useState({ client_id: '', client_secret: '' })
  const [directTokenInput, setDirectTokenInput] = useState('')
  const [updatingToken, setUpdatingToken] = useState(false)

  // Sync & Sniper
  const [syncStartDate, setSyncStartDate] = useState('2024-01-01')
  const [syncStatusOpt, setSyncStatusOpt] = useState(true)
  const [syncCostsOpt, setSyncCostsOpt] = useState(false)
  const [quickSyncBusy, setQuickSyncBusy] = useState('')
  const [sniperInput, setSniperInput] = useState('')
  const [sniperRunning, setSniperRunning] = useState(false)
  const [sniperLogs, setSniperLogs] = useState([])

  const isFrozen = (store.shop_domain || '').toLowerCase().includes(FROZEN_DOMAIN)
  const isSyncing = store.sync_status === 'syncing'
  const progressPct = store.sync_total > 0
    ? Math.min(Math.round((store.sync_processed / store.sync_total) * 100), 99)
    : null

  // Sync local form whenever selected store changes
  useEffect(() => {
    setForm({
      store_name: store.store_name || '',
      sync_start_date: store.sync_start_date || '',
      postex_token: store.postex_token || '',
      instaworld_key: store.instaworld_key || '',
      instaworld_key_backup: store.instaworld_key_backup || '',
      instaworld_key_3: store.instaworld_key_3 || '',
      leopards_token: store.leopards_token || '',
      tcs_token: store.tcs_token || '',
      google_maps_key: store.google_maps_key || '',
      postex_track_url: store.postex_track_url || '',
      instaworld_track_url: store.instaworld_track_url || '',
      gas_proxy_url: store.gas_proxy_url || '',
    })
    setReauthForm({ client_id: store.shopify_client_id || '', client_secret: '' })
    setSyncStartDate(store.sync_start_date || '2024-01-01')
    setDirty(false)
    setTestResults({})
    setShowReauthCreds(false)
    setDirectTokenInput('')
    setSniperLogs([])
  }, [store.id, store.store_name, store.postex_token, store.instaworld_key, store.leopards_token, store.tcs_token])

  // Fetch lightweight stats + live health when switching selected store
  useEffect(() => {
    let cancelled = false
    setStats(null)
    setHealth(null)

    fetch(`/api/stores/${store.id}/stats`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d) setStats(d) })
      .catch(() => {})

    runHealthAudit(true, () => cancelled)
    return () => { cancelled = true }
  }, [store.id])

  const runHealthAudit = async (silent = false, isCancelled = () => false) => {
    setHealthLoading(true)
    try {
      const res = await fetch(`/api/stores/${store.id}/health`)
      const data = await res.json()
      if (!isCancelled() && res.ok && data.success) {
        setHealth(data)
        if (!silent) addToast('✅ Live health audit complete!', 'success', 2500)
      } else if (!silent) {
        addToast(data.error || 'Health check failed', 'error')
      }
    } catch {
      if (!silent) addToast('Network error during health check', 'error')
    }
    if (!isCancelled()) setHealthLoading(false)
  }

  const updateField = (key) => (e) => {
    setForm(prev => ({ ...prev, [key]: e.target.value }))
    setDirty(true)
  }

  const copyValue = (val, label = 'Value') => {
    if (!val) return
    navigator.clipboard?.writeText(val)
    addToast(`📋 ${label} copied`, 'success', 1800)
  }

  const handleSaveSettings = async (extra = {}) => {
    setSaving(true)
    try {
      const payload = { ...form, ...extra }
      const res = await fetch(`/api/stores/${store.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (res.ok) {
        addToast('✅ Store configuration saved!', 'success')
        setDirty(false)
        await onRefreshFleet(true)
      } else {
        const d = await res.json().catch(() => ({}))
        addToast(d.error || 'Failed to save changes', 'error')
      }
    } catch {
      addToast('Network error while saving', 'error')
    }
    setSaving(false)
  }

  const handleTestCourier = async (courier) => {
    setTestingCourier(courier)
    try {
      const payload = courier === 'postex'
        ? { courier: 'postex', token: form.postex_token }
        : { courier: 'instaworld', token: form.instaworld_key, proxy_url: form.gas_proxy_url }
      const res = await fetch(`/api/stores/${store.id}/test-courier`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      setTestResults(prev => ({ ...prev, [courier]: data }))
      addToast(data.success ? `✅ ${data.message}` : `❌ ${data.message || data.error}`, data.success ? 'success' : 'error')
    } catch {
      addToast('Network error testing courier', 'error')
    }
    setTestingCourier('')
  }

  const handleRegisterWebhooks = async () => {
    setRegisteringWh(true)
    try {
      const res = await fetch(`/api/stores/${store.id}/register-webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appUrl: window.location.origin })
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        addToast(`✅ All 10 real-time webhooks verified/registered for ${store.store_name || store.shop_domain}!`, 'success')
        await runHealthAudit(true)
      } else {
        addToast(`❌ ${data.error || 'Failed to register webhooks'}`, 'error')
      }
    } catch {
      addToast('Network error', 'error')
    }
    setRegisteringWh(false)
  }

  const handleDeleteWebhook = async (whId, topic) => {
    if (!confirm(`Remove webhook "${topic}" from Shopify?`)) return
    setDeletingWhId(whId)
    try {
      const res = await fetch(`/api/stores/${store.id}/webhooks/${whId}`, { method: 'DELETE' })
      if (res.ok) {
        addToast(`🗑️ Removed webhook: ${topic}`, 'success')
        await runHealthAudit(true)
      } else {
        const d = await res.json().catch(() => ({}))
        addToast(d.error || 'Failed to remove webhook', 'error')
      }
    } catch {
      addToast('Network error', 'error')
    }
    setDeletingWhId(null)
  }

  const handleReauth = async () => {
    try {
      const res = await fetch(`/api/stores/${store.id}/reauth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(showReauthCreds ? reauthForm : {})
      })
      const data = await res.json()
      if (res.ok && data.auth_url) {
        window.open(data.auth_url, '_blank', 'width=760,height=660')
        addToast('🔗 Shopify OAuth opened! Approve updated scopes, then click Re-Scan Health.', 'info', 8000)
      } else if (data.needs_credentials) {
        setShowReauthCreds(true)
        addToast('Enter Client ID & Client Secret below to generate OAuth re-auth link', 'info')
      } else {
        addToast(data.error || 'Failed to start re-authorization', 'error')
      }
    } catch {
      addToast('Network error', 'error')
    }
  }

  const handleReplaceDirectToken = async () => {
    if (!directTokenInput.trim()) return
    setUpdatingToken(true)
    try {
      const res = await fetch('/api/stores/direct-connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop_domain: store.shop_domain, access_token: directTokenInput.trim() })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        addToast('✅ Admin API token updated & verified live!', 'success')
        setDirectTokenInput('')
        await onRefreshFleet(true)
        await runHealthAudit(true)
      } else {
        addToast(data.error || 'Token verification failed', 'error')
      }
    } catch {
      addToast('Network error', 'error')
    }
    setUpdatingToken(false)
  }

  const handleQuickSync = async (kind) => {
    setQuickSyncBusy(kind)
    try {
      if (kind === 'products') {
        const res = await fetch('/api/cost-manager/sync-shopify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ store_id: store.id })
        })
        const data = await res.json().catch(() => ({}))
        addToast(res.ok ? `📦 ${data.message || 'Product & inventory sync started!'}` : `❌ ${data.error || 'Sync failed'}`, res.ok ? 'success' : 'error')
      } else {
        const res = await fetch('/api/sync/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            store_id: store.id,
            type: kind === 'shopify' ? 'Shopify Sync' : 'Courier Sync',
          })
        })
        const data = await res.json().catch(() => ({}))
        addToast(res.ok ? (data.message || 'Sync started!') : `❌ ${data.error || 'Sync failed'}`, res.ok ? 'success' : 'error')
      }
      await onRefreshFleet(true)
    } catch {
      addToast('Network error triggering sync', 'error')
    }
    setQuickSyncBusy('')
  }

  const handleStartDeepSync = async () => {
    if (!syncStartDate) return addToast('Please choose a Start Date', 'error')
    if (!confirm(`Pull historical orders for "${store.store_name || store.shop_domain}" from ${syncStartDate}?`)) return
    try {
      const res = await fetch(`/api/stores/${store.id}/deep-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: syncStartDate, syncStatus: syncStatusOpt, syncCosts: syncCostsOpt })
      })
      if (res.ok) {
        addToast('🗄️ Historical deep sync started in background!', 'success')
        await onRefreshFleet(true)
      } else {
        addToast('❌ Failed to start historical sync', 'error')
      }
    } catch {
      addToast('Network error', 'error')
    }
  }

  const handleAbortSync = async () => {
    try {
      const res = await fetch(`/api/stores/${store.id}/abort-sync`, { method: 'POST' })
      if (res.ok) {
        addToast('🛑 Sync aborted and reset to idle', 'info')
        await onRefreshFleet(true)
      }
    } catch {
      addToast('Failed to abort sync', 'error')
    }
  }

  const handleSniperRun = async () => {
    const tokens = sniperInput.split(/[\s,]+/).map(s => s.trim()).filter(Boolean)
    if (tokens.length === 0) return
    setSniperRunning(true)
    const results = []
    for (const orderName of tokens) {
      try {
        const res = await fetch(`/api/stores/${store.id}/sync-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderName })
        })
        const data = await res.json()
        results.push({ orderName, ok: res.ok, message: data.message || data.error || 'Done' })
      } catch (e) {
        results.push({ orderName, ok: false, message: e.message || 'Network error' })
      }
    }
    setSniperLogs(prev => [...results, ...prev].slice(0, 15))
    const okCount = results.filter(r => r.ok).length
    addToast(`🎯 Sniper complete: ${okCount}/${results.length} synced`, okCount === results.length ? 'success' : 'info')
    setSniperInput('')
    setSniperRunning(false)
  }

  const readinessItems = useMemo(() => [
    { label: 'PostEx', ok: !!store.postex_token, targetTab: 'couriers' },
    { label: 'Instaworld', ok: !!(store.instaworld_key || store.instaworld_key_backup || store.instaworld_key_3), targetTab: 'couriers' },
    { label: 'Leopards', ok: !!store.leopards_token, targetTab: 'couriers' },
    { label: 'TCS', ok: !!store.tcs_token, targetTab: 'couriers' },
    { label: 'Google Maps', ok: !!store.google_maps_key, targetTab: 'couriers' },
    { label: 'Shopify Webhooks', ok: !!(health?.webhooks?.ok && health.webhooks.missing_topics.length === 0), targetTab: 'webhooks' },
  ], [store, health])

  const TABS = [
    { id: 'overview', label: '📊 Overview & Health' },
    { id: 'couriers', label: '🚚 Couriers & Keys', badge: dirty ? '●' : null },
    { id: 'webhooks', label: '⚡ Webhooks & OAuth', badge: health?.webhooks?.has_inventory_conflict ? '!' : (health?.webhooks ? `${health.webhooks.active_expected}/${health.webhooks.total_expected}` : null) },
    { id: 'sync', label: '🔄 Sync & Sniper', badge: isSyncing ? 'Live' : null },
    { id: 'settings', label: '⚙️ Store Settings' },
  ]

  const applySyncDatePreset = (days) => {
    if (days === 'all') return setSyncStartDate('2010-01-01')
    const d = new Date()
    d.setDate(d.getDate() - days)
    setSyncStartDate(d.toISOString().slice(0, 10))
  }

  const postexWhUrl = `${window.location.origin}/api/webhooks/postex`
  const instaWhUrl = `${window.location.origin}/api/webhooks/instaworld`

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 16,
      overflow: 'hidden',
      boxShadow: '0 2px 14px rgba(15,23,42,0.05)',
      display: 'flex',
      flexDirection: 'column',
      minWidth: 0
    }}>
      {/* ─── Store Header Banner ─── */}
      <div style={{
        padding: '18px 22px',
        borderBottom: '1px solid var(--border)',
        background: isFrozen
          ? 'linear-gradient(90deg, rgba(59,130,246,0.08) 0%, transparent 100%)'
          : 'linear-gradient(90deg, rgba(99,102,241,0.07) 0%, rgba(168,85,247,0.03) 50%, transparent 100%)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <div style={{
            width: 46, height: 46, borderRadius: 13, flexShrink: 0,
            background: isFrozen ? 'linear-gradient(135deg, #64748b, #475569)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff', fontWeight: 900, fontSize: '1.15rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(99,102,241,0.22)'
          }}>
            {(store.store_name || store.shop_domain || 'S').slice(0, 2).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {store.store_name || store.shop_domain}
              </h3>
              <span style={{ fontSize: '0.68rem', fontFamily: 'monospace', padding: '2px 7px', borderRadius: 6, background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                ID #{store.id}
              </span>
              {store.is_connected ? (
                <span style={{
                  fontSize: '0.68rem', fontWeight: 700, padding: '2px 9px', borderRadius: 20,
                  background: health?.shopify?.connected === false ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)',
                  color: health?.shopify?.connected === false ? '#dc2626' : '#059669',
                  border: `1px solid ${health?.shopify?.connected === false ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.28)'}`
                }}>
                  {health?.shopify?.connected === false ? '● Token Error' : '● Connected'}
                </span>
              ) : (
                <span style={{
                  fontSize: '0.68rem', fontWeight: 700, padding: '2px 9px', borderRadius: 20,
                  background: 'rgba(245,158,11,0.12)', color: '#d97706', border: '1px solid rgba(245,158,11,0.3)'
                }}>⏳ Pending OAuth</span>
              )}
              {isFrozen && (
                <span style={{
                  fontSize: '0.68rem', fontWeight: 800, padding: '2px 9px', borderRadius: 20,
                  background: 'rgba(59,130,246,0.12)', color: '#2563eb', border: '1px solid rgba(59,130,246,0.3)'
                }}>❄️ FROZEN (Theme Sync Excluded)</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              <span className="font-mono">{store.shop_domain}</span>
              {health?.shopify?.primary_domain && health.shopify.primary_domain !== store.shop_domain && (
                <>
                  <span>·</span>
                  <a href={`https://${health.shopify.primary_domain}`} target="_blank" rel="noreferrer" style={{ color: '#4f46e5', textDecoration: 'none', fontWeight: 600 }}>
                    🌐 {health.shopify.primary_domain} ↗
                  </a>
                </>
              )}
              {health?.shopify?.plan && <><span>·</span><span>{health.shopify.plan}</span></>}
            </div>
          </div>
        </div>

        {/* Header Quick Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {Boolean(store.is_connected) && !isActiveWorkspace && (
            <button
              type="button"
              onClick={onSetActiveWorkspace}
              style={{
                padding: '7px 12px', borderRadius: 9, cursor: 'pointer',
                background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.32)',
                color: '#4f46e5', fontSize: '0.76rem', fontWeight: 700
              }}
            >🎯 Switch Active Store</button>
          )}
          {isActiveWorkspace && (
            <span style={{
              padding: '6px 11px', borderRadius: 9, fontSize: '0.74rem', fontWeight: 700,
              background: 'rgba(16,185,129,0.1)', color: '#059669', border: '1px solid rgba(16,185,129,0.28)'
            }}>✓ Active Workspace</span>
          )}
          <a
            href={`https://${store.shop_domain}/admin`}
            target="_blank"
            rel="noreferrer"
            style={ghostLinkBtnStyle}
          >Shopify Admin ↗</a>
          <a
            href={`https://${store.shop_domain}/admin/themes`}
            target="_blank"
            rel="noreferrer"
            style={ghostLinkBtnStyle}
          >Themes ↗</a>
          <button
            type="button"
            disabled={healthLoading}
            onClick={() => runHealthAudit(false)}
            style={{
              padding: '7px 13px', borderRadius: 9, cursor: healthLoading ? 'wait' : 'pointer',
              background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)',
              color: 'var(--text-primary)', fontSize: '0.76rem', fontWeight: 700
            }}
          >
            {healthLoading ? '⏳ Checking...' : '🩺 Live Health Audit'}
          </button>
        </div>
      </div>

      {/* ─── Live Sync Banner (if syncing) ─── */}
      {isSyncing && (
        <div style={{
          padding: '12px 22px', borderBottom: '1px solid var(--border)',
          background: 'rgba(99,102,241,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap'
        }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 700, color: '#4f46e5', marginBottom: 4 }}>
              <span>📡 Historical Sync Running — {store.sync_progress || 'Fetching orders...'}</span>
              {progressPct !== null && <span>{progressPct}% ({store.sync_processed}/{store.sync_total})</span>}
            </div>
            <div style={{ height: 6, borderRadius: 99, background: 'rgba(99,102,241,0.15)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${progressPct ?? 35}%`,
                background: 'linear-gradient(90deg, #6366f1, #8b5cf6)', transition: 'width 0.4s ease'
              }} />
            </div>
          </div>
          <button
            type="button"
            onClick={handleAbortSync}
            style={{
              padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              color: '#dc2626', fontSize: '0.74rem', fontWeight: 700
            }}
          >🛑 Abort Sync</button>
        </div>
      )}

      {/* ─── Sub-Tab Navigation ─── */}
      <div style={{
        display: 'flex', gap: 4, padding: '10px 18px 0', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-elevated)', overflowX: 'auto'
      }}>
        {TABS.map(t => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                padding: '9px 14px', border: 'none', borderBottom: active ? '2px solid #6366f1' : '2px solid transparent',
                background: active ? 'var(--bg-surface)' : 'transparent',
                borderRadius: '10px 10px 0 0', cursor: 'pointer',
                color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: active ? 800 : 600, fontSize: '0.8rem',
                display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
                marginBottom: -1
              }}
            >
              <span>{t.label}</span>
              {t.badge && (
                <span style={{
                  fontSize: '0.64rem', fontWeight: 800, padding: '1px 6px', borderRadius: 99,
                  background: t.badge === '!' ? 'rgba(239,68,68,0.16)' : (t.badge === '●' ? 'rgba(245,158,11,0.18)' : 'rgba(99,102,241,0.12)'),
                  color: t.badge === '!' ? '#dc2626' : (t.badge === '●' ? '#d97706' : '#4f46e5')
                }}>{t.badge}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* ─── Tab Body ─── */}
      <div style={{ padding: 22 }}>

        {/* ═══ TAB 1: OVERVIEW & HEALTH ═══ */}
        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Pending OAuth Action Banner */}
            {!store.is_connected && (
              <div style={{
                padding: 16, borderRadius: 12,
                background: 'rgba(245,158,11,0.09)', border: '1px solid rgba(245,158,11,0.35)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap'
              }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#b45309' }}>⏳ OAuth Authorization Incomplete</div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                    This store was saved as PENDING. Resume Shopify OAuth or paste a Direct `shpat_` token to activate it.
                  </div>
                </div>
                <button type="button" onClick={handleReauth} style={primaryBtnStyle}>🔑 Resume OAuth Now</button>
              </div>
            )}

            {/* ERP Boss Conflict Alert */}
            {health?.webhooks?.has_inventory_conflict && (
              <div style={{
                padding: 14, borderRadius: 12,
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.32)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap'
              }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.84rem', color: '#dc2626' }}>
                    🚨 ERP Inventory Boss Conflict Detected (`inventory_levels/update` active)
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                    Shopify stock changes can overwrite ERP inventory if this webhook stays active. Remove it in 1 click.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteWebhook(health.webhooks.inventory_conflict_ids[0], 'inventory_levels/update')}
                  style={{ ...dangerBtnStyle, padding: '7px 13px' }}
                >🗑️ Remove Conflict Webhook</button>
              </div>
            )}

            {/* Store Order KPIs */}
            <div>
              <div style={sectionTitleStyle}>Store Live Performance</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
                <KpiTile label="Total Orders" value={stats ? Number(stats.total_orders).toLocaleString() : (store.orders_count || 0).toLocaleString()} accent="#4f46e5" />
                <KpiTile label="Delivered" value={stats ? Number(stats.delivered).toLocaleString() : '—'} sub={stats ? `${stats.delivery_rate}% DEL` : null} accent="#059669" />
                <KpiTile label="Returned / RTO" value={stats ? Number(stats.returned).toLocaleString() : '—'} sub={stats ? `${stats.rto_rate}% RTO` : null} accent="#dc2626" />
                <KpiTile label="In Transit" value={stats ? Number(stats.pending).toLocaleString() : '—'} accent="#2563eb" />
                <KpiTile label="Unbooked" value={stats ? Number(stats.unbooked).toLocaleString() : '—'} accent="#d97706" />
                <KpiTile label="Stuck >72h" value={stats ? Number(stats.stuck).toLocaleString() : '—'} accent={stats?.stuck > 0 ? '#dc2626' : '#64748b'} />
              </div>
            </div>

            {/* 4 Live Shopify Diagnostic Cards */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ ...sectionTitleStyle, marginBottom: 0 }}>Live API &amp; System Diagnostics</div>
                {health?.checked_at && (
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    Checked {new Date(health.checked_at).toLocaleTimeString()}
                  </span>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
                {/* Card 1: Shopify API */}
                <DiagCard
                  icon="🛍️"
                  title="Shopify Admin API"
                  status={healthLoading ? 'loading' : (health?.shopify?.connected ? 'ok' : 'error')}
                  badge={health?.shopify?.latency_ms ? `${health.shopify.latency_ms}ms` : null}
                >
                  {health?.shopify?.connected ? (
                    <>
                      <div>Shop: <strong>{health.shopify.shop_name}</strong></div>
                      <div>Currency: <strong>{health.shopify.currency}</strong> · {health.shopify.timezone}</div>
                    </>
                  ) : (
                    <div style={{ color: '#dc2626' }}>{health?.shopify?.error || 'Click Live Health Audit to verify token'}</div>
                  )}
                </DiagCard>

                {/* Card 2: OAuth Scopes */}
                <DiagCard
                  icon="🔐"
                  title="OAuth Access Scopes"
                  status={healthLoading ? 'loading' : (health?.scopes?.ok ? (health.scopes.missing.length === 0 ? 'ok' : 'warn') : 'error')}
                  badge={health?.scopes?.ok ? `${health.scopes.total_required - health.scopes.missing.length}/${health.scopes.total_required}` : null}
                >
                  {health?.scopes?.ok ? (
                    health.scopes.missing.length === 0 ? (
                      <div style={{ color: '#059669', fontWeight: 600 }}>All 17 required scopes granted (incl. Theme Sync) ✓</div>
                    ) : (
                      <div>
                        <div style={{ color: '#b45309', fontWeight: 700, marginBottom: 4 }}>
                          Missing {health.scopes.missing.length} scope(s):
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                          {health.scopes.missing.slice(0, 6).map(sc => (
                            <code key={sc} style={{ fontSize: '0.64rem', padding: '1px 5px', borderRadius: 4, background: 'rgba(245,158,11,0.14)', color: '#b45309' }}>{sc}</code>
                          ))}
                        </div>
                        <button type="button" onClick={() => setTab('webhooks')} style={miniLinkBtnStyle}>🔑 Upgrade Scopes →</button>
                      </div>
                    )
                  ) : (
                    <div>Unable to verify scopes</div>
                  )}
                </DiagCard>

                {/* Card 3: Webhooks */}
                <DiagCard
                  icon="⚡"
                  title="Real-Time Webhooks"
                  status={healthLoading ? 'loading' : (!health?.webhooks?.ok ? 'error' : (health.webhooks.has_inventory_conflict || health.webhooks.missing_topics.length > 0 ? 'warn' : 'ok'))}
                  badge={health?.webhooks?.ok ? `${health.webhooks.active_expected}/${health.webhooks.total_expected}` : null}
                >
                  {health?.webhooks?.ok ? (
                    <>
                      <div>
                        {health.webhooks.missing_topics.length === 0
                          ? <span style={{ color: '#059669', fontWeight: 600 }}>All 10 order/product webhooks active ✓</span>
                          : <span style={{ color: '#b45309', fontWeight: 600 }}>{health.webhooks.missing_topics.length} webhook(s) missing</span>}
                      </div>
                      <div style={{ marginTop: 4 }}>
                        ERP Inventory Boss: <strong>{health.webhooks.has_inventory_conflict ? '⚠️ Conflict' : '🛡️ Protected'}</strong>
                      </div>
                      {health.webhooks.missing_topics.length > 0 && (
                        <button type="button" onClick={handleRegisterWebhooks} disabled={registeringWh} style={{ ...miniLinkBtnStyle, marginTop: 6 }}>
                          {registeringWh ? 'Registering...' : '⚡ Auto-Register Missing →'}
                        </button>
                      )}
                    </>
                  ) : <div>Click Live Health Audit to inspect webhooks</div>}
                </DiagCard>

                {/* Card 4: Theme & Antigravity Sync */}
                <DiagCard
                  icon="🎨"
                  title="Published Theme"
                  status={healthLoading ? 'loading' : (isFrozen ? 'warn' : (health?.theme?.main_theme_name ? 'ok' : 'warn'))}
                  badge={health?.theme?.theme_count ? `${health.theme.theme_count} themes` : null}
                >
                  {health?.theme?.main_theme_name ? (
                    <>
                      <div>Live: <strong>{health.theme.main_theme_name}</strong></div>
                      <div className="font-mono" style={{ fontSize: '0.68rem' }}>Theme ID: {health.theme.main_theme_id}</div>
                      <button type="button" onClick={onOpenGuide} style={{ ...miniLinkBtnStyle, marginTop: 5 }}>🎨 Theme Sync Playbook →</button>
                    </>
                  ) : health?.theme?.scope_missing ? (
                    <div>
                      <span style={{ color: '#b45309' }}>Needs `read_themes` scope</span>
                      <div><button type="button" onClick={() => setTab('webhooks')} style={{ ...miniLinkBtnStyle, marginTop: 4 }}>🔑 Re-Authorize →</button></div>
                    </div>
                  ) : <div>No theme data returned</div>}
                </DiagCard>
              </div>
            </div>

            {/* Integrations Readiness Strip */}
            <div style={{
              padding: 16, borderRadius: 12,
              background: 'var(--bg-elevated)', border: '1px solid var(--border)'
            }}>
              <div style={{ ...sectionTitleStyle, marginBottom: 10 }}>Integrations Readiness Checklist</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {readinessItems.map(item => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => setTab(item.targetTab)}
                    style={{
                      padding: '6px 12px', borderRadius: 99, cursor: 'pointer',
                      fontSize: '0.75rem', fontWeight: 700,
                      border: `1px solid ${item.ok ? 'rgba(16,185,129,0.35)' : 'var(--border)'}`,
                      background: item.ok ? 'rgba(16,185,129,0.1)' : 'var(--bg-surface)',
                      color: item.ok ? '#059669' : 'var(--text-muted)',
                      display: 'flex', alignItems: 'center', gap: 6
                    }}
                  >
                    <span>{item.ok ? '✓' : '+'}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ TAB 2: COURIERS & API KEYS ═══ */}
        {tab === 'couriers' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* PostEx */}
            <ConfigCard
              icon="🟠"
              title="PostEx Courier API"
              subtitle="Booking, tracking history, watchdog audit & payout reconciliation"
              rightAction={
                <button
                  type="button"
                  disabled={testingCourier === 'postex' || !form.postex_token}
                  onClick={() => handleTestCourier('postex')}
                  style={testBtnStyle}
                >
                  {testingCourier === 'postex' ? 'Testing...' : '⚡ Test PostEx API'}
                </button>
              }
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 14 }}>
                <SecretInput
                  label="PostEx API Token"
                  value={form.postex_token || ''}
                  onChange={updateField('postex_token')}
                  revealed={!!reveal.postex}
                  onToggle={() => setReveal(r => ({ ...r, postex: !r.postex }))}
                  onCopy={() => copyValue(form.postex_token, 'PostEx Token')}
                  placeholder="Enter PostEx merchant API token"
                />
                <div>
                  <label style={labelStyle}>Custom Tracking Base URL (Optional)</label>
                  <input
                    className="form-input font-mono"
                    value={form.postex_track_url || ''}
                    onChange={updateField('postex_track_url')}
                    placeholder="https://api.postex.pk/..."
                  />
                </div>
              </div>
              {testResults.postex && <TestResultBanner result={testResults.postex} />}
            </ConfigCard>

            {/* Instaworld */}
            <ConfigCard
              icon="🔵"
              title="Instaworld Multi-Key Rotation (Trax · TCS · LCS · M&P)"
              subtitle="Up to 3 rotating keys + Google Apps Script proxy for Railway IP bypass"
              rightAction={
                <button
                  type="button"
                  disabled={testingCourier === 'instaworld' || !form.instaworld_key}
                  onClick={() => handleTestCourier('instaworld')}
                  style={testBtnStyle}
                >
                  {testingCourier === 'instaworld' ? 'Testing...' : '⚡ Test Instaworld'}
                </button>
              }
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, marginBottom: 12 }}>
                <SecretInput
                  label="Primary API Key"
                  value={form.instaworld_key || ''}
                  onChange={updateField('instaworld_key')}
                  revealed={!!reveal.iw1}
                  onToggle={() => setReveal(r => ({ ...r, iw1: !r.iw1 }))}
                  onCopy={() => copyValue(form.instaworld_key, 'Instaworld Primary Key')}
                  placeholder="Primary key"
                />
                <SecretInput
                  label="Backup Key (Auto-Fallback)"
                  value={form.instaworld_key_backup || ''}
                  onChange={updateField('instaworld_key_backup')}
                  revealed={!!reveal.iw2}
                  onToggle={() => setReveal(r => ({ ...r, iw2: !r.iw2 }))}
                  onCopy={() => copyValue(form.instaworld_key_backup, 'Instaworld Backup Key')}
                  placeholder="Backup key"
                />
                <SecretInput
                  label="3rd Rotation Key"
                  value={form.instaworld_key_3 || ''}
                  onChange={updateField('instaworld_key_3')}
                  revealed={!!reveal.iw3}
                  onToggle={() => setReveal(r => ({ ...r, iw3: !r.iw3 }))}
                  onCopy={() => copyValue(form.instaworld_key_3, 'Instaworld Key 3')}
                  placeholder="Optional 3rd key"
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Google Apps Script Proxy URL (IP Bypass)</label>
                  <input
                    className="form-input font-mono"
                    value={form.gas_proxy_url || ''}
                    onChange={updateField('gas_proxy_url')}
                    placeholder="https://script.google.com/macros/s/.../exec"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Instaworld Tracking URL Override (Optional)</label>
                  <input
                    className="form-input font-mono"
                    value={form.instaworld_track_url || ''}
                    onChange={updateField('instaworld_track_url')}
                    placeholder="Optional custom tracking endpoint"
                  />
                </div>
              </div>
              {testResults.instaworld && <TestResultBanner result={testResults.instaworld} />}
            </ConfigCard>

            {/* Direct Couriers + Maps */}
            <ConfigCard
              icon="🐆"
              title="Direct Courier Tokens &amp; Address Verification"
              subtitle="Leopards, TCS Finance/Tracking keys & Google Maps Geocoding API"
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
                <SecretInput
                  label="Leopards (LCS) API Token"
                  value={form.leopards_token || ''}
                  onChange={updateField('leopards_token')}
                  revealed={!!reveal.lcs}
                  onToggle={() => setReveal(r => ({ ...r, lcs: !r.lcs }))}
                  onCopy={() => copyValue(form.leopards_token, 'Leopards Token')}
                  placeholder="Leopards API key / token"
                />
                <SecretInput
                  label="TCS API Token"
                  value={form.tcs_token || ''}
                  onChange={updateField('tcs_token')}
                  revealed={!!reveal.tcs}
                  onToggle={() => setReveal(r => ({ ...r, tcs: !r.tcs }))}
                  onCopy={() => copyValue(form.tcs_token, 'TCS Token')}
                  placeholder="TCS API bearer / token"
                />
                <SecretInput
                  label="Google Maps Geocoding Key"
                  value={form.google_maps_key || ''}
                  onChange={updateField('google_maps_key')}
                  revealed={!!reveal.gmaps}
                  onToggle={() => setReveal(r => ({ ...r, gmaps: !r.gmaps }))}
                  onCopy={() => copyValue(form.google_maps_key, 'Google Maps Key')}
                  placeholder="AIzaSy..."
                />
              </div>
            </ConfigCard>

            {/* Save Bar */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
              padding: '12px 16px', borderRadius: 12,
              background: dirty ? 'rgba(99,102,241,0.08)' : 'var(--bg-elevated)',
              border: `1px solid ${dirty ? 'rgba(99,102,241,0.35)' : 'var(--border)'}`
            }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: dirty ? '#4f46e5' : 'var(--text-muted)' }}>
                {dirty ? '● You have unsaved credential changes' : 'All courier keys are up to date'}
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSaveSettings()}
                style={primaryBtnStyle}
              >
                {saving ? 'Saving...' : '💾 Save All Courier Keys'}
              </button>
            </div>
          </div>
        )}

        {/* ═══ TAB 3: WEBHOOKS & OAUTH ═══ */}
        {tab === 'webhooks' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Shopify Live Webhooks Inspector */}
            <ConfigCard
              icon="⚡"
              title="Shopify Real-Time Webhooks Inspector"
              subtitle="10 core Order, Fulfillment & Product webhooks (inventory_levels/update stays OFF for ERP Boss mode)"
              rightAction={
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => runHealthAudit(false)} disabled={healthLoading} style={secondaryBtnStyle}>
                    🔄 Re-Scan
                  </button>
                  <button type="button" onClick={handleRegisterWebhooks} disabled={registeringWh} style={primaryBtnStyle}>
                    {registeringWh ? 'Registering...' : '⚡ Register / Repair All 10'}
                  </button>
                </div>
              }
            >
              {health?.webhooks?.missing_topics?.length > 0 && (
                <div style={{
                  padding: '10px 12px', borderRadius: 9, marginBottom: 12,
                  background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
                  fontSize: '0.75rem', color: '#b45309'
                }}>
                  <strong>Missing Topics ({health.webhooks.missing_topics.length}):</strong>{' '}
                  {health.webhooks.missing_topics.join(', ')}
                </div>
              )}

              {health?.webhooks?.items?.length > 0 ? (
                <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-elevated)', textAlign: 'left', color: 'var(--text-muted)' }}>
                        <th style={thStyle}>Topic</th>
                        <th style={thStyle}>Target Endpoint URL</th>
                        <th style={thStyle}>Status</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {health.webhooks.items.map(wh => {
                        const isConflict = wh.topic === 'inventory_levels/update'
                        const isLocal = (wh.address || '').includes('localhost')
                        return (
                          <tr key={wh.id} style={{ borderTop: '1px solid var(--border)' }}>
                            <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 700, color: isConflict ? '#dc2626' : 'var(--text-primary)' }}>
                              {wh.topic}
                            </td>
                            <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '0.7rem', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                              {wh.address}
                            </td>
                            <td style={tdStyle}>
                              {isConflict ? (
                                <span style={{ ...pillStyle, background: 'rgba(239,68,68,0.14)', color: '#dc2626' }}>⚠️ Conflicts ERP Boss</span>
                              ) : isLocal ? (
                                <span style={{ ...pillStyle, background: 'rgba(245,158,11,0.14)', color: '#d97706' }}>Stale Localhost</span>
                              ) : (
                                <span style={{ ...pillStyle, background: 'rgba(16,185,129,0.12)', color: '#059669' }}>✓ Active</span>
                              )}
                            </td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>
                              <button
                                type="button"
                                disabled={deletingWhId === wh.id}
                                onClick={() => handleDeleteWebhook(wh.id, wh.topic)}
                                style={{
                                  padding: '4px 9px', borderRadius: 6, cursor: 'pointer',
                                  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                                  color: '#dc2626', fontSize: '0.7rem', fontWeight: 700
                                }}
                              >
                                {deletingWhId === wh.id ? '...' : '🗑️ Remove'}
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', padding: '12px 0' }}>
                  {healthLoading ? 'Scanning Shopify webhooks...' : 'No active webhooks found yet. Click "Register / Repair All 10" above.'}
                </div>
              )}
            </ConfigCard>

            {/* Courier Portal Webhook URLs */}
            <ConfigCard
              icon="📬"
              title="Courier Incoming Webhook Endpoints (Copy to Courier Portals)"
              subtitle="Paste these URLs into PostEx & Instaworld dashboards for instant delivery/return push updates"
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <CopyEndpointBox label="PostEx Webhook URL (Header auth: tracepk)" url={postexWhUrl} onCopy={() => copyValue(postexWhUrl, 'PostEx Webhook URL')} />
                <CopyEndpointBox label="Instaworld Webhook URL (Header auth: tracepk)" url={instaWhUrl} onCopy={() => copyValue(instaWhUrl, 'Instaworld Webhook URL')} />
              </div>
            </ConfigCard>

            {/* OAuth Re-Authorization & Token Replacement */}
            <ConfigCard
              icon="🔑"
              title="OAuth Re-Authorization &amp; Token Management"
              subtitle="Upgrade existing store scopes (e.g. add read_themes, write_themes) or rotate an expired access token without losing orders"
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {/* OAuth Re-auth */}
                <div style={{ padding: 14, borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.82rem', color: 'var(--text-primary)', marginBottom: 4 }}>
                    Option A: Refresh via Shopify OAuth
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 10 }}>
                    Client ID stored: <strong>{store.shopify_client_id ? 'Yes ✓' : 'No'}</strong> · Secret stored: <strong>{store.has_client_secret ? 'Yes ✓' : 'No'}</strong>
                  </div>
                  {(showReauthCreds || !store.has_client_secret) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                      <input
                        className="form-input font-mono"
                        placeholder="Shopify Client ID"
                        value={reauthForm.client_id}
                        onChange={e => setReauthForm(p => ({ ...p, client_id: e.target.value }))}
                      />
                      <input
                        className="form-input font-mono"
                        type="password"
                        placeholder="Shopify Client Secret"
                        value={reauthForm.client_secret}
                        onChange={e => setReauthForm(p => ({ ...p, client_secret: e.target.value }))}
                      />
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" onClick={handleReauth} style={primaryBtnStyle}>
                      🔑 Re-Authorize All 17 Scopes
                    </button>
                    {store.has_client_secret && !showReauthCreds && (
                      <button type="button" onClick={() => setShowReauthCreds(true)} style={secondaryBtnStyle}>
                        Update Client Keys
                      </button>
                    )}
                  </div>
                </div>

                {/* Direct Token Replace */}
                <div style={{ padding: 14, borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.82rem', color: 'var(--text-primary)', marginBottom: 4 }}>
                    Option B: Paste Custom App `shpat_` Token
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 10 }}>
                    Instant live verification against Shopify before replacing the store token.
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      className="form-input font-mono"
                      type="password"
                      placeholder="shpat_xxxxxxxxxxxxxxxx"
                      value={directTokenInput}
                      onChange={e => setDirectTokenInput(e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      disabled={updatingToken || !directTokenInput.trim()}
                      onClick={handleReplaceDirectToken}
                      style={secondaryBtnStyle}
                    >
                      {updatingToken ? '...' : 'Verify & Save'}
                    </button>
                  </div>
                </div>
              </div>
            </ConfigCard>
          </div>
        )}

        {/* ═══ TAB 4: SYNC & SNIPER ═══ */}
        {tab === 'sync' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* 3 Quick On-Demand Sync Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
              <QuickSyncCard
                icon="🛒"
                title="Pull Latest Orders"
                desc="Fetch recent Shopify orders & updates into Command Center"
                busy={quickSyncBusy === 'shopify'}
                onClick={() => handleQuickSync('shopify')}
              />
              <QuickSyncCard
                icon="📦"
                title="Sync Products & Stock"
                desc="Refresh SKU catalog, variants & Shopify Committed/On-Hand breakdown"
                busy={quickSyncBusy === 'products'}
                onClick={() => handleQuickSync('products')}
              />
              <QuickSyncCard
                icon="🚚"
                title="Sync Courier Tracking"
                desc="Refresh live PostEx & Instaworld parcel statuses for this store"
                busy={quickSyncBusy === 'courier'}
                onClick={() => handleQuickSync('courier')}
              />
            </div>

            {/* Historical Deep Sync */}
            <ConfigCard
              icon="🗄️"
              title="Historical Deep Order Sync"
              subtitle="Backfill older Shopify orders from a specific start date (runs safely in background)"
              rightAction={isSyncing ? (
                <button type="button" onClick={handleAbortSync} style={dangerBtnStyle}>🛑 Abort Running Sync</button>
              ) : null}
            >
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
                <div style={{ flex: 1, minWidth: 190 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>Sync From Date</label>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {[{ l: '7d', v: 7 }, { l: '30d', v: 30 }, { l: '90d', v: 90 }, { l: 'All Time', v: 'all' }].map(p => (
                        <button key={p.l} type="button" onClick={() => applySyncDatePreset(p.v)} style={tinyPresetBtnStyle}>{p.l}</button>
                      ))}
                    </div>
                  </div>
                  <input type="date" className="form-input" value={syncStartDate} onChange={e => setSyncStartDate(e.target.value)} />
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={syncStatusOpt} onChange={e => setSyncStatusOpt(e.target.checked)} />
                  Status (Fast)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={syncCostsOpt} onChange={e => setSyncCostsOpt(e.target.checked)} />
                  Costs (Slow)
                </label>

                <button type="button" disabled={isSyncing} onClick={handleStartDeepSync} style={primaryBtnStyle}>
                  🚀 Start Deep Sync
                </button>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Last synced: <strong>{store.last_synced_at ? new Date(store.last_synced_at).toLocaleString() : 'Never'}</strong>
                {store.last_cost_sync_at ? <> · Last product sync: <strong>{new Date(store.last_cost_sync_at).toLocaleString()}</strong></> : null}
              </div>
            </ConfigCard>

            {/* Order Sniper Tool (Single + Multi) */}
            <ConfigCard
              icon="🎯"
              title="Order Sniper Tool — Instant Single or Bulk Pull"
              subtitle="Sync one order (#TR35118) or multiple comma-separated order numbers directly from Shopify"
            >
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  className="form-input font-mono"
                  placeholder="e.g. #TR35118 or #35118, #35119, #35120"
                  value={sniperInput}
                  onChange={e => setSniperInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSniperRun() }}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  disabled={sniperRunning || !sniperInput.trim()}
                  onClick={handleSniperRun}
                  style={{
                    padding: '0 18px', borderRadius: 10, border: '1px solid rgba(245,158,11,0.4)',
                    background: 'rgba(245,158,11,0.14)', color: '#b45309',
                    fontWeight: 800, fontSize: '0.82rem', cursor: sniperRunning ? 'wait' : 'pointer'
                  }}
                >
                  {sniperRunning ? 'Pulling...' : '🎯 Sync Now'}
                </button>
              </div>

              {sniperLogs.length > 0 && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {sniperLogs.map((log, i) => (
                    <div key={`${log.orderName}-${i}`} style={{
                      padding: '6px 10px', borderRadius: 8, fontSize: '0.74rem',
                      background: log.ok ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                      color: log.ok ? '#059669' : '#dc2626',
                      display: 'flex', justifyContent: 'space-between', gap: 8
                    }}>
                      <strong className="font-mono">{log.orderName}</strong>
                      <span>{log.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </ConfigCard>
          </div>
        )}

        {/* ═══ TAB 5: STORE SETTINGS & DANGER ZONE ═══ */}
        {tab === 'settings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* General Store Settings */}
            <ConfigCard icon="⚙️" title="Store Identity &amp; Sync Window" subtitle="Display name and order import cutoff date">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 12 }}>
                <div>
                  <label style={labelStyle}>Store Display Name</label>
                  <input className="form-input" value={form.store_name || ''} onChange={updateField('store_name')} />
                </div>
                <div>
                  <label style={labelStyle}>Initial Sync Start Date</label>
                  <input className="form-input" type="date" value={form.sync_start_date || ''} onChange={updateField('sync_start_date')} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Store ID: <strong>#{store.id}</strong> · Created: <strong>{store.created_at ? new Date(store.created_at).toLocaleDateString() : '—'}</strong>
                </span>
                <button type="button" disabled={saving} onClick={() => handleSaveSettings()} style={primaryBtnStyle}>
                  💾 Save Store Identity
                </button>
              </div>
            </ConfigCard>

            {/* Danger Zone */}
            <div style={{
              padding: 18, borderRadius: 14,
              background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.28)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap'
            }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#dc2626' }}>🚨 Danger Zone — Disconnect Store</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                  Removes this store record and its credentials from TRACE ERP. Requires typing the exact store name to confirm.
                </div>
              </div>
              <button type="button" onClick={onDisconnect} style={dangerBtnStyle}>
                🗑️ Disconnect Store
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Subcomponents ─── */

function KpiTile({ label, value, sub, accent }) {
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 12,
      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
      borderTop: `3px solid ${accent}`
    }}>
      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--text-primary)', marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.7rem', fontWeight: 700, color: accent, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function DiagCard({ icon, title, status, badge, children }) {
  const borderMap = {
    ok: 'rgba(16,185,129,0.32)',
    warn: 'rgba(245,158,11,0.38)',
    error: 'rgba(239,68,68,0.35)',
    loading: 'var(--border)'
  }
  const dotMap = { ok: '#10b981', warn: '#f59e0b', error: '#ef4444', loading: '#94a3b8' }
  return (
    <div style={{
      padding: 14, borderRadius: 12,
      background: 'var(--bg-surface)',
      border: `1px solid ${borderMap[status] || 'var(--border)'}`,
      display: 'flex', flexDirection: 'column', gap: 6
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: '0.8rem', color: 'var(--text-primary)' }}>
          <span>{icon}</span>
          <span>{title}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {badge && <span style={{ fontSize: '0.67rem', fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>{badge}</span>}
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotMap[status] || '#94a3b8' }} />
        </div>
      </div>
      <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{children}</div>
    </div>
  )
}

function ConfigCard({ icon, title, subtitle, rightAction, children }) {
  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 13,
      background: 'var(--bg-surface)', overflow: 'hidden'
    }}>
      <div style={{
        padding: '13px 16px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-elevated)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap'
      }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: '0.84rem', color: 'var(--text-primary)' }}>{icon} {title}</div>
          {subtitle && <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</div>}
        </div>
        {rightAction}
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  )
}

function SecretInput({ label, value, onChange, revealed, onToggle, onCopy, placeholder }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <label style={{ ...labelStyle, marginBottom: 0 }}>{label}</label>
        {value && (
          <span style={{ fontSize: '0.63rem', fontWeight: 700, color: '#059669' }}>● Set</span>
        )}
      </div>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          className="form-input font-mono"
          type={revealed ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          style={{ paddingRight: 62 }}
        />
        <div style={{ position: 'absolute', right: 6, display: 'flex', gap: 2 }}>
          <button type="button" onClick={onToggle} title={revealed ? 'Hide' : 'Show'} style={iconMiniBtn}>
            {revealed ? '🙈' : '👁️'}
          </button>
          {value && (
            <button type="button" onClick={onCopy} title="Copy" style={iconMiniBtn}>📋</button>
          )}
        </div>
      </div>
    </div>
  )
}

function TestResultBanner({ result }) {
  return (
    <div style={{
      marginTop: 10, padding: '8px 12px', borderRadius: 8, fontSize: '0.74rem', fontWeight: 700,
      background: result.success ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
      color: result.success ? '#059669' : '#dc2626',
      border: `1px solid ${result.success ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`
    }}>
      {result.success ? '✅' : '❌'} {result.message} {result.latency_ms ? `(${result.latency_ms}ms)` : ''}
    </div>
  )
}

function CopyEndpointBox({ label, url, onCopy }) {
  return (
    <div style={{ padding: 12, borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }}>
        <span style={{ fontSize: '0.73rem', fontWeight: 700, color: 'var(--text-primary)' }}>{label}</span>
        <button type="button" onClick={onCopy} style={tinyPresetBtnStyle}>📋 Copy</button>
      </div>
      <code style={{ fontSize: '0.7rem', color: '#4f46e5', wordBreak: 'break-all' }}>{url}</code>
    </div>
  )
}

function QuickSyncCard({ icon, title, desc, busy, onClick }) {
  return (
    <div style={{
      padding: 15, borderRadius: 12,
      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 12
    }}>
      <div>
        <div style={{ fontSize: '0.86rem', fontWeight: 800, color: 'var(--text-primary)' }}>{icon} {title}</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.45 }}>{desc}</div>
      </div>
      <button type="button" disabled={busy} onClick={onClick} style={{ ...secondaryBtnStyle, width: '100%', justifyContent: 'center' }}>
        {busy ? '⏳ Triggering...' : '▶ Run Now'}
      </button>
    </div>
  )
}

/* ─── Shared Styles ─── */
const sectionTitleStyle = {
  fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10
}
const labelStyle = {
  display: 'block', fontSize: '0.74rem', fontWeight: 700,
  color: 'var(--text-secondary)', marginBottom: 5
}
const primaryBtnStyle = {
  padding: '8px 16px', borderRadius: 9, border: 'none', cursor: 'pointer',
  background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
  color: '#fff', fontWeight: 700, fontSize: '0.78rem',
  boxShadow: '0 3px 10px rgba(99,102,241,0.28)',
  display: 'inline-flex', alignItems: 'center', gap: 6
}
const secondaryBtnStyle = {
  padding: '8px 13px', borderRadius: 9, cursor: 'pointer',
  background: 'var(--bg-surface)', border: '1px solid var(--border-bright)',
  color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.76rem',
  display: 'inline-flex', alignItems: 'center', gap: 6
}
const dangerBtnStyle = {
  padding: '8px 14px', borderRadius: 9, cursor: 'pointer',
  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.32)',
  color: '#dc2626', fontWeight: 800, fontSize: '0.78rem',
  display: 'inline-flex', alignItems: 'center', gap: 6
}
const testBtnStyle = {
  padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
  background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)',
  color: '#4f46e5', fontWeight: 700, fontSize: '0.73rem'
}
const ghostLinkBtnStyle = {
  padding: '7px 11px', borderRadius: 9, textDecoration: 'none',
  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 700
}
const miniLinkBtnStyle = {
  padding: '3px 8px', borderRadius: 6, cursor: 'pointer',
  background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)',
  color: '#4f46e5', fontSize: '0.69rem', fontWeight: 700
}
const iconMiniBtn = {
  border: 'none', background: 'transparent', cursor: 'pointer',
  fontSize: '0.8rem', padding: '2px 4px', borderRadius: 4
}
const tinyPresetBtnStyle = {
  padding: '2px 7px', borderRadius: 6, cursor: 'pointer',
  border: '1px solid var(--border)', background: 'var(--bg-surface)',
  color: 'var(--text-secondary)', fontSize: '0.66rem', fontWeight: 700
}
const thStyle = { padding: '9px 12px', fontSize: '0.69rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }
const tdStyle = { padding: '9px 12px', verticalAlign: 'middle' }
const pillStyle = { fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99, display: 'inline-block' }
