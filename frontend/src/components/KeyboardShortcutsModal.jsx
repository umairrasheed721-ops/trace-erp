import React from 'react'

export default function KeyboardShortcutsModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  const shortcutsList = [
    {
      category: '⚡ Global Hotkeys',
      items: [
        { keys: ['⌘', 'K'], label: 'Global Order & Tracking Search' },
        { keys: ['?'], label: 'Toggle Keyboard Shortcuts Cheatsheet' },
        { keys: ['Esc'], label: 'Close Active Modal / Overlay' },
        { keys: ['Alt', 'S'], label: 'Open Super Admin Store Switcher' },
        { keys: ['Alt', '1..5'], label: 'Directly Switch to Store #1, #2, #3...' },
        { keys: ['Alt', 'B'], label: 'Toggle Navigation Sidebar' },
      ]
    },
    {
      category: '🚀 Quick Navigation (Press G then Key)',
      items: [
        { keys: ['G', 'C'], label: 'Go to Command Center' },
        { keys: ['G', 'P'], label: 'Go to PNL Reports & Analytics' },
        { keys: ['G', 'A'], label: 'Go to Advice Monitor' },
        { keys: ['G', 'S'], label: 'Go to Stuck Monitor' },
        { keys: ['G', 'R'], label: 'Go to Returns Manager' },
        { keys: ['G', 'F'], label: 'Go to Finance Manager' },
        { keys: ['G', 'D'], label: 'Go to Main Dashboard' },
      ]
    },
    {
      category: '🎯 Table & Page Productivity',
      items: [
        { keys: ['Shift', 'R'], label: 'Refresh Page Data' },
        { keys: ['1', '2', '3', '4'], label: 'Switch Page Tabs' },
        { keys: ['J', '↓'], label: 'Select Next Order Row' },
        { keys: ['K', '↑'], label: 'Select Previous Order Row' },
        { keys: ['Dbl Click'], label: 'Instant Copy Cell Text' },
      ]
    }
  ];

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20
      }}
      onClick={onClose}
    >
      <div
        className="modal-content"
        style={{
          background: 'var(--bg-elevated, #1e293b)',
          border: '1px solid var(--border, rgba(255,255,255,0.12))',
          borderRadius: 16,
          width: '100%',
          maxWidth: 620,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          padding: 24,
          color: 'var(--text-primary, #f8fafc)'
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.4rem' }}>⌨️</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>TRACE Keyboard Shortcuts</h3>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted, #94a3b8)' }}>Power user hotkeys for rapid navigation & operations</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn btn-secondary btn-close"
            style={{ borderRadius: '50%', width: 32, height: 32, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxHeight: '65vh', overflowY: 'auto' }}>
          {shortcutsList.map((sec, idx) => (
            <div key={idx}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--brand, #818cf8)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {sec.category}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
                {sec.items.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px',
                      background: 'rgba(255,255,255,0.03)',
                      borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.05)'
                    }}
                  >
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #cbd5e1)' }}>{item.label}</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {item.keys.map((k, kIdx) => (
                        <kbd
                          key={kIdx}
                          style={{
                            padding: '3px 7px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            fontFamily: 'monospace',
                            color: 'var(--text-primary, #fff)',
                            background: 'rgba(255,255,255,0.1)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: 6,
                            boxShadow: '0 2px 0 rgba(0,0,0,0.3)'
                          }}
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          <span>Press <kbd style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 5px', borderRadius: 4 }}>Esc</kbd> anytime to close</span>
          <button className="btn btn-primary btn-sm" onClick={onClose}>Got it!</button>
        </div>
      </div>
    </div>
  )
}
