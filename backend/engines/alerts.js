const bot = require('./whatsapp_bot');

const ADMIN_NUMBERS = [
  '923101234567' // Replace with your actual number for alerts
];

/**
 * Sends a critical alert to admin via WhatsApp
 */
function sendEmergencyAlert(message) {
  const finalMsg = `🚨 *TRACE ERP CRITICAL ALERT* 🚨\n\n${message}\n\n🕒 ${new Date().toLocaleString()}`;
  
  ADMIN_NUMBERS.forEach(num => {
    try {
      bot.sendMessage(num, finalMsg);
    } catch (err) {
      console.error('Failed to send WhatsApp alert:', err.message);
    }
  });
}

module.exports = { sendEmergencyAlert };
