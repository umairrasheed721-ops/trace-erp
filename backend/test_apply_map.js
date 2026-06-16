const { applyMap } = require('./engines/tracking/statusMapper');

const testCases = [
  { courier: 'PostEx', status: 'En-Route to Islamabad warehouse', expected: 'In Transit' },
  { courier: 'PostEx', status: 'Delivery Under Review', expected: 'Attempted' },
  { courier: 'Leopards', status: 'Return In-Transit', expected: 'Return Initiated' }
];

const mockMap = {
  'postex:delivery under review': 'Attempted'
};

testCases.forEach(tc => {
  const result = applyMap(mockMap, tc.courier, tc.status);
  console.log(`Courier: ${tc.courier} | Status: "${tc.status}" | Result: "${result}" | Expected: "${tc.expected}" | Match: ${result === tc.expected}`);
});
