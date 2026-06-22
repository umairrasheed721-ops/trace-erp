const axios = require('axios');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';

// Helper to clean style strings by removing specific presentation properties
function cleanStyleVal(styleVal) {
  if (!styleVal) return '';
  const parts = styleVal.split(';');
  const cleanParts = [];
  for (let part of parts) {
    part = part.trim();
    if (!part) continue;
    const colonIdx = part.indexOf(':');
    if (colonIdx === -1) continue;
    const propName = part.substring(0, colonIdx).trim().toLowerCase();
    const stripProps = ['font-family', 'font-size', 'color', 'background-color', 'line-height', 'height', 'width', 'border'];
    if (stripProps.includes(propName)) continue;
    cleanParts.push(part);
  }
  return cleanParts.length > 0 ? `style="${cleanParts.join('; ')};"` : '';
}

// Main HTML Cleaning function
function cleanHTML(html, title) {
  if (!html) return '';
  
  let result = html;

  // 1. Remove draft metadata attributes
  result = result.replace(/\s*data-mce-fragment="[^"]*"/gi, '');
  result = result.replace(/\s*data-start="[^"]*"/gi, '');
  result = result.replace(/\s*data-end="[^"]*"/gi, '');
  result = result.replace(/\s*data-is-last-node="[^"]*"/gi, '');

  // 2. Strip border, height, and width attributes
  result = result.replace(/\s+(width|height|border)\s*=\s*"[^"]*"/gi, '');
  result = result.replace(/\s+(width|height|border)\s*=\s*'[^']*'/gi, '');

  // 3. Strip style attributes completely from table elements to let theme style them
  result = result.replace(/<(table|thead|tbody|tr|td|th)([^>]*?)(style="[^"]*?"|style='[^']*?')(.*?)>/gi, '<$1$2$4>');

  // 4. Clean style attributes of other tags
  result = result.replace(/style="([^"]*?)"/gi, (match, val) => {
    return cleanStyleVal(val);
  });
  result = result.replace(/style='([^']*?)'/gi, (match, val) => {
    return cleanStyleVal(val);
  });

  // 5. Clean up redundant empty tags or spaces
  result = result.replace(/<span\s*><\/span>/gi, '');
  result = result.replace(/<p><!----><\/p>/gi, '');
  result = result.replace(/<p>\s*<\/p>/gi, '');
  
  // 6. Product-Specific Structural Fixes (Aesthetic Enhancements)
  
  // AX Embroidery & Tipping Crew - remove bright neon green and make layout uniform
  if (title.includes("A | X Embroidery") || title.includes("Tipping Crew")) {
    result = result.replace(/<h3[^>]*?>FABRIC:.*?<\/h3>/gi, '');
    result = result.replace(/<p[^>]*?><strong>FABRIC<\/strong>:.*?<\/p>/gi, '');
    result = result.replace(/<h3[^>]*?>Embroidery.*?<\/h3>/gi, '');
    result = result.replace(/<p[^>]*?><strong>Embroidery<\/strong>.*?<\/p>/gi, '');
    
    result = `<p><strong>Fabric:</strong> Pique Combed - Cotton and Lycra lightweight breathable.</p>\n<p><strong>Design Details:</strong> Embroidery logos, Jacquard knit rib collar.</p>`;
  }

  // Basic RL Crew- Cotton - Normalize disclaimer heading and tidy margins
  if (title.includes("Basic RL Crew- Cotton")) {
    result = result.replace(/<h2><span[^>]*?>0.5 inches variation acceptable.*?<\/span><\/h2>/gi, '');
    result = result + `\n<p style="font-size: 0.85rem; color: #666; font-style: italic; margin-top: 10px;">0.5 inches variation acceptable as per international standards.</p>`;
  }

  // Embossed NIK-E - Clean nested divs and margins
  if (title.includes("Embossed NIK-E")) {
    result = `<p><strong>Fabric:</strong><br>Micro dry-fit, 2-way stretchable (left &amp; right) for enhanced flexibility and comfort.</p>
<p><strong>Ideal Use:</strong><br>Perfect for activewear and athletic activities in summer.</p>
<p><strong>Design Features:</strong></p>
<ul>
<li>Snap reflector Embossed logo.</li>
<li>Brand tagging.</li>
</ul>
<p><strong>Size Chart:</strong></p>
<table style="width: 100%; max-width: 400px; border-collapse: collapse;">
<thead>
<tr>
<th style="padding: 8px; font-weight: bold; text-align: center; border: 1px solid #ddd;">SIZE</th>
<th style="padding: 8px; font-weight: bold; text-align: center; border: 1px solid #ddd;">LENGTH</th>
<th style="padding: 8px; font-weight: bold; text-align: center; border: 1px solid #ddd;">CHEST</th>
</tr>
</thead>
<tbody>
<tr>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;"><strong>M</strong></td>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;">27.5</td>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;">19 (38)</td>
</tr>
<tr>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;"><strong>L</strong></td>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;">28.5</td>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;">20 (40)</td>
</tr>
<tr>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;"><strong>XL</strong></td>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;">29.5</td>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;">21 (42)</td>
</tr>
</tbody>
</table>
<p style="font-size: 0.85rem; color: #666; font-style: italic; margin-top: 10px;">0.5 inch variation is acceptable on international standards.</p>`;
  }

  // NIK- Ref LOGO - Fix header tag abuses, empty divs, and convert to lists
  if (title.includes("NIK- Ref LOGO")) {
    result = `<p><strong>Fabric:</strong><br>Micro dry-fit in Jersey knitting style with a stretch of 2-way (left &amp; right) for comfort and flexibility.</p>
<p><strong>Ideal Use:</strong><br>Gym wear and activewear activities.</p>
<p><strong>Design Features:</strong></p>
<ul>
<li>Snap reflector stickers.</li>
<li>Branded taggings.</li>
</ul>`;
  }

  // ADI-Trouser Tri strip - Remove h6 heading tags and style table nicely
  if (title.includes("ADI-Trouser Tri strip")) {
    result = `<p><strong>Fabric:</strong><br>Micro dry-fit, 2-way stretchable (left and right) for enhanced flexibility and comfort.</p>
<p><strong>Ideal Use:</strong><br>Perfect for activewear and athletic activities in summer.</p>
<p><strong>Design Features:</strong></p>
<ul>
<li>Three sleek lines for a modern, dynamic look.</li>
<li>Athletic slim fit for a tailored, performance-ready style.</li>
</ul>
<p><strong>Size Chart:</strong></p>
<table style="width: 100%; max-width: 400px; border-collapse: collapse;">
<thead>
<tr>
<th style="padding: 8px; font-weight: bold; text-align: center; border: 1px solid #ddd;">Size</th>
<th style="padding: 8px; font-weight: bold; text-align: center; border: 1px solid #ddd;">Length</th>
<th style="padding: 8px; font-weight: bold; text-align: center; border: 1px solid #ddd;">Waist</th>
</tr>
</thead>
<tbody>
<tr>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;"><strong>M</strong></td>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;">39</td>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;">28-32</td>
</tr>
<tr>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;"><strong>L</strong></td>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;">40</td>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;">32-36</td>
</tr>
<tr>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;"><strong>XL</strong></td>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;">40.5</td>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;">36-38</td>
</tr>
</tbody>
</table>
<p style="font-size: 0.85rem; color: #666; font-style: italic; margin-top: 10px;">0.5 inches variation acceptable as per international standards.</p>`;
  }

  // Multi-ref-ADI Trouser winter - Remove h4 and h3 abuses and style table nicely
  if (title.includes("Multi-ref-ADI Trouser winter")) {
    result = `<p><strong>Fabric:</strong><br>Micro dry-fit Fleece, 2-way stretchable (left and right) for enhanced flexibility and comfort.</p>
<p><strong>Ideal Use:</strong><br>Perfect for activewear and athletic activities in winter.</p>
<p><strong>Design Features:</strong></p>
<ul>
<li>Three sleek lines for a modern, dynamic look.</li>
<li>Athletic slim fit for a tailored, performance-ready style.</li>
</ul>
<p><strong>Size Chart:</strong></p>
<table style="width: 100%; max-width: 400px; border-collapse: collapse;">
<thead>
<tr>
<th style="padding: 8px; font-weight: bold; text-align: center; border: 1px solid #ddd;">Size</th>
<th style="padding: 8px; font-weight: bold; text-align: center; border: 1px solid #ddd;">Length</th>
<th style="padding: 8px; font-weight: bold; text-align: center; border: 1px solid #ddd;">Waist</th>
</tr>
</thead>
<tbody>
<tr>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;"><strong>M</strong></td>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;">37</td>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;">28-32</td>
</tr>
<tr>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;"><strong>L</strong></td>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;">38</td>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;">32-36</td>
</tr>
<tr>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;"><strong>XL</strong></td>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;">39</td>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;">36-38</td>
</tr>
</tbody>
</table>`;
  }

  // Popcorn Polo - Make table responsive, clean styles, normalize footer disclaimer
  if (title.includes("Popcorn Polo")) {
    result = `<p><strong>Fabric:</strong> Premium Blend Cotton with Popcorn Texture (Approx. 220 GSM)</p>
<p>(<em>Price is set to maintain quality standards.</em>)</p>
<p><strong>Ideal Use:</strong> Textured design for a sleek and refined look.</p>
<p><strong>Size Chart:</strong></p>
<table style="width: 100%; max-width: 450px; border-collapse: collapse;">
<thead>
<tr>
<th style="padding: 8px; font-weight: bold; text-align: center; border: 1px solid #ddd;">SIZE</th>
<th style="padding: 8px; font-weight: bold; text-align: center; border: 1px solid #ddd;">CHEST</th>
<th style="padding: 8px; font-weight: bold; text-align: center; border: 1px solid #ddd;">LENGTH</th>
<th style="padding: 8px; font-weight: bold; text-align: center; border: 1px solid #ddd;">SHOULDER</th>
</tr>
</thead>
<tbody>
<tr>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;"><strong>M</strong></td>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;">19.5''</td>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;">27.5''</td>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;">5.5''</td>
</tr>
<tr>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;"><strong>L</strong></td>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;">21''</td>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;">28''</td>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;">6''</td>
</tr>
<tr>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;"><strong>XL</strong></td>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;">22''</td>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;">29.5''</td>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;">6.5''</td>
</tr>
<tr>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;"><strong>2XL</strong></td>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;">24''</td>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;">31.5''</td>
<td style="padding: 8px; text-align: center; border: 1px solid #ddd;">7''</td>
</tr>
</tbody>
</table>
<p style="font-size: 0.85rem; color: #666; font-style: italic; margin-top: 10px;">0.5 inches variation acceptable as per international standards.<br>Colors may slightly vary from screen to screen.</p>`;
  }

  // AD-D Multi Ref Stripes / Silver Ref Stripes
  if (title.includes("A-D Multi Ref Stripes") || title.includes("Silver Ref Stripes")) {
    result = `<p><strong>Fabric:</strong><br>Micro dry-fit, 2-way stretchable (left &amp; right) for enhanced flexibility and comfort.</p>
<p><strong>Ideal Use:</strong><br>Perfect for activewear and athletic activities in summer.</p>
<p><strong>Design Features:</strong></p>
<ul>
<li>Snap reflector stickers.</li>
<li>Brand tagging.</li>
</ul>`;
  }

  // Imported Scoba Executive - strip underlines
  if (title.includes("Imported Scoba")) {
    result = result.replace(/<u>/gi, '').replace(/<\/u>/gi, '');
    result = result.replace(/<span[^>]*?text-decoration\s*:\s*underline[^>]*?>(.*?)<\/span>/gi, '$1');
  }

  return result.trim();
}

async function updateProductDescription(productId, cleanBody) {
  const url = `https://${shopDomain}/admin/api/2024-10/products/${productId}.json`;
  const payload = {
    product: {
      id: productId,
      body_html: cleanBody
    }
  };

  try {
    const res = await axios.put(url, payload, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });
    if (res.status === 200) {
      console.log(`✅ Cleaned description for: "${res.data.product.title}"`);
      return true;
    }
  } catch (err) {
    console.error(`❌ Failed to update description for product ${productId}:`, err.response ? err.response.data : err.message);
  }
  return false;
}

async function main() {
  const headers = {
    'X-Shopify-Access-Token': accessToken,
    'Content-Type': 'application/json'
  };

  try {
    console.log('Fetching live product descriptions...');
    const res = await axios.get(
      `https://${shopDomain}/admin/api/2024-10/products.json?status=active&limit=100`,
      { headers }
    );
    
    const products = res.data.products;
    console.log(`Loaded ${products.length} products to clean.\n`);

    for (const p of products) {
      const original = p.body_html || '';
      const cleaned = cleanHTML(original, p.title);
      
      if (original !== cleaned) {
        console.log(`Cleaning styling anomalies for: "${p.title}"...`);
        await updateProductDescription(p.id, cleaned);
        // Be nice to Shopify API rate limit (2 req/s)
        await new Promise(resolve => setTimeout(resolve, 600));
      } else {
        console.log(`✔ "${p.title}" already clean.`);
      }
    }

    console.log('\nAll active product descriptions sanitized successfully!');

  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
