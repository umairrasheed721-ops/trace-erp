const { chromium } = require('playwright');

async function main() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const imageRequests = [];

  // Track network requests
  page.on('request', request => {
    const url = request.url();
    const resourceType = request.resourceType();
    if (resourceType === 'image') {
      imageRequests.push({ url, size: null });
    }
  });

  page.on('response', async response => {
    const url = response.url();
    const req = imageRequests.find(r => r.url === url);
    if (req) {
      try {
        const headers = response.headers();
        const contentLength = headers['content-length'];
        req.size = contentLength ? parseInt(contentLength, 10) : null;
      } catch (e) {
        // ignore
      }
    }
  });

  const url = 'https://tracepk.com/products/multi-reflector-pum-a';
  console.log(`Navigating to ${url}...`);
  await page.goto(url, { waitUntil: 'load' });

  console.log('Scrolling down to trigger related products load...');
  // Scroll to bottom of the page
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  
  // Wait for 5 seconds to ensure related products and their images load
  await page.waitForTimeout(5000);

  console.log('\n--- Image Network Requests Audit ---');
  let totalBytes = 0;
  
  // Sort image requests by size desc
  const sortedRequests = imageRequests
    .filter(r => r.size !== null)
    .sort((a, b) => b.size - a.size);

  sortedRequests.forEach(req => {
    totalBytes += req.size;
    const mbSize = (req.size / (1024 * 1024)).toFixed(2);
    console.log(`- Image: ${req.url.split('?')[0].split('/').pop()} | Size: ${mbSize} MB (${req.size} bytes) | URL: ${req.url.slice(0, 100)}...`);
  });

  console.log(`\nTotal downloaded image data: ${(totalBytes / (1024 * 1024)).toFixed(2)} MB`);
  
  await browser.close();
}

main();
