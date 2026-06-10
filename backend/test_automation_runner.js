/**
 * Standalone Integration Test Runner for Shopify Webhook -> WhatsApp Poll -> Inbound Vote -> Shopify Tag Sync
 * 
 * Run using: node backend/test_automation_runner.js
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

console.log('🏁 Starting standalone integration test runner...');

// 1. Mock node-fetch in require.cache before requiring any backend modules
const mockResponse = (data, status = 200, statusText = 'OK') => {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => data,
    text: async () => JSON.stringify(data),
    headers: {
      get: (headerName) => null
    }
  };
};

let resolveTest;
let rejectTest;
const testPromise = new Promise((resolve, reject) => {
  resolveTest = resolve;
  rejectTest = reject;
});

const mockFetch = async (url, options = {}) => {
  const method = (options.method || 'GET').toUpperCase();
  console.log(`📡 [Mock Fetch] ${method} ${url}`);

  if (url.includes('elevenlabs.io')) {
    // Fail ElevenLabs immediately to speed up test and fall back to text poll
    return mockResponse({ error: 'Mocked ElevenLabs block' }, 400, 'Bad Request');
  }

  if (url.includes('graphql.json')) {
    return mockResponse({
      data: {
        nodes: [
          {
            id: "gid://shopify/ProductVariant/777777777",
            inventoryItem: {
              unitCost: {
                amount: "100.00"
              }
            },
            image: {
              url: "https://example.com/image.jpg"
            },
            product: {
              featuredImage: {
                url: "https://example.com/image.jpg"
              }
            }
          }
        ]
      }
    });
  }

  if (url.includes('/orders/999999999.json')) {
    if (method === 'GET') {
      return mockResponse({
        order: {
          id: 999999999,
          name: "#TR-AUTO-TEST-999",
          created_at: "2026-06-11T00:00:00Z",
          total_price: "1500.00",
          financial_status: "pending",
          fulfillment_status: null,
          cancelled_at: null,
          tags: "some-existing-tag, another-tag",
          line_items: [
            {
              id: 888888888,
              variant_id: 777777777,
              title: "Test Product",
              variant_title: "Default Title",
              sku: "TEST-SKU",
              quantity: 1,
              price: "1500.00"
            }
          ],
          shipping_address: {
            first_name: "John",
            last_name: "Doe",
            phone: "923134725415",
            address1: "House 123",
            city: "Karachi"
          },
          customer: {
            first_name: "John",
            last_name: "Doe",
            phone: "923134725415"
          },
          note: "This is an automated integration test order."
        }
      });
    } else if (method === 'PUT') {
      try {
        const bodyObj = JSON.parse(options.body);
        const tags = bodyObj.order.tags;
        console.log(`✅ [TestSuccess] Outbound tags payload to Shopify: "${tags}"`);
        if (resolveTest) resolveTest(tags);
      } catch (e) {
        console.error('❌ Error parsing PUT body:', e);
        if (rejectTest) rejectTest(e);
      }
      return mockResponse({ success: true });
    }
  }

  // Fallback
  return mockResponse({});
};

const nodeFetchPath = require.resolve('node-fetch');
require.cache[nodeFetchPath] = {
  id: nodeFetchPath,
  filename: nodeFetchPath,
  loaded: true,
  exports: mockFetch
};

// 2. Import modules after require cache is configured
const tenantContext = require('./tenant-context');
const { db } = require('./db');
const botProxy = require('./engines/whatsapp_bot');
const { syncSingleShopifyOrder } = require('./engines/shopify/orders');
const { syncPollVoteToShopify } = require('./engines/whatsapp_message_processor');

// Run everything inside the 'default' tenant context
tenantContext.run('default', async () => {
  try {
    // 3. Clear existing test data from DB for clean run
    console.log('🧹 Cleaning database for test Order #TR-AUTO-TEST-999...');
    db.prepare('DELETE FROM orders WHERE shopify_order_id = ?').run('999999999');
    db.prepare('DELETE FROM whatsapp_polls WHERE message_id = ?').run('mock-poll-id-999');
    db.prepare('DELETE FROM cod_pending_verifications WHERE phone = ?').run('923134725415');

    // 4. Set up mock bot properties and override directSendMessage
    const botInstance = botProxy.getBot('default');
    
    // Ensure bot store exists and is empty for the test JID to trigger the DB fallback path (Path 2)
    const testJid = '923134725415@s.whatsapp.net';
    botInstance.store = botInstance.store || {};
    botInstance.store.messages = botInstance.store.messages || {};
    botInstance.store.messages[testJid] = [];
    botInstance.tenantId = 'default';
    botInstance.sock = botInstance.sock || {};
    botInstance.sock.user = { id: '923134725415@s.whatsapp.net' };

    let generatedPollMessageId = 'mock-poll-id-999';

    botInstance.directSendMessage = async function(phone, message, isManual, mediaUrl, mediaType, fileName, customMessageId, quoteContext, buttons, buttonsMode, poll, options) {
      console.log(`✉️ [Mock bot.directSendMessage] Target Phone: ${phone}`);
      if (poll) {
        console.log(`🗳️ [Mock bot.directSendMessage] Poll payload:`, JSON.stringify(poll, null, 2));
        const messageId = customMessageId || 'mock-poll-id-999';
        const jid = phone.replace(/\D/g, '') + '@s.whatsapp.net';
        
        try {
          db.prepare(`
            INSERT INTO whatsapp_polls (message_id, remote_jid, poll_name, poll_options, tenant_id)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(message_id) DO NOTHING
          `).run(messageId, jid, poll.name, JSON.stringify(poll.values), 'default');
          console.log(`🗄️ [Mock bot.directSendMessage] Success: Persisted mock poll to DB (message_id=${messageId})`);
          generatedPollMessageId = messageId;
        } catch (err) {
          console.error('❌ [Mock bot.directSendMessage] DB insert failed:', err.message);
        }
      } else {
        console.log(`📝 [Mock bot.directSendMessage] Text message contents: "${message || '[Media VN/Doc]'}"`);
      }
    };

    // 5. STEP 1: Mock Order Ingestion by calling syncSingleShopifyOrder
    console.log('📥 [TestStep 1] Ingesting dummy order #TR-AUTO-TEST-999 (Shopify Order ID: 999999999)...');
    
    // We pass store object mapping to id: 1 in DB
    const store = { id: 1, shop_domain: 'store_a.myshopify.com', access_token: 'token_a' };
    const orderResult = await syncSingleShopifyOrder(store, '999999999');
    
    // Let event loop process any setImmediate calls scheduled for COD Verification
    console.log('⏳ [TestStep 2] Waiting for dispatchCODVerification to trigger and send the poll...');
    await new Promise(resolve => setTimeout(resolve, 300));

    // Verify order is written to SQLite database
    const orderRow = db.prepare('SELECT id, shopify_order_id, phone, customer_name FROM orders WHERE shopify_order_id = ?').get('999999999');
    if (!orderRow) {
      throw new Error('❌ Order was not found in database after ingestion!');
    }
    console.log(`✅ Database verified: Order found. ID: ${orderRow.id}, Phone: ${orderRow.phone}, Name: ${orderRow.customer_name}`);

    // Verify poll is written to SQLite database
    const pollRow = db.prepare('SELECT id, message_id, poll_name, poll_options FROM whatsapp_polls WHERE message_id = ?').get(generatedPollMessageId);
    if (!pollRow) {
      throw new Error(`❌ Outbound poll not found in whatsapp_polls vault for message_id: ${generatedPollMessageId}`);
    }
    console.log(`✅ Database verified: WhatsApp Poll found in vault. Message ID: ${pollRow.message_id}, Options: ${pollRow.poll_options}`);

    // 6. STEP 3: Construct the fake incoming WhatsApp vote casting payload
    console.log('🗳️ [TestStep 3] Casting mock incoming WhatsApp vote...');
    const cancelOption = "❌ Cancel Order";
    const cancelOptionHash = crypto.createHash('sha256').update(cancelOption).digest();

    const mockMsg = {
      key: {
        remoteJid: '923134725415@s.whatsapp.net',
        fromMe: false,
        id: 'mock-vote-id-123'
      },
      message: {
        pollUpdateMessage: {
          pollCreationMessageKey: {
            id: generatedPollMessageId,
            remoteJid: '923134725415@s.whatsapp.net',
            fromMe: true
          },
          vote: {
            selectedOptions: [
              cancelOptionHash
            ],
            senderTimestampMs: String(Date.now())
          }
        }
      }
    };

    // 7. STEP 4 & 5: Execute the Decryption & Tag Sync Handler
    console.log('⚙️ [TestStep 4] Passing mock vote into syncPollVoteToShopify...');
    await syncPollVoteToShopify(botInstance, mockMsg, db);

    // Wait for the asynchronous tag update payload to complete and resolve
    console.log('⏳ Waiting for Shopify non-blocking tags sync to complete...');
    
    // Set a safety timeout of 3 seconds
    const timeout = setTimeout(() => {
      rejectTest(new Error('Timed out waiting for Shopify tags sync PUT request'));
    }, 3000);

    const updatedTags = await testPromise;
    clearTimeout(timeout);

    console.log('🎉 ----------------------------------------------------');
    console.log('🎉 INTEGRATION TEST COMPLETED SUCCESSFULLY!');
    console.log(`🎉 Shopify order was updated with tag payload: "${updatedTags}"`);
    console.log('🎉 ----------------------------------------------------');
    process.exit(0);

  } catch (err) {
    console.error('❌ Test failed with error:', err.stack || err.message);
    process.exit(1);
  }
});
