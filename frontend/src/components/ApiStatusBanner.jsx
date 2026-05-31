import React, { useState, useEffect } from 'react';

export default function ApiStatusBanner() {
  const [status, setStatus] = useState('online'); // 'online', 'connecting', 'offline'
  const [latency, setLatency] = useState(null);

  const checkStatus = async () => {
    const start = Date.now();
    try {
      const res = await fetch('/api/health', { method: 'GET', cache: 'no-store' });
      if (res.ok) {
        setLatency(Date.now() - start);
        setStatus('online');
      } else {
        setStatus('offline');
      }
    } catch (err) {
      setStatus('offline');
    }
  };

  useEffect(() => {
    const interval = setInterval(checkStatus, 30000); // Check every 30 seconds
    checkStatus();
    return () => clearInterval(interval);
  }, []);

  if (status === 'online' && (latency < 3000 || latency === null)) return null;

  return (
    <div className={`api-status-banner ${status}`} style={{
      padding: '8px 16px',
      fontSize: '0.75rem',
      fontWeight: 600,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '10px',
      background: status === 'offline' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
      color: status === 'offline' ? 'var(--red)' : 'var(--yellow)',
      borderBottom: `1px solid ${status === 'offline' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)'}`,
      animation: 'slideDown 0.3s ease-out'
    }}>
      <span>{status === 'offline' ? '🛑 Server Unreachable' : '⚠️ Slow Connection Detected'}</span>
      <span style={{ opacity: 0.7 }}>{status === 'offline' ? 'Retrying auto-sync...' : `Latency: ${latency}ms`}</span>
      <button 
        onClick={checkStatus}
        style={{ 
          background: 'none', 
          border: '1px solid currentColor', 
          color: 'inherit', 
          fontSize: '0.65rem', 
          padding: '2px 8px', 
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        Retry Now
      </button>
    </div>
  );
}
