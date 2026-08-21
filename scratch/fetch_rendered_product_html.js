const fetch = require('node-fetch');

async function checkRenderedHtml() {
  try {
    const res = await fetch('https://tracepk.com/products/multi-reflector-pum-a');
    const html = await res.text();
    
    console.log('Includes trace-product-rating-wrapper:', html.includes('trace-product-rating-wrapper'));
    console.log('Includes trace-view-video-btn:', html.includes('trace-view-video-btn'));
    
    // Find rating wrapper index
    const idx = html.indexOf('trace-product-rating-wrapper');
    if (idx !== -1) {
      console.log('Snippet around rating wrapper:\n', html.substring(idx - 100, idx + 400));
    }
  } catch (err) {
    console.error('Error fetching html:', err);
  }
}

checkRenderedHtml();
