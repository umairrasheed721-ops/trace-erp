import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'

export default function useWhatsAppBot() {
  const { addToast } = useApp()
  const [status, setStatus] = useState(null)
  const [queueData, setQueueData] = useState(null)
  const [settings, setSettings] = useState({
    mode: 'live',
    cod_verification_enabled: 1,
    attempted_delivery_enabled: 1,
    dispatch_alerts_enabled: 1,
    enable_post_delivery_feedback: 1,
    post_delivery_template: '👋 Hi {first_name}! Kaisa laga aapko TracePK se received aapka parcel? 😍 Apne parcel ki picture ya video hamare sath share karein aur apne next order par payen FLAT 10% OFF! Discount Code: TRACE10 🎁✨',
    min_delay_sec: 5,
    max_delay_sec: 15,
    max_per_hour: 60,
    cooling_period_min: 15,
    cod_template: '',
    attempted_template: '',
    dispatch_template: '',
    poll_options: ['✅ Confirm Order', '✏️ Edit Size / Address', '❌ Cancel Order']
  })

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testPhone, setTestPhone] = useState('')
  const [testMsg, setTestMsg] = useState('Hello from TRACE ERP!')
  const [sendingTest, setSendingTest] = useState(false)
  const [resetting, setResetting] = useState(false)

  // --- TABBED NAVIGATION STATE ---
  const [activeMainTab, setActiveMainTab] = useState('zone_c') // zone_c (Radar), zone_a (Templates), zone_b (Anti-Ban), zone_g (Gemini)
  const [activeSubTabA, setActiveSubTabA] = useState('rules') // rules, cod, rescue, dispatch, ai
  const [activeSubTabB, setActiveSubTabB] = useState('pacing') // pacing, hourly, best_practices
  const [activeSubTabC, setActiveSubTabC] = useState('connection') // connection, metrics, audit

  // --- GEMINI AI STATE ---
  const [activeSubTabG, setActiveSubTabG] = useState('studio') // studio, profiles, tools, audit
  const [geminiSettings, setGeminiSettings] = useState({
    api_key: '',
    ai_active: 1,
    model_name: 'gemini-2.5-flash',
    system_prompt: '',
    strictness: 'balanced',
    auto_learning_enabled: 1,
    tool_check_stock: 1,
    tool_order_status: 1,
    tool_create_order: 1,
    tool_update_profile: 1,
    tool_fetch_catalog: 1,
    tool_recommendations: 1,
    feature_interactive_lists: 1,
    feature_quick_replies: 1,
    feature_media_cards: 1,
    feature_voice_notes: 1,
    voice_name: 'Aoede',
    recommendation_rules: '{}'
  })
  const [geminiProfiles, setGeminiProfiles] = useState([])
  const [geminiAuditLogs, setGeminiAuditLogs] = useState([])
  const [geminiUsage, setGeminiUsage] = useState(null)
  const [selectedCustomerPhone, setSelectedCustomerPhone] = useState('')
  const [customerMemory, setCustomerMemory] = useState([])
  const [loadingMemory, setLoadingMemory] = useState(false)
  const [showMemoryModal, setShowMemoryModal] = useState(false)
  const [triggeringAudit, setTriggeringAudit] = useState(false)
  const [resetLocks, setResetLocks] = useState(false)

  // --- SIMULATION SANDBOX STATE ---
  const [simPhone, setSimPhone] = useState('923001234567')
  const [simMsg, setSimMsg] = useState('Mera parcel kahan hai?')
  const [simReply, setSimReply] = useState('')
  const [simLoading, setSimLoading] = useState(false)

  const handleSimulateIncoming = async () => {
    if (!simPhone || !simMsg) return addToast('Enter phone and message', 'error')
    setSimLoading(true)
    setSimReply('')
    try {
      const res = await fetch('/api/whatsapp-governance/gemini/simulate-incoming', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('trace_token')}`
        },
        body: JSON.stringify({ phone: simPhone, message: simMsg })
      })
      const data = await res.json()
      if (data.success) {
        setSimReply(data.reply)
        addToast('✅ Simulation complete! Check AI reply below.', 'success')
      } else {
        setSimReply(`❌ Error: ${data.error}`)
        addToast(data.error || 'Simulation failed', 'error')
      }
    } catch (err) {
      setSimReply('❌ Network error during simulation')
      addToast('Network error', 'error')
    } finally {
      setSimLoading(false)
    }
  }

  const fetchData = async () => {
    try {
      const [statusRes, queueRes, settingsRes, gemSetRes, gemProfRes, gemAudRes, gemUsageRes] = await Promise.all([
        fetch('/api/whatsapp/status', { headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` } }),
        fetch('/api/whatsapp-governance/queue', { headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` } }),
        fetch('/api/whatsapp-governance/settings', { headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` } }),
        fetch('/api/whatsapp-governance/gemini/settings', { headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` } }),
        fetch('/api/whatsapp-governance/gemini/profiles', { headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` } }),
        fetch('/api/whatsapp-governance/gemini/audit-logs', { headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` } }),
        fetch('/api/whatsapp-governance/gemini/usage-stats', { headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` } })
      ])
      
      if (statusRes.ok) setStatus(await statusRes.json())
      if (queueRes.ok) setQueueData(await queueRes.json())
      if (settingsRes.ok) {
        const s = await settingsRes.json()
        if (s && Object.keys(s).length > 0) {
          if (s.poll_options && typeof s.poll_options === 'string') {
            try {
              s.poll_options = JSON.parse(s.poll_options);
            } catch (e) {
              s.poll_options = ['✅ Confirm Order', '✏️ Edit Size / Address', '❌ Cancel Order'];
            }
          }
          setSettings(prev => ({ ...prev, ...s }));
        }
      }
      if (gemSetRes.ok) {
        const gs = await gemSetRes.json()
        if (gs && Object.keys(gs).length > 0) setGeminiSettings(prev => ({ ...prev, ...gs }))
      }
      if (gemProfRes.ok) {
        const gp = await gemProfRes.json()
        if (gp?.profiles) setGeminiProfiles(gp.profiles)
      }
      if (gemAudRes.ok) {
        const ga = await gemAudRes.json()
        if (ga?.logs) setGeminiAuditLogs(ga.logs)
      }
      if (gemUsageRes.ok) {
        const gu = await gemUsageRes.json()
        if (gu?.success) setGeminiUsage(gu)
      }
      setLoading(false)
    } catch (err) {
      console.error('Failed to fetch WA governance data', err)
    }
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 4000)
    return () => clearInterval(interval)
  }, [])

  const handleSaveSettings = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/whatsapp-governance/settings', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('trace_token')}`
        },
        body: JSON.stringify(settings)
      })
      const data = await res.json()
      if (data.success) {
        addToast('✅ Governance settings & templates saved!', 'success')
      } else {
        addToast(data.error || 'Failed to save settings', 'error')
      }
    } catch (err) {
      addToast('Network error saving settings', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleTogglePause = async () => {
    try {
      const res = await fetch('/api/whatsapp-governance/queue/pause', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
      })
      const data = await res.json()
      if (data.success) {
        addToast(data.isPaused ? '⏸️ Master Queue Paused!' : '▶️ Master Queue Resumed!', 'success')
        setQueueData(prev => ({ ...prev, isPaused: data.isPaused }))
      }
    } catch (err) {
      addToast('Failed to toggle pause', 'error')
    }
  }

  const handleClearQueue = async () => {
    if (!window.confirm('Are you sure you want to clear all pending outgoing messages?')) return
    try {
      const res = await fetch('/api/whatsapp-governance/queue/clear', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
      })
      const data = await res.json()
      if (data.success) {
        addToast(`🗑️ Cleared ${data.count} queued messages!`, 'success')
        setQueueData(prev => ({ ...prev, queueCount: 0 }))
      }
    } catch (err) {
      addToast('Failed to clear queue', 'error')
    }
  }

  const handleSendTest = async () => {
    if (!testPhone) return addToast('Enter a phone number', 'error')
    setSendingTest(true)
    try {
      const res = await fetch('/api/whatsapp/send-test', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('trace_token')}`
        },
        body: JSON.stringify({ phone: testPhone, message: testMsg })
      })
      const data = await res.json()
      if (data.success) {
        addToast('✅ Test message sent!', 'success')
      } else {
        addToast(data.error || 'Failed to send', 'error')
      }
    } catch (err) {
      addToast('Network error', 'error')
    } finally {
      setSendingTest(false)
    }
  }

  const handleReset = async () => {
    if (!window.confirm('This will disconnect the bot and clear the saved session. You will need to scan a new QR code. Continue?')) return
    setResetting(true)
    try {
      const res = await fetch('/api/whatsapp/reset', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
      })
      const data = await res.json()
      if (data.success) {
        addToast('✅ Session reset! Scan the new QR code below.', 'success')
        setStatus(prev => ({ ...prev, status: 'CONNECTING', qrCode: null }))
      } else {
        addToast(data.error || 'Reset failed', 'error')
      }
    } catch (err) {
      addToast('Network error during reset', 'error')
    } finally {
      setResetting(false)
    }
  }

  const handleSaveGeminiSettings = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/whatsapp-governance/gemini/settings', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('trace_token')}`
        },
        body: JSON.stringify(geminiSettings)
      })
      const data = await res.json()
      if (data.success) {
        addToast('✅ Gemini AI configuration saved successfully!', 'success')
      } else {
        addToast(data.error || 'Failed to save Gemini settings', 'error')
      }
    } catch (err) {
      addToast('Network error saving Gemini settings', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleFetchMemory = async (phone) => {
    setSelectedCustomerPhone(phone)
    setLoadingMemory(true)
    setCustomerMemory([])
    setShowMemoryModal(true)
    try {
      const res = await fetch(`/api/whatsapp-governance/gemini/memory/${phone}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
      })
      const data = await res.json()
      if (data.success) {
        setCustomerMemory(data.memory || [])
      } else if (res.status === 404) {
        setCustomerMemory([])
      } else {
        addToast(data.error || 'Failed to load customer chat memory', 'error')
      }
    } catch (err) {
      addToast('Failed to load customer chat memory', 'error')
    } finally {
      setLoadingMemory(false)
    }
  }

  const handleResetLocks = async () => {
    setResetLocks(true)
    try {
      const res = await fetch('/api/whatsapp-governance/gemini/reset-locks', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
      })
      const data = await res.json()
      if (data.success) addToast(data.message, 'success')
      else addToast('Failed to reset locks', 'error')
    } catch (e) {
      addToast('Error resetting locks', 'error')
    } finally {
      setResetLocks(false)
    }
  }

  const handleTriggerAudit = async () => {
    setTriggeringAudit(true)
    try {
      const res = await fetch('/api/whatsapp-governance/gemini/trigger-audit', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
      })
      const data = await res.json()
      if (data.success) {
        addToast('✅ Nightly AI Audit triggered! System prompt auto-enriched.', 'success')
        fetchData()
      } else {
        addToast(data.error || data.message || 'Audit failed', 'error')
      }
    } catch (err) {
      addToast('Failed to trigger audit', 'error')
    } finally {
      setTriggeringAudit(false)
    }
  }

  return {
    status,
    setStatus,
    queueData,
    setQueueData,
    settings,
    setSettings,
    loading,
    setLoading,
    saving,
    setSaving,
    testPhone,
    setTestPhone,
    testMsg,
    setTestMsg,
    sendingTest,
    setSendingTest,
    resetting,
    setResetting,
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
    setGeminiProfiles,
    geminiAuditLogs,
    setGeminiAuditLogs,
    geminiUsage,
    setGeminiUsage,
    selectedCustomerPhone,
    setSelectedCustomerPhone,
    customerMemory,
    setCustomerMemory,
    loadingMemory,
    setLoadingMemory,
    showMemoryModal,
    setShowMemoryModal,
    triggeringAudit,
    setTriggeringAudit,
    resetLocks,
    setResetLocks,
    simPhone,
    setSimPhone,
    simMsg,
    setSimMsg,
    simReply,
    setSimReply,
    simLoading,
    setSimLoading,
    handleSimulateIncoming,
    handleSaveSettings,
    handleTogglePause,
    handleClearQueue,
    handleSendTest,
    handleReset,
    handleSaveGeminiSettings,
    handleFetchMemory,
    handleResetLocks,
    handleTriggerAudit,
    fetchData
  }
}
