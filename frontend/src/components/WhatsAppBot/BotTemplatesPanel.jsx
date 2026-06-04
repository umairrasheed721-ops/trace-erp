import React from 'react'

export default function BotTemplatesPanel({
  activeSubTabG,
  setActiveSubTabG,
  geminiSettings,
  setGeminiSettings,
  saving,
  handleSaveGeminiSettings,
  simPhone,
  setSimPhone,
  simMsg,
  setSimMsg,
  simLoading,
  handleSimulateIncoming,
  simReply,
  geminiProfiles,
  handleFetchMemory,
  showMemoryModal,
  setShowMemoryModal,
  selectedCustomerPhone,
  loadingMemory,
  customerMemory,
  geminiAuditLogs,
  triggeringAudit,
  handleTriggerAudit,
  geminiUsage,
  resetLocks,
  handleResetLocks
}) {
  return (
    <div className="card glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: 24, animation: 'fadeIn 0.3s ease-in-out' }}>
      {/* Sub-Tabs Navigation */}
      <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid #334155', paddingBottom: 16, overflowX: 'auto' }}>
        {[
          { id: 'studio', label: '🤖 Gemini AI Studio & Prompts' },
          { id: 'profiles', label: '🗂️ Customer Profiles & Memory' },
          { id: 'tools', label: '🛠️ Tool Calling & Capabilities' },
          { id: 'audit', label: '🌙 Nightly Self-Learning Audit' },
          { id: 'usage', label: '📊 Usage & Quota' },
        ].map(sub => (
          <button
            key={sub.id}
            onClick={() => setActiveSubTabG(sub.id)}
            style={{
              padding: '10px 20px',
              borderRadius: 12,
              background: activeSubTabG === sub.id ? '#6366f1' : 'transparent',
              color: activeSubTabG === sub.id ? '#fff' : '#64748b',
              fontWeight: 700,
              fontSize: '0.85rem',
              border: activeSubTabG === sub.id ? '1px solid #4f46e5' : '1px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap'
            }}
          >
            {sub.label}
          </button>
        ))}
      </div>

      {/* Sub-Tab G1: Gemini AI Studio & Prompts */}
      {activeSubTabG === 'studio' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, background: 'var(--bg-active)', padding: 24, borderRadius: 20, border: '1px solid var(--border)' }}>
            <div>
              <h4 style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 4 }}>🤖 Gemini 1.5 Autonomous Orchestration Studio</h4>
              <p className="text-muted" style={{ fontSize: '0.85rem' }}>Empower your WhatsApp bot with advanced RAG memory, multi-turn dialogue, and dynamic tool execution.</p>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 12, fontWeight: 800, cursor: 'pointer', fontSize: '1rem', background: geminiSettings.ai_active === 1 ? 'var(--green-dim)' : 'var(--red-dim)', color: geminiSettings.ai_active === 1 ? 'var(--green)' : 'var(--red)', padding: '10px 20px', borderRadius: 30, border: `1px solid ${geminiSettings.ai_active === 1 ? 'var(--green)' : 'var(--red)'}` }}>
                <input 
                  type="checkbox" 
                  checked={geminiSettings.ai_active === 1}
                  onChange={e => setGeminiSettings({ ...geminiSettings, ai_active: e.target.checked ? 1 : 0 })}
                  style={{ width: 22, height: 22, accentColor: geminiSettings.ai_active === 1 ? 'var(--green)' : 'var(--red)' }}
                />
                <span>{geminiSettings.ai_active === 1 ? '🟢 GEMINI AUTONOMOUS AI ACTIVE' : '🔴 GEMINI AI DISABLED'}</span>
              </label>
              <button 
                className="btn btn-primary"
                disabled={saving}
                onClick={handleSaveGeminiSettings}
                style={{ padding: '10px 24px', fontWeight: 700, borderRadius: 30 }}
              >
                {saving ? '⌛ Saving...' : '💾 Save Gemini Settings'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="form-group" style={{ background: 'var(--bg-active)', padding: 24, borderRadius: 20, border: '1px solid var(--border)' }}>
              <label style={{ fontWeight: 800, marginBottom: 12, display: 'block', fontSize: '0.95rem' }}>🔑 Google Gemini API Key</label>
              <input 
                type="password" 
                className="premium-input w-full" 
                value={geminiSettings.api_key}
                onChange={e => setGeminiSettings({ ...geminiSettings, api_key: e.target.value })}
                placeholder="AIzaSy..."
                style={{ fontSize: '0.95rem', padding: '12px 16px' }}
              />
              <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 8 }}>Required to enable Gemini 2.5 Flash/Pro orchestration and Function Calling.</p>
            </div>

            <div className="form-group" style={{ background: 'var(--bg-active)', padding: 24, borderRadius: 20, border: '1px solid var(--border)' }}>
              <label style={{ fontWeight: 800, marginBottom: 12, display: 'block', fontSize: '0.95rem' }}>🧠 Gemini Model Architecture</label>
              <select 
                className="premium-input w-full"
                value={geminiSettings.model_name}
                onChange={e => setGeminiSettings({ ...geminiSettings, model_name: e.target.value })}
                style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '0.95rem', padding: '12px 16px' }}
              >
                <option value="gemini-2.5-flash">⚡ Gemini 2.5 Flash (Ultra-Fast Chat & Tool Use)</option>
                <option value="gemini-2.5-pro">🧠 Gemini 2.5 Pro (Advanced Reasoning & Deep RAG)</option>
              </select>
              <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 8 }}>Flash is recommended for real-time WhatsApp speed. Pro is ideal for complex enterprise analysis.</p>
            </div>
          </div>

          <div className="form-group" style={{ background: 'var(--bg-active)', padding: 24, borderRadius: 20, border: '1px solid var(--border)' }}>
            <label style={{ fontWeight: 800, marginBottom: 12, display: 'block', fontSize: '0.95rem' }}>📝 Master System Prompt & AI Persona</label>
            <textarea 
              className="premium-input" 
              rows={8} 
              value={geminiSettings.system_prompt}
              onChange={e => setGeminiSettings({ ...geminiSettings, system_prompt: e.target.value })}
              placeholder="You are TRACE AI, the elite customer success concierge..."
              style={{ fontSize: '0.95rem', padding: 16, lineHeight: 1.6 }}
            />
            <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 8 }}>Defines the bot's tone, language capabilities (Urdu/English), and operational boundaries.</p>
          </div>

          {/* --- 🧪 DIRECT AI SIMULATION & DIAGNOSTIC SANDBOX --- */}
          <div style={{ background: 'var(--bg-active)', padding: 28, borderRadius: 20, border: '1px solid #6366f1', display: 'flex', flexDirection: 'column', gap: 20, boxShadow: '0 10px 25px -5px rgba(99, 102, 241, 0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: '1.8rem' }}>🧪</div>
              <div>
                <h5 style={{ fontWeight: 800, fontSize: '1.1rem', margin: 0, color: '#fff' }}>Direct AI Simulation & Diagnostic Sandbox</h5>
                <p className="text-muted" style={{ fontSize: '0.85rem', margin: 0 }}>Simulate incoming customer messages to instantly test Gemini's Tool Calling (`getOrderStatus`, `checkProductStock`) and RAG memory without a real phone.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="form-group">
                <label style={{ fontWeight: 800, marginBottom: 8, display: 'block', fontSize: '0.85rem' }}>📱 Simulated Customer Phone</label>
                <input 
                  type="text" 
                  className="premium-input w-full" 
                  value={simPhone}
                  onChange={e => setSimPhone(e.target.value)}
                  placeholder="923001234567"
                  style={{ fontSize: '0.9rem', padding: '10px 14px' }}
                />
              </div>
              <div className="form-group md:col-span-2">
                <label style={{ fontWeight: 800, marginBottom: 8, display: 'block', fontSize: '0.85rem' }}>💬 Simulated Incoming Message</label>
                <div style={{ display: 'flex', gap: 12 }}>
                  <input 
                    type="text" 
                    className="premium-input w-full" 
                    value={simMsg}
                    onChange={e => setSimMsg(e.target.value)}
                    placeholder="Mera parcel kahan hai?"
                    style={{ fontSize: '0.9rem', padding: '10px 14px' }}
                  />
                  <button 
                    className="btn btn-primary"
                    disabled={simLoading}
                    onClick={handleSimulateIncoming}
                    style={{ padding: '10px 24px', fontWeight: 800, whiteSpace: 'nowrap', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    {simLoading ? '⌛ Simulating...' : '🚀 Simulate AI Reply'}
                  </button>
                </div>
              </div>
            </div>

            {simReply && (
              <div style={{ background: '#0f172a', padding: 20, borderRadius: 16, borderLeft: '4px solid var(--green)', display: 'flex', flexDirection: 'column', gap: 8, animation: 'fadeIn 0.3s' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: 1 }}>
                  🤖 Gemini AI Simulated Response:
                </div>
                <div style={{ fontSize: '0.95rem', color: '#f8fafc', whiteSpace: 'pre-wrap', lineHeight: 1.6, fontWeight: 500 }}>
                  {simReply}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sub-Tab G2: Customer Profiles & Memory */}
      {activeSubTabG === 'profiles' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <h4 style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 4 }}>🗂️ Enriched Customer Profiles & Conversational Memory</h4>
            <p className="text-muted" style={{ fontSize: '0.85rem' }}>Inspect long-term preferences, sizing traits, and multi-turn chat history extracted autonomously by Gemini. Click <strong>View Memory</strong> on any customer to open their conversation history.</p>
          </div>

          {/* Full-width Customer Profiles Table */}
          <div style={{ overflowX: 'auto', background: 'var(--bg-active)', borderRadius: 20, border: '1px solid var(--border)' }}>
            <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
              <thead style={{ background: 'var(--bg-header)', position: 'sticky', top: 0, zIndex: 10 }}>
                <tr>
                  <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 800, whiteSpace: 'nowrap' }}>Phone</th>
                  <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 800, whiteSpace: 'nowrap' }}>Customer Name</th>
                  <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 800 }}>Extracted Preferences</th>
                  <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 800, whiteSpace: 'nowrap' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {geminiProfiles.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: 40, textAlign: 'center', opacity: 0.5 }}>No customer profiles found yet. Profiles are built as customers chat with the bot.</td>
                  </tr>
                ) : geminiProfiles.map((p, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-dim)', transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-header)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    <td style={{ padding: '14px 20px', fontWeight: 800, whiteSpace: 'nowrap' }}>+{p.phone}</td>
                    <td style={{ padding: '14px 20px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {p.customer_name || 'Customer'}
                      {p.vip_status === 1 && <span style={{ marginLeft: 8, background: 'var(--orange-dim)', color: 'var(--orange)', padding: '2px 8px', borderRadius: 10, fontSize: '0.7rem', fontWeight: 800 }}>👑 VIP</span>}
                    </td>
                    <td style={{ padding: '14px 20px', opacity: 0.8, fontFamily: 'monospace', fontSize: '0.8rem', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.preferences}</td>
                    <td style={{ padding: '14px 20px' }}>
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleFetchMemory(p.phone)}
                        style={{ padding: '6px 16px', fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}
                      >
                        🔍 View Memory
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Memory Modal Overlay */}
      {showMemoryModal && (
        <div
          onClick={() => setShowMemoryModal(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-card)', borderRadius: 24, border: '1px solid var(--border)',
              width: '100%', maxWidth: 680, maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
              boxShadow: '0 32px 80px rgba(0,0,0,0.6)'
            }}
          >
            {/* Modal Header */}
            <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-header)', flexShrink: 0 }}>
              <div>
                <h3 style={{ fontWeight: 800, fontSize: '1.1rem', margin: 0 }}>🧠 Gemini Chat Memory</h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', opacity: 0.6 }}>+{selectedCustomerPhone} • Last 50 messages</p>
              </div>
              <button
                onClick={() => setShowMemoryModal(false)}
                style={{ background: 'var(--bg-active)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 10, padding: '6px 14px', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}
              >
                ✕ Close
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {loadingMemory ? (
                <div style={{ textAlign: 'center', padding: 60, opacity: 0.5 }}>
                  <div style={{ fontSize: '2rem', marginBottom: 12 }}>⌛</div>
                  <div>Loading conversation memory...</div>
                </div>
              ) : customerMemory.length > 0 ? (
                customerMemory.map((m, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: m.role === 'model' ? 'var(--bg-active)' : 'var(--primary-dim, #1e293b)',
                      padding: '12px 16px', borderRadius: 14,
                      borderLeft: `4px solid ${m.role === 'model' ? 'var(--primary)' : 'var(--green)'}`,
                      marginLeft: m.role === 'model' ? 0 : 32
                    }}
                  >
                    <div style={{ fontSize: '0.72rem', fontWeight: 800, opacity: 0.55, marginBottom: 6 }}>
                      {m.role === 'model' ? '🤖 Gemini AI' : '👤 Customer'} &nbsp;•&nbsp; {m.created_at}
                    </div>
                    <div style={{ fontSize: '0.88rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{m.content}</div>
                  </div>
                ))
              ) : (
                <div style={{ textAlign: 'center', padding: 60, opacity: 0.5 }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>💬</div>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>No Memory Found</div>
                  <div style={{ fontSize: '0.85rem' }}>This customer hasn't chatted with the bot yet, or memory hasn't been recorded.</div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', background: 'var(--bg-header)', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', opacity: 0.5 }}>{customerMemory.length} message{customerMemory.length !== 1 ? 's' : ''} in memory</span>
              <button
                onClick={() => setShowMemoryModal(false)}
                className="btn btn-secondary"
                style={{ padding: '8px 20px', fontSize: '0.85rem', fontWeight: 700 }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Tab G3: Tool Calling & Capabilities */}
      {activeSubTabG === 'tools' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, background: 'var(--bg-active)', padding: 24, borderRadius: 20, border: '1px solid var(--border)' }}>
            <div>
              <h4 style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 4 }}>🛠️ Gemini Function Calling & Tool Capabilities</h4>
              <p className="text-muted" style={{ fontSize: '0.85rem' }}>Enable, disable, and customize the live database tools and messaging features Gemini executes.</p>
            </div>
            <button 
              className="btn btn-primary"
              disabled={saving}
              onClick={handleSaveGeminiSettings}
              style={{ padding: '10px 24px', fontWeight: 700, borderRadius: 30 }}
            >
              {saving ? '⌛ Saving...' : '💾 Save Gemini Settings'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 1. Live Stock & Price Checker */}
            <div style={{ background: 'var(--bg-active)', padding: 24, borderRadius: 20, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ fontSize: '2.5rem' }}>📦</div>
                <div style={{ flex: 1 }}>
                  <h5 style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 6 }}>Live Stock & Price Checker (`checkProductStock`)</h5>
                  <p className="text-muted" style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>Gemini queries `product_master_costs` in real-time to answer inventory questions, confirm pricing, and recommend available variants.</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
                <label style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  margin: 0,
                  gap: 8, 
                  fontWeight: 700, 
                  cursor: 'pointer', 
                  fontSize: '0.8rem', 
                  background: geminiSettings.tool_check_stock === 1 ? 'var(--green-dim)' : 'var(--red-dim)', 
                  color: geminiSettings.tool_check_stock === 1 ? 'var(--green)' : 'var(--red)', 
                  padding: '6px 14px', 
                  borderRadius: 20, 
                  border: geminiSettings.tool_check_stock === 1 ? '1px solid var(--green)' : '1px solid var(--red)',
                  transition: 'all 0.2s ease'
                }}>
                  <input 
                    type="checkbox" 
                    checked={geminiSettings.tool_check_stock === 1}
                    onChange={e => setGeminiSettings({ ...geminiSettings, tool_check_stock: e.target.checked ? 1 : 0 })}
                    style={{ accentColor: 'var(--green)', width: 16, height: 16 }}
                  />
                  <span>{geminiSettings.tool_check_stock === 1 ? 'ACTIVE 🟢' : 'DISABLED 🔴'}</span>
                </label>
              </div>
            </div>

            {/* 2. Order Tracking Radar */}
            <div style={{ background: 'var(--bg-active)', padding: 24, borderRadius: 20, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ fontSize: '2.5rem' }}>📡</div>
                <div style={{ flex: 1 }}>
                  <h5 style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 6 }}>Order Tracking Radar (`getOrderStatus`)</h5>
                  <p className="text-muted" style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>Gemini pulls live airway bill numbers, courier names (PostEx/Instaworld), and delivery statuses directly from the `orders` table.</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
                <label style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  margin: 0,
                  gap: 8, 
                  fontWeight: 700, 
                  cursor: 'pointer', 
                  fontSize: '0.8rem', 
                  background: geminiSettings.tool_order_status === 1 ? 'var(--green-dim)' : 'var(--red-dim)', 
                  color: geminiSettings.tool_order_status === 1 ? 'var(--green)' : 'var(--red)', 
                  padding: '6px 14px', 
                  borderRadius: 20, 
                  border: geminiSettings.tool_order_status === 1 ? '1px solid var(--green)' : '1px solid var(--red)',
                  transition: 'all 0.2s ease'
                }}>
                  <input 
                    type="checkbox" 
                    checked={geminiSettings.tool_order_status === 1}
                    onChange={e => setGeminiSettings({ ...geminiSettings, tool_order_status: e.target.checked ? 1 : 0 })}
                    style={{ accentColor: 'var(--green)', width: 16, height: 16 }}
                  />
                  <span>{geminiSettings.tool_order_status === 1 ? 'ACTIVE 🟢' : 'DISABLED 🔴'}</span>
                </label>
              </div>
            </div>

            {/* 3. Autonomous Draft Order Creator */}
            <div style={{ background: 'var(--bg-active)', padding: 24, borderRadius: 20, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ fontSize: '2.5rem' }}>📝</div>
                <div style={{ flex: 1 }}>
                  <h5 style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 6 }}>Autonomous Draft Order Creator (`createDraftOrder`)</h5>
                  <p className="text-muted" style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>When a customer requests to buy via WhatsApp, Gemini conducts an interview, collects complete shipping details, and auto-inserts a Draft order.</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
                <label style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  margin: 0,
                  gap: 8, 
                  fontWeight: 700, 
                  cursor: 'pointer', 
                  fontSize: '0.8rem', 
                  background: geminiSettings.tool_create_order === 1 ? 'var(--green-dim)' : 'var(--red-dim)', 
                  color: geminiSettings.tool_create_order === 1 ? 'var(--green)' : 'var(--red)', 
                  padding: '6px 14px', 
                  borderRadius: 20, 
                  border: geminiSettings.tool_create_order === 1 ? '1px solid var(--green)' : '1px solid var(--red)',
                  transition: 'all 0.2s ease'
                }}>
                  <input 
                    type="checkbox" 
                    checked={geminiSettings.tool_create_order === 1}
                    onChange={e => setGeminiSettings({ ...geminiSettings, tool_create_order: e.target.checked ? 1 : 0 })}
                    style={{ accentColor: 'var(--green)', width: 16, height: 16 }}
                  />
                  <span>{geminiSettings.tool_create_order === 1 ? 'ACTIVE 🟢' : 'DISABLED 🔴'}</span>
                </label>
              </div>
            </div>

            {/* 4. Customer Profile Enricher */}
            <div style={{ background: 'var(--bg-active)', padding: 24, borderRadius: 20, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ fontSize: '2.5rem' }}>🗂️</div>
                <div style={{ flex: 1 }}>
                  <h5 style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 6 }}>Customer Profile Enricher (`updateCustomerProfile`)</h5>
                  <p className="text-muted" style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>Gemini extracts persistent traits (sizing, delivery timing preferences, special landmarks) and saves them into the customer's long-term profile.</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
                <label style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  margin: 0,
                  gap: 8, 
                  fontWeight: 700, 
                  cursor: 'pointer', 
                  fontSize: '0.8rem', 
                  background: geminiSettings.tool_update_profile === 1 ? 'var(--green-dim)' : 'var(--red-dim)', 
                  color: geminiSettings.tool_update_profile === 1 ? 'var(--green)' : 'var(--red)', 
                  padding: '6px 14px', 
                  borderRadius: 20, 
                  border: geminiSettings.tool_update_profile === 1 ? '1px solid var(--green)' : '1px solid var(--red)',
                  transition: 'all 0.2s ease'
                }}>
                  <input 
                    type="checkbox" 
                    checked={geminiSettings.tool_update_profile === 1}
                    onChange={e => setGeminiSettings({ ...geminiSettings, tool_update_profile: e.target.checked ? 1 : 0 })}
                    style={{ accentColor: 'var(--green)', width: 16, height: 16 }}
                  />
                  <span>{geminiSettings.tool_update_profile === 1 ? 'ACTIVE 🟢' : 'DISABLED 🔴'}</span>
                </label>
              </div>
            </div>

            {/* 5. Sizing Catalog Explorer */}
            <div style={{ background: 'var(--bg-active)', padding: 24, borderRadius: 20, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ fontSize: '2.5rem' }}>📏</div>
                <div style={{ flex: 1 }}>
                  <h5 style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 6 }}>Sizing Catalog Explorer (`fetchCatalog`)</h5>
                  <p className="text-muted" style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>Gemini queries size inventory lists directly from the active Shopify catalog and matches customer sizing preferences.</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
                <label style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  margin: 0,
                  gap: 8, 
                  fontWeight: 700, 
                  cursor: 'pointer', 
                  fontSize: '0.8rem', 
                  background: geminiSettings.tool_fetch_catalog === 1 ? 'var(--green-dim)' : 'var(--red-dim)', 
                  color: geminiSettings.tool_fetch_catalog === 1 ? 'var(--green)' : 'var(--red)', 
                  padding: '6px 14px', 
                  borderRadius: 20, 
                  border: geminiSettings.tool_fetch_catalog === 1 ? '1px solid var(--green)' : '1px solid var(--red)',
                  transition: 'all 0.2s ease'
                }}>
                  <input 
                    type="checkbox" 
                    checked={geminiSettings.tool_fetch_catalog === 1}
                    onChange={e => setGeminiSettings({ ...geminiSettings, tool_fetch_catalog: e.target.checked ? 1 : 0 })}
                    style={{ accentColor: 'var(--green)', width: 16, height: 16 }}
                  />
                  <span>{geminiSettings.tool_fetch_catalog === 1 ? 'ACTIVE 🟢' : 'DISABLED 🔴'}</span>
                </label>
              </div>
            </div>

            {/* 6. Cross-Selling & Upselling Engine */}
            <div style={{ background: 'var(--bg-active)', padding: 24, borderRadius: 20, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ fontSize: '2.5rem' }}>📈</div>
                <div style={{ flex: 1 }}>
                  <h5 style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 6 }}>Cross-Selling & Upselling Engine (`getMatchingRecommendations`)</h5>
                  <p className="text-muted" style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>Gemini identifies items of interest and matches complementary pairs (e.g. shirt &rarr; cargo pants) to pitch to users, increasing AOV.</p>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
                <div>
                  <label style={{ 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: 8, 
                    fontWeight: 700, 
                    cursor: 'pointer', 
                    fontSize: '0.8rem', 
                    background: geminiSettings.tool_recommendations === 1 ? 'var(--green-dim)' : 'var(--red-dim)', 
                    color: geminiSettings.tool_recommendations === 1 ? 'var(--green)' : 'var(--red)', 
                    padding: '6px 14px', 
                    borderRadius: 20, 
                    border: geminiSettings.tool_recommendations === 1 ? '1px solid var(--green)' : '1px solid var(--red)',
                    transition: 'all 0.2s ease'
                  }}>
                    <input 
                      type="checkbox" 
                      checked={geminiSettings.tool_recommendations === 1}
                      onChange={e => setGeminiSettings({ ...geminiSettings, tool_recommendations: e.target.checked ? 1 : 0 })}
                      style={{ accentColor: 'var(--green)', width: 16, height: 16 }}
                    />
                    <span>{geminiSettings.tool_recommendations === 1 ? 'ACTIVE 🟢' : 'DISABLED 🔴'}</span>
                  </label>
                </div>
                {geminiSettings.tool_recommendations === 1 && (
                  <div style={{ marginTop: 4 }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 800, color: '#94a3b8', display: 'block', marginBottom: 6 }}>🎯 Recommendation Mapping Rules (JSON):</label>
                    <textarea
                      value={geminiSettings.recommendation_rules || ''}
                      onChange={e => setGeminiSettings({ ...geminiSettings, recommendation_rules: e.target.value })}
                      placeholder='e.g., {"Oxford Shirt": "Cargo Pants", "Chino Shorts": "Polo Shirt"}'
                      rows={3}
                      className="premium-input w-full"
                      style={{ 
                        fontFamily: 'monospace', 
                        fontSize: '0.8rem', 
                        padding: '10px 14px', 
                        borderRadius: 12, 
                        background: 'var(--bg-card)', 
                        border: '1px solid var(--border)',
                        color: '#fff'
                      }}
                    />
                    <span className="text-muted" style={{ fontSize: '0.75rem', marginTop: 4, display: 'block' }}>Map search keywords or item names to target recommendation items.</span>
                  </div>
                )}
              </div>
            </div>

            {/* 7. Interactive List Menus */}
            <div style={{ background: 'var(--bg-active)', padding: 24, borderRadius: 20, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ fontSize: '2.5rem' }}>🔘</div>
                <div style={{ flex: 1 }}>
                  <h5 style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 6 }}>Interactive List Menus</h5>
                  <p className="text-muted" style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>Renders single-select interactive dropdown lists natively within WhatsApp for size selections and menu routing.</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
                <label style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  margin: 0,
                  gap: 8, 
                  fontWeight: 700, 
                  cursor: 'pointer', 
                  fontSize: '0.8rem', 
                  background: geminiSettings.feature_interactive_lists === 1 ? 'var(--green-dim)' : 'var(--red-dim)', 
                  color: geminiSettings.feature_interactive_lists === 1 ? 'var(--green)' : 'var(--red)', 
                  padding: '6px 14px', 
                  borderRadius: 20, 
                  border: geminiSettings.feature_interactive_lists === 1 ? '1px solid var(--green)' : '1px solid var(--red)',
                }}>
                  <input 
                    type="checkbox" 
                    checked={geminiSettings.feature_interactive_lists === 1}
                    onChange={e => setGeminiSettings({ ...geminiSettings, feature_interactive_lists: e.target.checked ? 1 : 0 })}
                    style={{ accentColor: 'var(--green)', width: 16, height: 16 }}
                  />
                  <span>{geminiSettings.feature_interactive_lists === 1 ? 'ACTIVE 🟢' : 'DISABLED 🔴'}</span>
                </label>
              </div>
            </div>

            {/* 8. Quick-Reply Decision Buttons */}
            <div style={{ background: 'var(--bg-active)', padding: 24, borderRadius: 20, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ fontSize: '2.5rem' }}>💬</div>
                <div style={{ flex: 1 }}>
                  <h5 style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 6 }}>Quick-Reply Decision Buttons</h5>
                  <p className="text-muted" style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>Sends quick-reply button cards (Yes/No) directly to client screens for instant confirmations and checkout flows.</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
                <label style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  margin: 0,
                  gap: 8, 
                  fontWeight: 700, 
                  cursor: 'pointer', 
                  fontSize: '0.8rem', 
                  background: geminiSettings.feature_quick_replies === 1 ? 'var(--green-dim)' : 'var(--red-dim)', 
                  color: geminiSettings.feature_quick_replies === 1 ? 'var(--green)' : 'var(--red)', 
                  padding: '6px 14px', 
                  borderRadius: 20, 
                  border: geminiSettings.feature_quick_replies === 1 ? '1px solid var(--green)' : '1px solid var(--red)',
                  transition: 'all 0.2s ease'
                }}>
                  <input 
                    type="checkbox" 
                    checked={geminiSettings.feature_quick_replies === 1}
                    onChange={e => setGeminiSettings({ ...geminiSettings, feature_quick_replies: e.target.checked ? 1 : 0 })}
                    style={{ accentColor: 'var(--green)', width: 16, height: 16 }}
                  />
                  <span>{geminiSettings.feature_quick_replies === 1 ? 'ACTIVE 🟢' : 'DISABLED 🔴'}</span>
                </label>
              </div>
            </div>

            {/* 9. Media Card Streaming */}
            <div style={{ background: 'var(--bg-active)', padding: 24, borderRadius: 20, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ fontSize: '2.5rem' }}>🖼️</div>
                <div style={{ flex: 1 }}>
                  <h5 style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 6 }}>Media Card Streaming</h5>
                  <p className="text-muted" style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>Delivers product visual cards (attaching visual clothing mocks or Shopify media URLs) in the background asynchronously.</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
                <label style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  margin: 0,
                  gap: 8, 
                  fontWeight: 700, 
                  cursor: 'pointer', 
                  fontSize: '0.8rem', 
                  background: geminiSettings.feature_media_cards === 1 ? 'var(--green-dim)' : 'var(--red-dim)', 
                  color: geminiSettings.feature_media_cards === 1 ? 'var(--green)' : 'var(--red)', 
                  padding: '6px 14px', 
                  borderRadius: 20, 
                  border: geminiSettings.feature_media_cards === 1 ? '1px solid var(--green)' : '1px solid var(--red)',
                  transition: 'all 0.2s ease'
                }}>
                  <input 
                    type="checkbox" 
                    checked={geminiSettings.feature_media_cards === 1}
                    onChange={e => setGeminiSettings({ ...geminiSettings, feature_media_cards: e.target.checked ? 1 : 0 })}
                    style={{ accentColor: 'var(--green)', width: 16, height: 16 }}
                  />
                  <span>{geminiSettings.feature_media_cards === 1 ? 'ACTIVE 🟢' : 'DISABLED 🔴'}</span>
                </label>
              </div>
            </div>

            {/* 10. PTT Voice Note Transcoding */}
            <div style={{ background: 'var(--bg-active)', padding: 24, borderRadius: 20, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ fontSize: '2.5rem' }}>🎙️</div>
                <div style={{ flex: 1 }}>
                  <h5 style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 6 }}>PTT Voice Note Transcoding</h5>
                  <p className="text-muted" style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>Automatically transcodes incoming/outgoing voice notes to native WhatsApp `.ogg` Opus files using FFmpeg in real-time.</p>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
                <div>
                  <label style={{ 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    margin: 0,
                    gap: 8, 
                    fontWeight: 700, 
                    cursor: 'pointer', 
                    fontSize: '0.8rem', 
                    background: geminiSettings.feature_voice_notes === 1 ? 'var(--green-dim)' : 'var(--red-dim)', 
                    color: geminiSettings.feature_voice_notes === 1 ? 'var(--green)' : 'var(--red)', 
                    padding: '6px 14px', 
                    borderRadius: 20, 
                    border: geminiSettings.feature_voice_notes === 1 ? '1px solid var(--green)' : '1px solid var(--red)',
                    transition: 'all 0.2s ease'
                  }}>
                    <input 
                      type="checkbox" 
                      checked={geminiSettings.feature_voice_notes === 1}
                      onChange={e => setGeminiSettings({ ...geminiSettings, feature_voice_notes: e.target.checked ? 1 : 0 })}
                      style={{ accentColor: 'var(--green)', width: 16, height: 16 }}
                    />
                    <span>{geminiSettings.feature_voice_notes === 1 ? 'ACTIVE 🟢' : 'DISABLED 🔴'}</span>
                  </label>
                </div>
                {geminiSettings.feature_voice_notes === 1 && (
                  <div style={{ marginTop: 4 }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 800, color: '#94a3b8', display: 'block', marginBottom: 6 }}>🎙️ Choose Voice Avatar:</label>
                    <select
                      value={geminiSettings.voice_name || 'Aoede'}
                      onChange={e => setGeminiSettings({ ...geminiSettings, voice_name: e.target.value })}
                      className="premium-input w-full"
                      style={{ 
                        fontSize: '0.8rem', 
                        padding: '10px 14px', 
                        borderRadius: 12, 
                        background: 'var(--bg-card)', 
                        border: '1px solid var(--border)',
                        color: '#fff'
                      }}
                    >
                      <option value="Aoede">Aoede (Default Female)</option>
                      <option value="Charon">Charon (Male)</option>
                      <option value="Fenrir">Fenrir (Deep Voice)</option>
                      <option value="Kore">Kore (Soft Female)</option>
                      <option value="Puck">Puck (Energetic)</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Tab G4: Nightly Self-Learning Audit */}
      {activeSubTabG === 'audit' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <h4 style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 4 }}>🌙 Nightly AI Self-Learning & Friction Audit</h4>
              <p className="text-muted" style={{ fontSize: '0.85rem' }}>Review how Gemini analyzes daily chat logs to identify customer friction points and autonomously refine its own system prompt.</p>
            </div>
            <button 
              className="btn btn-primary"
              disabled={triggeringAudit}
              onClick={handleTriggerAudit}
              style={{ padding: '10px 24px', fontWeight: 800, borderRadius: 30, display: 'flex', alignItems: 'center', gap: 10 }}
            >
              {triggeringAudit ? '⌛ Analyzing Chat Logs...' : '🚀 Trigger On-Demand AI Audit'}
            </button>
          </div>

          <div style={{ maxHeight: 500, overflowY: 'auto', background: 'var(--bg-active)', borderRadius: 20, border: '1px solid var(--border)' }}>
            <table className="w-full" style={{ fontSize: '0.85rem' }}>
              <thead style={{ background: 'var(--bg-header)', position: 'sticky', top: 0, zIndex: 10 }}>
                <tr>
                  <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 800 }}>Audit Date</th>
                  <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 800 }}>Messages Analyzed</th>
                  <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 800 }}>Identified Friction Points</th>
                  <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 800 }}>Applied Prompt Refinements</th>
                </tr>
              </thead>
              <tbody>
                {geminiAuditLogs.map((log, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-dim)' }}>
                    <td style={{ padding: '14px 20px', fontWeight: 800, whiteSpace: 'nowrap' }}>{log.audit_date}</td>
                    <td style={{ padding: '14px 20px', fontWeight: 700, color: 'var(--primary)' }}>{log.messages_analyzed} msgs</td>
                    <td style={{ padding: '14px 20px', opacity: 0.9 }}>
                      <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {JSON.parse(log.friction_points || '[]').map((f, i) => <li key={i}>{f}</li>)}
                      </ul>
                    </td>
                    <td style={{ padding: '14px 20px', opacity: 0.9, color: 'var(--green)' }}>
                      <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {JSON.parse(log.prompt_refinements || '[]').map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Sub-Tab: Usage & Quota ── */}
      {activeSubTabG === 'usage' && (() => {
        const u = geminiUsage;
        const today = u?.today || { total: 0, success: 0, errors: 0, avg_response_ms: 0, daily_limit: 1500, percent_used: 0 };
        const hourly = u?.hourly || Array.from({ length: 24 }, (_, i) => ({ hour: i, calls: 0 }));
        const recentLogs = u?.recentLogs || [];
        const toolBreakdown = u?.toolBreakdown || [];
        const maxHourlyCalls = Math.max(...hourly.map(h => h.calls), 1);
        const isWarning = today.percent_used >= 70;
        const isCritical = today.percent_used >= 90;
        const barColor = isCritical ? 'var(--red, #ef4444)' : isWarning ? 'var(--orange, #f97316)' : 'var(--primary)';

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h4 style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 4 }}>📊 Gemini API Usage & Quota</h4>
                <p className="text-muted" style={{ fontSize: '0.85rem' }}>Live tracking of your Gemini API calls. Free tier: <strong>1,500 requests/day</strong> · <strong>15 requests/minute</strong>.</p>
              </div>
              <button
                onClick={handleResetLocks}
                disabled={resetLocks}
                style={{ padding: '10px 20px', borderRadius: 12, background: resetLocks ? '#334155' : 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', color: '#ef4444', fontWeight: 800, fontSize: '0.85rem', cursor: resetLocks ? 'not-allowed' : 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap' }}
              >
                {resetLocks ? '⌛ Clearing...' : '🔓 Reset Bot Locks'}
              </button>
              {isCritical && (
                <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', borderRadius: 12, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', fontWeight: 700, color: '#ef4444' }}>
                  ⚠️ CRITICAL — {today.percent_used}% of daily quota used!
                </div>
              )}
              {isWarning && !isCritical && (
                <div style={{ background: 'rgba(249,115,22,0.15)', border: '1px solid #f97316', borderRadius: 12, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', fontWeight: 700, color: '#f97316' }}>
                  ⚠️ WARNING — {today.percent_used}% of daily quota used
                </div>
              )}
            </div>

            {/* Quota Progress Bar */}
            <div style={{ background: 'var(--bg-active)', borderRadius: 20, border: '1px solid var(--border)', padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>Daily Quota Used</span>
                <span style={{ fontWeight: 800, fontSize: '0.95rem', color: barColor }}>{today.total} / {today.daily_limit} calls ({today.percent_used}%)</span>
              </div>
              <div style={{ background: 'var(--bg-header)', borderRadius: 999, height: 18, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 999,
                  width: `${Math.min(today.percent_used, 100)}%`,
                  background: `linear-gradient(90deg, ${barColor}, ${isCritical ? '#dc2626' : isWarning ? '#ea580c' : '#4f46e5'})`,
                  transition: 'width 0.6s ease',
                  boxShadow: `0 0 12px ${barColor}55`
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: '0.75rem', opacity: 0.5 }}>
                <span>Resets at midnight UTC</span>
                <span>{today.daily_limit - today.total} calls remaining today</span>
              </div>
            </div>

            {/* Stats Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
              {[
                { label: 'Total Today', value: today.total, icon: '🔢', color: 'var(--primary)' },
                { label: 'Successful', value: today.success, icon: '✅', color: 'var(--green)' },
                { label: 'Errors', value: today.errors, icon: '❌', color: 'var(--red, #ef4444)' },
                { label: 'Avg Response', value: `${today.avg_response_ms}ms`, icon: '⚡', color: 'var(--orange, #f97316)' },
              ].map((stat, i) => (
                <div key={i} style={{ background: 'var(--bg-active)', borderRadius: 16, border: '1px solid var(--border)', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: '1.5rem' }}>{stat.icon}</span>
                  <span style={{ fontSize: '1.6rem', fontWeight: 900, color: stat.color }}>{stat.value}</span>
                  <span style={{ fontSize: '0.75rem', opacity: 0.6, fontWeight: 600 }}>{stat.label}</span>
                </div>
              ))}
            </div>

            {/* Hourly Call Chart */}
            <div style={{ background: 'var(--bg-active)', borderRadius: 20, border: '1px solid var(--border)', padding: 24 }}>
              <h5 style={{ fontWeight: 800, fontSize: '0.95rem', marginBottom: 20 }}>📈 Calls Per Hour — Today</h5>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 100, overflowX: 'auto' }}>
                {hourly.map((h, i) => {
                  const heightPct = maxHourlyCalls > 0 ? (h.calls / maxHourlyCalls) * 100 : 0;
                  const now = new Date().getHours();
                  const isNow = h.hour === now;
                  return (
                    <div key={i} title={`${h.hour}:00 — ${h.calls} calls`} style={{ flex: 1, minWidth: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div style={{
                        width: '100%', borderRadius: '4px 4px 0 0',
                        height: `${Math.max(heightPct, h.calls > 0 ? 8 : 2)}%`,
                        background: isNow ? 'var(--primary)' : h.calls > 0 ? '#4f46e580' : 'var(--bg-header)',
                        transition: 'height 0.4s ease',
                        boxShadow: isNow ? '0 0 8px var(--primary)' : 'none'
                      }} />
                      {i % 4 === 0 && <span style={{ fontSize: '0.6rem', opacity: 0.4 }}>{h.hour}h</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Tool Breakdown + Recent Logs side by side */}
            <div style={{ display: 'grid', gridTemplateColumns: toolBreakdown.length > 0 ? '1fr 2fr' : '1fr', gap: 16 }}>
              {toolBreakdown.length > 0 && (
                <div style={{ background: 'var(--bg-active)', borderRadius: 20, border: '1px solid var(--border)', padding: 24 }}>
                  <h5 style={{ fontWeight: 800, fontSize: '0.9rem', marginBottom: 16 }}>🛠️ Tool Calls Today</h5>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {toolBreakdown.map((t, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-header)', borderRadius: 10 }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>{t.tool_called}</span>
                        <span style={{ fontSize: '0.82rem', fontWeight: 900, color: 'var(--primary)' }}>{t.count}x</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Logs */}
              <div style={{ background: 'var(--bg-active)', borderRadius: 20, border: '1px solid var(--border)', overflowX: 'auto' }}>
                <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
                  <h5 style={{ fontWeight: 800, fontSize: '0.9rem', margin: 0 }}>📋 Last 50 API Calls</h5>
                </div>
                <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                  <thead style={{ background: 'var(--bg-header)' }}>
                    <tr>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 800 }}>Time</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 800 }}>Phone</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 800 }}>Status</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 800 }}>Tool</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 800 }}>Speed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentLogs.length === 0 ? (
                      <tr><td colSpan={5} style={{ padding: 30, textAlign: 'center', opacity: 0.4 }}>No API calls logged yet. Calls appear here as customers message the bot.</td></tr>
                    ) : recentLogs.map((log, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-dim)' }}>
                        <td style={{ padding: '10px 14px', opacity: 0.6, whiteSpace: 'nowrap' }}>{log.created_at?.slice(11, 19)}</td>
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: '0.78rem' }}>+{log.phone || '—'}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 800, background: log.status === 'success' ? 'var(--green-dim)' : 'rgba(239,68,68,0.15)', color: log.status === 'success' ? 'var(--green)' : '#ef4444' }}>
                            {log.status === 'success' ? '✅ OK' : '❌ ERR'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', opacity: 0.7, fontSize: '0.75rem' }}>{log.tool_called || '—'}</td>
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: '0.75rem', color: log.response_ms > 3000 ? 'var(--orange)' : 'var(--green)' }}>{log.response_ms > 0 ? `${log.response_ms}ms` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  )
}
