import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import AddStoreModal from '../components/Connect/AddStoreModal'
import StoreDetailWorkspace from '../components/Connect/StoreDetailWorkspace'

const FROZEN_DOMAIN = '1i7tnb-bb.myshopify.com'

export default function Connect() {
  const { stores, setStores, activeStoreId, setActiveStoreId, addToast } = useApp()
  const navigate = useNavigate()

  const [allStores, setAllStores] = useState([])
  const [loadingFleet, setLoadingFleet] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [search, setSearch] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [disconnectingStore, setDisconnectingStore] = useState(null)
  const [confirmInput, setConfirmInput] = useState('')

  const refreshStores = async (silent = false, focusStoreId = null) => {
    try {
      const res = await fetch('/api/stores')
      const data = await res.json()
      const list = Array.isArray(data) ? data : []
      setAllStores(list)

      const connected = list.filter(s => s.is_connected)
      setStores(connected)

      // Keep global activeStoreId intact if it still exists
      if (connected.length > 0 && !connected.some(s => String(s.id) === String(activeStoreId))) {
        setActiveStoreId(connected[0].id)
      }

      if (focusStoreId) {
        setSelectedId(focusStoreId)
      } else if (!selectedId || !list.some(s => String(s.id) === String(selectedId))) {
        const preferred = list.find(s => String(s.id) === String(activeStoreId)) || connected[0] || list[0]
        if (preferred) setSelectedId(preferred.id)
      }

      if (!silent) addToast('✅ Store fleet refreshed!', 'success', 2200)
    } catch {
      if (!silent) addToast('Failed to refresh stores', 'error')
    }
    setLoadingFleet(false)
  }

  useEffect(() => {
    refreshStores(true)
  }, [])

  // Poll automatically while any store is actively running historical sync
  useEffect(() => {
    const anySyncing = allStores.some(s => s.sync_status === 'syncing')
    if (anySyncing) {
      const timer = setInterval(() => refreshStores(true), 2500)
      return () => clearInterval(timer)
    }
  }, [allStores])

  const connectedStores = useMemo(() => allStores.filter(s => s.is_connected), [allStores])
  const pendingStores = useMemo(() => allStores.filter(s => !s.is_connected), [allStores])

  const filteredConnected = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return connectedStores
    return connectedStores.filter(s =>
      (s.store_name || '').toLowerCase().includes(q) ||
      (s.shop_domain || '').toLowerCase().includes(q)
    )
  }, [connectedStores, search])

  const selectedStore = useMemo(
    () => allStores.find(s => String(s.id) === String(selectedId)) || connectedStores[0] || allStores[0] || null,
    [allStores, connectedStores, selectedId]
  )

  const fleetStats = useMemo(() => {
    const totalOrders = connectedStores.reduce((sum, s) => sum + (Number(s.orders_count) || 0), 0)
    const courierReady = connectedStores.filter(s => s.postex_token || s.instaworld_key).length
    const gmapsReady = connectedStores.filter(s => s.google_maps_key).length
    const syncingCount = allStores.filter(s => s.sync_status === 'syncing').length
    return { totalOrders, courierReady, gmapsReady, syncingCount }
  }, [connectedStores, allStores])

  const handleConfirmDelete = async () => {
    if (!disconnectingStore) return
    try {
      const res = await fetch(`/api/stores/${disconnectingStore.id}`, { method: 'DELETE' })
      if (res.ok) {
        addToast(`Store "${disconnectingStore.name}" disconnected`, 'info')
        setDisconnectingStore(null)
        setConfirmInput('')
        setSelectedId(null)
        await refreshStores(true)
      } else {
        addToast('Failed to disconnect store', 'error')
      }
    } catch {
      addToast('Network error', 'error')
    }
  }

  return (
    <div style={{ maxWidth: 1440, width: '100%', margin: '0 auto', paddingBottom: 32 }}>
      {/* ─── Page Header ─── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 14, marginBottom: 20
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 46, height: 46, borderRadius: 14,
            background: 'linear-gradient(135deg, rgba(99,102,241,0.16), rgba(168,85,247,0.16))',
            border: '1px solid rgba(99,102,241,0.28)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.35rem', flexShrink: 0
          }}>🔌</div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Store Hub &amp; Integrations
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Manage Shopify connections, live API health, webhooks, couriers &amp; sync pipelines
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => navigate('/setup-guide?tab=extension')}
            style={{
              padding: '9px 14px', borderRadius: 10, cursor: 'pointer',
              background: 'rgba(16,185,129,0.09)', border: '1px solid rgba(16,185,129,0.3)',
              color: '#047857', fontSize: '0.8rem', fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', gap: 6
            }}
          >🧩 Extension ZIP</button>

          <button
            type="button"
            onClick={() => navigate('/setup-guide')}
            style={{
              padding: '9px 14px', borderRadius: 10, cursor: 'pointer',
              background: 'rgba(37,99,235,0.09)', border: '1px solid rgba(37,99,235,0.28)',
              color: '#1d4ed8', fontSize: '0.8rem', fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', gap: 6
            }}
          >📖 Setup &amp; Theme Guide</button>

          <button
            type="button"
            onClick={() => refreshStores(false)}
            style={{
              padding: '9px 14px', borderRadius: 10, cursor: 'pointer',
              background: 'var(--bg-surface)', border: '1px solid var(--border-bright)',
              color: 'var(--text-primary)', fontSize: '0.8rem', fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', gap: 6
            }}
          >🔄 Refresh Fleet</button>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            style={{
              padding: '9px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              color: '#fff', fontSize: '0.82rem', fontWeight: 800,
              boxShadow: '0 4px 14px rgba(99,102,241,0.32)',
              display: 'inline-flex', alignItems: 'center', gap: 6
            }}
          >➕ Connect New Store</button>
        </div>
      </div>

      {/* ─── Fleet KPI Strip ─── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 12, marginBottom: 20
      }}>
        <FleetKpi
          icon="🏪"
          label="Connected Stores"
          value={`${connectedStores.length} Active`}
          sub={pendingStores.length > 0 ? `${pendingStores.length} pending OAuth` : 'All authorized'}
          accent="#6366f1"
        />
        <FleetKpi
          icon="📦"
          label="Fleet Orders Synced"
          value={fleetStats.totalOrders.toLocaleString()}
          sub={fleetStats.syncingCount > 0 ? `📡 ${fleetStats.syncingCount} syncing live` : 'Real-time webhooks ready'}
          accent="#10b981"
        />
        <FleetKpi
          icon="🚚"
          label="Courier Keys Ready"
          value={`${fleetStats.courierReady} / ${connectedStores.length}`}
          sub={`PostEx · Instaworld · Maps: ${fleetStats.gmapsReady}/${connectedStores.length}`}
          accent="#f59e0b"
        />
        <FleetKpi
          icon="🛡️"
          label="Inventory Authority"
          value="ERP Boss Mode"
          sub="inventory_levels/update OFF · Safe"
          accent="#0ea5e9"
        />
      </div>

      {/* ─── Master-Detail Workspace ─── */}
      {loadingFleet ? (
        <div style={{
          padding: 48, textAlign: 'center', borderRadius: 16,
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          color: 'var(--text-muted)', fontWeight: 600
        }}>Loading connected stores...</div>
      ) : allStores.length === 0 ? (
        <div style={{
          padding: '56px 24px', textAlign: 'center', borderRadius: 18,
          background: 'var(--bg-surface)', border: '1px dashed var(--border-bright)'
        }}>
          <div style={{ fontSize: '2.4rem', marginBottom: 10 }}>🏪</div>
          <h3 style={{ margin: '0 0 6px', fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            No Shopify Stores Connected Yet
          </h3>
          <p style={{ margin: '0 auto 20px', maxWidth: 460, fontSize: '0.84rem', color: 'var(--text-muted)' }}>
            Connect your first Shopify store using Partner OAuth or a Direct Custom App Token to unlock orders, PNL, inventory, and multi-store theme sync.
          </p>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            style={{
              padding: '11px 22px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff',
              fontWeight: 800, fontSize: '0.88rem', boxShadow: '0 4px 16px rgba(99,102,241,0.32)'
            }}
          >➕ Connect First Shopify Store</button>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
          gap: 18,
          alignItems: 'start'
        }}>
          {/* Custom responsive two-column wrapper using inline CSS media feel via grid template override */}
          <style>{`
            @media (min-width: 980px) {
              .connect-master-grid {
                grid-template-columns: 310px minmax(0, 1fr) !important;
              }
            }
          `}</style>
          <div className="connect-master-grid" style={{
            gridColumn: '1 / -1',
            display: 'grid',
            gridTemplateColumns: '1fr',
            gap: 18,
            alignItems: 'start'
          }}>
            {/* ─── Left Fleet Sidebar ─── */}
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              boxShadow: '0 2px 12px rgba(15,23,42,0.04)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 4px' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Store Fleet ({connectedStores.length})
                </span>
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  style={{
                    padding: '3px 9px', borderRadius: 7, border: '1px solid rgba(99,102,241,0.3)',
                    background: 'rgba(99,102,241,0.08)', color: '#4f46e5',
                    fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer'
                  }}
                >+ Add</button>
              </div>

              {connectedStores.length > 3 && (
                <input
                  className="form-input"
                  placeholder="🔍 Filter stores..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ height: 34, fontSize: '0.78rem' }}
                />
              )}

              {/* Connected Stores List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredConnected.map(st => {
                  const isSelected = selectedStore && String(selectedStore.id) === String(st.id)
                  const isActive = String(activeStoreId) === String(st.id)
                  const isFrozen = (st.shop_domain || '').toLowerCase().includes(FROZEN_DOMAIN)
                  const isSync = st.sync_status === 'syncing'
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setSelectedId(st.id)}
                      style={{
                        textAlign: 'left', padding: '12px 13px', borderRadius: 12, cursor: 'pointer',
                        border: isSelected ? '1.5px solid #6366f1' : '1px solid var(--border)',
                        background: isSelected ? 'rgba(99,102,241,0.07)' : 'var(--bg-elevated)',
                        transition: 'all 0.15s', width: '100%'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                        <div style={{ fontWeight: 800, fontSize: '0.86rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {st.store_name || st.shop_domain}
                        </div>
                        <span style={{
                          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                          background: isSync ? '#6366f1' : (isFrozen ? '#64748b' : '#10b981')
                        }} />
                      </div>
                      <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {st.shop_domain}
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                        <span style={railChipStyle}>📦 {(st.orders_count || 0).toLocaleString()}</span>
                        {isActive && <span style={{ ...railChipStyle, background: 'rgba(16,185,129,0.14)', color: '#059669' }}>Active</span>}
                        {isFrozen && <span style={{ ...railChipStyle, background: 'rgba(59,130,246,0.14)', color: '#2563eb' }}>❄️ Frozen</span>}
                        {st.postex_token && <span style={railChipStyle}>PostEx</span>}
                        {st.instaworld_key && <span style={railChipStyle}>Insta</span>}
                        {st.leopards_token && <span style={railChipStyle}>LCS</span>}
                        {st.tcs_token && <span style={railChipStyle}>TCS</span>}
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Pending OAuth Stores (Previously hidden!) */}
              {pendingStores.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 4 }}>
                  <div style={{ fontSize: '0.69rem', fontWeight: 800, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, padding: '0 4px' }}>
                    ⏳ Pending OAuth ({pendingStores.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {pendingStores.map(st => {
                      const isSelected = selectedStore && String(selectedStore.id) === String(st.id)
                      return (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => setSelectedId(st.id)}
                          style={{
                            textAlign: 'left', padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                            border: isSelected ? '1.5px solid #d97706' : '1px dashed rgba(245,158,11,0.45)',
                            background: 'rgba(245,158,11,0.06)', width: '100%'
                          }}
                        >
                          <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                            {st.store_name || st.shop_domain}
                          </div>
                          <div className="font-mono" style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>
                            {st.shop_domain} · Click to resume
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ─── Right Control Center ─── */}
            {selectedStore && (
              <StoreDetailWorkspace
                store={selectedStore}
                isActiveWorkspace={String(activeStoreId) === String(selectedStore.id)}
                onSetActiveWorkspace={() => {
                  setActiveStoreId(selectedStore.id)
                  localStorage.setItem('activeStoreId', String(selectedStore.id))
                  addToast(`🎯 Switched ERP workspace to ${selectedStore.store_name || selectedStore.shop_domain}`, 'success')
                }}
                onRefreshFleet={(silent) => refreshStores(silent)}
                onDisconnect={() => {
                  setDisconnectingStore({ id: selectedStore.id, name: selectedStore.store_name || selectedStore.shop_domain })
                  setConfirmInput('')
                }}
                onOpenGuide={() => navigate('/setup-guide')}
                addToast={addToast}
              />
            )}
          </div>
        </div>
      )}

      {/* ─── Connect New Store Modal ─── */}
      {showAddModal && (
        <AddStoreModal
          onClose={() => setShowAddModal(false)}
          onConnected={({ storeId }) => refreshStores(true, storeId)}
          onOpenGuide={() => navigate('/setup-guide')}
          addToast={addToast}
        />
      )}

      {/* ─── Safety Double-Confirmation Disconnect Modal ─── */}
      {disconnectingStore && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) { setDisconnectingStore(null); setConfirmInput('') } }}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20
          }}
        >
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid rgba(239,68,68,0.4)',
            borderRadius: 18, padding: 26, maxWidth: 440, width: '100%',
            boxShadow: '0 20px 50px rgba(0,0,0,0.45)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: '1.5rem' }}>🚨</span>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: '#dc2626' }}>Disconnect Store</h3>
            </div>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: 16 }}>
              Are you sure you want to disconnect <strong>"{disconnectingStore.name}"</strong>? This removes the store credentials and connection from TRACE ERP.
            </p>
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                Type <strong>"{disconnectingStore.name}"</strong> to confirm:
              </label>
              <input
                className="form-input"
                placeholder={disconnectingStore.name}
                value={confirmInput}
                onChange={e => setConfirmInput(e.target.value)}
                style={{ borderColor: confirmInput === disconnectingStore.name ? '#dc2626' : 'var(--border)' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => { setDisconnectingStore(null); setConfirmInput('') }}
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: 10,
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                  color: 'var(--text-secondary)', fontWeight: 700, cursor: 'pointer'
                }}
              >Cancel</button>
              <button
                type="button"
                disabled={confirmInput !== disconnectingStore.name}
                onClick={handleConfirmDelete}
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: 10, border: 'none',
                  background: confirmInput === disconnectingStore.name ? '#dc2626' : 'var(--bg-elevated)',
                  color: confirmInput === disconnectingStore.name ? '#fff' : 'var(--text-muted)',
                  fontWeight: 800, cursor: confirmInput === disconnectingStore.name ? 'pointer' : 'not-allowed',
                  opacity: confirmInput === disconnectingStore.name ? 1 : 0.5
                }}
              >⚠️ Confirm Disconnect</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FleetKpi({ icon, label, value, sub, accent }) {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 14,
      padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: 12,
      boxShadow: '0 2px 10px rgba(15,23,42,0.03)'
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 11, flexShrink: 0,
        background: `${accent}15`, border: `1px solid ${accent}33`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.15rem'
      }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </div>
        <div style={{ fontSize: '1.08rem', fontWeight: 900, color: 'var(--text-primary)', marginTop: 1 }}>{value}</div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>
      </div>
    </div>
  )
}

const railChipStyle = {
  fontSize: '0.64rem',
  fontWeight: 700,
  padding: '2px 7px',
  borderRadius: 6,
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  color: 'var(--text-secondary)',
}
