const https = require('https');

const options = {
  hostname: '23.227.38.32', // Shopify IP
  port: 443,
  path: '/admin/api/2024-10/themes.json',
  method: 'GET',
  headers: {
    'Host': '041839-3.myshopify.com',
    'X-Shopify-Access-Token': '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'
  },
  timeout: 5000
};

console.log('Testing connection to Shopify IP...');
const req = https.request(options, (res) => {
  console.log(`Response Code: ${res.statusCode}`);
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    console.log('Body:', data.substring(0, 100));
  });
});

req.on('error', (e) => {
  console.error('Connection failed:', e.message);
});

req.on('timeout', () => {
  console.log('Connection timeout!');
  req.destroy();
});

req.end();
