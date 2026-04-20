async function test() {
  const POSTEX_TOKEN = 'NWE5NTU4YmE0Y2ExNDk3Y2E5MTc4MzA1ZGNlYjYzZTc6NDhkMmUzYzc0NWJhNDZiM2E3NWNkYWQxYWU4ZjZhYWQ=';
  const INSTAWORLD_KEY = 'qxdpk08t2mhrf2ed1sym';

  console.log("=== TESTING POSTEX ===");
  try {
    const pxRes = await fetch('https://api.postex.pk/services/integration/api/order/v1/track-order/20120050021771', {
      method: 'GET',
      headers: { 'token': POSTEX_TOKEN, 'Content-Type': 'application/json' }
    });
    console.log('PostEx Status:', pxRes.status);
    const pxData = await pxRes.json();
    console.log('PostEx Status string:', pxData?.dist?.transactionStatus || pxData?.transactionStatus || pxData?.statusDescription || 'Not found');
  } catch (e) {
    console.log('PostEx Error:', e.message);
  }

  console.log("\n=== TESTING INSTAWORLD ===");
  try {
    const iwRes = await fetch('https://one-be.instaworld.pk/logistics/v1/trackShipment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tracking_number: '342362', api_key: INSTAWORLD_KEY })
    });
    console.log('Instaworld Status:', iwRes.status);
    const iwData = await iwRes.json();
    let newStatus = null;
    if (Array.isArray(iwData) && iwData.length > 0) {
      newStatus = iwData[iwData.length - 1]?.status || iwData[iwData.length - 1]?.statusDescription;
    } else if (iwData?.data && Array.isArray(iwData.data) && iwData.data.length > 0) {
      newStatus = iwData.data[iwData.data.length - 1]?.status;
    } else if (iwData?.status) {
      newStatus = iwData.status;
    } else if (iwData?.currentStatus) {
      newStatus = iwData.currentStatus;
    }
    console.log('Instaworld Status string:', newStatus);
  } catch (e) {
    console.log('Instaworld Error:', e.message);
  }
}
test();
