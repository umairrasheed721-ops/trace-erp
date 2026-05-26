import React from 'react';

export default function VoiceNoteButton({ isRecording, handleVoiceNote }) {
  return (
    <button
      className={`wa-portal-action-btn VoiceNoteButton ${isRecording ? 'animate-pulse' : ''}`}
      onClick={handleVoiceNote}
      title={isRecording ? 'Stop recording & send voice note' : 'Record a voice note'}
      style={{
        position: 'relative',
        color: isRecording ? '#ef4444' : undefined,
        transition: 'all 0.2s ease'
      }}
    >
      {isRecording ? (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          animation: 'recordingPulse 1s ease-in-out infinite'
        }}>🔴</span>
      ) : '🎤'}
    </button>
  );
}
