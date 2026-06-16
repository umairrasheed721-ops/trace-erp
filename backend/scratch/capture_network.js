const { chromium } = require('playwright');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('request', request => {
    const url = request.url();
    if (url.includes('judge') || url.includes('jdgm')) {
      console.log(`[Request] ${url}`);
    }
  });

  console.log('Navigating to https://tracepk.com/products/6...');
  await page.goto('https://tracepk.com/products/6', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  console.log('Done.');
  await browser.close();
}

run();
