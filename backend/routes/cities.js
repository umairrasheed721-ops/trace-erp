const express = require('express');
const router = express.Router();
const { db } = require('../db');

// GET /api/cities/mappings
router.get('/mappings', (req, res) => {
  try {
    const mappings = db.prepare('SELECT * FROM city_mappings ORDER BY usage_count DESC').all();
    res.json(mappings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cities/mappings
router.post('/mappings', (req, res) => {
  const { original_input, corrected_name } = req.body;
  
  if (!original_input || !corrected_name) {
    return res.status(400).json({ error: 'original_input and corrected_name required' });
  }

  try {
    // Normalize input to lowercase for mapping storage (or keep as is, but lowercase is safer)
    const normalizedInput = original_input.trim().toLowerCase();
    
    // Insert or update mapping
    db.prepare(`
      INSERT INTO city_mappings (original_input, corrected_name, usage_count)
      VALUES (?, ?, 1)
      ON CONFLICT(original_input) DO UPDATE SET 
        corrected_name = excluded.corrected_name,
        usage_count = usage_count + 1
    `).run(normalizedInput, corrected_name.trim());

    res.json({ success: true, message: 'Mapping saved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper for other backend logic to use directly
const getCorrectedCity = (city) => {
  if (!city) return null;
  const normalized = city.trim().toLowerCase();
  const mapping = db.prepare('SELECT corrected_name FROM city_mappings WHERE original_input = ?').get(normalized);
  return mapping ? mapping.corrected_name : city;
};

// Increment usage count if auto-corrected
const incrementCityUsage = (city) => {
  if (!city) return;
  const normalized = city.trim().toLowerCase();
  db.prepare('UPDATE city_mappings SET usage_count = usage_count + 1 WHERE original_input = ?').run(normalized);
};

module.exports = router;
module.exports.getCorrectedCity = getCorrectedCity;
module.exports.incrementCityUsage = incrementCityUsage;
