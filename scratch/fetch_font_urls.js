const axios = require('axios');

async function main() {
  const url = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700;800;900&family=Playfair+Display:wght@700;900&display=swap';
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    const css = res.data;
    
    // Find all font URLs
    const fontUrls = [];
    const regex = /url\((https:\/\/fonts\.gstatic\.com\/s\/[^\)]+)\)/g;
    let match;
    while ((match = regex.exec(css)) !== null) {
      fontUrls.push(match[1]);
    }
    
    console.log(JSON.stringify(fontUrls, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
