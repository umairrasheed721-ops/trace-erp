const axios = require('axios');
const fs = require('fs');

const url = 'https://cdn.shopify.com/s/files/1/0678/5515/5459/files/trace_size_chart_white_1781547870564.jpg?v=1781548007';
const outputPath = '/Users/umairrasheed/.gemini/antigravity-ide/brain/ec944628-61e6-4dca-b3e6-7a16d7f29f97/ideal_formal_shirts_size_chart.jpg';

async function main() {
  try {
    console.log('Downloading ideal size chart image with headers...');
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Referer': 'https://tracepk.com/'
      }
    });

    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);

    writer.on('finish', () => {
      console.log('✅ Download complete! Saved to:', outputPath);
    });

    writer.on('error', (err) => {
      console.error('Writer error:', err);
    });
  } catch (err) {
    console.error('Download error:', err.message);
  }
}

main();
