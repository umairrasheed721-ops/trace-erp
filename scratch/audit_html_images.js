const axios = require('axios');

async function checkImageSize(url) {
  try {
    const res = await axios.head(url);
    const contentLength = res.headers['content-length'];
    return contentLength ? parseInt(contentLength, 10) : null;
  } catch (err) {
    return null;
  }
}

async function main() {
  const productUrl = 'https://tracepk.com/products/multi-reflector-pum-a';
  console.log(`Fetching product page: ${productUrl}...`);
  
  let html;
  try {
    const res = await axios.get(productUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    html = res.data;
  } catch (err) {
    console.error('Error fetching product page:', err.message);
    return;
  }

  // Find product ID from __st object in html
  const idMatch = html.match(/"rid":\s*(\d+)/);
  if (!idMatch) {
    console.error('Could not find product ID (rid) in page HTML.');
    return;
  }
  const productId = idMatch[1];
  console.log(`Found Product ID (rid): ${productId}`);

  // Fetch product recommendations section with theme id and timestamp to bypass cache
  const recommendationsUrl = `https://tracepk.com/recommendations/products?limit=4&product_id=${productId}&section_id=related-products&preview_theme_id=159705432323&_t=${Date.now()}`;
  console.log(`Fetching related products section from: ${recommendationsUrl}...`);
  
  let recsHtml;
  try {
    const res = await axios.get(recommendationsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    recsHtml = res.data;
  } catch (err) {
    console.error('Error fetching recommendations:', err.message);
    return;
  }

  // Find all img tags in the recommendations HTML
  const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/g;
  let match;
  console.log('\n--- Auditing Images in "You May Also Like" section ---');
  
  const imagesToCheck = [];
  while ((match = imgRegex.exec(recsHtml)) !== null) {
    const imgTag = match[0];
    const src = match[1];
    
    // Extract srcset if present
    const srcsetMatch = imgTag.match(/srcset="([^"]+)"/);
    const srcset = srcsetMatch ? srcsetMatch[1] : '';
    
    const urls = [];
    if (srcset) {
      const parts = srcset.split(',');
      parts.forEach(p => {
        const u = p.trim().split(' ')[0];
        if (u) urls.push(u.startsWith('//') ? 'https:' + u : u);
      });
    }
    if (src) {
      urls.push(src.startsWith('//') ? 'https:' + src : src);
    }
    
    if (urls.length > 0) {
      imagesToCheck.push({
        tag: imgTag,
        urls: [...new Set(urls)]
      });
    }
  }

  console.log(`Found ${imagesToCheck.length} images.`);
  for (let i = 0; i < imagesToCheck.length; i++) {
    console.log(`\nImage #${i + 1}:`);
    const img = imagesToCheck[i];
    
    for (const url of img.urls) {
      const size = await checkImageSize(url);
      const isOriginal = !url.includes('width=') && !url.includes('_165x') && !url.includes('_533x') && !url.includes('_360x') && !url.includes('width:');
      const label = isOriginal ? 'ORIGINAL SIZE' : 'SCALED';
      const sizeStr = size ? `${(size / (1024 * 1024)).toFixed(2)} MB (${size} bytes)` : 'unknown';
      console.log(`- [${label}] URL: ${url.slice(0, 80)}... | Size: ${sizeStr}`);
    }
  }
}

main();
