import React, { useEffect, useState } from 'react';

export default function DbBackupCard({ addToast }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showList, setShowList] = useState(false);

  const authHeaders = () => {
    const token = localStorage.getItem('trace_token') || localStorage.getItem('token') || '';
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/settings/db-backup/status', { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.success) setStatus(data);
      }
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleBackupNow = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch('/api/settings/db-backup/create', {
        method: 'POST',
        headers: authHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'Backup failed');
      setStatus(data);
      if (addToast) addToast(`🛡️ Snapshot saved (${data.snapshot?.sizeMB || 0} MB)`, 'success', 2600);
    } catch (err) {
      if (addToast) addToast(`❌ Backup failed: ${err.message}`, 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleDownload = async (filename = null, fresh = false) => {
    if (downloading) return;
    setDownloading(true);
    try {
      const params = new URLSearchParams();
      if (filename) params.set('file', filename);
      else if (fresh) params.set('fresh', '1');
      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(`/api/settings/db-backup/download${qs}`, { headers: authHeaders() });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      const disp = res.headers.get('Content-Disposition') || '';
      const match = disp.match(/filename="([^"]+)"/);
      const outName = match?.[1] || filename || `trace-erp-backup-${new Date().toISOString().slice(0, 10)}.db`;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = outName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      if (addToast) addToast(`⬇️ Downloaded ${outName}`, 'success', 2400);
      fetchStatus();
    } catch (err) {
      if (addToast) addToast(`❌ Download failed: ${err.message}`, 'error');
    } finally {
      setDownloading(false);
    }
  };

  const formatTime = (iso) => {
    if (!iso) return 'Not yet run';
    try {
      return new Date(iso).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' });
    } catch (_) {
      return iso;
    }
  };

  const hasBackup = Boolean(status?.lastBackupAt);

  return (
    <div style={{
      marginBottom: 18,
      padding: '13px 16px',
      borderRadius: 14,
      background: 'var(--bg-surface)',
      border: `1px solid ${hasBackup ? 'rgba(16,185,129,0.32)' : 'rgba(245,158,11,0.38)'}`,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '1.25rem' }}>🛡️</span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 900, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                SQLite Database Backup &amp; Safety Net
              </span>
              <span style={{
                fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: 99,
                background: hasBackup ? 'rgba(16,185,129,0.14)' : 'rgba(245,158,11,0.14)',
                color: hasBackup ? '#059669' : '#b45309',
              }}>
                {loading ? '⏳ Checking...' : hasBackup ? `🟢 Last Backup: ${formatTime(status.lastBackupAt)}` : '🟡 No Local Snapshot Yet'}
              </span>
            </div>
            <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: 2 }}>
              Live DB: <strong>{status?.dbSizeMB ?? '—'} MB</strong>
              {status?.diskFreeMB != null && <> · Volume Free: <strong>{(status.diskFreeMB / 1024).toFixed(1)} GB</strong></>}
              {' · '}Auto-Cron: <strong>{status?.autoSchedule || 'Daily 4:00 AM PKT'}</strong>
              {' · '}Retained: <strong>{status?.backupCount || 0}/{status?.maxRetained || 3}</strong>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          {(status?.backups?.length || 0) > 0 && (
            <button
              type="button"
              onClick={() => setShowList(prev => !prev)}
              style={{
                padding: '6px 11px', borderRadius: 8, cursor: 'pointer',
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                color: 'var(--text-secondary)', fontSize: '0.74rem', fontWeight: 700,
              }}
            >
              {showList ? '▲ Hide Snapshots' : `📂 Snapshots (${status.backups.length})`}
            </button>
          )}
          <button
            type="button"
            disabled={creating}
            onClick={handleBackupNow}
            style={{
              padding: '7px 12px', borderRadius: 8, cursor: creating ? 'wait' : 'pointer',
              background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.35)',
              color: '#6366f1', fontSize: '0.76rem', fontWeight: 800,
            }}
          >
            {creating ? '⏳ Creating Snapshot...' : '⚡ Backup Now'}
          </button>
          <button
            type="button"
            disabled={downloading}
            onClick={() => handleDownload(null, true)}
            style={{
              padding: '7px 13px', borderRadius: 8, border: 'none', cursor: downloading ? 'wait' : 'pointer',
              background: 'linear-gradient(135deg, #059669, #10b981)',
              color: '#fff', fontSize: '0.76rem', fontWeight: 800,
            }}
          >
            {downloading ? '⏳ Downloading...' : '⬇️ Download Fresh .db'}
          </button>
        </div>
      </div>

      {showList && (status?.backups?.length || 0) > 0 && (
        <div style={{
          borderTop: '1px solid var(--border)',
          paddingTop: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
        }}>
          {status.backups.map((b) => (
            <div
              key={b.filename}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                padding: '5px 10px', borderRadius: 8, background: 'var(--bg-elevated)', fontSize: '0.74rem',
              }}
            >
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-primary)' }}>{b.filename}</span>
                <span style={{ color: 'var(--text-muted)' }}>{b.sizeMB} MB · {formatTime(b.createdAt)}</span>
              </div>
              <button
                type="button"
                disabled={downloading}
                onClick={() => handleDownload(b.filename, false)}
                style={{
                  padding: '3px 9px', borderRadius: 6, border: '1px solid rgba(16,185,129,0.35)',
                  background: 'rgba(16,185,129,0.1)', color: '#059669', fontWeight: 700, fontSize: '0.7rem', cursor: 'pointer',
                }}
              >
                ⬇️ Download
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
