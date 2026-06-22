const { chromium } = require('playwright');
const fs = require('fs');

async function main() {
  console.log('Launching Playwright browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const url = 'https://cdn.shopify.com/s/files/1/0678/5515/5459/files/trace_size_chart_white_1781547870564.jpg?v=1781548007';
  const outputPath = '/Users/umairrasheed/.gemini/antigravity-ide/brain/ec944628-61e6-4dca-b3e6-7a16d7f29f97/ideal_formal_shirts_size_chart.jpg';

  try {
    console.log(`Navigating to image URL: ${url}`);
    const response = await page.goto(url, { waitUntil: 'networkidle' });
    
    if (response.ok()) {
      const buffer = await response.body();
      fs.writeFileSync(outputPath, buffer);
      console.log('✅ Successfully downloaded image via Playwright to:', outputPath);
    } else {
      console.error(`❌ Failed to load image. Status: ${response.status()}`);
    }
  } catch (err) {
    console.error('Error in Playwright execution:', err.message);
  } finally {
    await browser.close();
  }
}

main();
