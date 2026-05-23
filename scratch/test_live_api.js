const fetch = require('node-fetch');

async function run() {
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc3OTU0MjY0MSwiZXhwIjoxNzc5NTQ2MjQxfQ.AFom0Ok2UMjkBYAiaEsnrg2Nlm-FBNpwfannh-kRQrg';
  console.log('Using hardcoded token...');

  const ordersUrl = 'https://trace-erp-production.up.railway.app/api/orders?store_id=12&limit=250&page=1&status=&search=&start_date=&end_date=&sort=order_date&sort_dir=desc';
  console.log('Fetching orders from live server...');
  const t0 = Date.now();
  const ordersRes = await fetch(ordersUrl, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const t1 = Date.now();
  console.log(`Fetch HTTP status: ${ordersRes.status} in ${t1 - t0}ms`);
  if (ordersRes.ok) {
    const text = await ordersRes.text();
    console.log(`Response length: ${text.length} chars`);
    const data = JSON.parse(text);
    console.log(`Parsed JSON successfully. Found ${data.orders ? data.orders.length : 0} orders.`);
  }

  const urls = [
    'https://trace-erp-production.up.railway.app/api/monitors/stuck?store_id=12',
    'https://trace-erp-production.up.railway.app/api/monitors/advice?store_id=12',
    'https://trace-erp-production.up.railway.app/api/watchdog?store_id=12'
  ];

  for (const url of urls) {
    console.log(`Fetching ${url}...`);
    const start = Date.now();
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const dur = Date.now() - start;
    console.log(`Status: ${res.status} in ${dur}ms`);
    if (res.ok) {
      const data = await res.json();
      console.log(`Length/size of response: ${JSON.stringify(data).length}`);
    } else {
      console.error(`Failed:`, await res.text());
    }
  }
}

run().catch(console.error);
