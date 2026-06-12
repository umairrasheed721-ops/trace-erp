import { useState, useEffect, useRef } from 'react'
import { handleApiError } from '../utils/errorHandler'

export default function useWhatsAppAudio({
  activeChat,
  getDraft,
  clearQuote,
  setMessages,
  setChats,
  addToast,
  scrollToBottom
}) {
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [wavesurfer, setWavesurfer] = useState(null)
  
  const shouldDiscardRef = useRef(false)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])

  useEffect(() => {
    let interval
    if (isRecording) {
      setRecordingTime(0)
      interval = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
    } else {
      setRecordingTime(0)
    }
    return () => clearInterval(interval)
  }, [isRecording])

  const formatRecordingTime = (secs) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  const handleDiscardRecording = () => {
    shouldDiscardRef.current = true
    mediaRecorderRef.current?.stop()
  }

  const handleVoiceNote = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop()
      return
    }
    if (!activeChat) return addToast('Select a chat to send a voice note', 'warning')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      audioChunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        setIsRecording(false)
        if (shouldDiscardRef.current) {
          shouldDiscardRef.current = false
          addToast('Recording discarded', 'info')
          return
        }
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        if (blob.size < 1000) return addToast('Recording too short', 'warning')
        
        const activeQuote = getDraft(activeChat.phone).quotedMessage

        const clientUuid = 'client-opt-' + Math.random().toString(36).substring(2) + Date.now().toString(36);
        const tempUrl = URL.createObjectURL(blob);
        const tempMsg = {
          id: clientUuid,
          phone: activeChat.phone,
          direction: 'outgoing',
          message: '[Voice Note]',
          media_url: tempUrl,
          media_type: 'audio',
          status: 'pending',
          created_at: new Date().toISOString()
        };
        setMessages(prev => [...prev, tempMsg]);
        scrollToBottom();

        const formData = new FormData()
        formData.append('audio', blob, `voice_${Date.now()}.webm`)
        formData.append('clientUuid', clientUuid)
        if (activeQuote) {
          formData.append('quoteContext', JSON.stringify({ 
            id: activeQuote.id, 
            participant: activeQuote.participant, 
            text: activeQuote.text 
          }))
        }
        addToast('⏳ Sending voice note...', 'info')
        try {
          const res = await fetch(`/api/whatsapp-governance/chats/${activeChat.phone}/upload-voice`, {
            method: 'POST', body: formData
          })
          const data = await res.json()
          if (data.success && data.message) {
            setMessages(prev => {
              const idx = prev.findIndex(m => m.id === clientUuid);
              if (idx !== -1) {
                const next = [...prev];
                next[idx] = { ...next[idx], ...data.message, status: 'sent' };
                return next;
              }
              if (!prev.some(m => m.id === data.message.id)) {
                return [...prev, data.message];
              }
              return prev;
            });
            setChats(prev => prev.map(c => c.phone === activeChat.phone ? { ...c, lastMessage: data.message } : c))
            addToast('✅ Voice note sent!', 'success')
            clearQuote(activeChat.phone)
            scrollToBottom()
          } else { 
            setMessages(prev => prev.filter(m => m.id !== clientUuid));
            addToast(data.error || 'Failed to send voice note', 'error') 
          }
        } catch (err) { 
          setMessages(prev => prev.filter(m => m.id !== clientUuid));
          handleApiError(err, addToast, 'VOICE_NOTE') 
        }
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setIsRecording(true)
    } catch (err) {
      console.error('Mic access error:', err)
      addToast('Microphone access denied. Check browser permissions.', 'error')
    }
  }

  return {
    isRecording,
    setIsRecording,
    recordingTime,
    setRecordingTime,
    recordingDuration: recordingTime, // duplicate alias for compatibility
    wavesurfer,
    setWavesurfer,
    formatRecordingTime,
    handleDiscardRecording,
    handleVoiceNote
  }
}
