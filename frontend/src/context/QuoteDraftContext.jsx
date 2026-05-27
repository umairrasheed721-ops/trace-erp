import React, { createContext, useState, useContext, useEffect } from 'react';

const QuoteDraftContext = createContext();

export const useQuoteDraft = () => useContext(QuoteDraftContext);

export function QuoteDraftProvider({ children }) {
  // Store shape: { [phoneOrJid]: { quotedMessage: null | { id, text, type, participant_jid }, draftText: '' } }
  const [store, setStore] = useState(() => {
    try {
      const saved = localStorage.getItem('trace_quote_drafts');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  // Persist to localStorage whenever state changes
  useEffect(() => {
    localStorage.setItem('trace_quote_drafts', JSON.stringify(store));
  }, [store]);

  const getDraft = (jid) => {
    return store[jid] || { quotedMessage: null, draftText: '' };
  };

  const setDraftText = (jid, text) => {
    setStore(prev => ({
      ...prev,
      [jid]: {
        ...prev[jid],
        draftText: text
      }
    }));
  };

  const setQuotedMessage = (jid, quotedMessage) => {
    setStore(prev => ({
      ...prev,
      [jid]: {
        ...prev[jid],
        quotedMessage
      }
    }));
  };

  const clearQuote = (jid) => {
    setStore(prev => ({
      ...prev,
      [jid]: {
        ...prev[jid],
        quotedMessage: null
      }
    }));
  };

  const clearDraft = (jid) => {
    setStore(prev => ({
      ...prev,
      [jid]: {
        quotedMessage: null,
        draftText: ''
      }
    }));
  };

  const removeQuotedMessageGlobally = (messageId) => {
    setStore(prev => {
      const copy = { ...prev };
      let changed = false;
      for (const jid in copy) {
        if (copy[jid].quotedMessage?.id === messageId) {
          copy[jid] = { ...copy[jid], quotedMessage: null };
          changed = true;
        }
      }
      return changed ? copy : prev;
    });
  };

  return (
    <QuoteDraftContext.Provider value={{
      getDraft,
      setDraftText,
      setQuotedMessage,
      clearQuote,
      clearDraft,
      removeQuotedMessageGlobally
    }}>
      {children}
    </QuoteDraftContext.Provider>
  );
}
