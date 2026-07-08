const ADVICE_KEYWORDS = [
  'shipper advice', 'delivery under review', 'reattempt', 'undelivered', 
  'refused', 'incomplete address', 'consignee not available', 'attempt', 
  'failed', 'return', 'review', 'rfd', 'unsuccessful', 'refuse'
];

function classify(courier_status, delivery_status, isManual) {
  let insight_type = 'STUCK_TRANSIT';
  const statusLower = (courier_status || delivery_status || '').toLowerCase();
  
  if (isManual) {
    insight_type = 'MANUAL_ID';
  } else if (statusLower === 'booked' || statusLower === 'confirmed') {
    insight_type = 'PICKUP_PENDING';
  } else if (ADVICE_KEYWORDS.some(k => statusLower.includes(k))) {
    insight_type = 'ADVICE_REQUIRED';
  }
  return insight_type;
}

// Test cases
const tests = [
  { c: 'Merchant Request For Re-Attempt', d: 'In Transit', m: false, expected: 'ADVICE_REQUIRED' },
  { c: 'Attempt Made: RFD(REFUSED TO RECEIVE)', d: 'In Transit', m: false, expected: 'ADVICE_REQUIRED' },
  { c: 'Arrived at Transit Hub LHE', d: 'In Transit', m: false, expected: 'STUCK_TRANSIT' },
  { c: 'Booked', d: 'Booked', m: false, expected: 'PICKUP_PENDING' },
  { c: 'local_courier', d: 'In Transit', m: true, expected: 'MANUAL_ID' }
];

tests.forEach((t, i) => {
  const result = classify(t.c, t.d, t.m);
  console.log(`Test ${i + 1}: expected=${t.expected}, got=${result} | ${result === t.expected ? '✅ PASS' : '❌ FAIL'}`);
});
