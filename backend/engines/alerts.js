const bot = require('./whatsapp_bot');

const ADMIN_NUMBERS = [
  '923101234567' // Replace with your actual number for alerts
];

/**
 * Sends a critical alert to admin via WhatsApp
 */
function sendEmergencyAlert(message) {
  console.log(`[ALERT DISABLED] Emergency Alert: ${message}`);
}

module.exports = { sendEmergencyAlert };
