const fs = require('fs');
const path = require('path');
const https = require('https');

const fonts = {
  'montserrat-400-normal.woff2': 'https://fonts.gstatic.com/s/montserrat/v31/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCtr6Ew-.woff2',
  'montserrat-500-normal.woff2': 'https://fonts.gstatic.com/s/montserrat/v31/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCtZ6Ew-.woff2',
  'montserrat-700-normal.woff2': 'https://fonts.gstatic.com/s/montserrat/v31/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCuM70w-.woff2',
  'montserrat-900-italic.woff2': 'https://fonts.gstatic.com/s/montserrat/v31/JTUFjIg1_i6t8kCHKm459Wx7xQYXK0vOoz6jqw16aX8.woff2'
};

const destDir = path.join(__dirname, '../../shopify_theme/assets');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 200) {
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => {
          file.close(resolve);
        });
      } else {
        reject(new Error(`Failed to download ${url}, status code: ${res.statusCode}`));
      }
    }).on('error', reject);
  });
}

async function main() {
  console.log('Downloading Montserrat woff2 font files...');
  for (const [filename, url] of Object.entries(fonts)) {
    const destPath = path.join(destDir, filename);
    console.log(`Downloading ${filename} to ${destPath}...`);
    try {
      await download(url, destPath);
      console.log(`✅ Successfully downloaded ${filename}`);
    } catch (err) {
      console.error(`❌ Failed to download ${filename}:`, err.message);
    }
  }
  console.log('Done!');
}

main();
