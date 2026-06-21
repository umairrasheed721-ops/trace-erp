// Listen for custom trigger parameters in the URL query string
// Example: https://web.whatsapp.com/send?phone=923000000000&text=hi&autoImage=https://cdn.shopify.com/product.png
window.addEventListener('load', () => {
  const checkUrl = () => {
    const params = new URLSearchParams(window.location.search);
    const imageUrl = params.get('autoImage');
    
    if (imageUrl) {
      console.log('Trace Extension: Found autoImage parameter. Preparing download...', imageUrl);
      
      // Remove autoImage from URL parameters so we don't trigger it again on subsequent reloads
      const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + '?' + 
                     window.location.search.replace(/&?autoImage=[^&]*/gi, '');
      window.history.replaceState({ path: newUrl }, '', newUrl);

      // Wait for the WhatsApp input box to fully render in the DOM
      const checkExist = setInterval(() => {
        // WhatsApp Web input box selector (updated for modern WhatsApp Web versions)
        const inputField = document.querySelector('div[contenteditable="true"]') || 
                           document.querySelector('footer div[role="textbox"]');
        if (inputField) {
          clearInterval(checkExist);
          pasteImageToField(imageUrl, inputField);
        }
      }, 1000);
    }
  };

  // Run initial check
  checkUrl();

  // Watch for SPA page navigation internally within WhatsApp Web
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      checkUrl();
    }
  }).observe(document, { subtree: true, childList: true });
});

async function pasteImageToField(url, inputElement) {
  try {
    console.log('Trace Extension: Fetching image blob...');
    // 1. Fetch image bytes from CDN
    const response = await fetch(url);
    const blob = await response.blob();
    
    // Create a virtual file drop event
    const file = new File([blob], "product_image.png", { type: blob.type });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    
    // 2. Dispatch drop events directly to the WhatsApp Web drop area/input field
    console.log('Trace Extension: Dispatching virtual Drag/Drop events...');
    
    // Trigger dragover/dragenter first to let WhatsApp prepare the drop-overlay
    const dragEvent = new DragEvent('dragover', {
      bubbles: true,
      cancelable: true,
      dataTransfer: dataTransfer
    });
    inputElement.dispatchEvent(dragEvent);

    setTimeout(() => {
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dataTransfer
      });
      inputElement.dispatchEvent(dropEvent);
      console.log('Trace Extension: Successfully simulated file drop.');
    }, 500);

  } catch (err) {
    console.error('Trace Extension: Failed to download or paste image:', err);
  }
}
