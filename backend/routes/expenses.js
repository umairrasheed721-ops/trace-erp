const express = require('express');
const router = express.Router();
const { db } = require('../db');

// ── GET /api/expenses ────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const { store_id, startDate, endDate } = req.query;
  if (!store_id) return res.status(400).json({ error: 'store_id required' });

  try {
    let query = `SELECT * FROM manual_expenses WHERE store_id = ?`;
    const params = [store_id];

    if (startDate && endDate) {
      query += ` AND expense_date >= ? AND expense_date <= ?`;
      params.push(startDate, endDate);
    }

    query += ` ORDER BY expense_date DESC, id DESC`;

    const expenses = db.prepare(query).all(...params);

    // Compute Summary Metrics
    let total = 0;
    let oneTimeTotal = 0;
    let monthlyTotal = 0;
    const byCategory = {
      Rent: 0,
      Salaries: 0,
      Utilities: 0,
      Packaging: 0,
      Software: 0,
      Maintenance: 0,
      Other: 0
    };

    expenses.forEach(e => {
      const amt = parseFloat(e.amount) || 0;
      total += amt;
      if (e.frequency === 'monthly') monthlyTotal += amt;
      else oneTimeTotal += amt;

      const cat = e.category || 'Other';
      byCategory[cat] = (byCategory[cat] || 0) + amt;
    });

    res.json({
      expenses,
      summary: {
        total,
        oneTimeTotal,
        monthlyTotal,
        byCategory
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/expenses ───────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { store_id, title, category, amount, frequency, expense_date, payment_method, notes } = req.body;
  if (!store_id || !title || amount === undefined || !expense_date) {
    return res.status(400).json({ error: 'store_id, title, amount, and expense_date are required' });
  }

  try {
    const info = db.prepare(`
      INSERT INTO manual_expenses (store_id, title, category, amount, frequency, expense_date, payment_method, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      store_id,
      title.trim(),
      category || 'Other',
      parseFloat(amount) || 0,
      frequency || 'one_time',
      expense_date,
      payment_method || 'Cash',
      notes || ''
    );

    const created = db.prepare('SELECT * FROM manual_expenses WHERE id = ?').get(info.lastInsertRowid);
    res.json({ success: true, expense: created });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/expenses/:id ────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { title, category, amount, frequency, expense_date, payment_method, notes } = req.body;

  try {
    db.prepare(`
      UPDATE manual_expenses
      SET title = ?, category = ?, amount = ?, frequency = ?, expense_date = ?, payment_method = ?, notes = ?
      WHERE id = ?
    `).run(
      title.trim(),
      category || 'Other',
      parseFloat(amount) || 0,
      frequency || 'one_time',
      expense_date,
      payment_method || 'Cash',
      notes || '',
      id
    );

    const updated = db.prepare('SELECT * FROM manual_expenses WHERE id = ?').get(id);
    res.json({ success: true, expense: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/expenses/:id ─────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  try {
    db.prepare('DELETE FROM manual_expenses WHERE id = ?').run(id);
    res.json({ success: true, deletedId: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
