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

async function pasteImageToField(urlListString, inputElement) {
  try {
    const urls = urlListString.split(',').map(u => u.trim()).filter(Boolean);
    console.log(`Trace Extension: Fetching ${urls.length} images...`, urls);
    
    const dataTransfer = new DataTransfer();

    for (let i = 0; i < urls.length; i++) {
      try {
        let response;
        try {
          // Attempt downloading through the local helper proxy to bypass CORS
          console.log(`Trace Extension: Requesting image via helper proxy for: ${urls[i]}`);
          response = await fetch(`http://127.0.0.1:9099/fetch-image?url=${encodeURIComponent(urls[i])}`);
          if (!response.ok) throw new Error(`Helper proxy returned HTTP ${response.status}`);
        } catch (helperErr) {
          console.warn(`Trace Extension: Helper proxy failed (${helperErr.message}). Trying direct fetch...`);
          response = await fetch(urls[i]);
        }

        const blob = await response.blob();
        const extension = blob.type.split('/')[1] || 'png';
        const file = new File([blob], `product_image_${i}.${extension}`, { type: blob.type });
        dataTransfer.items.add(file);
        console.log(`Trace Extension: Loaded image ${i+1}/${urls.length}`);
      } catch (err) {
        console.error(`Trace Extension: Failed to load image at index ${i}:`, err);
      }
    }

    if (dataTransfer.items.length === 0) {
      console.warn('Trace Extension: No images were successfully loaded.');
      return;
    }
    
    // Choose drop target: #main (main chat pane), copyable-area, or fallback to inputElement / body
    const dropTarget = document.querySelector('#main') || 
                       document.querySelector('div.copyable-area') || 
                       inputElement || 
                       document.body;

    console.log('Trace Extension: Dispatching virtual Drag/Drop events on target:', dropTarget);
    
    // Trigger dragover/dragenter first to let WhatsApp prepare the drop-overlay
    const dragEvent = new DragEvent('dragover', {
      bubbles: true,
      cancelable: true
    });
    Object.defineProperty(dragEvent, 'dataTransfer', {
      value: dataTransfer,
      writable: false,
      configurable: true
    });
    dropTarget.dispatchEvent(dragEvent);

    setTimeout(() => {
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true
      });
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: dataTransfer,
        writable: false,
        configurable: true
      });
      dropTarget.dispatchEvent(dropEvent);
      console.log('Trace Extension: Successfully simulated multi-file drop.');
    }, 500);

  } catch (err) {
    console.error('Trace Extension: Failed to download or paste image list:', err);
  }
}
