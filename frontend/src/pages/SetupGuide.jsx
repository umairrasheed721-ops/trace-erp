import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'

const API = import.meta.env.VITE_API_URL || ''

const REQUIRED_SCOPE_GROUPS = [
  {
    group: 'Orders & Notes / Restock',
    color: '#2563eb',
    bg: 'rgba(37,99,235,0.09)',
    border: 'rgba(37,99,235,0.28)',
    scopes: ['read_orders', 'write_orders', 'read_all_orders'],
    why: 'Order sync, Shopify notes/tags update, cancellation sync, and partial return restocks.',
  },
  {
    group: 'Products & Inventory (ERP Boss)',
    color: '#059669',
    bg: 'rgba(16,185,129,0.09)',
    border: 'rgba(16,185,129,0.30)',
    scopes: ['read_products', 'write_products', 'read_inventory', 'write_inventory', 'read_locations'],
    why: 'Catalog/SKU sync, Available/Committed/On Hand fetch, PO Exact On-Hand Push, and Continue Selling toggle.',
  },
  {
    group: 'Fulfillments & Courier Tracking',
    color: '#7c3aed',
    bg: 'rgba(124,58,237,0.09)',
    border: 'rgba(124,58,237,0.28)',
    scopes: [
      'read_fulfillments',
      'write_fulfillments',
      'read_merchant_managed_fulfillment_orders',
      'write_merchant_managed_fulfillment_orders',
      'read_assigned_fulfillment_orders',
      'write_assigned_fulfillment_orders',
    ],
    why: 'Auto-fulfill orders with courier tracking number on booking and mark delivered.',
  },
  {
    group: 'Customers',
    color: '#b45309',
    bg: 'rgba(245,158,11,0.10)',
    border: 'rgba(245,158,11,0.30)',
    scopes: ['read_customers'],
    why: 'Customer order history, repeat-buyer tracking, and address verification.',
  },
]

const OPTIONAL_SCOPES = ['read_themes', 'write_themes', 'read_checkouts']

const ALL_REQUIRED_SCOPES_CSV = REQUIRED_SCOPE_GROUPS.flatMap(g => g.scopes).join(',')
const ALL_WITH_OPTIONAL_SCOPES_CSV = [...REQUIRED_SCOPE_GROUPS.flatMap(g => g.scopes), ...OPTIONAL_SCOPES].join(',')

const OFFICIAL_WEBHOOKS = [
  { topic: 'orders/create', category: 'Orders', effect: 'Pulls new order immediately + micro-syncs SKU Committed & Available.' },
  { topic: 'orders/updated', category: 'Orders', effect: 'Syncs address/item/tag/note edits + refreshes SKU Committed.' },
  { topic: 'orders/fulfilled', category: 'Orders', effect: 'Marks fulfilled + updates Committed & On Hand in real time.' },
  { topic: 'orders/paid', category: 'Orders', effect: 'Updates payment / financial status.' },
  { topic: 'orders/cancelled', category: 'Orders', effect: 'Cancels order in ERP + auto-restores consumed FIFO PO batch.' },
  { topic: 'fulfillments/create', category: 'Fulfillments', effect: 'Syncs tracking number & updates On Hand / Committed.' },
  { topic: 'fulfillments/update', category: 'Fulfillments', effect: 'Updates tracking or reverses FIFO if fulfillment is cancelled.' },
  { topic: 'products/create', category: 'Products', effect: 'Adds new Shopify products/variants directly into Costing & PO Picker.' },
  { topic: 'products/update', category: 'Products', effect: 'Updates title, SKU, price, image & policy (protects unpushed ERP stock).' },
  { topic: 'products/delete', category: 'Products', effect: 'Removes deleted product from local catalog cache.' },
]

const CHECKLIST_STORAGE_KEY = 'trace_erp_new_store_onboarding_v1'

const DEFAULT_CHECKLIST = {
  s1_app: false,
  s2_urls: false,
  s3_scopes: false,
  s4_connect: false,
  s5_webhooks: false,
  s6_catalog: false,
  s7_orders: false,
  s8_baseline: false,
  s9_accounts: false,
  s10_couriers: false,
}

function CopyBox({ label, value, hint, onCopy, mono = true }) {
  return (
    <div style={{
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '9px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 5,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
          {label}
        </span>
        <button
          type="button"
          onClick={() => onCopy(value, label)}
          style={{
            padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
            background: 'rgba(37,99,235,0.11)', color: '#1d4ed8', border: '1px solid rgba(37,99,235,0.32)',
          }}
        >
          📋 Copy
        </button>
      </div>
      <div style={{
        fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit',
        fontSize: 12,
        color: 'var(--text-primary)',
        wordBreak: 'break-all',
        background: 'var(--bg-surface)',
        padding: '7px 9px',
        borderRadius: 7,
        border: '1px solid var(--border)',
        userSelect: 'all',
      }}>
        {value}
      </div>
      {hint && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{hint}</div>}
    </div>
  )
}

export default function SetupGuide() {
  const { stores, activeStoreId, token, addToast } = useApp()
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState('onboarding') // 'onboarding' | 'actions' | 'playbook' | 'reference'
  const [busyKey, setBusyKey] = useState('')
  const [diagnoseResult, setDiagnoseResult] = useState(null)
  const [checklist, setChecklist] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CHECKLIST_STORAGE_KEY) || '{}')
      return { ...DEFAULT_CHECKLIST, ...saved }
    } catch {
      return DEFAULT_CHECKLIST
    }
  })

  const appOrigin = useMemo(() => {
    if (typeof window !== 'undefined' && window.location?.origin && !window.location.origin.includes('localhost')) {
      return window.location.origin
    }
    return 'https://trace-erp-production.up.railway.app'
  }, [])

  const callbackUrl = `${appOrigin}/api/auth/callback`
  const webhookUrl = `${appOrigin}/api/webhooks/shopify`

  const activeStore = useMemo(() => {
    return (stores || []).find(s => Number(s.id) === Number(activeStoreId)) || (stores || [])[0] || null
  }, [stores, activeStoreId])

  const authHeaders = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...(activeStoreId ? { 'x-active-store-id': String(activeStoreId) } : {}),
  }), [token, activeStoreId])

  const copyText = async (text, label = 'Copied') => {
    try {
      await navigator.clipboard.writeText(text)
      addToast(`✅ ${label} copied to clipboard`, 'success')
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      addToast(`✅ ${label} copied`, 'success')
    }
  }

  const toggleCheck = (key) => {
    setChecklist(prev => {
      const next = { ...prev, [key]: !prev[key] }
      try { localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(next)) } catch (_) {}
      return next
    })
  }

  const resetChecklist = () => {
    setChecklist(DEFAULT_CHECKLIST)
    try { localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(DEFAULT_CHECKLIST)) } catch (_) {}
    addToast('Onboarding checklist reset for a new store', 'info')
  }

  const completedSteps = Object.values(checklist).filter(Boolean).length
  const totalSteps = Object.keys(DEFAULT_CHECKLIST).length
  const progressPct = Math.round((completedSteps / totalSteps) * 100)

  const shopifyTomlSnippet = useMemo(() => (
`# Shopify Dev Dashboard — shopify.app.toml quick snippet
client_id = "PASTE_YOUR_CLIENT_ID_HERE"
name = "TRACE ERP Connector"
application_url = "${appOrigin}"
embedded = false

[access_scopes]
scopes = "${ALL_REQUIRED_SCOPES_CSV}"

[auth]
redirect_urls = [
  "${callbackUrl}"
]`
  ), [appOrigin, callbackUrl])

  // ── Live Primary Actions for Active Store ─────────────────────────────────
  const runRegisterWebhooks = async () => {
    if (!activeStore) return addToast('Select or connect a store first', 'warning')
    setBusyKey('webhooks')
    try {
      const res = await fetch(`${API}/api/stores/${activeStore.id}/register-webhooks`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ appUrl: appOrigin }),
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok && j.success !== false) {
        addToast(`✅ All 10 webhooks registered on ${activeStore.store_name || activeStore.shop_domain}!`, 'success')
        setChecklist(prev => {
          const next = { ...prev, s5_webhooks: true }
          try { localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(next)) } catch (_) {}
          return next
        })
      } else {
        addToast(j.error || j.message || 'Webhook registration failed', 'error')
      }
    } catch {
      addToast('Network error while registering webhooks', 'error')
    } finally {
      setBusyKey('')
    }
  }

  const runSyncCatalog = async () => {
    if (!activeStore) return addToast('Select or connect a store first', 'warning')
    setBusyKey('syncCatalog')
    try {
      const res = await fetch(`${API}/api/cost-manager/sync-shopify`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ store_id: activeStore.id }),
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok && j.success) {
        addToast(`✅ Catalog synced (${j.count || 0} variants with Available / Committed / On Hand)!`, 'success')
        setChecklist(prev => {
          const next = { ...prev, s6_catalog: true }
          try { localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(next)) } catch (_) {}
          return next
        })
      } else {
        addToast(j.error || j.message || 'Catalog sync failed', 'error')
      }
    } catch {
      addToast('Network error while syncing catalog', 'error')
    } finally {
      setBusyKey('')
    }
  }

  const runDiagnoseShopify = async () => {
    if (!activeStore) return addToast('Select or connect a store first', 'warning')
    setBusyKey('diagnose')
    setDiagnoseResult(null)
    try {
      const res = await fetch(`${API}/api/cost-manager/diagnose-shopify?store_id=${activeStore.id}`, {
        headers: authHeaders,
      })
      const j = await res.json().catch(() => ({}))
      setDiagnoseResult(j)
      if (j.passed) addToast('✅ Shopify API token, scopes & GraphQL healthy!', 'success')
      else addToast('⚠️ Diagnose found issues — see details below', 'warning')
    } catch {
      addToast('Failed to run Shopify diagnose', 'error')
    } finally {
      setBusyKey('')
    }
  }

  const runBaselinePo = async () => {
    if (!activeStore) return addToast('Select or connect a store first', 'warning')
    if (!window.confirm(`Create PO-INITIAL-BASELINE for ${activeStore.store_name || activeStore.shop_domain} from current catalog stock (Supplier Payable = Rs. 0)?`)) return
    setBusyKey('baseline')
    try {
      const res = await fetch(`${API}/api/po-ledger/pos/baseline`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ store_id: activeStore.id }),
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok && j.success) {
        addToast(`✅ ${j.message || 'Baseline PO created!'}`, 'success')
        setChecklist(prev => {
          const next = { ...prev, s8_baseline: true }
          try { localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(next)) } catch (_) {}
          return next
        })
      } else {
        addToast(j.error || j.message || 'Baseline PO failed (may already exist)', 'warning')
      }
    } catch {
      addToast('Network error creating Baseline PO', 'error')
    } finally {
      setBusyKey('')
    }
  }

  const cardStyle = {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: '16px 18px',
  }

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ── Top Executive Header ── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(37,99,235,0.09) 0%, rgba(124,58,237,0.08) 100%)',
        border: '1px solid var(--border)',
        borderRadius: 15,
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 21, flexShrink: 0,
          }}>
            📖
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>
              Store Setup &amp; ERP Playbook
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--text-muted)' }}>
              Complete blueprint to attach any new Shopify store (App, Scopes, Callback, Webhooks) + 1-click primary actions &amp; daily SOPs
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {activeStore && (
            <span style={{
              padding: '5px 11px', borderRadius: 99, fontSize: 11.5, fontWeight: 700,
              background: 'rgba(16,185,129,0.12)', color: '#047857', border: '1px solid rgba(16,185,129,0.32)',
            }}>
              ● Active Store: {activeStore.store_name || activeStore.shop_domain}
            </span>
          )}
          <button
            type="button"
            onClick={() => navigate('/connect')}
            style={{
              padding: '7px 14px', borderRadius: 9, border: 'none', cursor: 'pointer',
              background: '#2563eb', color: '#fff', fontSize: 12.5, fontWeight: 700,
            }}
          >
            🔌 Connect New Store
          </button>
        </div>
      </div>

      {/* ── Segmented Tab Bar ── */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {[
          { id: 'onboarding', label: `🚀 Attach New Store (${completedSteps}/${totalSteps})` },
          { id: 'actions', label: '⚡ 1-Click Primary Actions' },
          { id: 'playbook', label: '📘 How to Use ERP (Daily SOP)' },
          { id: 'reference', label: '🔗 Webhooks & Copy Vault' },
        ].map(t => {
          const active = activeTab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: '8px 14px', borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                background: active ? '#2563eb' : 'var(--bg-surface)',
                color: active ? '#fff' : 'var(--text-primary)',
                border: active ? '1px solid #1d4ed8' : '1px solid var(--border)',
              }}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* TAB 1: ATTACH NEW STORE (STEP-BY-STEP + COPY-PASTE VAULT)          */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'onboarding' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Progress Bar */}
          <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ flex: '1 1 300px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>
                <span>New Store Launch Progress</span>
                <span style={{ color: progressPct === 100 ? '#059669' : '#2563eb' }}>{completedSteps} / {totalSteps} steps ({progressPct}%)</span>
              </div>
              <div style={{ height: 8, background: 'var(--bg-elevated)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ width: `${progressPct}%`, height: '100%', background: progressPct === 100 ? '#059669' : 'linear-gradient(90deg,#2563eb,#7c3aed)', transition: 'width 0.25s ease' }} />
              </div>
            </div>
            <button
              type="button"
              onClick={resetChecklist}
              style={{
                padding: '6px 11px', borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)',
              }}
            >
              ↺ Reset for Next Store
            </button>
          </div>

          {/* STEP 1: Create Shopify App */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text-primary)' }}>
                  Step 1 — Create Custom App in Shopify Dev / Partner Dashboard
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  Open <strong>dev.shopify.com</strong> (Shopify Partners → Apps → Create App) or Store Admin → Settings → Apps → Develop apps.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <a
                  href="https://partners.shopify.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: '6px 11px', borderRadius: 8, fontSize: 11.5, fontWeight: 700, textDecoration: 'none',
                    background: 'rgba(16,185,129,0.10)', color: '#047857', border: '1px solid rgba(16,185,129,0.32)',
                  }}
                >
                  ↗ Open Shopify Partners
                </a>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, cursor: 'pointer', color: checklist.s1_app ? '#059669' : 'var(--text-secondary)' }}>
                  <input type="checkbox" checked={checklist.s1_app} onChange={() => toggleCheck('s1_app')} />
                  Done
                </label>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 10 }}>
              <CopyBox
                label="App URL (Paste in Shopify App Setup)"
                value={appOrigin}
                hint="Set Embedded = OFF (Non-embedded standalone ERP)"
                onCopy={copyText}
              />
              <CopyBox
                label="Allowed Redirection URL (OAuth Callback)"
                value={callbackUrl}
                hint="Exact match required — no trailing slash"
                onCopy={copyText}
              />
            </div>

            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', color: checklist.s2_urls ? '#059669' : 'var(--text-secondary)' }}>
                <input type="checkbox" checked={checklist.s2_urls} onChange={() => toggleCheck('s2_urls')} />
                App URL &amp; Callback URL saved in Shopify App
              </label>
            </div>
          </div>

          {/* STEP 2: Copy-Paste Scopes */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text-primary)' }}>
                  Step 2 — Configure Exact Admin API Scopes (Copy &amp; Paste)
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  Enable these Admin API scopes inside your Shopify App so OAuth, PO Push, Fulfillments &amp; Watchdog work with zero errors.
                </div>
              </div>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, cursor: 'pointer', color: checklist.s3_scopes ? '#059669' : 'var(--text-secondary)' }}>
                <input type="checkbox" checked={checklist.s3_scopes} onChange={() => toggleCheck('s3_scopes')} />
                Scopes Enabled
              </label>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <CopyBox
                label={`Required ERP Scopes (${REQUIRED_SCOPE_GROUPS.flatMap(g => g.scopes).length} scopes — Recommended)`}
                value={ALL_REQUIRED_SCOPES_CSV}
                hint="Already built into TRACE ERP OAuth flow — copy-paste into Shopify App configuration or shopify.app.toml"
                onCopy={copyText}
              />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 9 }}>
                {REQUIRED_SCOPE_GROUPS.map(g => (
                  <div key={g.group} style={{ background: g.bg, border: `1px solid ${g.border}`, borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: g.color, marginBottom: 6 }}>{g.group}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                      {g.scopes.map(sc => (
                        <button
                          key={sc}
                          type="button"
                          onClick={() => copyText(sc, sc)}
                          title="Click to copy single scope"
                          style={{
                            fontFamily: 'monospace', fontSize: 10.5, fontWeight: 700, padding: '2px 6px', borderRadius: 5,
                            background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', cursor: 'pointer',
                          }}
                        >
                          {sc}
                        </button>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>{g.why}</div>
                  </div>
                ))}
              </div>

              <CopyBox
                label="Optional Full Scopes (Includes Theme / CRO Funnel + Abandoned Checkouts)"
                value={ALL_WITH_OPTIONAL_SCOPES_CSV}
                hint="Use only if you also plan to deploy Shopify Theme updates or Abandoned Checkout recovery on this store"
                onCopy={copyText}
              />

              <details style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px' }}>
                <summary style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer' }}>
                  📄 Show ready-to-paste <code>shopify.app.toml</code> config snippet
                </summary>
                <div style={{ marginTop: 9 }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 5 }}>
                    <button
                      type="button"
                      onClick={() => copyText(shopifyTomlSnippet, 'shopify.app.toml')}
                      style={{
                        padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        background: 'rgba(37,99,235,0.11)', color: '#1d4ed8', border: '1px solid rgba(37,99,235,0.32)',
                      }}
                    >
                      📋 Copy TOML
                    </button>
                  </div>
                  <pre style={{
                    margin: 0, padding: 10, borderRadius: 8, background: 'var(--bg-surface)',
                    border: '1px solid var(--border)', fontSize: 11.5, overflowX: 'auto', color: 'var(--text-primary)',
                  }}>
                    {shopifyTomlSnippet}
                  </pre>
                </div>
              </details>
            </div>
          </div>

          {/* STEP 3: Connect in ERP & Couriers */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text-primary)' }}>
                  Step 3 — Authorize Store &amp; Add Courier Tokens in Connect Store
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  Copy <strong>Client ID</strong> &amp; <strong>Client Secret</strong> from Shopify App → paste in Connect Store → approve OAuth popup → click Refresh Stores.
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate('/connect')}
                style={{
                  padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: '#2563eb', color: '#fff', fontSize: 12, fontWeight: 700,
                }}
              >
                🔌 Open Connect Store →
              </button>
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, cursor: 'pointer', color: checklist.s4_connect ? '#059669' : 'var(--text-secondary)' }}>
                <input type="checkbox" checked={checklist.s4_connect} onChange={() => toggleCheck('s4_connect')} />
                Shopify OAuth Authorized &amp; Store Connected
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, cursor: 'pointer', color: checklist.s10_couriers ? '#059669' : 'var(--text-secondary)' }}>
                <input type="checkbox" checked={checklist.s10_couriers} onChange={() => toggleCheck('s10_couriers')} />
                PostEx Token &amp; Instaworld Keys Added
              </label>
            </div>
          </div>

          {/* STEP 4: Register Webhooks + Initial Sync + Baseline PO */}
          <div style={cardStyle}>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
              Step 4 — Activate Webhooks, Sync Catalog &amp; Initialize Stock / Accounts
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              Switch the top bar to your newly connected store, then execute these 4 primary launch actions in order:
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10 }}>
              {[
                {
                  key: 's5_webhooks',
                  title: '1. Register 10 Webhooks',
                  desc: 'Enables real-time order, fulfillment & product webhooks (keeps ERP as Inventory Boss).',
                  btnLabel: busyKey === 'webhooks' ? '⏳ Registering...' : '⚡ Register Webhooks',
                  onClick: runRegisterWebhooks,
                  busy: busyKey === 'webhooks',
                  color: '#2563eb',
                },
                {
                  key: 's6_catalog',
                  title: '2. Sync Catalog & Inventory',
                  desc: 'Pulls all SKUs, selling prices, Available, Committed, On Hand & images from Shopify.',
                  btnLabel: busyKey === 'syncCatalog' ? '⏳ Syncing...' : '🔄 Sync Shopify Catalog',
                  onClick: runSyncCatalog,
                  busy: busyKey === 'syncCatalog',
                  color: '#059669',
                },
                {
                  key: 's7_orders',
                  title: '3. Historical Deep Sync',
                  desc: 'Pull past orders from your Sync Start Date in Connect Store.',
                  btnLabel: '🗄️ Open Deep Sync',
                  onClick: () => navigate('/connect'),
                  busy: false,
                  color: '#7c3aed',
                },
                {
                  key: 's8_baseline',
                  title: '4. Create Baseline PO',
                  desc: 'Locks opening shelf stock snapshot with Rs. 0 supplier payable for strict FIFO costing.',
                  btnLabel: busyKey === 'baseline' ? '⏳ Creating...' : '📦 1-Click Baseline PO',
                  onClick: runBaselinePo,
                  busy: busyKey === 'baseline',
                  color: '#b45309',
                },
              ].map(step => (
                <div key={step.key} style={{
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 11,
                  padding: '12px 13px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 10,
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-primary)' }}>{step.title}</span>
                      <input type="checkbox" checked={Boolean(checklist[step.key])} onChange={() => toggleCheck(step.key)} title="Mark complete" />
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4 }}>{step.desc}</div>
                  </div>
                  <button
                    type="button"
                    disabled={step.busy}
                    onClick={step.onClick}
                    style={{
                      padding: '7px 11px', borderRadius: 8, border: 'none', cursor: 'pointer',
                      background: step.color, color: '#fff', fontSize: 12, fontWeight: 700,
                      opacity: step.busy ? 0.65 : 1,
                    }}
                  >
                    {step.btnLabel}
                  </button>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 11, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', color: checklist.s9_accounts ? '#059669' : 'var(--text-secondary)' }}>
                <input type="checkbox" checked={checklist.s9_accounts} onChange={() => toggleCheck('s9_accounts')} />
                Suppliers &amp; Bank/Cash Opening Balances set in PO &amp; Ledger
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => navigate('/costing')} style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
                  🛡️ Check Costing Health
                </button>
                <button type="button" onClick={() => navigate('/po-ledger')} style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
                  📒 Open PO &amp; Ledger
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* TAB 2: 1-CLICK PRIMARY ACTIONS HUB                                 */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'actions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>
                  ⚡ Primary Control Actions — {activeStore?.store_name || activeStore?.shop_domain || 'No Store Selected'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  Run any critical onboarding, sync, webhook, or diagnostic action on the currently selected store in 1 click.
                </div>
              </div>
              {activeStore && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11 }}>
                  <span style={{ padding: '3px 8px', borderRadius: 99, fontWeight: 700, background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                    {activeStore.shop_domain}
                  </span>
                  <span style={{ padding: '3px 8px', borderRadius: 99, fontWeight: 700, background: activeStore.postex_token ? 'rgba(16,185,129,0.11)' : 'rgba(245,158,11,0.12)', color: activeStore.postex_token ? '#047857' : '#b45309' }}>
                    PostEx: {activeStore.postex_token ? 'Configured' : 'Not Set'}
                  </span>
                  <span style={{ padding: '3px 8px', borderRadius: 99, fontWeight: 700, background: activeStore.instaworld_key ? 'rgba(16,185,129,0.11)' : 'rgba(245,158,11,0.12)', color: activeStore.instaworld_key ? '#047857' : '#b45309' }}>
                    Instaworld: {activeStore.instaworld_key ? 'Configured' : 'Not Set'}
                  </span>
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
              {[
                {
                  icon: '⚡',
                  title: 'Register All 10 Webhooks',
                  desc: 'Installs orders/*, fulfillments/* & products/* webhooks pointing to this ERP.',
                  btn: busyKey === 'webhooks' ? '⏳ Working...' : 'Run Now',
                  onClick: runRegisterWebhooks,
                  busy: busyKey === 'webhooks',
                  accent: '#2563eb',
                },
                {
                  icon: '🔄',
                  title: 'Sync Shopify Catalog & States',
                  desc: 'Pulls Available, Committed, On Hand, Incoming, SKU & Prices (unpushed ERP stock stays shielded).',
                  btn: busyKey === 'syncCatalog' ? '⏳ Syncing...' : 'Sync Now',
                  onClick: runSyncCatalog,
                  busy: busyKey === 'syncCatalog',
                  accent: '#059669',
                },
                {
                  icon: '🔬',
                  title: 'Diagnose Shopify API & Scopes',
                  desc: 'Verifies token validity, REST/GraphQL access, variant count & unitCost permission.',
                  btn: busyKey === 'diagnose' ? '⏳ Testing...' : 'Run Diagnose',
                  onClick: runDiagnoseShopify,
                  busy: busyKey === 'diagnose',
                  accent: '#c2410c',
                },
                {
                  icon: '📦',
                  title: 'Create 1-Click Baseline PO',
                  desc: 'Initializes PO-INITIAL-BASELINE from stocked SKUs (Payable = Rs. 0) for FIFO tracking.',
                  btn: busyKey === 'baseline' ? '⏳ Creating...' : 'Initialize Baseline',
                  onClick: runBaselinePo,
                  busy: busyKey === 'baseline',
                  accent: '#7c3aed',
                },
                {
                  icon: '🔌',
                  title: 'Add / Edit Store & Courier Keys',
                  desc: 'Connect new Shopify OAuth store, update PostEx/Instaworld keys, or trigger Deep Order Sync.',
                  btn: 'Open Connect Store',
                  onClick: () => navigate('/connect'),
                  busy: false,
                  accent: '#475569',
                },
                {
                  icon: '📒',
                  title: 'PO, Recount & Warehouse Stock',
                  desc: 'Create Purchase Orders, Physical Recounts, Push Exact On-Hand to Shopify, and manage Khata.',
                  btn: 'Open PO & Ledger',
                  onClick: () => navigate('/po-ledger'),
                  busy: false,
                  accent: '#0f766e',
                },
              ].map(act => (
                <div key={act.title} style={{
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12,
                  padding: '13px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 10,
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{act.icon} {act.title}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.45 }}>{act.desc}</div>
                  </div>
                  <button
                    type="button"
                    disabled={act.busy}
                    onClick={act.onClick}
                    style={{
                      padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                      background: act.accent, color: '#fff', fontSize: 12, fontWeight: 700,
                      opacity: act.busy ? 0.65 : 1,
                    }}
                  >
                    {act.btn}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {diagnoseResult && (
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: diagnoseResult.passed ? '#059669' : '#c2410c' }}>
                  🔬 Shopify API Diagnostics — {diagnoseResult.passed ? 'All Checks Passed ✅' : 'Attention Needed ⚠️'}
                </div>
                <button type="button" onClick={() => setDiagnoseResult(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 700 }}>✕</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(diagnoseResult.steps || []).map((st, idx) => (
                  <div key={idx} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 9, padding: '9px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5, fontWeight: 700 }}>
                      <span style={{ color: 'var(--text-primary)' }}>{st.step}</span>
                      <span style={{ color: String(st.status).includes('✅') ? '#059669' : '#c2410c' }}>{st.status}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 3 }}>{st.detail}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* TAB 3: HOW TO USE TRACE ERP (DAILY OPERATIONS PLAYBOOK)            */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'playbook' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
          {[
            {
              icon: '🔍',
              title: '1. Orders & Dispatch (Command Center)',
              route: '/search',
              btn: 'Open Command Center',
              bullets: [
                'Search any order by #ref, phone, name, tracking, or comma-separated bulk refs (#1001, #1002).',
                'Single or Bulk Book via PostEx / Instaworld — automatically fulfills on Shopify & deducts oldest FIFO PO batch.',
                'Cancelling a booking (from ERP or Chrome Extension) resets status to Pending and auto-restores FIFO batch stock.',
                'Double-click (or mobile double-tap) ANY cell/badge anywhere in ERP to copy text instantly.',
              ],
            },
            {
              icon: '📒',
              title: '2. Purchasing, Recount & Stock Boss (PO & Ledger)',
              route: '/po-ledger',
              btn: 'Open PO & Ledger',
              bullets: [
                'New Purchase Order (+Add Stock): Adds incoming factory stock on top of existing shelf qty & bills Supplier Khata.',
                'Physical Recount (Set Exact On-Hand): Leave Supplier blank for already-paid stock, pre-fills On Hand, sets exact Shopify On-Hand (Committed orders stay safe).',
                'ERP Only + 🚀 Push Workflow: Uncheck Push while drafting/recounting, review calmly, then click 🚀 Push (double-push safe!).',
                'Unpushed ERP Stock Shield: 6-hour background cron never overwrites unpushed ERP stock — only refreshes live Committed.',
                'Click any amber Committed badge (parent or variant) to see exact orders & click View All to open them in Command Center.',
              ],
            },
            {
              icon: '🛡️',
              title: '3. Zero-Leak Product Costing (Costing & Watchdog)',
              route: '/costing',
              btn: 'Open Costing & Watchdog',
              bullets: [
                'Unit cost is PO/FIFO-driven (oldest open PO batch first); packaging cost can be edited inline or bulk per product.',
                'Watchdog flags 3 risks: Missing Mapping, Rs. 0 Costs, and At-Risk Orders with Rs. 0 CGS.',
                'Use Ghosts / Aliases tab to link legacy or renamed Shopify line items to verified Master SKUs.',
                'Health Score shows real SKU cost coverage percentage across your active catalog.',
              ],
            },
            {
              icon: '↩️',
              title: '4. Returns & Restock (Unified Returns)',
              route: '/returns',
              btn: 'Open Unified Returns',
              bullets: [
                'Courier statuses map to 7 Core ERP statuses — "Return Received" (Restock) is strictly MANUAL after physical verification.',
                'Scanning Return Received restores good units back into FIFO batch, ERP On-Hand, and Shopify inventory.',
                'Supports both Full RTO and Partial / Exchange Item-Only restocks.',
              ],
            },
            {
              icon: '💸',
              title: '5. Payouts, Expenses & Profit/Loss',
              route: '/reports',
              btn: 'Open Profit & Loss',
              bullets: [
                'Upload PostEx / Instaworld CPR sheets in Payout Reconciler — auto-updates order paid amounts, Shopify notes & deposits cash into Bank Ledger.',
                '0.9 PKR variance rule flags any underpaid or overpaid delivered order under Unpaid Payouts.',
                'Manual Expenses auto-post to Cash/Bank Ledger; Daily & Month Vise PNL track Final PNL, Actual Cash PNL & 24h deltas.',
              ],
            },
            {
              icon: '🧠',
              title: '6. Shipper Advice & WhatsApp Recovery',
              route: '/advice',
              btn: 'Open Shipper Advice',
              bullets: [
                'Track live multi-courier timelines (PostEx, Instaworld, Leopards, TCS, Trax) and submit re-attempt / return advice.',
                'Use Abandoned Checkouts & WA Templates to recover uncompleted carts with pre-filled dynamic placeholders.',
              ],
            },
          ].map(card => (
            <div key={card.title} style={{ ...cardStyle, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>
                  {card.icon} {card.title}
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {card.bullets.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => navigate(card.route)}
                  style={{
                    padding: '6.5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    background: 'rgba(37,99,235,0.10)', color: '#1d4ed8', border: '1px solid rgba(37,99,235,0.30)',
                  }}
                >
                  {card.btn} →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* TAB 4: WEBHOOKS & COPY-PASTE REFERENCE VAULT                       */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'reference' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={cardStyle}>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 10 }}>
              🔗 Core Endpoints (1-Click Copy)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
              <CopyBox label="ERP Production Base URL" value={appOrigin} onCopy={copyText} />
              <CopyBox label="Shopify OAuth Callback URL" value={callbackUrl} onCopy={copyText} />
              <CopyBox label="Shopify Webhook Receiver URL" value={webhookUrl} onCopy={copyText} />
              <CopyBox label="Public Tracking URL Format" value={`${appOrigin}/track/<tracking_slug>`} onCopy={copyText} />
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text-primary)' }}>
                  📬 Official 10 Registered Shopify Webhooks
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  All 10 topics point to <code>{webhookUrl}</code> · API version <code>2024-10</code>.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: 11, fontWeight: 800, padding: '4px 9px', borderRadius: 99,
                  background: 'rgba(16,185,129,0.11)', color: '#047857', border: '1px solid rgba(16,185,129,0.32)',
                }}>
                  🛡️ inventory_levels/update OFF (ERP = Inventory Boss)
                </span>
                <button
                  type="button"
                  disabled={busyKey === 'webhooks'}
                  onClick={runRegisterWebhooks}
                  style={{
                    padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: '#2563eb', color: '#fff', fontSize: 12, fontWeight: 700,
                  }}
                >
                  {busyKey === 'webhooks' ? '⏳ Registering...' : '⚡ Register All 10 Now'}
                </button>
              </div>
            </div>

            <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                    <th style={{ padding: '8px 12px', fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Topic</th>
                    <th style={{ padding: '8px 10px', fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Category</th>
                    <th style={{ padding: '8px 12px', fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase' }}>What ERP Does Automatically</th>
                  </tr>
                </thead>
                <tbody>
                  {OFFICIAL_WEBHOOKS.map(w => (
                    <tr key={w.topic} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontWeight: 700, color: '#1d4ed8', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          onClick={() => copyText(w.topic, w.topic)}
                          style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer' }}
                          title="Click to copy topic"
                        >
                          {w.topic}
                        </button>
                      </td>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{w.category}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-primary)' }}>{w.effect}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>
              🛠️ Quick Troubleshooting Cheat-Sheet
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 9, fontSize: 12 }}>
              {[
                { q: '401 / 403 Unauthorized on Sync or Push', a: 'App was uninstalled or missing write_inventory / write_products scope. Update scopes in Shopify App and re-authorize in Connect Store.' },
                { q: '0 Variants Returned on Catalog Sync', a: 'Verify read_products & read_inventory scopes are enabled and products are Active (not Archived).' },
                { q: 'Committed shows 0 after attaching store', a: 'Click "🔄 Sync Shopify Catalog" once after connecting — subsequent orders update Committed live via webhooks.' },
                { q: 'Webhook registration returns 422', a: '422 means the webhook is already registered on Shopify — ERP treats it as success automatically.' },
              ].map(t => (
                <div key={t.q} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 9, padding: '10px 12px' }}>
                  <div style={{ fontWeight: 800, color: '#b45309', marginBottom: 4 }}>{t.q}</div>
                  <div style={{ color: 'var(--text-secondary)', lineHeight: 1.45 }}>{t.a}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
