const axios = require('axios');

async function main() {
  try {
    console.log('Fetching live product page html...');
    // We request the product page with a cache-buster query parameter to bypass cache
    const res = await axios.get('https://tracepk.com/products/ralph-lauren?nocache=' + Date.now(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const html = res.data;
    if (html.includes('payment-tab-btn')) {
      console.log('✅ Found "payment-tab-btn" in live HTML! The new tab switcher is live.');
    } else {
      console.log('❌ "payment-tab-btn" NOT found in live HTML. The old version might still be cached or served.');
    }
  } catch (err) {
    console.error('Error fetching live html:', err.message);
  }
}

main();
