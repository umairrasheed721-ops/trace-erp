import React, { useState, useEffect, useMemo, useRef } from 'react'

export default function EditOrderModal({
  editingOrder,
  setEditingOrder,
  editorLoading,
  fetchOrderDetails,
  updateOrderField,
  isCityValid
}) {
  const apiBase = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';

  const getMediaUrlWithToken = (mediaUrl) => {
    if (!mediaUrl) return ''
    if (mediaUrl.startsWith('http') || mediaUrl.startsWith('blob:')) return mediaUrl
    const traceToken = localStorage.getItem('trace_token') || localStorage.getItem('token') || ''
    const separator = mediaUrl.includes('?') ? '&' : '?'
    return `${apiBase}${mediaUrl}${separator}token=${encodeURIComponent(traceToken)}`
  }

  // Navigation Tabs: 'financials' | 'customer' | 'logistics'
  const [activeTab, setActiveTab] = useState('financials');

  // CS Edit State
  const [localItems, setLocalItems] = useState([]);
  const [localDiscount, setLocalDiscount] = useState(0);
  const [localNotes, setLocalNotes] = useState('');
  const [isSavingCS, setIsSavingCS] = useState(false);

  // Pillar 1: Customer Intelligence & WhatsApp State
  const [custIntel, setCustIntel] = useState({ total: 0, delivered: 0, returned: 0, rto_rate: 0, blacklist: false });
  const [custIntelLoading, setCustIntelLoading] = useState(false);
  const [waSimulating, setWaSimulating] = useState(false);
  const [sendingImages, setSendingImages] = useState(false);

  // Pillar 2: Master Products & Product Search State
  const [masterProducts, setMasterProducts] = useState([]);
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState('');

  // Pillar 3: Logistics & Live Tracking State
  const [bookingCourier, setBookingCourier] = useState(false);
  const [trackingData, setTrackingData] = useState(null);
  const [trackingLoading, setTrackingLoading] = useState(false);

  // Pillar 1: Live WhatsApp Chat State
  const [chatMessages, setChatMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [botStatus, setBotStatus] = useState('CONNECTING'); // dynamic status
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
  const [sendingInvoice, setSendingInvoice] = useState(false);

  const fetchQuickPills = async () => {
    try {
      const apiBase = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
      const r = await fetch(`${apiBase}/api/whatsapp-governance/quick-pills`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
      });
      const data = await r.json();
      if (data.quickPills) setQuickPills(data.quickPills);
    } catch (_) {}
  };

  const handleCreateQuickPill = async (e) => {
    e.preventDefault();
    if (!newPillText.trim()) return;
    try {
      const apiBase = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
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
  };

  const handleDeleteQuickPill = async (id) => {
    if (!confirm('Are you sure you want to delete this quick pill?')) return;
    try {
      const apiBase = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
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
  };

  const startRecording = async () => {
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
          const apiBase = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
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
  };

  const stopRecording = (shouldSend) => {
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
  };

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

  const handleSendInvoice = async () => {
    setSendingInvoice(true);
    try {
      const apiBase = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
      const res = await fetch(`${apiBase}/api/whatsapp-governance/chat/${editingOrder.id}/send-invoice`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('trace_token')}`
        }
      });
      const data = await res.json();
      if (data.success) {
        alert('✅ PDF Invoice generated and sent to WhatsApp!');
        const chatRes = await fetch(`${apiBase}/api/whatsapp-governance/chat/${editingOrder.id}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
        });
        const chatData = await chatRes.json();
        if (chatData.messages) setChatMessages(chatData.messages);
      } else {
        alert(data.error || 'Failed to send invoice');
      }
    } catch (err) {
      alert('Network error sending invoice');
    } finally {
      setSendingInvoice(false);
    }
  };

  const fetchQuickReplies = async () => {
    try {
      const apiBase = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
      const r = await fetch(`${apiBase}/api/whatsapp-governance/quick-replies`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
      });
      const data = await r.json();
      if (data.quickReplies) setQuickReplies(data.quickReplies);
    } catch (_) {}
  };

  const handleSendQuickReply = async (replyId) => {
    setSendingWaMsg(true);
    try {
      const apiBase = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
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
        // Fetch fresh chat history to show the newly sent template message
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
  };

  const handleCreateQuickReply = async (e) => {
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
      const apiBase = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
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
  };

  const handleDeleteQuickReply = async (id) => {
    if (!confirm('Are you sure you want to delete this quick reply?')) return;
    try {
      const apiBase = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
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
  };

  // Fetch chat messages, setup WebSocket + 3-second polling fallback
  useEffect(() => {
    if (editingOrder && activeTab === 'whatsapp_chat') {
      setChatLoading(true);
      const apiBase = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
      const orderId = editingOrder.id;
      const token = localStorage.getItem('trace_token') || '';

      let cleaned = editingOrder.phone?.replace(/\D/g, '');
      if (cleaned?.startsWith('0')) cleaned = '92' + cleaned.substring(1);
      else if (!cleaned?.startsWith('92') && cleaned?.length === 10) cleaned = '92' + cleaned;

      // ── Initial fetch ──────────────────────────────────────────────────────
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

      // ── Polling every 3 seconds (reliable fallback) ────────────────────────
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

      // ── WebSocket (instant updates on top of polling) ─────────────────────
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
              // eslint-disable-next-line eqeqeq
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
        socket.onerror = () => {};
      } catch (e) {}

      return () => {
        clearInterval(pollInterval);
        if (socket) socket.close();
        clearTimeout(window.typingTimeout);
      };
    }
  }, [editingOrder, activeTab]);

  const handleSendWaMessage = async (customText) => {
    const textToSend = customText || newWaMsg;
    if (!textToSend.trim()) return;

    setSendingWaMsg(true);
    try {
      const apiBase = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
      const res = await fetch(`${apiBase}/api/whatsapp-governance/chat/${editingOrder.id}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('trace_token')}`
        },
        body: JSON.stringify({ message: textToSend })
      });
      const data = await res.json();
      if (data.success) {
        // Message will also be broadcast via WebSocket, but optimistic UI is fine
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
  };

  const handleFileAttach = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file size limit: 16MB
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
      const apiBase = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
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
        
        // Fetch fresh chat history to display the new media message
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
  };

  useEffect(() => {
    if (editingOrder) {
      const items = editingOrder.line_items_parsed || (typeof editingOrder.line_items === 'string' ? JSON.parse(editingOrder.line_items || '[]') : (editingOrder.line_items || []));
      setLocalItems(items);
      setLocalNotes(editingOrder.cs_notes || '');
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
      setLocalDiscount(d);

      // Fetch Customer Intelligence
      setCustIntelLoading(true);
      const apiBase = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
      fetch(`${apiBase}/api/orders/${editingOrder.id}/customer-intelligence`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
      })
        .then(r => r.json())
        .then(data => { setCustIntel(data); setCustIntelLoading(false); })
        .catch(() => setCustIntelLoading(false));

      // Fetch Master Products for SKU Intelligence
      const storeId = editingOrder.store_id || localStorage.getItem('activeStoreId') || 1;
      fetch(`${apiBase}/api/cost-manager?store_id=${storeId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
      })
        .then(r => r.json())
        .then(data => setMasterProducts(Array.isArray(data) ? data : []))
        .catch(() => {});

      // Fetch Live Tracking if tracking number exists
      if (editingOrder.tracking_number || editingOrder.tracking_slug) {
        setTrackingLoading(true);
        const slug = editingOrder.tracking_slug || 'tr_mock_slug';
        fetch(`${apiBase}/api/customer-success/tracking/${slug}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
        })
          .then(r => r.json())
          .then(data => { setTrackingData(data); setTrackingLoading(false); })
          .catch(() => setTrackingLoading(false));
      }
    }
  }, [editingOrder]);

  const handleCSUpdate = async () => {
    setIsSavingCS(true);
    try {
      const apiBase = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
      
      const subtotal = localItems.reduce((acc, item) => acc + (parseFloat(item.price) * parseInt(item.quantity)), 0);
      const newPrice = Math.max(0, subtotal - parseFloat(localDiscount || 0) + parseFloat(editingOrder.courier_fee || 250));
      
      const res = await fetch(`${apiBase}/api/orders/${editingOrder.id}/cs-update`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('trace_token')}`
        },
        body: JSON.stringify({
          line_items: localItems,
          price: newPrice,
          discount_amount: parseFloat(localDiscount || 0),
          cs_notes: localNotes
        })
      });
      const data = await res.json();
      if (data.success) {
        setEditingOrder(data.order);
        alert('Order updated successfully!');
      } else {
        alert(data.error);
      }
    } catch (e) {
      alert('Failed to save CS update');
    } finally {
      setIsSavingCS(false);
    }
  };

  // Pillar 1: WhatsApp Simulation Trigger
  const handleWaSimulate = (action) => {
    setWaSimulating(true);
    const apiBase = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
    fetch(`${apiBase}/api/customer-success/simulate-trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: editingOrder.id, action })
    })
      .then(r => r.json())
      .then(res => {
        setWaSimulating(false);
        if (res.error) throw new Error(res.error);
        alert(res.message);
        if (fetchOrderDetails) fetchOrderDetails(editingOrder.id);
        if (action === 'SIMULATE_CONFIRM') setEditingOrder({ ...editingOrder, wa_verification_status: 'verified' });
        if (action === 'SIMULATE_CANCEL') setEditingOrder({ ...editingOrder, wa_verification_status: 'Cancelled' });
        if (action === 'SEND_VERIFICATION') setEditingOrder({ ...editingOrder, wa_verification_status: 'Pending' });
      })
      .catch(err => {
        setWaSimulating(false);
        alert(err.message || 'WhatsApp simulation failed');
      });
  };

  const handleSendItemImages = async () => {
    setSendingImages(true);
    try {
      const apiBase = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
      const res = await fetch(`${apiBase}/api/whatsapp-governance/chat/${editingOrder.id}/send-images`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('trace_token')}`
        }
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        if (activeTab === 'whatsapp_chat') {
          const chatRes = await fetch(`${apiBase}/api/whatsapp-governance/chat/${editingOrder.id}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
          });
          const chatData = await chatRes.json();
          if (chatData.messages) setChatMessages(chatData.messages);
        }
      } else {
        alert(data.error || 'Failed to send item images.');
      }
    } catch (err) {
      alert('Network error sending item images.');
    } finally {
      setSendingImages(false);
    }
  };

  // Pillar 1: AI Address Cleanse Helper
  const handleAddressCleanse = () => {
    if (!editingOrder.address) return;
    let cleaned = editingOrder.address
      .replace(/\s+/g, ' ')
      .replace(/(bahria town|dha|gulberg|wapda town|johar town)/gi, match => match.toUpperCase())
      .replace(/\b(st|str|street)\b/gi, 'Street')
      .replace(/\b(h|ho|house)\b/gi, 'House')
      .replace(/\b(sec|sect|sector)\b/gi, 'Sector')
      .trim();
    
    if (editingOrder.city && !cleaned.toLowerCase().includes(editingOrder.city.toLowerCase())) {
      cleaned += `, ${editingOrder.city}`;
    }
    setEditingOrder({ ...editingOrder, address: cleaned });
    if (updateOrderField) updateOrderField(editingOrder.id, 'address', cleaned);
  };

  // Pillar 3: 1-Click Courier Booking Helper
  const handleBookCourier = (courierName) => {
    setBookingCourier(true);
    const apiBase = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
    fetch(`${apiBase}/api/bulk/book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` },
      body: JSON.stringify({ order_ids: [editingOrder.id], courier: courierName })
    })
      .then(r => r.json())
      .then(res => {
        setBookingCourier(false);
        if (res.error) throw new Error(res.error);
        alert(`Successfully booked with ${courierName}! Tracking #${res.results?.[0]?.tracking_number || 'GENERATED'}`);
        if (fetchOrderDetails) fetchOrderDetails(editingOrder.id);
        setEditingOrder({ 
          ...editingOrder, 
          tracking_number: res.results?.[0]?.tracking_number || 'TRK-' + Math.floor(Math.random()*1000000),
          courier: courierName,
          delivery_status: 'Booked'
        });
      })
      .catch(err => {
        setBookingCourier(false);
        alert(err.message || 'Courier booking failed');
      });
  };

  // Live Math & Profit Margins
  const liveSubtotal = localItems.reduce((acc, item) => acc + ((parseFloat(item.price)||0) * (parseInt(item.quantity)||0)), 0);
  const liveTotal = Math.max(0, liveSubtotal - parseFloat(localDiscount || 0) + parseFloat(editingOrder?.courier_fee || 250));

  // Calculate Total Order Cost from Master Products
  let totalOrderCost = 0;
  localItems.forEach(item => {
    const matched = masterProducts.find(mp => mp.sku === item.sku || mp.parent_title === item.title);
    const unitCost = matched?.unit_cost || matched?.landed_cost || 0;
    totalOrderCost += (parseFloat(unitCost) * (parseInt(item.quantity) || 1));
  });

  const netProfit = liveTotal - totalOrderCost - parseFloat(editingOrder?.courier_fee || 250);
  const profitMargin = liveTotal > 0 ? Math.round((netProfit / liveTotal) * 100) : 0;

  // AI Address Quality Heuristic Score
  const getAddressScore = (addr) => {
    if (!addr || addr.length < 10) return { label: '⚠️ Low Quality (Too Short)', color: '#f43f5e', bg: 'rgba(244,63,94,0.1)' };
    const hasNumber = /\d/.test(addr);
    const hasStreet = /(st|street|road|rd|lane|ln|block|blk|sector|sec|phase)/i.test(addr);
    if (hasNumber && hasStreet && addr.length > 15) return { label: '✅ High Quality (Courier Perfect)', color: '#10b981', bg: 'rgba(16,185,129,0.1)' };
    return { label: '⚠️ Fair Quality (Missing Street/House #)', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' };
  };
  const addrScore = getAddressScore(editingOrder?.address);

  // WhatsApp Status Badge Helper
  const getWaBadge = (status) => {
    if (status?.toLowerCase() === 'verified') return <span style={{ background: '#10b98120', color: '#10b981', padding: '4px 12px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700 }}>🟢 WhatsApp Verified</span>;
    if (status === 'Address_Updated') return <span style={{ background: '#3b82f620', color: '#3b82f6', padding: '4px 12px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700 }}>✏️ Address Curated</span>;
    if (status === 'Cancelled') return <span style={{ background: '#ef444420', color: '#ef4444', padding: '4px 12px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700 }}>🔴 Cancelled via WA</span>;
    return <span style={{ background: '#f59e0b20', color: '#f59e0b', padding: '4px 12px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700 }}>🟡 COD Pending Verification</span>;
  };

  // Group master products into Parent -> Colors -> Sizes hierarchy
  const groupedProducts = useMemo(() => {
    const groups = {};

    masterProducts.forEach(mp => {
      // Clean parent title in case variant is appended
      let pTitle = (mp.parent_title || 'Unnamed Product').trim();
      let extractedVariant = '';
      if (pTitle.includes(' - ')) {
        const parts = pTitle.split(' - ');
        pTitle = parts[0].trim();
        extractedVariant = parts.slice(1).join(' - ').trim();
      }

      // Parse variant title for Color and Size
      // If mp.variant_title is 'Default Title' or 'Default' or empty, use extractedVariant from parent_title!
      let vTitle = (mp.variant_title || '').trim();
      if (!vTitle || vTitle.toLowerCase().includes('default')) {
        vTitle = extractedVariant || vTitle;
      }

      let color = 'Default';
      let size = 'One Size';

      if (vTitle && !vTitle.toLowerCase().includes('default')) {
        const parts = vTitle.split(/[\/\-\|]/).map(p => p.trim()).filter(Boolean);
        if (parts.length >= 2) {
          const isSize = (str) => /^(xs|s|m|l|xl|2xl|3xl|4xl|\d+[a-z]*)$/i.test(str);
          if (isSize(parts[0])) {
            size = parts[0].toUpperCase();
            color = parts[1];
          } else if (isSize(parts[1])) {
            color = parts[0];
            size = parts[1].toUpperCase();
          } else {
            color = parts[0];
            size = parts[1];
          }
        } else if (parts.length === 1) {
          if (/^(xs|s|m|l|xl|2xl|3xl|4xl|\d+[a-z]*)$/i.test(parts[0])) {
            size = parts[0].toUpperCase();
          } else {
            color = parts[0];
          }
        }
      }

      color = color.charAt(0).toUpperCase() + color.slice(1);

      if (!groups[pTitle]) {
        groups[pTitle] = {
          parent_title: pTitle,
          image_url: mp.image_url,
          colors: {},
          all_skus: [],
          all_variants: [],
          min_price: mp.selling_price || mp.unit_cost || 0
        };
      }

      if (!groups[pTitle].colors[color]) {
        groups[pTitle].colors[color] = {
          color_name: color,
          sizes: []
        };
      }

      if (mp.sku) groups[pTitle].all_skus.push(mp.sku.toLowerCase());
      if (vTitle) groups[pTitle].all_variants.push(vTitle.toLowerCase());
      if (mp.image_url && !groups[pTitle].image_url) {
        groups[pTitle].image_url = mp.image_url;
      }

      groups[pTitle].colors[color].sizes.push({
        ...mp,
        clean_size: size,
        clean_color: color
      });
    });

    return Object.values(groups);
  }, [masterProducts]);

  // Helper for Levenshtein Distance (Typos & Spelling Mistakes)
  const getEditDistance = (a, b) => {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) { matrix[i] = [i]; }
    for (let j = 0; j <= a.length; j++) { matrix[0][j] = j; }
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
        }
      }
    }
    return matrix[b.length][a.length];
  };

  // Helper for Lenient Search (Punctuation stripping & Smart Levenshtein typo tolerance)
  const isLenientMatch = (query, target) => {
    if (!query || !target) return false;
    const qClean = query.toLowerCase().replace(/[^a-z0-9]/g, '');
    const tClean = target.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!qClean) return true;
    if (!tClean) return false;

    // 1. Direct substring match on cleaned strings (e.g. 'puma' matches 'PUM-A', 'pum' matches 'PUM-A')
    if (tClean.includes(qClean)) return true;

    // 2. Typo / Spelling mistake tolerance (Levenshtein distance on words)
    if (qClean.length >= 3) {
      const tWords = target.toLowerCase().split(/[\s\-\/\(\)]/).filter(Boolean);
      for (const word of tWords) {
        const wClean = word.replace(/[^a-z0-9]/g, '');
        if (wClean.length >= qClean.length - 1 && wClean.length <= qClean.length + 1) {
          const dist = getEditDistance(qClean, wClean);
          // Allow distance 1 for 3+ chars, distance 2 for 4+ chars (handles transpositions like pmua vs puma)
          if (dist <= 1 || (qClean.length >= 4 && dist <= 2)) return true;
        }
      }
    }

    return false;
  };

  // Filter grouped products by search query with lenient fuzzy matching
  const filteredGroups = useMemo(() => {
    if (!productSearchQuery.trim()) return groupedProducts;
    const q = productSearchQuery.trim();
    return groupedProducts.filter(g => 
      isLenientMatch(q, g.parent_title) ||
      g.all_skus.some(sku => isLenientMatch(q, sku)) ||
      g.all_variants.some(v => isLenientMatch(q, v)) ||
      Object.keys(g.colors).some(c => isLenientMatch(q, c))
    );
  }, [groupedProducts, productSearchQuery]);

  if (!editingOrder) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(8px)', fontFamily: 'sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 1200, maxHeight: '92vh', background: '#0f172a', border: '1px solid #334155', borderRadius: 24, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'slideUp 0.3s ease-out' }}>
        
        {/* 🚨 Automated RTO Risk Warning Banner (Pillar 1) */}
        {(custIntel.returned > 0 || custIntel.blacklist) && (
          <div style={{ background: 'linear-gradient(90deg, #9f1239 0%, #be123c 100%)', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyItems: 'space-between', justifyContent: 'space-between', color: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: '1.5rem' }}>🚨</span>
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>High RTO Risk Detected</div>
                <div style={{ fontSize: '0.75rem', opacity: 0.9 }}>
                  Customer has {custIntel.returned} previous refused/returned parcels. Historical RTO Rate: {custIntel.rto_rate}%. {custIntel.blacklist ? '⚠️ ACTIVE BLACKLIST STRIKE.' : ''}
                </div>
              </div>
            </div>
            <button 
              onClick={() => handleWaSimulate('SIMULATE_CANCEL')} 
              style={{ background: '#0f172a', color: '#fda4af', border: '1px solid #f43f5e', padding: '6px 14px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
            >
              ❌ Cancel & Restock
            </button>
          </div>
        )}

        {/* Modal Header & Navigation Tabs */}
        <div style={{ padding: '20px 28px 0', borderBottom: '1px solid #334155', background: '#1e293b', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyItems: 'space-between', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#fff' }}>
                Order #{editingOrder.ref_number || editingOrder.shopify_order_id}
              </h2>
              <span style={{ background: '#f59e0b20', color: '#f59e0b', padding: '4px 10px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 700, border: '1px solid #f59e0b40' }}>
                {editingOrder.payment_status || 'Pending'}
              </span>
              <span style={{ background: '#3b82f620', color: '#3b82f6', padding: '4px 10px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 700, border: '1px solid #3b82f640' }}>
                {editingOrder.delivery_status || 'Unfulfilled'}
              </span>
              {getWaBadge(editingOrder.wa_verification_status)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {editorLoading && <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>⏳ Syncing...</span>}
              <button 
                onClick={() => setEditingOrder(null)} 
                style={{ background: '#334155', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 12, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
              >
                ✕ Close
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div style={{ display: 'flex', gap: 8, borderBottom: 'none' }}>
            <button 
              onClick={() => setActiveTab('financials')}
              style={{ 
                padding: '12px 20px', 
                background: activeTab === 'financials' ? '#0f172a' : 'transparent', 
                color: activeTab === 'financials' ? '#6366f1' : '#94a3b8', 
                borderTopLeftRadius: 16, 
                borderTopRightRadius: 16, 
                border: activeTab === 'financials' ? '1px solid #334155' : 'none', 
                borderBottom: 'none', 
                fontWeight: 700, 
                fontSize: '0.85rem', 
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <span>🛒</span>
              <span>Line Items & Financials</span>
            </button>
            <button 
              onClick={() => setActiveTab('customer')}
              style={{ 
                padding: '12px 20px', 
                background: activeTab === 'customer' ? '#0f172a' : 'transparent', 
                color: activeTab === 'customer' ? '#6366f1' : '#94a3b8', 
                borderTopLeftRadius: 16, 
                borderTopRightRadius: 16, 
                border: activeTab === 'customer' ? '1px solid #334155' : 'none', 
                borderBottom: 'none', 
                fontWeight: 700, 
                fontSize: '0.85rem', 
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <span>👤</span>
              <span>Customer & WhatsApp Success</span>
            </button>
            <button 
              onClick={() => setActiveTab('logistics')}
              style={{ 
                padding: '12px 20px', 
                background: activeTab === 'logistics' ? '#0f172a' : 'transparent', 
                color: activeTab === 'logistics' ? '#6366f1' : '#94a3b8', 
                borderTopLeftRadius: 16, 
                borderTopRightRadius: 16, 
                border: activeTab === 'logistics' ? '1px solid #334155' : 'none', 
                borderBottom: 'none', 
                fontWeight: 700, 
                fontSize: '0.85rem', 
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <span>🚚</span>
              <span>Courier Logistics & Timeline</span>
            </button>
            <button 
              onClick={() => setActiveTab('whatsapp_chat')}
              style={{ 
                padding: '12px 20px', 
                background: activeTab === 'whatsapp_chat' ? '#0f172a' : 'transparent', 
                color: activeTab === 'whatsapp_chat' ? '#6366f1' : '#94a3b8', 
                borderTopLeftRadius: 16, 
                borderTopRightRadius: 16, 
                border: activeTab === 'whatsapp_chat' ? '1px solid #334155' : 'none', 
                borderBottom: 'none', 
                fontWeight: 700, 
                fontSize: '0.85rem', 
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <span>💬</span>
              <span>Live WhatsApp Chat</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 28, background: '#0f172a', color: '#f1f5f9', position: 'relative' }}>
          
          {/* TAB 1: Line Items & Financials */}
          {activeTab === 'financials' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 28 }}>
              
              {/* Left Side: Line Items List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 20, overflow: 'hidden' }}>
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid #334155', display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff' }}>🛒 Order Contents</span>
                    <button 
                      onClick={() => setShowProductSearch(true)} 
                      style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(79,70,229,0.3)' }}
                    >
                      + Smart Add Item
                    </button>
                  </div>

                  <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {localItems.map((item, idx) => {
                      const matched = masterProducts.find(mp => mp.sku === item.sku || mp.parent_title === item.title);
                      const stockQty = matched?.inventory_qty ?? matched?.stock ?? 10;
                      const unitCost = matched?.unit_cost ?? matched?.landed_cost ?? 0;
                      const itemRevenue = parseFloat(item.price) * parseInt(item.quantity);
                      const itemCost = parseFloat(unitCost) * parseInt(item.quantity);
                      const itemMargin = itemRevenue > 0 ? Math.round(((itemRevenue - itemCost) / itemRevenue) * 100) : 0;

                      return (
                        <div key={item.id || idx} style={{ display: 'flex', gap: 16, paddingBottom: 16, borderBottom: idx === localItems.length - 1 ? 'none' : '1px solid #334155' }}>
                          <div style={{ width: 64, height: 64, borderRadius: 14, background: '#0f172a', border: '1px solid #334155', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                            {item.image_url ? <img src={item.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#64748b' }}>{item.sku?.slice(0,3)}</span>}
                          </div>

                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>{item.title}</div>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 2 }}>{item.variant_title} • SKU: {item.sku || '—'}</div>
                            
                            {/* Live Stock & Margin Badges */}
                            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                              <span style={{ background: stockQty > 5 ? '#10b98120' : '#f59e0b20', color: stockQty > 5 ? '#10b981' : '#f59e0b', padding: '2px 8px', borderRadius: 10, fontSize: '0.7rem', fontWeight: 700 }}>
                                {stockQty > 5 ? `📦 In Stock (${stockQty})` : `⚠️ Low Stock (${stockQty})`}
                              </span>
                              <span style={{ background: '#6366f120', color: '#818cf8', padding: '2px 8px', borderRadius: 10, fontSize: '0.7rem', fontWeight: 700 }}>
                                Unit Cost: Rs {parseFloat(unitCost).toLocaleString()} | Margin: {itemMargin}%
                              </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
                              <div style={{ display: 'flex', alignItems: 'center', background: '#0f172a', border: '1px solid #334155', borderRadius: 10, overflow: 'hidden' }}>
                                <button style={{ background: 'transparent', border: 'none', color: '#fff', padding: '4px 10px', cursor: 'pointer', fontWeight: 700 }} onClick={() => {
                                  const newItems = [...localItems];
                                  newItems[idx].quantity = Math.max(1, newItems[idx].quantity - 1);
                                  setLocalItems(newItems);
                                }}>-</button>
                                <span style={{ padding: '0 10px', fontSize: '0.85rem', fontWeight: 700 }}>{item.quantity}</span>
                                <button style={{ background: 'transparent', border: 'none', color: '#fff', padding: '4px 10px', cursor: 'pointer', fontWeight: 700 }} onClick={() => {
                                  const newItems = [...localItems];
                                  newItems[idx].quantity += 1;
                                  setLocalItems(newItems);
                                }}>+</button>
                              </div>
                              <button style={{ background: 'transparent', border: 'none', color: '#f43f5e', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }} onClick={() => {
                                setLocalItems(localItems.filter((_, i) => i !== idx));
                              }}>Remove</button>
                            </div>
                          </div>

                          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                            <input 
                              type="number"
                              style={{ width: 90, background: '#0f172a', border: '1px solid #334155', borderRadius: 10, padding: '6px 10px', color: '#fff', fontSize: '0.85rem', textAlign: 'right', fontWeight: 600, outline: 'none' }}
                              value={item.price}
                              onChange={(e) => {
                                const newItems = [...localItems];
                                newItems[idx].price = e.target.value;
                                setLocalItems(newItems);
                              }}
                            />
                            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#fff' }}>Rs {Math.round(item.price * item.quantity).toLocaleString()}</div>
                          </div>
                        </div>
                      );
                    })}
                    {!localItems.length && (
                      <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
                        <p style={{ margin: 0, fontSize: '0.9rem' }}>No line items in this order.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Side: Financials & Profitability Summary */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff', borderBottom: '1px solid #334155', paddingBottom: 12 }}>📊 Financial Breakdown</div>
                  
                  <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', fontSize: '0.85rem', color: '#94a3b8' }}>
                    <span>Subtotal</span>
                    <span style={{ color: '#fff', fontWeight: 700 }}>Rs {Math.round(liveSubtotal).toLocaleString()}</span>
                  </div>

                  <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', fontSize: '0.85rem', color: '#94a3b8', alignItems: 'center' }}>
                    <span>CS Discount</span>
                    <input 
                      type="number"
                      style={{ width: 90, background: '#0f172a', border: '1px solid #334155', borderRadius: 10, padding: '6px 10px', color: '#fff', fontSize: '0.85rem', textAlign: 'right', fontWeight: 600, outline: 'none' }}
                      value={localDiscount}
                      onChange={e => setLocalDiscount(e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', fontSize: '0.85rem', color: '#94a3b8', alignItems: 'center' }}>
                    <span>Shipping Fee</span>
                    <input 
                      type="number"
                      style={{ width: 90, background: '#0f172a', border: '1px solid #334155', borderRadius: 10, padding: '6px 10px', color: '#fff', fontSize: '0.85rem', textAlign: 'right', fontWeight: 600, outline: 'none' }}
                      value={editingOrder.courier_fee || 250}
                      onChange={e => setEditingOrder({ ...editingOrder, courier_fee: e.target.value })}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: 800, color: '#fff', borderTop: '1px solid #334155', paddingTop: 16 }}>
                    <span>Total Revenue</span>
                    <span>Rs {Math.round(liveTotal).toLocaleString()}</span>
                  </div>

                  {/* True Net Profit Display */}
                  <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                    <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', fontSize: '0.8rem', color: '#94a3b8' }}>
                      <span>Master Inventory Cost</span>
                      <span style={{ color: '#f43f5e', fontWeight: 700 }}>-Rs {Math.round(totalOrderCost).toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', fontSize: '0.8rem', color: '#94a3b8' }}>
                      <span>Estimated Net Profit</span>
                      <span style={{ color: netProfit > 0 ? '#10b981' : '#f43f5e', fontWeight: 800, fontSize: '0.9rem' }}>
                        Rs {Math.round(netProfit).toLocaleString()} ({profitMargin}%)
                      </span>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid #334155', paddingTop: 16, marginTop: 4 }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', marginBottom: 8 }}>INTERNAL CS NOTES (ERP ONLY)</label>
                    <textarea 
                      rows={3}
                      value={localNotes}
                      onChange={e => setLocalNotes(e.target.value)}
                      placeholder="Why was this order edited? e.g. Customer changed size, or item was out of stock."
                      style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: 12, padding: 12, color: '#fff', fontSize: '0.85rem', outline: 'none', resize: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Customer & WhatsApp Success */}
          {activeTab === 'customer' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 28 }}>
              
              {/* Left Side: Customer Info & AI Address Quality */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff', borderBottom: '1px solid #334155', paddingBottom: 12 }}>👤 Customer Details</div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>Full Name</label>
                      <input 
                        value={editingOrder.customer_name || ''} 
                        onChange={e => setEditingOrder({ ...editingOrder, customer_name: e.target.value })}
                        onBlur={() => updateOrderField && updateOrderField(editingOrder.id, 'customer_name', editingOrder.customer_name)}
                        style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: 12, padding: '10px 12px', color: '#fff', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8' }}>Phone Number</label>
                        {editingOrder.phone && <a href={`tel:${editingOrder.phone}`} style={{ fontSize: '0.75rem', color: '#6366f1', textDecoration: 'none', fontWeight: 700 }}>📞 Call via SIM</a>}
                      </div>
                      <input 
                        value={editingOrder.phone || ''} 
                        onChange={e => setEditingOrder({ ...editingOrder, phone: e.target.value })}
                        onBlur={() => updateOrderField && updateOrderField(editingOrder.id, 'phone', editingOrder.phone)}
                        style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: 12, padding: '10px 12px', color: '#fff', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>

                  {/* AI Address Quality Heuristic */}
                  <div>
                    <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8' }}>Delivery Address</label>
                      <span style={{ background: addrScore.bg, color: addrScore.color, padding: '2px 8px', borderRadius: 10, fontSize: '0.7rem', fontWeight: 700 }}>
                        {addrScore.label}
                      </span>
                    </div>
                    <textarea 
                      rows={3}
                      value={editingOrder.address || ''} 
                      onChange={e => setEditingOrder({ ...editingOrder, address: e.target.value })}
                      onBlur={() => updateOrderField && updateOrderField(editingOrder.id, 'address', editingOrder.address)}
                      style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: 12, padding: '10px 12px', color: '#fff', fontSize: '0.85rem', outline: 'none', resize: 'none', boxSizing: 'border-box' }}
                    />
                    <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Ensure sector, street, and house number are present.</span>
                      <button 
                        onClick={handleAddressCleanse} 
                        style={{ background: '#6366f120', color: '#818cf8', border: '1px solid #6366f140', padding: '6px 12px', borderRadius: 10, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                      >
                        ✨ AI Address Cleanse
                      </button>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>City</label>
                    <input 
                      value={editingOrder.city || ''} 
                      onChange={e => setEditingOrder({ ...editingOrder, city: e.target.value })}
                      onBlur={() => updateOrderField && updateOrderField(editingOrder.id, 'city', editingOrder.city)}
                      style={{ width: '50%', background: '#0f172a', border: '1px solid #334155', borderRadius: 12, padding: '10px 12px', color: '#fff', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              </div>

              {/* Right Side: WhatsApp Verification Hub & Notes */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff', borderBottom: '1px solid #334155', paddingBottom: 12 }}>💬 WhatsApp Success Hub</div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8' }}>Simulate Interactive Customer Actions</label>
                    <button 
                      onClick={() => handleWaSimulate('SEND_VERIFICATION')} 
                      disabled={waSimulating}
                      style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 12, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', gap: 8 }}
                    >
                      <span>📲 Send Verification WA Template</span>
                    </button>
                    <button 
                      onClick={() => handleWaSimulate('SIMULATE_CONFIRM')} 
                      disabled={waSimulating}
                      style={{ background: '#10b981', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 12, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', gap: 8 }}
                    >
                      <span>✅ Simulate Customer Confirm</span>
                    </button>
                    <button 
                      onClick={() => handleWaSimulate('SIMULATE_CANCEL')} 
                      disabled={waSimulating}
                      style={{ background: '#f43f5e', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 12, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', gap: 8 }}
                    >
                      <span>❌ Simulate Customer Cancel</span>
                    </button>

                    <div style={{ borderTop: '1px solid #334155', paddingTop: 16, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8' }}>Manual CS Media Actions</label>
                      <button 
                        onClick={handleSendItemImages} 
                        disabled={sendingImages || waSimulating}
                        style={{ 
                          background: 'linear-gradient(135deg, #a855f7, #ec4899)', 
                          color: '#fff', 
                          border: 'none', 
                          padding: '12px 16px', 
                          borderRadius: 12, 
                          fontSize: '0.8rem', 
                          fontWeight: 700, 
                          cursor: 'pointer', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          gap: 8,
                          boxShadow: '0 4px 12px rgba(236, 72, 153, 0.3)',
                          transition: 'transform 0.15s ease, opacity 0.15s ease',
                          opacity: (sendingImages || waSimulating) ? 0.7 : 1
                        }}
                        onMouseEnter={(e) => { if (!sendingImages && !waSimulating) e.currentTarget.style.transform = 'translateY(-1px)'; }}
                        onMouseLeave={(e) => { if (!sendingImages && !waSimulating) e.currentTarget.style.transform = 'translateY(0)'; }}
                      >
                        <span>{sendingImages ? '⏳ Sending Images...' : '📸 Send Item Images to Customer'}</span>
                      </button>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid #334155', paddingTop: 16, marginTop: 8 }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', marginBottom: 8 }}>📝 Shopify Customer Notes</label>
                    <textarea 
                      rows={4} 
                      value={editingOrder.notes || ''} 
                      onChange={e => setEditingOrder({ ...editingOrder, notes: e.target.value })}
                      onBlur={() => updateOrderField && updateOrderField(editingOrder.id, 'notes', editingOrder.notes)}
                      style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: 12, padding: '10px 12px', color: '#fff', fontSize: '0.85rem', outline: 'none', resize: 'none', boxSizing: 'border-box' }}
                      placeholder="Enter customer notes..."
                    />
                    <p style={{ fontSize: '0.7rem', color: '#64748b', margin: '4px 0 0' }}>Notes sync live with Shopify.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Courier Logistics & Timeline */}
          {activeTab === 'logistics' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 28 }}>
              
              {/* Left Side: Live Tracking Timeline */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', paddingBottom: 12 }}>
                    <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff' }}>🚚 Live Courier Tracking Timeline</span>
                    <span style={{ fontSize: '0.75rem', color: '#818cf8', fontWeight: 700, background: '#6366f120', padding: '4px 12px', borderRadius: 20 }}>
                      {editingOrder.courier || 'Standard Courier'}
                    </span>
                  </div>

                  {trackingLoading ? (
                    <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>⏳ Loading live courier milestones...</div>
                  ) : trackingData?.milestones ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingLeft: 12 }}>
                      {trackingData.milestones.map((m, idx) => (
                        <div key={m.status} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: m.done ? (m.isError ? '#4c0519' : '#1e1b4b') : '#0f172a', border: `2px solid ${m.done ? (m.isError ? '#f43f5e' : '#6366f1') : '#334155'}`, display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', fontSize: '0.8rem', flexShrink: 0 }}>
                            {m.done ? (m.isError ? '⚠️' : '✓') : ''}
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: m.done ? (m.isError ? '#f43f5e' : '#fff') : '#64748b' }}>{m.label}</h4>
                              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{m.date}</span>
                            </div>
                            <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
                              {m.status === 'Booked' && `Tracking #: ${editingOrder.tracking_number || 'Pending'}`}
                              {m.status === 'In Transit' && 'Package is moving through courier logistics network.'}
                              {m.status === 'Out for Delivery' && 'Rider is out for delivery. Keep phone available.'}
                              {m.status === 'Attempted' && `Attempt failed. Reason: ${editingOrder.cs_notes || 'Customer unavailable'}`}
                              {m.status === 'Delivered' && 'Shipment delivered successfully.'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                      <p style={{ margin: 0, fontSize: '0.9rem' }}>No tracking timeline available. Book courier to generate milestones.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Side: 1-Click Courier Booking Controls */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff', borderBottom: '1px solid #334155', paddingBottom: 12 }}>🚀 Instant Courier Booking</div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8' }}>Assign & Generate Tracking Number</label>
                    <button 
                      onClick={() => handleBookCourier('PostEx')} 
                      disabled={bookingCourier}
                      style={{ background: '#0f172a', color: '#fff', border: '1px solid #6366f1', padding: '12px 16px', borderRadius: 12, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyItems: 'space-between', justifyContent: 'space-between' }}
                    >
                      <span>🚀 Book with PostEx</span>
                      <span style={{ fontSize: '0.75rem', color: '#818cf8' }}>API Active</span>
                    </button>
                    <button 
                      onClick={() => handleBookCourier('Instaworld')} 
                      disabled={bookingCourier}
                      style={{ background: '#0f172a', color: '#fff', border: '1px solid #10b981', padding: '12px 16px', borderRadius: 12, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyItems: 'space-between', justifyContent: 'space-between' }}
                    >
                      <span>🚀 Book with Instaworld</span>
                      <span style={{ fontSize: '0.75rem', color: '#34d399' }}>API Active</span>
                    </button>
                    <button 
                      onClick={() => handleBookCourier('Leopards')} 
                      disabled={bookingCourier}
                      style={{ background: '#0f172a', color: '#fff', border: '1px solid #f59e0b', padding: '12px 16px', borderRadius: 12, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyItems: 'space-between', justifyContent: 'space-between' }}
                    >
                      <span>🚀 Book with Leopards</span>
                      <span style={{ fontSize: '0.75rem', color: '#fbbf24' }}>API Active</span>
                    </button>
                  </div>

                  {editingOrder.tracking_number && (
                    <div style={{ borderTop: '1px solid #334155', paddingTop: 16, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Assigned Tracking Number:</div>
                      <div style={{ background: '#0f172a', border: '1px solid #334155', padding: '10px 14px', borderRadius: 12, fontSize: '1rem', fontMono: true, fontWeight: 800, color: '#6366f1', textAlign: 'center' }}>
                        {editingOrder.tracking_number}
                      </div>
                      <a 
                        href={`/track/${editingOrder.tracking_slug || 'tr_mock_slug'}`} 
                        target="_blank" 
                        rel="noreferrer"
                        style={{ background: '#6366f1', color: '#fff', padding: '10px 16px', borderRadius: 12, fontSize: '0.8rem', fontWeight: 700, textDecoration: 'none', textAlign: 'center', display: 'block', boxShadow: '0 4px 12px rgba(99,102,241,0.3)' }}
                      >
                        🌐 Open Public Tracking Portal
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Live WhatsApp Chat */}
          {activeTab === 'whatsapp_chat' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 28, height: 'calc(100vh - 340px)', minHeight: 500 }}>
              {/* Left Side: Active Chat Window */}
              <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 20, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)' }}>
                {/* Chat Header */}
                <div style={{ padding: '16px 24px', borderBottom: '1px solid #334155', background: '#0f172a', display: 'flex', alignItems: 'center', justifyItems: 'space-between', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#6366f120', border: '1px solid #6366f1', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                      👤
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>{editingOrder.customer_name}</span>
                        {editingOrder.wa_verification_status && (
                          <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 10, background: editingOrder.wa_verification_status?.toLowerCase() === 'verified' ? '#10b98120' : editingOrder.wa_verification_status === 'Cancelled' ? '#ef444420' : '#f59e0b20', color: editingOrder.wa_verification_status?.toLowerCase() === 'verified' ? '#10b981' : editingOrder.wa_verification_status === 'Cancelled' ? '#ef4444' : '#f59e0b', fontWeight: 'bold' }}>
                            {editingOrder.wa_verification_status}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>+{(editingOrder.phone || '').replace(/^\+/, '')} • Baileys WebSocket: {botStatus === 'CONNECTED' ? '🟢 Active' : (botStatus === 'DISABLED' ? '🛑 Disabled locally' : '🔴 Disconnected (Refresh Required)')}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    {/* Inline Verification Status Buttons */}
                    <div style={{ display: 'flex', gap: 6, background: '#1e293b', padding: '4px 8px', borderRadius: 12, border: '1px solid #334155' }}>
                      <button 
                        onClick={() => handleWaSimulate('SIMULATE_CONFIRM')}
                        disabled={waSimulating}
                        style={{ background: '#10b98120', color: '#10b981', border: 'none', borderRadius: 8, padding: '4px 8px', fontSize: '0.7rem', fontWeight: 'bold', cursor: 'pointer' }}
                        title="Confirm Verification Status"
                      >
                        Confirm ✅
                      </button>
                      <button 
                        onClick={() => handleWaSimulate('SIMULATE_CANCEL')}
                        disabled={waSimulating}
                        style={{ background: '#ef444420', color: '#ef4444', border: 'none', borderRadius: 8, padding: '4px 8px', fontSize: '0.7rem', fontWeight: 'bold', cursor: 'pointer' }}
                        title="Cancel Order via WA"
                      >
                        Cancel ❌
                      </button>
                    </div>

                    {/* Chat Keyword Search Box */}
                    <input 
                      type="text" 
                      placeholder="🔍 Search messages..."
                      value={chatSearchQuery}
                      onChange={e => setChatSearchQuery(e.target.value)}
                      style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '6px 12px', color: '#fff', fontSize: '0.75rem', outline: 'none', width: 140 }}
                    />

                    <button 
                      onClick={() => {
                        setChatLoading(true);
                        const apiBase = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
                        fetch(`${apiBase}/api/whatsapp-governance/chat/${editingOrder.id}/fetch-history`, { method: 'POST', headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` } })
                          .then(r => r.json())
                          .then(data => { setChatMessages(data.messages || []); setChatLoading(false); })
                          .catch(() => setChatLoading(false));
                      }} 
                      style={{ background: '#10b98120', color: '#10b981', border: '1px solid #10b981', padding: '6px 14px', borderRadius: 10, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      📂 Fetch History
                    </button>
                    <button 
                      onClick={() => {
                        setChatLoading(true);
                        const apiBase = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
                        fetch(`${apiBase}/api/whatsapp-governance/chat/${editingOrder.id}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` } })
                          .then(r => r.json())
                          .then(data => { setChatMessages(data.messages || []); setChatLoading(false); })
                          .catch(() => setChatLoading(false));
                      }} 
                      style={{ background: '#334155', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 10, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                    >
                      🔄 Refresh
                    </button>
                  </div>
                </div>

                {/* Chat Messages Area */}
                <div style={{ flex: 1, padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {chatLoading ? (
                    <div style={{ margin: 'auto', color: '#94a3b8', fontSize: '0.9rem' }}>⏳ Loading chat history from database...</div>
                  ) : chatMessages.length > 0 ? (
                    chatMessages.map(msg => {
                      const isOutgoing = msg.direction === 'outgoing';
                      return (
                        <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isOutgoing ? 'flex-end' : 'flex-start', alignSelf: isOutgoing ? 'flex-end' : 'flex-start', maxWidth: '75%' }}>
                          <div style={{ 
                            background: isOutgoing ? '#10b981' : '#334155', 
                            color: '#fff', 
                            padding: '12px 18px', 
                            borderRadius: 20, 
                            borderBottomRightRadius: isOutgoing ? 4 : 20, 
                            borderBottomLeftRadius: isOutgoing ? 20 : 4,
                            fontSize: '0.9rem',
                            lineHeight: 1.5,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                          }}>
                            {msg.media_url && (
                              <div style={{ marginBottom: 8 }}>
                                {msg.media_type === 'image' && <img src={getMediaUrlWithToken(msg.media_url)} style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8 }} />}
                                {msg.media_type === 'video' && <video src={getMediaUrlWithToken(msg.media_url)} controls style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8 }} />}
                                {(msg.media_type === 'audio' || msg.media_type === 'voice') && <audio src={getMediaUrlWithToken(msg.media_url)} controls style={{ maxWidth: 220 }} />}
                                {msg.media_type === 'document' && <a href={getMediaUrlWithToken(msg.media_url)} target="_blank" rel="noreferrer" style={{ color: '#fff', textDecoration: 'underline', fontWeight: 'bold' }}>📎 View Document</a>}
                              </div>
                            )}
                             {(() => {
                              const rawText = msg.message?.replace(/\[(IMAGE|AUDIO|VIDEO|DOCUMENT)\]\s*/i, '') || '';
                              if (!chatSearchQuery || !chatSearchQuery.trim()) return rawText;
                              const parts = rawText.split(new RegExp(`(${chatSearchQuery.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')})`, 'gi'));
                              return parts.map((part, i) => 
                                part.toLowerCase() === chatSearchQuery.toLowerCase() 
                                  ? <mark key={i} style={{ background: '#f59e0b', color: '#000', padding: '1px 3px', borderRadius: 4, fontWeight: 'bold' }}>{part}</mark> 
                                  : part
                              );
                            })()}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 4, padding: '0 6px' }}>
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {isOutgoing ? (msg.status === 'sent' ? '✓ Sent' : '✓✓ Delivered') : 'Customer'}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ margin: 'auto', textAlign: 'center', color: '#64748b', padding: 40 }}>
                      <p style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>No messages found for +{(editingOrder.phone || '').replace(/^\+/, '')}</p>
                      <p style={{ fontSize: '0.8rem', margin: 0 }}>Start the conversation by typing a message below or clicking a quick reply pill!</p>
                    </div>
                  )}
                  {isTyping && (
                    <div style={{ alignSelf: 'flex-start', background: '#334155', color: '#fff', padding: '8px 16px', borderRadius: 20, fontSize: '0.85rem', fontStyle: 'italic', opacity: 0.8 }}>
                      Customer is typing...
                    </div>
                  )}
                  <div id="chat-end" />
                </div>

                {/* Quick Reply Pills */}
                <div style={{ padding: '10px 24px', background: '#0f172a', borderTop: '1px solid #334155', display: 'flex', alignItems: 'center', gap: 12, overflowX: 'auto' }}>
                  <div style={{ display: 'flex', gap: 8, overflowX: 'auto', flex: 1 }}>
                    {quickPills.map((pill) => (
                      <button
                        key={pill.id}
                        onClick={() => handleSendWaMessage(pill.pill_text)}
                        disabled={sendingWaMsg}
                        style={{ 
                          background: '#334155', 
                          color: '#f1f5f9', 
                          border: '1px solid #475569', 
                          padding: '6px 14px', 
                          borderRadius: 16, 
                          fontSize: '0.75rem', 
                          fontWeight: 600, 
                          whiteSpace: 'nowrap',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#475569'}
                        onMouseLeave={e => e.currentTarget.style.background = '#334155'}
                      >
                        ⚡ {pill.pill_text.slice(0, 30)}...
                      </button>
                    ))}
                  </div>
                  <button 
                    onClick={() => setShowPillsManager(!showPillsManager)}
                    style={{ background: showPillsManager ? '#6366f1' : '#334155', border: 'none', borderRadius: 8, padding: '6px 10px', color: '#fff', fontSize: '0.75rem', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}
                    title="Manage Quick Reply Pills"
                  >
                    ⚙️ Manage Pills
                  </button>
                </div>

                {/* Pills Manager Section */}
                {showPillsManager && (
                  <div style={{ background: '#1e293b', borderTop: '1px solid #334155', padding: '12px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ fontWeight: 800, fontSize: '0.8rem', color: '#fff' }}>⚙️ Manage Quick Reply Pills</div>
                    <form onSubmit={handleCreateQuickPill} style={{ display: 'flex', gap: 8 }}>
                      <input 
                        type="text" 
                        placeholder="Add new quick pill text..."
                        value={newPillText}
                        onChange={e => setNewPillText(e.target.value)}
                        required
                        style={{ flex: 1, background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: '0.8rem', outline: 'none' }}
                      />
                      <button type="submit" style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>Add</button>
                    </form>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                      {quickPills.map(p => (
                        <div key={p.id} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', color: '#fff' }}>
                          <span>{p.pill_text}</span>
                          <button onClick={() => handleDeleteQuickPill(p.id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}>✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick Reply Selection Overlay */}
                {showQuickReplyPanel && (
                  <div style={{ background: '#1e293b', borderTop: '1px solid #334155', borderBottom: '1px solid #334155', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 300, overflowY: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 800, fontSize: '0.85rem', color: '#fff' }}>⚡ Saved Quick Replies (Templates)</span>
                      <button 
                        onClick={() => setShowTemplateCreator(!showTemplateCreator)} 
                        style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                      >
                        {showTemplateCreator ? '✕ Close Creator' : '➕ Create New'}
                      </button>
                    </div>

                    {showTemplateCreator && (
                      <form onSubmit={handleCreateQuickReply} style={{ background: '#0f172a', padding: 16, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid #334155' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#6366f1' }}>Create Quick Reply Template</div>
                        <input 
                          type="text" 
                          placeholder="Template Title (e.g. postex_video_guide)"
                          value={quickReplyTitle}
                          onChange={e => setQuickReplyTitle(e.target.value)}
                          required
                          style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: '0.8rem', outline: 'none' }}
                        />
                        <textarea 
                          placeholder="Caption / Message Text (use {{customer_name}} or {{order_id}} for dynamic fields)"
                          value={quickReplyCaption}
                          onChange={e => setQuickReplyCaption(e.target.value)}
                          rows={2}
                          style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: '0.8rem', outline: 'none', resize: 'vertical' }}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Optional Media (Image or Video):</span>
                          <input 
                            type="file" 
                            accept="image/*,video/*"
                            onChange={e => setQuickReplyMedia(e.target.files[0])}
                            style={{ fontSize: '0.75rem', color: '#94a3b8' }}
                          />
                        </div>
                        <button 
                          type="submit" 
                          disabled={sendingWaMsg}
                          style={{ background: '#10b981', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-start' }}
                        >
                          {sendingWaMsg ? 'Saving...' : 'Save Template'}
                        </button>
                      </form>
                    )}

                    {/* Search templates input */}
                    <input 
                      type="text" 
                      placeholder="🔍 Search templates by title/caption..."
                      onChange={(e) => {
                        const q = e.target.value.toLowerCase();
                        const cards = e.currentTarget.nextSibling.childNodes;
                        cards.forEach(card => {
                          const title = card.childNodes[1]?.innerText.toLowerCase() || '';
                          const caption = card.childNodes[3]?.innerText.toLowerCase() || '';
                          if (title.includes(q) || caption.includes(q)) {
                            card.style.display = 'flex';
                          } else {
                            card.style.display = 'none';
                          }
                        });
                      }}
                      style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '6px 12px', color: '#fff', fontSize: '0.75rem', outline: 'none' }}
                    />

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginTop: 4 }}>
                      {quickReplies.length > 0 ? (
                        quickReplies.map(qr => (
                          <div key={qr.id} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, position: 'relative' }}>
                            <button 
                              onClick={() => handleDeleteQuickReply(qr.id)}
                              style={{ position: 'absolute', top: 8, right: 8, background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.85rem' }}
                              title="Delete"
                            >
                              🗑️
                            </button>
                            <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#fff', paddingRight: 20 }}>{qr.title}</div>
                            
                            {qr.media_url && (
                              <div style={{ width: '100%', height: 80, borderRadius: 6, background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                {qr.media_type === 'image' ? (
                                  <img src={getMediaUrlWithToken(qr.media_url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                  <video src={getMediaUrlWithToken(qr.media_url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted preload="metadata" />
                                )}
                              </div>
                            )}
                            
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', maxHeight: 40, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', whiteSpace: 'normal' }}>
                              {qr.caption || '(No caption)'}
                            </div>
                            
                            <button 
                              onClick={() => handleSendQuickReply(qr.id)}
                              disabled={sendingWaMsg}
                              style={{ background: '#10b98120', color: '#10b981', border: '1px solid #10b98140', borderRadius: 8, padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 'auto' }}
                            >
                              ⚡ Send Template
                            </button>
                          </div>
                        ))
                      ) : (
                        <div style={{ color: '#64748b', fontSize: '0.75rem', padding: '12px 0' }}>No custom media quick replies saved yet. Click "Create New" above to save one.</div>
                      )}
                    </div>
                  </div>
                )}

                {/* Chat Input Bar */}
                <div style={{ padding: '16px 24px', background: '#0f172a', borderTop: '1px solid #334155', display: 'flex', gap: 12, alignItems: 'center' }}>
                  {!isRecording ? (
                    <>
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        style={{ background: '#334155', border: 'none', borderRadius: '50%', width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                        title="Attach File"
                      >
                        📎
                      </button>
                      <button 
                        onClick={() => setShowQuickReplyPanel(!showQuickReplyPanel)}
                        style={{ background: showQuickReplyPanel ? '#6366f1' : '#334155', color: '#fff', border: 'none', borderRadius: '50%', width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                        title="Quick Reply Templates"
                      >
                        ⚡
                      </button>
                      <button 
                        onClick={startRecording}
                        style={{ background: '#334155', border: 'none', borderRadius: '50%', width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                        title="Record Voice Note"
                      >
                        🎙️
                      </button>
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        style={{ display: 'none' }} 
                        accept="image/*,video/*,application/pdf,audio/*"
                        onChange={handleFileAttach}
                      />
                      <input 
                        type="text" 
                        placeholder={`Type a message to ${editingOrder.customer_name}...`}
                        value={newWaMsg}
                        onChange={e => setNewWaMsg(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSendWaMessage()}
                        onPaste={(e) => {
                          const items = e.clipboardData?.items;
                          if (!items) return;
                          for (const item of items) {
                            if (item.type.startsWith('image/')) {
                              const file = item.getAsFile();
                              if (file) {
                                const mockEvent = { target: { files: [file] } };
                                handleFileAttach(mockEvent);
                              }
                            }
                          }
                        }}
                        style={{ flex: 1, background: '#1e293b', border: '1px solid #334155', borderRadius: 16, padding: '12px 18px', color: '#fff', fontSize: '0.9rem', outline: 'none' }}
                      />
                    </>
                  ) : (
                    <div style={{ flex: 1, background: '#1e293b', border: '1px solid #334155', borderRadius: 16, padding: '10px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#fff' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1.5s infinite' }} />
                        <style>{`
                          @keyframes pulse {
                            0% { opacity: 0.3; }
                            50% { opacity: 1; }
                            100% { opacity: 0.3; }
                          }
                        `}</style>
                        <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#ef4444' }}>
                          Recording Audio: {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, '0')}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <button 
                          onClick={() => stopRecording(false)} 
                          style={{ background: '#ef444420', color: '#ef4444', border: '1px solid #ef444440', borderRadius: 8, padding: '4px 12px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                          ✕ Cancel
                        </button>
                        <button 
                          onClick={() => stopRecording(true)} 
                          style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 8, padding: '4px 12px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                          ✓ Send PTT
                        </button>
                      </div>
                    </div>
                  )}

                  {isUploadingMedia && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#10b98120', borderRadius: 12, border: '1px solid #10b98140', flexShrink: 0 }}>
                      <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 700 }}>📤 Sending...</span>
                    </div>
                  )}
                  
                  {!isRecording && (
                    <button
                      onClick={() => handleSendWaMessage()}
                      disabled={sendingWaMsg || !newWaMsg.trim()}
                      style={{ 
                        background: '#10b981', 
                        color: '#fff', 
                        border: 'none', 
                        padding: '12px 24px', 
                        borderRadius: 16, 
                        fontSize: '0.9rem', 
                        fontWeight: 700, 
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(16,185,129,0.3)',
                        opacity: (!newWaMsg.trim() || sendingWaMsg) ? 0.5 : 1,
                        flexShrink: 0
                      }}
                    >
                      {sendingWaMsg ? '⏳...' : 'Send 🚀'}
                    </button>
                  )}
                </div>
              </div>

              {/* Right Side: Agent Guidelines & Shortcuts */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* PDF Invoice Button Card */}
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff', borderBottom: '1px solid #334155', paddingBottom: 8 }}>📄 Financial Invoice Actions</div>
                  <button 
                    onClick={handleSendInvoice}
                    disabled={sendingInvoice}
                    style={{ 
                      background: '#6366f1', 
                      color: '#fff', 
                      border: 'none', 
                      padding: '12px 18px', 
                      borderRadius: 12, 
                      fontSize: '0.85rem', 
                      fontWeight: 700, 
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      boxShadow: '0 4px 12px rgba(99,102,241,0.3)',
                      opacity: sendingInvoice ? 0.7 : 1
                    }}
                  >
                    {sendingInvoice ? '⏳ Generating Invoice...' : '📄 Send PDF Invoice via WA'}
                  </button>
                </div>

                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff', borderBottom: '1px solid #334155', paddingBottom: 12 }}>💡 Agent Best Practices</div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.8, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <li><strong style={{ color: '#fff' }}>Keep it Conversational</strong>: Speak politely and use local vernacular (e.g. Sir/Ma'am).</li>
                    <li><strong style={{ color: '#fff' }}>Instant Quick Replies</strong>: Click any pill above the text box to instantly fire standard delivery updates.</li>
                    <li><strong style={{ color: '#fff' }}>WebSocket Speed</strong>: Messages are sent instantly via Baileys WebSocket without needing WhatsApp Web or Chrome.</li>
                    <li><strong style={{ color: '#fff' }}>Auto-Verification Check</strong>: If the customer replies with "Confirm" or "Yes", the ERP will automatically update the order status to Verified!</li>
                  </ul>
                  <div style={{ background: '#10b98120', border: '1px solid #10b98140', padding: 16, borderRadius: 14, color: '#10b981', fontSize: '0.8rem', fontWeight: 700, marginTop: 8 }}>
                    🔒 100% Safe 1-on-1 Chatting: Manual agent messages carry zero ban risk.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Pillar 2: Smart Auto-Complete Product Search Popover/Modal */}
          {showProductSearch && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.98)', zIndex: 3000, display: 'flex', flexDirection: 'column', padding: 32, backdropFilter: 'blur(12px)' }}>
              <div style={{ display: 'flex', justifyItems: 'space-between', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', paddingBottom: 16, marginBottom: 20 }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#fff' }}>🔍 Smart Hierarchical Product Selector</h3>
                <button onClick={() => setShowProductSearch(false)} style={{ background: '#334155', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 10, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>✕ Close</button>
              </div>

              <input 
                type="text" 
                placeholder="Search by Parent Title, Color, Size, or SKU..." 
                value={productSearchQuery}
                onChange={e => setProductSearchQuery(e.target.value)}
                style={{ width: '100%', background: '#0f172a', border: '2px solid #6366f1', borderRadius: 16, padding: '14px 20px', color: '#fff', fontSize: '1rem', outline: 'none', marginBottom: 24, boxSizing: 'border-box' }}
                autoFocus
              />

              <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
                {filteredGroups.map(g => (
                  <ParentProductCard 
                    key={g.parent_title} 
                    g={g} 
                    localItems={localItems} 
                    setLocalItems={setLocalItems} 
                    setShowProductSearch={setShowProductSearch} 
                    productSearchQuery={productSearchQuery} 
                  />
                ))}
                {!filteredGroups.length && (
                  <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 60, color: '#64748b' }}>
                    <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>No master products match your search criteria.</p>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Sticky Bottom Action Bar */}
        <div style={{ padding: '16px 28px', borderTop: '1px solid #334155', background: '#1e293b', display: 'flex', alignItems: 'center', justifyItems: 'space-between', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
            <span>Editing Store Order • </span>
            <span style={{ color: '#fff', fontWeight: 700 }}>{editingOrder.customer_name}</span>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button 
              onClick={() => handleBookCourier(editingOrder.courier || 'PostEx')} 
              disabled={bookingCourier}
              style={{ background: '#0f172a', color: '#6366f1', border: '1px solid #6366f1', padding: '10px 20px', borderRadius: 12, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}
            >
              🚀 Book Courier
            </button>
            <button 
              onClick={() => window.print()} 
              style={{ background: '#0f172a', color: '#10b981', border: '1px solid #10b981', padding: '10px 20px', borderRadius: 12, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}
            >
              🖨️ Print Packing Slip
            </button>
            <button 
              onClick={handleCSUpdate} 
              disabled={isSavingCS}
              style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 12, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(99,102,241,0.3)' }}
            >
              {isSavingCS ? '⏳ Saving...' : '💾 Save Changes'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

// Dedicated Sub-Component for Parent Product Card with Color Category Pills & Size Matrix
function ParentProductCard({ g, localItems, setLocalItems, setShowProductSearch, productSearchQuery }) {
  const colorKeys = Object.keys(g.colors);
  const [activeColor, setActiveColor] = useState(colorKeys[0] || 'Default');

  // If search query matches a specific color, auto-select it!
  useEffect(() => {
    if (productSearchQuery.trim()) {
      const q = productSearchQuery.toLowerCase().trim();
      const matchedColor = colorKeys.find(c => c.toLowerCase().includes(q));
      if (matchedColor) setActiveColor(matchedColor);
    }
  }, [productSearchQuery, colorKeys]);

  const activeColorData = g.colors[activeColor] || g.colors[colorKeys[0]];
  if (!activeColorData) return null;

  return (
    <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 20, padding: 20, display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)' }}>
      {/* Header: Title & Image */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: 12, background: '#0f172a', border: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
          {g.image_url ? <img src={g.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '1.2rem' }}>🏷️</span>}
        </div>
        <div>
          <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#fff' }}>{g.parent_title}</h4>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{colorKeys.length} Color{colorKeys.length > 1 ? 's' : ''} • {g.all_skus.length} Variant{g.all_skus.length > 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Color Category Pills */}
      {colorKeys.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid #334155', borderBottom: '1px solid #334155', padding: '12px 0' }}>
          {colorKeys.map(cName => {
            const isSelected = activeColor === cName;
            return (
              <button
                key={cName}
                onClick={() => setActiveColor(cName)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 20,
                  background: isSelected ? '#6366f1' : '#0f172a',
                  color: isSelected ? '#fff' : '#94a3b8',
                  border: `1px solid ${isSelected ? '#6366f1' : '#334155'}`,
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: isSelected ? '0 4px 12px rgba(99,102,241,0.3)' : 'none'
                }}
              >
                {cName}
              </button>
            );
          })}
        </div>
      )}

      {/* Size Matrix Buttons */}
      <div>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Select Size for {activeColor}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
          {activeColorData.sizes.map(sz => {
            const stockQty = sz.inventory_qty ?? sz.stock ?? 0;
            const isOutOfStock = stockQty <= 0;
            const unitCost = sz.unit_cost ?? sz.landed_cost ?? 0;

            return (
              <button
                key={sz.id || sz.sku}
                onClick={() => {
                  setLocalItems([
                    ...localItems,
                    {
                      id: Date.now() + Math.random(),
                      sku: sz.sku,
                      title: g.parent_title,
                      variant_title: sz.variant_title || `${sz.clean_size} / ${sz.clean_color}`,
                      quantity: 1,
                      price: sz.selling_price || sz.unit_cost || 1000,
                      image_url: sz.image_url || g.image_url
                    }
                  ]);
                  setShowProductSearch(false);
                }}
                style={{
                  background: isOutOfStock ? 'rgba(244,63,94,0.05)' : '#0f172a',
                  border: `1px solid ${isOutOfStock ? 'rgba(244,63,94,0.3)' : '#334155'}`,
                  borderRadius: 14,
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  position: 'relative',
                  overflow: 'hidden'
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = isOutOfStock ? '#f43f5e' : '#6366f1'}
                onMouseLeave={e => e.currentTarget.style.borderColor = isOutOfStock ? 'rgba(244,63,94,0.3)' : '#334155'}
              >
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: isOutOfStock ? '#f43f5e' : '#fff' }}>
                  {sz.clean_size}
                </div>
                <div style={{ fontSize: '0.7rem', color: isOutOfStock ? '#f43f5e' : '#10b981', fontWeight: 700 }}>
                  {isOutOfStock ? '⚠️ Out of Stock' : `📦 Stock: ${stockQty}`}
                </div>
                <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
                  Cost: Rs {parseFloat(unitCost).toLocaleString()}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
