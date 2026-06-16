const url = 'https://tracepk.com/';

async function inspectLiveHeader() {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`Failed to fetch live page. Status: ${res.status}`);
      return;
    }
    const html = await res.text();
    
    // Find the header element
    const headerStart = html.indexOf('<header ');
    const headerEnd = html.indexOf('</header>', headerStart);
    
    if (headerStart === -1 || headerEnd === -1) {
      console.log('Header element not found in HTML.');
      return;
    }
    
    console.log('--- Live Header HTML ---');
    console.log(html.substring(headerStart, headerEnd + 9));
    console.log('------------------------');
  } catch (err) {
    console.error('Error fetching live header:', err);
  }
}

inspectLiveHeader();
