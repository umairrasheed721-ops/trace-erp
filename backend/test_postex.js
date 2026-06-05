require('dotenv/config');
const axios = require('axios');
const db = require('./db');

// Main execution function
async function runTest() {
  console.log("==================================================");
  console.log("PostEx API Standalone Test Script Starting...");
  console.log("==================================================");

  let order = null;

  // 1. Query the database for exactly ONE order currently pending reconciliation
  try {
    order = db.prepare(`
      SELECT o.*, s.postex_token 
      FROM orders o 
      JOIN stores s ON o.store_id = s.id
      WHERE LOWER(o.delivery_status) = 'booked'
        AND (o.tracking_number IS NULL OR o.tracking_number = '' OR o.tracking_number = '—')
        AND o.ref_number IS NOT NULL
        AND s.postex_token IS NOT NULL
      LIMIT 1
    `).get();
  } catch (dbErr) {
    console.warn("[WARNING] Primary database query failed:", dbErr.message);
  }

  // Fallback 1: Try any order with a reference number and valid token
  if (!order) {
    console.log("No booked orders pending reconciliation found. Trying fallback 1: Any order with a token...");
    try {
      order = db.prepare(`
        SELECT o.*, s.postex_token 
        FROM orders o 
        JOIN stores s ON o.store_id = s.id
        WHERE o.ref_number IS NOT NULL
          AND s.postex_token IS NOT NULL
        LIMIT 1
      `).get();
    } catch (fallbackErr) {}
  }

  // Fallback 2: Try any order in the DB and use env variable token
  if (!order) {
    console.log("No orders with token found. Trying fallback 2: Any order with ref_number + env token...");
    try {
      order = db.prepare(`
        SELECT o.* 
        FROM orders o 
        WHERE o.ref_number IS NOT NULL
        LIMIT 1
      `).get();
      if (order) {
        order.postex_token = process.env.POSTEX_TOKEN;
      }
    } catch (fallback2Err) {}
  }

  // Fallback 3: Entirely mock data for simulation if DB is empty
  if (!order) {
    console.log("No orders found in database. Using mock fallback order data.");
    order = {
      ref_number: 'TR32191',
      postex_token: process.env.POSTEX_TOKEN || 'mock_postex_token'
    };
  }

  const orderRef = order.ref_number ? order.ref_number.trim() : '';
  const postexToken = order.postex_token;

  console.log(`Target Order Info: ID = ${order.id || 'MOCK'}, Ref = "${orderRef}"`);
  console.log(`PostEx Token: ${postexToken ? (postexToken.substring(0, 8) + '...') : 'NULL'}`);

  if (!postexToken) {
    console.error("ERROR: PostEx Token is empty/missing. Cannot execute API request.");
    process.exit(1);
  }

  // 2. Replicate the exact API request uses for PostEx
  const url = `https://api.postex.pk/services/integration/api/order/v1/get-order-detail-by-ref-number?orderRefNumber=${encodeURIComponent(orderRef)}`;

  console.log(`Pinging PostEx API: GET ${url}`);

  try {
    const response = await axios.get(url, {
      headers: {
        'token': postexToken,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    console.log("SUCCESS HTTP STATUS:", response.status);
    console.log("RAW DATA:", JSON.stringify(response.data, null, 2));
    process.exit(0);
  } catch (error) {
    console.error("ERROR HTTP STATUS:", error.response?.status);
    console.error("ERROR RAW DATA:", JSON.stringify(error.response?.data || error.message || error, null, 2));
    if (!error.response) {
      console.error("Network or connection error:", error.message);
    }
    process.exit(1);
  }
}

runTest();
