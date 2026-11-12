const express = require('express');
const router = express.Router();
const { db } = require('../db');

const MAX_CATALOG_ITEMS = 500; // Hard cap per response to keep payload/RAM small

// Size aliases: customers/stores use XXL/2XL interchangeably
const SIZE_ALIASES = {
  XXL: '2XL', XXXL: '3XL', XXXXL: '4XL', XXXXXL: '5XL', XXXXXXL: '6XL',
  '2X': '2XL', '3X': '3XL', '4X': '4XL', '5X': '5XL', '6X': '6XL'
};

function normalizeSize(raw) {
  const s = String(raw || '').trim().toUpperCase();
  return SIZE_ALIASES[s] || s;
}

// Tokenize "Black / XL" -> ['BLACK', 'XL'] (each token normalized)
function tokenize(text) {
  return String(text || '')
    .split(/[\/\-,|_\s]+/)
    .map(t => normalizeSize(t))
    .filter(Boolean);
}

// products.title is stored as "Product Title (Variant Title)"; extract the variant part
function extractVariantPart(title) {
  const m = String(title || '').match(/\(([^()]*)\)\s*$/);
  return m ? m[1] : '';
}

function matchesSize(title, sku, targetSize) {
  const normTarget = normalizeSize(targetSize);
  const isNumeric = /^\d+$/.test(normTarget);

  // 1. Check parenthesized variant part: "Title (Black / XL)"
  const variantPart = extractVariantPart(title);
  if (variantPart && tokenize(variantPart).includes(normTarget)) {
    return true;
  }

  // 2. Check tokens after hyphen or slash: "Title - XL" or "Title / XL"
  const splitDash = String(title || '').split(/\s*[-–—/]\s*/);
  if (splitDash.length > 1) {
    const lastPart = splitDash[splitDash.length - 1];
    if (tokenize(lastPart).includes(normTarget)) {
      return true;
    }
  }

  // 3. Check entire title tokens
  if (tokenize(title).includes(normTarget)) {
    return true;
  }

  // 4. SKU fallback (e.g. SKU contains "-XL" or "-32")
  const skuTokens = tokenize(sku);
  if (skuTokens.includes(normTarget)) {
    return true;
  }

  return false;
}

// GET /api/whatsapp/in-stock-images?size=XL&include_continue_selling=true&store_id=1
router.get('/in-stock-images', (req, res) => {
  try {
    const size = normalizeSize(req.query.size);
    if (!size) {
      return res.status(400).json({ success: false, error: 'size parameter is required' });
    }
    const includeContinue = String(req.query.include_continue_selling) === 'true';
    const storeId = Number(req.query.store_id || req.headers['x-active-store-id']) || 1;

    // 1. Primary lookup: products table
    let rows = db.prepare(`
      SELECT shopify_variant_id, sku, title, image_url, price, inventory_qty, inventory_policy
      FROM products
      WHERE store_id = ?
        AND image_url IS NOT NULL AND image_url != ''
        AND (status IS NULL OR LOWER(status) = 'active')
        AND (inventory_qty > 0 ${includeContinue ? "OR LOWER(IFNULL(inventory_policy, '')) = 'continue'" : ''})
      ORDER BY title ASC
    `).all(storeId);

    // 2. Fallback lookup: product_master_costs table if products has 0 rows for this store
    if (!rows || rows.length === 0) {
      rows = db.prepare(`
        SELECT 
          shopify_variant_id, 
          sku, 
          (parent_title || CASE WHEN variant_title IS NOT NULL AND variant_title != '' AND variant_title != 'Default Title' THEN ' (' || variant_title || ')' ELSE '' END) AS title, 
          variant_image_url AS image_url, 
          selling_price AS price, 
          inventory_qty, 
          inventory_policy
        FROM product_master_costs
        WHERE store_id = ?
          AND variant_image_url IS NOT NULL AND variant_image_url != ''
          AND (status IS NULL OR LOWER(status) = 'active')
          AND (inventory_qty > 0 ${includeContinue ? "OR LOWER(IFNULL(inventory_policy, '')) = 'continue'" : ''})
        ORDER BY parent_title ASC
      `).all(storeId);
    }

    const variants = [];
    for (const r of rows) {
      if (!matchesSize(r.title, r.sku, size)) continue;

      variants.push({
        shopify_variant_id: r.shopify_variant_id,
        title: r.title,
        sku: r.sku || '',
        price: Number(r.price) || 0,
        image_url: r.image_url,
        inventory_qty: r.inventory_qty || 0
      });
      if (variants.length >= MAX_CATALOG_ITEMS) break;
    }

    res.json({ success: true, size, count: variants.length, variants });
  } catch (err) {
    console.error('Error fetching in-stock catalog images:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/whatsapp/templates - Fetch active whatsapp templates for EditOrderModal dropdown
router.get('/templates', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, name, content, type, is_default, status 
      FROM whatsapp_templates 
      WHERE status = 'active' OR status IS NULL 
      ORDER BY id DESC
    `).all();
    res.json(rows);
  } catch (err) {
    console.error('Error fetching whatsapp templates alias:', err.message);
    res.json([]);
  }
});

module.exports = router;
