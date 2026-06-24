chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetch_images') {
    fetchImages(request.urls)
      .then(images => sendResponse({ success: true, images }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open for async response
  }
});

async function fetchImages(urls) {
  const fetchedImages = [];
  for (let i = 0; i < urls.length; i++) {
    try {
      let response;
      try {
        console.log(`Trace Background: Requesting image via helper proxy: ${urls[i]}`);
        response = await fetch(`http://127.0.0.1:9099/fetch-image?url=${encodeURIComponent(urls[i])}`);
        if (!response.ok) throw new Error(`Helper proxy returned HTTP ${response.status}`);
      } catch (helperErr) {
        console.warn(`Trace Background: Helper proxy failed (${helperErr.message}). Trying direct fetch...`);
        response = await fetch(urls[i]);
      }

      const buffer = await response.arrayBuffer();
      const contentType = response.headers.get('content-type') || 'image/png';
      
      // Convert ArrayBuffer to base64 safely without call stack limit errors
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let j = 0; j < bytes.byteLength; j++) {
        binary += String.fromCharCode(bytes[j]);
      }
      const base64 = btoa(binary);

      fetchedImages.push({
        base64,
        type: contentType,
        url: urls[i]
      });
      console.log(`Trace Background: Loaded image ${i+1}/${urls.length}`);
    } catch (err) {
      console.error(`Trace Background: Failed to load image at index ${i}:`, err);
    }
  }
  return fetchedImages;
}
