'use client';

import { useState, useRef, useEffect } from 'react';

/**
 * Composant de note vocale style WhatsApp
 * - Onde sonore interactive (waveform bars)
 * - Bouton Play/Pause
 * - Minuteur dynamique
 * - Sélecteur de vitesse (1x, 1.5x, 2x)
 * - Clic direct sur l'onde pour changer la position de lecture (scrubbing)
 */
export default function AudioMessage({ audioUrl, isAgent = false, duration = null }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration || 0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const audioRef = useRef(null);

  // Génération d'un pattern de barres d'onde réaliste
  const waveformBars = useRef(
    Array.from({ length: 28 }, (_, i) => {
      const sinVal = Math.sin((i / 28) * Math.PI * 3);
      const randomNoise = ((i * 17) % 10) / 10;
      return Math.max(15, Math.min(95, Math.round(25 + Math.abs(sinVal) * 55 + randomNoise * 20)));
    })
  ).current;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && audio.duration !== Infinity) {
        setTotalDuration(audio.duration);
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (audio.duration && !isNaN(audio.duration) && audio.duration !== Infinity) {
        setTotalDuration(audio.duration);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [audioUrl]);

  const togglePlay = () => {
    if (!audioRef.current || !audioUrl) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(err => {
        console.error('Audio play error:', err);
      });
    }
  };

  const handleSeek = (index) => {
    if (!audioRef.current || !totalDuration) return;
    const newTime = (index / waveformBars.length) * totalDuration;
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const cycleSpeed = () => {
    const speeds = [1, 1.5, 2];
    const nextIndex = (speeds.indexOf(playbackRate) + 1) % speeds.length;
    const nextSpeed = speeds[nextIndex];
    setPlaybackRate(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  const formatTime = (secs) => {
    if (!secs || isNaN(secs) || secs === Infinity) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progressFraction = totalDuration > 0 ? currentTime / totalDuration : 0;

  return (
    <div className={`flex items-center gap-3 p-3 rounded-2xl select-none ${
      isAgent 
        ? 'bg-slate-800/90 text-white border border-slate-700/60 shadow-md' 
        : 'bg-emerald-800/90 text-white border border-emerald-700/60 shadow-md'
    }`}>
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      {/* Avatar avec icône micro */}
      <div className="relative shrink-0">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs ${
          isAgent ? 'bg-gradient-to-tr from-blue-600 to-indigo-500' : 'bg-gradient-to-tr from-emerald-500 to-teal-400'
        }`}>
          {isAgent ? (
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          )}
        </div>
        <span className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] ${
          isAgent ? 'bg-indigo-400 text-slate-900' : 'bg-emerald-300 text-slate-900'
        }`}>
          🎙️
        </span>
      </div>

      {/* Bouton Play/Pause */}
      <button
        onClick={togglePlay}
        disabled={!audioUrl}
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 shadow-sm ${
          isAgent 
            ? 'bg-blue-500 hover:bg-blue-400 text-white' 
            : 'bg-emerald-500 hover:bg-emerald-400 text-white'
        }`}
        title={isPlaying ? 'Pause' : 'Écouter'}
      >
        {isPlaying ? (
          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg className="w-4 h-4 fill-current translate-x-0.5" viewBox="0 0 24 24">
            <polygon points="6 4 20 12 6 20 6 4" />
          </svg>
        )}
      </button>

      {/* Forme d'onde WhatsApp interactive */}
      <div className="flex-1 flex flex-col justify-center gap-1.5 min-w-[140px]">
        <div 
          className="flex items-center gap-[2px] h-7 cursor-pointer py-1"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickPos = (e.clientX - rect.left) / rect.width;
            if (audioRef.current && totalDuration) {
              const newTime = clickPos * totalDuration;
              audioRef.current.currentTime = newTime;
              setCurrentTime(newTime);
            }
          }}
        >
          {waveformBars.map((height, i) => {
            const barFraction = i / waveformBars.length;
            const isPlayed = barFraction <= progressFraction;
            return (
              <div
                key={i}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSeek(i);
                }}
                className={`flex-1 rounded-full transition-all duration-75 hover:opacity-100 ${
                  isPlayed 
                    ? (isAgent ? 'bg-cyan-400' : 'bg-emerald-300')
                    : 'bg-white/30'
                }`}
                style={{
                  height: `${height}%`,
                  minHeight: '4px',
                }}
              />
            );
          })}
        </div>

        {/* Temps et vitesse */}
        <div className="flex items-center justify-between text-[11px] text-white/70 px-0.5">
          <span>{isPlaying || currentTime > 0 ? formatTime(currentTime) : formatTime(totalDuration)}</span>
          
          <button
            onClick={cycleSpeed}
            className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px] font-mono transition-colors"
            title="Changer la vitesse"
          >
            {playbackRate}x
          </button>
        </div>
      </div>
    </div>
  );
}
