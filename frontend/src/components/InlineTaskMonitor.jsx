import React from 'react'
import { useFinanceStore } from '../store/useFinanceStore'
import { useApp } from '../context/AppContext'

export default function InlineTaskMonitor() {
  const { activeStoreId, addToast } = useApp()
  const {
    isProcessing,
    results,
    summary,
    currentTaskId,
    sessionId,
    interruptedSession,
    resumeSession,
    discardInterruptedSession
  } = useFinanceStore()

  const total = results.length
  const processed = summary ? (summary.processedCount + summary.ghostCount + summary.auditCount) : 0
  const percent = total > 0 ? Math.min(Math.round((processed / total) * 100), 100) : 0

  const handleDownloadReport = () => {
    const headers = ['Order ID', 'Tracking Number', 'Type', 'COD Amount', 'Courier Name', 'Balance', 'Status', 'Recommendation', 'Net Payout'];
    const rows = results.map(r => [
      r.orderId || '',
      r.trackingNumber || '',
      r.type || '',
      r.codAmount || 0,
      r.courierName || '',
      r.balance || 0,
      r.status || '',
      r.recommendation || '',
      r.netPayout || 0
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Reconciliation_Report_Session_${sessionId || Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (interruptedSession) {
    return (
      <div style={{
        padding: '16px 20px',
        background: 'rgba(245, 158, 11, 0.1)',
        border: '1px solid rgba(245, 158, 11, 0.3)',
        borderRadius: 12,
        marginBottom: 20,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 0 15px rgba(245, 158, 11, 0.15)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '1.5rem' }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 700, color: '#f59e0b', fontSize: '0.95rem' }}>Interrupted Session Detected!</div>
            <div style={{ fontSize: '0.8rem', opacity: 0.8, marginTop: 2 }}>
              Session ID: <b>#{interruptedSession.id}</b> from {new Date(interruptedSession.created_at).toLocaleString()} • {interruptedSession.processed_records.length} of {interruptedSession.row_count} orders processed.
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button 
            onClick={discardInterruptedSession}
            className="btn btn-secondary btn-sm"
            style={{ borderColor: 'rgba(255,255,255,0.1)', fontSize: '0.8rem' }}
          >
            Discard
          </button>
          <button 
            onClick={() => resumeSession(activeStoreId, addToast)}
            className="btn btn-primary btn-sm"
            style={{ background: '#f59e0b', color: 'white', border: 'none', fontWeight: 700, fontSize: '0.8rem' }}
          >
            Resume
          </button>
        </div>
      </div>
    )
  }

  if (!isProcessing && results.length === 0) return null

  const isCompleted = percent === 100 && total > 0

  return (
    <div style={{
      padding: 20,
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      marginBottom: 20,
      display: 'flex',
      flexDirection: 'column',
      gap: 15
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h4 style={{ margin: 0, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            {isCompleted ? '🎉 Reconciliation Completed!' : '⏳ Active Reconciliation Session'}
            {currentTaskId && <span style={{ fontSize: '0.75rem', padding: '2px 8px', background: 'rgba(255,255,255,0.08)', borderRadius: 4, opacity: 0.6 }}>Task: {currentTaskId}</span>}
          </h4>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', opacity: 0.7 }}>
            Session ID: <b>#{sessionId}</b>
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 700, fontFamily: 'monospace' }}>
            {processed} / {total} ({percent}%)
          </span>
          {isCompleted && (
            <button 
              onClick={handleDownloadReport}
              className="btn btn-sm"
              style={{
                background: 'rgba(99, 102, 241, 0.2)',
                color: 'var(--brand)',
                border: '1px solid var(--brand)',
                fontWeight: 700,
                fontSize: '0.8rem',
                padding: '6px 16px',
                borderRadius: 8,
                cursor: 'pointer'
              }}
            >
              📊 Download Final Report
            </button>
          )}
        </div>
      </div>

      <div style={{
        height: 8,
        background: 'rgba(255,255,255,0.05)',
        borderRadius: 4,
        overflow: 'hidden',
        position: 'relative'
      }}>
        <div style={{
          height: '100%',
          width: `${percent}%`,
          background: isCompleted ? '#34d399' : 'var(--brand)',
          transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
          borderRadius: 4
        }} />
      </div>
    </div>
  )
}
