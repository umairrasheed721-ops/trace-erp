import React, { useEffect, useMemo, useState } from 'react';

export default function PickListModal({ show, onClose, orderIds = [], addToast }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [search, setSearch] = useState('');
  const [pickedKeys, setPickedKeys] = useState({});

  useEffect(() => {
    if (!show || !orderIds || orderIds.length === 0) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setPickedKeys({});
    setSearch('');

    const apiUrl = import.meta.env.VITE_API_URL || '';
    const token = localStorage.getItem('trace_token') || localStorage.getItem('token') || '';
    fetch(`${apiUrl}/api/orders/pick-list`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ ids: orderIds }),
    })
      .then(async (r) => {
        const json = await r.json().catch(() => ({}));
        if (!r.ok || !json.success) throw new Error(json.error || 'Failed to build pick-list');
        return json;
      })
      .then((json) => { if (!cancelled) setData(json); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [show, orderIds]);

  const items = data?.items || [];
  const summary = data?.summary || {};

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(it =>
      String(it.title || '').toLowerCase().includes(q) ||
      String(it.variant_title || '').toLowerCase().includes(q) ||
      String(it.sku || '').toLowerCase().includes(q) ||
      (it.order_refs || []).some(r => String(r.ref || '').toLowerCase().includes(q))
    );
  }, [items, search]);

  const pickedCount = useMemo(() => items.filter(it => pickedKeys[it.key]).length, [items, pickedKeys]);
  const shortfallCount = useMemo(() => items.filter(it => it.stock_shortfall > 0).length, [items]);

  const handleCopySummary = async () => {
    if (items.length === 0) return;
    const header = `📦 WAREHOUSE PICK-LIST — ${summary.storeName || 'Store'}\nOrders: ${summary.totalOrders} | Total Units: ${summary.totalUnits} | Unique SKUs: ${summary.uniqueSkus}\n`;
    const lines = items.map((it, i) => {
      const v = it.variant_title && it.variant_title !== 'Default' ? ` (${it.variant_title})` : '';
      const skuTag = it.sku ? ` [${it.sku}]` : '';
      return `${i + 1}. ${it.title}${v}${skuTag} — ×${it.total_qty}`;
    });
    const text = `${header}\n${lines.join('\n')}`;
    try {
      await navigator.clipboard.writeText(text);
      if (addToast) addToast('📋 Pick-list copied for WhatsApp / Warehouse!', 'success', 2200);
    } catch (_) {
      if (addToast) addToast('Copy failed — please print instead', 'warning');
    }
  };

  const handlePrint = () => {
    if (items.length === 0) return;
    const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const nowStr = new Date().toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' });
    const rowsHtml = items.map((it, idx) => {
      const refs = (it.order_refs || []).map(r => r.qty > 1 ? `${esc(r.ref)}(×${r.qty})` : esc(r.ref)).join(', ');
      return `
        <tr>
          <td style="text-align:center;width:30px;">☐</td>
          <td style="text-align:center;width:28px;color:#666;">${idx + 1}</td>
          <td>
            <div style="font-weight:700;font-size:13px;">${esc(it.title)}</div>
            <div style="font-size:11px;color:#444;">
              ${it.variant_title && it.variant_title !== 'Default' ? `Variant: <strong>${esc(it.variant_title)}</strong> · ` : ''}
              ${it.sku ? `SKU: <span style="font-family:monospace;">${esc(it.sku)}</span>` : 'No SKU'}
            </div>
          </td>
          <td style="text-align:center;font-size:16px;font-weight:900;width:64px;">×${it.total_qty}</td>
          <td style="font-size:10.5px;color:#333;max-width:220px;word-break:break-word;">${refs}</td>
        </tr>
      `;
    }).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Warehouse Pick-List (${summary.totalOrders} Orders)</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 18px; color: #111; }
    .hdr { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #111; padding-bottom:10px; margin-bottom:14px; }
    .title { font-size:20px; font-weight:900; margin:0; }
    .meta { font-size:12px; color:#444; margin-top:4px; }
    .stats { display:flex; gap:14px; font-size:13px; font-weight:800; }
    table { width:100%; border-collapse:collapse; }
    th, td { border:1px solid #cbd5e1; padding:7px 8px; vertical-align:middle; }
    th { background:#f1f5f9; font-size:11px; text-transform:uppercase; letter-spacing:0.04em; text-align:left; }
    .sign { display:flex; justify-content:space-between; margin-top:28px; font-size:12px; }
    .sign div { width:42%; border-top:1px solid #333; padding-top:6px; text-align:center; }
    @media print { body { padding: 4mm; } }
  </style>
</head>
<body>
  <div class="hdr">
    <div>
      <h1 class="title">📦 SKU-Wise Warehouse Pick-List</h1>
      <div class="meta">${esc(summary.storeName || 'TRACE Store')} · Printed: ${esc(nowStr)}</div>
    </div>
    <div class="stats">
      <span>Orders: ${summary.totalOrders}</span>
      <span>Total Units: ${summary.totalUnits}</span>
      <span>SKUs: ${summary.uniqueSkus}</span>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="text-align:center;">✓</th>
        <th style="text-align:center;">#</th>
        <th>Product / Variant / SKU</th>
        <th style="text-align:center;">Pick Qty</th>
        <th>Order References</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="sign">
    <div>Picked By (Warehouse)</div>
    <div>Verified &amp; Packed By</div>
  </div>
  <script>window.onload = function(){ window.print(); };</script>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=920,height=740');
    if (win) {
      win.document.open();
      win.document.write(html);
      win.document.close();
    } else if (addToast) {
      addToast('Popup blocked — please allow popups to print Pick-List', 'warning');
    }
  };

  if (!show) return null;

  return (
    <div
      className="modal-overlay"
      style={{ zIndex: 10080, padding: 14 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="modal-content glass-panel"
        style={{
          width: '860px',
          maxWidth: '96vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          borderRadius: 16,
        }}
      >
        {/* Header */}
        <div style={{
          padding: '15px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-elevated)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: '1.02rem', color: 'var(--text-primary)' }}>
              📋 SKU-Wise Warehouse Pick-List
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
              Packing se pehlay consolidated SKU quantity pick karein taake wrong-item returns zero hon.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)',
              width: 32, height: 32, borderRadius: 8, cursor: 'pointer', fontWeight: 700,
            }}
          >✕</button>
        </div>

        {/* Summary KPI Bar */}
        <div style={{
          padding: '10px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-surface)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, padding: '3px 9px', borderRadius: 99, background: 'rgba(99,102,241,0.12)', color: '#6366f1' }}>
              📦 {summary.totalOrders || orderIds.length} Orders
            </span>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, padding: '3px 9px', borderRadius: 99, background: 'rgba(16,185,129,0.12)', color: '#059669' }}>
              🧮 {summary.totalUnits || 0} Total Units
            </span>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, padding: '3px 9px', borderRadius: 99, background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
              🏷️ {summary.uniqueSkus || 0} Unique SKUs
            </span>
            {pickedCount > 0 && (
              <span style={{ fontSize: '0.74rem', fontWeight: 800, padding: '3px 9px', borderRadius: 99, background: 'rgba(16,185,129,0.18)', color: '#047857' }}>
                ✓ {pickedCount}/{items.length} Picked
              </span>
            )}
            {shortfallCount > 0 && (
              <span style={{ fontSize: '0.74rem', fontWeight: 800, padding: '3px 9px', borderRadius: 99, background: 'rgba(239,68,68,0.14)', color: '#dc2626' }}>
                ⚠️ {shortfallCount} Low Stock SKU{shortfallCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
          {items.length > 6 && (
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter SKU, title, #ref..."
              className="form-input"
              style={{ width: 210, fontSize: '0.76rem', padding: '4px 9px' }}
            />
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', background: 'var(--bg-primary)' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}>
              ⏳ Building consolidated SKU pick-list...
            </div>
          ) : error ? (
            <div style={{ padding: 20, borderRadius: 10, background: 'rgba(239,68,68,0.1)', color: '#dc2626', fontWeight: 700 }}>
              ❌ {error}
            </div>
          ) : filteredItems.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
              No line items found for the selected orders.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {filteredItems.map((it) => {
                const isPicked = Boolean(pickedKeys[it.key]);
                return (
                  <div
                    key={it.key}
                    onClick={() => setPickedKeys(prev => ({ ...prev, [it.key]: !prev[it.key] }))}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 12px',
                      borderRadius: 11,
                      cursor: 'pointer',
                      border: `1px solid ${it.stock_shortfall > 0 ? 'rgba(239,68,68,0.4)' : isPicked ? 'rgba(16,185,129,0.45)' : 'var(--border)'}`,
                      background: isPicked ? 'rgba(16,185,129,0.06)' : 'var(--bg-surface)',
                      opacity: isPicked ? 0.72 : 1,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isPicked}
                      onChange={() => {}}
                      style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
                    />
                    {it.image_url ? (
                      <img
                        src={it.image_url}
                        alt=""
                        style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--border)', flexShrink: 0 }}
                      />
                    ) : (
                      <div style={{
                        width: 40, height: 40, borderRadius: 8, background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1.1rem', flexShrink: 0,
                      }}>📦</div>
                    )}

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontWeight: 800, fontSize: '0.86rem', color: 'var(--text-primary)',
                        textDecoration: isPicked ? 'line-through' : 'none',
                      }}>
                        {it.title}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 2, fontSize: '0.73rem', color: 'var(--text-secondary)' }}>
                        {it.variant_title && it.variant_title !== 'Default' && (
                          <span style={{ padding: '1px 6px', borderRadius: 5, background: 'var(--bg-elevated)', fontWeight: 700 }}>
                            {it.variant_title}
                          </span>
                        )}
                        {it.sku && (
                          <span style={{ fontFamily: 'monospace', color: '#6366f1', fontWeight: 700 }}>
                            SKU: {it.sku}
                          </span>
                        )}
                        {it.available_qty !== null && (
                          <span style={{
                            fontWeight: 700,
                            color: it.stock_shortfall > 0 ? '#dc2626' : '#059669',
                          }}>
                            {it.stock_shortfall > 0
                              ? `⚠️ Avail ${it.available_qty} (Short ${it.stock_shortfall})`
                              : `✓ Stock: ${it.available_qty}`}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.69rem', color: 'var(--text-muted)', marginTop: 3 }}>
                        Orders ({it.order_count}): {(it.order_refs || []).slice(0, 12).map(r => r.qty > 1 ? `${r.ref}(×${r.qty})` : r.ref).join(', ')}
                        {(it.order_refs || []).length > 12 ? ` +${it.order_refs.length - 12} more` : ''}
                      </div>
                    </div>

                    <div style={{
                      minWidth: 58,
                      textAlign: 'center',
                      padding: '6px 10px',
                      borderRadius: 10,
                      background: 'linear-gradient(135deg, rgba(99,102,241,0.16), rgba(168,85,247,0.16))',
                      border: '1px solid rgba(99,102,241,0.35)',
                      color: '#6366f1',
                      fontWeight: 900,
                      fontSize: '1.05rem',
                      flexShrink: 0,
                    }}>
                      ×{it.total_qty}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-elevated)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
        }}>
          <button
            type="button"
            onClick={handleCopySummary}
            disabled={items.length === 0}
            className="btn btn-secondary"
            style={{ padding: '8px 14px', borderRadius: 9, fontSize: '0.8rem', fontWeight: 700 }}
          >
            📋 Copy for WhatsApp
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              style={{ padding: '8px 16px', borderRadius: 9, fontSize: '0.8rem', fontWeight: 700 }}
            >
              Close
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={items.length === 0}
              className="btn btn-primary"
              style={{ padding: '8px 18px', borderRadius: 9, fontSize: '0.82rem', fontWeight: 800 }}
            >
              🖨️ Print Pick-List
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
