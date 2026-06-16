const url = 'https://tracepk.com/?v=' + Date.now();

async function inspectLiveHtml() {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`Failed to fetch live page. Status: ${res.status}`);
      return;
    }
    const html = await res.text();
    
    // Find custom-hero-slider content
    const sliderIndex = html.indexOf('custom-hero-slider-section');
    if (sliderIndex === -1) {
      console.log('custom-hero-slider-section not found in live HTML.');
      return;
    }
    
    // Print around the slider
    const chunk = html.substring(sliderIndex - 100, sliderIndex + 3000);
    console.log('--- Live Slider HTML Chunk ---');
    console.log(chunk);
    console.log('------------------------------');
    
    // Also look for the style tag inside custom-hero-slider
    const styleIndex = html.indexOf('<style>', sliderIndex);
    if (styleIndex !== -1 && styleIndex < sliderIndex + 10000) {
      const styleChunk = html.substring(styleIndex, styleIndex + 4000);
      console.log('--- Live Style Tag Chunk ---');
      console.log(styleChunk);
      console.log('----------------------------');
    }
  } catch (err) {
    console.error('Error fetching live HTML:', err);
  }
}

inspectLiveHtml();
