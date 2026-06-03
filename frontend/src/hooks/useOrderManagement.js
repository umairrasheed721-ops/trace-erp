import { useState, useEffect, useMemo, useRef, useCallback } from 'react';

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

  const handleSendInvoice = useCallback(async () => {
    setSendingInvoice(true);
    try {
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
  }, [apiBase, editingOrder]);

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
    const file = e.target?.files?.[0] || e.target?.files?.[0];
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

  const handleCSUpdate = useCallback(async () => {
    setIsSavingCS(true);
    try {
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
  }, [apiBase, localItems, localDiscount, localNotes, editingOrder, setEditingOrder]);

  const handleWaSimulate = useCallback((action) => {
    setWaSimulating(true);
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
  }, [apiBase, editingOrder, fetchOrderDetails, setEditingOrder]);

  const handleSendItemImages = useCallback(async () => {
    setSendingImages(true);
    try {
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
  }, [apiBase, editingOrder, activeTab]);

  const handleAddressCleanse = useCallback(() => {
    if (!editingOrder?.address) return;
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
  }, [editingOrder, setEditingOrder, updateOrderField]);

  const handleBookCourier = useCallback((courierName) => {
    setBookingCourier(true);
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
  }, [apiBase, editingOrder, fetchOrderDetails, setEditingOrder]);

  // Live Math & Profit Margins
  const liveSubtotal = useMemo(() => {
    return localItems.reduce((acc, item) => acc + ((parseFloat(item.price) || 0) * (parseInt(item.quantity) || 0)), 0);
  }, [localItems]);

  const liveTotal = useMemo(() => {
    return Math.max(0, liveSubtotal - parseFloat(localDiscount || 0) + parseFloat(editingOrder?.courier_fee || 250));
  }, [liveSubtotal, localDiscount, editingOrder?.courier_fee]);

  // Calculate Total Order Cost from Master Products
  const totalOrderCost = useMemo(() => {
    let total = 0;
    localItems.forEach(item => {
      const matched = masterProducts.find(mp => mp.sku === item.sku || mp.parent_title === item.title);
      const unitCost = matched?.unit_cost || matched?.landed_cost || 0;
      total += (parseFloat(unitCost) * (parseInt(item.quantity) || 1));
    });
    return total;
  }, [localItems, masterProducts]);

  const netProfit = useMemo(() => {
    return liveTotal - totalOrderCost - parseFloat(editingOrder?.courier_fee || 250);
  }, [liveTotal, totalOrderCost, editingOrder?.courier_fee]);

  const profitMargin = useMemo(() => {
    return liveTotal > 0 ? Math.round((netProfit / liveTotal) * 100) : 0;
  }, [liveTotal, netProfit]);

  // AI Address Quality Heuristic Score
  const addrScore = useMemo(() => {
    const addr = editingOrder?.address;
    if (!addr || addr.length < 10) return { label: '⚠️ Low Quality (Too Short)', color: '#f43f5e', bg: 'rgba(244,63,94,0.1)' };
    const hasNumber = /\d/.test(addr);
    const hasStreet = /(st|street|road|rd|lane|ln|block|blk|sector|sec|phase)/i.test(addr);
    if (hasNumber && hasStreet && addr.length > 15) return { label: '✅ High Quality (Courier Perfect)', color: '#10b981', bg: 'rgba(16,185,129,0.1)' };
    return { label: '⚠️ Fair Quality (Missing Street/House #)', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' };
  }, [editingOrder?.address]);

  // Group master products into Parent -> Colors -> Sizes hierarchy
  const groupedProducts = useMemo(() => {
    const groups = {};

    masterProducts.forEach(mp => {
      let pTitle = (mp.parent_title || 'Unnamed Product').trim();
      let extractedVariant = '';
      if (pTitle.includes(' - ')) {
        const parts = pTitle.split(' - ');
        pTitle = parts[0].trim();
        extractedVariant = parts.slice(1).join(' - ').trim();
      }

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

  // Helper for Levenshtein Distance
  const getEditDistance = useCallback((a, b) => {
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
  }, []);

  // Helper for Lenient Search
  const isLenientMatch = useCallback((query, target) => {
    if (!query || !target) return false;
    const qClean = query.toLowerCase().replace(/[^a-z0-9]/g, '');
    const tClean = target.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!qClean) return true;
    if (!tClean) return false;

    if (tClean.includes(qClean)) return true;

    if (qClean.length >= 3) {
      const tWords = target.toLowerCase().split(/[\s\-\/\(\)]/).filter(Boolean);
      for (const word of tWords) {
        const wClean = word.replace(/[^a-z0-9]/g, '');
        if (wClean.length >= qClean.length - 1 && wClean.length <= qClean.length + 1) {
          const dist = getEditDistance(qClean, wClean);
          if (dist <= 1 || (qClean.length >= 4 && dist <= 2)) return true;
        }
      }
    }

    return false;
  }, [getEditDistance]);

  // Filter grouped products by search query
  const filteredGroups = useMemo(() => {
    if (!productSearchQuery.trim()) return groupedProducts;
    const q = productSearchQuery.trim();
    return groupedProducts.filter(g => 
      isLenientMatch(q, g.parent_title) ||
      g.all_skus.some(sku => isLenientMatch(q, sku)) ||
      g.all_variants.some(v => isLenientMatch(q, v)) ||
      Object.keys(g.colors).some(c => isLenientMatch(q, c))
    );
  }, [groupedProducts, productSearchQuery, isLenientMatch]);

  // Effect: Fetch dependencies when order opens
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
      fetch(`${apiBase}/api/orders/${editingOrder.id}/customer-intelligence`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
      })
        .then(r => r.json())
        .then(data => { setCustIntel(data); setCustIntelLoading(false); })
        .catch(() => setCustIntelLoading(false));

      // Fetch Master Products
      const storeId = editingOrder.store_id || localStorage.getItem('activeStoreId') || 1;
      fetch(`${apiBase}/api/cost-manager?store_id=${storeId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('trace_token')}` }
      })
        .then(r => r.json())
        .then(data => setMasterProducts(Array.isArray(data) ? data : []))
        .catch(() => {});

      // Fetch Live Tracking
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
    localItems,
    setLocalItems,
    localDiscount,
    setLocalDiscount,
    localNotes,
    setLocalNotes,
    isSavingCS,
    custIntel,
    custIntelLoading,
    waSimulating,
    sendingImages,
    masterProducts,
    showProductSearch,
    setShowProductSearch,
    productSearchQuery,
    setProductSearchQuery,
    bookingCourier,
    trackingData,
    trackingLoading,
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
    sendingInvoice,
    handleCreateQuickPill,
    handleDeleteQuickPill,
    startRecording,
    stopRecording,
    handleSendInvoice,
    handleSendQuickReply,
    handleCreateQuickReply,
    handleDeleteQuickReply,
    handleSendWaMessage,
    handleFileAttach,
    handleCSUpdate,
    handleWaSimulate,
    handleSendItemImages,
    handleAddressCleanse,
    handleBookCourier,
    liveSubtotal,
    liveTotal,
    totalOrderCost,
    netProfit,
    profitMargin,
    filteredGroups,
    addrScore
  };
}
