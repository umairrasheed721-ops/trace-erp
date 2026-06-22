const axios = require('axios');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';

const productsConfig = [
  {
    id: 8629309505795,
    title: 'Basic RL Crew- Cotton',
    cleanDescription: '<p>This Basic RL Crew is made with a blend of cotton and jersey fabric that undergoes high-quality dying and finishing processes.</p>'
  },
  {
    id: 8296437547267,
    title: 'ADI-Trouser Tri strip',
    cleanDescription: '<p><strong>Fabric:</strong><br>Micro dry-fit, 2-way stretchable (left and right) for enhanced flexibility and comfort.</p>\n<p><strong>Ideal Use:</strong><br>Perfect for activewear and athletic activities in summer.</p>\n<p><strong>Design Features:</strong></p>\n<ul>\n<li>Three sleek lines for a modern, dynamic look.</li>\n<li>Athletic slim fit for a tailored, performance-ready style.</li>\n</ul>'
  },
  {
    id: 8297865478403,
    title: 'Embossed NIK-E',
    cleanDescription: '<p><strong>Fabric:</strong><br>Micro dry-fit, 2-way stretchable (left &amp; right) for enhanced flexibility and comfort.</p>\n<p><strong>Ideal Use:</strong><br>Perfect for activewear and athletic activities in summer.</p>\n<p><strong>Design Features:</strong></p>\n<ul>\n<li>Snap reflector Embossed logo.</li>\n<li>Brand tagging.</li>\n</ul>'
  },
  {
    id: 9224595276035,
    title: 'Multi-ref-ADI Trouser winter',
    cleanDescription: '<p><strong>Fabric:</strong><br>Micro dry-fit Fleece, 2-way stretchable (left and right) for enhanced flexibility and comfort.</p>\n<p><strong>Ideal Use:</strong><br>Perfect for activewear and athletic activities in winter.</p>\n<p><strong>Design Features:</strong></p>\n<ul>\n<li>Three sleek lines for a modern, dynamic look.</li>\n<li>Athletic slim fit for a tailored, performance-ready style.</li>\n</ul>'
  },
  {
    id: 8894057382147,
    title: 'Popcorn Polo',
    cleanDescription: '<p><strong>Fabric:</strong> Premium Blend Cotton with Popcorn Texture (Approx. 220 GSM)</p>\n<p>(<em>Price is set to maintain quality standards.</em>)</p>\n<p><strong>Ideal Use:</strong> Textured design for a sleek and refined look.</p>'
  }
];

async function updateDescription(productId, cleanDescription, title) {
  const url = `https://${shopDomain}/admin/api/2024-10/products/${productId}.json`;
  try {
    console.log(`Updating description (removing table) for "${title}"...`);
    const res = await axios.put(url, {
      product: {
        id: productId,
        body_html: cleanDescription
      }
    }, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });

    if (res.status === 200) {
      console.log(`✅ Successfully cleaned description for "${title}"!`);
      return true;
    }
  } catch (err) {
    console.error(`❌ Failed to update description for "${title}":`, err.response ? err.response.data : err.message);
  }
  return false;
}

async function main() {
  console.log("🚀 Starting description cleanup for all 5 products...\n");
  for (const prod of productsConfig) {
    await updateDescription(prod.id, prod.cleanDescription, prod.title);
    // Be nice to Shopify API rate limit (2 reqs/s)
    await new Promise(resolve => setTimeout(resolve, 600));
  }
  console.log("\n🏁 Finished description cleanup!");
}

main();
