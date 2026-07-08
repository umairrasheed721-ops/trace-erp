const IGNORE_STATUSES = ['delivered', 'return received', 'paid', 'pending', 'cancelled', 'returned', 'void', 'voided'];
const ADVICE_KEYWORDS = [
  'shipper advice', 'delivery under review', 'reattempt', 'undelivered', 
  'refused', 'incomplete address', 'consignee not available', 'attempt', 
  'failed', 'return', 'review', 'rfd', 'unsuccessful', 'refuse'
];

function isExcludedFromAdvice(courierStatus) {
  if (!courierStatus) return false;
  const statusLower = courierStatus.toLowerCase();
  if (
    statusLower.includes('waiting for return') ||
    statusLower.includes('return to ') ||
    statusLower.includes('returned to ') ||
    statusLower.includes('out for return') ||
    statusLower.includes('return received') ||
    statusLower.includes('returned') ||
    statusLower.includes('request for re-attempt')
  ) {
    return true;
  }
  return false;
}

function shouldIncludeInAdvice(courier_status, delivery_status) {
  const deliveryStatusLower = (delivery_status || '').toLowerCase();
  if (IGNORE_STATUSES.includes(deliveryStatusLower)) return false;
  if (isExcludedFromAdvice(courier_status)) return false;

  const st = (courier_status || delivery_status || '').toLowerCase();
  return ADVICE_KEYWORDS.some(k => st.includes(k));
}

// Test cases
const tests = [
  { c: 'Return Charged', d: 'Return Received', expected: false }, // return received is ignored
  { c: 'Merchant Request For Re-Attempt', d: 'In Transit', expected: false }, // action already taken
  { c: 'Rider undelivered', d: 'Delivered', expected: false }, // delivered is ignored
  { c: 'Rider failed to reach', d: 'In Transit', expected: true }, // active failure is included
  { c: 'Returned to warehouse', d: 'Returned', expected: false }, // returned is ignored
  { c: 'Waiting for Return', d: 'In Transit', expected: false }, // in return flow
  { c: 'Return to LAHORE', d: 'In Transit', expected: false }, // in return flow
  { c: 'Delivery Under Review', d: 'In Transit', expected: true } // under review, needs advice
];

tests.forEach((t, i) => {
  const result = shouldIncludeInAdvice(t.c, t.d);
  console.log(`Test ${i + 1}: expected=${t.expected}, got=${result} | ${result === t.expected ? '✅ PASS' : '❌ FAIL'}`);
});
