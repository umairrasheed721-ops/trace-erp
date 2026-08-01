import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '../context/AppContext';

export default function ExpenseManager() {
  const { activeStoreId, addToast } = useApp();

  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState({ total: 0, oneTimeTotal: 0, monthlyTotal: 0, byCategory: {} });
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedFrequency, setSelectedFrequency] = useState('all');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    category: 'Rent',
    amount: '',
    frequency: 'monthly',
    expense_date: new Date().toISOString().split('T')[0],
    payment_method: 'Bank',
    notes: ''
  });

  const categories = [
    { name: 'Rent', icon: '🏢', color: '#6366f1' },
    { name: 'Salaries', icon: '👥', color: '#10b981' },
    { name: 'Utilities', icon: '⚡', color: '#f59e0b' },
    { name: 'Packaging', icon: '📦', color: '#a855f7' },
    { name: 'Software', icon: '💻', color: '#06b6d4' },
    { name: 'Maintenance', icon: '🛠️', color: '#ec4899' },
    { name: 'Other', icon: '📑', color: '#64748b' }
  ];

  const fetchExpenses = useCallback(async () => {
    if (!activeStoreId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/expenses?store_id=${activeStoreId}&t=${Date.now()}`);
      if (!res.ok) throw new Error('Failed to fetch expenses');
      const data = await res.json();
      setExpenses(data.expenses || []);
      setSummary(data.summary || { total: 0, oneTimeTotal: 0, monthlyTotal: 0, byCategory: {} });
    } catch (err) {
      addToast(`❌ Error: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [activeStoreId, addToast]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const handleOpenAddModal = (presetCategory = null) => {
    setEditingExpense(null);
    setFormData({
      title: presetCategory ? `${presetCategory} Expense` : '',
      category: presetCategory || 'Rent',
      amount: '',
      frequency: presetCategory === 'Rent' || presetCategory === 'Salaries' ? 'monthly' : 'one_time',
      expense_date: new Date().toISOString().split('T')[0],
      payment_method: 'Bank',
      notes: ''
    });
    setShowModal(true);
  };

  const handleOpenEditModal = (exp) => {
    setEditingExpense(exp);
    setFormData({
      title: exp.title,
      category: exp.category,
      amount: exp.amount,
      frequency: exp.frequency || 'one_time',
      expense_date: exp.expense_date,
      payment_method: exp.payment_method || 'Cash',
      notes: exp.notes || ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title || !formData.amount || !formData.expense_date) {
      addToast('Please fill all required fields', 'error');
      return;
    }

    try {
      const url = editingExpense ? `/api/expenses/${editingExpense.id}` : '/api/expenses';
      const method = editingExpense ? 'PUT' : 'POST';
      const body = { ...formData, store_id: activeStoreId };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) throw new Error('Failed to save expense');

      addToast(editingExpense ? '✅ Expense updated!' : '✅ Expense created!', 'success');
      setShowModal(false);
      fetchExpenses();
    } catch (err) {
      addToast(`❌ Error: ${err.message}`, 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this expense entry?')) return;
    try {
      const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete expense');
      addToast('🗑️ Expense deleted', 'info');
      fetchExpenses();
    } catch (err) {
      addToast(`❌ Error: ${err.message}`, 'error');
    }
  };

  const filteredExpenses = useMemo(() => {
    return expenses.filter(exp => {
      const matchesQuery = !searchQuery || 
        exp.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (exp.notes && exp.notes.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesCat = selectedCategory === 'all' || exp.category === selectedCategory;
      const matchesFreq = selectedFrequency === 'all' || exp.frequency === selectedFrequency;

      return matchesQuery && matchesCat && matchesFreq;
    });
  }, [expenses, searchQuery, selectedCategory, selectedFrequency]);

  const getCategoryMeta = (catName) => {
    return categories.find(c => c.name === catName) || { name: catName, icon: '📑', color: '#64748b' };
  };

  return (
    <div className="page-container" style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
            💰 Manual Expense Manager
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Track rent, salaries, utilities & operational costs — auto-synced to Daily & Monthly PnL Reports
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={() => handleOpenAddModal()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, padding: '10px 18px', borderRadius: 10 }}>
            ➕ Add New Expense
          </button>
        </div>
      </div>

      {/* KPI Cards Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 24 }}>
        <div className="card" style={{ padding: '16px 20px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14 }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>💰 Total Recorded Expenses</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--brand)', marginTop: 4 }}>
            Rs {summary.total.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>{expenses.length} total entries</div>
        </div>

        <div className="card" style={{ padding: '16px 20px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14 }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>🔄 Monthly Recurring</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#10b981', marginTop: 4 }}>
            Rs {summary.monthlyTotal.toLocaleString()} <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>/mo</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>Pro-rated ~Rs {Math.round(summary.monthlyTotal / 30).toLocaleString()}/day</div>
        </div>

        <div className="card" style={{ padding: '16px 20px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14 }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>📅 One-Time Expenses</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f59e0b', marginTop: 4 }}>
            Rs {summary.oneTimeTotal.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>Applied on exact date</div>
        </div>

        <div className="card" style={{ padding: '16px 20px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14 }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>📊 Category Allocation</div>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {categories.slice(0, 4).map(c => (
              <span key={c.name} style={{ background: 'rgba(255,255,255,0.06)', padding: '3px 8px', borderRadius: 6, fontSize: '0.75rem', border: '1px solid var(--border)' }}>
                {c.icon} Rs {(summary.byCategory[c.name] || 0).toLocaleString()}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 1-Click Presets Bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>⚡ Quick Presets:</span>
        <button className="btn btn-secondary btn-sm" onClick={() => handleOpenAddModal('Rent')} style={{ borderRadius: 20, padding: '5px 14px', fontSize: '0.8rem', fontWeight: 600 }}>🏢 + Add Rent</button>
        <button className="btn btn-secondary btn-sm" onClick={() => handleOpenAddModal('Salaries')} style={{ borderRadius: 20, padding: '5px 14px', fontSize: '0.8rem', fontWeight: 600 }}>👥 + Add Salary</button>
        <button className="btn btn-secondary btn-sm" onClick={() => handleOpenAddModal('Utilities')} style={{ borderRadius: 20, padding: '5px 14px', fontSize: '0.8rem', fontWeight: 600 }}>⚡ + Add Bill</button>
        <button className="btn btn-secondary btn-sm" onClick={() => handleOpenAddModal('Packaging')} style={{ borderRadius: 20, padding: '5px 14px', fontSize: '0.8rem', fontWeight: 600 }}>📦 + Add Packaging</button>
        <button className="btn btn-secondary btn-sm" onClick={() => handleOpenAddModal('Software')} style={{ borderRadius: 20, padding: '5px 14px', fontSize: '0.8rem', fontWeight: 600 }}>💻 + Add Software</button>
      </div>

      {/* Filters Row */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <input
            type="text"
            className="form-input"
            placeholder="🔍 Search title or notes..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ width: '100%', fontSize: '0.85rem', padding: '6px 12px' }}
          />
        </div>
        <div style={{ width: 170 }}>
          <select className="form-select" value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} style={{ fontSize: '0.85rem', padding: '6px 12px' }}>
            <option value="all">📂 All Categories</option>
            {categories.map(c => (
              <option key={c.name} value={c.name}>{c.icon} {c.name}</option>
            ))}
          </select>
        </div>
        <div style={{ width: 170 }}>
          <select className="form-select" value={selectedFrequency} onChange={e => setSelectedFrequency(e.target.value)} style={{ fontSize: '0.85rem', padding: '6px 12px' }}>
            <option value="all">🔄 All Frequencies</option>
            <option value="one_time">📅 One-Time</option>
            <option value="monthly">🔄 Monthly Recurring</option>
          </select>
        </div>
      </div>

      {/* Expenses Table */}
      {loading ? (
        <div className="loading-overlay"><span className="loading-spinner"></span> Loading Expenses...</div>
      ) : filteredExpenses.length === 0 ? (
        <div className="empty-state card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>💰</div>
          <h3>No Expenses Found</h3>
          <p style={{ color: 'var(--text-muted)' }}>Add rent, salaries, utilities or custom overhead costs to get an accurate PnL report.</p>
          <button className="btn btn-primary" onClick={() => handleOpenAddModal()} style={{ marginTop: 12 }}>+ Add Expense</button>
        </div>
      ) : (
        <div className="table-wrapper card" style={{ overflowX: 'auto', borderRadius: 14 }}>
          <table>
            <thead>
              <tr>
                <th>Title / Description</th>
                <th>Category</th>
                <th>Amount (PKR)</th>
                <th>Frequency</th>
                <th>Date</th>
                <th>Payment Method</th>
                <th>Notes</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.map(exp => {
                const cat = getCategoryMeta(exp.category);
                return (
                  <tr key={exp.id}>
                    <td>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{exp.title}</div>
                    </td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          background: `${cat.color}18`,
                          color: cat.color,
                          border: `1px solid ${cat.color}40`,
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          padding: '4px 10px',
                          borderRadius: 8
                        }}
                      >
                        {cat.icon} {exp.category}
                      </span>
                    </td>
                    <td style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                      Rs {parseFloat(exp.amount).toLocaleString()}
                    </td>
                    <td>
                      {exp.frequency === 'monthly' ? (
                        <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', fontSize: '0.72rem', fontWeight: 700 }}>
                          🔄 Monthly (~Rs {Math.round(exp.amount / 30).toLocaleString()}/day)
                        </span>
                      ) : (
                        <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)', fontSize: '0.72rem', fontWeight: 700 }}>
                          📅 One-Time
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{exp.expense_date}</td>
                    <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>💳 {exp.payment_method}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: 200, wordBreak: 'break-word' }}>
                      {exp.notes || '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary btn-xs" onClick={() => handleOpenEditModal(exp)}>✏️ Edit</button>
                        <button className="btn btn-danger btn-xs" onClick={() => handleDelete(exp.id)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Expense Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(6px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div className="modal-content card" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, padding: 24, borderRadius: 16, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
                {editingExpense ? '✏️ Edit Expense Entry' : '➕ Add New Manual Expense'}
              </h3>
              <button className="btn btn-secondary btn-close" onClick={() => setShowModal(false)} style={{ borderRadius: '50%', width: 32, height: 32, padding: 0 }}>✕</button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>Expense Title *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Warehouse Rent, Office Electricity, Packaging Boxes"
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  required
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>Category</label>
                  <select
                    className="form-select"
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                    style={{ width: '100%' }}
                  >
                    {categories.map(c => (
                      <option key={c.name} value={c.name}>{c.icon} {c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>Amount (Rs) *</label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="e.g. 50000"
                    value={formData.amount}
                    onChange={e => setFormData({ ...formData, amount: e.target.value })}
                    required
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>Frequency</label>
                  <select
                    className="form-select"
                    value={formData.frequency}
                    onChange={e => setFormData({ ...formData, frequency: e.target.value })}
                    style={{ width: '100%' }}
                  >
                    <option value="one_time">📅 One-Time (Exact Date)</option>
                    <option value="monthly">🔄 Monthly Recurring (Pro-rated Daily)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>Expense Date *</label>
                  <input
                    type="date"
                    className="form-input"
                    value={formData.expense_date}
                    onChange={e => setFormData({ ...formData, expense_date: e.target.value })}
                    required
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>Payment Method</label>
                <select
                  className="form-select"
                  value={formData.payment_method}
                  onChange={e => setFormData({ ...formData, payment_method: e.target.value })}
                  style={{ width: '100%' }}
                >
                  <option value="Bank">💳 Bank Transfer</option>
                  <option value="Cash">💵 Petty Cash</option>
                  <option value="Card">💳 Credit / Debit Card</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>Notes / Description</label>
                <textarea
                  className="form-input"
                  rows="2"
                  placeholder="Additional details, invoice references..."
                  value={formData.notes}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  style={{ width: '100%' }}
                ></textarea>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ padding: '8px 20px', fontWeight: 700 }}>
                  {editingExpense ? 'Save Changes' : 'Create Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
