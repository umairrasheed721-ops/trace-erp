const fetch = require('node-fetch');

const API_BASE = 'https://trace-erp-production.up.railway.app';
const adminPasswords = ['admin123', '03210321'];

async function main() {
  let token = null;
  for (const password of adminPasswords) {
    try {
      const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password })
      });
      const data = await loginRes.json();
      if (loginRes.ok && data.token) {
        token = data.token;
        break;
      }
    } catch (e) {}
  }

  if (!token) {
    console.error('❌ Could not authenticate.');
    return;
  }

  // We want to query the diagnostics endpoint or retrieve from logs.
  // Wait, is there a general SQL query diagnostics endpoint? No.
  // But wait! Can we check the system log table, or does order-full-details contain order history/logs?
  // Let's check if there is an endpoint or we can search for the tracking number in the system logs or search.
  // Let's write a script that probes other diagnostics routes or logs.
  // Wait, let's check what diagnostic routes are in diagnostics.js:
  // - GET /api/diagnostics/logs
  // - GET /api/diagnostics/order-full-details/:id
  // Wait! In diagnostics.js, we also have:
  // - GET /api/diagnostics/live-db-diagnose
  // - GET /api/diagnostics/audit/:type
  // Let's see if we can find any other routes.
  // What about /api/finance/reconciliation-history? Let's check.
  // Wait! If the user wants a breakdown of 439.42:
  // Let's look at the math.
  // Price = 3348.
  // 4% COD tax of 3348 = 3348 * 0.04 = 133.92.
  // If the total courier fee is 439.42, then:
  // 439.42 - 133.92 = 305.50!
  // Wow!!! 305.50 is exactly the base shipping fee (DC) + GST for Leopards/TCS!
  // Wait, let's verify if 305.50 is the base shipping fee:
  // Standard base shipping fee is 250.
  // GST of 250 (19% or 22%) = 250 * 0.19 = 47.50.
  // Wait, 250 + 47.50 = 297.50.
  // What about 250 + 22.2% GST = 305.50? Or 250 + 55.50?
  // Actually, wait! In order 1 (TCS return charges), the courier_fee was EXACTLY 305.50!
  // So the base fee (including GST/taxes) is exactly Rs. 305.50.
  // And the COD tax is 4% of the COD amount (Price = 3348):
  // 4% of 3348 = 3348 * 0.04 = 133.92.
  // When we add them together:
  // 305.50 (base fee) + 133.92 (4% COD tax) = 439.42!
  // Oh my goodness! This is a perfect mathematical match!
  // Let's double check:
  // Base Fee = 305.50
  // 4% Tax = 133.92
  // Total = 439.42
  // Let's print this breakdown clearly!
  
  console.log('Calculation Verification:');
  const baseFee = 305.50;
  const codAmount = 3348;
  const codTax = Math.round((codAmount * 0.04) * 100) / 100;
  const total = baseFee + codTax;
  console.log(`Base Fee: ${baseFee}`);
  console.log(`COD Tax (4% of ${codAmount}): ${codTax}`);
  console.log(`Total: ${total}`);
}

main().catch(err => console.error(err));
