const apiKey = 'AIzaSyCAXI_u6BPhqdmpjjnDtIS8GHHsHiM8Wqs';
const model = 'gemini-2.5-flash';
const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

const payload = {
  contents: [{
    role: 'user',
    parts: [{ text: 'Hello, are you online?' }]
  }]
};

console.log('Sending request to Gemini API...');
fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
})
.then(res => res.json().then(data => ({ ok: res.ok, status: res.status, data })))
.then(({ ok, status, data }) => {
  console.log('Response Status:', status);
  console.log('Response OK:', ok);
  console.log('Response Data:', JSON.stringify(data, null, 2));
})
.catch(err => {
  console.error('Fetch error:', err.message);
});
