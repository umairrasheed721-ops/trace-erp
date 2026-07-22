const fetch = require('node-fetch');

async function main() {
  const url = 'https://trace-erp-production.up.railway.app/api/wake-up-test';
  console.log(`Pinging production server: ${url}`);
  
  for (let i = 1; i <= 15; i++) {
    try {
      const start = Date.now();
      const res = await fetch(url);
      const text = await res.text();
      const duration = Date.now() - start;
      console.log(`[Attempt ${i}] Status: ${res.status}, Response: ${text.substring(0, 100)}, Time: ${duration}ms`);
      
      if (res.status === 200) {
        // Successful response
        try {
          const json = JSON.parse(text);
          console.log(`Deployment is active! Server time: ${json.time}`);
        } catch (_) {}
      }
    } catch (err) {
      console.log(`[Attempt ${i}] Error: ${err.message}`);
    }
    // Wait 10 seconds between attempts
    await new Promise(r => setTimeout(r, 10000));
  }
}

main();
