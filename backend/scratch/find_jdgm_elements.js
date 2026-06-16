const fetch = require('node-fetch'); // we'll use global fetch since it's available in node 18+

async function inspectHtml() {
  try {
    const res = await fetch('https://tracepk.com/');
    const html = await res.text();
    
    // Let's find any occurrences of the judge-me blocks or sections
    const index = html.indexOf('judge-me');
    if (index !== -1) {
      console.log('--- Judge.me block found ---');
      console.log(html.substring(index - 300, index + 1500));
    } else {
      console.log('No judge-me substring found.');
    }

    // Let's print out the structure of the section that contains the carousel
    const carouselIndex = html.indexOf('featured_carousel');
    if (carouselIndex !== -1) {
      console.log('--- Featured Carousel Block found ---');
      console.log(html.substring(carouselIndex - 500, carouselIndex + 1500));
    } else {
      console.log('No featured_carousel substring found.');
    }
  } catch (err) {
    console.error(err);
  }
}

inspectHtml();
