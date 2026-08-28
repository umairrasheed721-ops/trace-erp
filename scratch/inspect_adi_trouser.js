const fetch = typeof globalThis.fetch === 'function' ? globalThis.fetch : require('node-fetch');

const TRACE_DOMAIN = '041839-3.myshopify.com';
const TRACE_TOKEN = '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';

async function inspectProduct() {
  console.log(`📡 Fetching products matching "Activewear ADI-Trouser" from ${TRACE_DOMAIN}...`);
  const res = await fetch(`https://${TRACE_DOMAIN}/admin/api/2024-10/products.json?title=Activewear ADI-Trouser`, {
    headers: { 'X-Shopify-Access-Token': TRACE_TOKEN }
  });
  const data = await res.json();
  const products = data.products || [];

  console.log(`Found ${products.length} products:`);
  for (const p of products) {
    console.log(`\n========================================`);
    console.log(`ID: ${p.id} | Handle: ${p.handle}`);
    console.log(`Title: ${p.title}`);
    console.log(`Options (${p.options.length}):`, JSON.stringify(p.options, null, 2));
    console.log(`Variants Count: ${p.variants.length}`);

    p.variants.forEach((v, idx) => {
      console.log(`  Variant [${idx+1}]: id=${v.id}, title="${v.title}", option1="${v.option1}", option2="${v.option2}", option3="${v.option3}", img=${v.image_id}`);
    });

    // Check Metafields
    const mfRes = await fetch(`https://${TRACE_DOMAIN}/admin/api/2024-10/products/${p.id}/metafields.json`, {
      headers: { 'X-Shopify-Access-Token': TRACE_TOKEN }
    });
    const mfData = await mfRes.json();
    console.log(`Metafields (${mfData.metafields.length}):`);
    mfData.metafields.forEach(m => {
      if (m.namespace === 'custom') {
        console.log(`  - custom.${m.key} = ${m.value} (type: ${m.type})`);
      }
    });
  }
}

inspectProduct().catch(console.error);
