import React, { useEffect, useState } from 'react';

const BANK_ACCOUNTS = ['JazzCash', 'Easypaisa', 'Meezan Bank', 'HBL', 'SadaPay / NayaPay', 'Bank Transfer'];

export default function AdvanceVerifyModal({ order, onClose, onVerified, addToast }) {
  const [bankAccount, setBankAccount] = useState('JazzCash');
  const [bankRef, setBankRef] = useState('');
  const [advanceDate, setAdvanceDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [markFullPaid, setMarkFullPaid] = useState(true);
  const [saving, setSaving] = useState(false);

  const fullPrice = Math.round((parseFloat(order?.price) || 0) * 100) / 100;
  const courierPaid = Math.round((parseFloat(order?.paid_amount) || 0) * 100) / 100;
  const bookedCod = (order?.booked_cod_amount !== null && order?.booked_cod_amount !== undefined)
    ? Math.round(Number(order.booked_cod_amount) * 100) / 100
    : null;
  const expectedAdv = bookedCod !== null
    ? Math.max(0, Math.round((fullPrice - bookedCod) * 100) / 100)
    : Math.max(0, Math.round((fullPrice - courierPaid) * 100) / 100);

  useEffect(() => {
    if (!order) return;
    setAdvanceAmount(String(expectedAdv));
    setBankRef(order.advance_bank_ref || '');
    setNotes('');
    setMarkFullPaid(true);
    setAdvanceDate(new Date().toISOString().split('T')[0]);
  }, [order?.id]);

  if (!order) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const token = localStorage.getItem('trace_token') || localStorage.getItem('token') || '';
      const res = await fetch(`${apiUrl}/api/orders/${order.id}/verify-advance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          bank_account: bankAccount,
          bank_ref: bankRef.trim(),
          advance_date: advanceDate,
          advance_amount: Number(advanceAmount) || expectedAdv,
          notes: notes.trim(),
          mark_full_paid: markFullPaid,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to verify advance payment');
      }
      if (addToast) {
        addToast(`✅ Advance Rs ${Number(data.verified_advance || expectedAdv).toLocaleString()} verified & ${order.ref_number || `#${order.id}`} marked Paid (Rs ${Math.round(data.paid_amount).toLocaleString()})`, 'success', 3200);
      }
      if (onVerified) onVerified(data.order);
      onClose();
    } catch (err) {
      if (addToast) addToast(`❌ ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      style={{ zIndex: 10090, padding: 14 }}
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <div
        className="modal-content glass-panel"
        style={{
          width: 520,
          maxWidth: '95vw',
          padding: 0,
          borderRadius: 16,
          overflow: 'hidden',
        }}
      >
        <div style={{
          padding: '15px 18px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-elevated)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: '0.98rem', color: 'var(--text-primary)' }}>
              🏦 Verify Bank Advance — {order.ref_number || `#${order.id}`}
            </div>
            <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', marginTop: 2 }}>
              {order.customer_name || 'Customer'} · {order.phone || '—'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)', width: 30, height: 30, borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}
          >✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 13 }}>
          {/* Financial Breakdown Strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            <div style={{ padding: '8px 10px', borderRadius: 9, background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)', fontWeight: 700 }}>ORDER FULL PRICE</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 900, color: 'var(--text-primary)' }}>Rs {fullPrice.toLocaleString()}</div>
            </div>
            <div style={{ padding: '8px 10px', borderRadius: 9, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)' }}>
              <div style={{ fontSize: '0.67rem', color: '#b45309', fontWeight: 800 }}>EXPECTED BANK ADVANCE</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 900, color: '#b45309' }}>Rs {expectedAdv.toLocaleString()}</div>
            </div>
            <div style={{ padding: '8px 10px', borderRadius: 9, background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)', fontWeight: 700 }}>BOOKED COD</div>
              <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#6366f1' }}>
                {bookedCod !== null ? `Rs ${bookedCod.toLocaleString()}` : '—'}
              </div>
            </div>
            <div style={{ padding: '8px 10px', borderRadius: 9, background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)', fontWeight: 700 }}>CURRENT PAID IN ERP</div>
              <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#059669' }}>Rs {courierPaid.toLocaleString()}</div>
            </div>
          </div>

          {/* Bank / Wallet Quick Chips */}
          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              💳 RECEIVED IN ACCOUNT / WALLET
            </label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {BANK_ACCOUNTS.map((acct) => {
                const active = bankAccount === acct;
                return (
                  <button
                    key={acct}
                    type="button"
                    onClick={() => setBankAccount(acct)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 99,
                      fontSize: '0.73rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: `1px solid ${active ? '#10b981' : 'var(--border-bright)'}`,
                      background: active ? 'rgba(16,185,129,0.16)' : 'var(--bg-elevated)',
                      color: active ? '#059669' : 'var(--text-primary)',
                    }}
                  >
                    {active ? '✓ ' : ''}{acct}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                💵 ADVANCE AMOUNT (RS)
              </label>
              <input
                type="number"
                min="0"
                step="1"
                required
                value={advanceAmount}
                onChange={(e) => setAdvanceAmount(e.target.value)}
                className="form-input"
                style={{ width: '100%', fontSize: '0.84rem', fontWeight: 800 }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                📅 BANK RECEIPT DATE
              </label>
              <input
                type="date"
                value={advanceDate}
                onChange={(e) => setAdvanceDate(e.target.value)}
                className="form-input"
                style={{ width: '100%', fontSize: '0.82rem' }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
              🧾 BANK / TID REFERENCE OR SCREENSHOT NOTE
            </label>
            <input
              type="text"
              value={bankRef}
              onChange={(e) => setBankRef(e.target.value)}
              placeholder="e.g. TID-9845123 / Verified in Meezan statement"
              maxLength={120}
              className="form-input"
              style={{ width: '100%', fontSize: '0.82rem' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
              📝 OPTIONAL AUDIT NOTE
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Customer sent JazzCash screenshot on WhatsApp"
              maxLength={180}
              className="form-input"
              style={{ width: '100%', fontSize: '0.82rem' }}
            />
          </div>

          <label style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 9,
            background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.28)',
            fontSize: '0.78rem', fontWeight: 700, color: '#047857', cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={markFullPaid}
              onChange={(e) => setMarkFullPaid(e.target.checked)}
              style={{ width: 15, height: 15 }}
            />
            <span>Mark Order Full Paid (Rs {fullPrice.toLocaleString()}) &amp; clear PNL Unpaid Diff</span>
          </label>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <button type="button" onClick={onClose} disabled={saving} className="btn btn-secondary" style={{ padding: '8px 14px', borderRadius: 9, fontSize: '0.8rem', fontWeight: 700 }}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn btn-primary" style={{ padding: '8px 18px', borderRadius: 9, fontSize: '0.82rem', fontWeight: 800, background: '#059669' }}>
              {saving ? '⏳ Verifying...' : '✅ Verify Advance & Mark Full Paid'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
