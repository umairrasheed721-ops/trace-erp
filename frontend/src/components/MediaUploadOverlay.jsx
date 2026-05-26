import React, { useRef, useCallback } from 'react';

/**
 * MediaUploadOverlay — decoupled Module 8 component.
 * Renders the drag-and-drop overlay that appears when the user drags files over the chat window.
 * Also exports the `useMediaDrag` hook for the parent to bind drag events to the chat container.
 *
 * Props:
 *  - isDragging: boolean
 *  - uploading: boolean
 *  - onUpload: (file) => void — called with the first File from a drop or the input change event
 */
export default function MediaUploadOverlay({ isDragging, uploading, onUpload }) {
  const inputRef = useRef(null);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (file) onUpload(file);
    },
    [onUpload]
  );

  if (!isDragging && !uploading) return null;

  return (
    <div
      className={`wa-media-drop-overlay ${isDragging ? 'active' : ''} ${uploading ? 'uploading' : ''}`}
      onDrop={handleDrop}
      onDragOver={e => e.preventDefault()}
      aria-live="assertive"
      aria-label={uploading ? 'Uploading media…' : 'Drop media here to send'}
    >
      {uploading ? (
        <div className="wa-media-drop-content">
          <div className="wa-media-drop-icon" style={{ animation: 'spin 1s linear infinite' }}>⏳</div>
          <div className="wa-media-drop-label">Uploading media…</div>
          <div className="wa-media-drop-sub">Please wait</div>
        </div>
      ) : (
        <div className="wa-media-drop-content">
          <div className="wa-media-drop-icon">📎</div>
          <div className="wa-media-drop-label">Drop to Send</div>
          <div className="wa-media-drop-sub">Image, Audio, or Document</div>
        </div>
      )}

      {/* Hidden file input for programmatic triggering */}
      <input
        ref={inputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={e => { const file = e.target.files?.[0]; if (file) onUpload(file); }}
      />
    </div>
  );
}
