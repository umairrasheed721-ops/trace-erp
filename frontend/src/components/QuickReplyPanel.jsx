import React from 'react';

/**
 * QuickReplyPanel — decoupled Module 8 component.
 * Renders the Quick Reply Templates drawer that slides up above the input bar.
 *
 * Props:
 *  - quickReplies: Array<{ id, title, caption, body }>
 *  - sendingReply: null | string — tracks in-flight action key for debounce UI
 *  - onSend: (reply) => void
 *  - onClose: () => void
 */
export default function QuickReplyPanel({ quickReplies = [], sendingReply, onSend, onClose }) {
  return (
    <div className="quick-replies-drawer" role="dialog" aria-label="Quick Reply Templates">
      <div className="quick-replies-drawer-header">
        <span>⚡ Quick Reply Templates</span>
        <button
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem' }}
          onClick={onClose}
          aria-label="Close quick replies"
        >
          ✕
        </button>
      </div>

      <div className="quick-replies-drawer-list">
        {quickReplies.length === 0 ? (
          <div className="p-4 text-center text-muted italic text-xs" style={{ padding: '1rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            No template replies configured.
          </div>
        ) : (
          quickReplies.map(r => {
            const actionKey = `qr:${r.id}`;
            const isBusy = sendingReply === actionKey;
            return (
              <div
                key={r.id}
                className="quick-replies-drawer-item"
                onClick={() => !isBusy && onSend(r)}
                style={{
                  opacity: isBusy ? 0.5 : 1,
                  cursor: isBusy ? 'not-allowed' : 'pointer',
                  pointerEvents: isBusy ? 'none' : 'auto',
                  transition: 'opacity 0.2s ease',
                }}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && !isBusy && onSend(r)}
                aria-busy={isBusy}
                aria-label={`Send quick reply: ${r.title}`}
              >
                <span className="quick-replies-drawer-item-title">
                  {isBusy ? '⏳ Sending...' : r.title}
                </span>
                <span className="quick-replies-drawer-item-caption">{r.caption}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
