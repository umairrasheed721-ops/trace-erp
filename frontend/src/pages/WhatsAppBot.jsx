import React from 'react'
import useWhatsAppBot from '../hooks/useWhatsAppBot'
import BotRulesPanel from '../components/WhatsAppBot/BotRulesPanel'
import BotTemplatesPanel from '../components/WhatsAppBot/BotTemplatesPanel'
import BotSchedulePanel from '../components/WhatsAppBot/BotSchedulePanel'
import BotAnalyticsPanel from '../components/WhatsAppBot/BotAnalyticsPanel'

export default function WhatsAppBot() {
  const {
    status,
    queueData,
    settings,
    setSettings,
    loading,
    saving,
    testPhone,
    setTestPhone,
    testMsg,
    setTestMsg,
    sendingTest,
    resetting,
    activeMainTab,
    setActiveMainTab,
    activeSubTabA,
    setActiveSubTabA,
    activeSubTabB,
    setActiveSubTabB,
    activeSubTabC,
    setActiveSubTabC,
    activeSubTabG,
    setActiveSubTabG,
    geminiSettings,
    setGeminiSettings,
    geminiProfiles,
    geminiAuditLogs,
    geminiUsage,
    selectedCustomerPhone,
    customerMemory,
    loadingMemory,
    showMemoryModal,
    setShowMemoryModal,
    triggeringAudit,
    resetLocks,
    simPhone,
    setSimPhone,
    simMsg,
    setSimMsg,
    simReply,
    simLoading,
    handleSimulateIncoming,
    handleSaveSettings,
    handleTogglePause,
    handleClearQueue,
    handleSendTest,
    handleReset,
    handleSaveGeminiSettings,
    handleFetchMemory,
    handleResetLocks,
    handleTriggerAudit
  } = useWhatsAppBot()

  if (loading) return <div className="loading-overlay">⌛ Loading WhatsApp Governance Portal...</div>

  const isConnected = status?.status === 'CONNECTED'
  const isQrReady = status?.status === 'QR_READY'
  const isFailed = status?.status === 'FAILURE'
  const isSleeping = status?.status === 'SLEEPING'
  const statusColor = isConnected ? 'var(--green)' : isSleeping ? '#8b5cf6' : isQrReady ? 'var(--orange)' : isFailed ? 'var(--red)' : 'var(--orange)'

  return (
    <div className="fade-in">
      {/* Header Section */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2>📱 WhatsApp Governance & Anti-Ban Command Center</h2>
          <p>Next-Gen Multi-Device Automation Studio, Anti-Ban Pacing Engine, and Live Delivery Radar</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ 
            padding: '8px 16px', 
            borderRadius: 30, 
            background: settings.mode === 'live' ? 'var(--green-dim)' : 'var(--orange-dim)',
            border: `1px solid ${settings.mode === 'live' ? 'var(--green)' : 'var(--orange)'}`,
            color: settings.mode === 'live' ? 'var(--green)' : 'var(--orange)',
            fontWeight: 800,
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: settings.mode === 'live' ? 'var(--green)' : 'var(--orange)' }}></span>
            MODE: {settings.mode.toUpperCase()} {settings.mode === 'live' ? '(Baileys Active)' : '(Simulated Logs)'}
          </div>
          <button 
            className="btn btn-primary" 
            disabled={saving} 
            onClick={handleSaveSettings}
            style={{ padding: '10px 24px', fontWeight: 700, boxShadow: '0 8px 20px -4px rgba(99,102,241,0.4)' }}
          >
            {saving ? '⌛ Saving...' : '💾 Save All Settings'}
          </button>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 28, background: '#1e293b', padding: 8, borderRadius: 20, border: '1px solid #334155', overflowX: 'auto', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)' }}>
        {[
          { id: 'zone_c', label: '📡 Zone C: Live Radar & Audit', icon: '🔴' },
          { id: 'zone_a', label: '🎛️ Zone A: Authority & Templates', icon: '⚙️' },
          { id: 'zone_b', label: '🛡️ Zone B: Anti-Ban Studio', icon: '🛡️' },
          { id: 'zone_g', label: '🧠 Zone G: Gemini Autonomous AI', icon: '🧠' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveMainTab(tab.id)}
            style={{
              flex: 1,
              minWidth: 240,
              padding: '14px 24px',
              borderRadius: 16,
              background: activeMainTab === tab.id ? '#6366f1' : 'transparent',
              color: activeMainTab === tab.id ? '#fff' : '#94a3b8',
              fontWeight: 800,
              fontSize: '0.95rem',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: activeMainTab === tab.id ? '0 10px 25px -5px rgba(99, 102, 241, 0.5)' : 'none'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Routing Panels */}
      {activeMainTab === 'zone_c' && (
        <BotAnalyticsPanel
          activeSubTabC={activeSubTabC}
          setActiveSubTabC={setActiveSubTabC}
          status={status}
          statusColor={statusColor}
          resetting={resetting}
          handleReset={handleReset}
          isSleeping={isSleeping}
          isQrReady={isQrReady}
          isConnected={isConnected}
          isFailed={isFailed}
          testPhone={testPhone}
          setTestPhone={setTestPhone}
          testMsg={testMsg}
          setTestMsg={setTestMsg}
          sendingTest={sendingTest}
          handleSendTest={handleSendTest}
          queueData={queueData}
          handleTogglePause={handleTogglePause}
          handleClearQueue={handleClearQueue}
          settings={settings}
        />
      )}

      {activeMainTab === 'zone_a' && (
        <BotRulesPanel
          activeSubTabA={activeSubTabA}
          setActiveSubTabA={setActiveSubTabA}
          settings={settings}
          setSettings={setSettings}
        />
      )}

      {activeMainTab === 'zone_b' && (
        <BotSchedulePanel
          activeSubTabB={activeSubTabB}
          setActiveSubTabB={setActiveSubTabB}
          settings={settings}
          setSettings={setSettings}
        />
      )}

      {activeMainTab === 'zone_g' && (
        <BotTemplatesPanel
          activeSubTabG={activeSubTabG}
          setActiveSubTabG={setActiveSubTabG}
          geminiSettings={geminiSettings}
          setGeminiSettings={setGeminiSettings}
          saving={saving}
          handleSaveGeminiSettings={handleSaveGeminiSettings}
          simPhone={simPhone}
          setSimPhone={setSimPhone}
          simMsg={simMsg}
          setSimMsg={setSimMsg}
          simLoading={simLoading}
          handleSimulateIncoming={handleSimulateIncoming}
          simReply={simReply}
          geminiProfiles={geminiProfiles}
          handleFetchMemory={handleFetchMemory}
          showMemoryModal={showMemoryModal}
          setShowMemoryModal={setShowMemoryModal}
          selectedCustomerPhone={selectedCustomerPhone}
          loadingMemory={loadingMemory}
          customerMemory={customerMemory}
          geminiAuditLogs={geminiAuditLogs}
          triggeringAudit={triggeringAudit}
          handleTriggerAudit={handleTriggerAudit}
          geminiUsage={geminiUsage}
          resetLocks={resetLocks}
          handleResetLocks={handleResetLocks}
        />
      )}
    </div>
  )
}
