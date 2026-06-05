import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';

export default function useSyncStream() {
  const { token, activeStoreId } = useApp();
  const [status, setStatus] = useState('disconnected'); // 'connected' | 'reconnecting' | 'disconnected'
  const [syncState, setSyncState] = useState(null);

  const retryCount = useRef(0);
  const timerId = useRef(null);
  const eventSourceRef = useRef(null);

  const connect = useCallback(() => {
    if (!token || !activeStoreId) {
      setStatus('disconnected');
      return;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setStatus(retryCount.current > 0 ? 'reconnecting' : 'disconnected');

    const url = `/api/sync/stream?token=${encodeURIComponent(token)}&store_id=${activeStoreId}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => {
      setStatus('connected');
      retryCount.current = 0;
    };

    es.addEventListener('sync_progress', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (String(data.storeId) === String(activeStoreId)) {
          setSyncState(data);
          
          const isComplete = data.status === 'Sync Complete' || data.status === 'Sync Aborted' || data.aborted || (data.processed >= data.total && data.total > 0);
          if (isComplete) {
            setTimeout(() => {
              setSyncState(prev => {
                if (prev && (prev.status === 'Sync Complete' || prev.status === 'Sync Aborted' || prev.aborted || prev.processed >= prev.total)) {
                  return null;
                }
                return prev;
              });
            }, 5000);
          }
        }
      } catch (err) {
        console.error('Error parsing sync progress SSE:', err);
      }
    });

    es.addEventListener('aborted', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (String(data.storeId) === String(activeStoreId)) {
          setSyncState(prev => prev ? { ...prev, aborted: true, status: 'Sync Aborted' } : null);
          setTimeout(() => {
            setSyncState(prev => {
              if (prev && (prev.aborted || prev.status === 'Sync Aborted')) {
                return null;
              }
              return prev;
            });
          }, 5000);
        }
      } catch (err) {
        console.error('Error parsing aborted SSE:', err);
      }
    });

    es.onerror = (err) => {
      console.error('SSE Connection error:', err);
      setStatus('reconnecting');
      es.close();

      const backoff = Math.min(1000 * Math.pow(2, retryCount.current), 30000);
      retryCount.current += 1;

      if (timerId.current) clearTimeout(timerId.current);
      timerId.current = setTimeout(() => {
        connect();
      }, backoff);
    };

  }, [token, activeStoreId]);

  useEffect(() => {
    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (timerId.current) {
        clearTimeout(timerId.current);
      }
    };
  }, [connect]);

  return { status, syncState, setSyncState };
}
