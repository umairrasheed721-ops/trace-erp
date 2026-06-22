const axios = require('axios');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';

async function main() {
  const headers = {
    'X-Shopify-Access-Token': accessToken,
    'Content-Type': 'application/json'
  };

  try {
    console.log('Fetching descriptions of active products...');
    const res = await axios.get(
      `https://${shopDomain}/admin/api/2024-10/products.json?status=active&limit=100`,
      { headers }
    );
    
    const products = res.data.products;
    console.log(`Checking ${products.length} products...\n`);

    const stylingIssues = [];

    products.forEach(p => {
      const html = p.body_html || '';
      const fonts = [];
      const inlineStyles = [];
      
      // Match font-family
      const fontRegex = /font-family\s*:\s*([^;"]+)/gi;
      let match;
      while ((match = fontRegex.exec(html)) !== null) {
        fonts.push(match[1].trim());
      }

      // Match font-size
      const sizeRegex = /font-size\s*:\s*([^;"]+)/gi;
      while ((match = sizeRegex.exec(html)) !== null) {
        inlineStyles.push(`size: ${match[1].trim()}`);
      }

      // Match color inline styles
      const colorRegex = /color\s*:\s*([^;"]+)/gi;
      while ((match = colorRegex.exec(html)) !== null) {
        inlineStyles.push(`color: ${match[1].trim()}`);
      }

      // Check for elements like <font>, <b>, etc., or style attributes
      const hasFontTags = /<font[^>]*>/i.test(html);
      const styleAttrRegex = /style\s*=\s*"[^"]*"/gi;
      const styleAttrCount = (html.match(styleAttrRegex) || []).length;

      if (fonts.length > 0 || inlineStyles.length > 0 || hasFontTags || styleAttrCount > 0) {
        stylingIssues.push({
          id: p.id,
          title: p.title,
          handle: p.handle,
          fontsDetected: [...new Set(fonts)],
          otherStylesDetected: [...new Set(inlineStyles)].slice(0, 5),
          hasFontTags,
          styleAttrCount,
          bodyLength: html.length
        });
      }
    });

    console.log('=== PRODUCTS WITH INLINE STYLING ISSUES ===');
    console.log(JSON.stringify(stylingIssues, null, 2));
    
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
