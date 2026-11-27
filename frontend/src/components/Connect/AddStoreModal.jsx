import { useState } from 'react'

const REQUIRED_SCOPES_PREVIEW = [
  'read_orders', 'write_orders', 'read_all_orders',
  'read_products', 'write_products',
  'read_inventory', 'write_inventory', 'read_locations',
  'read_customers', 'read_fulfillments', 'write_fulfillments',
  'read_merchant_managed_fulfillment_orders', 'write_merchant_managed_fulfillment_orders',
  'read_assigned_fulfillment_orders', 'write_assigned_fulfillment_orders',
  'read_themes', 'write_themes',
]

export default function AddStoreModal({ onClose, onConnected, onOpenGuide, addToast }) {
  const [mode, setMode] = useState('oauth') // 'oauth' | 'direct'
  const [showSecret, setShowSecret] = useState(false)
  const [showCouriers, setShowCouriers] = useState(false)
  const [loading, setLoading] = useState(false)
  const [copiedKey, setCopiedKey] = useState('')

  const [form, setForm] = useState({
    store_name: '',
    shop_domain: '',
    client_id: '',
    client_secret: '',
    access_token: '',
    sync_start_date: '',
    postex_token: '',
    instaworld_key: '',
    instaworld_key_backup: '',
    instaworld_key_3: '',
    leopards_token: '',
    tcs_token: '',
    google_maps_key: '',
    gas_proxy_url: '',
  })

  const set = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }))

  const cleanDomain = (raw) =>
    String(raw || '').replace(/^https?:\/\//i, '').replace(/\/.*$/, '').trim().toLowerCase()

  const redirectUri = `${window.location.origin}/api/auth/callback`

  const copyText = (text, key) => {
    navigator.clipboard?.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(''), 1800)
    addToast('📋 Copied to clipboard', 'success', 2000)
  }

  const applyDatePreset = (days) => {
    if (days === 'all') {
      setForm(p => ({ ...p, sync_start_date: '2010-01-01' }))
      return
    }
    const d = new Date()
    d.setDate(d.getDate() - days)
    setForm(p => ({ ...p, sync_start_date: d.toISOString().slice(0, 10) }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const domain = cleanDomain(form.shop_domain)
    if (!domain) {
      addToast('Please enter a valid Shopify domain (e.g. your-store.myshopify.com)', 'error')
      return
    }

    setLoading(true)
    try {
      if (mode === 'oauth') {
        if (!form.client_id.trim() || !form.client_secret.trim()) {
          addToast('Shopify Client ID and Client Secret are required for OAuth', 'error')
          setLoading(false)
          return
        }
        const res = await fetch('/api/auth/url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, shop_domain: domain })
        })
        const data = await res.json()
        if (data.auth_url) {
          window.open(data.auth_url, '_blank', 'width=760,height=660')
          addToast('🔗 Shopify OAuth opened! Authorize the app, then click Refresh Fleet.', 'info', 9000)
          onConnected?.({ pending: true })
          onClose()
        } else {
          addToast(data.error || 'Failed to generate OAuth URL', 'error')
        }
      } else {
        if (!form.access_token.trim()) {
          addToast('Admin API Access Token (shpat_...) is required', 'error')
          setLoading(false)
          return
        }
        const res = await fetch('/api/stores/direct-connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, shop_domain: domain })
        })
        const data = await res.json()
        if (res.ok && data.success) {
          addToast(`✅ ${data.message}`, 'success', 6000)
          onConnected?.({ storeId: data.store_id })
          onClose()
        } else {
          addToast(data.error || 'Direct connection failed', 'error')
        }
      }
    } catch {
      addToast('Network error while connecting store', 'error')
    }
    setLoading(false)
  }

  const normalizedPreview = cleanDomain(form.shop_domain)

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, overflowY: 'auto'
      }}
    >
      <div style={{
        width: '100%', maxWidth: 960, maxHeight: '92vh',
        background: 'var(--bg-surface)', border: '1px solid var(--border-bright)',
        borderRadius: 18, boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '18px 24px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          background: 'linear-gradient(90deg, rgba(99,102,241,0.08) 0%, rgba(168,85,247,0.04) 60%, transparent 100%)',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.15rem', fontWeight: 800, boxShadow: '0 4px 12px rgba(99,102,241,0.3)'
            }}>🏪</div>
            <div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Connect New Shopify Store
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                Link via Partner OAuth App (17 scopes incl. Theme Sync) or Direct Custom App Token
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => { onClose(); onOpenGuide?.() }}
              style={{
                padding: '7px 12px', borderRadius: 8, cursor: 'pointer',
                background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.28)',
                color: '#2563eb', fontSize: '0.75rem', fontWeight: 700
              }}
            >
              📖 Setup Guide
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                width: 34, height: 34, borderRadius: 8, cursor: 'pointer',
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.95rem'
              }}
            >✕</button>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.45fr) minmax(260px, 0.85fr)',
          gap: 0,
          overflowY: 'auto',
          flex: 1,
          minHeight: 0,
        }}>
          {/* Left: Form */}
          <form onSubmit={handleSubmit} style={{ padding: 24, borderRight: '1px solid var(--border)' }}>
            {/* Connection Mode Switch */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
              padding: 4, borderRadius: 12, background: 'var(--bg-elevated)',
              border: '1px solid var(--border)', marginBottom: 20
            }}>
              {[
                { id: 'oauth', label: '🔐 Partner OAuth App', sub: 'Recommended · Auto 17 scopes' },
                { id: 'direct', label: '⚡ Direct Admin Token', sub: 'Instant shpat_ Custom App' },
              ].map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  style={{
                    padding: '9px 12px', borderRadius: 9, cursor: 'pointer', textAlign: 'left',
                    border: mode === m.id ? '1px solid rgba(99,102,241,0.45)' : '1px solid transparent',
                    background: mode === m.id ? 'var(--bg-surface)' : 'transparent',
                    boxShadow: mode === m.id ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
                    transition: 'all 0.15s'
                  }}
                >
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: mode === m.id ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    {m.label}
                  </div>
                  <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)', marginTop: 1 }}>{m.sub}</div>
                </button>
              ))}
            </div>

            {/* Store Identity */}
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              1. Store Identity
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
              <div>
                <label style={labelStyle}>Store Label / Display Name</label>
                <input className="form-input" placeholder="e.g. Rabbi Trends" value={form.store_name} onChange={set('store_name')} />
                <div style={hintStyle}>Shown in Topbar & Reports</div>
              </div>
              <div>
                <label style={labelStyle}>Shopify Domain *</label>
                <input
                  className="form-input font-mono"
                  placeholder="your-store.myshopify.com"
                  value={form.shop_domain}
                  onChange={set('shop_domain')}
                  required
                />
                <div style={hintStyle}>
                  {normalizedPreview && normalizedPreview !== form.shop_domain
                    ? `Auto-cleaned → ${normalizedPreview}`
                    : 'Use .myshopify.com domain'}
                </div>
              </div>
            </div>

            {/* Credentials */}
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              2. {mode === 'oauth' ? 'Shopify Partner OAuth Credentials' : 'Shopify Custom App Admin Token'}
            </div>

            {mode === 'oauth' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
                <div>
                  <label style={labelStyle}>Client ID *</label>
                  <input className="form-input font-mono" placeholder="shpca_xxxxxxxxxxxxxxxx" value={form.client_id} onChange={set('client_id')} required />
                </div>
                <div>
                  <label style={labelStyle}>Client Secret *</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="form-input font-mono"
                      type={showSecret ? 'text' : 'password'}
                      placeholder="shpss_xxxxxxxxxxxxxxxx"
                      value={form.client_secret}
                      onChange={set('client_secret')}
                      style={{ paddingRight: 38 }}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(v => !v)}
                      title={showSecret ? 'Hide' : 'Show'}
                      style={eyeBtnStyle}
                    >
                      {showSecret ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>Admin API Access Token (`shpat_...`) *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="form-input font-mono"
                    type={showSecret ? 'text' : 'password'}
                    placeholder="shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    value={form.access_token}
                    onChange={set('access_token')}
                    style={{ paddingRight: 38 }}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(v => !v)}
                    title={showSecret ? 'Hide' : 'Show'}
                    style={eyeBtnStyle}
                  >
                    {showSecret ? '🙈' : '👁️'}
                  </button>
                </div>
                <div style={hintStyle}>Verified live against Shopify `/shop.json` before saving.</div>
              </div>
            )}

            {/* Initial Sync Start Date */}
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              3. Order Pull Window
            </div>
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>Initial Sync Start Date</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[
                    { label: 'Last 30d', val: 30 },
                    { label: 'Last 90d', val: 90 },
                    { label: 'All Time', val: 'all' },
                  ].map(p => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => applyDatePreset(p.val)}
                      style={{
                        padding: '2px 8px', fontSize: '0.67rem', fontWeight: 700, borderRadius: 6,
                        border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                        color: 'var(--text-secondary)', cursor: 'pointer'
                      }}
                    >{p.label}</button>
                  ))}
                </div>
              </div>
              <input className="form-input" type="date" value={form.sync_start_date} onChange={set('sync_start_date')} />
              <div style={hintStyle}>Leave blank or choose a date — orders older than this date are ignored.</div>
            </div>

            {/* Collapsible Optional Courier API Keys */}
            <div style={{
              border: '1px solid var(--border)', borderRadius: 12,
              background: 'var(--bg-elevated)', marginBottom: 20, overflow: 'hidden'
            }}>
              <button
                type="button"
                onClick={() => setShowCouriers(v => !v)}
                style={{
                  width: '100%', padding: '11px 14px', border: 'none', background: 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
                  color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.8rem'
                }}
              >
                <span>🚚 Courier &amp; Maps API Keys <span style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.72rem' }}>(Optional — can configure later)</span></span>
                <span style={{ color: 'var(--text-muted)' }}>{showCouriers ? '▲' : '▼'}</span>
              </button>

              {showCouriers && (
                <div style={{ padding: '4px 14px 14px', borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ gridColumn: '1 / -1', marginTop: 8 }}>
                    <label style={labelStyle}>PostEx API Token</label>
                    <input className="form-input font-mono" placeholder="PostEx token" value={form.postex_token} onChange={set('postex_token')} />
                  </div>
                  <div>
                    <label style={labelStyle}>Instaworld Primary Key</label>
                    <input className="form-input font-mono" placeholder="Primary key" value={form.instaworld_key} onChange={set('instaworld_key')} />
                  </div>
                  <div>
                    <label style={labelStyle}>Instaworld Backup Key</label>
                    <input className="form-input font-mono" placeholder="Backup key" value={form.instaworld_key_backup} onChange={set('instaworld_key_backup')} />
                  </div>
                  <div>
                    <label style={labelStyle}>Instaworld Key 3</label>
                    <input className="form-input font-mono" placeholder="3rd fallback key" value={form.instaworld_key_3} onChange={set('instaworld_key_3')} />
                  </div>
                  <div>
                    <label style={labelStyle}>Leopards API Token</label>
                    <input className="form-input font-mono" placeholder="Leopards token" value={form.leopards_token} onChange={set('leopards_token')} />
                  </div>
                  <div>
                    <label style={labelStyle}>TCS API Token</label>
                    <input className="form-input font-mono" placeholder="TCS token" value={form.tcs_token} onChange={set('tcs_token')} />
                  </div>
                  <div>
                    <label style={labelStyle}>Google Maps API Key</label>
                    <input className="form-input font-mono" placeholder="GCP geocoding key" value={form.google_maps_key} onChange={set('google_maps_key')} />
                  </div>
                </div>
              )}
            </div>

            {/* Submit Button */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '11px 18px', borderRadius: 10, border: '1px solid var(--border)',
                  background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
                  fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer'
                }}
              >Cancel</button>
              <button
                type="submit"
                disabled={loading}
                style={{
                  flex: 1, padding: '11px 20px', borderRadius: 10, border: 'none',
                  background: loading ? 'var(--bg-elevated)' : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                  color: loading ? 'var(--text-muted)' : '#fff',
                  fontWeight: 700, fontSize: '0.88rem', cursor: loading ? 'not-allowed' : 'pointer',
                  boxShadow: loading ? 'none' : '0 4px 14px rgba(99,102,241,0.32)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                }}
              >
                {loading ? 'Connecting...' : (mode === 'oauth' ? '🚀 Generate OAuth Link & Authorize' : '⚡ Verify Token & Connect Store')}
              </button>
            </div>
          </form>

          {/* Right: Live Onboarding Companion */}
          <div style={{ padding: 20, background: 'var(--bg-elevated)', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Quick Copy — Shopify App Config
            </div>

            {/* Redirect URL Box */}
            <div style={helperCardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-primary)' }}>Allowed Redirection URL</span>
                <button
                  type="button"
                  onClick={() => copyText(redirectUri, 'redirect')}
                  style={copyChipStyle}
                >{copiedKey === 'redirect' ? '✓ Copied' : '📋 Copy'}</button>
              </div>
              <code style={{ fontSize: '0.7rem', color: '#4f46e5', wordBreak: 'break-all', display: 'block', lineHeight: 1.45 }}>
                {redirectUri}
              </code>
              <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)', marginTop: 6 }}>
                Paste this into your Shopify Dev Dashboard App URLs → Allowed redirection URLs.
              </div>
            </div>

            {/* Scopes Box */}
            <div style={helperCardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Required Scopes ({REQUIRED_SCOPES_PREVIEW.length})
                </span>
                <button
                  type="button"
                  onClick={() => copyText(REQUIRED_SCOPES_PREVIEW.join(','), 'scopes')}
                  style={copyChipStyle}
                >{copiedKey === 'scopes' ? '✓ Copied' : '📋 Copy CSV'}</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {REQUIRED_SCOPES_PREVIEW.map(sc => (
                  <span key={sc} style={{
                    fontSize: '0.63rem', fontFamily: 'monospace', padding: '2px 6px', borderRadius: 5,
                    background: sc.includes('theme') ? 'rgba(139,92,246,0.12)' : 'var(--bg-elevated)',
                    color: sc.includes('theme') ? '#7c3aed' : 'var(--text-secondary)',
                    border: '1px solid var(--border)'
                  }}>{sc}</span>
                ))}
              </div>
            </div>

            {/* Post-Connect Reminder */}
            <div style={{
              padding: 12, borderRadius: 10,
              background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.22)',
              fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.5
            }}>
              <div style={{ fontWeight: 800, color: '#059669', marginBottom: 4 }}>🛡️ ERP Inventory Boss Ready</div>
              Connect hone ke baad <strong>Webhooks &amp; OAuth</strong> tab se 1-click mein 10 webhooks register karein. <code>inventory_levels/update</code> automatically OFF rehta hai taake ERP stock overwrite na ho.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const labelStyle = {
  display: 'block',
  fontSize: '0.76rem',
  fontWeight: 700,
  color: 'var(--text-secondary)',
  marginBottom: 5,
}

const hintStyle = {
  fontSize: '0.67rem',
  color: 'var(--text-muted)',
  marginTop: 4,
}

const eyeBtnStyle = {
  position: 'absolute',
  right: 8,
  top: '50%',
  transform: 'translateY(-50%)',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: '0.85rem',
  padding: 2,
}

const helperCardStyle = {
  padding: 12,
  borderRadius: 10,
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
}

const copyChipStyle = {
  padding: '3px 8px',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  fontSize: '0.67rem',
  fontWeight: 700,
  cursor: 'pointer',
}
