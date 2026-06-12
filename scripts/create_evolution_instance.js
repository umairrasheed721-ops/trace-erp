#!/usr/bin/env node

/**
 * Evolution API Instance Creator
 * 
 * Automatically creates the WhatsApp Baileys integration instance in Evolution API.
 * Reads configurations from backend/.env.
 */

const path = require('path');
const fs = require('fs');

// Load environment variables from backend/.env
const envPath = path.join(__dirname, '../backend/.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  console.warn('⚠️ Warning: backend/.env file not found. Using current process environment.');
}

let evolutionUrl = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
if (evolutionUrl && !evolutionUrl.startsWith('http://') && !evolutionUrl.startsWith('https://')) {
  evolutionUrl = 'https://' + evolutionUrl;
}
const evolutionApiKey = process.env.EVOLUTION_API_KEY || 'TracePK_Secret_Key_123';
const instanceName = process.env.EVOLUTION_API_INSTANCE || 'TracePK';

async function createInstance() {
  console.log('🚀 Initializing Evolution API WhatsApp Instance creation...');
  console.log(`- API URL: ${evolutionUrl}`);
  console.log(`- Instance Name: ${instanceName}`);
  console.log(`- API Key: ${evolutionApiKey.substring(0, 5)}... (masked)`);

  const endpoint = `${evolutionUrl}/instance/create`;
  const headers = {
    'Content-Type': 'application/json',
    'apikey': evolutionApiKey
  };

  const payload = {
    instanceName: instanceName,
    qrcode: true,
    integration: 'WHATSAPP-BAILEYS'
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (_) {
      data = null;
    }

    if (!response.ok) {
      console.error(`\n❌ Error: Request failed with status code ${response.status}`);
      console.error('Response Details:', data || responseText);
      process.exit(1);
    }

    console.log('\n✅ Success! WhatsApp Instance created successfully.');
    console.log('--------------------------------------------------');
    if (data) {
      console.log(JSON.stringify(data, null, 2));
      
      if (data.qrcode && data.qrcode.base64) {
        console.log('\n📸 QR Code generated! You can scan it to connect.');
        console.log('Please check the WhatsApp Portal dashboard or scan QR using the webhook updates.');
      } else if (data.instance && data.instance.status === 'open') {
        console.log('\n⚡ Session status: ALREADY CONNECTED');
      }
    } else {
      console.log(responseText);
    }
    console.log('--------------------------------------------------');
  } catch (err) {
    console.error('\n❌ Connection Error: Could not connect to Evolution API.');
    console.error(`Message: ${err.message}`);
    console.error('\nPlease verify that:');
    console.error('1. The Evolution API container is running (docker-compose up -d).');
    console.error(`2. It is accessible at the URL: ${evolutionUrl}`);
    process.exit(1);
  }
}

createInstance();
