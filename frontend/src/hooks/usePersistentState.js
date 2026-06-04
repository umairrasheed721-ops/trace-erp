import { useState, useEffect } from 'react';

export default function usePersistentState(key, defaultValue) {
  const [state, setState] = useState(() => {
    try {
      const cached = sessionStorage.getItem(key);
      return cached !== null ? JSON.parse(cached) : defaultValue;
    } catch (_) {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(state));
    } catch (_) {}
  }, [key, state]);

  return [state, setState];
}
