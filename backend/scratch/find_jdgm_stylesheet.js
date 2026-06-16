const fetch = require('node-fetch'); // we'll use global fetch

async function getClasses() {
  const url = 'https://cdn.shopify.com/extensions/019eb5d5-15a2-7881-a1c0-2c193621a131/judgeme-569/assets/shopify_v2.css';
  try {
    const res = await fetch(url);
    const css = await res.text();
    console.log('CSS length:', css.length);
    
    // Find all selectors matching .jdgm-carousel or similar
    const regex = /(\.jdgm-[a-zA-Z0-9_-]+)/g;
    const matches = css.match(regex) || [];
    const uniqueClasses = new Set(matches);
    console.log('Unique Judge.me classes in the stylesheet:');
    console.log(Array.from(uniqueClasses).filter(c => c.includes('carousel') || c.includes('star') || c.includes('reviewer')));
  } catch (err) {
    console.error(err);
  }
}

getClasses();
