const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/postex', async (req, res) => {
  try {
    const store = db.prepare('SELECT * FROM stores LIMIT 1').get();
    const token = store.postex_token;
    const url = 'https://api.postex.pk/services/integration/api/order/v1/track-order/20120050021771';
    
    const fetchRes = await fetch(url, {
      method: 'GET',
      headers: { 'token': token, 'Content-Type': 'application/json' }
    });
    
    const text = await fetchRes.text();
    res.send({ status: fetchRes.status, ok: fetchRes.ok, text });
  } catch(e) {
    res.send({ error: e.message });
  }
});
module.exports = router;
