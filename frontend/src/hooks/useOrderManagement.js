import { useState, useEffect, useRef, useCallback } from 'react';
import useOrderItems from './useOrderItems';
import useOrderSave from './useOrderSave';

/**
 * Composer hook for Order Details and Management.
 * Aggregates line-item CRUD states and DB mutate/tracking actions.
 */
export default function useOrderManagement({
  editingOrder,
  setEditingOrder,
  fetchOrderDetails,
  updateOrderField
}) {
  const apiBase = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';

  const getMediaUrlWithToken = useCallback((mediaUrl) => {
    if (!mediaUrl) return '';
    if (mediaUrl.startsWith('http') || mediaUrl.startsWith('blob:')) return mediaUrl;
    const traceToken = localStorage.getItem('trace_token') || localStorage.getItem('token') || '';
    const separator = mediaUrl.includes('?') ? '&' : '?';
    return `${apiBase}${mediaUrl}${separator}token=${encodeURIComponent(traceToken)}`;
  }, [apiBase]);

  // Navigation Tabs: 'financials' | 'customer' | 'logistics' | 'whatsapp_chat'
  const [activeTab, setActiveTab] = useState('financials');

  // Pillar 1: Live WhatsApp Chat State
  const [chatMessages, setChatMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [botStatus, setBotStatus] = useState('CONNECTING');
  const [newWaMsg, setNewWaMsg] = useState('');
  const [sendingWaMsg, setSendingWaMsg] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const fileInputRef = useRef(null);

  // Quick Replies states
  const [quickReplies, setQuickReplies] = useState([]);
  const [showQuickReplyPanel, setShowQuickReplyPanel] = useState(false);
  const [quickReplyTitle, setQuickReplyTitle] = useState('');
  const [quickReplyCaption, setQuickReplyCaption] = useState('');
  const [quickReplyMedia, setQuickReplyMedia] = useState(null);
  const [showTemplateCreator, setShowTemplateCreator] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);

  // Quick Pills and Audio Recording states
  const [quickPills, setQuickPills] = useState([]);
  const [showPillsManager, setShowPillsManager] = useState(false);
  const [newPillText, setNewPillText] = useState('');
  
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  
  const [chatSearchQuery, setChatSearchQuery] = useState('');

  // 1. Initialize Sub-Hooks
  const itemsHook = useOrderItems({
    editingOrder,
    apiBase
  });

  const saveHook = useOrderSave({
    editingOrder,
    setEditingOrder,
    fetchOrderDetails,
    updateOrderField,
    localItems: itemsHook.localItems,
    masterProducts: itemsHook.masterProducts,
    liveSubtotal: itemsHook.liveSubtotal,
    apiBase,
    activeTab,
    setChatMessages
  });

  // Pillar 1: Customer Intelligence & WhatsApp State Fetchers
  const fetchQuickPills = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}/api/whatsapp-governance/quick-pills`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
      });
      const data = await r.json();
      if (data.quickPills) setQuickPills(data.quickPills);
    } catch (_) {}
  }, [apiBase]);

  const handleCreateQuickPill = useCallback(async (e) => {
    e.preventDefault();
    if (!newPillText.trim()) return;
    try {
      const res = await fetch(`${apiBase}/api/whatsapp-governance/quick-pills`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('trace_token')}`
        },
        body: JSON.stringify({ pill_text: newPillText })
      });
      const data = await res.json();
      if (data.success) {
        setNewPillText('');
        fetchQuickPills();
      } else {
        alert(data.error);
      }
    } catch (_) {
      alert('Network error saving quick pill');
    }
  }, [apiBase, newPillText, fetchQuickPills]);

  const handleDeleteQuickPill = useCallback(async (id) => {
    if (!confirm('Are you sure you want to delete this quick pill?')) return;
    try {
      const res = await fetch(`${apiBase}/api/whatsapp-governance/quick-pills/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('trace_token')}`
        }
      });
      const data = await res.json();
      if (data.success) {
        fetchQuickPills();
      } else {
        alert(data.error);
      }
    } catch (_) {
      alert('Network error deleting quick pill');
    }
  }, [apiBase, fetchQuickPills]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      
      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        const file = new File([audioBlob], `voice_note_${Date.now()}.webm`, { type: 'audio/webm' });
        
        const formData = new FormData();
        formData.append('media', file);
        formData.append('caption', '');

        setIsUploadingMedia(true);
        setSendingWaMsg(true);
        try {
          const res = await fetch(`${apiBase}/api/whatsapp-governance/chat/${editingOrder.id}/upload-media`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('trace_token')}`
            },
            body: formData
          });
          const data = await res.json();
          if (data.success) {
            const chatRes = await fetch(`${apiBase}/api/whatsapp-governance/chat/${editingOrder.id}`, {
              headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
            });
            const chatData = await chatRes.json();
            if (chatData.messages) setChatMessages(chatData.messages);
          } else {
            alert(data.error || 'Voice note upload failed');
          }
        } catch (err) {
          alert('Network error sending voice note');
        } finally {
          setIsUploadingMedia(false);
          setSendingWaMsg(false);
        }
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      setRecordingSeconds(0);
    } catch (err) {
      alert('Could not access microphone: ' + err.message);
    }
  }, [apiBase, editingOrder]);

  const stopRecording = useCallback((shouldSend) => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      if (!shouldSend) {
        mediaRecorder.onstop = () => {};
      }
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
    setIsRecording(false);
    setMediaRecorder(null);
    setRecordingSeconds(0);
  }, [mediaRecorder]);

  useEffect(() => {
    let interval = null;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const fetchQuickReplies = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}/api/whatsapp-governance/quick-replies`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
      });
      const data = await r.json();
      if (data.quickReplies) setQuickReplies(data.quickReplies);
    } catch (_) {}
  }, [apiBase]);

  const handleSendQuickReply = useCallback(async (replyId) => {
    setSendingWaMsg(true);
    try {
      const res = await fetch(`${apiBase}/api/whatsapp-governance/chat/${editingOrder.id}/send-quick-reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('trace_token')}`
        },
        body: JSON.stringify({ replyId })
      });
      const data = await res.json();
      if (data.success) {
        const chatRes = await fetch(`${apiBase}/api/whatsapp-governance/chat/${editingOrder.id}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
        });
        const chatData = await chatRes.json();
        if (chatData.messages) setChatMessages(chatData.messages);
        setShowQuickReplyPanel(false);
      } else {
        alert(data.error || 'Failed to send quick reply');
      }
    } catch (err) {
      alert('Network error sending quick reply');
    } finally {
      setSendingWaMsg(false);
    }
  }, [apiBase, editingOrder]);

  const handleCreateQuickReply = useCallback(async (e) => {
    e.preventDefault();
    if (!quickReplyTitle.trim()) return alert('Title is required');

    const formData = new FormData();
    formData.append('title', quickReplyTitle);
    formData.append('caption', quickReplyCaption);
    if (quickReplyMedia) {
      formData.append('media', quickReplyMedia);
    }

    setSendingWaMsg(true);
    try {
      const res = await fetch(`${apiBase}/api/whatsapp-governance/quick-replies`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('trace_token')}`
        },
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setQuickReplyTitle('');
        setQuickReplyCaption('');
        setQuickReplyMedia(null);
        setShowTemplateCreator(false);
        fetchQuickReplies();
      } else {
        alert(data.error || 'Failed to create quick reply');
      }
    } catch (err) {
      alert('Network error creating quick reply');
    } finally {
      setSendingWaMsg(false);
    }
  }, [apiBase, quickReplyTitle, quickReplyCaption, quickReplyMedia, fetchQuickReplies]);

  const handleDeleteQuickReply = useCallback(async (id) => {
    if (!confirm('Are you sure you want to delete this quick reply?')) return;
    try {
      const res = await fetch(`${apiBase}/api/whatsapp-governance/quick-replies/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('trace_token')}`
        }
      });
      const data = await res.json();
      if (data.success) {
        fetchQuickReplies();
      } else {
        alert(data.error || 'Failed to delete');
      }
    } catch (_) {
      alert('Network error deleting quick reply');
    }
  }, [apiBase, fetchQuickReplies]);

  const handleSendWaMessage = useCallback(async (customText) => {
    const textToSend = customText || newWaMsg;
    if (!textToSend.trim()) return;

    setSendingWaMsg(true);
    try {
      const res = await fetch(`${apiBase}/api/whatsapp/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('trace_token')}`
        },
        body: JSON.stringify({ 
          phone: editingOrder.phone,
          text: textToSend 
        })
      });
      const data = await res.json();
      if (data.success) {
        setChatMessages(prev => {
           if (prev.find(m => m.id === data.message.id)) return prev;
           return [...prev, data.message];
        });
        if (!customText) setNewWaMsg('');
      } else {
        alert(data.error || 'Failed to send message');
      }
    } catch (err) {
      alert('Network error sending WhatsApp message');
    } finally {
      setSendingWaMsg(false);
    }
  }, [apiBase, editingOrder, newWaMsg]);

  const handleFileAttach = useCallback(async (e) => {
    const file = e.target?.files?.[0];
    if (!file) return;

    if (file.size > 16 * 1024 * 1024) {
      alert('⚠️ File size exceeds the 16MB limit. Please compress your file or upload a smaller one.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('media', file);
    formData.append('caption', newWaMsg);

    setIsUploadingMedia(true);
    setSendingWaMsg(true);
    try {
      const res = await fetch(`${apiBase}/api/whatsapp-governance/chat/${editingOrder.id}/upload-media`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('trace_token')}`
        },
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setNewWaMsg('');
        if (fileInputRef.current) fileInputRef.current.value = '';
        
        const chatRes = await fetch(`${apiBase}/api/whatsapp-governance/chat/${editingOrder.id}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
        });
        const chatData = await chatRes.json();
        if (chatData.messages) setChatMessages(chatData.messages);
      } else {
        alert(data.error || 'Upload failed');
      }
    } catch (err) {
      alert('Network error uploading file');
    } finally {
      setIsUploadingMedia(false);
      setSendingWaMsg(false);
    }
  }, [apiBase, editingOrder, newWaMsg]);

  // Effect: Fetch dependencies when order opens
  useEffect(() => {
    if (editingOrder) {
      const items = editingOrder.line_items_parsed || (typeof editingOrder.line_items === 'string' ? JSON.parse(editingOrder.line_items || '[]') : (editingOrder.line_items || []));
      itemsHook.setLocalItems(items);
      saveHook.setLocalNotes(editingOrder.cs_notes || '');
      
      let d = 0;
      if (editingOrder.notes) {
        try {
          const parsedNotes = JSON.parse(editingOrder.notes);
          d = parsedNotes.cs_discount || editingOrder.discount_amount || 0;
        } catch(e) {
          d = editingOrder.discount_amount || 0;
        }
      } else {
        d = editingOrder.discount_amount || 0;
      }
      saveHook.setLocalDiscount(d);

      // Fetch Customer Intelligence
      saveHook.setCustIntelLoading(true);
      fetch(`${apiBase}/api/orders/${editingOrder.id}/customer-intelligence`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
      })
        .then(r => r.json())
        .then(data => { saveHook.setCustIntel(data); saveHook.setCustIntelLoading(false); })
        .catch(() => saveHook.setCustIntelLoading(false));

      // Fetch Master Products
      const storeId = editingOrder.store_id || localStorage.getItem('activeStoreId') || 1;
      fetch(`${apiBase}/api/cost-manager?store_id=${storeId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
      })
        .then(r => r.json())
        .then(data => itemsHook.setMasterProducts(Array.isArray(data) ? data : []))
        .catch(() => {});

      // Fetch Live Tracking
      if (editingOrder.tracking_number || editingOrder.tracking_slug) {
        saveHook.setTrackingLoading(true);
        const slug = editingOrder.tracking_slug || 'tr_mock_slug';
        fetch(`${apiBase}/api/customer-success/tracking/${slug}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
        })
          .then(r => r.json())
          .then(data => { saveHook.setTrackingData(data); saveHook.setTrackingLoading(false); })
          .catch(() => saveHook.setTrackingLoading(false));
      }
    }
  }, [editingOrder, apiBase]);

  // Effect: WhatsApp Chat websocket and polling
  useEffect(() => {
    if (editingOrder && activeTab === 'whatsapp_chat') {
      setChatLoading(true);
      const orderId = editingOrder.id;
      const token = localStorage.getItem('trace_token') || '';

      let cleaned = editingOrder.phone?.replace(/\D/g, '');
      if (cleaned?.startsWith('0')) cleaned = '92' + cleaned.substring(1);
      else if (!cleaned?.startsWith('92') && cleaned?.length === 10) cleaned = '92' + cleaned;

      const loadMessages = () =>
        fetch(`${apiBase}/api/whatsapp-governance/chat/${orderId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
          .then(r => r.json())
          .then(data => {
            if (data.messages) {
              setChatMessages(data.messages);
            }
            setChatLoading(false);
          })
          .catch(() => setChatLoading(false));

      loadMessages();
      fetchQuickReplies();
      fetchQuickPills();

      const pollInterval = setInterval(() => {
        fetch(`${apiBase}/api/whatsapp-governance/chat/${orderId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
          .then(r => r.json())
          .then(data => {
            if (data.messages) {
              setChatMessages(data.messages);
            }
          })
          .catch(() => {});

        fetch(`${apiBase}/api/whatsapp-governance/status`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
          .then(r => r.json())
          .then(data => {
            if (data.status) setBotStatus(data.status);
          })
          .catch(() => setBotStatus('DISCONNECTED'));
      }, 3000);

      let socket = null;
      try {
        const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = window.location.hostname === 'localhost' ? 'localhost:3001' : window.location.host;
        socket = new WebSocket(`${wsProto}//${wsHost}/?token=${token}`);

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.event === 'typing' && data.data.phone === cleaned) {
              setIsTyping(data.data.isTyping);
              clearTimeout(window.typingTimeout);
              if (data.data.isTyping) {
                window.typingTimeout = setTimeout(() => setIsTyping(false), 5000);
              }
            } else if (data.event === 'message') {
              if (data.data.order_id == orderId || data.data.message?.phone === cleaned) {
                setChatMessages(prev => {
                  const newMsg = data.data.message;
                  if (prev.find(m => m.id === newMsg.id || (m.message_id && m.message_id === newMsg.message_id))) return prev;
                  return [...prev, newMsg];
                });
                setIsTyping(false);
              }
            }
          } catch (err) {}
        };
      } catch (e) {}

      return () => {
        clearInterval(pollInterval);
        if (socket) socket.close();
        clearTimeout(window.typingTimeout);
      };
    }
  }, [editingOrder, activeTab, apiBase, fetchQuickReplies, fetchQuickPills]);

  return {
    getMediaUrlWithToken,
    activeTab,
    setActiveTab,
    localItems: itemsHook.localItems,
    setLocalItems: itemsHook.setLocalItems,
    localDiscount: saveHook.localDiscount,
    setLocalDiscount: saveHook.setLocalDiscount,
    localNotes: saveHook.localNotes,
    setLocalNotes: saveHook.setLocalNotes,
    isSavingCS: saveHook.isSavingCS,
    custIntel: saveHook.custIntel,
    custIntelLoading: saveHook.custIntelLoading,
    waSimulating: saveHook.waSimulating,
    sendingImages: saveHook.sendingImages,
    masterProducts: itemsHook.masterProducts,
    showProductSearch: itemsHook.showProductSearch,
    setShowProductSearch: itemsHook.setShowProductSearch,
    productSearchQuery: itemsHook.productSearchQuery,
    setProductSearchQuery: itemsHook.setProductSearchQuery,
    bookingCourier: saveHook.bookingCourier,
    trackingData: saveHook.trackingData,
    trackingLoading: saveHook.trackingLoading,
    chatMessages,
    setChatMessages,
    chatLoading,
    botStatus,
    newWaMsg,
    setNewWaMsg,
    sendingWaMsg,
    isTyping,
    fileInputRef,
    quickReplies,
    showQuickReplyPanel,
    setShowQuickReplyPanel,
    quickReplyTitle,
    setQuickReplyTitle,
    quickReplyCaption,
    setQuickReplyCaption,
    quickReplyMedia,
    setQuickReplyMedia,
    showTemplateCreator,
    setShowTemplateCreator,
    isUploadingMedia,
    quickPills,
    showPillsManager,
    setShowPillsManager,
    newPillText,
    setNewPillText,
    isRecording,
    recordingSeconds,
    chatSearchQuery,
    setChatSearchQuery,
    sendingInvoice: saveHook.sendingInvoice,
    handleCreateQuickPill,
    handleDeleteQuickPill,
    startRecording,
    stopRecording,
    handleSendInvoice: saveHook.handleSendInvoice,
    handleSendQuickReply,
    handleCreateQuickReply,
    handleDeleteQuickReply,
    handleSendWaMessage,
    handleFileAttach,
    handleCSUpdate: saveHook.handleCSUpdate,
    handleWaSimulate: saveHook.handleWaSimulate,
    handleSendItemImages: saveHook.handleSendItemImages,
    handleAddressCleanse: saveHook.handleAddressCleanse,
    handleBookCourier: saveHook.handleBookCourier,
    liveSubtotal: itemsHook.liveSubtotal,
    liveTotal: saveHook.liveTotal,
    totalOrderCost: saveHook.totalOrderCost,
    netProfit: saveHook.netProfit,
    profitMargin: saveHook.profitMargin,
    filteredGroups: itemsHook.filteredGroups,
    addrScore: saveHook.addrScore
  };
}
