// Listen for custom trigger parameters in the URL query string
// Example: https://web.whatsapp.com/send?phone=923000000000&text=hi&autoImage=https://cdn.shopify.com/product.png

const processedUrls = new Set();

const checkUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const imageUrl = params.get('autoImage');
  
  if (imageUrl && !processedUrls.has(imageUrl)) {
    processedUrls.add(imageUrl);
    console.log('Trace Extension: Found autoImage parameter. Preparing download...', imageUrl);
    
    // Remove autoImage from URL parameters so we don't trigger it again on subsequent reloads/SPA updates
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
        
        const urls = imageUrl.split(',').map(u => u.trim()).filter(Boolean);
        console.log(`Trace Extension: Requesting background worker to download ${urls.length} images...`, urls);
        
        chrome.runtime.sendMessage({ action: 'fetch_images', urls }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Trace Extension: Background communication error:', chrome.runtime.lastError.message);
            return;
          }
          if (response && response.success && response.images) {
            pasteImagesToField(response.images, inputField);
          } else {
            console.error('Trace Extension: Failed to fetch images:', response ? response.error : 'Unknown error');
          }
        });
      }
    }, 1000);
  }
};

// Run initial check immediately (document_start guarantees we run before WhatsApp's SPA router deletes/rewrites query params)
checkUrl();

// Watch for SPA page navigation internally within WhatsApp Web
let lastUrl = location.href;
const startObserver = () => {
  if (document.body || document.documentElement) {
    new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        checkUrl();
      }
    }).observe(document.documentElement || document.body, { subtree: true, childList: true });
  } else {
    setTimeout(startObserver, 100);
  }
};
startObserver();

function pasteImagesToField(imagesList, inputElement) {
  try {
    const dataTransfer = new DataTransfer();

    for (let i = 0; i < imagesList.length; i++) {
      try {
        const img = imagesList[i];
        
        // Decode base64 back to Blob
        const byteCharacters = atob(img.base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let j = 0; j < byteCharacters.length; j++) {
          byteNumbers[j] = byteCharacters.charCodeAt(j);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: img.type });

        const extension = img.type.split('/')[1] || 'png';
        const file = new File([blob], `product_image_${i}.${extension}`, { type: img.type });
        dataTransfer.items.add(file);
        console.log(`Trace Extension: Reconstructed image ${i+1}/${imagesList.length}`);
      } catch (err) {
        console.error(`Trace Extension: Failed to reconstruct image at index ${i}:`, err);
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

      // Direct paste fallback: dispatch paste event directly on input
      console.log('Trace Extension: Dispatching virtual Paste event on input:', inputElement);
      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dataTransfer
      });
      inputElement.dispatchEvent(pasteEvent);
    }, 500);

  } catch (err) {
    console.error('Trace Extension: Failed to paste images:', err);
  }
}
