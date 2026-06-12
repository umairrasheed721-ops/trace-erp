import React, { useState, useRef } from 'react'

const ChatAudioPlayer = ({ src }) => {
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [playbackRate, setPlaybackRate] = useState(1)
  const audioRef = useRef(null)

  const togglePlay = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play().catch(err => console.warn('Audio play failed:', err))
    }
  }

  const togglePlaybackRate = () => {
    if (!audioRef.current) return
    let nextRate = 1
    if (playbackRate === 1) nextRate = 1.5
    else if (playbackRate === 1.5) nextRate = 2
    else nextRate = 1
    audioRef.current.playbackRate = nextRate
    setPlaybackRate(nextRate)
  }

  const handleTimeUpdate = () => {
    if (!audioRef.current) return
    setCurrentTime(audioRef.current.currentTime)
  }

  const handleLoadedMetadata = () => {
    if (!audioRef.current) return
    setDuration(audioRef.current.duration)
  }

  const handleSeek = (e) => {
    if (!audioRef.current) return
    const time = Number(e.target.value)
    audioRef.current.currentTime = time
    setCurrentTime(time)
  }

  const formatTime = (secs) => {
    if (isNaN(secs)) return '0:00'
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  return (
    <div className="wa-custom-audio-player wa-wavesurfer-player" style={{ backgroundColor: 'transparent', border: 'none', boxShadow: 'none', padding: 0 }}>
      <audio
        ref={audioRef}
        src={src}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
      />
      <button type="button" onClick={togglePlay} className="wa-audio-play-btn">
        {isPlaying ? '⏸️' : '▶️'}
      </button>
      <div className="wa-audio-progress-container" style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', height: '30px', margin: '4px 0' }}>
          {[...Array(18)].map((_, idx) => {
            const heightValue = 10 + Math.sin(idx * 0.8) * 12 + Math.cos(idx * 0.4) * 6
            const isActive = (currentTime / (duration || 1)) > (idx / 18)
            return (
              <div 
                key={idx}
                style={{
                  width: '3px',
                  height: `${Math.max(4, heightValue)}px`,
                  backgroundColor: isActive ? 'var(--brand, #a855f7)' : 'rgba(255, 255, 255, 0.25)',
                  borderRadius: '1.5px',
                  transition: 'background-color 0.15s ease'
                }}
              />
            )
          })}
        </div>
        <input
          type="range"
          min={0}
          max={duration || 100}
          value={currentTime}
          onChange={handleSeek}
          className="wa-audio-slider"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '30px',
            margin: 0,
            opacity: 0,
            cursor: 'pointer',
            zIndex: 10
          }}
        />
        <div className="wa-audio-time-info" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <span>{formatTime(currentTime)}</span>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span>{formatTime(duration)}</span>
            <button 
              type="button" 
              onClick={togglePlaybackRate} 
              style={{ 
                backgroundColor: '#064236', 
                borderRadius: '16px', 
                color: '#e9edef', 
                border: 'none', 
                padding: '2px 8px', 
                fontSize: '11px', 
                fontWeight: 'bold', 
                cursor: 'pointer',
                marginLeft: '8px'
              }}
            >
              {playbackRate}x
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ChatAudioPlayer
