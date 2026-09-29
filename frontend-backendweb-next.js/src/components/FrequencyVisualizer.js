'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Visualiseur de signal et fréquences de la parole en temps réel
 * Mesure les fréquences audio du client via la Web Audio API (AnalyserNode)
 * Similaire aux visualisateurs des géants de l'IA (ChatGPT Voice, Gemini Live)
 */
export default function FrequencyVisualizer({ analyserNode, isRecording, duration = 0 }) {
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);
  const [energyLevel, setEnergyLevel] = useState(0);

  useEffect(() => {
    if (!isRecording || !analyserNode || !canvasRef.current) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationFrameRef.current = requestAnimationFrame(draw);

      analyserNode.getByteFrequencyData(dataArray);

      // Calcul de l'énergie moyenne de la voix
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const avg = sum / bufferLength;
      setEnergyLevel(Math.min(100, Math.round((avg / 128) * 100)));

      // Dessin du spectre de fréquence
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const barCount = 32;
      const step = Math.floor(bufferLength / barCount);
      const barWidth = (width / barCount) - 2;

      for (let i = 0; i < barCount; i++) {
        // Obtenir la fréquence pour ce sous-échantillon
        const value = dataArray[i * step] || 0;
        const percent = value / 255;
        const barHeight = Math.max(4, percent * height * 0.9);
        const x = i * (barWidth + 2);
        const y = (height - barHeight) / 2;

        // Dégradé haute technologie cyan -> violet
        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
        gradient.addColorStop(0, '#38bdf8'); // sky-400
        gradient.addColorStop(0.5, '#818cf8'); // indigo-400
        gradient.addColorStop(1, '#c084fc'); // purple-400

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 3);
        ctx.fill();
      }
    };

    draw();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isRecording, analyserNode]);

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="w-full bg-slate-900/95 border border-cyan-500/30 rounded-2xl p-4 shadow-xl backdrop-blur-md flex flex-col gap-3">
      {/* En-tête avec indicateur direct et pulsation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
          </span>
          <span className="text-xs font-semibold text-cyan-300 tracking-wide uppercase">
            Captation & Streaming WebRTC en direct
          </span>
        </div>
        <div className="text-xs font-mono font-bold text-white/90 bg-white/10 px-2 py-0.5 rounded-full">
          {formatTimer(duration)}
        </div>
      </div>

      {/* Canvas du spectre des fréquences vocales */}
      <div className="relative w-full h-14 bg-slate-950/80 rounded-xl overflow-hidden flex items-center justify-center px-2 border border-white/5">
        <canvas
          ref={canvasRef}
          width={280}
          height={56}
          className="w-full h-full"
        />
        {energyLevel === 0 && (
          <div className="absolute text-[11px] text-slate-400 pointer-events-none animate-pulse">
            Parlez maintenant, l'onde détecte votre voix...
          </div>
        )}
      </div>

      {/* Niveau de gain et fréquence vocale */}
      <div className="flex items-center justify-between text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Signal sonore : {energyLevel}%
        </span>
        <span className="text-emerald-400 font-mono text-[10px]">
          ● FLUX LIVEKIT SYNCHRONISÉ
        </span>
      </div>
    </div>
  );
}
