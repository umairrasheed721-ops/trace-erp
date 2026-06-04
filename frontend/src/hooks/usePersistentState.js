import { useState, useEffect } from 'react';

/**
 * usePersistentState
 *
 * A custom React hook that mimics useState but persists state in sessionStorage.
 *
 * @param {string} key - Unique key for sessionStorage
 * @param {*} initialValue - The fallback initial value if not found in storage
 * @returns {[*, Function]} - State value and setter function
 */
export default function usePersistentState(key, initialValue, options = {}) {
  const [state, setState] = useState(() => {
    try {
      if (options.override) {
        sessionStorage.setItem(key, JSON.stringify(initialValue));
        return initialValue;
      }
      const saved = sessionStorage.getItem(key);
      return saved !== null ? JSON.parse(saved) : initialValue;
    } catch (e) {
      console.warn(`Failed to load persistent state for key "${key}":`, e);
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      if (state === undefined) {
        sessionStorage.removeItem(key);
      } else {
        sessionStorage.setItem(key, JSON.stringify(state));
      }
    } catch (e) {
      console.warn(`Failed to save persistent state for key "${key}":`, e);
    }
  }, [key, state]);

  return [state, setState];
}
