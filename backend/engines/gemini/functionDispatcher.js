const { db } = require('../../db');

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
    const { broadcast } = require('../../websocket');
    broadcast('memory_update', { phone: cleaned, memoryText });
  } catch (e) {
    console.error('Failed to broadcast memory update:', e.message);
  }
}

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
        const store = db.prepare('SELECT id FROM stores LIMIT 1').get();
        if (store) {
          const rows = db.prepare(`
            SELECT title, sku, price, image_url, inventory_qty, product_url 
            FROM products 
            WHERE store_id = ? 
            AND (
              sku LIKE ? 
              OR title LIKE ? 
              OR title LIKE ?
              OR title LIKE ?
            )
          `).all(
            store.id,
            `%-${normSize}`,
            `%(${normSize})%`,
            `%/ ${normSize})%`,
            `%(${normSize} /%`
          );

          if (rows && rows.length > 0) {
            products = rows.map(r => ({
              title: r.title,
              sku: r.sku || '',
              price: r.price,
              image_url: r.image_url || '',
              inventory_qty: r.inventory_qty || 0,
              product_url: r.product_url || ''
            }));
          }
        }
      } catch (err) {
        console.error('⚠️ fetchCatalog local DB query error:', err.message);
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

module.exports = {
  executeToolCall,
  broadcastMemoryUpdate,
  normalizeSizeInput
};
