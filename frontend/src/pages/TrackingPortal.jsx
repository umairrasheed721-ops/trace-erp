import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

export default function TrackingPortal() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Rescue Form State
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [instructions, setInstructions] = useState('');
  const [reattemptTime, setReattemptTime] = useState('Tomorrow 2 PM - 5 PM');
  const [submittingRescue, setSubmittingRescue] = useState(false);
  const [rescueSuccess, setRescueSuccess] = useState(false);
  const [ticketId, setTicketId] = useState(null);

  const fetchTracking = async () => {
    setLoading(true);
    setError(null);
    try {
      const API_BASE = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${API_BASE}/api/customer-success/tracking/${slug}`);
      if (!res.ok) {
        throw new Error('Tracking session not found or expired.');
      }
      const json = await res.json();
      setData(json);

      // Pre-fill GPS if already submitted
      if (json.order?.customer_gps_lat) setLat(json.order.customer_gps_lat);
      if (json.order?.customer_gps_lng) setLng(json.order.customer_gps_lng);
      if (json.order?.customer_dispatch_instructions) setInstructions(json.order.customer_dispatch_instructions);
      if (json.order?.courier_ticket_id) {
        setRescueSuccess(true);
        setTicketId(json.order.courier_ticket_id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTracking();
  }, [slug]);

  const handleGetLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLat(pos.coords.latitude.toFixed(6));
          setLng(pos.coords.longitude.toFixed(6));
        },
        (err) => {
          alert('Could not get location automatically. Please enter coordinates or drop pin instructions.');
        }
      );
    } else {
      alert('Geolocation is not supported by your browser.');
    }
  };

  const handleRescueSubmit = async (e) => {
    e.preventDefault();
    setSubmittingRescue(true);
    try {
      const API_BASE = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${API_BASE}/api/customer-success/tracking/${slug}/rescue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, instructions, reattemptTime })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to submit rescue instructions.');

      setRescueSuccess(true);
      setTicketId(json.ticket_id);
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmittingRescue(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#090d16', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', animation: 'spin 1s linear infinite', marginBottom: 16 }}>⏳</div>
          <p style={{ color: '#94a3b8', fontWeight: 500 }}>Loading live shipment details...</p>
        </div>
      </div>
    );
  }

  if (error || !data?.order) {
    return (
      <div style={{ minHeight: '100vh', background: '#090d16', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: 'sans-serif' }}>
        <div style={{ maxWidth: 420, width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: 24, padding: 32, textAlign: 'center', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
          <div style={{ fontSize: '4rem', marginBottom: 16 }}>⚠️</div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fff', marginBottom: 8 }}>Shipment Not Found</h2>
          <p style={{ color: '#94a3b8', marginBottom: 24, fontSize: '0.95rem', lineHeight: 1.5 }}>{error || 'This tracking link is invalid or has expired.'}</p>
          <button 
            onClick={() => window.location.reload()} 
            style={{ width: '100%', padding: '12px 24px', background: '#4f46e5', color: '#fff', fontWeight: 600, border: 'none', borderRadius: 12, cursor: 'pointer', boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)' }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const { order, rider, milestones, history } = data;
  const isAttempted = order.delivery_status === 'Attempted';

  return (
    <div style={{ minHeight: '100vh', background: '#090d16', color: '#f1f5f9', fontFamily: 'sans-serif', paddingBottom: 64 }}>
      {/* Top Header Banner */}
      <header style={{ background: 'linear-gradient(90deg, rgba(30,27,75,0.6) 0%, rgba(15,23,42,0.8) 100%)', borderBottom: '1px solid #334155', padding: '16px 24px', position: 'sticky', top: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between', backdropFilter: 'blur(12px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(79,70,229,0.2)', border: '1px solid rgba(79,70,229,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
            📦
          </div>
          <div>
            <h1 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', margin: 0 }}>TRACE Delivery</h1>
            <p style={{ fontSize: '0.75rem', color: '#a5b4fc', margin: 0, fontWeight: 500 }}>Official Shipment Portal</p>
          </div>
        </div>
        <span style={{ padding: '4px 12px', background: 'rgba(79,70,229,0.1)', border: '1px solid rgba(79,70,229,0.2)', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600, color: '#a5b4fc' }}>
          #{order.ref_number || order.shopify_order_id}
        </span>
      </header>

      <main style={{ maxWidth: 600, margin: '24px auto 0', padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* COD Cash Amount Banner */}
        <div style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(15,23,42,0.9) 100%)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 24, padding: 24, boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 10 }}>
            <div>
              <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#34d399', margin: '0 0 4px' }}>Cash on Delivery Amount</p>
              <h2 style={{ fontSize: '2.5rem', fontWeight: 800, color: '#fff', margin: 0 }}>Rs. {order.price?.toLocaleString()}</h2>
              <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '4px 0 0' }}>Please keep exact change ready for the rider.</p>
            </div>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>
              💵
            </div>
          </div>
        </div>

        {/* 🚨 Dynamic Delivery Rescue Action Box */}
        {isAttempted && (
          <div style={{ background: 'linear-gradient(135deg, rgba(244,63,94,0.15) 0%, rgba(15,23,42,0.9) 100%)', border: '1px solid rgba(244,63,94,0.4)', borderRadius: 24, padding: 24, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>
              <div style={{ width: 48, height: 48, borderRadius: 16, background: 'rgba(244,63,94,0.2)', border: '1px solid rgba(244,63,94,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem', flexShrink: 0 }}>
                🚨
              </div>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>Delivery Attempt Failed</h3>
                <p style={{ fontSize: '0.85rem', color: '#fda4af', margin: 0, lineHeight: 1.4 }}>
                  {order.cs_notes || 'Our rider had trouble locating your address or contacting you today. Let’s fix this to ensure delivery tomorrow!'}
                </p>
              </div>
            </div>

            {/* Rescue Form */}
            {!rescueSuccess ? (
              <form onSubmit={handleRescueSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16, background: 'rgba(9,13,22,0.6)', border: '1px solid #334155', borderRadius: 16, padding: 20 }}>
                <h4 style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#cbd5e1', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>📍</span>
                  <span>Self-Service Delivery Rescue Form</span>
                </h4>

                {/* GPS Coordinates */}
                <div>
                  <label style={{ block: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', margin: '0 0 6px', display: 'block' }}>Exact GPS Location (Optional but recommended)</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input 
                      type="text" 
                      placeholder="Latitude (e.g. 33.6844)" 
                      value={lat} 
                      onChange={(e) => setLat(e.target.value)}
                      style={{ width: '50%', background: '#0f172a', border: '1px solid #334155', borderRadius: 12, padding: '10px 12px', fontSize: '0.85rem', color: '#fff', outline: 'none' }}
                    />
                    <input 
                      type="text" 
                      placeholder="Longitude (e.g. 73.0479)" 
                      value={lng} 
                      onChange={(e) => setLng(e.target.value)}
                      style={{ width: '50%', background: '#0f172a', border: '1px solid #334155', borderRadius: 12, padding: '10px 12px', fontSize: '0.85rem', color: '#fff', outline: 'none' }}
                    />
                    <button 
                      type="button" 
                      onClick={handleGetLocation} 
                      style={{ padding: '0 16px', background: 'rgba(79,70,229,0.2)', border: '1px solid rgba(79,70,229,0.3)', color: '#818cf8', borderRadius: 12, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                      title="Get Current GPS Location"
                    >
                      <span>📌 Pin</span>
                    </button>
                  </div>
                </div>

                {/* Landmark Instructions */}
                <div>
                  <label style={{ block: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', margin: '0 0 6px', display: 'block' }}>Nearest Landmark & Rider Instructions</label>
                  <textarea 
                    rows="2" 
                    placeholder="e.g. Opposite Al-Fatah Mall, grey gate, ring the black doorbell." 
                    value={instructions} 
                    onChange={(e) => setInstructions(e.target.value)}
                    required
                    style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: 12, padding: '10px 12px', fontSize: '0.85rem', color: '#fff', outline: 'none', resize: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                {/* Preferred Reattempt Time */}
                <div>
                  <label style={{ block: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', margin: '0 0 6px', display: 'block' }}>Preferred Re-Attempt Window</label>
                  <select 
                    value={reattemptTime} 
                    onChange={(e) => setReattemptTime(e.target.value)}
                    style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: 12, padding: '10px 12px', fontSize: '0.85rem', color: '#fff', outline: 'none', boxSizing: 'border-box' }}
                  >
                    <option value="Tomorrow 9 AM - 1 PM">Tomorrow Morning (9 AM - 1 PM)</option>
                    <option value="Tomorrow 2 PM - 5 PM">Tomorrow Afternoon (2 PM - 5 PM)</option>
                    <option value="Next Business Day">Next Business Day</option>
                  </select>
                </div>

                <button 
                  type="submit" 
                  disabled={submittingRescue}
                  style={{ width: '100%', padding: '14px 24px', background: 'linear-gradient(90deg, #e11d48 0%, #4f46e5 100%)', color: '#fff', fontWeight: 700, border: 'none', borderRadius: 12, cursor: 'pointer', boxShadow: '0 4px 12px rgba(225, 29, 72, 0.3)', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', gap: 8, fontSize: '0.95rem' }}
                >
                  {submittingRescue ? '⏳ Sending to Courier API...' : '🚀 Submit Rescue Instructions'}
                </button>
              </form>
            ) : (
              <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 16, padding: 24, textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: 12 }}></div>
                <h4 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>Rescue Instructions Received!</h4>
                <p style={{ fontSize: '0.85rem', color: '#a7f3d0', margin: '0 0 16px', lineHeight: 1.5 }}>
                  We have successfully updated the courier API. The rider has received your exact GPS pin and landmark instructions for the re-attempt.
                </p>
                {ticketId && (
                  <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', background: '#0f172a', padding: '6px 12px', borderRadius: 12, border: '1px solid #334155', display: 'inline-block', margin: 0 }}>
                    Courier Support Ticket: <span style={{ color: '#818cf8' }}>{ticketId}</span>
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Live Milestone Progress */}
        <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 24, padding: 24, boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #334155', paddingBottom: 16, marginBottom: 24 }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🚚</span>
              <span>Live Shipment Milestones</span>
            </h3>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#818cf8', background: 'rgba(79,70,229,0.1)', border: '1px solid rgba(79,70,229,0.2)', padding: '4px 12px', borderRadius: 20 }}>
              {order.courier || 'Standard Courier'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, position: 'relative', paddingLeft: 16 }}>
            {milestones.map((m, idx) => {
              return (
                <div key={m.status} style={{ display: 'flex', alignItems: 'flex-start', gap: 16, position: 'relative' }}>
                  {/* Milestone Icon / Dot */}
                  <div style={{ 
                    width: 32, 
                    height: 32, 
                    borderRadius: '50%', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    fontSize: '1rem',
                    flexShrink: 0,
                    background: m.done ? (m.isError ? '#4c0519' : '#1e1b4b') : '#0f172a',
                    border: `2px solid ${m.done ? (m.isError ? '#f43f5e' : '#6366f1') : '#334155'}`,
                    boxShadow: m.done ? `0 4px 12px ${m.isError ? 'rgba(244,63,94,0.3)' : 'rgba(99,102,241,0.3)'}` : 'none'
                  }}>
                    {m.done ? (m.isError ? '⚠️' : '✓') : <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#334155' }} />}
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <h4 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0, color: m.done ? (m.isError ? '#f43f5e' : '#fff') : '#64748b' }}>
                        {m.label}
                      </h4>
                      <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#64748b' }}>{m.date}</span>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0, lineHeight: 1.4 }}>
                      {m.status === 'Booked' && `Tracking #: ${order.tracking_number || 'Pending'}`}
                      {m.status === 'In Transit' && 'Package is moving through courier logistics network.'}
                      {m.status === 'Out for Delivery' && 'Rider is out for delivery. Please keep phone available.'}
                      {m.status === 'Attempted' && 'Rider could not complete delivery.'}
                      {m.status === 'Delivered' && 'Shipment completed successfully.'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Detailed Shipment Journey Logs */}
        {(() => {
          let displayLogs = [];
          if (history && history.length > 0) {
            displayLogs = [...history].reverse();
          } else if (milestones && milestones.length > 0) {
            displayLogs = milestones
              .filter(m => m.done && m.date && m.date !== 'Pending')
              .map(m => ({
                dateTime: m.date,
                transactionStatus: m.label
              }))
              .reverse();
          }

          if (displayLogs.length === 0) return null;

          return (
            <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 24, padding: 24, boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #334155', paddingBottom: 16, marginBottom: 20 }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>📋</span>
                  <span>Detailed Shipment Journey Logs</span>
                </h3>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'relative', paddingLeft: 16, borderLeft: '2px solid rgba(99,102,241,0.2)', marginLeft: 8 }}>
                {displayLogs.map((item, idx) => {
                  const dateStr = item.dateTime || item.date || item.timestamp || 'Updated';
                  const statusText = item.transactionStatus || item.status || item.activity || 'Status Update';
                  
                  return (
                    <div key={idx} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {/* Timeline bullet */}
                      <div style={{
                        position: 'absolute',
                        left: -23,
                        top: 4,
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        background: idx === 0 ? '#10b981' : '#334155',
                        border: `2px solid ${idx === 0 ? '#34d399' : '#0f172a'}`,
                        boxShadow: idx === 0 ? '0 0 8px #34d399' : 'none'
                      }} />
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: idx === 0 ? '#34d399' : '#e2e8f0' }}>
                          {statusText}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: '#64748b', whiteSpace: 'nowrap', marginTop: 2 }}>
                          {dateStr}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Order Details & Items Summary */}
        <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 24, padding: 24, boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #334155', paddingBottom: 16 }}>
            <span>🛍️</span>
            <span>Shipment Contents</span>
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
              <span style={{ color: '#94a3b8', fontWeight: 500 }}>Customer Name</span>
              <span style={{ color: '#fff', fontWeight: 600 }}>{order.customer_name || 'Valued Customer'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
              <span style={{ color: '#94a3b8', fontWeight: 500 }}>Delivery Address</span>
              <span style={{ color: '#fff', fontWeight: 600, textAlign: 'right', maxWidth: 240 }}>{order.address}, {order.city}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
              <span style={{ color: '#94a3b8', fontWeight: 500 }}>Items</span>
              <span style={{ color: '#fff', fontWeight: 600, textAlign: 'right', maxWidth: 240 }}>{order.product_titles || 'Premium Package'}</span>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
