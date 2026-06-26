/**
 * Rounds a number to exactly two decimal places.
 * @param {number|string} val 
 * @returns {number}
 */
export function roundToTwo(val) {
  const num = parseFloat(val);
  if (isNaN(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Formats a number as a currency string.
 * @param {number|string} val 
 * @returns {string}
 */
export function formatCurrency(val) {
  const num = parseFloat(val);
  if (isNaN(num)) return 'Rs. 0';
  return `Rs. ${Math.round(num).toLocaleString()}`;
}
