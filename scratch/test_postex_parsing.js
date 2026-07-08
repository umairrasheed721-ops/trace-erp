const fetch = require('node-fetch');
const { applyMap, loadStatusMaps } = require('../backend/engines/tracking/statusMapper');

const token = 'NWE5NTU4YmE0Y2ExNDk3Y2E5MTc4MzA1ZGNlYjYzZTc6NDhkMmUzYzc0NWJhNDZiM2E3NWNkYWQxYWU4ZjZhYWQ';
const trackingNumber = '20120050024976';

async function main() {
  const url = `https://api.postex.pk/services/integration/api/order/v1/track-order/${trackingNumber}`;
  console.log(`📡 Fetching PostEx V1: ${url}`);
  try {
    const res = await fetch(url, {
      headers: { 'token': token, 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    const distData = data?.dist || data;

    // Simulate our new parsing logic
    let statusDate = null;
    let latestHistoryStatus = null;
    const history = data?.dist?.transactionStatusHistory 
      || data?.transactionStatusHistory 
      || data?.data?.transactionStatusHistory 
      || data?.dist?.trackingHistory 
      || data?.trackingHistory 
      || data?.data?.trackingHistory 
      || [];

    console.log(`📋 Found ${history.length} history events.`);

    if (Array.isArray(history) && history.length > 0) {
      const sorted = [...history].sort((a, b) => {
        const dateA = new Date(a.dateTime || a.date || a.timestamp || a.updatedAt);
        const dateB = new Date(b.dateTime || b.date || b.timestamp || b.updatedAt);
        return dateA - dateB;
      });
      const latest = sorted[sorted.length - 1];
      statusDate = latest?.dateTime || latest?.date || latest?.timestamp || latest?.updatedAt || null;
      latestHistoryStatus = latest?.transactionStatusMessage || latest?.statusMessage || latest?.message || latest?.status || null;
    }

    let rawStatus = latestHistoryStatus
      || distData?.transactionStatus
      || data?.transactionStatus
      || data?.data?.transactionStatus
      || data?.statusDescription
      || null;

    console.log("Resolved Raw Status (rawStatus):", rawStatus);
    console.log("Resolved Status Date (statusDate):", statusDate);

    // Apply mapping
    const statusMap = loadStatusMaps();
    const mappedStatus = applyMap(statusMap, 'PostEx', rawStatus);
    console.log("Resolved ERP Status (mappedStatus):", mappedStatus);

  } catch (err) {
    console.error(`Error:`, err.message);
  }
}

main();
