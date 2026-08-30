document.addEventListener('DOMContentLoaded', async () => {
  const ERP_API_URL = 'https://trace-erp-production.up.railway.app/api/public/extension-tag-order';
  const orderInput = document.getElementById('order-id-input');
  const toast = document.getElementById('status-toast');
  const buttons = document.querySelectorAll('.tag-btn');

  function showToast(msg, type = 'success') {
    toast.style.display = 'block';
    toast.className = type === 'success' ? 'toast-success' : 'toast-error';
    toast.innerHTML = msg;
    setTimeout(() => {
      toast.style.display = 'none';
    }, 3000);
  }

  // Try to auto-detect Order ID from active Chrome Tab
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      const match = tab.url.match(/\/orders\/(\d+)/);
      if (match) {
        orderInput.value = match[1];
      }
    }
  } catch (e) {
    console.log('Tab query error:', e);
  }

  buttons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const orderId = orderInput.value.trim();
      if (!orderId) {
        showToast('⚠️ Please enter an Order ID or open a Shopify Order page!', 'error');
        orderInput.focus();
        return;
      }

      const tag = btn.getAttribute('data-tag');
      btn.classList.add('btn-loading');

      try {
        const res = await fetch(ERP_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shopify_order_id: orderId, tag, action: 'add' })
        });

        const data = await res.json();
        if (data.success) {
          showToast(`✅ Tag <strong>"${tag}"</strong> applied! Reloading...`, 'success');
          try {
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (activeTab && activeTab.id) {
              setTimeout(() => {
                chrome.tabs.reload(activeTab.id);
              }, 600);
            }
          } catch(tabErr){}
        } else {
          showToast(`❌ Error: ${data.error || 'Failed to apply tag'}`, 'error');
        }
      } catch (err) {
        console.error('Extension error:', err);
        showToast('❌ Server error: Unable to reach TRACE ERP', 'error');
      } finally {
        btn.classList.remove('btn-loading');
      }
    });
  });
});
