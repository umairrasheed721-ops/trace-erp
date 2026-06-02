const { db } = require('../db');

function logGeminiUsage({ phone = null, status = 'success', model = 'gemini-2.5-flash', toolCalled = null, errorMsg = null, responseMs = 0 }) {
  try {
    db.prepare(`INSERT INTO gemini_usage_logs (phone, status, model, tool_called, error_msg, response_ms) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(phone, status, model, toolCalled, errorMsg, responseMs);
  } catch(e) { /* silent */ }
}

function resolveModelName(modelName) {
  const map = {
    'gemini-1.5-flash': 'gemini-2.5-flash',
    'gemini-1.5-pro': 'gemini-2.5-pro'
  };
  return map[modelName] || modelName || 'gemini-2.5-flash';
}

async function fetchWithRetry(url, options, maxRetries = 3, initialDelayMs = 2000) {
  let attempt = 0;
  while (attempt < maxRetries) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 seconds timeout per request
    
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (res.status === 429) {
        attempt++;
        if (attempt >= maxRetries) {
          return res;
        }

        let delay = initialDelayMs * Math.pow(2, attempt - 1);

        try {
          const cloneRes = res.clone();
          const body = await cloneRes.json();
          const errMsg = body?.error?.message || '';
          const secondsMatch = errMsg.match(/(?:retry|try again) in ([\d\.]+)\s*s/i) || errMsg.match(/([\d\.]+)\s*(?:seconds|sec|s\b)/i);
          if (secondsMatch) {
            const parsedSec = parseFloat(secondsMatch[1]);
            if (!isNaN(parsedSec) && parsedSec > 0) {
              delay = Math.ceil(parsedSec + 1) * 1000;
            }
          }
        } catch (e) {
          // ignore cloning/parsing error
        }

        console.warn(`⚠️ Gemini API 429 (Rate Limit). Retrying attempt ${attempt}/${maxRetries} in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timeoutId);
      attempt++;
      if (attempt >= maxRetries) {
        throw err;
      }
      const delay = initialDelayMs * Math.pow(2, attempt - 1);
      console.warn(`⚠️ Fetch error: ${err.message}. Retrying attempt ${attempt}/${maxRetries} in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * 🧠 TRACE ERP: Gemini Autonomous AI Orchestration Engine
 * Implements RAG memory, Function Calling (Tool Use), and Nightly Self-Learning Audit.
 */

// Define Available Database Tools for Gemini
const geminiTools = [
  {
    functionDeclarations: [
      {
        name: 'getOrderStatus',
        description: 'Get the live tracking number, courier name, delivery status, and verification status for a customer phone number.',
        parameters: {
          type: 'OBJECT',
          properties: {
            phone: { type: 'STRING', description: 'The 10 or 12 digit phone number of the customer.' }
          },
          required: ['phone']
        }
      },
      {
        name: 'checkProductStock',
        description: 'Check live inventory availability, SKU, and unit price for a product title or keyword.',
        parameters: {
          type: 'OBJECT',
          properties: {
            product_title: { type: 'STRING', description: 'The title, variant, or keyword of the product.' }
          },
          required: ['product_title']
        }
      },
      {
        name: 'createDraftOrder',
        description: 'Autonomously create a verified Draft order in the ERP when a customer requests to place a new order.',
        parameters: {
          type: 'OBJECT',
          properties: {
            customer_name: { type: 'STRING', description: 'Full name of the customer.' },
            phone: { type: 'STRING', description: 'Customer phone number.' },
            address: { type: 'STRING', description: 'Complete delivery street address.' },
            city: { type: 'STRING', description: 'Delivery city.' },
            product_sku_or_title: { type: 'STRING', description: 'SKU or title of the product they wish to buy.' },
            price: { type: 'NUMBER', description: 'Total agreed price.' }
          },
          required: ['customer_name', 'phone', 'address', 'city', 'product_sku_or_title', 'price']
        }
      },
      {
        name: 'updateCustomerProfile',
        description: 'Save persistent customer preferences, sizing, or delivery instructions into their long-term profile.',
        parameters: {
          type: 'OBJECT',
          properties: {
            phone: { type: 'STRING', description: 'Customer phone number.' },
            preference_key: { type: 'STRING', description: 'Key of the preference (e.g., preferred_size, delivery_time, special_notes).' },
            preference_value: { type: 'STRING', description: 'Value of the preference.' }
          },
          required: ['phone', 'preference_key', 'preference_value']
        }
      },
      {
        name: 'fetchCatalog',
        description: 'Fetch the available product catalog, sizing recommendations, and product images matching a specific size.',
        parameters: {
          type: 'OBJECT',
          properties: {
            size: { type: 'STRING', description: 'The requested size (e.g. M, L, XL, 2XL, 3XL, 4XL, 5XL, 6XL).' }
          },
          required: ['size']
        }
      },
      {
        name: 'getMatchingRecommendations',
        description: 'Get automated matching product recommendations (e.g., pairs shirts with cargo pants) to cross-sell to the customer in their preferred size.',
        parameters: {
          type: 'OBJECT',
          properties: {
            product_sku_or_title: { type: 'STRING', description: 'SKU or title of the product they are looking at or ordering.' },
            size: { type: 'STRING', description: 'Preferred size (e.g., M, L, XL, 2XL, 3XL, 4XL, 5XL, 6XL).' }
          },
          required: ['product_sku_or_title', 'size']
        }
      }
    ]
  }
];

const MOCK_CATALOG = {
  'M': [
    { title: 'Classic Oxford Shirt - Medium', price: 2999, sku: 'OX-M', image_url: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=500', inventory_qty: 15 },
    { title: 'Premium Polo Shirt - Medium', price: 2499, sku: 'PL-M', image_url: 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=500', inventory_qty: 8 },
    { title: 'Premium Crewneck Sweatshirt - Medium', price: 3499, sku: 'CN-M', image_url: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=500', inventory_qty: 10 },
    { title: 'Urban Cargo Pants - Medium', price: 3999, sku: 'CG-M', image_url: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=500', inventory_qty: 5 }
  ],
  'L': [
    { title: 'Classic Oxford Shirt - Large', price: 2999, sku: 'OX-L', image_url: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=500', inventory_qty: 20 },
    { title: 'Premium Polo Shirt - Large', price: 2499, sku: 'PL-L', image_url: 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=500', inventory_qty: 12 },
    { title: 'Premium Crewneck Sweatshirt - Large', price: 3499, sku: 'CN-L', image_url: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=500', inventory_qty: 12 },
    { title: 'Urban Cargo Pants - Large', price: 3999, sku: 'CG-L', image_url: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=500', inventory_qty: 8 }
  ],
  'XL': [
    { title: 'Classic Oxford Shirt - XL', price: 2999, sku: 'OX-XL', image_url: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=500', inventory_qty: 18 },
    { title: 'Premium Polo Shirt - XL', price: 2499, sku: 'PL-XL', image_url: 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=500', inventory_qty: 14 },
    { title: 'Premium Crewneck Sweatshirt - XL', price: 3499, sku: 'CN-XL', image_url: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=500', inventory_qty: 15 },
    { title: 'Urban Cargo Pants - XL', price: 3999, sku: 'CG-XL', image_url: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=500', inventory_qty: 10 }
  ],
  '2XL': [
    { title: 'Classic Oxford Shirt - 2XL', price: 2999, sku: 'OX-2XL', image_url: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=500', inventory_qty: 12 },
    { title: 'Premium Polo Shirt - 2XL', price: 2499, sku: 'PL-2XL', image_url: 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=500', inventory_qty: 10 },
    { title: 'Premium Crewneck Sweatshirt - 2XL', price: 3499, sku: 'CN-2XL', image_url: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=500', inventory_qty: 6 },
    { title: 'Urban Cargo Pants - 2XL', price: 3999, sku: 'CG-2XL', image_url: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=500', inventory_qty: 4 }
  ],
  '3XL': [
    { title: 'Classic Oxford Shirt - 3XL', price: 2999, sku: 'OX-3XL', image_url: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=500', inventory_qty: 8 },
    { title: 'Premium Polo Shirt - 3XL', price: 2499, sku: 'PL-3XL', image_url: 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=500', inventory_qty: 5 },
    { title: 'Premium Crewneck Sweatshirt - 3XL', price: 3499, sku: 'CN-3XL', image_url: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=500', inventory_qty: 10 },
    { title: 'Urban Cargo Pants - 3XL', price: 3999, sku: 'CG-3XL', image_url: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=500', inventory_qty: 5 }
  ],
  '4XL': [
    { title: 'Classic Oxford Shirt - 4XL', price: 2999, sku: 'OX-4XL', image_url: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=500', inventory_qty: 10 },
    { title: 'Premium Polo Shirt - 4XL', price: 2499, sku: 'PL-4XL', image_url: 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=500', inventory_qty: 6 },
    { title: 'Premium Crewneck Sweatshirt - 4XL', price: 3499, sku: 'CN-4XL', image_url: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=500', inventory_qty: 12 },
    { title: 'Urban Cargo Pants - 4XL', price: 3999, sku: 'CG-4XL', image_url: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=500', inventory_qty: 7 }
  ],
  '5XL': [
    { title: 'Classic Oxford Shirt - 5XL', price: 2999, sku: 'OX-5XL', image_url: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=500', inventory_qty: 5 },
    { title: 'Premium Polo Shirt - 5XL', price: 2499, sku: 'PL-5XL', image_url: 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=500', inventory_qty: 3 },
    { title: 'Premium Crewneck Sweatshirt - 5XL', price: 3499, sku: 'CN-5XL', image_url: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=500', inventory_qty: 8 },
    { title: 'Urban Cargo Pants - 5XL', price: 3999, sku: 'CG-5XL', image_url: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=500', inventory_qty: 3 }
  ],
  '6XL': [
    { title: 'Classic Oxford Shirt - 6XL', price: 2999, sku: 'OX-6XL', image_url: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=500', inventory_qty: 3 },
    { title: 'Premium Polo Shirt - 6XL', price: 2499, sku: 'PL-6XL', image_url: 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=500', inventory_qty: 2 },
    { title: 'Premium Crewneck Sweatshirt - 6XL', price: 3499, sku: 'CN-6XL', image_url: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=500', inventory_qty: 5 },
    { title: 'Urban Cargo Pants - 6XL', price: 3999, sku: 'CG-6XL', image_url: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=500', inventory_qty: 2 }
  ]
};

function normalizeSizeInput(raw) {
  if (!raw) return 'XL';
  const norm = String(raw).trim().toUpperCase();
  if (norm === 'M' || norm.includes('MED')) return 'M';
  if (norm === 'L' || norm.includes('LARGE')) return 'L';
  if (norm === 'XL' || norm.includes('EXTRA LARGE') || norm.includes('EXTRALARGE')) return 'XL';
  if (norm.includes('2XL') || norm.includes('2 XL') || norm.includes('XXL') || norm.includes('DOUBLE')) return '2XL';
  if (norm.includes('3XL') || norm.includes('3 XL') || norm.includes('XXXL') || norm.includes('TRIPLE')) return '3XL';
  if (norm.includes('4XL') || norm.includes('4 XL') || norm.includes('XXXXL')) return '4XL';
  if (norm.includes('5XL') || norm.includes('5 XL')) return '5XL';
  if (norm.includes('6XL') || norm.includes('6 XL')) return '6XL';
  return norm;
}

// Helper to execute local DB tools (Made async to support API requests)
async function executeToolCall(name, args) {
  console.log(`🛠️ Gemini Tool Execution: ${name}`, args);
  try {
    if (name === 'getOrderStatus') {
      let cleaned = (args.phone || '').replace(/\D/g, '');
      const order = db.prepare(`SELECT id, shopify_order_id, ref_number, tracking_number, courier, delivery_status, wa_verification_status, price, order_date FROM orders WHERE phone LIKE ? ORDER BY id DESC LIMIT 1`).get(`%${cleaned.substring(cleaned.length - 10)}%`);
      if (!order) return { success: false, message: `No active order found for phone ${args.phone}` };
      return { success: true, order };
    }

    if (name === 'checkProductStock') {
      const rows = db.prepare(`SELECT shopify_variant_id, parent_title, variant_title, sku, selling_price, inventory_qty FROM product_master_costs WHERE parent_title LIKE ? OR variant_title LIKE ? LIMIT 5`).all(`%${args.product_title}%`, `%${args.product_title}%`);
      if (!rows || rows.length === 0) return { success: false, message: `No matching products found for '${args.product_title}'` };
      return { success: true, products: rows };
    }

    if (name === 'createDraftOrder') {
      let cleaned = (args.phone || '').replace(/\D/g, '');
      const fakeShopifyId = 'DRAFT-' + Date.now();
      const fakeRef = 'TR-' + Math.floor(Math.random() * 90000 + 10000);
      
      db.prepare(`
        INSERT INTO orders (store_id, shopify_order_id, ref_number, customer_name, phone, address, city, price, delivery_status, order_source, product_titles)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, 'Pending', 'WhatsApp Bot AI', ?)
      `).run(fakeShopifyId, fakeRef, args.customer_name, cleaned, args.address, args.city, Number(args.price), args.product_sku_or_title);
      
      return { success: true, message: `Draft order ${fakeRef} created successfully for ${args.customer_name}.` };
    }

    if (name === 'updateCustomerProfile') {
      let cleaned = (args.phone || '').replace(/\D/g, '');
      let profile = db.prepare('SELECT id, preferences FROM customer_profiles WHERE phone = ?').get(cleaned);
      let prefs = {};
      if (profile && profile.preferences) {
        try { prefs = JSON.parse(profile.preferences); } catch(e){}
      }
      prefs[args.preference_key] = args.preference_value;

      db.prepare(`
        INSERT INTO customer_profiles (phone, preferences, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(phone) DO UPDATE SET preferences = excluded.preferences, updated_at = datetime('now')
      `).run(cleaned, JSON.stringify(prefs));

      broadcastMemoryUpdate(cleaned);

      return { success: true, message: `Profile updated: ${args.preference_key} = ${args.preference_value}` };
    }

    if (name === 'fetchCatalog') {
      const normSize = normalizeSizeInput(args.size);
      let products = [];
      try {
        const store = db.prepare('SELECT shop_domain, access_token FROM stores LIMIT 1').get();
        if (store && store.access_token && store.access_token !== 'PENDING') {
          const fetchFn = typeof fetch === 'function' ? fetch : require('node-fetch');
          const res = await fetchFn(`https://${store.shop_domain}/admin/api/2024-10/products.json?limit=50`, {
            headers: { 'X-Shopify-Access-Token': store.access_token }
          });
          if (res.ok) {
            const data = await res.json();
            const shopifyProducts = data.products || [];
            shopifyProducts.forEach(p => {
              p.variants.forEach(v => {
                const matchSize = v.title.trim().toUpperCase() === normSize || 
                                  v.sku.trim().toUpperCase().includes(normSize) ||
                                  p.title.trim().toUpperCase().includes(normSize);
                if (matchSize) {
                  const image = p.images.find(img => img.id === v.image_id) || p.image || p.images[0] || {};
                  products.push({
                    title: `${p.title} (${v.title})`,
                    sku: v.sku || '',
                    price: parseFloat(v.price || 0),
                    image_url: image.src || '',
                    inventory_qty: v.inventory_quantity || 0,
                    product_url: store ? `https://${store.shop_domain}/products/${p.handle}` : ''
                  });
                }
              });
            });
          }
        }
      } catch (err) {
        console.error('⚠️ fetchCatalog Shopify API error:', err.message);
      }
      
      if (products.length === 0) {
        products = MOCK_CATALOG[normSize] || MOCK_CATALOG['XL'] || [];
      }
      return { success: true, size: normSize, products };
    }

    if (name === 'getMatchingRecommendations') {
      const normSize = normalizeSizeInput(args.size);
      const queryItem = String(args.product_sku_or_title || '').toUpperCase();
      let category = 'SHIRT'; // Default fallback
      
      if (queryItem.includes('SHIRT') || queryItem.includes('POLO') || queryItem.startsWith('OX') || queryItem.startsWith('PL')) {
        category = 'PANTS';
      } else if (queryItem.includes('PANT') || queryItem.includes('CARGO') || queryItem.includes('TROUSER') || queryItem.includes('JEAN') || queryItem.startsWith('CG')) {
        category = 'SHIRT';
      } else if (queryItem.includes('SWEATSHIRT') || queryItem.includes('SWEATER') || queryItem.includes('HOODIE') || queryItem.startsWith('CN')) {
        category = 'PANTS';
      }

      let recommendation = null;

      // 1. Try to search in local database
      try {
        const searchKeyword = category === 'PANTS' ? '%Pant%' : '%Shirt%';
        const row = db.prepare(`
          SELECT parent_title, variant_title, sku, selling_price, inventory_qty 
          FROM product_master_costs 
          WHERE (parent_title LIKE ? OR variant_title LIKE ?) 
          AND (variant_title LIKE ? OR sku LIKE ?) 
          AND inventory_qty > 0 
          LIMIT 1
        `).get(searchKeyword, searchKeyword, `%${normSize}%`, `%${normSize}%`);

        if (row) {
          recommendation = {
            title: `${row.parent_title} (${row.variant_title})`,
            price: row.selling_price || 2999,
            sku: row.sku || '',
            image_url: category === 'PANTS' ? 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=500' : 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=500',
            inventory_qty: row.inventory_qty || 0
          };
        }
      } catch (dbErr) {
        console.error('⚠️ getMatchingRecommendations DB lookup error:', dbErr.message);
      }

      // 2. Fall back to high-quality mock recommendations matching the size if db empty/failed
      if (!recommendation) {
        const mockItems = MOCK_CATALOG[normSize] || MOCK_CATALOG['XL'] || [];
        // Find matching item in mock list or grab the first available
        const found = mockItems.find(item => {
          const titleUpper = item.title.toUpperCase();
          if (category === 'PANTS') {
            return titleUpper.includes('PANT') || titleUpper.includes('CARGO') || item.sku.startsWith('CG');
          } else {
            return titleUpper.includes('SHIRT') || titleUpper.includes('POLO') || item.sku.startsWith('OX') || item.sku.startsWith('PL');
          }
        });
        
        recommendation = found || mockItems[0] || null;
      }

      if (!recommendation) {
        return { success: false, message: 'No matching recommendations available at the moment.' };
      }

      return { success: true, size: normSize, recommendation };
    }

    return { success: false, message: `Unknown tool ${name}` };
  } catch (err) {
    console.error(`❌ Tool execution error (${name}):`, err.message);
    return { success: false, error: err.message };
  }
}

function broadcastMemoryUpdate(phone) {
  try {
    const cleaned = phone.replace(/\D/g, '');
    const profile = db.prepare('SELECT size_preference, is_big_and_tall, preferences, ad_source, risk_flag FROM customer_profiles WHERE phone = ?').get(cleaned);
    let lines = [];
    if (profile) {
      if (profile.size_preference) {
        lines.push(`📏 Size Preference: ${profile.size_preference}${profile.is_big_and_tall ? ' (Big & Tall)' : ''}`);
      }
      if (profile.ad_source) {
        lines.push(`🎯 Attribution: ${profile.ad_source}`);
      }
      if (profile.risk_flag && profile.risk_flag !== 'NORMAL') {
        lines.push(`🚩 Risk Flag: ${profile.risk_flag}`);
      }
      if (profile.preferences) {
        try {
          const parsed = JSON.parse(profile.preferences);
          Object.entries(parsed).forEach(([key, val]) => {
            const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            lines.push(`💡 ${label}: ${val}`);
          });
        } catch (_) {}
      }
    }
    const memoryText = lines.length > 0 ? lines.join('\n') : null;
    const { broadcast } = require('../websocket');
    broadcast('memory_update', { phone: cleaned, memoryText });
  } catch (e) {
    console.error('Failed to broadcast memory update:', e.message);
  }
}

// ─── 📏 SMART SIZING EXTRACTOR ───────────────────────────────────────────────
const SIZE_MAP = [
  { keys: ['6xl', '6 xl', '6 size', 'six xl', '6'], value: '6XL', bigAndTall: true },
  { keys: ['5xl', '5 xl', '5 size', 'five xl', '5'], value: '5XL', bigAndTall: false },
  { keys: ['4xl', '4 xl', '4 size', 'four xl', '4'], value: '4XL', bigAndTall: false },
  { keys: ['3xl', '3 xl', '3 size', 'triple xl', '3'], value: '3XL', bigAndTall: false },
  { keys: ['2xl', '2 xl', '2 size', 'double xl', '2'], value: '2XL', bigAndTall: false },
];
// Only trigger on size-relevant context words to avoid false positives on order numbers
const SIZE_CONTEXT_WORDS = ['size', 'siz', 'xl', 'fitting', 'fit', 'length', 'shirt', 'pant', 'trouser', 'kapra', 'kapray', 'suit', 'bada', 'bade', 'mota', 'heavy', 'plus size', 'big'];

function extractSizeFromMessage(phone, text) {
  if (!text || !phone) return;
  try {
    const lower = text.toLowerCase().trim();
    // Must contain a size context word to prevent triggering on random number messages
    const hasContext = SIZE_CONTEXT_WORDS.some(w => lower.includes(w));
    if (!hasContext) return;

    let matched = null;
    for (const entry of SIZE_MAP) {
      if (entry.keys.some(k => {
        // Match whole word or as standalone token
        const re = new RegExp(`(?:^|\\s|[^a-z0-9])${k.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}(?:$|\\s|[^a-z0-9])`, 'i');
        return re.test(lower);
      })) {
        matched = entry;
        break;
      }
    }

    if (!matched) return;

    db.prepare(`
      INSERT INTO customer_profiles (phone, size_preference, is_big_and_tall, size_extracted_at, updated_at)
      VALUES (?, ?, ?, datetime('now', '+5 hours'), datetime('now', '+5 hours'))
      ON CONFLICT(phone) DO UPDATE SET
        size_preference = excluded.size_preference,
        is_big_and_tall = excluded.is_big_and_tall,
        size_extracted_at = excluded.size_extracted_at,
        updated_at = excluded.updated_at
    `).run(phone, matched.value, matched.bigAndTall ? 1 : 0);

    console.log(`📏 Size extracted for ${phone}: ${matched.value} (Big & Tall: ${matched.bigAndTall})`);
    broadcastMemoryUpdate(phone);
  } catch (err) {
    console.error('📏 Size extractor error:', err.message);
  }
}

// ─── 🎯 AD ATTRIBUTION CHECKER ──────────────────────────────────────────────
function checkAdAttribution(phone, text) {
  if (!phone || !text) return;
  try {
    // Only run on first-ever message from this phone
    const msgCount = db.prepare('SELECT COUNT(*) as c FROM whatsapp_messages WHERE phone = ?').get(phone);
    if (msgCount && msgCount.c > 1) return; // Not a first message

    const campaigns = db.prepare('SELECT id, name, platform, pattern FROM ad_campaigns WHERE active = 1').all();
    if (!campaigns || campaigns.length === 0) return;

    const lower = text.toLowerCase();
    for (const campaign of campaigns) {
      try {
        const regex = new RegExp(campaign.pattern, 'i');
        if (regex.test(lower)) {
          db.prepare(`
            INSERT INTO customer_profiles (phone, ad_source, ad_platform, ad_attributed_at, updated_at)
            VALUES (?, ?, ?, datetime('now', '+5 hours'), datetime('now', '+5 hours'))
            ON CONFLICT(phone) DO UPDATE SET
              ad_source = excluded.ad_source,
              ad_platform = excluded.ad_platform,
              ad_attributed_at = excluded.ad_attributed_at,
              updated_at = excluded.updated_at
          `).run(phone, campaign.name, campaign.platform);
          console.log(`🎯 Ad attribution: ${phone} → ${campaign.platform}/${campaign.name}`);
          return; // First match wins
        }
      } catch(_){} // Ignore regex errors for individual campaigns
    }
  } catch (err) {
    console.error('🎯 Ad attribution error:', err.message);
  }
}

async function generateAIResponse(phone, userMessage) {
  let cleanedPhone = (phone || '').replace(/\D/g, '');
  try {
    const settings = db.prepare('SELECT * FROM gemini_bot_settings ORDER BY id DESC LIMIT 1').get();
    if (!settings || settings.ai_active === 0 || !settings.api_key) {
      return null; // Fallback to standard regex templates
    }

    // 1. Fetch Customer Profile
    let profile = db.prepare('SELECT customer_name, preferences, vip_status FROM customer_profiles WHERE phone = ?').get(cleanedPhone) || { customer_name: 'Customer', preferences: '{}', vip_status: 0 };
    
    // 2. Fetch RAG Knowledge Base
    const kbRows = db.prepare('SELECT category, title, content FROM gemini_knowledge_base').all() || [];
    let kbText = kbRows.map(k => `[${k.category.toUpperCase()}] ${k.title}: ${k.content}`).join('\n');

    // 3. Build Master System Instruction
    const fullSystemPrompt = `
${settings.system_prompt}

--- COMPANY KNOWLEDGE BASE & POLICIES ---
${kbText}

--- CURRENT CUSTOMER CONTEXT ---
Phone: +${cleanedPhone}
Name: ${profile.customer_name || 'Unknown'}
VIP Status: ${profile.vip_status === 1 ? 'YES (High Value Buyer)' : 'Standard'}
Saved Preferences: ${profile.preferences}

--- INSTRUCTIONS ---
You are chatting with this customer on WhatsApp. Keep your responses concise, friendly, and formatted for WhatsApp (use emojis, bold text *like this*). If they ask about order status, stock, sizing recommendations, or what products are available in their size, use your available tools first (like checkProductStock, getOrderStatus, or fetchCatalog) before replying. When they express interest in buying a product or are ready to purchase, call the getMatchingRecommendations tool to find a matching product in their size (e.g. pants if they buy a shirt) and suggest/cross-sell it to them.
`;

    // 4. Fetch Short-Term Chat Memory (Rolling context window: latest 6 messages)
    const memoryRows = db.prepare(`
      SELECT role, content FROM (
        SELECT id, role, content FROM gemini_chat_memory 
        WHERE phone = ? 
        ORDER BY id DESC LIMIT 6
      ) ORDER BY id ASC
    `).all(cleanedPhone) || [];
    
    // Build Gemini contents array
    let contents = memoryRows.map(m => ({
      role: m.role === 'model' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    // Append current user message
    contents.push({
      role: 'user',
      parts: [{ text: userMessage }]
    });

    const apiKey = settings.api_key;
    const model = resolveModelName(settings.model_name);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    // 3.5. Filter tools dynamically based on configuration switches
    const enabledDeclarations = [];
    const fullToolsList = geminiTools[0]?.functionDeclarations || [];
    
    fullToolsList.forEach(decl => {
      let isEnabled = true;
      if (decl.name === 'checkProductStock' && settings.tool_check_stock === 0) isEnabled = false;
      if (decl.name === 'getOrderStatus' && settings.tool_order_status === 0) isEnabled = false;
      if (decl.name === 'createDraftOrder' && settings.tool_create_order === 0) isEnabled = false;
      if (decl.name === 'updateCustomerProfile' && settings.tool_update_profile === 0) isEnabled = false;
      if (decl.name === 'fetchCatalog' && settings.tool_fetch_catalog === 0) isEnabled = false;
      if (decl.name === 'getMatchingRecommendations' && settings.tool_recommendations === 0) isEnabled = false;
      
      if (isEnabled) {
        enabledDeclarations.push(decl);
      }
    });

    const activeTools = enabledDeclarations.length > 0 ? [{ functionDeclarations: enabledDeclarations }] : undefined;

    // --- FIRST GEMINI FETCH (Check for Tool Call) ---
    let payload = {
      systemInstruction: { parts: [{ text: fullSystemPrompt }] },
      contents,
      tools: activeTools
    };

    const _startMs = Date.now();
    console.log(`🚀 Sending prompt to Gemini (${model})...`);
    let res = await fetchWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    let data = await res.json();
    if (!res.ok) {
      console.error('❌ Gemini API Error:', data);
      return "Shukriya! Aapka message receive ho chuka hai. Hamare support representative jald hi aapse raabta karenge. 🙏";
    }

    let candidate = data.candidates?.[0];
    if (!candidate) return null;

    let part = candidate.content?.parts?.[0];

    // --- CHECK FOR FUNCTION CALL ---
    let fetchCatalogResult = null;
    let getMatchingRecommendationsResult = null;
    if (part?.functionCall) {
      const call = part.functionCall;
      const toolResult = await executeToolCall(call.name, call.args);
      if (call.name === 'fetchCatalog' && toolResult && toolResult.success) {
        fetchCatalogResult = toolResult;
      } else if (call.name === 'getMatchingRecommendations' && toolResult && toolResult.success) {
        getMatchingRecommendationsResult = toolResult;
      }

      // Append model functionCall request to contents
      contents.push({
        role: 'model',
        parts: [{ functionCall: call }]
      });

      // Append tool response to contents
      contents.push({
        role: 'tool',
        parts: [{
          functionResponse: {
            name: call.name,
            response: { result: toolResult }
          }
        }]
      });

      // --- SECOND GEMINI FETCH (Get Final Natural Answer) ---
      console.log(`🚀 Sending Tool Response back to Gemini (${model})...`);
      let secondPayload = {
        systemInstruction: { parts: [{ text: fullSystemPrompt }] },
        contents,
        tools: activeTools
      };

      let secondRes = await fetchWithRetry(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(secondPayload)
      });

      let secondData = await secondRes.json();
      if (!secondRes.ok) {
        console.error('❌ Gemini Second API Error:', secondData);
        return "Shukriya! Aapka message receive ho chuka hai. Hamare support representative jald hi aapse raabta karenge. 🙏";
      }

      candidate = secondData.candidates?.[0];
      part = candidate?.content?.parts?.[0];
    }

    let replyText = part?.text || '';
    if (!replyText) return null;

    if (fetchCatalogResult) {
      replyText += '\n__CATALOG_JSON__' + JSON.stringify(fetchCatalogResult);
    }
    if (getMatchingRecommendationsResult) {
      replyText += '\n__RECOMMENDATION_JSON__' + JSON.stringify(getMatchingRecommendationsResult);
    }

    // --- SAVE TO CHAT MEMORY ---
    try {
      const insertMem = db.prepare('INSERT INTO gemini_chat_memory (phone, role, content) VALUES (?, ?, ?)');
      insertMem.run(cleanedPhone, 'user', userMessage);
      insertMem.run(cleanedPhone, 'model', replyText);
    } catch(memErr){}

    console.log(`🤖 Gemini AI Reply to ${cleanedPhone}: ${replyText}`);

    // Log usage
    const toolName = part?.functionCall?.name || null;
    logGeminiUsage({ phone: cleanedPhone, status: 'success', model, toolCalled: toolName, responseMs: Date.now() - _startMs });

    // --- 📏 SIZE EXTRACTOR (Post-AI, fire-and-forget) ---
    setImmediate(() => extractSizeFromMessage(cleanedPhone, userMessage));

    // --- 🎯 AD ATTRIBUTION (First-message check, fire-and-forget) ---
    setImmediate(() => checkAdAttribution(cleanedPhone, userMessage));

    return replyText;

  } catch (err) {
    console.error('❌ generateAIResponse error:', err.message);
    try { logGeminiUsage({ phone: cleanedPhone, status: 'error', errorMsg: err.message }); } catch(_){}
    return "Shukriya! Aapka message receive ho chuka hai. Hamare support representative jald hi aapse raabta karenge. 🙏";
  }
}

/**
 * 🌙 Nightly Self-Learning Audit Loop
 * Analyzes recent WhatsApp chat logs to discover customer friction points and auto-updates the system prompt.
 */
async function runNightlyAudit() {
  console.log('🌙 Initiating Gemini Nightly Self-Learning Audit...');
  try {
    const settings = db.prepare('SELECT api_key, auto_learning_enabled, system_prompt FROM gemini_bot_settings ORDER BY id DESC LIMIT 1').get();
    if (!settings || settings.auto_learning_enabled === 0 || !settings.api_key) {
      console.log('⚠️ Nightly Audit skipped: Auto-learning disabled or API key missing.');
      return { success: false, message: 'Auto-learning disabled or API key missing.' };
    }

    // Fetch last 24 hours of WhatsApp messages
    const msgs = db.prepare(`SELECT phone, direction, message, created_at FROM whatsapp_messages WHERE created_at >= datetime('now', '-24 hours') ORDER BY id ASC`).all() || [];
    if (msgs.length === 0) {
      console.log('⚠️ Nightly Audit skipped: No WhatsApp messages found in the last 24 hours.');
      return { success: false, message: 'No messages to analyze.' };
    }

    let chatLogText = msgs.map(m => `[${m.created_at}] ${m.direction === 'incoming' ? 'Customer (' + m.phone + ')' : 'Bot'}: ${m.message}`).join('\n');
    
    const auditPrompt = `
You are an expert AI Operations Auditor for an e-commerce business.
Analyze the following WhatsApp customer service chat logs from the past 24 hours.

Identify:
1. Customer Friction Points: Where were customers confused? What policies or responses caused frustration?
2. Suggested Prompt Refinements: What specific instructions should we add to the bot's system prompt to handle these scenarios better tomorrow?

Chat Logs:
${chatLogText}

Output your analysis strictly in the following JSON format:
{
  "friction_points": ["point 1", "point 2"],
  "prompt_refinements": ["refinement 1", "refinement 2"],
  "suggested_system_prompt_addition": "Specific rule to append to the system prompt."
}
`;

    const apiKey = settings.api_key;
    const model = resolveModelName('gemini-1.5-pro');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    let payload = {
      contents: [{ role: 'user', parts: [{ text: auditPrompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    };

    let res = await fetchWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    let data = await res.json();
    if (!res.ok) {
      console.error('❌ Gemini Audit API Error:', data);
      return { success: false, error: 'API Error' };
    }

    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    let parsed = {};
    try { parsed = JSON.parse(text); } catch(e){}

    const friction = JSON.stringify(parsed.friction_points || []);
    const refinements = JSON.stringify(parsed.prompt_refinements || []);
    const addition = parsed.suggested_system_prompt_addition || '';

    // Save Audit Log
    db.prepare(`
      INSERT INTO gemini_audit_logs (audit_date, messages_analyzed, friction_points, prompt_refinements)
      VALUES (date('now'), ?, ?, ?)
    `).run(msgs.length, friction, refinements);

    // Auto-Enrich System Prompt if addition exists
    if (addition && addition.length > 10) {
      const newPrompt = settings.system_prompt + '\n\n[Auto-Learned Rule ' + new Date().toISOString().split('T')[0] + ']: ' + addition;
      db.prepare('UPDATE gemini_bot_settings SET system_prompt = ?, updated_at = datetime("now")').run(newPrompt);
      console.log('✅ Nightly Audit Complete: Auto-enriched master system prompt!');
    }

    return { success: true, frictionPoints: parsed.friction_points, refinements: parsed.prompt_refinements };

  } catch (err) {
    console.error('❌ runNightlyAudit error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  generateAIResponse,
  runNightlyAudit,
  extractSizeFromMessage,
  checkAdAttribution,
};
