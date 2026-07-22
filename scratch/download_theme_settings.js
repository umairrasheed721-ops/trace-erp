const axios = require('axios');
const fs = require('fs');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';

async function downloadAsset(themeId, key) {
  const url = `https://${shopDomain}/admin/api/2024-10/themes/${themeId}/assets.json?asset[key]=${key}`;
  try {
    const res = await axios.get(url, {
      headers: {
        'X-Shopify-Access-Token': accessToken
      }
    });
    if (res.data && res.data.asset) {
      return res.data.asset.value;
    }
  } catch (err) {
    // Ignore error
  }
  return null;
}

async function main() {
  // Check ALL themes found
  const themes = [
    { id: '156784689411', name: 'dawn' },
    { id: '159293636867', name: 'Copy of dawn' },
    { id: '159433097475', name: 'Copy of Copy of dawn' },
    { id: '159705432323', name: 'under construct (main)' },
    { id: '162467184899', name: 'Copy of under construct' },
    { id: '139972870403', name: 'Impulse' },
    { id: '141259112707', name: 'New Website Layout' }
  ];
  
  for (const t of themes) {
    console.log(`\n========================================`);
    console.log(`Checking theme ${t.id} ("${t.name}")...`);
    const indexContent = await downloadAsset(t.id, 'templates/index.json');
    if (indexContent) {
      try {
        const parsed = JSON.parse(indexContent);
        console.log(`- templates/index.json loaded successfully.`);
        const str = JSON.stringify(parsed);
        
        // Let's count slides or check for specific content
        let heroSlider = parsed.sections ? parsed.sections.custom_hero_slider_home : null;
        if (heroSlider) {
          console.log(`- Hero slider home sections found! Slides order:`, heroSlider.block_order);
          if (heroSlider.blocks) {
            Object.keys(heroSlider.blocks).forEach(k => {
              console.log(`  * Slide ${k}: Title: "${heroSlider.blocks[k].settings.title}", Image: "${heroSlider.blocks[k].settings.image}"`);
            });
          }
        } else {
          console.log(`- No custom_hero_slider_home section found.`);
        }

        // Let's save a copy in scratch for inspection
        fs.writeFileSync(`./scratch/index_${t.id}.json`, indexContent);
        const settingsContent = await downloadAsset(t.id, 'config/settings_data.json');
        if (settingsContent) {
          fs.writeFileSync(`./scratch/settings_data_${t.id}.json`, settingsContent);
        }
      } catch (e) {
        console.error(`- Error parsing index.json:`, e.message);
      }
    } else {
      console.log(`- No templates/index.json asset found in this theme.`);
    }
  }
}

main();
