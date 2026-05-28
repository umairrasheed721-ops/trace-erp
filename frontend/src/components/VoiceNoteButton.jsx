import React from 'react';

export default function VoiceNoteButton({ isRecording, handleVoiceNote }) {
  return (
    <button
      className={`wa-portal-send-btn VoiceNoteButton ${isRecording ? 'animate-pulse' : ''}`}
      onClick={handleVoiceNote}
      title={isRecording ? 'Stop recording & send voice note' : 'Record a voice note'}
      type="button"
      style={{
        background: isRecording ? '#ef4444' : 'var(--brand)',
        color: '#ffffff',
        transition: 'all 0.2s ease',
        fontSize: '1.2rem',
        flexShrink: 0
      }}
    >
      {isRecording ? '🔴' : '🎤'}
    </button>
  );
}
