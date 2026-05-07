
const fetch = require('node-fetch');

async function test() {
  const url = 'https://one-be.instaworld.pk/logistics/v1/trackShipment';
  const keys = {
    'Key1(Primary)': 'qxdpk08t2mhrf2ed1sym',
    'Key2(Backup)':  'juehwqkpycnowff4spoh',
    'Key3(New)':     'e5bqohxcqvd0fe39ldxs',
  };

  // Test a wider range of LE numbers from the DB
  const testNumbers = [
    'LE784137944',   // Old LE784 — all keys failing
    'LE785745846',   // Old LE785 — all keys failing  
    'LE793692118',   // LE793 — Key2 works
    'LE7500750347',  // LE750 — from DB (was InTransit)
    'LE7526802522',  // LE752 — from DB (was InTransit)
    'LE7531953714',  // LE753 — from DB (was Pending)
  ];
  
  for (const tn of testNumbers) {
    const results = [];
    for (const [label, key] of Object.entries(keys)) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tracking_number: tn, api_key: key }),
          timeout: 8000
        });
        const d = await res.json();
        const result = Array.isArray(d) 
          ? `✅ "${d[d.length-1]?.status}"` 
          : `❌ Not Found`;
        results.push(`${label}: ${result}`);
      } catch(e) { results.push(`${label}: TIMEOUT`); }
    }
    console.log(`${tn} → ${results.join(' | ')}`);
  }
}

test();
